import { XMLParser } from 'fast-xml-parser'
import {
  readPptxMetadata,
  readPptxLink,
  type PptxMetadata,
  type PptxLink,
} from './pptx-metadata.js'
import type { SlideSize } from '../vendor/packages/pptx-engine/src/types.js'
import type { Slide } from '../vendor/packages/pptx-engine/src/types.js'
import {
  parseSlide,
  parseDecorations,
  type ParseContext,
} from '../vendor/packages/pptx-engine/src/parse.js'
import {
  parsePlaceholderMap,
  parseMasterTextStyles,
  parseDefaultTextStyle,
} from '../vendor/packages/pptx-engine/src/placeholder.js'
import { parseTheme, parseClrMap } from '../vendor/packages/pptx-engine/src/theme.js'
import { PptxArchive, relsPathFor, resolveTarget } from './pptx-archive.js'
import {
  buildPptxBytes,
  commitSaved,
  patchSlideXml,
  patchedElementXml,
  slideIsDirty,
} from './pptx-save.js'
import { preparePptxTextRangeEdit } from './pptx-text-range.js'
import {
  allocatePptxPage,
  assertNoIncomingSlideReferences,
  assertPageCanDetach,
  assertPresentationStructureSafe,
  BLANK_SLIDE_XML,
  blankSlideRels,
  buildPptxStructurePatch,
  pageSequenceChanged,
  readPptxPages,
  type EntryPatch,
} from './pptx-structure.js'
import type { PptxRenderable } from './pptx-render.js'
import { applyEditParagraphs } from '../vendor/packages/pptx-ops/src/edit-text.js'
import type { EditParagraph } from '../vendor/packages/pptx-ops/src/types.js'
import type {
  Paragraph,
  SlideElement,
  TextElement,
} from '../vendor/packages/pptx-engine/src/types.js'

/**
 * pptx 的**打开**：压缩包 → 幻灯片模型（`packages/office/src/pptx-archive.ts`
 * 负责读，这里负责装配）。
 *
 * ## 这一层在做什么
 *
 * 一张幻灯片的最终外观**不在它自己的 XML 里**。占位符的位置来自版式、
 * 版式没有的来自母版、颜色来自主题（而深色母版还会重映射配色名）、文字
 * 默认值来自 `presentation.xml` 的 `defaultTextStyle`。上游把这些上溯
 * 合成一个 `ParseContext` 再交给 `parseSlide`——**元素拿到的就是最终值**，
 * 渲染层不必再走一遍继承链（`types.ts` 的设计原则 3）。
 *
 * 这段装配在上游是 `index.ts` 里的 `parseSlideFromArchive` 与 `buildDecorations`，
 * 与保存路径同处一个文件。它们本身不含 Node API，但那个文件引了
 * `node:crypto`——所以这里**逐条照搬那两段**（行为一致，改动只在读法上：
 * 上游同步读，这里同步读，因为 `PptxArchive` 预加载了全部条目）。
 * 上游改这两段时这里要跟着改，`UPSTREAM.json` 记了 commit。
 *
 * ## 编辑入口在 `openPptxForEdit`
 *
 * 只读预览（`openPptx`）不需要 `archive`，所以它不返回。编辑要——保存时
 * 未改动的条目要从 `archive.entries` 原样写回。两个入口共用同一套解析，
 * 编辑那侧多带一个 `archive` 与三个动作（改文字 / 保存 / 重新渲染）。
 */

/** 打开后的演示文稿 */
export interface PptxDeck {
  links(slideIndex: number): ReadonlyMap<string, PptxLink>
  /** 画布尺寸（EMU）——渲染时按它算宽高比 */
  readonly size: SlideSize
  /** 幻灯片。**是函数**——编辑会话保存后模型会变，与编辑入口保持同一形状
   *  （渲染层只认 `PptxRenderable`，见 `pptx-render.ts`） */
  slides(): readonly Slide[]
  /** 内容指纹（**不是** sha256，见 `pptx-archive.ts` 文件头） */
  readonly fingerprint: string
  /**
   * 图片：zip 路径 → data URL。渲染层的 `MediaResolver` 是**同步**的，
   * 所以这里预先全部读出来（理由见 `PptxArchive.readMediaDataUrls`）。
   */
  readonly media: ReadonlyMap<string, string>
}

export async function openPptx(bytes: Uint8Array): Promise<PptxDeck> {
  const archive = await PptxArchive.open(bytes)
  const { size, slidePaths } = archive.readPresentation()

  const slides: Slide[] = []
  for (const path of slidePaths) {
    const slide = parseSlideFromArchive(archive, path)
    if (slide) slides.push(slide)
  }

  /**
   * 一张幻灯片都没有 = 这不是一份能看的 pptx。抛出可读的错误，
   * 而不是给界面一张空白画布（「看起来正常」比报错更难发现）。
   */
  if (slides.length === 0) {
    throw new Error('这份演示文稿里没有幻灯片（文件可能已损坏）')
  }

  return {
    size,
    slides: () => slides,
    fingerprint: archive.fingerprint,
    links: (index) =>
      new Map(
        (slides[index]?.elements ?? []).flatMap((element) => {
          const link = readPptxLink(archive, slides, index, element)
          return link ? [[element.id, link] as const] : []
        }),
      ),
    media: archive.readMediaDataUrls(),
  }
}

/** 一张幻灯片：读它自己 + 上溯版式/母版/主题，装配成 `ParseContext` 后解析 */
function parseSlideFromArchive(archive: PptxArchive, slidePath: string): Slide | null {
  const slideXml = archive.readText(slidePath)
  if (slideXml == null) return null

  const chain = archive.resolveSlideChain(slidePath)
  const ctx: ParseContext = {}

  const layoutXml = (chain.layoutPath ? archive.readText(chain.layoutPath) : undefined) ?? undefined
  const masterXml = (chain.masterPath ? archive.readText(chain.masterPath) : undefined) ?? undefined

  /**
   * 主题。**`clrMap` 必须在解析下面任何内容之前就位**：深色母版会把配色名
   * 换掉（`bg1` ↔ `dk1`），晚一步所有 `schemeClr` 都会解析成相反的明暗。
   */
  if (chain.themePath) {
    const themeXml = archive.readText(chain.themePath)
    if (themeXml) {
      ctx.theme = parseTheme(themeXml)
      ctx.theme.clrMap = parseClrMap(masterXml, layoutXml, slideXml)
      ctx.themeMediaRels = partMediaRels(archive, chain.themePath)
    }
  }

  // 占位符几何 → 版式优先、母版兜底；文字样式与背景同理
  if (layoutXml) {
    if (chain.layoutPath) ctx.layoutMediaRels = partMediaRels(archive, chain.layoutPath)
    ctx.layoutPlaceholders = parsePlaceholderMap(layoutXml, ctx.theme, ctx.layoutMediaRels)
    ctx.layoutBg = layoutXml
  }
  if (masterXml) {
    if (chain.masterPath) ctx.masterMediaRels = partMediaRels(archive, chain.masterPath)
    ctx.masterPlaceholders = parsePlaceholderMap(masterXml, ctx.theme, ctx.masterMediaRels)
    ctx.masterTextStyles = parseMasterTextStyles(masterXml, ctx.theme, ctx.masterMediaRels)
    ctx.masterBg = masterXml
  }

  // presentation.xml 的 <p:defaultTextStyle>：非占位符形状的文字基线默认值
  const presXml = archive.readText('ppt/presentation.xml')
  if (presXml) ctx.defaultTextStyle = parseDefaultTextStyle(presXml, ctx.theme)

  // 幻灯片自己的 rels：媒体、图表、SmartArt 预览、超链接…
  const rels = archive.readRels(slidePath)
  const mediaRels = new Map<string, string>()
  const chartXmls = new Map<string, string>()
  const chartMediaRels = new Map<string, Map<string, string>>()
  const chartUserShapes = new Map<string, string>()
  const chartStyleRels = new Set<string>()
  const chartThemeOverrides = new Map<string, string>()
  const avRels = new Map<string, { target: string; external?: boolean }>()
  const diagramDrawings = new Map<string, string>()
  const diagramDatas = new Map<string, string>()
  const diagramMediaRels = new Map<string, Map<string, string>>()
  const diagramLayouts = new Map<string, string>()
  const diagramColors = new Map<string, string>()
  const vmlPreviews = new Map<string, string>()
  const hlinkRels = new Map<string, string>()
  let slideOrder: string[] | undefined

  for (const rel of rels.values()) {
    if (rel.type.endsWith('/hyperlink')) {
      hlinkRels.set(rel.id, rel.target)
    } else if (rel.type.endsWith('/slide')) {
      // 跳转到某张幻灯片：把目标部件解析成它在演示文稿里的序号
      slideOrder ??= archive.readPresentation().slidePaths
      const idx = slideOrder.indexOf(resolveTarget(slidePath, rel.target))
      if (idx >= 0) hlinkRels.set(rel.id, `slide:${idx}`)
    } else if (rel.type.endsWith('/image')) {
      mediaRels.set(rel.id, resolveTarget(slidePath, rel.target))
    } else if (rel.type.endsWith('/chart') || rel.type.endsWith('/chartEx')) {
      const target = resolveTarget(slidePath, rel.target)
      const xml = archive.readText(target)
      if (xml) {
        chartXmls.set(rel.id, xml)
        chartMediaRels.set(rel.id, partMediaRels(archive, target))
        // 手绘叠加层在图表自己的 rels 指向的 chartUserShapes 里
        for (const sub of archive.readRels(target).values()) {
          if (sub.type.endsWith('/chartUserShapes')) {
            const usXml = archive.readText(resolveTarget(target, sub.target))
            if (usXml) chartUserShapes.set(rel.id, usXml)
          }
          if (sub.type.endsWith('/chartStyle')) chartStyleRels.add(rel.id)
          // 图表局部主题（配色按图表重映射）：schemeClr 必须对着它解析
          if (sub.type.endsWith('/themeOverride')) {
            const ovXml = archive.readText(resolveTarget(target, sub.target))
            if (ovXml) chartThemeOverrides.set(rel.id, ovXml)
          }
        }
      }
    } else if (/\/(?:video|audio|media)$/.test(rel.type)) {
      const external = rel.targetMode === 'External'
      avRels.set(rel.id, {
        target: external ? rel.target : resolveTarget(slidePath, rel.target),
        ...(external ? { external: true } : {}),
      })
    } else if (rel.type.endsWith('/vmlDrawing')) {
      /**
       * 老式 OLE 预览：`v:shape`（按 oleObj 的 spid 匹配）→ `v:imagedata` →
       * 那个 VML 部件自己的图片关系。找不到就画占位块，不猜。
       */
      const vmlPath = resolveTarget(slidePath, rel.target)
      const vml = archive.readText(vmlPath)
      if (vml) {
        const vmlRels = archive.readRels(vmlPath)
        for (const m of vml.matchAll(/<v:shape\b([^>]*)>([\s\S]*?)<\/v:shape>/g)) {
          const relid = /<v:imagedata\b[^>]*\bo:relid="([^"]+)"/.exec(m[2] ?? '')?.[1]
          const imgRel = relid ? vmlRels.get(relid) : undefined
          if (!imgRel) continue
          const target = resolveTarget(vmlPath, imgRel.target)
          for (const key of ['id', 'o:spid']) {
            const v = new RegExp(`\\b${key}="([^"]+)"`).exec(m[1] ?? '')?.[1]
            if (v) vmlPreviews.set(v, target)
          }
        }
      }
    } else if (rel.type.endsWith('/diagramData')) {
      /**
       * SmartArt 的**预渲染**图形部件：数据部件的 `<dsp:dataModelExt relId>`
       * 指向容器部件（幻灯片）rels 里的 diagramDrawing；取不到就退到数据
       * 部件自己的 rels。有了它 SmartArt 能画成静态图，而不是一个占位块。
       */
      const dataPath = resolveTarget(slidePath, rel.target)
      const dataXml = archive.readText(dataPath)
      if (dataXml) diagramDatas.set(rel.id, dataXml)
      const relId = dataXml
        ? /<dsp:dataModelExt\b[^>]*\brelId="([^"]+)"/.exec(dataXml)?.[1]
        : undefined
      if (relId) {
        const drawRel = rels.get(relId) ?? archive.readRels(dataPath).get(relId)
        const basePath = rels.get(relId) ? slidePath : dataPath
        const drawingPath = drawRel ? resolveTarget(basePath, drawRel.target) : undefined
        const drawingXml = drawingPath ? archive.readText(drawingPath) : undefined
        if (drawingXml && drawingPath) {
          diagramDrawings.set(rel.id, drawingXml)
          diagramMediaRels.set(rel.id, partMediaRels(archive, drawingPath))
        }
      }
    } else if (rel.type.endsWith('/diagramLayout')) {
      const xml = archive.readText(resolveTarget(slidePath, rel.target))
      if (xml) diagramLayouts.set(rel.id, xml)
    } else if (rel.type.endsWith('/diagramColors')) {
      const xml = archive.readText(resolveTarget(slidePath, rel.target))
      if (xml) diagramColors.set(rel.id, xml)
    }
  }

  ctx.mediaRels = mediaRels
  ctx.chartXmls = chartXmls
  if (chartMediaRels.size) ctx.chartMediaRels = chartMediaRels
  if (chartUserShapes.size) ctx.chartUserShapes = chartUserShapes
  if (chartStyleRels.size) ctx.chartStyleRels = chartStyleRels
  ctx.chartThemeOverrides = chartThemeOverrides
  if (hlinkRels.size) ctx.hlinkRels = hlinkRels
  if (avRels.size) ctx.avRels = avRels
  if (diagramDrawings.size) ctx.diagramDrawings = diagramDrawings
  if (diagramDatas.size) ctx.diagramDatas = diagramDatas
  if (diagramMediaRels.size) ctx.diagramMediaRels = diagramMediaRels
  if (diagramLayouts.size) ctx.diagramLayouts = diagramLayouts
  if (diagramColors.size) ctx.diagramColors = diagramColors
  if (vmlPreviews.size) ctx.vmlPreviews = vmlPreviews
  // 表格样式的自定义定义（内置样式由 table-style 兜底）
  ctx.tableStyles = archive.readText('ppt/tableStyles.xml') ?? undefined

  const slide = parseSlide({
    path: slidePath,
    slideXml,
    layoutPath: chain.layoutPath,
    masterPath: chain.masterPath,
    ctx,
  })

  // 母版/版式的装饰层（logo、色带、以及启用的页脚/页码/日期），只读渲染
  const decorations = buildDecorations(archive, slidePath, slideXml, slide, layoutXml, masterXml, {
    layoutPath: chain.layoutPath,
    masterPath: chain.masterPath,
    theme: ctx.theme,
    masterPlaceholders: ctx.masterPlaceholders,
    masterTextStyles: ctx.masterTextStyles,
    defaultTextStyle: ctx.defaultTextStyle,
  })
  if (decorations.length) slide.decorations = decorations

  return slide
}

/** 一个部件（版式/母版）自己的图片关系（装饰层里的图片要用） */
function partMediaRels(archive: PptxArchive, partPath: string): Map<string, string> {
  const media = new Map<string, string>()
  for (const rel of archive.readRels(partPath).values()) {
    if (rel.type.endsWith('/image')) media.set(rel.id, resolveTarget(partPath, rel.target))
  }
  return media
}

/**
 * `<p:hf>` 页脚族的开关状态。
 *
 * PowerPoint 的真实行为：打开页脚会把 `ftr`/`sldNum`/`dt` 占位符写进**每一张**
 * 幻灯片（作为普通元素渲染），母版/版式上的同类占位符只是模板。所以装饰层
 * 默认**不画**它们（`unset`），只在 `p:hf` 明确打开时才画。
 */
/** 某个 XML（版式/母版）里声明了 `type="ftr"` 这类页脚族占位符吗 */
function hasPh(xml: string | undefined, type: string): boolean {
  return !!xml && new RegExp(`<p:ph\\b[^>]*type="${type}"`).test(xml)
}

function hfState(xml: string | undefined, attr: 'ftr' | 'sldNum' | 'dt'): 'on' | 'off' | 'unset' {
  if (!xml) return 'unset'
  const hf = /<p:hf\b[^>]*\/?>/.exec(xml)?.[0]
  if (!hf) return 'unset'
  if (new RegExp(`\\b${attr}="(?:1|true)"`).test(hf)) return 'on'
  if (new RegExp(`\\b${attr}="(?:0|false)"`).test(hf)) return 'off'
  return 'unset'
}

/**
 * 装饰层：母版的具体形状（最底）→ 版式的具体形状。
 *
 *   - 幻灯片/版式上的 `showMasterSp="0"` 关掉母版层
 *   - 页脚族占位符跟随 `<p:hf>` 开关 + 最近的一层覆盖
 *     （幻灯片上有就跳过版式的，版式上有就跳过母版的）
 *   - 页码字段换成这张片子的实际序号
 */
function buildDecorations(
  archive: PptxArchive,
  slidePath: string,
  slideXml: string,
  slide: Slide,
  layoutXml: string | undefined,
  masterXml: string | undefined,
  parts: {
    layoutPath?: string
    masterPath?: string
    theme?: ParseContext['theme']
    masterPlaceholders?: ReturnType<typeof parsePlaceholderMap>
    masterTextStyles?: ReturnType<typeof parseMasterTextStyles>
    defaultTextStyle?: ReturnType<typeof parseDefaultTextStyle>
  },
): Slide['elements'] {
  const out: Slide['elements'] = []

  let slideNum: number | undefined
  try {
    const idx = archive.readPresentation().slidePaths.indexOf(slidePath)
    if (idx >= 0) slideNum = idx + 1
  } catch {
    /* 页码替换不了可以接受：不画页码比画错页码好 */
  }

  const HF_ALL = ['ftr', 'sldNum', 'dt'] as const
  const enabled = new Set(
    HF_ALL.filter((k) => {
      const l = hfState(layoutXml, k)
      const m = hfState(masterXml, k)
      if (l === 'off' || m === 'off') return false
      return l === 'on' || m === 'on'
    }),
  )

  // 幻灯片自己已有的页脚族占位符（最近的一层覆盖，不再从版式/母版取）
  const slidePh = new Set(
    slide.elements.map((e) => (e as { placeholder?: string }).placeholder).filter(Boolean),
  )

  // 幻灯片级 showMasterSp="0"（「隐藏背景图形」）同时挡住母版与版式；
  // 版式级的只挡母版。页脚族占位符不是背景图形，照旧跟随 p:hf
  const slideHidesInherited = /<p:sld\b[^>]*showMasterSp=(?:"(?:0|false)"|'(?:0|false)')/.test(
    slideXml,
  )
  const masterShown =
    !slideHidesInherited &&
    !(
      layoutXml && /<p:sldLayout\b[^>]*showMasterSp=(?:"(?:0|false)"|'(?:0|false)')/.test(layoutXml)
    )

  if (masterXml && parts.masterPath) {
    const hfTypes = new Set([...enabled].filter((k) => !slidePh.has(k) && !hasPh(layoutXml, k)))
    if (masterShown || hfTypes.size) {
      const ctx: ParseContext = {
        theme: parts.theme,
        mediaRels: partMediaRels(archive, parts.masterPath),
        defaultTextStyle: parts.defaultTextStyle,
      }
      out.push(
        ...parseDecorations(masterXml, ctx, {
          hfTypes,
          hideShapes: !masterShown,
          ...(slideNum != null ? { slideNum } : {}),
        }),
      )
    }
  }

  if (layoutXml && parts.layoutPath) {
    const hfTypes = new Set([...enabled].filter((k) => !slidePh.has(k)))
    if (!slideHidesInherited || hfTypes.size) {
      // 版式的页脚占位符常常不写 xfrm / 字号，要从母版继承
      const ctx: ParseContext = {
        theme: parts.theme,
        mediaRels: partMediaRels(archive, parts.layoutPath),
        masterPlaceholders: parts.masterPlaceholders,
        masterTextStyles: parts.masterTextStyles,
        defaultTextStyle: parts.defaultTextStyle,
      }
      out.push(
        ...parseDecorations(layoutXml, ctx, {
          hfTypes,
          hideShapes: slideHidesInherited,
          ...(slideNum != null ? { slideNum } : {}),
        }),
      )
    }
  }

  return out
}

/**
 * **可编辑**的演示文稿：在只读模型之上多带 `archive` 与三个动作。
 *
 * ## 为什么与 `PptxDeck` 分开，而不是加一个 `editable` 标志
 *
 * 只读预览与编辑的**能力面不同**：编辑会改模型、保存要写字节。用一个类型
 * 加标志会让「只读场景拿到了 archive」变成可能——而 archive 里的
 * `entries` 是可变的，误改它就会让保存写出错字节。分开之后类型自己说话：
 * 只读的调用方拿不到写入口。
 *
 * ## 编辑的粒度是**段落**，不是元素
 *
 * 实测（真实 pptx）：一个段落里通常只有**一个 run**，文本是整段。所以
 * 「编辑一个文本框」在模型层就是「替换它的段落数组」，由 vendored 的
 * `applyEditParagraphs`（`vendor/packages/pptx-ops/src/edit-text.ts`）做映射：
 *
 *   - 段落数与顺序按编辑器回传的数组走
 *   - 每段的 run 按 `srcRun` 回溯到原 run，**未被编辑的属性（字号、字体、
 *     颜色、项目符号、行距）从原 run 继承**——`...oldRun` 展开
 *   - 段落数变了（增删段落）走 `patchTextElementXml` 的重建分支
 *
 * **run 级格式编辑不在这一版**（加粗/字号/颜色）。上游的完整路径是
 * `pptx-ops` 的 ops 层 + `setElementFont` / `applyParagraphFormat`，那些
 * 在 `index.ts` 里、依赖整条写路径。这一版先把「改文字」做对：它是最常用
 * 的编辑，而它已经是补丁式的（见 `pptx-save.ts`）。
 */
export interface PptxEditSession {
  metadata(slideIndex: number): PptxMetadata
  link(slideIndex: number, element: SlideElement): PptxLink | null
  /** Current speaker notes from the active archive, including unsaved hosted edits. */
  notes(slideIndex: number): string
  readonly size: SlideSize
  /** 当前模型（编辑后会被替换，所以每次读都用 `slides()`） */
  slides(): readonly Slide[]
  /** 图片：zip 路径 → data URL（渲染用） */
  readonly media: ReadonlyMap<string, string>
  /** Monotonic edit revision, shared by manual and Agent commands. */
  mediaPart(path: string): Uint8Array | null
  version(): number
  checkpoint(): PptxSessionCheckpoint
  /** Callers must verify newer edits before restoring a round. */
  restore(checkpoint: PptxSessionCheckpoint, options?: { forceDirty?: boolean }): void
  /** Land a host-executed PPTX result into the same live canvas, preserving manual-save state. */
  replaceFromHost(bytes: Uint8Array, expectedVersion?: number, signal?: AbortSignal): Promise<void>
  /**
   * 改一个元素的文字。
   *
   * `paragraphs` 是**编辑器回传的段落数组**（形状见 vendored 的
   * `EditParagraph`）。返回 false 表示这个元素不存在或没有文字（调用方
   * 应据此提示，而不是静默什么也没发生）。
   */
  setText(slideIndex: number, elementId: string, paragraphs: EditParagraph[]): boolean
  /** Insert a blank slide after the given slide; returns its selected index. */
  insertBlank(afterIndex: number): number
  /** Duplicate the current slide and its slide relationships after it. */
  duplicate(index: number): number
  /** Delete a slide; the last remaining slide cannot be removed. */
  remove(index: number): number
  /** Move a slide to a zero-based destination index. */
  move(fromIndex: number, toIndex: number): number
  /** 这个幻灯片有未保存的改动吗 */
  isDirty(slideIndex: number): boolean
  /** 有任何未保存的改动吗 */
  hasChanges(): boolean
  /**
   * 渲染用的**不可变快照**。
   *
   * ## 为什么不能直接把 `slides()` 交给渲染层
   *
   * 编辑是**就地**改模型的（补丁式保存要求元素锚点与模型是同一批对象），
   * 所以 `slides()` 每次返回同一个数组。React 那边拿它当 `useMemo` 的依赖
   * 不会触发重算——界面会停在旧内容上，而那个症状看着像渲染 bug。
   *
   * 这个快照在**版本没变时返回同一个对象**（引用相等，缓存有效）；
   * 改过之后返回新对象（引用不等，重算）。于是渲染层可以诚实地依赖
   * 「快照的身份」而不是数一个外部版本号。
   */
  view(): PptxRenderable
  /** 序列化成字节。**不修改会话状态**（保存成功后才 `commit()`） */
  save(): Promise<Uint8Array>
  /**
   * 保存成功后调用：把内存模型与刚写出的字节对齐。
   *
   * **必须在 `save()` 成功之后调用**，否则第二次编辑会用旧锚点拼字节、
   * 悄悄回滚上一次的改动（见 `pptx-save.ts` 的 `commitSaved`）。
   */
  commit(): void
}

export interface PptxSessionCheckpoint {
  readonly sessionId: symbol
  readonly slides: Slide[]
  readonly pages: ReturnType<typeof readPptxPages>
  readonly archive: PptxArchive
  readonly baseline: ReturnType<typeof readPptxPages>
  readonly size: SlideSize
  readonly media: ReadonlyMap<string, string>
  readonly hostDirty: boolean
}

function setSlideNumber(element: SlideElement, slideNumber: number): void {
  if (element.type === 'group') {
    for (const child of element.children) setSlideNumber(child, slideNumber)
    return
  }
  if (element.type !== 'text' && element.type !== 'shape') return
  for (const paragraph of element.text?.paragraphs ?? []) {
    for (const run of paragraph.runs) {
      if (run.field === 'slidenum') run.text = String(slideNumber)
    }
  }
}

export async function openPptxForEdit(bytes: Uint8Array): Promise<PptxEditSession> {
  let archive = await PptxArchive.open(bytes)
  let { size } = archive.readPresentation()
  const pages = readPptxPages(archive)
  let baseline = structuredClone(pages)

  const slides: Slide[] = []
  for (const page of pages) {
    const slide = parseSlideFromArchive(archive, page.path)
    if (!slide) throw new Error(`PPTX 幻灯片无法解析：${page.path}`)
    slides.push(slide)
  }
  if (slides.length === 0) {
    throw new Error('这份演示文稿里没有幻灯片（文件可能已损坏）')
  }

  /** 快照缓存（没改动时必须返回同一个对象，改动后置空以失效） */
  let cachedView: PptxRenderable | null = null
  let lastSavedPatch: EntryPatch | null = null
  let media: ReadonlyMap<string, string> = archive.readMediaDataUrls()
  let hostDirty = false
  const sessionId = Symbol('pptx-edit-session')
  let revision = 0

  function requireIndex(index: number): Slide {
    const slide = slides[index]
    if (!Number.isInteger(index) || !slide) throw new Error('幻灯片序号无效')
    return slide
  }

  function invalidate(): void {
    revision++
    cachedView = null
    lastSavedPatch = null
    slides.forEach((slide, index) => {
      for (const element of [...slide.elements, ...(slide.decorations ?? [])]) {
        setSlideNumber(element, index + 1)
      }
    })
  }

  return {
    get size() {
      return size
    },
    slides: () => slides,
    metadata: (index) => readPptxMetadata(archive, slides, index),
    link: (index, element) => readPptxLink(archive, slides, index, element),
    notes(index) {
      const slide = slides[index]
      if (!slide) return ''
      const rel = [...archive.readRels(slide.path).values()].find((item) =>
        item.type.endsWith('/notesSlide'),
      )
      const xml = rel ? archive.readText(resolveTarget(slide.path, rel.target)) : null
      if (!xml) return ''
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        ignoreDeclaration: true,
        parseTagValue: false,
        trimValues: false,
        isArray: (name) => ['p:sp', 'a:p', 'a:r', 'a:fld'].includes(name),
      })
      const parsed = parser.parse(xml)
      type NotesRun = { 'a:t'?: string | { '#text'?: string } }
      type NotesParagraph = { 'a:r'?: NotesRun[] }
      type NotesShape = {
        'p:nvSpPr'?: { 'p:nvPr'?: { 'p:ph'?: { '@_type'?: string } } }
        'p:txBody'?: { 'a:p'?: NotesParagraph[] }
      }
      const shapes: NotesShape[] = parsed?.['p:notes']?.['p:cSld']?.['p:spTree']?.['p:sp'] ?? []
      const body = shapes.find(
        (shape) => shape['p:nvSpPr']?.['p:nvPr']?.['p:ph']?.['@_type'] === 'body',
      )
      const lines: string[] = (body?.['p:txBody']?.['a:p'] ?? []).map((para) =>
        (para['a:r'] ?? [])
          .map((run) =>
            typeof run['a:t'] === 'object' ? (run['a:t']?.['#text'] ?? '') : (run['a:t'] ?? ''),
          )
          .join(''),
      )
      while (lines.at(-1) === '') lines.pop()
      return lines.join('\n')
    },
    get media() {
      return media
    },
    mediaPart(path) {
      if (!/^ppt\/media\/[^/]+$/.test(path)) return null
      return archive.entries.get(path)?.slice() ?? null
    },
    version: () => revision,
    checkpoint: () => ({
      sessionId,
      slides: structuredClone(slides),
      pages: structuredClone(pages),
      archive: archive.snapshot(),
      baseline: structuredClone(baseline),
      size: { ...size },
      media,
      hostDirty,
    }),
    restore(checkpoint, options) {
      if (checkpoint.sessionId !== sessionId) throw new Error('PPTX 检查点不属于当前文档')
      archive = checkpoint.archive.snapshot()
      baseline = structuredClone(checkpoint.baseline)
      size = { ...checkpoint.size }
      media = checkpoint.media
      hostDirty = options?.forceDirty || checkpoint.hostDirty
      slides.splice(0, slides.length, ...structuredClone(checkpoint.slides))
      pages.splice(0, pages.length, ...structuredClone(checkpoint.pages))
      invalidate()
    },
    async replaceFromHost(hostBytes, expectedVersion, signal) {
      const nextArchive = await PptxArchive.open(hostBytes)
      const nextPages = readPptxPages(nextArchive)
      const nextSlides: Slide[] = []
      for (const page of nextPages) {
        const slide = parseSlideFromArchive(nextArchive, page.path)
        if (!slide) throw new Error(`宿主返回了无法解析的 PPTX 幻灯片：${page.path}`)
        nextSlides.push(slide)
      }
      if (!nextSlides.length) throw new Error('宿主返回了没有幻灯片的 PPTX')
      if (signal?.aborted) throw new Error('PPTX 操作已取消；文档未修改')
      if (expectedVersion !== undefined && revision !== expectedVersion)
        throw new Error('宿主解析期间画布已变化，请重新读取')
      archive = nextArchive
      size = nextArchive.readPresentation().size
      media = nextArchive.readMediaDataUrls()
      pages.splice(0, pages.length, ...nextPages)
      slides.splice(0, slides.length, ...nextSlides)
      baseline = structuredClone(nextPages)
      hostDirty = true
      invalidate()
    },

    view() {
      cachedView ??= {
        size,
        slides: () => slides,
        media,
        links: (index) =>
          new Map(
            (slides[index]?.elements ?? []).flatMap((element) => {
              const link = readPptxLink(archive, slides, index, element)
              return link ? [[element.id, link] as const] : []
            }),
          ),
      }
      return cachedView
    },

    setText(slideIndex, elementId, paragraphs) {
      const slide = slides[slideIndex]
      if (!slide) return false
      const el = slide.elements.find((e) => e.id === elementId)
      if (!el || (el.type !== 'text' && el.type !== 'shape')) return false

      const text = (el as { text?: { paragraphs: Paragraph[] } }).text
      if (!text) return false

      const prepared = preparePptxTextRangeEdit(el as TextElement, paragraphs, () =>
        patchedElementXml(structuredClone(el)),
      )
      if (prepared) {
        if (prepared.xml === el.anchor.originalXml && !el.dirty) return false
        // A structural run rebuild would discard unmodeled XML. The range adapter
        // publishes its surgical working anchor only after the whole edit validates.
        text.paragraphs = prepared.paragraphs
        el.anchor.originalXml = prepared.xml
        delete el.dirty
        delete el.dirtyPPr
        delete el.dirtyTransform
        delete el.dirtyFill
        delete el.dirtyStroke
        slide.structureDirty = true
        invalidate()
        return true
      }
      text.paragraphs = applyEditParagraphs(text.paragraphs, paragraphs)
      /**
       * 标脏 → 保存时这个元素的 XML 会被 `patchTextElementXml` 外科式重写
       * （逐 run 对齐、`<a:br/>` 字节不动），而不是整体重建。
       */
      el.dirty = true
      // 内容变了 → 快照失效（下次 view() 返回新对象，渲染层据此重算）
      invalidate()
      return true
    },

    insertBlank(afterIndex) {
      requireIndex(afterIndex)
      assertPresentationStructureSafe(archive)
      const source = slides[afterIndex]!
      const layoutPath = source.layoutPath ?? archive.resolveSlideChain(source.path).layoutPath
      if (!layoutPath || !archive.has(layoutPath)) {
        throw new Error('这份 PPTX 没有可用的幻灯片版式，无法新增空白页')
      }
      const page = allocatePptxPage(archive, pages)
      const relsXml = blankSlideRels(layoutPath)
      const relPath = relsPathFor(page.path)
      archive.setEntry(page.path, BLANK_SLIDE_XML)
      archive.setEntry(relPath, relsXml)
      let slide: Slide | null
      try {
        slide = parseSlideFromArchive(archive, page.path)
      } finally {
        archive.deleteEntry(page.path)
        archive.deleteEntry(relPath)
      }
      if (!slide) throw new Error('空白幻灯片生成失败')
      page.relsXml = relsXml
      slides.splice(afterIndex + 1, 0, slide)
      pages.splice(afterIndex + 1, 0, page)
      invalidate()
      return afterIndex + 1
    },

    duplicate(index) {
      const source = requireIndex(index)
      assertPresentationStructureSafe(archive)
      const sourcePage = pages[index]!
      assertPageCanDetach(archive, sourcePage)
      const relsXml = sourcePage.relsXml ?? archive.readText(relsPathFor(source.path))
      if (!relsXml) throw new Error('这张幻灯片缺少关系表，无法安全复制')
      const page = allocatePptxPage(archive, pages)
      page.relsXml = relsXml
      const clone: Slide = structuredClone(source)
      clone.path = page.path
      slides.splice(index + 1, 0, clone)
      pages.splice(index + 1, 0, page)
      invalidate()
      return index + 1
    },

    remove(index) {
      requireIndex(index)
      if (slides.length <= 1) throw new Error('至少保留一张幻灯片')
      assertPresentationStructureSafe(archive)
      assertPageCanDetach(archive, pages[index]!)
      assertNoIncomingSlideReferences(archive, pages[index]!, pages)
      slides.splice(index, 1)
      pages.splice(index, 1)
      invalidate()
      return Math.min(index, slides.length - 1)
    },

    move(fromIndex, toIndex) {
      requireIndex(fromIndex)
      requireIndex(toIndex)
      if (fromIndex === toIndex) return toIndex
      assertPresentationStructureSafe(archive)
      const [slide] = slides.splice(fromIndex, 1)
      const [page] = pages.splice(fromIndex, 1)
      slides.splice(toIndex, 0, slide!)
      pages.splice(toIndex, 0, page!)
      invalidate()
      return toIndex
    },

    isDirty(slideIndex) {
      const slide = slides[slideIndex]
      return slide
        ? slideIsDirty(slide) || pages[slideIndex]?.path !== baseline[slideIndex]?.path
        : false
    },

    hasChanges() {
      return (
        hostDirty || pageSequenceChanged(pages, baseline) || slides.some((s) => slideIsDirty(s))
      )
    },

    async save() {
      const patch = pageSequenceChanged(pages, baseline)
        ? buildPptxStructurePatch(archive, baseline, pages, slides)
        : new Map()
      const outputBytes = await buildPptxBytes(archive, slides, patch)
      lastSavedPatch = patch
      return outputBytes
    },

    commit() {
      if (!lastSavedPatch) throw new Error('必须先成功保存 PPTX，才能提交会话状态')
      const dirtyXml = new Map(
        slides
          .filter((slide) => slideIsDirty(slide))
          .map((slide) => [slide.path, patchSlideXml(slide)]),
      )
      commitSaved(slides)
      for (const [path, data] of lastSavedPatch) {
        if (data === null) archive.deleteEntry(path)
        else archive.setEntry(path, data)
      }
      for (const [path, xml] of dirtyXml) archive.setEntry(path, xml)
      baseline = structuredClone(pages)
      hostDirty = false
      lastSavedPatch = null
      // commit 也换了模型（元素锚点与 originalXml 都更新了），所以也要失效
      cachedView = null
      revision++
    },
  }
}

/**
 * 这份幻灯片里能编辑文字的元素（文本框与形状）。
 *
 * 上游的 `SlideElement` 是六个成员的联合，`text` 只在 `TextElement` 上，
 * 所以 `.text` 直接访问会被类型系统拒绝。调用方（界面、测试）都要处理
 * 「用户选中了一个能编辑文字的元素」这件事，而这个判断写三处就会有一天
 * 不一致——所以这里给一个判别函数，类型收窄由它保证。
 */
export function editableElements(slide: Slide): TextElement[] {
  return slide.elements.filter(
    (e): e is TextElement =>
      (e.type === 'text' || e.type === 'shape') && (e as TextElement).text != null,
  )
}

/**
 * 一个元素当前的文字（不是可编辑的给 null）。
 *
 * 与 `editableElements` 分开是因为用途不同：那个是「列出可编辑的」，
 * 这个是「拿到这个元素的文字」——界面在选中时两者都要用。
 */
export function textOfElement(el: Slide['elements'][number]): TextElement['text'] | null {
  if (el.type !== 'text' && el.type !== 'shape') return null
  return (el as TextElement).text ?? null
}
