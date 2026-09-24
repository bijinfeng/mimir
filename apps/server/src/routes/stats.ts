import { Hono } from 'hono'
import { usageStatsQuerySchema } from '@mimir/shared'
import { parseInput } from '../lib/http.js'
import { stats } from '../services/usage.js'
import type { AppEnv } from '../types.js'

/**
 * 用量统计的读取端点（`docs/TECH.md` §12）。
 *
 * 只有一条 GET：聚合全在 SQL 里做，界面不做算术。理由是**口径必须只有一处**——
 * 今日/本周/本月与热力图如果各自在两端算，迟早会出现「上面写 12 万、
 * 图上加起来 9 万」这种无法解释的差异。
 *
 * 时区不由客户端传：它是部署配置（`stats.timezone`），跟着服务端走。
 * 让客户端传会让「同一份数据在两个浏览器上分档不同」，而那种差异
 * 看起来像数据错了。
 */
export const statsRoute = new Hono<AppEnv>()

statsRoute.get('/', async (c) => {
  const query = await parseInput(c, 'query', usageStatsQuerySchema)
  return c.json(await stats(query.days))
})
