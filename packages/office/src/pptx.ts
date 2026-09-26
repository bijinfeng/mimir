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
import { PptxArchive, resolveTarget } from './pptx-archive.js'

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
 * 上游同步读，这里 await）。上游改这两段时这里要跟着改，`UPSTREAM.json`
 * 记了 commit。
 *
 * ## 只读，所以没有保存路径
 *
 * 上游的 `Slide` 带 `originalXml` / `bodyPrefix` / `bodySuffix`（保存时拼回
 * 字节用）。这里保留它们——`parseSlide` 的返回值原样带出来，删字段反而要
 * 改上游代码。渲染不用这几个字段。
 */

/** 打开后的演示文稿 */
export interface PptxDeck {
  /** 画布尺寸（EMU）——渲染时按它算宽高比 */
  readonly size: SlideSize
  readonly slides: readonly Slide[]
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
  const { size, slidePaths } = await archive.readPresentation()

  const slides: Slide[] = []
  for (const path of slidePaths) {
    const slide = await parseSlideFromArchive(archive, path)
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
    slides,
    fingerprint: archive.fingerprint,
    media: await archive.readMediaDataUrls(),
  }
}

/** 一张幻灯片：读它自己 + 上溯版式/母版/主题，装配成 `ParseContext` 后解析 */
async function parseSlideFromArchive(
  archive: PptxArchive,
  slidePath: string,
): Promise<Slide | null> {
  const slideXml = await archive.readText(slidePath)
  if (slideXml == null) return null

  const chain = await archive.resolveSlideChain(slidePath)
  const ctx: ParseContext = {}

  const layoutXml =
    (chain.layoutPath ? await archive.readText(chain.layoutPath) : undefined) ?? undefined
  const masterXml =
    (chain.masterPath ? await archive.readText(chain.masterPath) : undefined) ?? undefined

  /**
   * 主题。**`clrMap` 必须在解析下面任何内容之前就位**：深色母版会把配色名
   * 换掉（`bg1` ↔ `dk1`），晚一步所有 `schemeClr` 都会解析成相反的明暗。
   */
  if (chain.themePath) {
    const themeXml = await archive.readText(chain.themePath)
    if (themeXml) {
      ctx.theme = parseTheme(themeXml)
      ctx.theme.clrMap = parseClrMap(masterXml, layoutXml, slideXml)
      ctx.themeMediaRels = await partMediaRels(archive, chain.themePath)
    }
  }

  // 占位符几何 → 版式优先、母版兜底；文字样式与背景同理
  if (layoutXml) {
    if (chain.layoutPath) ctx.layoutMediaRels = await partMediaRels(archive, chain.layoutPath)
    ctx.layoutPlaceholders = parsePlaceholderMap(layoutXml, ctx.theme, ctx.layoutMediaRels)
    ctx.layoutBg = layoutXml
  }
  if (masterXml) {
    if (chain.masterPath) ctx.masterMediaRels = await partMediaRels(archive, chain.masterPath)
    ctx.masterPlaceholders = parsePlaceholderMap(masterXml, ctx.theme, ctx.masterMediaRels)
    ctx.masterTextStyles = parseMasterTextStyles(masterXml, ctx.theme, ctx.masterMediaRels)
    ctx.masterBg = masterXml
  }

  // presentation.xml 的 <p:defaultTextStyle>：非占位符形状的文字基线默认值
  const presXml = await archive.readText('ppt/presentation.xml')
  if (presXml) ctx.defaultTextStyle = parseDefaultTextStyle(presXml, ctx.theme)

  // 幻灯片自己的 rels：媒体、图表、SmartArt 预览、超链接…
  const rels = await archive.readRels(slidePath)
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
      slideOrder ??= (await archive.readPresentation()).slidePaths
      const idx = slideOrder.indexOf(resolveTarget(slidePath, rel.target))
      if (idx >= 0) hlinkRels.set(rel.id, `slide:${idx}`)
    } else if (rel.type.endsWith('/image')) {
      mediaRels.set(rel.id, resolveTarget(slidePath, rel.target))
    } else if (rel.type.endsWith('/chart') || rel.type.endsWith('/chartEx')) {
      const target = resolveTarget(slidePath, rel.target)
      const xml = await archive.readText(target)
      if (xml) {
        chartXmls.set(rel.id, xml)
        chartMediaRels.set(rel.id, await partMediaRels(archive, target))
        // 手绘叠加层在图表自己的 rels 指向的 chartUserShapes 里
        for (const sub of (await archive.readRels(target)).values()) {
          if (sub.type.endsWith('/chartUserShapes')) {
            const usXml = await archive.readText(resolveTarget(target, sub.target))
            if (usXml) chartUserShapes.set(rel.id, usXml)
          }
          if (sub.type.endsWith('/chartStyle')) chartStyleRels.add(rel.id)
          // 图表局部主题（配色按图表重映射）：schemeClr 必须对着它解析
          if (sub.type.endsWith('/themeOverride')) {
            const ovXml = await archive.readText(resolveTarget(target, sub.target))
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
      const vml = await archive.readText(vmlPath)
      if (vml) {
        const vmlRels = await archive.readRels(vmlPath)
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
      const dataXml = await archive.readText(dataPath)
      if (dataXml) diagramDatas.set(rel.id, dataXml)
      const relId = dataXml
        ? /<dsp:dataModelExt\b[^>]*\brelId="([^"]+)"/.exec(dataXml)?.[1]
        : undefined
      if (relId) {
        const drawRel = rels.get(relId) ?? (await archive.readRels(dataPath)).get(relId)
        const basePath = rels.get(relId) ? slidePath : dataPath
        const drawingPath = drawRel ? resolveTarget(basePath, drawRel.target) : undefined
        const drawingXml = drawingPath ? await archive.readText(drawingPath) : undefined
        if (drawingXml && drawingPath) {
          diagramDrawings.set(rel.id, drawingXml)
          diagramMediaRels.set(rel.id, await partMediaRels(archive, drawingPath))
        }
      }
    } else if (rel.type.endsWith('/diagramLayout')) {
      const xml = await archive.readText(resolveTarget(slidePath, rel.target))
      if (xml) diagramLayouts.set(rel.id, xml)
    } else if (rel.type.endsWith('/diagramColors')) {
      const xml = await archive.readText(resolveTarget(slidePath, rel.target))
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
  ctx.tableStyles = (await archive.readText('ppt/tableStyles.xml')) ?? undefined

  const slide = parseSlide({
    path: slidePath,
    slideXml,
    layoutPath: chain.layoutPath,
    masterPath: chain.masterPath,
    ctx,
  })

  // 母版/版式的装饰层（logo、色带、以及启用的页脚/页码/日期），只读渲染
  const decorations = await buildDecorations(
    archive,
    slidePath,
    slideXml,
    slide,
    layoutXml,
    masterXml,
    {
      layoutPath: chain.layoutPath,
      masterPath: chain.masterPath,
      theme: ctx.theme,
      masterPlaceholders: ctx.masterPlaceholders,
      masterTextStyles: ctx.masterTextStyles,
      defaultTextStyle: ctx.defaultTextStyle,
    },
  )
  if (decorations.length) slide.decorations = decorations

  return slide
}

/** 一个部件（版式/母版）自己的图片关系（装饰层里的图片要用） */
async function partMediaRels(archive: PptxArchive, partPath: string): Promise<Map<string, string>> {
  const media = new Map<string, string>()
  for (const rel of (await archive.readRels(partPath)).values()) {
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
async function buildDecorations(
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
): Promise<Slide['elements']> {
  const out: Slide['elements'] = []

  let slideNum: number | undefined
  try {
    const idx = (await archive.readPresentation()).slidePaths.indexOf(slidePath)
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
        mediaRels: await partMediaRels(archive, parts.masterPath),
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
        mediaRels: await partMediaRels(archive, parts.layoutPath),
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
