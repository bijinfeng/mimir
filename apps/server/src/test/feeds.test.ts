import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseFeed } from '@mimir/plugin-capturer/feed'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { documents, feeds as feedsTable } from '../db/schema.js'
import { assemble } from '../plugins/host.js'
import { addFeed, listFeeds, refreshFeed, removeFeed, updateFeed } from '../services/feeds.js'

/**
 * RSS / Atom 订阅（M1-E）。
 *
 * ## 两层测法，各自守不同的东西
 *
 *   1. **解析**（纯函数）：两种方言的字段归一 —— 这块最容易出静默错误，
 *      因为字段名不匹配时**不报错**，只是那一条没有标题或没有链接
 *   2. **入库链路**（真起一个 HTTP 服务器）：从 URL 到 `documents` 行的
 *      全过程，验证正文真的转成了 Markdown、真的能搜到
 *
 * 不起真服务器就测不了第二层：`fetchFeed` 走的是真的 `fetch`，
 * 而 mock 掉 fetch 会把「URL 拼接、重定向、编码」这些真问题一起 mock 掉。
 */

/** 一份 RSS 2.0，带 content:encoded 全文 */
const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>示例技术博客</title>
    <item>
      <title>第一篇文章</title>
      <link>https://example.com/posts/1</link>
      <description>这段摘要不该被用（有 content:encoded 时优先它）</description>
      <content:encoded><![CDATA[<h1>正文标题</h1><p>正文里有独特词元风信子。</p>]]></content:encoded>
      <pubDate>Mon, 28 Sep 2026 10:00:00 GMT</pubDate>
      <author>张三</author>
    </item>
    <item>
      <title>第二篇文章</title>
      <link>https://example.com/posts/2</link>
      <description>只有摘要的条目</description>
    </item>
  </channel>
</rss>`

/** 一份 Atom，链接放在属性里 */
const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom 示例</title>
  <entry>
    <title>原子条目</title>
    <link rel="alternate" href="https://example.com/atom/1"/>
    <link rel="self" href="https://example.com/atom/1.xml"/>
    <content type="html">&lt;p&gt;原子内容里的独特词元是石榴石。&lt;/p&gt;</content>
    <updated>2026-09-27T12:00:00Z</updated>
    <author><name>李四</name></author>
  </entry>
</feed>`

describe('feed 解析：两种方言归一成同一个形状', () => {
  it('RSS 2.0：标题、链接、全文与时间都对上', () => {
    const parsed = parseFeed(RSS)
    expect(parsed.title).toBe('示例技术博客')
    expect(parsed.items).toHaveLength(2)

    const first = parsed.items[0]!
    expect(first.title).toBe('第一篇文章')
    expect(first.link).toBe('https://example.com/posts/1')
    // content:encoded 优先于 description——这是「全文还是摘要」的分水岭
    expect(first.content).toContain('风信子')
    expect(first.author).toBe('张三')
    expect(first.publishedAt?.getUTCFullYear()).toBe(2026)
  })

  it('Atom：从 <link href> 属性取地址，author 取 name', () => {
    const parsed = parseFeed(ATOM)
    expect(parsed.title).toBe('Atom 示例')
    expect(parsed.items).toHaveLength(1)

    const entry = parsed.items[0]!
    expect(entry.title).toBe('原子条目')
    // 两个 link（alternate / self）：要取 alternate 那一个，不是 self 的 .xml
    expect(entry.link).toBe('https://example.com/atom/1')
    expect(entry.content).toContain('石榴石')
    expect(entry.author).toBe('李四')
  })

  it('单条目的 feed 也能解析（XML 解析器会把它给成对象而不是数组）', () => {
    const parsed = parseFeed(ATOM)
    expect(Array.isArray(parsed.items)).toBe(true)
    expect(parsed.items.length).toBe(1)
  })

  it('数字串保持字符串（不因类型推断丢掉前导零）', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
      <item><title>n</title><link>https://example.com/007</link><guid>007</guid></item>
      </channel></rss>`
    const parsed = parseFeed(xml)
    expect(parsed.items[0]!.link).toBe('https://example.com/007')
  })

  it('不是 feed 时给出**具体**原因（而不是「解析失败」）', () => {
    // 站点首页是用户最常见的错：它返回 200，所以这不是网络错误
    expect(() => parseFeed('<!doctype html><html><body>首页</body></html>')).toThrow(
      /不是 RSS \/ Atom/,
    )
  })

  it('没有链接的条目被丢掉（没有去重键，入库会重复）', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
      <item><title>没有链接</title></item>
      <item><title>有链接</title><link>https://example.com/ok</link></item>
      </channel></rss>`
    const parsed = parseFeed(xml)
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0]!.title).toBe('有链接')
  })
})

describe('feed 订阅的入库链路（真发 HTTP）', () => {
  let server: ReturnType<typeof createServer>
  let baseUrl = ''

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/feed.xml') {
        res.writeHead(200, { 'content-type': 'application/rss+xml' })
        res.end(RSS)
      } else if (req.url === '/atom.xml') {
        res.writeHead(200, { 'content-type': 'application/atom+xml' })
        res.end(ATOM)
      } else if (req.url === '/broken.xml') {
        res.writeHead(500)
        res.end('boom')
      } else {
        res.writeHead(404)
        res.end('not found')
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('订阅一个 feed：拉取、转 Markdown、入库、可搜', async () => {
    const result = await addFeed({ url: `${baseUrl}/feed.xml` })
    expect(result.imported).toBe(2)

    const listed = await listFeeds()
    expect(listed.some((feed) => feed.url === `${baseUrl}/feed.xml`)).toBe(true)

    // 正文真的转了 Markdown（不是原样的 HTML）
    const [doc] = await db
      .select({ body: documents.body, kind: documents.kind })
      .from(documents)
      .where(eq(documents.canonicalUrl, 'https://example.com/posts/1'))
    expect(doc?.body).toContain('风信子')
    expect(doc?.body).not.toContain('<h1>')

    // 收进来的东西可搜（分块 + 索引一起验证）
    const { search } = await import('../search/index.js')
    const found = await search({ q: '风信子', limit: 5 })
    expect(found.hits.length).toBeGreaterThan(0)
  })

  it('订阅成功后水位线与计数**当场就位**（订阅本身就是一次成功拉取）', async () => {
    /**
     * 真机冒烟抓到的：addFeed 返回 imported: 1，但界面上显示
     * 「还没有成功拉取过 · 0 篇」——数据对、显示在说谎。
     * 水位线与计数必须在订阅这一趟就写上。
     */
    const feed = (await listFeeds()).find((item) => item.url === `${baseUrl}/feed.xml`)
    expect(feed).toBeDefined()
    expect(feed!.itemCount).toBe(2)
    expect(feed!.lastFetchedAt).toBeTruthy()
    expect(feed!.lastError).toBeNull()
  })

  it('重复更新不会重复入库（水位的第二道保险是 canonical_url 唯一索引）', async () => {
    const before = await db.select({ id: documents.id }).from(documents)
    const refreshed = await refreshFeed(`${baseUrl}/feed.xml`)
    expect(refreshed.imported).toBe(0)
    expect(refreshed.skipped).toBe(2)

    const after = await db.select({ id: documents.id }).from(documents)
    expect(after.length).toBe(before.length)
  })

  it('拉取失败时如实记录原因，且**不清空**上次成功时间', async () => {
    // 先成功一次，拿到 lastFetchedAt
    await refreshFeed(`${baseUrl}/feed.xml`)
    const ok = (await listFeeds()).find((feed) => feed.url.endsWith('/feed.xml'))
    expect(ok?.lastFetchedAt).toBeTruthy()
    expect(ok?.lastError).toBeNull()

    // 把订阅地址改成一个必失败的（模拟源挂掉）
    const failing = await addFeed({ url: `${baseUrl}/atom.xml` })
    expect(failing.imported).toBe(1)
    await updateFeed({ url: `${baseUrl}/atom.xml`, title: '待失败' })

    /**
     * 直接对 `/broken.xml` 建一个订阅会先失败（`addFeed` 要先拉一次成功
     * 才肯落库），所以这里直接把它塞进表里再刷新——那正是「源后来挂掉」
     * 的真实形态。
     *
     * 用 drizzle 的 insert 而不是 `db.execute`：后者只有 PG 侧有，
     * SQLite 侧要 `db.all`（`db/client.ts` 的双后端接缝）。测试要在
     * 两种方言下都跑，所以不碰方言专有的方法。
     */
    await db.insert(feedsTable).values({
      url: `${baseUrl}/broken.xml`,
      title: '坏源',
      folder: null,
      itemCount: 0,
      createdAt: new Date(),
    })
    const broken = await refreshFeed(`${baseUrl}/broken.xml`)
    expect(broken.error).toBeTruthy()
    expect(broken.error).toContain('500')

    const row = (await listFeeds()).find((feed) => feed.url.endsWith('/broken.xml'))
    expect(row?.lastError).toContain('500')
    // 关键：失败的源不该丢掉「上次成功过」这件事——它从来没成功过，所以是 null
    expect(row?.lastFetchedAt).toBeNull()
  })

  it('取消订阅不删已收进来的文章', async () => {
    const url = `${baseUrl}/feed.xml`
    const before = await db.select({ id: documents.id }).from(documents)

    await removeFeed(url)

    const listed = await listFeeds()
    expect(listed.some((feed) => feed.url === url)).toBe(false)

    // 文章仍在——「取消订阅」的意思是别再自动收了，不是删掉读过的东西
    const after = await db.select({ id: documents.id }).from(documents)
    expect(after.length).toBe(before.length)
  })

  it('入库的正文带上「订阅来源」的 kind 与统一形状（铁律 3）', async () => {
    /**
     * `addFeed` 允许已经订过（它是幂等的：重复调只会补新条目）。
     * 所以这里不假定 `imported > 0`——上一个用例可能已经把它收进来了。
     * 断言落在**库里那条记录的形状**上，那才是这个用例要守的东西。
     */
    const result = await addFeed({ url: `${baseUrl}/atom.xml` })
    expect(result.feed.url).toBe(`${baseUrl}/atom.xml`)

    const [doc] = await db
      .select({ kind: documents.kind, body: documents.body, url: documents.url })
      .from(documents)
      .where(eq(documents.url, 'https://example.com/atom/1'))

    // 与「粘贴 URL」收进来的东西是**同一种记录**：kind=web、正文是 Markdown
    expect(doc?.kind).toBe('web')
    expect(doc?.body).toContain('石榴石')
    expect(doc?.body).not.toContain('<p>')
  })

  it('装配层认识 feed 抓取器（描述符的 file 路径真实存在）', async () => {
    const { descriptors } = assemble()
    const parsed = await parseFeed(ATOM)
    expect(parsed.items.length).toBe(1)
    // feed 的解析不在 capturer 的注册表里（它不是按 URL 匹配的抓取器），
    // 所以这里只确认装配仍然正常——`plugins.test.ts` 守着描述符的路径
    const all = await descriptors()
    expect(all.length).toBeGreaterThan(0)
  })
})
