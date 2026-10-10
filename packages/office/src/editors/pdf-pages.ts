/**
 * PDF 的**页面模型**：一页是什么、改了哪些属性、怎么变成字节。
 *
 * ## 为什么从 PdfEditor 里搬出来
 *
 * 这个文件里没有一行 JSX。它是「PDF 的页面结构与几何」，而页面几何是这个
 * 格式里最容易算错、又最难靠肉眼发现的那部分（裁 20pt 到底裁在哪、换纸型
 * 时内容会不会跑偏、导入的页在第二次保存时还在不在）。搬出来才**测得动**
 * ——`pdf-pages.test.ts` 拿 pdf-lib 读回产出的字节逐页断言，再用 pdf.js 读
 * 回文字位置验证几何。
 *
 * ## 一页由四样东西决定（`PdfPageRef`）
 *
 * ```
 * origin   这一页是从哪来的：原件第 N 页 / 空白页 / 别处导入的第 N 页
 * rotation 目标旋转（绝对值，不是增量——见 buildPdfBytes 的说明）
 * crop     裁剪：四边各内缩多少 pt（相对**原件可视区**，不是相对纸边）
 * paper    纸型：目标尺寸。非 null 时内容按 k 缩放（与 resize 配对）
 * ```
 *
 * **为什么用一个 `base` 尺寸而不是「当前尺寸」**：裁剪与纸型都要一个不变的
 * 参照。用「当前尺寸」的话，裁一次之后再换纸型，k 会相对裁剪后的尺寸算，
 * 而裁剪并不改变内容的实际比例——那会得到「裁 20pt 顺带把内容缩小 3%」。
 * 所以 `base` 是**打开文件那一刻**这一页的可视区尺寸，之后不再变。
 *
 * ## 旋转是绝对值、且不改盒子的宽高
 *
 * PDF 的 `/Rotate` 是「显示时把页面转多少度」，它不改变 MediaBox。所以盒子
 * 尺寸（`base`/`crop`/`paper`）**始终是未旋转的那一套**，界面要的显示尺寸由
 * `displaySize()` 现算（90/270 度交换宽高）。上一版在 ref 里存的是交换后的
 * 宽高，于是「旋转两次回到原样」要靠两次交换抵消——那种表示一旦有一处忘了
 * 交换，页面的长宽比就是错的，而画布只会画得不对、不会报错。
 */

import { degrees, PDFDict, PDFDocument, type PDFPage } from 'pdf-lib'

/** 宽高（pt）。**未旋转**的盒子尺寸 */
export interface PdfSize {
  width: number
  height: number
}

/**
 * 裁剪内缩量（pt），四边各自算。
 *
 * 单位是 PDF 用户空间（1/72 英寸），与界面上的 pt 一致——不引入百分比：
 * 百分比在纸型改变时含义会变，而「裁掉 20pt 白边」不会。
 */
export interface PdfCropInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export const ZERO_INSETS: PdfCropInsets = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * 这一页从哪来。
 *
 * `imported` 的 `source` 指向 `PdfBuildInput.imports` 里的键：导入页面的字节
 * **必须跟着改动一起留着**，否则第二次保存时那一页就没了（见 `PdfBuildInput`
 * 的说明）。用字符串键而不是直接塞字节：`layout` 会被比较、被 map，塞字节
 * 会让「页面结构」和「文件内容」搅在一起。
 */
export type PdfPageOrigin =
  | { kind: 'original'; index: number }
  | { kind: 'blank' }
  | { kind: 'imported'; source: string; index: number }

export interface PdfPageRef {
  origin: PdfPageOrigin
  /** 目标旋转（绝对值 0/90/180/270） */
  rotation: number
  /** 原件可视区（打开文件那一刻）的尺寸。裁剪与纸型都相对它算 */
  base: PdfSize
  /** 裁剪内缩。null = 没有裁剪改动 */
  crop: PdfCropInsets | null
  /** 纸型目标。null = 保持原件尺寸（不缩放内容） */
  paper: PdfSize | null
}

/* ── 纸型与裁剪的档位（界面与测试共用同一份） ─────────────────────── */

/**
 * 纸型档位。值就是 pt（1pt = 1/72 英寸），不是「大致差不多」的取整——
 * A4 是 210×297mm 换算来的 595.28×841.89，写成 595×842 会让每一页都差
 * 0.28pt（打印时看得出来）。
 */
export const PAPER_SIZES = {
  a4: { label: 'A4', width: 595.28, height: 841.89 },
  a3: { label: 'A3', width: 841.89, height: 1190.55 },
  a5: { label: 'A5', width: 419.53, height: 595.28 },
  letter: { label: 'Letter', width: 612, height: 792 },
  legal: { label: 'Legal', width: 612, height: 1008 },
} as const

export type PaperKey = keyof typeof PAPER_SIZES

export const PAPER_KEYS = Object.keys(PAPER_SIZES) as PaperKey[]

/**
 * 裁剪档位（四边各裁多少 pt）。
 *
 * 走**固定档位**而不是一个输入框：裁剪是「去掉扫描件的黑边/装订边」，量级
 * 都在 10–72pt，而且每选一次都是**设置**（不是累加），连点两次结果一样——
 * 累加式的裁剪一旦点多了，只能靠「还原」重来。
 */
export const CROP_PRESETS = [10, 20, 36, 72] as const

/** 插入空白页的尺寸：A4 竖版。与「纸型」里的 A4 是同一个数 */
export const BLANK_PAGE_SIZE: PdfSize = { width: 595.28, height: 841.89 }

/* ── 由 PdfPageRef 派生的几何 ──────────────────────────────────── */

/** 裁剪后的盒子尺寸（不含纸型）。裁剪量非法时（> 盒子）退化为 1pt 而不是负数 */
export function visibleSize(ref: PdfPageRef): PdfSize {
  return cropSize(ref.base, ref.crop ?? ZERO_INSETS)
}

function cropSize(base: PdfSize, insets: PdfCropInsets): PdfSize {
  return {
    width: Math.max(1, base.width - insets.left - insets.right),
    height: Math.max(1, base.height - insets.top - insets.bottom),
  }
}

/** 这一页最终写进文件的盒子尺寸（未旋转）：纸型优先，否则是裁剪后的原件尺寸 */
export function targetSize(ref: PdfPageRef): PdfSize {
  return ref.paper ?? visibleSize(ref)
}

/** 界面上的尺寸：90/270 度时宽高交换（PDF 的 /Rotate 是显示旋转，不改盒子） */
export function displaySize(ref: PdfPageRef): PdfSize {
  const size = targetSize(ref)
  return ref.rotation === 90 || ref.rotation === 270
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height }
}

/** PDF 用户空间里的一块矩形。**相对可视区的左下角**（不是相对 MediaBox） */
export interface PdfBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 画布上的尺寸（已经应用 `/Rotate`）。
 *
 * PDF 的用户空间**y 轴向上、原点在左下角**，而画布是 y 向下、原点在左上角。
 * 旋转 90/270 时宽高交换。这两件事合起来就是下面那个投影。
 */
export function screenSize(base: PdfSize, rotation: number): PdfSize {
  const turned = rotation === 90 || rotation === 270
  return turned
    ? { width: base.height, height: base.width }
    : { width: base.width, height: base.height }
}

/**
 * 把用户空间的一块矩形投到画布坐标（左上原点、y 向下、已应用 `/Rotate`）。
 *
 * ## 为什么要有这个函数（而不是在界面里手写「旋转了就把宽高换一下」）
 *
 * 裁剪框要画在画布上，而「这一块在画布上落在哪」对四个旋转角是四套换法。
 * 手写四个 case 里平时只看得见一个（页面通常不旋转），另外三个写错**不报错、
 * 只是框跑偏**。这里用一份映射 + 一条测试（与 pdf.js 的
 * `convertToViewportPoint` 逐个角比对，见 `pdf-pages.test.ts`）。
 *
 * ## 映射规则（实测得来，不是推的）
 *
 * 页面 W×H，点 (x, y) 到画布的换算：
 *
 * | /Rotate | 画布尺寸 | (x, y) → |
 * |---|---|---|
 * | 0 | W×H | (x, H−y) |
 * | 90 | H×W | (y, x) |
 * | 180 | W×H | (W−x, y) |
 * | 270 | H×W | (H−y, W−x) |
 *
 * 取四角的外包矩形即可（下面的实现就是这么做的）。**90 与 270 不是对称的**
 * ——把 90 的公式反过来当 270 用，框会落在镜像的位置上。
 */
export function projectBox(box: PdfBox, base: PdfSize, rotation: number): PdfBox {
  const corners: [number, number][] = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x + box.width, box.y + box.height],
    [box.x, box.y + box.height],
  ]
  const points = corners.map(([x, y]) => {
    const angle = ((Math.round(rotation) % 360) + 360) % 360
    if (angle === 90) return [y, x] as const
    if (angle === 180) return [base.width - x, y] as const
    if (angle === 270) return [base.height - y, base.width - x] as const
    return [x, base.height - y] as const
  })
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return {
    x: left,
    y: top,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
  }
}

/** 当前页的**可视区**（用户空间，相对盒子左下角）。裁剪后它是内缩的那一块 */
export function visibleBox(ref: PdfPageRef): PdfBox {
  const insets = ref.crop ?? ZERO_INSETS
  const visible = visibleSize(ref)
  return { x: insets.left, y: insets.bottom, width: visible.width, height: visible.height }
}

/** 这一页的尺寸还被改过（裁剪或纸型），保存后才会在画布上定型 */
export function hasPendingGeometry(ref: PdfPageRef): boolean {
  return ref.crop !== null || ref.paper !== null
}

/** 这一页能裁掉多少 pt（留 20pt 的底线，不然会裁成一条线） */
export function maxCropInset(base: PdfSize): number {
  return Math.max(0, Math.floor(Math.min(base.width, base.height) / 2) - 20)
}

/**
 * 这一页适合哪种纸型方向。
 *
 * 横向的页面选 A4 就该得到横向 A4——不然「换纸型」会把一张演示稿变成竖版，
 * 内容虽然按 k 缩放没丢，但读起来全错。
 */
export function isLandscape(ref: PdfPageRef): boolean {
  const size = visibleSize(ref)
  return size.width > size.height
}

/** 取某个纸型档位在给定方向下的尺寸 */
export function paperOf(key: PaperKey, landscape: boolean): PdfSize {
  const paper = PAPER_SIZES[key]
  return landscape
    ? { width: paper.height, height: paper.width }
    : { width: paper.width, height: paper.height }
}

/**
 * 这一页换成 `key` 那个档位时，目标是多大。
 *
 * **方向跟着这一页现在的样子走**：横向的页（演示稿、横排表格）选 A4 就该得到
 * 横向 A4。不跟的话「换纸型」会把一张横向的页变成竖版——内容按 k 等比缩放
 * 所以没丢，但整页的读法全错了，而用户看到的是「换了个纸型，怎么全变了」。
 */
export function paperForPage(key: PaperKey, ref: PdfPageRef): PdfSize {
  return paperOf(key, isLandscape(ref))
}

/**
 * 当前纸型对应哪个档位。找不到就返回 null（调用方老实显示「原件尺寸」或
 * 「自定义」，而不是冒充第一项）。
 */
export function paperKeyOf(paper: PdfSize | null): PaperKey | null {
  if (paper === null) return null
  for (const key of PAPER_KEYS) {
    const preset = PAPER_SIZES[key]
    const portrait =
      Math.abs(paper.width - preset.width) < 0.5 && Math.abs(paper.height - preset.height) < 0.5
    const landscape =
      Math.abs(paper.width - preset.height) < 0.5 && Math.abs(paper.height - preset.width) < 0.5
    if (portrait || landscape) return key
  }
  return null
}

/* ── 改一页（返回新的 ref，不改原对象） ─────────────────────────── */

export function withRotation(ref: PdfPageRef, delta: number): PdfPageRef {
  return { ...ref, rotation: (((ref.rotation + delta) % 360) + 360) % 360 }
}

export function withCrop(ref: PdfPageRef, crop: PdfCropInsets | null): PdfPageRef {
  return { ...ref, crop }
}

export function withPaper(ref: PdfPageRef, paper: PdfSize | null): PdfPageRef {
  return { ...ref, paper }
}

/* ── 打开：字节 → 页面模型 ─────────────────────────────────────── */

export interface ParsedPdfPage extends PdfSize {
  rotation: number
}

/**
 * 读出每一页的可视区尺寸与旋转。
 *
 * ## 为什么取 `getCropBox()` 而不是 `getSize()`
 *
 * 被裁过的 PDF 到处都是（扫描仪、出版社的排版稿都会带 CropBox）。用户看到的
 * 是 CropBox 那一块，所以**它才是「这一页多大」的答案**；`getSize()` 给的是
 * MediaBox（整张纸，含出血与裁切线）。取 MediaBox 的症状是：界面上的尺寸比
 * 实际看到的大一圈，而且用户再裁一刀时基准是错的。
 */
export async function readPdfPages(bytes: Uint8Array): Promise<ParsedPdfPage[]> {
  const pdf = await PDFDocument.load(bytes, {
    /**
     * **不因为加密就拒绝打开**：所有者密码保护的 PDF（能打开、禁止修改）
     * 在知识库里很常见。`ignoreEncryption` 让它们可以正常预览——而保存时
     * pdf-lib 会拒绝写出（它不支持写加密文件），那时如实报错即可。
     */
    ignoreEncryption: true,
    // 更新元数据时不要改 ModDate（默认会改成「现在」，那是没改内容却改了文件）
    updateMetadata: false,
  })
  return pdf.getPages().map((page) => {
    const box = page.getCropBox()
    return {
      width: box.width,
      height: box.height,
      rotation: normalizeAngle(page.getRotation().angle),
    }
  })
}

/** 把任意角度收进 [0, 360)。PDF 里 450 与 90 是一回事，界面上要显示 90 */
export function normalizeAngle(angle: number): number {
  return ((Math.round(angle) % 360) + 360) % 360
}

/**
 * 这份页面结构与原件**逐页完全相同**吗。
 *
 * ## 为什么不能只看「有没有改动记录」
 *
 * 文件顶部写着一条承诺：「未编辑时**不保存**——不会『打开就重写』」。而
 * 「点错了、再点回来」是常事：向右旋转 90 度、再向左旋转 90 度，页序又回到
 * 原样。只看「有没有 `patch`」的话，这时保存按钮是亮的、点下去会把整份文件
 * 重写一遍（字节全变、体积变小）——而用户什么都没改。
 *
 * 判据是**结构本身**，不是操作历史：页数、每页的来源与页号、旋转、裁剪、
 * 纸型全都要与原件一致。这正是「保存是整体重建」那条设计的另一面：结果只
 * 取决于目标结构，所以「有没有变」也只该由结构回答。
 */
export function isPristine(
  layout: readonly PdfPageRef[],
  original: readonly ParsedPdfPage[],
): boolean {
  if (layout.length !== original.length) return false
  return layout.every((ref, position) => {
    const base = original[position]
    if (base === undefined) return false
    // 顺序也要对得上：原件第 position 页必须还在 position 上
    if (ref.origin.kind !== 'original' || ref.origin.index !== position) return false
    if (ref.crop !== null || ref.paper !== null) return false
    if (ref.rotation !== base.rotation) return false
    // 尺寸也要一致：打开时读的就是这个，改了它一定是被改过
    return (
      Math.abs(ref.base.width - base.width) < 0.01 && Math.abs(ref.base.height - base.height) < 0.01
    )
  })
}

/**
 * 两份页面结构**逐页相同**吗（含来源、旋转、裁剪、纸型、尺寸）。
 *
 * 与 `isPristine` 的分工：那个比的是「布局 vs 打开时的原件」（用于刚打开
 * 时判断有没有改动），这个比的是「两份布局」（用于保存之后**与磁盘上那份
 * 文件**比——`PdfEdit.file` 的说明写了为什么需要它）。
 *
 * 导入页按**来源键 + 页号**比：同一个来源里同一页，拷贝出来必然一样；不同
 * 来源（另一个文件）即使页号相同也是不同的页，所以键也要比。
 */
export function sameLayout(a: readonly PdfPageRef[], b: readonly PdfPageRef[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every((left, position) => {
    const right = b[position]
    if (right === undefined) return false
    if (left.rotation !== right.rotation) return false
    if (!sameSize(left.base, right.base)) return false
    if (!samePaper(left.paper, right.paper)) return false
    if (!sameInsets(left.crop, right.crop)) return false
    return sameOrigin(left.origin, right.origin)
  })
}

function sameOrigin(a: PdfPageOrigin, b: PdfPageOrigin): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'original' && b.kind === 'original') return a.index === b.index
  if (a.kind === 'imported' && b.kind === 'imported') {
    return a.index === b.index && a.source === b.source
  }
  // 两个都是空白页（上面已经排除了不同 kind）
  return true
}

function sameSize(a: PdfSize | null, b: PdfSize | null): boolean {
  if (a === null || b === null) return a === b
  return Math.abs(a.width - b.width) < 0.01 && Math.abs(a.height - b.height) < 0.01
}

function samePaper(a: PdfSize | null, b: PdfSize | null): boolean {
  return sameSize(a, b)
}

function sameInsets(a: PdfCropInsets | null, b: PdfCropInsets | null): boolean {
  if (a === null || b === null) return a === b
  return (
    Math.abs(a.top - b.top) < 0.01 &&
    Math.abs(a.right - b.right) < 0.01 &&
    Math.abs(a.bottom - b.bottom) < 0.01 &&
    Math.abs(a.left - b.left) < 0.01
  )
}

/* ── 保存：页面模型 → 字节 ─────────────────────────────────────── */

export interface PdfBuildInput {
  /** 原件字节（打开时那一份） */
  bytes: Uint8Array
  layout: readonly PdfPageRef[]
  /**
   * 导入页面的字节，按 `PdfPageOrigin.imported.source` 索引。
   *
   * **它是必须的，不是优化**：保存是「从原件重建」，导入的页在原件里根本
   * 不存在。不留着它们，第一次保存成功、第二次保存就把导入的页静默丢掉
   * ——两次都会报成功。所以 `imports` 与 `layout` 一起构成「这次改动」。
   */
  imports: ReadonlyMap<string, Uint8Array>
}

/** 原件那一份的分组键。导入的键前缀不同，避免与它撞上 */
const ORIGINAL_KEY = '\u0000original'

/**
 * 按新的页面结构重建 PDF 字节。
 *
 * ## 为什么要「拷贝页面到新文档」而不是原地改
 *
 * pdf-lib 的 `removePage` / `setRotation` 也能原地改，但**页序调整没有原地
 * 版本**（它没有 movePage），导入页面更是只能靠 `copyPages`。三条路径混用
 * 会让「哪几页动过」难以追踪。
 *
 * 统一走「新建文档 + 按目标顺序拷贝页面」有一条好处：**结果只取决于目标布局**，
 * 与操作历史无关——同样的页面结构与同样的操作序列必然得到同样的字节。
 * 代价是整份重建（与文件顶部的说明一致：PDF 的保存本来就是整体重写）。
 *
 * ## 拷贝按来源分组
 *
 * 每一份来源（原件、每一份导入的 PDF）只 `load` 一次、只 `copyPages` 一次，
 * 然后把拷出来的页按布局顺序放回去。逐页调用 `copyPages` 也能work，但
 * 500 页的文档会建 500 个 `PDFObjectCopier`——那是纯粹的浪费。
 */
export async function buildPdfBytes({
  bytes,
  layout,
  imports,
}: PdfBuildInput): Promise<Uint8Array> {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  assertSafeToRebuild(source)
  const out = await PDFDocument.create({ updateMetadata: false })
  copyDocumentInfo(source, out)

  // 要拷哪些页，按来源分组（`positions` 与 `indices` 一一对应）
  interface CopyGroup {
    doc: PDFDocument
    positions: number[]
    indices: number[]
  }
  const groups = new Map<string, CopyGroup>()
  for (const [position, ref] of layout.entries()) {
    const origin = ref.origin
    if (origin.kind === 'blank') continue
    const key = origin.kind === 'original' ? ORIGINAL_KEY : origin.source
    let group = groups.get(key)
    if (group === undefined) {
      group = {
        doc: origin.kind === 'original' ? source : await loadImported(key, imports),
        positions: [],
        indices: [],
      }
      groups.set(key, group)
    }
    group.positions.push(position)
    group.indices.push(origin.index)
  }

  // 拷出来的页先按布局位置放好，再按顺序挂进新文档（顺序必须是布局顺序）
  const placed: (PDFPage | undefined)[] = Array.from({ length: layout.length })
  for (const group of groups.values()) {
    const pages = await out.copyPages(group.doc, group.indices)
    for (const [offset, page] of pages.entries()) {
      const position = group.positions[offset]
      if (position !== undefined) placed[position] = page
    }
  }

  for (const [position, ref] of layout.entries()) {
    const existing = placed[position]
    /**
     * 空白页走 `insertPage(position, size)`：位置就是当前页数，所以它等价于
     * 「追加一张指定尺寸的白纸」。用 `insertPage` 而不是 `addPage` 是为了让
     * 「按布局位置补位」这件事写在代码里——`position` 是布局下标，不是增量。
     */
    const page = existing ?? out.insertPage(position, [ref.base.width, ref.base.height])
    applyGeometry(page, ref)
    /**
     * 旋转角度直接**赋值**而不是叠加：pdf-lib 的 `setRotation` 是设置绝对值，
     * 所以这里给的是「目标角度」。原件已有的旋转在 `readPdfPages` 里已经读出来
     * 了，界面上显示的就是最终值。
     */
    page.setRotation(degrees(ref.rotation))
    if (existing !== undefined) out.addPage(existing)
  }

  return out.save()
}

/**
 * copyPages 只搬页对象，不搬 Catalog 中的文档级结构。遇到尚未明确保留的
 * 结构就拒绝写回：丢失表单、书签或签名比提示用户用外部工具编辑更糟。
 * Info 字典也只允许下面显式复制的标准字段，避免静默丢自定义元数据。
 */
function assertSafeToRebuild(source: PDFDocument): void {
  if (source.isEncrypted) {
    throw new Error('这份 PDF 已加密，暂不支持安全保存；请下载原件，用外部工具编辑')
  }

  const extraCatalogKeys = source.catalog
    .entries()
    .map(([key]) => key.toString())
    .filter((key) => key !== '/Type' && key !== '/Pages')
  if (extraCatalogKeys.length > 0) {
    throw new Error(
      `这份 PDF 含有暂不能保留的文档结构（${extraCatalogKeys.join('、')}），未写回原件；请下载后用外部工具编辑`,
    )
  }

  const info = source.context.lookupMaybe(source.context.trailerInfo.Info, PDFDict)
  const supported = new Set([
    '/Title',
    '/Author',
    '/Subject',
    '/Keywords',
    '/Creator',
    '/Producer',
    '/CreationDate',
    '/ModDate',
  ])
  const extraInfoKeys = info
    ?.entries()
    .map(([key]) => key.toString())
    .filter((key) => !supported.has(key))
  if (extraInfoKeys?.length) {
    throw new Error(
      `这份 PDF 含有暂不能保留的元数据（${extraInfoKeys.join('、')}），未写回原件；请下载后用外部工具编辑`,
    )
  }
}

function copyDocumentInfo(source: PDFDocument, out: PDFDocument): void {
  const title = source.getTitle()
  if (title !== undefined) out.setTitle(title)
  const author = source.getAuthor()
  if (author !== undefined) out.setAuthor(author)
  const subject = source.getSubject()
  if (subject !== undefined) out.setSubject(subject)
  const keywords = source.getKeywords()
  if (keywords !== undefined) out.setKeywords([keywords])
  const creator = source.getCreator()
  if (creator !== undefined) out.setCreator(creator)
  const producer = source.getProducer()
  if (producer !== undefined) out.setProducer(producer)
  const created = source.getCreationDate()
  if (created !== undefined) out.setCreationDate(created)
  const modified = source.getModificationDate()
  if (modified !== undefined) out.setModificationDate(modified)
}

async function loadImported(
  key: string,
  imports: ReadonlyMap<string, Uint8Array>,
): Promise<PDFDocument> {
  const bytes = imports.get(key)
  if (bytes === undefined) {
    /**
     * 走到这里说明「这次改动」缺了导入页的字节。**必须抛**：静默跳过等于
     * 保存出一个少了那些页的文件，而界面会说「已保存」。
     */
    throw new Error('导入的页面数据不在了，请重新导入（撤销不了这一步）')
  }
  return PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
}

/**
 * 把裁剪与纸型落到 pdf-lib 的页对象上。
 *
 * ## 顺序是「先裁、再缩、最后设纸型」
 *
 * 1. **裁剪**：`setCropBox` 只改可视区，**页内容一个字节都没动**（内容流前后
 *    完全相同）。这一步纯粹是在说「显示的时候只露出这一块」
 * 2. **纸型**：`scaleContent(k, k)` 缩放内容，`setSize(w, h)` 改纸。**两个必须
 *    配对**——只改纸不缩内容，内容会保持原来的尺寸而纸变了，于是内容跑到纸外
 *    或者只占一角；只缩内容不改纸，纸还是原来的大小。
 *    缩放系数 `k = min(纸宽/可视宽, 纸高/可视高)`：取小的那个，宽高比才不会被
 *    拉伸（另一头留白）。
 * 3. 换纸型之后可视区就是**整张新纸**（0,0,w,h）。不重置的话，裁剪框还停在
 *    旧坐标上，用户会看到新纸上一个错位的小窗口
 *
 * ## 内容锚在可视区的左下角
 *
 * `scaleContent` 是绕**原点**缩放的。而裁剪后的可视区不在原点（比如裁掉左边
 * 20pt，可视区从 x=20 开始），绕原点缩放会让内容相对可视区**平移**——症状是
 * 「裁了一刀又换个纸型，画面的内容跑到边上去了一截」（实测：300pt 宽的页裁掉
 * 左边 50pt 再缩到 200pt，不补平移的话文字整段左移 50pt）。
 *
 * 所以缩放后补一次 `translateContent(visible.x·(1-k), visible.y·(1-k))`：把
 * 内容点 p 映射到 `visible.x + (p - visible.x)·k`，也就是绕可视区左下角缩放。
 * 两次 wrap 的顺序不能反——后一次的矩阵在内容流**外层**，作用在点上更晚。
 */
function applyGeometry(page: PDFPage, ref: PdfPageRef): void {
  const box = page.getCropBox()
  const insets = ref.crop
  const visible =
    insets === null
      ? { x: box.x, y: box.y, width: box.width, height: box.height }
      : {
          x: box.x + insets.left,
          y: box.y + insets.bottom,
          width: box.width - insets.left - insets.right,
          height: box.height - insets.top - insets.bottom,
        }

  if (visible.width <= 0 || visible.height <= 0) {
    /**
     * 裁到没有面积就是坏文件。界面上按 `maxCropInset` 挡过一道，这里再挡一次
     * ——**这类校验不能只在界面上**：产出一个零面积的页会静默地让所有阅读器
     * 打开时报错（而 pdf-lib 自己不会拒绝）。
     */
    throw new Error('裁剪后的页面尺寸不是正数')
  }

  if (ref.paper !== null) {
    const k = Math.min(ref.paper.width / visible.width, ref.paper.height / visible.height)
    page.scaleContent(k, k)
    page.translateContent(visible.x * (1 - k), visible.y * (1 - k))
    page.setSize(ref.paper.width, ref.paper.height)
    const media = page.getMediaBox()
    page.setCropBox(media.x, media.y, ref.paper.width, ref.paper.height)
    return
  }

  if (insets !== null) {
    page.setCropBox(visible.x, visible.y, visible.width, visible.height)
  }
}
