import { sql } from 'drizzle-orm'
import { queryTokens } from '@mimir/tokenizer'
import type { LegContext, PluginDatabase, RankedHit, RetrievalLeg } from '@mimir/shared'

/** ILIKE 的通配符转义：用户搜 "100%" 时不该变成模糊匹配 */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/**
 * 子串兜底通道——**Postgres 方言**（服务器部署路径，D-045）。
 *
 * `pg_trgm` + ILIKE，**逐词**匹配；SQLite 方言见 `substring.sqlite.ts`，
 * 通道语义（为什么需要兜底、门槛）的总体说明在 `substring.ts` 分发器里。
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
 * ## 为什么是逐词而不是整串
 *
 * 原实现拿**整个查询串**去 ILIKE。对「向量检索」这种短查询成立，
 * 但对一句话提问永远不可能命中——没有任何正文包含那整句话。
 * 于是这个「兜底」在真正需要它的场景（自然语言提问 + 分词不一致）里
 * 恰好是失效的。改成逐词之后它才真正承担起文档里写的那个职责。
 *
 * ## 门槛：与词级通道一致
 *
 * 一开始这里只要「命中任意一个」——理由是兜底通道应当「别漏」。
 * 但实测立刻发现它把精度也一起丢掉了：`zzzz不存在的内容zzzz` 切出三个词，
 * 「内容」出现在太多文档里，于是无意义查询也返回一堆结果。
 *
 * **兜底不等于不设门槛**：真正需要兜底的场景是「分词切法不一致」，
 * 那时 needle 只有一两个，门槛自然也就是 1；而不相干的长查询会被挡在外面。
 *
 * ## 检索单元是分块（M1-C，§4.8）
 *
 * 与关键词通道同一处改动：返回 chunk id 而不是文档 id，
 * 过滤仍作用在所属文档上。
 */
export function createSubstringLegPostgres(db: PluginDatabase): RetrievalLeg {
  return {
    id: 'substring',
    defaultWeight: 0.6,

    async run({ query, limit, kind, tag }: LegContext): Promise<RankedHit[]> {
      // 只留长度 ≥ 2 的词：单字符子串会命中几乎所有分块，没有区分度
      const needles = new Set(queryTokens(query).filter((token) => token.length >= 2))

      /**
       * 连续查询串本身也是一个候选。
       *
       * 这一步是为了「跨词边界的子串」这类查询——实测的两个例子：
       *
       * ```
       * 搜「件性」    → jieba 切成「件」「性」两个单字，全被上面的过滤器丢掉
       * 搜「HTMLDoc」→ jieba 切成「HTML」「Doc」，而正文里是连续的 HTMLDocument
       * ```
       *
       * 两种情况下用户想要的是「正文里包含这串字符」。判据很简单：
       * **查询里没有空白**就说明用户把它当成一个整体在搜，那就整体匹配一次。
       * 含空白的查询（如一句话提问）不能这么做。
       */
      const contiguous = query
        .trim()
        // 去掉首尾标点：用户打「向量检索？」时想搜的是「向量检索」
        .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '')
        .toLowerCase()
      if (contiguous.length >= 2 && !/\s/.test(contiguous)) needles.add(contiguous)

      const tokens = [...needles]
      if (tokens.length === 0) return []

      /**
       * 命中词数。它同时承担**门槛**与**排序的第一关键字**。
       *
       * 每个词一个 ILIKE 相加，所以 SQL 里不出现 OR——过滤与排序用同一个
       * 表达式，不会出现「按 A 过滤、按 B 排序」那种调不动的情况。
       * trigram 索引对 ILIKE '%x%' 仍然有效（按 trigram 过滤候选行），
       * 只是没法用它直接排序，而我们要的排序信息本来也不在索引里。
       */
      const coverage = sql.join(
        tokens.map((token) => sql`(c.content ilike ${`%${escapeLike(token)}%`} escape '\\')::int`),
        sql` + `,
      )

      const required = Math.max(1, Math.ceil(tokens.length / 2))

      const rows = await db.execute<{ id: string; rank: number }>(sql`
        select id, row_number() over (order by hits desc, hit_pos asc, body_len asc) as rank
        from (
          select c.id,
                 (${coverage}) as hits,
                 length(c.content) as body_len,
                 least(${sql.join(
                   tokens.map(
                     (token) =>
                       sql`coalesce(nullif(strpos(lower(c.content), lower(${token})), 0), 2147483647)`,
                   ),
                   sql`, `,
                 )}) as hit_pos
          from chunks c
          join documents d on d.id = c.document_id
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
        order by hits desc, hit_pos asc, body_len asc
        limit ${limit}
      `)

      return rows.map((row) => ({ id: row.id, rank: Number(row.rank) }))
    },
  }
}
