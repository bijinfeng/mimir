import { Hono } from 'hono'
import { feedCreateSchema, feedUpdateSchema } from '@mimir/shared'
import { HttpError, parseInput } from '../lib/http.js'
import {
  addFeed,
  listFeeds,
  refreshAllFeeds,
  refreshFeed,
  removeFeed,
  updateFeed,
} from '../services/feeds.js'
import type { AppEnv } from '../types.js'

/**
 * RSS / Atom 订阅的路由（M1-E）。
 *
 * 形状与文档路由一致（列表 / 创建 / 更新 / 删除），因为它管理的是
 * 一种**资源**。唯一特殊的是 `/refresh`——它是一次**动作**而不是
 * 一次资源读写，所以用 POST（而且它真的会发网络请求、会花钱嵌入）。
 *
 * `POST /refresh` 不带参数时更新全部；带 `{ url }` 时只更新一个。
 * 不做成 GET：它改变状态（入库新文档），而 GET 应当是安全的
 * （浏览器预取、爬虫都可能触发它）。
 */
export const feedsRoute = new Hono<AppEnv>()

feedsRoute.get('/', async (c) => c.json({ items: await listFeeds() }))

feedsRoute.post('/', async (c) => {
  const input = await parseInput(c, 'json', feedCreateSchema)
  const result = await addFeed({
    url: input.url,
    ...(input.folder ? { folder: input.folder } : {}),
  })
  return c.json(result, 201)
})

feedsRoute.patch('/', async (c) => {
  const input = await parseInput(c, 'json', feedUpdateSchema)
  await updateFeed({
    url: input.url,
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.folder === undefined ? {} : { folder: input.folder }),
  })
  return c.json({ ok: true })
})

feedsRoute.delete('/', async (c) => {
  const url = c.req.query('url')
  if (!url) throw new HttpError(400, 'INVALID_INPUT', '缺少 url 参数')
  return c.json({ ok: await removeFeed(url) })
})

/**
 * 更新订阅（拉取新条目）。
 *
 * 带 `url` 更新一个、不带则全部。**失败在响应体里如实回报**
 * （每条带 `error`），而不是让整个请求 500——「三个源里有一个挂了」
 * 是常态，而整批失败会让另外两个的成功白费。
 */
feedsRoute.post('/refresh', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { url?: string }
  if (body.url) {
    const result = await refreshFeed(body.url)
    return c.json({ items: [{ url: body.url, ...result }] })
  }
  return c.json({ items: await refreshAllFeeds() })
})
