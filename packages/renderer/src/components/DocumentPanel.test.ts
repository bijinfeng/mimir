import { describe, expect, it } from 'vitest'
import { findPreferredSnippetPosition } from './DocumentPanel'

describe('findPreferredSnippetPosition', () => {
  it('uses the source offset to distinguish repeated text', () => {
    const source = '第一节\n共同片段\n第二节\n共同片段'
    const rendered = '第一节共同片段第二节共同片段'

    expect(
      findPreferredSnippetPosition(rendered, source, '共同片段', source.lastIndexOf('共同片段')),
    ).toBe(rendered.lastIndexOf('共同片段'))
  })

  it('accounts for Markdown syntax when comparing source and rendered text', () => {
    const source = '# 开头\n**重复内容**\n# 结尾\n**重复内容**'
    const rendered = '开头重复内容结尾重复内容'

    expect(
      findPreferredSnippetPosition(rendered, source, '重复内容', source.lastIndexOf('重复内容')),
    ).toBe(rendered.lastIndexOf('重复内容'))
  })

  it('does not highlight a different occurrence if the intended one is missing', () => {
    const source = '共同片段。共同片段'
    expect(
      findPreferredSnippetPosition('共同片段', source, '共同片段', source.lastIndexOf('共同片段')),
    ).toBe(-1)
  })
})
