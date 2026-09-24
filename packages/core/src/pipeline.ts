import type { LegContext, RetrievalLeg } from '@mimir/shared'
import { fuse, type FusionChannel } from './fuse.js'

/**
 * 检索编排：跑通道 → 融合 → 交给宿主取正文。
 *
 * ## 核心在这里只做三件事
 *
 *   1. **并行跑**所有已注册通道（它们之间没有依赖，串行只是白白等待）
 *   2. **融合**（RRF 的算法在 `fuse.ts`，这一层只负责把通道的产出接起来）
 *   3. **裁剪**到请求的数量
 *
 * 它不认识任何具体通道——`legs` 是注入的，加一个通道不需要改这个文件。
 * 这也是 D-032 那个判据的落点：「两条老通道改返回分块 id，编排层一行不用改」
 * 之所以成立，是因为两端（通道产出、宿主取正文）都换掉而中间这层不动。
 *
 * ## 取正文为什么是端口而不是实现在这里
 *
 * 正文存在宿主的 `documents` / `chunks` 表里，SQL 与 schema 都是宿主的知识。
 * core 定义「我需要什么样的片段」，宿主提供它——这样 core 不必依赖 ORM，
 * 也不会在换存储形态时被迫跟着改。
 */

/** 一条命中的片段，宿主取正文后回填 */
export interface SnippetPort {
  /**
   * 按检索单元 id 取片段。
   *
   * `query` 传进去是为了让宿主能做「命中位置周围的窗口」——
   * 没有它就只能退回头 N 个字，那正是 M0 的做法，也正是不准的原因。
   */
  load(ids: readonly string[], query: string): Promise<SnippetRow[]>
}

export interface SnippetRow {
  /** 检索单元 id（M0 是文档 id，M1 是分块 id） */
  id: string
  /** 所属文档。引用卡片用它分组与跳转 */
  documentId: string
  kind: string
  title: string
  path: string | null
  url: string | null
  /**
   * 上传件的格式与大小。
   *
   * 透传给前端的理由：中栏的列表项只有一种形态（`docs/DESIGN.md` §8.2），
   * 搜索命中与列表命中都要能渲染「PDF · 2.4 MB」。core 不认识这两个字段的
   * 语义（它只做检索），但**必须原样传递**——否则前端要按 id 再查一次，
   * 而那次查询会引入「列表里与搜索结果里显示不一致」的可能。
   */
  mime: string | null
  size: number | null
  text: string
  /** 相对**完整正文**的字符偏移，供界面高亮与跳转 */
  start: number
  end: number
}

export interface SearchRequest {
  q: string
  limit: number
  kind?: string
  tag?: string
  /** 只跑这些通道（`mode` 的落点）。省略表示跑全部已注册的 */
  only?: readonly string[]
}

export interface SearchHitResult {
  documentId: string
  kind: string
  title: string
  path: string | null
  url: string | null
  /** 见 `SnippetRow.mime` 的说明：core 只透传，不解释 */
  mime: string | null
  size: number | null
  snippet: { text: string; start: number; end: number }
  matchedBy: string[]
  score: number
}

export interface SearchOutcome {
  hits: SearchHitResult[]
  /** 实际跑了的通道名，便于排查「为什么没走向量」 */
  channels: string[]
  tookMs: number
  total: number
}

export interface PipelineDeps {
  /** 已注册且就绪的通道。由宿主装配时注入 */
  legs: readonly { leg: RetrievalLeg; weight: number }[]
  snippets: SnippetPort
  settings: {
    getNumber(key: string): Promise<number>
  }
}

/** 每通道候选数、RRF k 的键名。装配层与设置页共用这两个常量 */
export const KEY_PER_LEG_LIMIT = 'retrieval.perLegLimit'
export const KEY_RRF_K = 'retrieval.rrfK'

export interface Pipeline {
  search(request: SearchRequest): Promise<SearchOutcome>
  channels(): readonly string[]
}

export function createPipeline(deps: PipelineDeps): Pipeline {
  const selected = (only?: readonly string[]) =>
    only ? deps.legs.filter(({ leg }) => only.includes(leg.id)) : deps.legs

  return {
    channels: () => deps.legs.map(({ leg }) => leg.id),

    async search(request) {
      const startedAt = performance.now()
      const legs = selected(request.only)

      const perLegLimit = await deps.settings.getNumber(KEY_PER_LEG_LIMIT)
      const rrfK = await deps.settings.getNumber(KEY_RRF_K)

      const context: LegContext = {
        query: request.q,
        limit: perLegLimit,
        ...(request.kind ? { kind: request.kind } : {}),
        ...(request.tag ? { tag: request.tag } : {}),
      }

      // 并行跑所有通道。通道之间没有依赖，串行执行只是白白等待。
      // `Promise.all` 而不是 `allSettled`：一个通道抛错说明它坏了，
      // 静默吞掉会让「检索少了三分之一结果」变成查不出的问题
      const results = await Promise.all(
        legs.map(async ({ leg, weight }) => ({ leg, weight, hits: await leg.run(context) })),
      )

      const channels: FusionChannel[] = results
        // 空命中的通道不进融合：它的 `weight/(k+rank)` 无从算起，
        // 而保留它只会在「跑了哪些通道」里多一个没用的名字
        .filter(({ hits }) => hits.length > 0)
        .map(({ leg, weight, hits }) => ({ name: leg.id, items: hits, weight }))

      const fused = fuse(channels, rrfK).slice(0, request.limit)

      if (fused.length === 0) {
        return {
          hits: [],
          // 跑了但没有命中时仍要报告通道——「哪些通道跑了、都是 0」与
          // 「一个通道都没跑」对排查是完全不同的两件事
          channels: results.map(({ leg }) => leg.id),
          tookMs: Math.round(performance.now() - startedAt),
          total: 0,
        }
      }

      const rows = await deps.snippets.load(
        fused.map((item) => item.id),
        request.q,
      )
      const byId = new Map(rows.map((row) => [row.id, row]))

      const hits: SearchHitResult[] = fused.flatMap((item) => {
        const row = byId.get(item.id)
        // 融合结果里有、但取不到正文的条目直接丢掉：它多半是刚被删的文档，
        // 而一条没有正文的「命中」在界面上无法显示，也无法被引用
        if (!row) return []

        return [
          {
            documentId: row.documentId,
            kind: row.kind,
            title: row.title,
            path: row.path,
            url: row.url,
            mime: row.mime,
            size: row.size,
            snippet: { text: row.text, start: row.start, end: row.end },
            matchedBy: item.matchedBy,
            score: item.score,
          },
        ]
      })

      return {
        hits,
        channels: results.map(({ leg }) => leg.id),
        tookMs: Math.round(performance.now() - startedAt),
        total: hits.length,
      }
    },
  }
}

/**
 * 检索模式的落点：哪些通道参与。
 *
 * 默认模式**由注册表推导**（有就绪的向量通道 → hybrid），不是硬编码：
 * 用户配好 embedding 模型之后，不需要再去哪里把默认值改过来。
 */
export function channelsForMode(
  mode: string,
  available: readonly string[],
): readonly string[] | undefined {
  if (mode === 'keyword') {
    return available.filter((id) => id === 'keyword' || id === 'substring')
  }
  if (mode === 'semantic') {
    return available.filter((id) => id === 'vector')
  }
  // hybrid：全部（含未来新增的通道）
  return undefined
}

/** 有向量通道在册时，默认模式是 hybrid */
export function defaultMode(available: readonly string[]): 'keyword' | 'hybrid' {
  return available.includes('vector') ? 'hybrid' : 'keyword'
}
