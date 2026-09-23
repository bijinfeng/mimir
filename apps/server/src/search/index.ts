import { inArray, sql } from 'drizzle-orm'
import type { SearchHit, SearchResponse } from '@mimir/shared'
import { channelsForMode, createPipeline, defaultMode, type SnippetPort } from '@mimir/core'
import { db } from '../db/client.js'
import { documents } from '../db/schema.js'
import { assemble } from '../plugins/host.js'

/**
 * 检索入口（宿主的适配层）。
 *
 * ## 这一层现在只剩三件事
 *
 *   1. 从装配层取出**已就绪的通道**（含设置里的权重），交给 core 的检索流程
 *   2. 提供 `snippet` 端口——取正文是宿主的知识（表结构、SQL），不是 core 的
 *   3. 把结果形状对齐成 `SearchResponse`（前端契约）
 *
 * 编排本身（并行跑通道、RRF 融合、裁剪）在 `@mimir/core` 的 `pipeline.ts`。
 * 它不认识任何具体通道，所以 M1 加向量通道时这个文件也不用改——
 * 那正是当初把 `leg` 留成接缝想要的效果（`docs/TECH.md` §7.3）。
 */

/** 片段窗口：命中的正文字符区间，前方留 SNIPPET_LEAD 个字符做上下文 */
const SNIPPET_LEAD = 80
const SNIPPET_LENGTH = 240

export interface SearchParams {
  q: string
  limit: number
  kind?: string
  tag?: string
  /** 检索模式。省略时由注册表推导（有就绪的向量通道 → hybrid） */
  mode?: string
}

/**
 * 取正文的端口实现。
 *
 * **只在最终入选的 N 条上取正文**，并在 SQL 里直接截出片段窗口——
 * 不为候选集取正文，那会是几十倍的浪费。
 *
 * 片段偏移基于**完整正文**，前端可以用它做「跳回原文并高亮」。
 * M0 用查询词的首次出现位置当窗口；M1 有分块表之后这里换成
 * 「按分块自身的偏移取」，界面与契约都不用改（`docs/DECISIONS.md` D-032）。
 */
const snippetPort: SnippetPort = {
  async load(ids, query) {
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
        text: sql<string>`
          case
            when ${hitPos} > 0
              then substring(${documents.body} from greatest(1, ${hitPos} - ${SNIPPET_LEAD}) for ${SNIPPET_LENGTH})
            else substring(${documents.body} from 1 for ${SNIPPET_LENGTH})
          end
        `.as('snippet_text'),
        start: sql<number>`
          case
            when ${hitPos} > 0 then greatest(0, ${hitPos} - ${SNIPPET_LEAD + 1})
            else 0
          end
        `.as('snippet_start'),
      })
      .from(documents)
      .where(inArray(documents.id, ids))

    return rows.map((row) => ({
      id: row.id,
      documentId: row.id,
      kind: row.kind,
      title: row.title,
      path: row.path,
      url: row.url,
      text: row.text,
      start: Number(row.start),
      end: Number(row.start) + row.text.length,
    }))
  },
}

/**
 * 已就绪的通道 + 权重。
 *
 * **权重来自设置**（`retrieval.<id>.weight`），所以调权重不用改代码也不用重启。
 * 键名由这里拼——实现自己不知道这个拼法，它只在 `params` 里声明。
 */
async function readyLegs() {
  const { seams, settings } = assemble()

  const implementations = seams.leg.implementations()
  const entries = await Promise.all(
    implementations.map(async ({ declaration, impl }) => ({
      leg: impl,
      weight: await settings.getNumber(`retrieval.${declaration.id}.weight`),
    })),
  )

  return entries
}

export async function search(params: SearchParams): Promise<SearchResponse> {
  const { settings } = assemble()
  const legs = await readyLegs()
  const available = legs.map(({ leg }) => leg.id)
  const mode = params.mode ?? defaultMode(available)

  const pipeline = createPipeline({ legs, snippets: snippetPort, settings })
  const outcome = await pipeline.search({
    q: params.q,
    limit: params.limit,
    ...(params.kind ? { kind: params.kind } : {}),
    ...(params.tag ? { tag: params.tag } : {}),
    ...(channelsForMode(mode, available) ? { only: channelsForMode(mode, available) } : {}),
  })

  const hits: SearchHit[] = outcome.hits.map((hit) => ({
    documentId: hit.documentId,
    kind: hit.kind as SearchHit['kind'],
    title: hit.title,
    path: hit.path,
    url: hit.url,
    snippet: hit.snippet,
    matchedBy: hit.matchedBy,
    score: hit.score,
  }))

  return {
    mode: mode as SearchResponse['mode'],
    channels: outcome.channels as SearchResponse['channels'],
    tookMs: outcome.tookMs,
    // `total` 是本次返回的命中条数，不是库里的总数——契约里它一直是这个含义
    total: hits.length,
    hits,
  }
}

/** 设置页的「融合参数」面板用它：当前生效的 RRF k 与各通道权重 */
export async function retrievalParameters(): Promise<{
  rrfK: number
  perLegLimit: number
  legs: { name: string; weight: number }[]
}> {
  const { settings } = assemble()
  const legs = await readyLegs()

  return {
    rrfK: await settings.getNumber('retrieval.rrfK'),
    perLegLimit: await settings.getNumber('retrieval.perLegLimit'),
    legs: legs.map(({ leg, weight }) => ({ name: leg.id, weight })),
  }
}
