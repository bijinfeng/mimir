import JSZip from 'jszip'
import type {
  Slide,
  SlideElement,
  TextElement,
  PictureElement,
  Stroke,
} from '../vendor/packages/pptx-engine/src/types.js'
import {
  alternateContentBranches,
  patchElementFill,
  patchElementPPr,
  patchElementStroke,
  patchElementXfrm,
  patchPictureSrcRect,
  patchTextElementXml,
  rebuildTxBody,
  type FillPatch,
  type StrokePatch,
} from '../vendor/packages/pptx-engine/src/generate.js'
import { ensureCreationId } from '../vendor/packages/pptx-engine/src/identity.js'
import type { PptxArchive } from './pptx-archive.js'

/**
 * pptx 的**保存**：把内存里被改过的元素补丁回字节。
 *
 * ## 这是什么，从哪里来
 *
 * 上游的保存逻辑在 `packages/pptx-engine/src/index.ts` 里（`buildZip` /
 * `patchSlideXml` / `patchedElementXml` / `patchAnchorXml` / `slideIsDirty` /
 * `modelStrokeToPatch`）。那个文件**不能 vendored**——它 import `zip.ts`
 * （`node:crypto`）与 `media-insert.ts`（`node:zlib`）等一大批模块。
 *
 * 但 `index.ts` 里那段保存逻辑本身是**纯的**：它只用已经 vendored 的
 * `generate.ts`（全部 patch 原语）与 `identity.ts`（`ensureCreationId`），
 * 不需要 archive 的读写（上游签名里的 `archive` 只在末尾 `commitSaved` 用，
 * 那是「保存后同步内存状态」的优化，不是保存本身）。
 *
 * 所以这里把那六个函数**逐条照搬**过来，改动只有两处：
 *
 *   1. 上游用 `node:crypto` 的 `createHash`——我们不用（见 archive 的说明）
 *   2. 上游 `buildZip` 只被 `savePptx` / `savePptxToFile` 调用；这里的
 *      `buildZipBytes` 直接产出字节（浏览器里没有「写到文件」这一步）
 *
 * ## 补丁式保存是安全的前提
 *
 * 关键性质：**没有 `dirty` 标记的元素走 `anchor.originalXml` 原样回填**，
 * 整个幻灯片只有 `bodyPrefix` + 各元素 + `bodySuffix` 拼起来时**改动的那个
 * 元素**是新生成的 XML。所以「改一行字」不会重排整篇文档的 XML——pptx 的
 * 切片里同样有大量我们没建模的东西（动画时间线、SmartArt、自定义扩展、
 * OLE），整体重建会静默丢掉它们。
 *
 * 实测见 `src/pptx-save.test.ts`：未改动的幻灯片条目字节完全相同。
 */

/** 只有 XML 文本值得 deflate。其余（媒体、字体、OLE）本身已压缩或是不透明二进制，压它只是烧 CPU */
const COMPRESSED_EXTENSIONS = new Set(['xml', 'rels'])

/** 这个幻灯片有未写回的改动吗 */
export function slideIsDirty(slide: Slide): boolean {
  return (
    !!slide.structureDirty ||
    slide.elements.some(
      (e) =>
        e.dirty || e.dirtyTransform || e.dirtyFill || e.dirtyStroke || e.dirtySrcRect || e.dirtyPPr,
    )
  )
}

/**
 * 重建一张幻灯片的 XML：改过的元素重新生成，其余按 `anchor.originalXml` 原样回填。
 * 没有改动时结果 **=== originalXml**（逐字节）。
 */
export function patchSlideXml(slide: Slide): string {
  const parts: string[] = [slide.bodyPrefix]
  for (const el of slide.elements) {
    parts.push(patchedElementXml(el))
    if (el.anchor.gapAfter) parts.push(el.anchor.gapAfter)
  }
  parts.push(slide.bodySuffix)
  return parts.join('')
}

/**
 * 一个元素当前的 XML 片段（改过的重新生成，没改的用原始字节）。
 *
 * **注意 `ensureCreationId` 的调用条件**：只对「字节反正要重写」的元素铸
 * GUID。没动过的元素原样透传，所以未编辑的演示文稿保存后逐字节不变
 * （这是有测试守的性质，不是巧合）。
 */
export function patchedElementXml(el: SlideElement): string {
  if (
    el.dirty ||
    el.dirtyTransform ||
    el.dirtyFill ||
    el.dirtyStroke ||
    el.dirtySrcRect ||
    el.dirtyPPr
  ) {
    ensureCreationId(el)
  }

  let xml = el.anchor.originalXml
  if (el.dirty && (el.type === 'text' || el.type === 'shape')) {
    xml = patchAnchorXml(el, xml, (x) => patchTextElementXml(el as TextElement, x))
  }
  /**
   * 段落属性的外科式补丁（run 的字节不动）；段落数对不上（罕见）时退回整体重建。
   */
  if (el.dirtyPPr && (el.type === 'text' || el.type === 'shape') && (el as TextElement).text) {
    const t = el as TextElement
    const dirty = el.dirtyPPr
    xml = patchAnchorXml(el, xml, (x) => patchElementPPr(t, x, dirty) ?? rebuildTxBody(t, x))
  }
  // graphicFrame（表格/图表/passthrough）用 p:xfrm，其余用 a:xfrm
  if (el.dirtyTransform) {
    xml = patchAnchorXml(el, xml, (x) => patchElementXfrm(el, x), true)
  }
  if (el.dirtyFill && (el.type === 'text' || el.type === 'shape')) {
    const fill = (el as TextElement).fill
    const patch: FillPatch | null =
      fill?.type === 'solid'
        ? fill.color
        : fill?.type === 'none'
          ? 'none'
          : fill?.type === 'gradient'
            ? {
                stops: fill.stops,
                ...(fill.angle != null ? { angle: fill.angle } : {}),
                ...(fill.path ? { path: fill.path } : {}),
                ...(fill.path && fill.fillTo ? { fillTo: fill.fillTo } : {}),
              }
            : null
    if (patch !== null) xml = patchAnchorXml(el, xml, (x) => patchElementFill(x, patch), true)
  }
  if (el.dirtyStroke && (el.type === 'text' || el.type === 'shape' || el.type === 'picture')) {
    const stroke = (el as TextElement).stroke
    const patch = stroke ? modelStrokeToPatch(stroke) : null
    xml = patchAnchorXml(el, xml, (x) => patchElementStroke(x, patch), true)
  }
  if (el.dirtySrcRect && el.type === 'picture') {
    const pic = el as PictureElement
    xml = patchAnchorXml(el, xml, (x) => patchPictureSrcRect(x, pic.srcRect ?? null), true)
  }
  return xml
}

/**
 * 把字节补丁应用到元素自己的 XML 上。
 *
 * 锚在整块 `<mc:AlternateContent>` 上的元素是从其中一个分支建模出来的，
 * 所以补丁只落在那个分支里；spPr 级的补丁（`mirror`）也写到同标签的兄弟
 * 分支，这样 PowerPoint（它渲染 Choice）看到的框/填充/描边与我们的渲染器
 * 一致。文字补丁**从不 mirror**：Choice 的 body 可能是公式或另一套词汇。
 */
function patchAnchorXml(
  el: SlideElement,
  xml: string,
  patch: (xml: string) => string,
  mirror = false,
): string {
  const branches = alternateContentBranches(xml)
  if (!branches) return patch(xml)
  const fromFallback = el.type === 'text' || el.type === 'shape' || el.type === 'picture'
  const own =
    (fromFallback
      ? branches.find((b) => b.fallback)
      : branches.find((b) => !b.fallback && b.tag === 'p:graphicFrame')) ?? branches[0]!
  let out = ''
  let cursor = 0
  for (const b of branches) {
    if (b !== own && !(mirror && b.tag === own.tag)) continue
    out += xml.slice(cursor, b.start) + patch(xml.slice(b.start, b.end))
    cursor = b.end
  }
  return out + xml.slice(cursor)
}

/** `Stroke` 模型 → 补丁（上游 `index.ts` 的同名函数，逐条照搬） */
function modelStrokeToPatch(stroke: Stroke): StrokePatch | null {
  const capMap = { flat: 'flat', round: 'rnd', square: 'sq' } as const
  const base = {
    widthEmu: stroke.width,
    // 'solid' 会主动清掉原始字节里残留的 prstDash
    dash: stroke.dash ?? 'solid',
    ...(stroke.cap ? { cap: capMap[stroke.cap] } : {}),
    ...(stroke.join ? { join: stroke.join } : {}),
    ...(stroke.compound ? { compound: stroke.compound } : {}),
  }
  if (stroke.fill.type === 'solid') return { color: stroke.fill.color, ...base }
  if (stroke.fill.type === 'gradient') {
    return {
      color: stroke.fill.stops[0]?.color ?? '#000000',
      ...base,
      gradient: { stops: stroke.fill.stops, angle: stroke.fill.angle ?? 0 },
    }
  }
  return null
}

/**
 * 把建好的包**序列化成字节**。
 *
 * 两件事与上游一致：
 *
 *   1. **未改动的条目原样写回**（`entries` 里存的原始字节直接塞进 zip），
 *      所以只有被编辑的那张 slideN.xml 是新生成的
 *   2. **只对 xml/rels 开 deflate**。媒体、字体、OLE 本身已压缩或是不透明
 *      二进制，deflate 它们在大演示文稿上要烧几秒 CPU 而体积几乎不变
 */
export async function buildPptxBytes(
  archive: PptxArchive,
  slides: readonly Slide[],
  entryPatch: ReadonlyMap<string, Uint8Array | null> = new Map(),
): Promise<Uint8Array> {
  const dirtyByPath = new Map<string, Slide>()
  for (const slide of slides) {
    if (slideIsDirty(slide)) dirtyByPath.set(slide.path, slide)
  }

  const zip = new JSZip()
  const entries = new Map(archive.entries)
  for (const [path, data] of entryPatch) {
    if (data === null) entries.delete(path)
    else entries.set(path, data)
  }
  for (const [path, data] of entries) {
    const dirty = dirtyByPath.get(path)
    /**
     * `createFolders: false` 是**保真要求**，不是优化。
     *
     * JSZip 默认会为每个条目的父目录补一个目录条目（`ppt/slides/` 这种）。
     * 而 PowerPoint 与 python-pptx 写的包里**通常没有**这些条目——于是
     * 默认行为会让「一个只改了一行字的保存」在包里凭空多出十几个目录条目。
     *
     * 实测症状：改文字后除 slide1.xml 之外还多出 13 个 `.../ ` 条目，
     * 而逐字节对比测试会看到 `added: ["_rels/", "docProps/", …]`。
     * PowerPoint 能打开（目录条目是可选的），但那是「我们的保存不该带来的
     * 结构变化」——补丁式保存的承诺就是「只动该动的」。
     */
    if (dirty) {
      zip.file(path, patchSlideXml(dirty), { createFolders: false })
      continue
    }
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
    zip.file(path, data, {
      createFolders: false,
      ...(COMPRESSED_EXTENSIONS.has(ext) ? {} : { compression: 'STORE' as const }),
    })
  }

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}

/**
 * 保存成功之后，把内存模型与刚写出的字节对齐（上游 `commitSaved` 的等价物）。
 *
 * ## 为什么需要它
 *
 * 保存后 `slide.originalXml` 还是**上一次**保存时的字节。再编辑一次时，
 * `patchedElementXml` 会拿旧锚点去拼——没改的元素回填的是旧字节，
 * 于是**第一次保存的改动会被回滚**：用户改两句、保存两次，只留下最后一句。
 * 这个失效是静默的（保存本身成功、字节也写对了）。
 *
 * 所以每次保存后：把补丁后的 XML 烧回锚点、清掉 dirty 标记。
 */
export function commitSaved(slides: readonly Slide[]): void {
  for (const slide of slides) {
    if (!slideIsDirty(slide)) continue
    for (const el of slide.elements) {
      el.anchor.originalXml = patchedElementXml(el)
      delete el.dirty
      delete el.dirtyTransform
      delete el.dirtyFill
      delete el.dirtyStroke
      delete el.dirtySrcRect
      delete el.dirtyPPr
    }
    slide.originalXml = patchSlideXml(slide)
    delete slide.structureDirty
  }
}
