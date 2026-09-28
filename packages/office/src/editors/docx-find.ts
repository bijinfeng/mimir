/**
 * docx 的查找 / 替换适配器：把 `FindReplaceBar`（外壳）接到 ProseMirror 文档上。
 *
 * ## 为什么自己写匹配，而不是用浏览器或上游的 FindPanel
 *
 * 上游有一个 `FindPanel`，但它是一个**完整的界面组件**（输入框、按钮、防抖、
 * 自己的状态机），而且它的匹配逻辑写死在组件内部。mimir 的外壳只有一条查找栏
 * （`FindReplaceBar`），它要的是一个**适配器**：`search` 返回几个匹配、
 * `activate` 挪到第几个、`replaceOne` 换掉第几个。所以界面用外壳那条，
 * 匹配与高亮在这里实现——与 html 那边（`cmFindTarget` 现成可用）同一分层。
 *
 * ## 高亮走装饰器，不改文档
 *
 * 匹配结果通过 `setMeta(searchPluginKey, { ranges, activeIndex })` 交给
 * vendored 的 `SearchHighlightExtension`（`decoration-extensions.ts:27`），
 * 由它画成 `.search-hit` 装饰。**装饰器不是内容**——所以查找不会把文档改脏、
 * 不进撤销栈、不影响补丁式保存的逐块比对。这正是不能自己往文档里插标记的原因。
 *
 * ## 为什么按「块内的平铺文本」找
 *
 * 直接 `doc.textBetween()` 拿不到每个字符的位置；逐个文本节点找又会让
 * **跨标记的匹配**永远搜不到——`in**for**mation` 里的 `in` 和 `formation`
 * 是两个文本节点（中间夹着 bold mark），光标选中它们时看起来是一段文字，
 * 但逐个节点比对会漏掉。所以把一个文本块的行内内容拼成一条字符串、同时记下
 * 每个字符对应的文档位置，再在这条字符串上 `indexOf`。
 *
 * 叶子节点（分页符、图片、脚注引用）也各占一个位置，用一个永不匹配的替身字符
 * 占位（`\u0000`）——不占位的话它前后的字符位置会算错一位。
 */

import type { Editor } from '@tiptap/core'
import { searchPluginKey } from '../../vendor/apps/docs/src/renderer/editor/extensions.js'
import type { FindOptions } from '../shims/ui.js'
import type { FindReplaceAdapter } from '../shell/EditorShell.js'

/** 文档里的一个匹配（`to` 不含） */
export interface FindRange {
  from: number
  to: number
}

/**
 * 大小写折叠，**且长度不变**。
 *
 * `'İ'.toLowerCase()` 在 JS 里是 `'i̇'`（两个码元）——折叠之后字符串变长，
 * 偏移就整体错位了，症状是「匹配数对、高亮画到旁边一个字上」。所以变长的
 * 字符原样保留：它参与不了大小写不敏感的匹配，但绝不会让别处的偏移漂移。
 */
export function foldCase(text: string): string {
  let out = ''
  for (const ch of text) {
    const lower = ch.toLowerCase()
    out += lower.length === ch.length ? lower : ch
  }
  return out
}

/** 全词匹配的「词字符」：字母、数字、下划线（与上游 find-panel.tsx 同一个判据） */
const isWordChar = (ch: string | undefined): boolean =>
  ch !== undefined && /[\p{L}\p{N}_]/u.test(ch)

/**
 * 在可编辑的文本块里找出所有匹配。
 *
 * 保护块（`docProtected`，图片/域代码那些）不进这个循环：它们的文字不是
 * 用户能编辑的内容，高亮画上去也没法替换。
 */
export function findRanges(editor: Editor, query: string, options: FindOptions): FindRange[] {
  const found: FindRange[] = []
  if (query === '') return found
  const needle = options.matchCase ? query : foldCase(query)

  editor.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = ''
    const at: number[] = []
    node.forEach((child, offset) => {
      if (child.isText && child.text !== undefined) {
        for (let i = 0; i < child.text.length; i += 1) at.push(pos + 1 + offset + i)
        text += child.text
      } else {
        // 叶子（硬换行、行内图片、脚注引用）：只占位，不参与匹配
        at.push(pos + 1 + offset)
        text += '\u0000'
      }
    })
    const haystack = options.matchCase ? text : foldCase(text)
    let index = haystack.indexOf(needle)
    while (index !== -1) {
      const whole =
        !options.wholeWord ||
        (!isWordChar(text[index - 1]) && !isWordChar(text[index + query.length]))
      if (whole) {
        const from = at[index]
        const to = at[index + query.length - 1]
        // 只可能在这两种情况下取不到（块内容被并发改动）——宁可少一个匹配，
        // 也不要推一个 `from > to` 的区间给装饰器（那会抛在 dispatch 里）
        if (from === undefined || to === undefined) break
        found.push({ from, to: to + 1 })
        index = haystack.indexOf(needle, index + query.length)
      } else {
        index = haystack.indexOf(needle, index + 1)
      }
    }
    return false
  })
  return found
}

/**
 * 建一个适配器。**每个编辑器实例只有一个**（见下面的 WeakMap 缓存）。
 *
 * 为什么必须缓存：`FindReplaceBar` 的 effect 把 `adapter` 放进了依赖数组，
 * 每次渲染都新建一个对象就等于那个 effect 每次都重跑——重新扫描、重新
 * `setMeta`、重新 publish。它不会报错，只是白白地每帧做一遍全文扫描。
 * 用 WeakMap 而不是 `useMemo`：这个对象按「哪个编辑器」缓存，而不是按
 * 「哪一次渲染」，实例换了自然换新对象，也不需要调用方多写一个 hook。
 */
const adapters = new WeakMap<Editor, FindReplaceAdapter>()

export function docxFindAdapter(editor: Editor): FindReplaceAdapter {
  const cached = adapters.get(editor)
  if (cached !== undefined) return cached

  /** 当前这份匹配。`activate` 只挪下标，所以要留着 */
  let ranges: FindRange[] = []

  const highlight = (activeIndex: number): void => {
    if (editor.isDestroyed) return
    editor.view.dispatch(editor.state.tr.setMeta(searchPluginKey, { ranges, activeIndex }))
  }

  const adapter: FindReplaceAdapter = {
    search(query: string, options: FindOptions, activeIndex: number): number {
      ranges = findRanges(editor, query, options)
      const active = ranges.length === 0 ? 0 : Math.min(activeIndex, ranges.length - 1)
      highlight(active)
      return ranges.length
    },

    activate(index: number): void {
      const range = ranges[index]
      if (range === undefined) return
      highlight(index)
      if (editor.isDestroyed) return
      // 滚进视野。`domAtPos` 给的是**文本节点**，要用它的元素父级去滚
      const { node } = editor.view.domAtPos(range.from)
      const element = node instanceof HTMLElement ? node : node.parentElement
      element?.scrollIntoView({ block: 'center' })
    },

    clear(): void {
      ranges = []
      highlight(0)
    },

    onDocChanged(listener: () => void): () => void {
      editor.on('update', listener)
      return () => editor.off('update', listener)
    },

    replaceOne(index: number, replacement: string): void {
      const range = ranges[index]
      if (range === undefined || editor.isDestroyed) return
      // 替换是**一次事务**：撤销栈里它是一步，不会出现「撤一半」的中间态
      editor.view.dispatch(editor.state.tr.insertText(replacement, range.from, range.to))
    },

    replaceAll(replacement: string): void {
      if (ranges.length === 0 || editor.isDestroyed) return
      const tr = editor.state.tr
      // **从后往前**：每替换一处，后面匹配的位置都会前移，倒着来才不用重新映射
      for (const range of ranges.toReversed()) tr.insertText(replacement, range.from, range.to)
      editor.view.dispatch(tr)
    },
  }

  adapters.set(editor, adapter)
  return adapter
}
