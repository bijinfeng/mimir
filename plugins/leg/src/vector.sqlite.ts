import { sql } from 'drizzle-orm'
import type { LegContext, PluginDatabase, RetrievalLeg } from '@mimir/shared'
import { vectorLegWithQuery } from './vector.js'

/**
 * 向量通道——**SQLite 方言**（本地开发 / 桌面端，D-045，M1-C）。
 *
 * ## 为什么用标量函数而不是 `vec0` 虚拟表
 *
 * `RESEARCH.md` §11.3 的蓝图是 `vec0` 虚拟表 + 暴力 KNN。真实落地时
 * 选了**标量距离函数**，理由是两条：
 *
 *   1. `vec0` 是一张独立的虚拟表，它需要自己的一份数据同步（分块写入、
 *      删除、重建）——而向量已经有 `chunk_embeddings` 这张表了。
 *      两张表存同一份向量，就有两个真相源，而同步逻辑是额外的
 *      （且会漂移的）代码
 *   2. `vec0` 的 KNN 查询形状是 `WHERE embedding MATCH ? AND k = ?`，
 *      它**不能与别的过滤条件自由组合**（kind / tag / 删除态）——
 *      在个人库规模下，先过滤再算距离的顺扫反而更简单也更可控
 *
 * 量级论证见 `RESEARCH.md` §11.3：SQLite 侧本来就是纯暴力扫描，
 * `vec0` 与标量函数在同一量级（几十万向量以内都是毫秒级）；
 * 个人库（万级分块）远在安全区。
 *
 * ## 扩展在连接时加载
 *
 * `sqlite-vec` 的扩展函数（`vec_distance_cosine`）由宿主在建立连接时
 * 装上（`db/client.ts`）——插件拿不到原生连接，也不该去装扩展。
 * 装不上时连接会**大声报错**（而不是让这个通道静默返回空），
 * 因为「向量检索不可用」必须能查出来。
 *
 * 向量以 BLOB 形态存（`Float32Array` 的字节），这正是
 * `vec_distance_cosine` 期望的输入。
 */
export function createVectorLegSqlite(db: PluginDatabase): RetrievalLeg {
  return vectorLegWithQuery(
    'vector',
    1.2,
    async (database, vector, ctx: LegContext) => {
      const embed = ctx.embed
      if (!embed) return []

      const floats = new Float32Array(vector)

      return database.execute<{ id: string; distance: number }>(sql`
        select ce.chunk_id as id,
               vec_distance_cosine(ce.embedding, ${floats}) as distance
        from chunk_embeddings ce
        join chunks c on c.id = ce.chunk_id
        join documents d on d.id = c.document_id
        where ce.model = ${embed.model}
          and ce.dimension = ${embed.dimension}
          and d.deleted_at is null
          ${ctx.kind ? sql`and d.kind = ${ctx.kind}` : sql``}
          ${
            ctx.tag
              ? sql`and exists (
            select 1 from document_tags dt
            join tags t on t.id = dt.tag_id
            where dt.document_id = d.id and t.name = ${ctx.tag}
          )`
              : sql``
          }
        order by distance
        limit ${ctx.limit}
      `)
    },
    db,
  )
}
