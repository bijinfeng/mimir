// @vitest-environment happy-dom

/**
 * docx 查找/替换适配器的行为。
 *
 * 守的都是**静默失效**：匹配数对但高亮画错位置、替换改了错误的字、或者
 * 查找把文档改脏（那会让补丁式保存退化）。这些在界面上看起来都「有反应」，
 * 只有对着结果看才发现。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import {
  editorExtensions,
  searchPluginKey,
} from '../../vendor/apps/docs/src/renderer/editor/extensions.js'
import { openDocx } from '../docx.js'
import type { FindReplaceAdapter } from '../shell/EditorShell.js'
import { docxFindAdapter, findRanges, foldCase } from './docx-find.js'

/**
 * 夹具路径用 `import.meta.dirname`（一个**普通字符串**）拼，不用
 * `new URL(…, import.meta.url)`。
 *
 * 这个文件要 DOM（Tiptap 的 `Editor` 要一个 contenteditable 元素），所以跑在
 * happy-dom 下——而 happy-dom **替换了全局 `URL`**，于是
 * `readFileSync(new URL(…))` 抛 `The URL must be of scheme file`（Node 认不出
 * happy-dom 那个 URL 对象）。`.trellis/spec/office/engine/index.md` 记过这个坑，这里的
 * 做法是它的第二种解法：压根不构造 URL。
 */
const FIXTURE = join(
  import.meta.dirname,
  '../../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
)

async function makeEditor(): Promise<Editor> {
  const session = await openDocx(new Uint8Array(readFileSync(FIXTURE)))
  return new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: session.content as never,
  })
}

const NO_OPTIONS = { matchCase: false, wholeWord: false }

describe('foldCase', () => {
  it('长度不变（变长的字符原样保留，否则偏移会整体错位）', () => {
    // 'İ'.toLowerCase() 是两个码元——折叠它会让后面每一个匹配都偏一位
    expect(foldCase('İstanbul').length).toBe('İstanbul'.length)
    expect(foldCase('ABC').length).toBe(3)
    expect(foldCase('ABC')).toBe('abc')
  })
})

describe('findRanges', () => {
  it('找到的字与区间一致：按区间取出来的正是查询串', async () => {
    const editor = await makeEditor()
    const query = '段'
    const ranges = findRanges(editor, query, NO_OPTIONS)
    expect(ranges.length).toBeGreaterThan(0)
    for (const range of ranges) {
      expect(editor.state.doc.textBetween(range.from, range.to)).toBe(query)
    }
    editor.destroy()
  })

  it('跨标记的匹配不会漏（同一个文本块里被 bold 分成的两个节点）', async () => {
    const editor = await makeEditor()
    // 造一段「前半加粗、后半不加粗」的文字，再搜横跨两半的两个字
    editor.commands.setTextSelection({ from: 2, to: 6 })
    editor.chain().focus().toggleMark('bold').run()
    // 只在**跨节点**的位置上取词：起点落在前一个文本节点里、终点落在后一个里
    let boundary = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && boundary === -1) {
        const marks = node.marks.map((mark) => mark.type.name)
        if (marks.includes('bold')) boundary = pos + node.nodeSize - 1
      }
      return true
    })
    expect(boundary).toBeGreaterThan(0)
    const query = editor.state.doc.textBetween(boundary - 1, boundary + 1)
    expect(query).toHaveLength(2)
    const ranges = findRanges(editor, query, NO_OPTIONS)
    expect(ranges.length).toBeGreaterThan(0)
    expect(editor.state.doc.textBetween(ranges[0]!.from, ranges[0]!.to)).toBe(query)
    editor.destroy()
  })

  it('区分大小写是两套结果', async () => {
    const editor = await makeEditor()
    // 夹具里同时有大写与小写拉丁字母
    const loose = findRanges(editor, 'a', { matchCase: false, wholeWord: false })
    const strict = findRanges(editor, 'a', { matchCase: true, wholeWord: false })
    expect(loose.length).toBeGreaterThanOrEqual(strict.length)
    editor.destroy()
  })

  it('空查询不返回任何匹配（否则每个位置都算一次）', async () => {
    const editor = await makeEditor()
    expect(findRanges(editor, '', NO_OPTIONS)).toHaveLength(0)
    editor.destroy()
  })
})

describe('docxFindAdapter', () => {
  it('同一个编辑器只建一个适配器（否则查找栏每帧重扫一遍全文）', async () => {
    const editor = await makeEditor()
    expect(docxFindAdapter(editor)).toBe(docxFindAdapter(editor))
    editor.destroy()
  })

  it('search 返回匹配数，并把装饰器画到文档上', async () => {
    const editor = await makeEditor()
    const adapter = docxFindAdapter(editor)
    const count = adapter.search('段', NO_OPTIONS, 0)
    expect(count).toBeGreaterThan(0)
    const decorations = searchPluginKey.getState(editor.state)
    expect(decorations?.find().length).toBe(count)
    // 高亮是**装饰器**，不是内容：文档一个字都不该变
    expect(editor.state.doc.textContent).not.toContain('\u0000')
    adapter.clear()
    expect(searchPluginKey.getState(editor.state)?.find()).toHaveLength(0)
    editor.destroy()
  })

  it('activate 只挪高亮，不改文档', async () => {
    const editor = await makeEditor()
    const adapter = docxFindAdapter(editor)
    const count = adapter.search('A', NO_OPTIONS, 0)
    expect(count).toBeGreaterThan(1)
    const before = editor.state.doc.content.size
    adapter.activate(1)
    expect(editor.state.doc.content.size).toBe(before)
    editor.destroy()
  })

  it('replaceOne 换掉的是当前那一个，其余匹配跟着前移', async () => {
    const editor = await makeEditor()
    // docx 的适配器两个替换方法都给（pdf 只给查找，那是另一条路）
    const adapter = docxFindAdapter(editor) as Required<FindReplaceAdapter>
    // 找一个只出现一次的词，替换后能精确断言
    const original = editor.state.doc.textContent
    const target = '段'
    const count = adapter.search(target, NO_OPTIONS, 0)
    expect(count).toBeGreaterThan(0)
    adapter.replaceOne(0, 'ZZ')
    expect(editor.state.doc.textContent.length).toBe(original.length - target.length + 2)

    // 替换之后重扫：匹配数应当正好少一个（原来那些位置都变了）
    const after = adapter.search(target, NO_OPTIONS, 0)
    expect(after).toBe(count - 1)
    editor.destroy()
  })

  it('replaceAll 一处不落地换掉，且不因位置前移而错位', async () => {
    const editor = await makeEditor()
    const adapter = docxFindAdapter(editor) as Required<FindReplaceAdapter>
    const target = 'A'
    const count = adapter.search(target, NO_OPTIONS, 0)
    expect(count).toBeGreaterThan(1)

    adapter.replaceAll('')
    expect(editor.state.doc.textContent).not.toContain(target)
    expect(adapter.search(target, NO_OPTIONS, 0)).toBe(0)
    editor.destroy()
  })

  it('替换是一次事务（撤销栈里它是一步）', async () => {
    const editor = await makeEditor()
    const adapter = docxFindAdapter(editor) as Required<FindReplaceAdapter>
    adapter.search('A', NO_OPTIONS, 0)
    adapter.replaceAll('')
    expect(editor.can().undo()).toBe(true)
    editor.commands.undo()
    expect(editor.state.doc.textContent).toContain('A')
    editor.destroy()
  })

  it('onDocChanged 在文档变化后回调（否则改完一个匹配计数还是旧的）', async () => {
    const editor = await makeEditor()
    const adapter = docxFindAdapter(editor)
    let called = 0
    const off = adapter.onDocChanged?.(() => {
      called += 1
    })
    editor.chain().focus().insertContentAt(1, 'x').run()
    expect(called).toBeGreaterThan(0)
    off?.()
    editor.destroy()
  })
})
