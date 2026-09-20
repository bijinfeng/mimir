import { sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import type { LegContext, RankedHit, RetrievalLeg } from './types.js'

/** ILIKE 的通配符转义：用户搜 "100%" 时不该变成模糊匹配 */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/**
 * 子串兜底通道：pg_trgm 索引 + ILIKE。
 *
 * 为什么需要它：如果索引时 jieba 把「组件」切成了「组」「件」，
 * 用户搜「组件」在关键词通道上永远是 0 命中。子串匹配不受分词结果影响，
 * 是分词器的兜底。
 *
 * 代价是没有词边界语义（搜「件」也能命中「组件」），所以权重低于关键词通道。
 *
 * 排序按「首次出现位置越靠前越好、文档越短越好」——比算全文相似度便宜得多，
 * 而且 trigram 索引只负责过滤、不负责排序，这样能避免全表算 similarity。
 */
export const substringLeg: RetrievalLeg = {
  name: 'substring',
  weight: 0.6,

  async run({ query, limit, kind, tag }: LegContext): Promise<RankedHit[]> {
    const needle = query.trim()
    // 单字符查询会命中几乎所有文档，没有区分度，直接放弃
    if (needle.length < 2) return []

    const pattern = `%${escapeLike(needle)}%`

    const rows = await db.execute<{ id: string; rank: number }>(sql`
      select id, row_number() over (order by hit_pos asc, body_len asc) as rank
      from (
        select d.id,
               strpos(lower(d.body), lower(${needle})) as hit_pos,
               length(d.body) as body_len
        from documents d
        where d.deleted_at is null
          and d.body ilike ${pattern} escape '\\'
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
        order by hit_pos asc, body_len asc
        limit ${limit}
      ) ranked
    `)

    return rows.map((row) => ({ id: row.id, rank: Number(row.rank) }))
  },
}
