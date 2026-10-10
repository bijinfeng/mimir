import type { PluginDatabase, RetrievalLeg } from '@mimir/shared'
import { createSubstringLegPostgres } from './substring.pg.js'
import { createSubstringLegSqlite } from './substring.sqlite.js'

/**
 * 子串兜底通道（分发器）。
 *
 * ## 为什么需要它
 *
 * 分词器对同一串文字在查询侧和索引侧可能切得不同（`.trellis/spec/project/architecture.md` §4.3）：
 *
 * ```
 * 问：「React 重渲染范围怎么缩小？」
 * jieba 切查询：react / 重渲染范围 / 缩小
 * 正文索引里是：重渲染 / 范围 / ...
 * ```
 *
 * 「重渲染范围」作为一个词在词级通道上永远命中不了——而正文里明明就有
 * 这四个连续的汉字。子串匹配不受分词结果影响，这就是它的兜底。
 *
 * ## 逐词匹配 + 与词级通道一致的门槛
 *
 * 整串匹配对一句话提问永远不命中；只要求「命中任意一个」又会把
 * 无意义查询的噪声放进来。所以与关键词通道同一个门槛：命中词数 ≥ 一半。
 * 详见 D-014 与两个方言实现里的实测记录。
 *
 * 方言实现（D-045）：
 *   - `substring.pg.ts`     服务器部署：`pg_trgm` 加速的 ILIKE
 *   - `substring.sqlite.ts` 本地开发 / 桌面端：`instr` / `LIKE`（全扫，个人库可接受）
 */
export function createSubstringLeg(db: PluginDatabase): RetrievalLeg {
  return db.dialect === 'sqlite' ? createSubstringLegSqlite(db) : createSubstringLegPostgres(db)
}
