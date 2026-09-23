import { inArray, sql } from 'drizzle-orm'
import type { SearchHit, SearchResponse } from '@mimir/shared'
import { db } from '../db/client.js'
import { documents } from '../db/schema.js'
import { retrievalLegs, type LegContext } from '../plugins/leg/index.js'
import { fuse, type FusionChannel } from './fuse.js'

/**
 * 检索入口（编排层）。
 *
 * 三步：
 *   1. 并行跑所有已注册的通道，各自产出已排序的 id 列表
 *   2. 融合层做加权 RRF，得到统一排序
 *   3. 只对最终入选的 N 条取正文并生成片段
 *
 * 这一层不认识任何具体的通道——加通道只需改 plugins/leg/index.ts。
 */

/** 每个通道先各取这么多候选再融合。取得比最终结果多，融合才有意义。 */
export const PER_LEG_LIMIT = 50

/** 片段窗口：命中的正文字符区间，前方留 SNIPPET_LEAD 个字符做上下文 */
const SNIPPET_LEAD = 80
const SNIPPET_LENGTH = 240

export interface SearchParams {
  q: string
  limit: number
  kind?: string
  tag?: string
}

export async function search(params: SearchParams): Promise<SearchResponse> {
  const startedAt = performance.now()

  const context: LegContext = {
    query: params.q,
    limit: PER_LEG_LIMIT,
    ...(params.kind ? { kind: params.kind } : {}),
    ...(params.tag ? { tag: params.tag } : {}),
  }

  // 并行跑所有通道。通道之间没有依赖，串行执行只是白白等待。
  const legResults = await Promise.all(
    retrievalLegs.map(async (leg) => ({ leg, hits: await leg.run(context) })),
  )

  const channels: FusionChannel[] = legResults
    .filter(({ hits }) => hits.length > 0)
    .map(({ leg, hits }) => ({ name: leg.name, items: hits, weight: leg.weight }))

  const fused = fuse(channels).slice(0, params.limit)

  if (fused.length === 0) {
    return {
      mode: 'keyword',
      channels: [],
      tookMs: Math.round(performance.now() - startedAt),
      total: 0,
      hits: [],
    }
  }

  const rows = await fetchHits(
    fused.map((item) => item.id),
    params.q,
  )
  const byId = new Map(rows.map((row) => [row.id, row]))

  const hits: SearchHit[] = fused.flatMap((item) => {
    const row = byId.get(item.id)
    if (!row) return []

    return [
      {
        documentId: row.id,
        kind: row.kind,
        title: row.title,
        path: row.path,
        url: row.url,
        snippet: {
          text: row.snippetText,
          start: Number(row.snippetStart),
          end: Number(row.snippetStart) + row.snippetText.length,
        },
        matchedBy: item.matchedBy as SearchHit['matchedBy'],
        score: item.score,
      },
    ]
  })

  return {
    mode: 'keyword',
    channels: channels.map((channel) => channel.name) as SearchResponse['channels'],
    tookMs: Math.round(performance.now() - startedAt),
    total: hits.length,
    hits,
  }
}

interface HitRow {
  id: string
  kind: SearchHit['kind']
  title: string
  path: string | null
  url: string | null
  snippetText: string
  snippetStart: number
}

/**
 * 只对最终入选的文档取正文，并在 SQL 里直接截出片段窗口。
 * 片段偏移基于**完整正文**，前端可以用它做「跳回原文并高亮」。
 */
async function fetchHits(ids: string[], query: string): Promise<HitRow[]> {
  if (ids.length === 0) return []

  const needle = query.trim()
  const hitPos = sql<number>`strpos(lower(${documents.body}), lower(${needle}))`

  const rows = await db
    .select({
      id: documents.id,
      kind: documents.kind,
      title: documents.title,
      path: documents.path,
      url: documents.url,
      snippetText: sql<string>`
        case
          when ${hitPos} > 0
            then substring(${documents.body} from greatest(1, ${hitPos} - ${SNIPPET_LEAD}) for ${SNIPPET_LENGTH})
          else substring(${documents.body} from 1 for ${SNIPPET_LENGTH})
        end
      `.as('snippet_text'),
      snippetStart: sql<number>`
        case
          when ${hitPos} > 0 then greatest(0, ${hitPos} - ${SNIPPET_LEAD + 1})
          else 0
        end
      `.as('snippet_start'),
    })
    .from(documents)
    .where(inArray(documents.id, ids))

  return rows as HitRow[]
}
