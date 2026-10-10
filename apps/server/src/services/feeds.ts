import { eq } from 'drizzle-orm'
import type { FeedItem } from '@mimir/plugin-capturer/feed'
import { canonicalize, ingestDocument } from './capture.js'
import { db } from '../db/client.js'
import { documents, feeds } from '../db/schema.js'
import { assemble } from '../plugins/host.js'
import { ensureFolders, normalizeFolder } from './folders.js'

/**
 * RSS / Atom 订阅（M1-E，`.trellis/spec/project/product.md` §3.1）。
 *
 * ## 这一层的职责
 *
 * ```
 *   feeds 表（订阅关系）  →  拉取与解析（plugins/capturer/src/feed.ts）
 *                         →  转 Markdown（parser 接缝的 html 实现）
 *                         →  入库（capture.ts 的 ingestDocument）
 * ```
 *
 * 四个环节各有归属，这个文件只做**编排**——与 `services/capture.ts`
 * 是同一种角色。真正的复用点是最后一步：订阅与「粘贴 URL」写入的是
 * 同一种记录（铁律 3），所以分块、嵌入、去重都不需要各写一遍。
 *
 * ## 为什么不做定期轮询的后台任务
 *
 * M1 的推进顺序（TECH §11）里没有 jobs 表 + worker 那一层（§4.10 提到它
 * 排在 M1 后段）。所以这里**由用户点「立即更新」触发**，与「补嵌入」
 * 同一个形态：批处理逻辑与触发方式无关，先证明逻辑对，再决定谁来按按钮。
 * 界面如实显示上次拉取时间与失败原因。
 *
 * ## 单次拉取的规模上限
 *
 * 一个 feed 可能有几百条历史。首次订阅时全拉进来会把一次点击变成
 * 几百次嵌入调用（花钱），所以**每次最多取 `MAX_ITEMS` 条**，
 * 且按时间从新到旧。水位线（`last_fetched_at`）让后续轮询只处理增量。
 */

/** 单次拉取最多入库几条。首次订阅一个老 feed 时它挡住「一次几百条」 */
const MAX_ITEMS = 20

export interface FeedSummary {
  url: string
  title: string
  folder: string | null
  lastFetchedAt: string | null
  lastError: string | null
  itemCount: number
}

function toSummary(row: typeof feeds.$inferSelect): FeedSummary {
  return {
    url: row.url,
    title: row.title,
    folder: row.folder,
    lastFetchedAt: row.lastFetchedAt?.toISOString() ?? null,
    lastError: row.lastError,
    itemCount: row.itemCount,
  }
}

export async function listFeeds(): Promise<FeedSummary[]> {
  const rows = await db.select().from(feeds)
  return rows.map(toSummary).toSorted((a, b) => a.title.localeCompare(b.title))
}

/**
 * 订阅一个 feed。
 *
 * **先拉一次再落库**：拉不通就报错，不留下一个「订了但从来没成功过」的
 * 源——那种源在界面上与「暂时坏掉的源」长得一样，而它们的下一步动作
 * 完全不同（改地址 vs 等一等重试）。
 */
export async function addFeed(input: {
  url: string
  folder?: string
}): Promise<{ feed: FeedSummary; imported: number; skipped: number }> {
  const { settings } = assemble()
  const { fetchFeed } = await import('@mimir/plugin-capturer/feed')

  const folder = input.folder ? normalizeFolder(input.folder) || null : null
  if (folder) await ensureFolders(folder)

  const parsed = await fetchFeed(input.url, settings)

  const existing = await db.select().from(feeds).where(eq(feeds.url, input.url))
  if (existing.length === 0) {
    await db.insert(feeds).values({
      url: input.url,
      // feed 自己的标题。空的话退回地址——界面上至少要有个东西可读
      title: parsed.title || input.url,
      folder,
      itemCount: 0,
      createdAt: new Date(),
    })
  }

  const result = await importItems(parsed.items, folder)

  /**
   * 订阅的这一趟**就是一次成功拉取**——水位线与计数要在这里就写上。
   *
   * 之前只在 `refreshFeed` 里写，结果订阅返回 `imported: 1`、界面上却是
   * 「还没有成功拉取过 · 0 篇」（真机冒烟抓到）：数据是对的，
   * 显示在说谎。重复订阅（已存在）时 `importItems` 会全跳过，
   * 水位线更新成 now 也无害。
   */
  await db
    .update(feeds)
    .set({
      lastFetchedAt: new Date(),
      lastError: null,
      itemCount: (existing[0]?.itemCount ?? 0) + result.imported,
    })
    .where(eq(feeds.url, input.url))

  return {
    feed: (await listFeeds()).find((item) => item.url === input.url)!,
    ...result,
  }
}

export async function removeFeed(url: string): Promise<boolean> {
  /**
   * 只删订阅关系，**不删已经收进来的文章**。
   *
   * 这与「删除文档」是两件事：取消订阅的意思是「以后别再自动收了」，
   * 而不是「把我读过的东西也删了」——后者的代价不可逆，而它不该
   * 藏在一个叫「取消订阅」的动作里。
   */
  await db.delete(feeds).where(eq(feeds.url, url))
  return true
}

/** 改订阅的标题或目录（用户整理） */
export async function updateFeed(input: {
  url: string
  title?: string
  folder?: string | null
}): Promise<boolean> {
  const folder =
    input.folder === undefined
      ? undefined
      : input.folder === null
        ? null
        : normalizeFolder(input.folder) || null
  if (folder) await ensureFolders(folder)

  await db
    .update(feeds)
    .set({
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(folder === undefined ? {} : { folder }),
    })
    .where(eq(feeds.url, input.url))
  return true
}

export interface RefreshResult {
  /** 这次新入库的条数 */
  imported: number
  /** 因为已经在库里而跳过的条数（重复条目） */
  skipped: number
  /** 这一轮看了几条（受 MAX_ITEMS 限制） */
  scanned: number
  error: string | null
}

/**
 * 更新一个订阅源：拉取 → 取新条目 → 入库。
 *
 * **失败如实记录**（`last_error`）但**不清空水位线**：一条拉不通的源
 * 不该让「上次成功是什么时候」这个问题失去答案。界面据此显示
 * 「3 天前成功过 · 昨天那次失败：404」。
 */
export async function refreshFeed(url: string): Promise<RefreshResult> {
  const { settings } = assemble()
  const [row] = await db.select().from(feeds).where(eq(feeds.url, url))
  if (!row) return { imported: 0, skipped: 0, scanned: 0, error: '订阅不存在' }

  try {
    const { fetchFeed } = await import('@mimir/plugin-capturer/feed')
    const parsed = await fetchFeed(url, settings)

    /**
     * feed 的标题跟着更新（源方会改名）。
     *
     * 只在**用户没手动改过**时更新——判断「改没改过」需要额外记一个
     * 标记，而收益很小（标题改错是可见的，用户再改一次就行）。
     * 所以这里只在标题为空时填。
     */
    const title = row.title || parsed.title || url

    const result = await importItems(parsed.items, row.folder)

    await db
      .update(feeds)
      .set({
        title,
        lastFetchedAt: new Date(),
        // 成功时**清空**错误：一个永不清空的错误字段会让用户以为它一直在坏
        lastError: null,
        itemCount: row.itemCount + result.imported,
      })
      .where(eq(feeds.url, url))

    return { ...result, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.update(feeds).set({ lastError: message }).where(eq(feeds.url, url))
    return { imported: 0, skipped: 0, scanned: 0, error: message }
  }
}

/** 所有订阅源都更新一遍（界面的「全部更新」） */
export async function refreshAllFeeds(): Promise<
  { url: string; imported: number; error: string | null }[]
> {
  const rows = await db.select({ url: feeds.url }).from(feeds)
  const results: { url: string; imported: number; error: string | null }[] = []

  /**
   * **串行**更新：并发拉十几个 feed 会同时打出一批请求，而
   * 「低频、不扰民」是这一条来源设计的底线（§3.2 对公众号的那条判断
   * 对 feed 同样成立——你不想让别人的服务器觉得你在扫它）。
   */
  for (const row of rows) {
    const result = await refreshFeed(row.url)
    results.push({ url: row.url, imported: result.imported, error: result.error })
  }

  return results
}

/**
 * 把 feed 条目转成文档。
 *
 * ## 转换复用 html parser
 *
 * feed 的 `content:encoded` 是 HTML，转换交给 `parser` 接缝——
 * **不在这里再写一份** HTML → Markdown 的规则。两条路（抓网页 / 读 feed）
 * 对同一段 HTML 的转换结果必须一致，否则同一篇文章在两个入口下
 * 读起来是两个东西。
 *
 * ## 条目的顺序与截断
 *
 * feed 给的是**从新到旧**（规范如此，但现实里不保证），所以先按
 * `publishedAt` 降序排一次再截前 `MAX_ITEMS` 条。没有时间的条目保留
 * 原顺序（排到末尾会让「新发的没有时间戳」的源永远收不到新内容）。
 */
async function importItems(
  items: FeedItem[],
  folder: string | null,
): Promise<{ imported: number; skipped: number; scanned: number }> {
  const { seams } = assemble()
  // 用 **html-fragment** 而不是 html：feed 的 content:encoded 按规范就是
  // 文章正文，再跑一遍 Readability 只会因为它「太短、不像一篇文章」而丢掉
  // （见 plugins/parser/src/html-fragment.ts 的头注释）
  const parser = seams.parser
    .implementations()
    .find(({ impl }) => impl.accepts.includes('html-fragment'))

  const sorted = [...items].toSorted((a, b) => {
    const aTime = a.publishedAt?.getTime() ?? Number.MAX_SAFE_INTEGER
    const bTime = b.publishedAt?.getTime() ?? Number.MAX_SAFE_INTEGER
    return bTime - aTime
  })

  const selected = sorted.slice(0, MAX_ITEMS)
  let imported = 0
  let skipped = 0

  for (const item of selected) {
    /**
     * 去重的**第一道**：库里有这个 URL 就跳过。
     *
     * 第二道是 `ingestDocument` 里的 `canonical_url` 唯一索引——
     * 两道都要有：这一道挡住绝大多数重复（省掉一次解析），
     * 那一道路挡住并发与 URL 归一化之后的等价形式。
     */
    const canonical = canonicalize(item.link)
    const [known] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.canonicalUrl, canonical))
    if (known) {
      skipped += 1
      continue
    }

    let markdown = item.content
    if (parser) {
      try {
        const parsed = await parser.impl.parse({
          type: 'html-fragment',
          content: item.content,
          baseUrl: item.link,
        })
        markdown = parsed.markdown || item.content
      } catch (error) {
        // 转换失败不让整轮更新失败：这条退化为原始内容（能搜、能读），
        // 而剩下的条目继续处理。留日志说明是哪一条
        console.warn(`feed 条目转换失败（${item.link}），退回原始内容：`, error)
      }
    }

    const { created } = await ingestDocument({
      kind: 'web',
      title: item.title,
      markdown,
      url: item.link,
      author: item.author,
      folder,
      publishedAt: item.publishedAt,
    })

    if (created) imported += 1
    else skipped += 1
  }

  return { imported, skipped, scanned: selected.length }
}
