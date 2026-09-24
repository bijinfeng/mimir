import type { LegContext, PluginDatabase, RankedHit, RetrievalLeg } from '@mimir/shared'
import { createKeywordLegPostgres } from './keyword.pg.js'
import { createKeywordLegSqlite } from './keyword.sqlite.js'

/**
 * 关键词通道（分发器）。
 *
 * 这是主力召回通道，因为它有**词边界语义**——命中的是完整的词，
 * 不是碰巧包含这几个字的任意位置。查询词先过 `queryTokens()`
 * （标点、单字、疑问词不进检索），召回门槛沿用 D-014 的
 * 「命中词数 ≥ 查询词数的一半（向上取整，至少 1 个）」。
 *
 * 方言实现（D-045）：
 *   - `keyword.pg.ts`     服务器部署：GIN + `ts_rank_cd`
 *   - `keyword.sqlite.ts` 本地开发 / 桌面端：FTS5 + `bm25()`
 *
 * 两条实现的**门槛语义必须一致**（同一批测试在两种方言下都要过，
 * `docs/TECH.md` §9.2）；排序函数不同（`ts_rank_cd` 0~1、bm25 无界负值）
 * 没有关系——融合层走加权 RRF，只看名次（TECH §4.2）。
 */
export function createKeywordLeg(db: PluginDatabase): RetrievalLeg {
  return db.dialect === 'sqlite' ? createKeywordLegSqlite(db) : createKeywordLegPostgres(db)
}

export type { LegContext, RankedHit }
