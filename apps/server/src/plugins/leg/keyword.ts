import { sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { toQueryText } from '../../lib/segment.js'
import type { LegContext, RankedHit, RetrievalLeg } from './types.js'

/**
 * 关键词通道：jieba 预分词 + GIN 索引 + ts_rank_cd 排序。
 *
 * 这是主力召回通道，因为它有**词边界语义**——命中的是完整的词，
 * 不是碰巧包含这几个字的任意位置。
 *
 * 排序用 ts_rank_cd（cover density）而不是 ts_rank：前者更看重查询词
 * 在文档中的聚集程度，对「多个关键词都出现且挨得近」的文档给分更高。
 * 对「组件 性能 优化」这类多词查询，这比单纯按词频更接近人想要的。
 */
export const keywordLeg: RetrievalLeg = {
  name: 'keyword',
  weight: 1,

  async run({ query, limit, kind, tag }: LegContext): Promise<RankedHit[]> {
    const queryText = toQueryText(query)
    if (!queryText) return []

    const rows = await db.execute<{ id: string; rank: number }>(sql`
      select id, row_number() over (order by score desc) as rank
      from (
        select d.id,
               ts_rank_cd(
                 to_tsvector('simple', d.search_text),
                 plainto_tsquery('simple', ${queryText})
               ) as score
        from documents d
        where d.deleted_at is null
          and to_tsvector('simple', d.search_text) @@ plainto_tsquery('simple', ${queryText})
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
        order by score desc
        limit ${limit}
      ) ranked
    `)

    return rows.map((row) => ({ id: row.id, rank: Number(row.rank) }))
  },
}
