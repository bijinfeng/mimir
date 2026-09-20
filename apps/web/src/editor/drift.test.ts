// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { createExtensions } from './extensions.js'

function rt(md: string) {
  const e = new Editor({
    element: document.createElement('div'),
    extensions: createExtensions(),
    content: md,
    contentType: 'markdown',
  })
  const out = e.getMarkdown().trim()
  e.destroy()
  return out
}

/**
 * 所见即所得编辑器不是「无损」的，但必须是「幂等」的。
 *
 * 区别很关键：无损意味着文件一个字节都不变；幂等意味着第一次保存会把
 * 内容整理成编辑器的规范形，之后无论保存多少次都不再变化。
 *
 * 对使用的影响：可以作为唯一编辑器（不会逐次劣化），
 * 但不要用别的工具（Obsidian / VS Code）改同一个文件——
 * 两边各有一套规范形，来回改会产生大量无意义的 diff。
 */
describe('WYSIWYG 的规范形（canonical form）', () => {
  it('表格首次保存被补齐列宽，之后不再漂移', () => {
    const once = rt('| A | B |\n| --- | --- |\n| 1 | 2 |')

    // 规范形：单元格补齐到等宽，这是 Markdown 表格排版的正常行为
    expect(once).toBe('| A   | B   |\n| --- | --- |\n| 1   | 2   |')

    // 关键性质：稳定。第二次、第三次保存必须与第一次完全一致。
    expect(rt(once)).toBe(once)
    expect(rt(rt(once))).toBe(once)
  })

  it('正文段落无损', () => {
    const md = '纯向量检索会漏掉专有名词，纯关键词又漏语义。'
    expect(rt(md)).toBe(md)
  })
})
