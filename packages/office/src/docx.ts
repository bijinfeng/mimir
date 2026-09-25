import {
  parseDocx,
  readSections,
  saveDocx,
  type ParseExtras,
} from '../vendor/packages/docx-engine/src/index.js'
import type { Block, SectionInfo } from '../vendor/packages/docx-engine/src/types.js'
import {
  blocksToPmDoc,
  pmDocOptions,
  pmDocToSavePlan,
} from '../vendor/apps/docs/src/renderer/editor/convert.js'

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
 * 实测数据（`RESEARCH.md` §13）：原样保存 11/11 条目字节相同；
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
  /** 交给 Tiptap 的文档模型 */
  readonly content: PmDocJson
  /** 文档里的批注与脚注（界面可选展示） */
  readonly comments: unknown
  readonly footnotes: unknown
  /** 保存：把编辑器当前文档转成补丁并写回字节 */
  save(edited: PmDocJson): Promise<Uint8Array>
}

/**
 * 解析一份 docx，产出可以直接挂到 Tiptap 的文档模型。
 *
 * 注意 `parseDocx` 是**同步重活**（大型文档可能几百毫秒）。上游为此做了
 * worker（`parse-off-thread.ts`），mimir 的 POC 先直接在调用方 await——
 * 接进产品时要考虑 worker，否则大文档会卡住主线程。
 */
export async function openDocx(bytes: Uint8Array): Promise<DocxSession> {
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
    content,
    comments: parsed.comments,
    footnotes: parsed.footnotes,
    async save(edited: PmDocJson): Promise<Uint8Array> {
      const plan = pmDocToSavePlan(edited, parsed.blocks)
      return saveDocx(
        { ...parsed, extras: parsed.extras } as never,
        plan.saveBlocks as never,
        // POC 不带入图表补丁等附加参数；上游把这些放在 options 里逐项传
        {},
      )
    },
  }
}
