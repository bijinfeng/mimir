import { sql } from 'drizzle-orm'
import { queryTokens } from '@mimir/tokenizer'
import type { LegContext, PluginDatabase, RankedHit, RetrievalLeg } from '@mimir/shared'

/**
 * FTS5 查询串里的词元加引号：防止词元里的字符被当成 FTS5 查询语法
 * （内部的 `"` 按规则翻倍转义）。jieba 的 queryTokens 已滤掉标点，
 * 这里是第二道防线。
 */
function quote(token: string): string {
  return `"${token.replace(/"/g, '""')}"`
}

/**
 * 关键词通道——**SQLite 方言**（本地开发 / 桌面端，D-045）。
 *
 * 索引是 `chunks_fts`（FTS5 standalone 虚拟表，`chunks.search_text` 装的
 * 是 jieba 预分词后的空格分隔词元；`unicode61` 按空白切词，词元一一对应，
 * 见 `RESEARCH.md` §11.2）。维护靠 chunks 上的三个触发器，不靠本通道。
 *
 * **检索单元在 M1-C 从文档下沉到分块**（§4.8）：返回 chunk id，
 * 过滤仍然作用在所属文档上（分块只有正文与偏移，「这篇删了吗」是文档的属性）。
 *
 * 与 PG 方言（`keyword.pg.ts`）共享的语义：queryTokens 过滤 + D-014
 * 覆盖门槛。实现路径不同：
 *
 *   1. **覆盖集合**：每个词元一条 FTS 查询（走倒排索引），拿到「含这个词
 *      的分块 id 集合」——门槛要的是逐词命中数，一条 OR 查询给不出来
 *   2. **排序**：一条 OR 匹配查询按 `bm25()` 排好；join chunks / documents
 *      把删除态与 kind/tag 过滤下推（FTS5 表只有词元，没有元数据）
 *   3. **门槛过滤在内存里做**：候选已按相关度有序，顺序扫、达标才收，
 *      收满 limit 个即停
 *
 * 分数形状与 PG 不同（bm25 是无界负值、越负越相关），融合层走 RRF
 * 只看名次，不受影响（TECH §4.2）。
 */
export function createKeywordLegSqlite(db: PluginDatabase): RetrievalLeg {
  return {
    id: 'keyword',
    defaultWeight: 1,

    async run({ query, limit, kind, tag }: LegContext): Promise<RankedHit[]> {
      const tokens = queryTokens(query)
      if (tokens.length === 0) return []

      const required = Math.max(1, Math.ceil(tokens.length / 2))

      const coverage = await Promise.all(
        tokens.map(async (token) => {
          const rows = await db.execute<{ chunk_id: string }>(sql`
            select chunk_id from chunks_fts where chunks_fts match ${quote(token)}
          `)
          return new Set(rows.map((row) => row.chunk_id))
        }),
      )

      const anyMatch = tokens.map(quote).join(' OR ')
      const ranked = await db.execute<{ id: string; score: number }>(sql`
        select chunks_fts.chunk_id as id, bm25(chunks_fts) as score
        from chunks_fts
        join chunks c on c.id = chunks_fts.chunk_id
        join documents d on d.id = c.document_id
        where chunks_fts match ${anyMatch}
          and d.deleted_at is null
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
        order by score
      `)

      const hits: RankedHit[] = []
      for (const row of ranked) {
        const matched = coverage.filter((ids) => ids.has(row.id)).length
        if (matched < required) continue
        hits.push({ id: row.id, rank: hits.length + 1 })
        if (hits.length >= limit) break
      }
      return hits
    },
  }
}
