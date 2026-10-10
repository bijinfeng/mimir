import { beforeAll, describe, expect, it } from 'vitest'
import { app, getAuthCookie, makeClient } from './helpers.js'

/**
 * 目录、双链、会话、导出。
 *
 * 这几块有一个共同点：**它们都是派生数据**（目录由 folder 字段派生、
 * 双链由正文解析、会话引用由 citations 登记）。派生数据最容易出的问题是
 * 「写进去了但读不出来」或「删了但没清理」，所以每个测试都从写入走到读取。
 */

let client: ReturnType<typeof makeClient>

beforeAll(async () => {
  client = makeClient(await getAuthCookie())
})

describe('目录树', () => {
  let aId = ''
  let bId = ''

  it('归入目录后能按目录筛出来', async () => {
    const a = await client.post<{ id: string }>('/api/documents/notes', {
      title: '前端性能清单',
      body: '先量再优化。Profiler 指到哪就改哪，凭直觉加 useMemo 只是让代码更难读。',
      tags: [],
    })
    const b = await client.post<{ id: string }>('/api/documents/notes', {
      title: 'React 渲染笔记',
      body: '列表 key 必须稳定。用下标当 key 等于放弃复用，重渲染范围会失控。',
      tags: [],
    })
    aId = a.body.id
    bId = b.body.id

    const patched = await client.patch<{ folder: string }>(`/api/documents/${aId}`, {
      folder: '技术/前端/React',
    })
    expect(patched.body.folder).toBe('技术/前端/React')

    await client.patch(`/api/documents/${bId}`, { folder: '技术/数据库' })

    const tree = await client.get<{
      items: { path: string; name: string; count: number; children: unknown[] }[]
    }>('/api/folders')

    const tech = tree.body.items.find((node) => node.name === '技术')
    expect(tech).toBeDefined()
    // 父目录的计数必须包含子目录，否则「技术」会显示 0 而子目录有内容
    expect(tech?.count).toBe(2)
  })

  it('选中父目录能带出子目录里的文档', async () => {
    const list = await client.get<{ items: { id: string }[] }>(
      '/api/documents?folder=%E6%8A%80%E6%9C%AF',
    )
    const ids = list.body.items.map((item) => item.id)
    expect(ids).toContain(aId)
    expect(ids).toContain(bId)
  })

  it('传空串表示移出目录，而不是「不修改」', async () => {
    const patched = await client.patch<{ folder: string | null }>(`/api/documents/${bId}`, {
      folder: '',
    })
    expect(patched.body.folder).toBeNull()
  })

  it('目录写进文件 frontmatter，重建索引后不丢', async () => {
    await client.patch(`/api/documents/${aId}`, { folder: '技术/前端/React' })

    const reindex = await client.post<{ updated: number }>('/api/maintenance/reindex', {})
    expect(reindex.status).toBe(200)

    const doc = await client.get<{ folder: string | null }>(`/api/documents/${aId}`)
    expect(doc.body.folder).toBe('技术/前端/React')
  })
})

describe('双链', () => {
  let sourceId = ''
  let targetId = ''

  it('正文里的站内链接成为出链，反向查询得到反链', async () => {
    const target = await client.post<{ id: string }>('/api/documents/notes', {
      title: '被引用的笔记',
      body: '这是被别的笔记引用的目标。内容是 RAG 混合检索的取舍。',
      tags: [],
    })
    targetId = target.body.id

    const source = await client.post<{ id: string }>('/api/documents/notes', {
      title: '引用别人的笔记',
      body: `参考了 [被引用的笔记](/doc/${targetId}) 里的做法，再补上向量通道。`,
      tags: [],
    })
    sourceId = source.body.id

    // 出链：这篇指向谁
    const sourceDoc = await client.get<{ links: { sources: { id: string }[] } }>(
      `/api/documents/${sourceId}`,
    )
    expect(sourceDoc.body.links.sources.map((item) => item.id)).toContain(targetId)

    // 反链：谁指向这篇。这是「让双向链接是双向的」的那一半
    const targetDoc = await client.get<{ links: { backlinks: { id: string }[] } }>(
      `/api/documents/${targetId}`,
    )
    expect(targetDoc.body.links.backlinks.map((item) => item.id)).toContain(sourceId)
  })

  it('改写正文去掉链接后，反链随之消失', async () => {
    await client.patch(`/api/documents/${sourceId}`, {
      body: '这篇已经不再引用别人了，只是普通正文。',
    })

    const targetDoc = await client.get<{ links: { backlinks: { id: string }[] } }>(
      `/api/documents/${targetId}`,
    )
    expect(targetDoc.body.links.backlinks.map((item) => item.id)).not.toContain(sourceId)
  })

  it('指向不存在的文档不会让保存失败，也不写进链接表', async () => {
    const res = await client.patch(`/api/documents/${sourceId}`, {
      body: '指向一个不存在的 id：[幽灵](/doc/does-not-exist-12345)',
    })
    expect(res.status).toBe(200)

    const doc = await client.get<{ links: { sources: { id: string }[] } }>(
      `/api/documents/${sourceId}`,
    )
    expect(doc.body.links.sources).toHaveLength(0)
  })
})

describe('建议标签', () => {
  it('从正文里给出高频词，且排除已有标签', async () => {
    const created = await client.post<{ id: string }>('/api/documents/notes', {
      title: 'pgvector 混合检索',
      body: [
        '混合检索需要同时处理关键词与向量两路召回。',
        '向量检索擅长语义，但对专有名词无能为力。',
        '所以混合检索的融合层不能只看分数，要看名次。',
      ].join('\n'),
      tags: ['向量'],
    })

    const res = await client.get<{ items: string[] }>(
      `/api/documents/${created.body.id}/suggested-tags`,
    )
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.items)).toBe(true)
    // 已有标签不再重复建议——否则用户点一下发现「已经有了」
    expect(res.body.items).not.toContain('向量')
    // 停用词不能出现在建议里：「所以」「需要」这类词出现在每篇文章里，区分度为零
    expect(res.body.items).not.toContain('所以')
    expect(res.body.items).not.toContain('需要')
  })
})

describe('会话与问答', () => {
  it('提问落库，刷新后会话与消息都还在', async () => {
    const created = await client.post<{ id: string }>('/api/conversations', {})
    expect(created.status).toBe(201)
    const conversationId = created.body.id

    const ask = await client.post<{ messages: { role: string; text: string }[] }>(
      `/api/conversations/${conversationId}/ask`,
      { question: '我之前记过 React 性能优化相关的东西吗？', scope: 'search' },
    )
    expect(ask.status).toBe(200)
    expect(ask.body.messages).toHaveLength(2)
    expect(ask.body.messages[0]?.role).toBe('user')

    // 重新读一次：这是「会话优先导航」能不能成立的关键。
    // 只放内存里的话，刷新一次会话历史就空了
    const reloaded = await client.get<{
      title: string
      messages: { role: string }[]
    }>(`/api/conversations/${conversationId}`)

    expect(reloaded.body.messages).toHaveLength(2)
    // 标题由第一个问题生成，否则左导航里会说不出这是哪次对话
    expect(reloaded.body.title).toContain('React')
  })

  it('检索过程带真实数字，且引用指回真实文档', async () => {
    await client.post('/api/documents/notes', {
      title: 'React 性能优化的三个动作',
      body: '把频繁变化的 state 往下挪，缩小重渲染范围。列表项必须有稳定的 key。',
      tags: ['react'],
    })

    const ask = await client.post<{
      conversationId: string
      messages: {
        id: string
        role: string
        trace: { steps: { icon: string; meta?: string }[] } | null
        citations: { documentId: string; title: string }[]
      }[]
    }>('/api/conversations/ask', { question: '重渲染范围怎么缩小', scope: 'search' })

    // 按 role 找而不是按「有 citations 字段」找：两个角色都会带 citations 字段
    // （用户消息是空数组），用字段存在性筛选会挑到用户消息
    const assistant = ask.body.messages.find((m) => m.role === 'assistant')
    expect(assistant).toBeDefined()

    // trace 必须存在：没有它，AI 说「没找到」时用户无法分辨
    // 是没存过、还是分词没匹配上（.trellis/spec/project/product.md §5.6）
    expect(assistant?.trace).not.toBeNull()
    expect(assistant?.trace?.steps.length).toBeGreaterThan(0)

    // 引用必须指向真实存在的文档，否则「点引用跳回原文」是假的。
    // 断言非空是刻意的：条件断言（if (first)）在检索失败时会静默跳过，
    // 那样这个测试就什么都没验证
    const first = assistant?.citations[0]
    expect(first).toBeDefined()
    if (!first) throw new Error('没有引用，无法验证跳转目标')
    const doc = await client.get(`/api/documents/${first.documentId}`)
    expect(doc.status).toBe(200)
  })

  it('未配模型时走「只用检索」路径，并说明没有调模型', async () => {
    const ask = await client.post<{ messages: { text: string }[] }>('/api/conversations/ask', {
      question: 'React',
      scope: 'search',
    })
    const last = ask.body.messages.at(-1)
    // 明确告诉用户没花钱——这是失败路径设计里要求回答的三个问题之一
    expect(last?.text).toContain('没有调用模型')
  })

  it('不存在的会话返回 404 而不是静默新建', async () => {
    const res = await client.post('/api/conversations/does-not-exist/ask', {
      question: '测试',
      scope: 'search',
    })
    expect(res.status).toBe(404)
  })
})

describe('存成笔记', () => {
  it('存下的笔记保留引用来源，并成为可跳转的双链', async () => {
    const target = await client.post<{ id: string; title: string }>('/api/documents/notes', {
      title: '作为引用来源的笔记',
      body: '这段话会出现在别人的引用列表里。关于 pgvector 的 HNSW 索引。',
      tags: [],
    })

    const ask = await client.post<{ conversationId: string; messages: { id: string }[] }>(
      '/api/conversations/ask',
      { question: 'HNSW 索引', scope: 'search' },
    )
    const assistantId = ask.body.messages.at(-1)?.id
    expect(assistantId).toBeDefined()

    const saved = await client.post<{ noteId: string }>('/api/conversations/messages/note', {
      messageId: assistantId,
    })
    expect(saved.status).toBe(200)

    const note = await client.get<{
      title: string
      body: string
      links: { sources: { id: string }[] }
    }>(`/api/documents/${saved.body.noteId}`)

    // 存下来的不能是孤零零一段话——引用来源要真的成为链接
    expect(note.body.body).toContain('引用来源')
    expect(note.body.links.sources.map((item) => item.id)).toContain(target.body.id)

    // 重复存同一段不产生第二条笔记
    const again = await client.post<{ noteId: string }>('/api/conversations/messages/note', {
      messageId: assistantId,
    })
    expect(again.body.noteId).toBe(saved.body.noteId)
  })
})

describe('导出', () => {
  it('JSON 导出含文档与对话，且能被解析', async () => {
    const res = await client.get<{
      version: number
      documents: { id: string; body: string }[]
      conversations: { id: string; messages: unknown[] }[]
    }>('/api/export/json')

    expect(res.status).toBe(200)
    expect(res.body.version).toBe(1)
    expect(res.body.documents.length).toBeGreaterThan(0)
    // 对话也要带走：里面的结论往往比文档本身更有价值
    expect(Array.isArray(res.body.conversations)).toBe(true)
  })

  it('统计接口返回真实数量', async () => {
    const stats = await client.get<{ documents: number; notes: number; conversations: number }>(
      '/api/export/stats',
    )
    expect(stats.status).toBe(200)
    expect(stats.body.documents).toBeGreaterThan(0)
    expect(stats.body.conversations).toBeGreaterThan(0)
  })

  it('Markdown 导出返回 zip 字节流', async () => {
    const res = await app.request('/api/export/markdown', {
      headers: { Cookie: await getAuthCookie() },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/zip')

    // zip 的魔数。只断言 Content-Type 的话，一个返回空响应的实现也能骗过测试
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
  })
})

describe('抓取链接识别', () => {
  it('按域名识别来源，与真正抓取时用的是同一套规则', async () => {
    const wechat = await client.get<{ source: { kind: string } }>(
      `/api/capture/detect?url=${encodeURIComponent('https://mp.weixin.qq.com/s/abc')}`,
    )
    expect(wechat.body.source.kind).toBe('wechat')

    const github = await client.get<{ source: { kind: string } }>(
      `/api/capture/detect?url=${encodeURIComponent('https://github.com/TanStack/ai')}`,
    )
    expect(github.body.source.kind).toBe('github')

    const web = await client.get<{ source: { kind: string } }>(
      `/api/capture/detect?url=${encodeURIComponent('https://example.dev/post')}`,
    )
    expect(web.body.source.kind).toBe('web')
  })

  it('无效链接返回 400 而不是静默按网页处理', async () => {
    const res = await client.post('/api/capture', { url: 'not-a-url' })
    expect(res.status).toBe(400)
  })
})
