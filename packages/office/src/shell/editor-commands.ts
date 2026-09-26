/**
 * 工具条命令的能力检测与调用。
 *
 * ## 为什么需要「检测」
 *
 * Tiptap 的 `chain()` 是**惰性**的：调一个**不存在**的命令不会报错——那一步
 * 什么都不做，`run()` 照样返回 true。实测症状是「点了加粗，没有反应，也不报错」
 * （docx 编辑器踩过一次：它用的是 `toggleMark`，而扩展提供的是 `toggleBold`）。
 *
 * 三种编辑器共用这个模块，但**它们的方言不同**：markdown 用 StarterKit 那一套
 * （`bulletList` / `heading` / …），docx 用 vendored 引擎自己定义的
 * （`docListItem` / `docParagraph` / …）。所以工具条不能假定某个节点或命令一定
 * 存在——不存在时按钮应该是**禁用的**，而不是留一个点了没反应的按钮
 * （`docs/DESIGN.md` §7.4 禁止的东西）。
 *
 * ## 三层检测，按可靠性排序
 *
 * | 检测 | 用于 | 为什么可靠 |
 * |---|---|---|
 * | `hasMark` / `hasNode` | 「这个方言有没有这个类型」 | 读 schema——注册了就一定有 |
 * | `hasCommand` | 「有没有这个命令」 | 读链式对象上的属性 |
 *
 * 优先用 schema：节点/标记在 schema 里，对应的 `toggle*` 命令才会注册；
 * 反过来不一定成立。schema 是**结构**，命令是**行为**，结构更稳定。
 */

import type { Editor } from '@tiptap/core'

/** 惰性链的结构视图。`run()` 才真正执行 */
type LazyChain = Record<string, (...args: never[]) => { run: () => boolean }>

export function hasMark(editor: Editor, name: string): boolean {
  return editor.schema.marks[name] !== undefined
}

export function hasNode(editor: Editor, name: string): boolean {
  return editor.schema.nodes[name] !== undefined
}

export function hasCommand(editor: Editor, name: string): boolean {
  const chain = editor.chain() as unknown as LazyChain
  return typeof chain[name] === 'function'
}

/**
 * 跑一条命令。
 *
 * **一定要 `.focus()` 在前、`.run()` 在后**：不聚焦的话第一次点击只移动焦点、
 * 命令作用不到选区；链式调用是惰性的，不 run 等于没写。
 *
 * 返回 false 表示命令不存在——调用方据此决定要不要提示（而不是当成功）。
 */
export function runCommand(editor: Editor, name: string, ...args: unknown[]): boolean {
  const chain = editor.chain().focus() as unknown as LazyChain
  const fn = chain[name] as ((...a: unknown[]) => { run: () => boolean }) | undefined
  if (typeof fn !== 'function') return false
  return fn.call(chain, ...args).run()
}

/**
 * 切换一个标记（加粗、斜体……）。
 *
 * 用 `toggleMark('bold')` 而不是 `toggleBold()`：**后者是扩展提供的便捷命令**，
 * 而 `toggleMark` 是 core 的命令——它对任何注册了同名 mark 的方言都成立。
 * 这也是上面那个「点了没反应」的教训。
 */
export function toggleMarkByName(editor: Editor, name: string): void {
  runCommand(editor, 'toggleMark', name)
}
