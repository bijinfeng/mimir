import { scopePredicate } from './scope.js'
import { sql } from 'drizzle-orm'
import { queryTokens } from '@mimir/tokenizer'
import type { LegContext, PluginDatabase, RankedHit, RetrievalLeg } from '@mimir/shared'

/**
 * 子串兜底通道——**SQLite 方言**（本地开发 / 桌面端，D-045）。
 *
 * 门槛与「逐词 + 连续串」的选取逻辑与 PG 方言（`substring.pg.ts`）完全一致，
 * 排序键也相同：命中词数 desc → 首次出现位置 asc → 分块长度 asc。
 * 差异只在算子：
 *
 *   - PG 的 `ILIKE '%x%'`（trigram 加速）→ SQLite 的 `instr(lower(content), lower(x))`
 *     。`instr` 是字面匹配，天生没有 `%` / `_` 通配语义，不需要 PG 版那套
 *     escape 处理；两侧对含通配符的输入行为一致
 *   - SQLite 的 `lower()` 只对 ASCII 生效——带变音符的拉丁文大小写与 PG
 *     行为不同（中文没有大小写，不受影响）。TECH §10 记了这条方言差异
 *   - SQLite 的 `min(x)` **单参数是聚合函数**（对整列取最小），`min(a, b)`
 *     两个以上参数才是标量。所以单词元时直接用表达式，多词元才包 `min(...)`
 *
 * 没有 trigram 索引，这里是全表扫描——分块表比文档表大（一篇几十段），
 * 但仍在个人库规模内（`.trellis/spec/project/research.md` §11）；分块也天然更短，
 * 扫起来的字节量并不比文档表大多少。
 *
 * **检索单元在 M1-C 从文档下沉到分块**（§4.8）：返回 chunk id，
 * 过滤仍然作用在所属文档上。
 */
export function createSubstringLegSqlite(db: PluginDatabase): RetrievalLeg {
  return {
    id: 'substring',
    defaultWeight: 0.6,

    async run({ query, limit, kind, tag, retrievalScope }: LegContext): Promise<RankedHit[]> {
      // 只留长度 ≥ 2 的词：单字符子串会命中几乎所有分块，没有区分度
      const needles = new Set(queryTokens(query).filter((token) => token.length >= 2))

      // 连续查询串本身也是一个候选（跨词边界的子串，如「件性」「HTMLDoc」）。
      // 查询里没有空白时才整体匹配一次，规则与 PG 方言一致
      const contiguous = query
        .trim()
        .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '')
        .toLowerCase()
      if (contiguous.length >= 2 && !/\s/.test(contiguous)) needles.add(contiguous)

      const tokens = [...needles]
      if (tokens.length === 0) return []

      const required = Math.max(1, Math.ceil(tokens.length / 2))

      // 命中词数：同时承担门槛（外层 WHERE）与排序的第一关键字
      const coverage = sql.join(
        tokens.map((token) => sql`(instr(lower(c.content), lower(${token})) > 0)`),
        sql` + `,
      )

      const hitPosExprs = tokens.map(
        (token) => sql`coalesce(nullif(instr(lower(c.content), lower(${token})), 0), 2147483647)`,
      )
      // 无命中约定为 int 上限（排到最后）；单参数 min 是聚合，见文件头注释
      const hitPos =
        hitPosExprs.length === 1 ? hitPosExprs[0]! : sql`min(${sql.join(hitPosExprs, sql`, `)})`

      const rows = await db.execute<{ id: string; rank: number }>(sql`
        select id, row_number() over (order by hits desc, hit_pos asc, body_len asc) as rank
        from (
          select c.id,
                 (${coverage}) as hits,
                 length(c.content) as body_len,
                 (${hitPos}) as hit_pos
          from chunks c
          join documents d on d.id = c.document_id
          where d.deleted_at is null
            and ${scopePredicate(retrievalScope)}
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
        order by hits desc, hit_pos asc, body_len asc
        limit ${limit}
      `)

      return rows.map((row) => ({ id: row.id, rank: Number(row.rank) }))
    },
  }
}
