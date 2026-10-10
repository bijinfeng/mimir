import { sql } from 'drizzle-orm'
import type { LegContext, PluginDatabase, RetrievalLeg } from '@mimir/shared'
import { vectorLegWithQuery } from './vector.js'

/**
 * 向量通道——**Postgres 方言**（服务器部署路径，D-045，M1-C）。
 *
 * ## 查询必须写成索引的同一个表达式
 *
 * HNSW 索引建在 `embedding::halfvec(1024)` 这个**表达式**上、带
 * `WHERE dimension = 1024`（`drizzle/0010_chunks.sql`）。所以查询里的
 * 距离表达式必须逐字对应，否则索引静默不命中——`.trellis/spec/project/architecture.md` §4.8
 * 点名这是本期最容易踩的一处。
 *
 * 维度从 `ctx.embed.dimension` 来（设置里 `model.embed.dimensions`），
 * 所以索引是按维度分区的：配了 1024 的模型就走 `..._1024_idx`。
 * **没建索引的维度仍然正确**，只是走顺扫——个人库规模下可接受
 * （§4.6 实测；万级向量顺扫也是毫秒级）。
 *
 * ## `dimension = N` 与模型名一起筛选
 *
 * 两张表都有同一分块的多个模型的行。只按模型名筛不够：模型名可能重复
 * （换端点后同名），而维度不同的行混进来会让距离计算直接报错。
 * 两个条件一起给出「这批发给谁、多长」的完整答案。
 *
 * 距离用**余弦**（`<=>`）：embedding 模型的语义相似度标准就是它与
 * 归一化点积等价，而 `halfvec_cosine_ops` 是索引的操作符类。
 */
export function createVectorLegPostgres(db: PluginDatabase): RetrievalLeg {
  return vectorLegWithQuery(
    'vector',
    1.2,
    async (database, vector, ctx: LegContext) => {
      const embed = ctx.embed
      if (!embed) return []

      /**
       * 维度直接进 SQL 文本（不能参数化）——它要作为**类型修饰符**出现
       * 在 `halfvec(N)` 里。安全性由上游保证：它来自 `model.embed.dimensions`
       * 的设置校验（整数、64–4000），这里再取整一次兜底。
       */
      const dimension = Math.trunc(embed.dimension)
      if (!Number.isInteger(dimension) || dimension < 1 || dimension > 4000) {
        throw new Error(`向量维度不合法：${embed.dimension}（设置里应为 1–4000 的整数）`)
      }

      const literal = `[${vector.join(',')}]`

      return database.execute<{ id: string; distance: number }>(sql`
        select ce.chunk_id as id,
               ce.embedding::halfvec(${sql.raw(String(dimension))})
                 <=> ${literal}::halfvec(${sql.raw(String(dimension))}) as distance
        from chunk_embeddings ce
        join chunks c on c.id = ce.chunk_id
        join documents d on d.id = c.document_id
        where ce.model = ${embed.model}
          and ce.dimension = ${dimension}
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
