import { Hono } from 'hono'
import { USAGE_HISTORY_DAYS } from '@mimir/shared'
import { latestConversationContext, stats } from '../services/usage.js'
import type { AppEnv } from '../types.js'

/**
 * 用量统计的读取端点（`docs/TECH.md` §12）。
 *
 * 只有一条 GET：聚合在服务端做完，界面不做算术。理由是**口径必须只有一处**——
 * 今日/本周/本月与热力图如果各自在两端算，迟早会出现「上面写 12 万、
 * 图上加起来 9 万」这种无法解释的差异。
 *
 * ## 没有查询参数，两处都不该由客户端决定
 *
 * | 值 | 为什么服务端定 |
 * |---|---|
 * | 时区 | 它是部署配置（`stats.timezone`）。客户端传会让「同一份数据在两个浏览器上分档不同」，而那种差异看起来像数据错了 |
 * | 天数 | 固定一年（`USAGE_HISTORY_DAYS`）。热力图回答的是「这一年我在持续用吗」，切范围只会让分档口径跟着变 |
 *
 * 去掉参数比留着好：留着会有一个永远不会被传的字段，而下一个人会以为
 * 它支持范围切换（与「先加后忘的字段会变成没人读的列」是同一条）。
 */
export const statsRoute = new Hono<AppEnv>()

statsRoute.get('/', async (c) => c.json(await stats(USAGE_HISTORY_DAYS)))
/**
 * 某个会话最近一次模型调用的记账——对话页「上下文容量」chip 的数据源。
 * 口径在 service 里（latestConversationContext），路由只做转接。
 */
statsRoute.get('/conversation/:id', async (c) =>
  c.json(await latestConversationContext(c.req.param('id'))),
)
