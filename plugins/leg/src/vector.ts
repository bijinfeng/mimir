import type { LegContext, PluginDatabase, RankedHit, RetrievalLeg } from '@mimir/shared'
import { createVectorLegPostgres } from './vector.pg.js'
import { createVectorLegSqlite } from './vector.sqlite.js'

/**
 * 向量通道（M1-C，`docs/TECH.md` §4.8 / §4.11）。
 *
 * ## 没有对外接口（embed 模型）时这个通道不注册
 *
 * 「有没有可用的向量化模型」这件事由 `install()` 里的 `unavailable` 声明，
 * 由 core 算出状态（§7.4）。**未就绪的通道不进编排**——所以它不会出现在
 * `channels` 里，也不会被 `hybrid` 模式选中。这正是「默认模式由注册表推导」
 * 那条（§4.11）：用户配好 embedding 模型之后，不需要再去哪里把默认值改过来。
 *
 * ## 查询向量由宿主注入（`ctx.embedQuery`）
 *
 * 通道不知道密钥在哪、用的是哪家的协议（那是 provider 接缝的知识）。
 * 它声明「我要一个查询向量」，宿主的 `search/index.ts` 用 `callEmbed`
 * 造好传进来。见 `LegContext.embedQuery` 的注释。
 *
 * ## 失败不返回空，而是抛错
 *
 * 检索链条上「一个通道坏了」与「没有命中」必须区分：`pipeline.ts` 用
 * `Promise.all` 而不是 `allSettled`，正是为了让坏掉的通道暴露出来。
 * 静默返回空会让「向量检索坏了」表现成「搜不到语义相关的内容」——
 * 而那看起来只是「这个库没有这方面的东西」。
 */
export function createVectorLeg(db: PluginDatabase): RetrievalLeg {
  return db.dialect === 'sqlite' ? createVectorLegSqlite(db) : createVectorLegPostgres(db)
}

/**
 * 一个通道共用的实现骨架：取查询向量 → 方言查询 → 名次。
 *
 * 两个方言的实现只在「怎么算距离、怎么取最近 K 条」上不同，
 * 其余（缺 embedQuery、向量为空、行映射）完全一致。
 * 把那段抄两遍的收益是零，而漂移的代价是「两个后端一个能搜一个不能」。
 */
export function vectorLegWithQuery(
  id: string,
  defaultWeight: number,
  search: (
    db: PluginDatabase,
    vector: number[],
    ctx: LegContext,
  ) => Promise<{ id: string; distance: number }[]>,
  db: PluginDatabase,
): RetrievalLeg {
  return {
    id,
    defaultWeight,
    async run(ctx: LegContext): Promise<RankedHit[]> {
      if (!ctx.embed) return []

      const vector = await ctx.embed.of(ctx.query)
      if (vector.length === 0) return []

      const rows = await search(db, vector, ctx)
      return rows.map((row, index) => ({ id: row.id, rank: index + 1 }))
    },
  }
}
