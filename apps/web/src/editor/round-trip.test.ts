// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { createExtensions } from './extensions.js'

/**
 * Markdown 往返保真度测试 —— 针对**真实**扩展配置。
 *
 * 这是前端最需要盯住的地方：所见即所得编辑器一旦不能无损还原 Markdown，
 * 用户手写的内容就会在每次打开/保存之间被悄悄改写。断言直接覆盖
 * 「Markdown → 编辑器 → Markdown」这一整圈。
 */

function roundTrip(markdown: string): string {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: createExtensions(),
    content: markdown,
    contentType: 'markdown',
  })

  const output = editor.getMarkdown()
  editor.destroy()
  return normalize(output)
}

/**
 * 只比较语义，忽略无意义的空白差异。
 *
 * 表格是唯一需要额外处理的：序列化器会把单元格补齐到等宽（`| 1   |`），
 * 这是 Markdown 表格排版的正常行为，不影响语义。所以对表格行做列宽归一化。
 */
function normalize(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => {
      const trimmed = line.trimEnd()
      if (!trimmed.startsWith('|')) return trimmed
      return trimmed
        .split('|')
        .map((cell) => cell.trim())
        .join(' | ')
        .trim()
    })
    .join('\n')
    .trim()
}

describe('Markdown 往返保真', () => {
  const cases: { name: string; markdown: string }[] = [
    { name: '中文标题与段落', markdown: '# React 组件性能优化\n\n用 memo 包一层即可避免重渲染。' },
    { name: '无序列表', markdown: '## 要点\n\n- 第一项\n- 第二项' },
    { name: '有序列表', markdown: '1. 步骤一\n2. 步骤二' },
    { name: '围栏代码块', markdown: '```ts\nconst a: number = 1\n```' },
    { name: '行内代码与粗体', markdown: '使用 `useMemo` 可以**显著**减少计算。' },
    { name: '引用块', markdown: '> 这是一段引用' },
    { name: '链接', markdown: '参考 [TanStack AI](https://tanstack.com/ai)。' },
    { name: '分隔线', markdown: '上文\n\n---\n\n下文' },
    { name: '代码块中的中文注释', markdown: '```js\n// 中文注释\nconst 名称 = "值"\n```' },
    { name: '表格', markdown: '| 列 A | 列 B |\n| --- | --- |\n| 1 | 2 |' },
    { name: '嵌套列表', markdown: '- 一级\n  - 二级\n  - 二级二' },
  ]

  for (const testCase of cases) {
    it(`原样保留：${testCase.name}`, () => {
      expect(roundTrip(testCase.markdown)).toBe(normalize(testCase.markdown))
    })
  }

  it('两次往返结果稳定（不会逐次劣化）', () => {
    const input = '# 标题\n\n正文 `code` 与 [链接](https://example.com)。\n\n- a\n- b'
    const once = roundTrip(input)
    expect(roundTrip(once)).toBe(once)
  })

  it('空文档不报错', () => {
    expect(() => roundTrip('')).not.toThrow()
  })
})
