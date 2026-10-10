import { describe, expect, it } from 'vitest'
import { chunkId, chunkText, type Chunk } from '../lib/chunk.js'

/**
 * 分块器的四类断言（`.trellis/spec/project/architecture.md` §9.5）。
 *
 * 这一组不是「测函数返回值」——它们守的是**引用能不能跳回原文**这件事：
 *
 * | 断言 | 它防的静默错误 |
 * |---|---|
 * | 偏移可逆 | 切错一个字符，高亮就偏了，而且不报错 |
 * | 确定性 | chunk id 不确定 → 每次重建索引插一批新向量，表持续膨胀 |
 * | 覆盖完整 | 有段落被漏掉 → 那部分永远搜不到，且没有任何症状 |
 * | 按结构切 | 代码块被切开 / 标题路径错 |
 */

const options = { size: 200, overlap: 40 }

/** 把各块的区间合并，返回是否严丝合缝覆盖 [0, length) */
function coversFully(chunks: Chunk[], length: number): boolean {
  if (chunks.length === 0) return length === 0
  let cursor = 0
  for (const chunk of chunks) {
    if (chunk.start > cursor) return false
    cursor = Math.max(cursor, chunk.end)
  }
  return cursor === length
}

describe('分块：偏移可逆', () => {
  const bodies = [
    '# 标题\n\n第一段。\n\n第二段，带 `代码` 与**加粗**。\n',
    '没有标题的一段话。\n\n再来一段。\n',
    '# A\n\n```js\nconst x = 1\n\nconst y = 2\n```\n\n尾部段落。\n',
    '```\n未闭合的代码块\n',
    '# 一层\n\n段落甲。\n\n## 二层\n\n段落乙。\n\n### 三层\n\n段落丙。\n',
    '一句话。'.repeat(500),
    '',
    '\n\n\n',
    `${'长段落。'.repeat(200)}\n\n# 标题\n\n${'另一段。'.repeat(200)}`,
  ]

  for (const [index, body] of bodies.entries()) {
    it(`第 ${index} 份正文：body.slice(start, end) === content`, () => {
      const chunks = chunkText(body, options, 'doc-1')
      for (const chunk of chunks) {
        expect(body.slice(chunk.start, chunk.end)).toBe(chunk.content)
      }
    })
  }
})

describe('分块：确定性', () => {
  it('同一正文跑两次得到逐字节相同的分块与 id', () => {
    const body = '# 标题\n\n第一段内容。\n\n第二段内容，长一点，用来产生跨块的候选。\n'.repeat(20)
    const first = chunkText(body, options, 'doc-1')
    const second = chunkText(body, options, 'doc-1')

    expect(second).toEqual(first)
    expect(first.map((chunk) => chunk.id)).toEqual(first.map((_, i) => chunkId('doc-1', i)))
  })

  it('id 只由文档 id 与序号决定，与内容无关', () => {
    expect(chunkText('甲', options, 'd').at(0)?.id).toBe('d:0')
    expect(chunkText('乙', options, 'd').at(0)?.id).toBe('d:0')
  })
})

describe('分块：覆盖完整', () => {
  const bodies = [
    '# 标题\n\n第一段。\n\n\n\n第二段。\n',
    '段一。\n\n```\ncode\n```\n\n段二。\n',
    '  前后有空白的正文  \n',
    '# A\n\n## B\n\n### C\n\n内容。\n\n# D\n\n更多。\n',
    '一个字',
  ]

  for (const [index, body] of bodies.entries()) {
    it(`第 ${index} 份正文：各块区间并集等于正文`, () => {
      const chunks = chunkText(body, options, 'doc-1')
      expect(coversFully(chunks, body.length)).toBe(true)
    })
  }

  it('空正文不产生块（而不是产生一个空块）', () => {
    expect(chunkText('', options, 'doc-1')).toEqual([])
  })

  it('极小的 size 也不会死循环或丢内容', () => {
    const body = '甲乙丙丁戊己庚辛壬癸。'.repeat(30)
    const chunks = chunkText(body, { size: 5, overlap: 2 }, 'doc-1')

    expect(coversFully(chunks, body.length)).toBe(true)
    for (const chunk of chunks) {
      expect(body.slice(chunk.start, chunk.end)).toBe(chunk.content)
    }
  })
})

describe('分块：按结构切', () => {
  it('代码块不会被从中间切开', () => {
    const body = `# 示例\n\n说明文字。\n\n\`\`\`js\n${'const value = 1\n'.repeat(30)}\`\`\`\n\n尾部。\n`
    const chunks = chunkText(body, options, 'doc-1')

    const codeChunks = chunks.filter((chunk) => chunk.content.includes('const value = 1'))
    // 代码块整体落在一个块里（超出 size 也不切碎）
    expect(codeChunks.length).toBe(1)
    expect(codeChunks[0]!.content).toContain('const value = 1')
  })

  it('heading 是层级路径，不是单个标题', () => {
    const body = '# 部署\n\n总览。\n\n## 已知坑\n\n坑的细节。\n\n## 另一节\n\n别的。\n'
    const chunks = chunkText(body, { size: 30, overlap: 0 }, 'doc-1')

    const headings = chunks.map((chunk) => chunk.heading)
    expect(headings).toContain('部署 / 已知坑')
    expect(headings).toContain('部署 / 另一节')
    // 出栈正确：第二个 `##` 之后不会还带着「已知坑」
    expect(headings.some((heading) => heading === '部署 / 已知坑 / 另一节')).toBe(false)
  })

  it('标题开启新的一节（默认 size 下每个标题有自己的块）', () => {
    const body = `# 一\n\n${'内容甲。'.repeat(40)}\n\n# 二\n\n${'内容乙。'.repeat(40)}\n`
    const chunks = chunkText(body, options, 'doc-1')

    // 超长正文里，第二节的开头不应与第一节挤在同一个块——
    // 标题是天然的边界（§4.9）。允许「上一块的尾块跨过标题」这种
    // 累积边界情况存在，但至少有一块的 heading 是「二」且含内容乙
    const secondSection = chunks.filter((chunk) => chunk.content.includes('内容乙。'))
    expect(secondSection.length).toBeGreaterThan(0)
    expect(secondSection.every((chunk) => chunk.heading === '二')).toBe(true)
  })

  it('超长段落优先在句末标点处切', () => {
    const body = '第一句话。第二句话。第三句话。第四句话。第五句话。第六句话。'
    const chunks = chunkText(body, { size: 12, overlap: 0 }, 'doc-1')

    // 每一块（除末块）结束在标点上，而不是硬切在字中间
    for (const chunk of chunks.slice(0, -1)) {
      expect('。！？；…\n').toContain(chunk.content.at(-1))
    }
  })

  it('相邻块有重叠，且重叠来自上一块的尾部', () => {
    const body = '甲部分内容在这里。'.repeat(40)
    const chunks = chunkText(body, { size: 60, overlap: 20 }, 'doc-1')

    expect(chunks.length).toBeGreaterThan(1)
    for (let i = 1; i < chunks.length; i += 1) {
      const previous = chunks[i - 1]!
      const current = chunks[i]!
      // 本块的起点落进上一块的区间里 = 有重叠
      expect(current.start).toBeLessThan(previous.end)

      // 重叠的那一段字符，两块的文本里完全一致（它取自正文同一处）
      const overlapLength = previous.end - current.start
      expect(current.content.slice(0, overlapLength)).toBe(
        previous.content.slice(previous.content.length - overlapLength),
      )
    }
  })
})
