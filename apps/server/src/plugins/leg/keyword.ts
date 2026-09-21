import { sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { queryTokens } from '../../lib/segment.js'
import type { LegContext, RankedHit, RetrievalLeg } from './types.js'

/**
 * 关键词通道：jieba 预分词 + ts_rank_cd 排序。
 *
 * 这是主力召回通道，因为它有**词边界语义**——命中的是完整的词，
 * 不是碰巧包含这几个字的任意位置。
 *
 * 排序用 ts_rank_cd（cover density）而不是 ts_rank：前者更看重查询词
 * 在文档中的聚集程度，对「多个关键词都出现且挨得近」的文档给分更高。
 *
 * ## 召回门槛：至少命中一半的查询词
 *
 * 这里有两个互相拉扯的需求，两个极端都在实测中踩到过：
 *
 * **纯 AND（原先的写法）召回太窄。** `plainto_tsquery` 把所有词用 AND
 * 连起来，要求每个词都出现。对「向量检索」这类短查询没问题，但对
 * 自然语言提问是灾难：
 *
 * ```
 * 问：「React 重渲染范围怎么缩小？」
 * 切词：react / 重渲染 / 范围 / 缩小
 * AND：要求四个词同时出现在同一篇文档里 → 命中 0 条
 * ```
 *
 * **纯 OR 又召回太宽。** 改成全部 OR 之后，任何包含「的」「内容」这类
 * 通用词的文档都会被捞出来——`zzzz不存在的内容zzzz` 这种无意义查询
 * 也能返回十几条，等于把噪声当结果。
 *
 * 所以取中间：**命中的词数要达到查询词数的一半**（向上取整，至少 1 个）。
 * 单字查询门槛为 1，行为与最初一致；四词提问要求命中 2 个，
 * 「重渲染 + 范围」同时出现的文档能进，「只有 react」的不算。
 * 排序仍交给 ts_rank_cd：命中的词越多、越集中，排得越前。
 *
 * 这样做也**免掉了停用词表**：门槛本身就挡住了「只有通用词命中」的文档，
 * 不需要再维护一份「哪些算通用词」的清单（那份清单永远不完整）。
 *
 * 安全性：每个词都过 `plainto_tsquery` 参数化，用户输入里的
 * `& | ! : <->` 不会被当成 tsquery 语法。这是原实现用 plainto_tsquery
 * 而不是自己拼查询串的原因，这个性质必须保住。
 */
export const keywordLeg: RetrievalLeg = {
  name: 'keyword',
  weight: 1,

  async run({ query, limit, kind, tag }: LegContext): Promise<RankedHit[]> {
    // 用 queryTokens 而不是裸 tokenize：标点、单字、疑问词要在算门槛之前
    // 就去掉，否则它们会把分母抬高，让真正的关键词命中被误判为「命中不足」
    const tokens = queryTokens(query)
    if (tokens.length === 0) return []

    const required = Math.max(1, Math.ceil(tokens.length / 2))

    // 逐词 OR，作为排序用的 tsquery
    const anyMatch = sql.join(
      tokens.map((token) => sql`plainto_tsquery('simple', ${token})`),
      sql` || `,
    )

    // 命中词数。用它做门槛而不是靠 tsquery 的 AND 语义——
    // 「命中几个词」和「按相关度排序」是两件事，混在一个表达式里就调不动了
    const coverage = sql.join(
      tokens.map(
        (token) =>
          sql`(to_tsvector('simple', d.search_text) @@ plainto_tsquery('simple', ${token}))::int`,
      ),
      sql` + `,
    )

    const rows = await db.execute<{ id: string; rank: number }>(sql`
      select id, row_number() over (order by score desc) as rank
      from (
        select d.id,
               ts_rank_cd(to_tsvector('simple', d.search_text), ${anyMatch}) as score,
               (${coverage}) as hits
        from documents d
        where d.deleted_at is null
          ${kind ? sql`and d.kind = ${kind}` : sql``}
          ${
            tag
              ? sql`and exists (
            select 1 from document_tags dt
            join tags t on t.id = dt.tag_id
            where dt.document_id = d.id and t.name = ${tag}
          )`
              : sql``
          }
      ) matched
      where hits >= ${required}
      order by score desc
      limit ${limit}
    `)

    return rows.map((row) => ({ id: row.id, rank: Number(row.rank) }))
  },
}
