import {
  parseDocx,
  readSections,
  saveDocx,
  type ParseExtras,
} from '../vendor/packages/docx-engine/src/index.js'
import type { HfPartInfo, ParsedDoc } from '../vendor/packages/docx-engine/src/types.js'
import type { SaveOptions } from '../vendor/packages/docx-engine/src/patch.js'
import type { ChartDisplay, Block, SectionInfo } from '../vendor/packages/docx-engine/src/types.js'
import {
  blocksToPmDoc,
  pmDocOptions,
  pmDocToSavePlan,
} from '../vendor/apps/docs/src/renderer/editor/convert.js'
import { BoundedZip } from './zip-bounds.js'
import { docxChartSaveOptions } from './docx-chart-save.js'

/**
 * 编辑器文档的类型。
 *
 * 上游 `blocksToPmDoc` 产出的是 **ProseMirror JSON**（`{ type, content }` 这样
 * 的普通对象），不是 `Node` 实例——Tiptap 收到 JSON 会自己 parse。所以这里的
 * 类型用「结构上够用」的最小形状，而不是 `Node`：
 * 用 `Node` 会让类型断言失败（实测报「Type 缺少 children… 34 个属性」），
 * 而且在浏览器里我们本来也不持有实例。
 */
export interface PmDocJson {
  type: string
  content?: PmDocJson[]
  text?: string
  [key: string]: unknown
}

/**
 * docx 的打开 / 保存编排（适配层）。
 *
 * ## 为什么需要这一层
 *
 * vendored 代码是「应用的内部实现」：`parseDocx` 返回的东西、保存时要拼的
 * `SaveBlock[]`、`options` 里那一长串分段/页眉参数，都是给 GenOffice 自己的
 * App 用的。mimir 的界面不需要知道这些。这一层把「打开一份 docx」「把编辑器
 * 里的改动存回去」压成两个动作，**上游改内部结构时只需要改这个文件**。
 *
 * ## 保存走的是补丁路径（关键）
 *
 * `pmDocToSavePlan` 会逐块比对编辑器文档与原始块：**没被碰过的块生成
 * `{ kind: 'original', docxIndex }`**，`saveDocx` 对这类块直接复制原 zip 条目
 * 的字节。所以「打开一个 Word 文档改两个字」不会重排整篇文档的 XML——
 * 这是能安全编辑别人的 docx 的前提（Word 的 XML 有大量我们没建模的东西：
 * 域代码、修订标记、自定义样式、OLE 对象）。
 *
 * 实测数据（`.trellis/spec/project/research.md` §13）：原样保存 11/11 条目字节相同；
 * 改一段时只有 document.xml 变化 2724 → 2739 字节。
 */

/** 打开后的会话。`content` 给 Tiptap，`save` 把编辑结果写回字节 */
export interface DocxSession {
  /** 原始字节（保存时作为基底——未改动的条目从它复制） */
  readonly originalBytes: Uint8Array
  /** 解析出的原始块（保存时的对照基准，不要在外部改它） */
  readonly blocks: readonly Block[]
  /** 解析出的附加信息（样式表、编号、页眉页脚…保存时要用） */
  readonly extras: ParseExtras
  /**
   * 分段信息：纸张尺寸与页边距（**分页的前提**）。
   *
   * 上游把它从 `sectPrXml` 现解析（`readSections`），不放进 ParsedDoc——
   * 因为编辑器改动分段后要能重建。不传它的后果是静默的：文档照常渲染，
   * 但用的是浏览器默认页边距，分页位置全是错的。
   */
  readonly sections: SectionInfo[]

  /**
   * 这份文档里**真的存在**的标题级别（升序，1–9）。
   *
   * 工具条的「段落样式」下拉只能列这些级别。理由在保存路径上：生成标题时
   * `styleId` 取 `ctx.headingStyleIds.get(level)`（`generate.ts:1737`），
   * 而它来自解析时读到的 `word/styles.xml`。文档没有 Heading3 时选「标题 3」
   * 会生成一个**没有 `w:pStyle` 的段落**——画布上有 h3 的样子（那是本地的
   * `h1..h6` 规则），保存重开后 Word 里却是正文。这种「看着对、文件里不对」
   * 只能靠只列出存在的级别来避免。
   */
  readonly headingLevels: readonly number[]

  /**
   * 页眉页脚：默认变体与 first/even 变体（分页时按 `titlePg` /
   * `evenAndOddHeaders` 选）。
   *
   * 上游把这套放在 App 状态里（它的页眉脚可编辑），mimir 只读展示，
   * 所以直接从解析结果给。**默认变体要单独拼**——它不在 `headerFirst` /
   * `headerEven` 里（那两个是 `w:type="first"` / `"even"` 的专用部件）。
   */
  readonly headerFooter: {
    header: HfPartInfo | null
    footer: HfPartInfo | null
    headerFirst: HfPartInfo | null
    footerFirst: HfPartInfo | null
    headerEven: HfPartInfo | null
    footerEven: HfPartInfo | null
    /** 首页不同（w:titlePg） */
    titlePg: boolean
    /** 奇偶页不同（settings.xml w:evenAndOddHeaders） */
    evenAndOdd: boolean
  }
  /** 交给 Tiptap 的文档模型 */
  readonly content: PmDocJson
  /** 文档里的批注（界面可选展示） */
  readonly comments: unknown
  /**
   * 脚注数据源（页底脚注区用）。
   *
   * 正文里的上标引用由编辑器自己渲染（`DocNoteRef`），但「脚注正文放到
   * 引用所在页的页底」需要原始块树里的 `noteRef` 与脚注定义——那是分页
   * 侧的活。这里暴露恰好够用的两样，不让调用方接触整个 ParsedDoc。
   */
  readonly footnotes: {
    parsed: ParsedDoc
    /** `docxIndex` → 原始块（分页块盒的 run 里没有 noteRef） */
    blockByDocxIndex: Map<number, Block>
  }
  /** 保存：把编辑器当前文档转成补丁并写回字节 */
  save(edited: PmDocJson, options?: SaveOptions): Promise<Uint8Array>
}

/**
 * 解析一份 docx，产出可以直接挂到 Tiptap 的文档模型。
 *
 * 注意 `parseDocx` 是**同步重活**（大型文档可能几百毫秒）。上游为此做了
 * worker（`parse-off-thread.ts`），mimir 的 POC 先直接在调用方 await——
 * 接进产品时要考虑 worker，否则大文档会卡住主线程。
 */
export async function openDocx(bytes: Uint8Array): Promise<DocxSession> {
  await (await BoundedZip.open(bytes)).preflightAll()
  const parsed = await parseDocx(bytes)

  /**
   * 可见块 = 参与编辑的那些。`hidden` 的块（如 sectPr 之类）不参与渲染，
   * 但保存时要原样保留——`pmDocToSavePlan` 会按 docxIndex 对照，
   * 所以这里只把它们排除出 `content`，不动 `blocks`。
   */
  const sections = readSections(parsed)
  const visibleBlocks = parsed.blocks.filter((block) => !block.hidden)
  /**
   * 三个参数缺一不可：
   *   sections      → 纸张与页边距（分页的几何依据）
   *   pmDocOptions  → 兼容模式（legacyTableIndent：Word 2013 前后的表缩进算法不同）
   */
  const content = blocksToPmDoc(
    visibleBlocks,
    sections,
    pmDocOptions(parsed),
  ) as unknown as PmDocJson

  return {
    originalBytes: bytes,
    blocks: parsed.blocks,
    extras: parsed.extras,
    sections,
    headingLevels: [...parsed.headingStyleIds.keys()].toSorted((a, b) => a - b),
    headerFooter: {
      header: defaultHfPart(parsed, 'header'),
      footer: defaultHfPart(parsed, 'footer'),
      headerFirst: parsed.headerFirst ?? null,
      footerFirst: parsed.footerFirst ?? null,
      headerEven: parsed.headerEven ?? null,
      footerEven: parsed.footerEven ?? null,
      titlePg: parsed.titlePg ?? false,
      evenAndOdd: parsed.evenAndOddHeaders ?? false,
    },
    content,
    comments: parsed.comments,
    footnotes: {
      parsed,
      blockByDocxIndex: new Map(
        parsed.blocks
          .filter((b) => b.docxIndex !== null)
          .map((b) => [b.docxIndex as number, b] as const),
      ),
    },
    async save(edited: PmDocJson, options: SaveOptions = {}): Promise<Uint8Array> {
      const plan = pmDocToSavePlan(edited, parsed.blocks)
      // Upstream omits a title delta when the original chart had no title.
      // A user can still add one; carry it to the same surgical part patch.
      for (const node of edited.content ?? []) {
        const attrs = node.attrs as { docxIndex?: number; chartDisplay?: ChartDisplay } | undefined
        const current = attrs?.chartDisplay
        const original = parsed.blocks.find(block => block.docxIndex === attrs?.docxIndex)?.chartDisplay
        if (!current?.partPath || !original || current.title === original.title) continue
        const patch = plan.chartPatches.find(item => item.partPath === current.partPath)
        if (patch) patch.patch.title = current.title ?? ''
        else plan.chartPatches.push({ partPath: current.partPath, patch: { title: current.title ?? '' } })
      }
      return saveDocx(
        { ...parsed, extras: parsed.extras } as never,
        plan.saveBlocks as never,
        await docxChartSaveOptions(bytes, plan.chartPatches, options),
      )
    },
  }
}

/**
 * 默认页眉/页脚部件。
 *
 * **它不在 `headerFirst` / `headerEven` 里**——那两个是 `w:type="first"` /
 * `"even"` 的专用部件，而默认页眉脚在 `document.xml` 的常规 sectPr 引用里，
 * 解析结果落在 `headerParas` / `headerText`（与 `hfParts` 的对应 rId）。
 * 这里按同一个形状（`HfPartInfo`）拼出来，让分页侧不必区分来源。
 */
function defaultHfPart(parsed: ParsedDoc, kind: 'header' | 'footer'): HfPartInfo | null {
  const text = kind === 'header' ? parsed.headerText : parsed.footerText
  const paras = kind === 'header' ? parsed.headerParas : parsed.footerParas
  const images = kind === 'header' ? parsed.headerImages : parsed.footerImages
  const hasPageNumber =
    kind === 'header'
      ? (parsed.headerHasPageNumber ?? false)
      : (parsed.footerHasPageNumber ?? false)
  // 与上游 hfFromPart 同一判据：文字、页码域、段落、图片全空才算「没有」
  if (!text && !hasPageNumber && (!paras || paras.length === 0) && !images?.length) return null
  return {
    text: text ?? '',
    hasPageNumber,
    paras: paras ?? [],
    ...(images?.length ? { images } : {}),
  }
}
