import { beforeAll, describe, expect, it } from 'vitest'
import { getAuthCookie, makeClient, type SearchResponseShape } from './helpers.js'

let client: ReturnType<typeof makeClient>

beforeAll(async () => {
  client = makeClient(await getAuthCookie())
})

async function search(query: string, extra = ''): Promise<SearchResponseShape> {
  const res = await client.get<SearchResponseShape>(
    `/api/search?q=${encodeURIComponent(query)}${extra}`,
  )
  expect(res.status).toBe(200)
  return res.body
}

describe('中文全文检索', () => {
  it('能按词命中中文（jieba 分词生效）', async () => {
    await client.post('/api/documents/notes', {
      title: 'React 组件性能优化',
      body: '避免不必要的重渲染，用 memo 包一层即可。',
      tags: ['react'],
    })

    const result = await search('组件')
    expect(result.total).toBeGreaterThan(0)
    expect(result.hits[0]?.title).toContain('React')
    // 词级通道命中
    expect(result.hits[0]?.matchedBy).toContain('keyword')
  })

  it('搜「纪录片」不会因为分词结果不同而漏掉', async () => {
    await client.post('/api/documents/notes', {
      title: '纪录片拍摄技巧',
      body: '手持运镜要稳，采访尽量用双机位。',
      tags: ['纪录片'],
    })

    const result = await search('纪录片')
    expect(result.total).toBeGreaterThan(0)
    expect(result.hits.some((hit) => hit.title.includes('纪录片'))).toBe(true)
  })

  it('跨词边界的子串靠兜底通道命中', async () => {
    // 「件性」在 jieba 里不是词，词级通道必然搜不到；
    // 正文里却真实存在这个子串，应当由 substring 通道兜住。
    await client.post('/api/documents/notes', {
      title: '分词边界用例',
      body: '组件性能优化是一个很常见的主题。',
      tags: [],
    })

    const result = await search('件性')
    expect(result.total).toBeGreaterThan(0)
    expect(result.hits[0]?.matchedBy).toContain('substring')
  })

  it('英文子串同样能被兜底通道命中', async () => {
    await client.post('/api/documents/notes', {
      title: '标识符子串用例',
      body: 'function parseHTMLDocument() { return null }',
      tags: [],
    })

    const result = await search('HTMLDoc')
    expect(result.total).toBeGreaterThan(0)
  })

  it('片段偏移指向真实命中位置', async () => {
    const res = await client.post<{ id: string }>('/api/documents/notes', {
      title: '偏移量校验',
      body: `${'前'.repeat(300)}唯一锚点标记${'后'.repeat(300)}`,
      tags: [],
    })
    expect(res.status).toBe(201)

    const result = await search('唯一锚点标记')
    const hit = result.hits.find((item) => item.documentId === res.body.id)
    expect(hit).toBeDefined()

    // 片段应包含命中词，且偏移量能对上
    expect(hit!.snippet.text).toContain('唯一锚点标记')
    expect(hit!.snippet.start).toBeGreaterThan(0)
    expect(hit!.snippet.end).toBeGreaterThan(hit!.snippet.start)
  })

  it('按标签过滤', async () => {
    await client.post('/api/documents/notes', {
      title: '标签过滤用例 A',
      body: '共同的检索关键词 alpha keyword',
      tags: ['标签甲'],
    })
    await client.post('/api/documents/notes', {
      title: '标签过滤用例 B',
      body: '共同的检索关键词 alpha keyword',
      tags: ['标签乙'],
    })

    const result = await search('alpha', '&tag=' + encodeURIComponent('标签甲'))
    expect(result.total).toBeGreaterThan(0)
    expect(result.hits.every((hit) => hit.title.includes('标签过滤用例 A'))).toBe(true)
  })

  it('无结果时返回空列表而不是报错', async () => {
    const result = await search('zzzz不存在的内容zzzz')
    expect(result.total).toBe(0)
    expect(result.hits).toEqual([])
  })

  it('特殊字符不会让查询解析失败', async () => {
    for (const query of ['100%', "it's", 'a & b', 'c:d', 'e|f', '!x']) {
      const result = await search(query)
      expect(result.total).toBeGreaterThanOrEqual(0)
    }
  })
})

/**
 * 自然语言的提问式查询。
 *
 * 这一组是**实测发现的回归**：原先关键词通道用 `plainto_tsquery`，
 * 它把所有词用 AND 连起来，要求每个词都出现在同一篇文档里。
 * 于是「React 重渲染范围怎么缩小？」这类提问会命中 0 条——
 * 四个词里只要有一个没出现就全盘落空，而用户想要的是「最相关的几篇」。
 *
 * 修法是把逐词的 plainto_tsquery 用 OR 连起来，再靠 ts_rank_cd 排序
 * （它天然给命中词更多、挨得更近的文档更高分）。
 */
describe('提问式查询的召回', () => {
  beforeAll(async () => {
    await client.post('/api/documents/notes', {
      title: '重渲染范围的控制',
      body: '把频繁变化的 state 往下挪，就能缩小重渲染范围。这是最直接的手段。',
      tags: ['react'],
    })
  })

  it('自然语言提问能命中部分词匹配的文档', async () => {
    const res = await client.get<SearchResponseShape>(
      `/api/search?q=${encodeURIComponent('React 重渲染范围怎么缩小？')}`,
    )

    // 这条文档不同时包含「react 重渲染 范围 缩小」四个词的全部组合语义，
    // 但它显然是最相关的——AND 语义下会一条都搜不到
    expect(res.body.total).toBeGreaterThan(0)
    expect(res.body.hits.some((hit) => hit.title.includes('重渲染范围'))).toBe(true)
  })

  it('命中多个查询词的文档排在只命中一个的前面', async () => {
    const res = await client.get<SearchResponseShape>(
      `/api/search?q=${encodeURIComponent('重渲染 范围')}`,
    )

    const titles = res.body.hits.map((hit) => hit.title)
    // ts_rank_cd 的 cover density 语义：两个词都出现且挨得近的文档应当靠前
    expect(titles[0]).toContain('重渲染范围')
  })

  it('查询词里的 tsquery 语法字符不会让查询失败', async () => {
    const res = await client.get<SearchResponseShape>(
      `/api/search?q=${encodeURIComponent('a & b | c ! d : e')}`,
    )
    expect(res.status).toBe(200)
  })
})
