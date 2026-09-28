/**
 * markdown 方言的工具条逻辑：**当前状态**与**块级操作**。
 *
 * ## 为什么不写在 `MarkdownEditor.tsx` 里
 *
 * 这里每条行为都要在**真方言**上验证过才知道对不对（方言在 `apps/web` 的
 * `editor/extensions.ts`，这个包不拥有它）。抽成单独一个模块就能被宿主用
 * 真扩展列表测——`apps/web/src/editor/markdown-toolbar.test.tsx` 就是这么做的。
 * 混进 .tsx 里就只能靠人肉点界面。
 *
 * ## 每个操作都走 `runCommand` / `runCommandChain`，不用便捷命令
 *
 * 理由见 `shell/editor-commands.ts`：`chain().toggleBold()` 这类便捷命令在
 * 方言没注册它时**静默无效**（`run()` 照样返回 true）。这个模块里的所有命令
 * 都经那两个函数，它们会先检测命令是否存在。
 *
 * ## 工具条状态是一个字符串，token 分两类
 *
 * `useToolbarState` 的契约（selector 返回字符串）。字符串里的 token 有两类：
 *
 * | 类 | 例子 | 谁读它 |
 * |---|---|---|
 * | 状态 | `bold`、`style:h2`、`table` | 按钮的 active、下拉的值 |
 * | 能力 | `undo`、`sink`、`delRow`、`clear` | 按钮的 disabled |
 *
 * 合在一个订阅里是必须的：能力 token 里有些（`undo` / `redo`）来自**历史栈**
 * 而不是文档状态，在渲染期另算会停在打开文档那一刻。
 *
 * ## 必须精确匹配，不能子串匹配
 *
 * 旧版用 `state.includes(key)` 判断，于是 `codeBlock` 里含有 `code`——光标
 * 在代码块里时「行内代码」按钮跟着亮。`toolbarHas` 按空格切开再比。
 */

import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model'
import { TableMap, selectionCell } from '@tiptap/pm/tables'
import { hasMark, hasNode, runCommand, runCommandChain } from '../shell/editor-commands.js'

/** 状态串里的 token 是不是在（**精确匹配**，不是子串） */
export function toolbarHas(state: string, token: string): boolean {
  return state.split(' ').includes(token)
}

/* ── 列表：整张列表的作用域 ────────────────────────────────────── */

const LIST_NODE_NAMES = ['bulletList', 'orderedList', 'taskList'] as const

/** 光标所在的最外层列表（含它在文档里的位置） */
function enclosingList(editor: Editor): { node: ProseMirrorNode; pos: number } | null {
  const { $from } = editor.state.selection
  for (let depth = 1; depth <= $from.depth; depth += 1) {
    const node = $from.node(depth)
    if ((LIST_NODE_NAMES as readonly string[]).includes(node.type.name)) {
      return { node, pos: $from.before(depth) }
    }
  }
  return null
}

/**
 * 整张列表的**文字区间**（第一段文字的开头 → 最后一段文字的末尾）。
 *
 * ## 为什么不能用 `$from.before(depth)` / `$from.after(depth)`
 *
 * 那两端落在**块级边界**上（列表节点的首尾），而 `setTextSelection` 会把
 * 位置夹进 `[TextSelection.atStart(doc).from, TextSelection.atEnd(doc).to]`
 * ——夹完之后可能得到端点根本不在文字里的 TextSelection。实测（真方言，
 * 三项列表、光标在第二项）：选区成了 `anchor:3 head:17`，
 * `toggleTaskList` 把整张列表拆成三个散段落，**而命令返回 true**。
 * 所以区间必须落在真实文字上。
 *
 * 空列表（每一项都没文字）返回 null，调用方退回「只改光标那一项」。
 */
export function wholeListRange(editor: Editor): { from: number; to: number } | null {
  const list = enclosingList(editor)
  if (list === null) return null
  let from = -1
  let to = -1
  list.node.descendants((child, rel) => {
    if (!child.isText) return true
    // `rel` 是相对列表节点的偏移，列表内容从 `pos + 1` 开始
    const absolute = list.pos + 1 + rel
    if (from === -1) from = absolute
    to = absolute + child.nodeSize
    return true
  })
  return from === -1 ? null : { from, to }
}

/**
 * 整张列表在「普通列表 ↔ 任务列表」之间切换。
 *
 * ## 为什么必须先把选区铺开
 *
 * `toggleTaskList` 的作用域是**光标所在的那一项**：光标在第二项上点它，
 * 得到的是「第一项还是项目符号、第二项变成待办」——列表被拆成两张（实测）。
 * 用户点这个按钮想要的是整张列表变成待办。
 *
 * 「先设选区、再 toggle」必须在**同一条链**里：分两次 `runCommand` 的话，
 * 中间那次选区派发会真的落到文档上（靠 history 的 500ms 分组才合成一步撤销），
 * 而且第二步读到的是那次派发之后的状态——不是我们想调教的那个。
 *
 * ## 取消时得到的是「段落」而不是「项目符号」
 *
 * 上游 `toggleList` 的语义：光标已经在目标类型的列表里时它走
 * `liftListItem`——把各项**移出列表**变成段落（实测
 * `- [ ] 一 / - [ ] 二` → `一 / 二`）。与 `toggleBulletList` 的行为一致
 * （项目符号列表再点一次也是变段落），按钮的 `active` 态会跟着灭。
 *
 * 嵌套列表由调用方禁用（见 `taskListToggleBlockedReason`）：那种结构上没有任何
 * 一条上游命令能整张转换，实测每种绕法都会把文档改坏。
 */
export function toggleWholeTaskList(editor: Editor): boolean {
  const range = wholeListRange(editor)
  // 没有列表 / 列表里没有文字：交给命令按它自己的作用域处理（它会新建一个）
  if (range === null) return runCommand(editor, 'toggleTaskList')
  return runCommandChain(editor, [
    { name: 'setTextSelection', args: [range] },
    { name: 'toggleTaskList' },
  ])
}

/**
 * 「任务列表」按钮该禁用的原因；可以点就返回 `null`。
 *
 * ## 为什么嵌套列表直接禁用
 *
 * 上游 `toggleList` 在嵌套列表上**没有任何一种可靠的整张转换**（实测四种走法）：
 *
 * | 走法 | 结果 |
 * |---|---|
 * | 整张列表的文字区间 + toggle | `run()` 返回 **false**，文档一字未改（静默无效） |
 * | 光标在最外层 + toggle | 同上 |
 * | 逐项在一条链里 toggle | 内层项被抬出来、外层没变——结构坏了 |
 * | `setNodeSelection` + toggle | 同上 |
 *
 * 而光标在**内层**时，普通 toggle 会把那一项抬出嵌套（`- 甲 / - [ ] 甲一 / - 乙`，
 * 三层结构散成三块）。所以这里如实禁用并说明原因——比留一个点了没反应的按钮、
 * 或者一个会把文档改坏的按钮好。
 *
 * 想转换时先把嵌套列表拆成平级（减少缩进），这是 markdown 的待办列表本身的
 * 限制，不是这个按钮的限制。
 */
export function taskListToggleBlockedReason(editor: Editor): string | null {
  if (!hasNode(editor, 'taskList')) return '这个方言没有待办列表（taskList）'
  const list = enclosingList(editor)
  if (list === null) return null
  if (!listHasNestedList(list.node)) return null
  return '这张列表有嵌套项，待办列表只能整层转换；先减少缩进拆成平级'
}

/** 列表里有嵌套列表吗（任何一层） */
function listHasNestedList(list: ProseMirrorNode): boolean {
  let nested = false
  list.descendants((child) => {
    if ((LIST_NODE_NAMES as readonly string[]).includes(child.type.name)) {
      nested = true
      return false
    }
    return true
  })
  return nested
}

/**
 * 光标处列表项的节点名。任务列表与普通列表是**两种节点**（`taskItem` /
 * `listItem`），缩进的命令也分两套——用错节点名时命令返回 false 且不报错。
 */
export type ListItemName = 'listItem' | 'taskItem'

export function listItemNameAt(editor: Editor): ListItemName | null {
  if (hasNode(editor, 'taskItem') && editor.isActive('taskItem')) return 'taskItem'
  if (hasNode(editor, 'listItem') && editor.isActive('listItem')) return 'listItem'
  return null
}

/** 从状态 token 里读节点名（`item:taskItem`）。工具条不另调一次 `can()` */
export function listItemNameFromState(state: string): ListItemName | null {
  const token = state.split(' ').find((item) => item.startsWith('item:'))
  if (token === undefined) return null
  const value = token.slice('item:'.length)
  return value === 'taskItem' || value === 'listItem' ? value : null
}

export interface IndentState {
  item: ListItemName | null
  canOutdent: boolean
  canIndent: boolean
}

/**
 * 「减少 / 增加缩进」的可用性。
 *
 * `liftListItem('listItem')` 在任务列表里返回 false（节点名不对），所以节点名
 * 必须**按当前光标处判断**——这正是两个按钮最容易写成「点了没反应」的地方。
 *
 * `can` 可以传进来复用（`toolbarStateOf` 已经算过一个）：`editor.can()` 每次
 * 都会把所有命令包成对象，一次事务里多调几次是白白的开销。
 */
export function indentStateOf(editor: Editor, can = editor.can()): IndentState {
  const item = listItemNameAt(editor)
  if (item === null) return { item, canOutdent: false, canIndent: false }
  return { item, canOutdent: can.liftListItem(item), canIndent: can.sinkListItem(item) }
}

/* ── 段落样式 ──────────────────────────────────────────────────── */

/** 九个取值，顺序就是下拉里的顺序（照上游 GenOffice 的 Ribbon） */
export const PARAGRAPH_STYLES = [
  'paragraph',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'codeBlock',
] as const

export type ParagraphStyle = (typeof PARAGRAPH_STYLES)[number]

/** 每个取值对应哪个节点（没有这个节点就没有这一项） */
export function nodeNameOfStyle(style: ParagraphStyle): string {
  if (style === 'paragraph') return 'paragraph'
  if (style === 'blockquote') return 'blockquote'
  if (style === 'codeBlock') return 'codeBlock'
  return 'heading'
}

/**
 * 光标处的段落样式。取不到（比如选中的是一张图片）返回 null。
 *
 * **判断顺序就是优先级**：引用里的段落与引用里的标题都同时命中多条
 * （引用是包装节点，里面照旧是 paragraph / heading）。取最外层的结构
 * ——代码块 → 引用 → 标题 → 正文。这与用户在界面上看到的层级一致，
 * 也让「选它」不会误伤内层。列表项与任务项里的内容是段落，所以它们显示
 * 「正文」：再选一次「正文」等于去掉列表（`setParagraph` 会把它提出列表），
 * 与 Word 里选择「正文」的行为同构。
 */
export function paragraphStyleOf(editor: Editor): ParagraphStyle | null {
  if (hasNode(editor, 'codeBlock') && editor.isActive('codeBlock')) return 'codeBlock'
  if (hasNode(editor, 'blockquote') && editor.isActive('blockquote')) return 'blockquote'
  if (hasNode(editor, 'heading')) {
    for (const level of [1, 2, 3, 4, 5, 6] as const) {
      if (editor.isActive('heading', { level })) return `h${level}`
    }
  }
  if (editor.isActive('paragraph')) return 'paragraph'
  return null
}

export function applyParagraphStyle(editor: Editor, style: ParagraphStyle): boolean {
  if (style === 'paragraph') return runCommand(editor, 'setParagraph')
  if (style === 'blockquote') return runCommand(editor, 'setBlockquote')
  if (style === 'codeBlock') return runCommand(editor, 'setCodeBlock')
  return runCommand(editor, 'setHeading', { level: Number(style.slice(1)) })
}

/** `style:` token → 下拉的当前值 */
export function styleFromToolbarState(state: string): ParagraphStyle | null {
  const token = state.split(' ').find((item) => item.startsWith('style:'))
  if (token === undefined) return null
  const value = token.slice('style:'.length)
  return (PARAGRAPH_STYLES as readonly string[]).includes(value) ? (value as ParagraphStyle) : null
}

/* ── 代码块语言 ────────────────────────────────────────────────── */

/**
 * 语言候选表，**从方言自己的 lowlight 实例上读**（`extensions.ts` 里
 * `createLowlight(common)` 的那一份，实测 37 种）。
 *
 * 各抄一份常量表是不行的：编辑器注册的是哪一份、下拉里能选的就该是哪一份。
 * 抄一份会在「表里有、但低亮不认」时**静默失去高亮**——写了
 * `language-xxx` 却没有对应的语法。
 */
export function codeLanguageOptions(editor: Editor): string[] {
  const extension = editor.extensionManager.extensions.find((item) => item.name === 'codeBlock')
  const options = extension?.options as
    | { lowlight?: { listLanguages?: () => string[] } }
    | undefined
  const languages = options?.lowlight?.listLanguages?.()
  if (!Array.isArray(languages)) return []
  return languages.toSorted((a, b) => a.localeCompare(b))
}

/** 当前代码块的语言。`null` = 没设（序列化成没有语言标记的围栏） */
export function currentCodeLanguage(editor: Editor): string | null {
  const language: unknown = editor.getAttributes('codeBlock').language
  return typeof language === 'string' && language !== '' ? language : null
}

export function setCodeLanguage(editor: Editor, language: string | null): boolean {
  return runCommand(editor, 'updateAttributes', 'codeBlock', { language })
}

/* ── 链接 ──────────────────────────────────────────────────────── */

export function currentLinkHref(editor: Editor): string | null {
  const href: unknown = editor.getAttributes('link').href
  return typeof href === 'string' && href !== '' ? href : null
}

/**
 * 设链接。
 *
 * 两条都由实测定：**空选区上 `setLink` 返回 true 却不改文档**（它只是把
 * `link` 塞进 storedMarks，接着敲的字会变成链接——实测
 * `一[新字](https://x.y)段文字`，那不是「给选中的文字加链接」），所以空选区
 * 且不在链接里时返回 false，调用方据此禁用按钮。
 *
 * 已经在链接里时先用 `extendMarkRange` 把整条选进来，否则改的是半条链接、
 * 另一半留着旧地址（两个相邻的链接）。
 */
export function applyLink(editor: Editor, href: string): boolean {
  const inside = hasMark(editor, 'link') && editor.isActive('link')
  if (editor.state.selection.empty && !inside) return false
  if (inside) {
    return runCommandChain(editor, [
      { name: 'extendMarkRange', args: ['link'] },
      { name: 'setLink', args: [{ href }] },
    ])
  }
  return runCommand(editor, 'setLink', { href })
}

export function removeLink(editor: Editor): boolean {
  return runCommand(editor, 'unsetLink')
}

/* ── 表格 ──────────────────────────────────────────────────────── */

export type ColumnAlign = 'left' | 'center' | 'right'

/** 光标所在那一列的**首尾两个格子**的位置（CellSelection 的两个端点） */
function columnAt(editor: Editor): { anchorCell: number; headCell: number } | null {
  if (!hasNode(editor, 'table') || !editor.isActive('table')) return null
  let $cell: ResolvedPos
  try {
    $cell = selectionCell(editor.state)
  } catch {
    // 光标在一个不是单元格的位置（比如表格被整块选中）
    return null
  }
  const table = $cell.node(-1)
  const tableStart = $cell.start(-1)
  const map = TableMap.get(table)
  const column = map.findCell($cell.pos - tableStart).left
  const cells = map.cellsInRect({ left: column, right: column + 1, top: 0, bottom: map.height })
  if (cells.length === 0) return null
  return { anchorCell: tableStart + cells[0]!, headCell: tableStart + cells[cells.length - 1]! }
}

/**
 * 光标所在那一列的对齐。读的是当前格的属性：表头格与正文格在 markdown 里
 * 必须同值（对齐写在表头下面那条分隔行上，一列只有一个值）。
 */
export function currentColumnAlign(editor: Editor): ColumnAlign | null {
  const mark = editor.isActive('tableHeader') ? 'tableHeader' : 'tableCell'
  const align: unknown = editor.getAttributes(mark).align
  return align === 'left' || align === 'center' || align === 'right' ? align : null
}

/**
 * 给**整列**设对齐（`null` = 清除）。
 *
 * ## 为什么不能只对光标那一格 `setCellAttribute`
 *
 * `setCellAttr` 对**文本选区**只改光标所在的那一格
 * （`prosemirror-tables/dist/index.js:1671-1691`：只有选区是 `CellSelection`
 * 时才 `forEachCell`）。而 markdown 的列对齐**一列只有一个值**：分隔行
 * 是按列取第一个非空 `align` 序列化出来的
 * （`@tiptap/extension-table/dist/index.js:485-502`）。
 *
 * 于是只改一格会当场产生两处不一致——实测：给正文行的一格设 `align:center`
 * 之后，markdown 出来整列都是 `:---:`，而**表头格的 `align` 仍是 `null`**，
 * 界面接着读 `getAttributes('tableHeader').align` 会得到「没对齐」。
 *
 * 所以先造一个覆盖整列的 `CellSelection`，再设属性，最后把光标放回原处——
 * 全在一条链、一个事务里，中间态不会落到文档上，`undo` 也是一步。
 */
export function setColumnAlign(editor: Editor, align: ColumnAlign | null): boolean {
  const column = columnAt(editor)
  if (column === null) return false
  const { from, to } = editor.state.selection
  return runCommandChain(editor, [
    { name: 'setCellSelection', args: [column] },
    { name: 'setCellAttribute', args: ['align', align] },
    { name: 'setTextSelection', args: [{ from, to }] },
  ])
}

/**
 * 这里能插表格吗。
 *
 * ## 为什么走 `can()` 的**动态**读取
 *
 * 这个包不依赖 `@tiptap/extension-table`，所以那个包给 `Commands` /
 * `CanCommands` 做的类型增强**在这个包里不生效**（宿主那边生效，它的
 * `extensions.ts` 引了那个包）。写死属性名会在包里报「不存在」，而运行时是
 * 有的。属性名与参数在这里只写一次，`hasNode` 先保证方言里真有表格节点。
 *
 * ## 已经在表格里时判 false
 *
 * `insertTable` 在单元格里**能**跑（它会嵌一张表进去），而 markdown 表示不了
 * 嵌套表格——实测存一次得到 `| <br>1 |`，格子里的内容被压成一行、结构没了。
 * 所以这一条自己拦。
 *
 * 代码块里则**允许**：Tiptap 会把表格插到代码块外面的段落里（实测
 * `"```\n码\n```\n\n\n| ..."`），正是用户想要的。
 */
export function canInsertTable(editor: Editor): boolean {
  if (!hasNode(editor, 'table') || editor.isActive('table')) return false
  const can = editor.can() as unknown as {
    insertTable?: (options: { rows: number; cols: number; withHeaderRow: boolean }) => boolean
  }
  return (
    typeof can.insertTable === 'function' &&
    can.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
  )
}

/* ── 工具条状态 ────────────────────────────────────────────────── */

/** 行内标记。顺序就是「清除格式」检查的顺序 */
const MARK_NAMES = ['bold', 'italic', 'underline', 'strike', 'code'] as const
/** 「当前是」的节点 token：token → 节点名 */
const BLOCK_TOKENS: readonly (readonly [string, string])[] = [
  ['bullet', 'bulletList'],
  ['ordered', 'orderedList'],
  ['task', 'taskList'],
  ['quote', 'blockquote'],
  ['codeBlock', 'codeBlock'],
  ['table', 'table'],
]

/** 表格菜单各项的可用性：token → 命令名 */
const TABLE_CAPABILITY_TOKENS: readonly (readonly [string, string])[] = [
  ['rowBefore', 'addRowBefore'],
  ['rowAfter', 'addRowAfter'],
  ['colBefore', 'addColumnBefore'],
  ['colAfter', 'addColumnAfter'],
  ['delRow', 'deleteRow'],
  ['delCol', 'deleteColumn'],
  ['delTable', 'deleteTable'],
  ['header', 'toggleHeaderRow'],
]

/**
 * 选区里有可清除的标记吗。
 *
 * ## 为什么不用 `isActive(mark)`
 *
 * `isActive` 在**非空选区**上的语义是「整个选区都带这个标记」——选区跨过
 * 一段粗体和一段普通文字时它返回 false，而选区里明明有可清的东西
 * （实测：`**粗** 与 [链](https://a.b)` 全选之后五个 `isActive` 全是 false，
 * 于是「清除格式」按钮灰着，而它本该能清）。所以判据用 `rangeHasMark`：
 * 只要范围内**有一段**带这个标记就算。
 *
 * ## 为什么不用命令的返回值
 *
 * `unsetAllMarks` 在**空选区**上直接返回 true 而什么都不改（`@tiptap/core`
 * 的 `if (empty) return true`）。判据必须来自选区内容，不是命令的返回值。
 */
function hasClearableMarks(editor: Editor): boolean {
  const { from, to, empty } = editor.state.selection
  if (empty) return false
  const doc = editor.state.doc
  return MARK_NAMES.some((name) => {
    const type = editor.schema.marks[name]
    return type !== undefined && doc.rangeHasMark(from, to, type)
  })
}

/**
 * 工具条要的**全部**状态，一个字符串。
 *
 * 见文件顶部：状态 token 决定按钮亮不亮，能力 token 决定能不能点。
 * **一次 `editor.can()`**：它会把所有命令包成对象，一次事务里多调几次是
 * 白白的开销（表格那八条判据共用同一个）。
 */
export function toolbarStateOf(editor: Editor): string {
  const tokens: string[] = []
  const can = editor.can()

  /**
   * 读一条**能力**。用可选调用而不是直接 `can.undo()`：`can()` 是按
   * 扩展注册的命令拼出来的对象，方言里没有那条命令时它是 undefined——
   * 直接调会抛，而不是返回 false。
   */
  const maybe = (name: string): boolean => {
    const check = (can as unknown as Record<string, (() => boolean) | undefined>)[name]
    return typeof check === 'function' && check.call(can)
  }

  for (const name of MARK_NAMES) {
    if (hasMark(editor, name) && editor.isActive(name)) tokens.push(name)
  }
  for (const [token, nodeName] of BLOCK_TOKENS) {
    if (hasNode(editor, nodeName) && editor.isActive(nodeName)) tokens.push(token)
  }
  if (hasMark(editor, 'link') && editor.isActive('link')) tokens.push('link')

  tokens.push(`style:${paragraphStyleOf(editor) ?? 'none'}`)

  if (editor.state.selection.empty) tokens.push('emptySelection')
  if (maybe('undo')) tokens.push('undo')
  if (maybe('redo')) tokens.push('redo')
  if (hasClearableMarks(editor)) tokens.push('clear')

  const indent = indentStateOf(editor, can)
  if (indent.item !== null) tokens.push(`item:${indent.item}`)
  if (indent.canOutdent) tokens.push('outdent')
  if (indent.canIndent) tokens.push('indent')

  if (hasNode(editor, 'table') && editor.isActive('table')) {
    for (const [token, command] of TABLE_CAPABILITY_TOKENS) {
      if (maybe(command)) tokens.push(token)
    }
  }

  return tokens.join(' ')
}
