import { XMLParser } from 'fast-xml-parser'
import type { PluginSettings } from '@mimir/shared'
import { fetchLimits, fetchText, USER_AGENT } from './http.js'

/**
 * RSS / Atom 解析（M1-E，`docs/PRD.md` §3.1）。
 *
 * ## 为什么不放在 `parser` 接缝里
 *
 * 接缝的分工是「capturer = URL → 原始内容，parser = 原始内容 → Markdown」
 * （§7.2）。feed 属于前者：XML 里带的 `content:encoded` / `<content>`
 * 本身就是 HTML，转 Markdown 的事**复用已有的 html parser**——
 * 在 RSS 里另做一遍转换会让同一段 HTML 在「抓网页」与「读 feed」
 * 两条路上得到不同的 Markdown（同一份东西两个样子，用户会以为搜到的是另一条）。
 *
 * ## 两种方言：RSS 2.0 与 Atom
 *
 * 它们的字段名不同（`pubDate` vs `updated`、`description` vs `summary`），
 * 但形状可以归一化成同一个 `FeedItem`。归一的判据是**有没有就取哪个**，
 * 而不是「先判断是哪种格式再走分叉」——现实里的 feed 常常混着两种味道
 * （Atom 命名空间出现在 RSS 里），按字段名取比按格式分叉更耐操。
 *
 * ## 一个刻意的取舍：不抓正文页
 *
 * 很多 feed 只给摘要（`description` 是前 200 字 + 一个「阅读全文」链接）。
 * **不去抓那一页**：那会把一次轮询变成 N 次请求（一次拉 20 条 = 21 个请求），
 * 而「RSS 比爬首页稳」这个优势立刻消失（§3.1）。
 * 摘要也能搜到、也能被引用——用户真要全文时点链接去抓，
 * 那条路已经存在（粘贴 URL）。
 */

export interface FeedItem {
  title: string
  /** 条目链接。它同时是去重键（`canonical_url`）与 `documents.url` */
  link: string
  /** 条目正文。**可能是 HTML**（feed 里存的就是 HTML），由调用方转 Markdown */
  content: string
  /** 内容的形态。`text` 表示它已经是纯文本，不用再走 HTML 转换 */
  contentType: 'html' | 'text'
  author: string | null
  publishedAt: Date | null
}

export interface ParsedFeed {
  title: string
  items: FeedItem[]
}

/**
 * 拉取并解析一个 feed。
 *
 * 拉取复用 `http.ts` 的 `fetchText`（UA / 超时 / 体积上限三件事与网页抓取
 * 完全相同，见那里的注释）——不复制一份是因为那三件事各自都有实测踩过的坑。
 */
export async function fetchFeed(url: string, settings: PluginSettings): Promise<ParsedFeed> {
  const limits = await fetchLimits(settings)
  const { text } = await fetchText(url, {
    ...limits,
    headers: {
      // 有些站点按 Accept 区分 feed 与 HTML（同一个 URL 给两种内容）
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
    },
  })

  return parseFeed(text)
}

/** 把 feed 的 XML 解析成归一化的形状。导出来是为了让它可单测（纯函数） */
export function parseFeed(xml: string): ParsedFeed {
  const parser = new XMLParser({
    // 属性也要读：Atom 的 `<link href="...">` 把地址放在属性里
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    // 单条目时 `rss.channel.item` 是对象而不是数组——统一成数组的开关。
    // 不开它的话「只有一条的 feed」会在 `.map` 上抛出 TypeError
    isArray: (name) => ['item', 'entry'].includes(name),
    /**
     * 文本节点统一成字符串。默认会做类型推断（`2026` → number、
     * `true` → boolean），而 feed 里的数字串（如 `<guid>123</guid>`）
     * 被转成 number 之后长度、前导零都会变——识别同一个条目的依据就变了。
     */
    parseTagValue: false,
    trimValues: true,
  })

  const doc = parser.parse(xml) as Record<string, unknown>
  const rss = doc['rss'] as Record<string, unknown> | undefined
  const channel = rss?.['channel'] as Record<string, unknown> | undefined
  const feed = doc['feed'] as Record<string, unknown> | undefined

  /** RSS 2.0 */
  if (channel) {
    return {
      title: textOf(channel['title']) || '',
      items: ((channel['item'] as Record<string, unknown>[] | undefined) ?? []).flatMap(toItem),
    }
  }

  /** Atom */
  if (feed) {
    return {
      title: textOf(feed['title']) || '',
      items: ((feed['entry'] as Record<string, unknown>[] | undefined) ?? []).flatMap(toItem),
    }
  }

  /**
   * 两种都不是。抛出**具体**的原因而不是「解析失败」：
   * 用户把站点首页当成 feed 地址粘进来是最常见的错（`https://example.com`
   * 而不是 `https://example.com/feed.xml`），而那个页面能正常返回 200，
   * 所以这不是网络错误——必须说清楚「这个地址不是 feed」。
   */
  throw new Error('这个地址返回的不是 RSS / Atom（检查是否把站点首页当成了订阅地址）')
}

/** 一个条目 → 归一化。缺链接的条目**丢掉**（没有链接就没有去重键，入库会重复） */
function toItem(raw: Record<string, unknown>): FeedItem[] {
  const link = linkOf(raw)
  if (!link) return []

  // RSS 的 `<description>` 与 Atom 的 `<summary>`；有些 feed 两者都有
  const summary = textOf(raw['description']) || textOf(raw['summary'])
  // `content:encoded` 是 RSS 里放全文的扩展命名空间，优先于摘要
  const encoded =
    textOf(raw['content:encoded']) || textOf(raw['content']) || contentOf(raw['content']) || summary

  return [
    {
      title: textOf(raw['title']) || link,
      link,
      content: encoded,
      // `content:encoded` / `<content>` 里是 HTML；只有 description 时
      // 也可能带标签（很多站点转义后放进来），所以一律按 HTML 处理——
      // html parser 遇到纯文本会原样输出（它不要求有 <html> 结构）
      contentType: 'html',
      author: authorOf(raw),
      publishedAt: dateOf(raw),
    },
  ]
}

/** 链接：RSS 用 `<link>` 文本，Atom 用 `<link href>` 属性 */
function linkOf(raw: Record<string, unknown>): string {
  const direct = textOf(raw['link'])
  if (direct) return direct.trim()

  // Atom：可能是单个对象，也可能是数组（rel=alternate / self 多个）
  const links = raw['link'] as Record<string, unknown> | Record<string, unknown>[] | undefined
  const list = Array.isArray(links) ? links : links ? [links] : []
  const alternate = list.find((item) => {
    const rel = item['@_rel']
    return rel === undefined || rel === 'alternate'
  })
  const href = alternate?.['@_href']
  return typeof href === 'string' ? href.trim() : ''
}

/** Atom 的 `<content>` 可能是 `{ '#text': ..., '@_type': 'html' }` */
function contentOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const text = (value as Record<string, unknown>)['#text']
    if (typeof text === 'string') return text
  }
  return ''
}

function authorOf(raw: Record<string, unknown>): string | null {
  // Atom 的 `<author><name>…</name></author>`
  const author = raw['author']
  if (author && typeof author === 'object') {
    const name = (author as Record<string, unknown>)['name']
    if (typeof name === 'string' && name.trim() !== '') return name.trim()
  }
  // RSS 的 `<author>` 常常是「邮箱 (名字)」，保留原样比猜怎么拆好
  const text = textOf(author)
  return text.trim() === '' ? null : text.trim()
}

function dateOf(raw: Record<string, unknown>): Date | null {
  const candidates = ['pubDate', 'published', 'updated', 'dc:date']
  for (const key of candidates) {
    const value = textOf(raw[key])
    if (!value) continue
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return null
}

/** 取文本节点。fast-xml-parser 在只有属性时会给出对象，这里统一成字符串 */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object') {
    const text = (value as Record<string, unknown>)['#text']
    if (typeof text === 'string') return text
  }
  return ''
}

/** `USER_AGENT` 在这里再导出一次：feed 的请求要走同一个 UA（见 http.ts 的注释） */
export { USER_AGENT }
