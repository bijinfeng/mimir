import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { EmbedPort, SearchHit, SearchResponse } from '@mimir/shared'
import { channelsForMode, createPipeline, defaultMode, type SnippetPort } from '@mimir/core'
import { db } from '../db/client.js'
import { chunks, documents } from '../db/schema.js'
import { stripMarkdown } from '../lib/text.js'
import { assemble } from '../plugins/host.js'
import { callEmbed, modelName } from '../services/model.js'

/**
 * 检索入口（宿主的适配层）。
 *
 * ## 两层职责（M1-C 之后）
 *
 *   1. **编排**：从装配层取出**已就绪**的通道（含设置里的权重），
 *      连同向量端口一起交给 core 的 `pipeline.ts`
 *   2. **组装**：把分块级的命中折回前端的契约（`SearchResponse`）——
 *      取正文、合并相邻分块、每篇限额
 *
 * 第二件事在 M1-C 从「按文档取片段」变成了「按分块取，再合并」：
 * 检索单元下沉到分块（§4.8），而**前端契约一个字没改**——
 * `SearchHit` 仍是 `{documentId, title, snippet:{text,start,end}, matchedBy}`。
 *
 * ## 就绪性：未就绪的通道不进编排
 *
 * `computeStatus` 是 core 的那一份规则（§7.4）。用它而不是在这里另写
 * 一套「有没有配 embed」的判断——两处判断必然漂移，而漂移的症状是
 * 「设置页说不可用，检索却调了它」（或反过来）。
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
 * 取正文的端口实现——**检索单元是分块**（M1-C）。
 *
 * 与 M0 的区别：那时候这里是「拿文档 id 取文档正文，再用查询词找位置」——
 * 位置是**猜的**（查询词首次出现），猜不到就退回头 240 字。
 * 现在分块自带 `[start_at, end_at)`，那是它的真实位置，不需要猜。
 *
 * **只在最终入选的 N 条上取正文**，不为候选集取正文——那会是几十倍的浪费。
 *
 * 展示文本用 `stripMarkdown` 洗过，与库卡片走同一条规则（`lib/text.ts`）：
 * 同一份文档在两种入口下读起来是同一个东西。**两个偏移不动**——
 * 它们是「这段取自正文的哪个区间」，供「跳回原文并高亮」用。
 */
const snippetPort: SnippetPort = {
  async load(ids, _query) {
    if (ids.length === 0) return []

    const rows = await db
      .select({
        id: chunks.id,
        documentId: chunks.documentId,
        content: chunks.content,
        startAt: chunks.startAt,
        endAt: chunks.endAt,
        heading: chunks.heading,
        idx: chunks.idx,
        kind: documents.kind,
        title: documents.title,
        path: documents.path,
        url: documents.url,
        mime: documents.mime,
        size: documents.size,
      })
      .from(chunks)
      .innerJoin(documents, eq(documents.id, chunks.documentId))
      .where(and(inArray(chunks.id, ids), isNull(documents.deletedAt)))

    return rows.map((row) => {
      /**
       * 片段从**分块自己**的区间取，但同时保留「窗口」这一层：
       * 一段 500 字的块整个塞进列表项太长，界面要的是「命中附近的一段」。
       *
       * 窗口仍然按查询词在**块内**定位（M0 的做法），但它的基准变了——
       * 不再是「整篇正文里猜」，而是「这一段就是命中段」，所以猜错也
       * 只在 500 字内偏一点。找不到时退回块首，而不是整篇文档的开头。
       */
      const needle = _query.trim().toLowerCase()
      const pos = needle === '' ? -1 : row.content.toLowerCase().indexOf(needle)
      const offset = pos >= 0 ? Math.max(0, pos - SNIPPET_LEAD) : 0
      const raw = row.content.slice(offset, offset + SNIPPET_LENGTH)

      const text = stripMarkdown(raw) || raw
      return {
        id: row.id,
        documentId: row.documentId,
        kind: row.kind,
        title: row.title,
        path: row.path,
        url: row.url,
        mime: row.mime,
        size: row.size,
        text,
        // 偏移相对**完整正文**：分块自己的起点 + 块内窗口偏移
        start: row.startAt + offset,
        end: row.startAt + offset + raw.length,
      }
    })
  },
}

/**
 * 已就绪的通道 + 权重。
 *
 * **权重来自设置**（`retrieval.<id>.weight`），所以调权重不用改代码也不用重启。
 * 键名由这里拼——实现自己不知道这个拼法，它只在 `params` 里声明。
 *
 * **未就绪的通道不进编排**（M1-C）：向量通道的 `unavailable` 声明的是
 * 「还没有配向量化模型」，而状态由 core 统一算（§7.4）。
 * 不过滤的话，`hybrid` 会带上一个永远返回空的通道——
 * 界面上的 `channels` 里会出现它，而「为什么没走向量」就查不出来了。
 */
async function readyLegs() {
  const { seams, settings, descriptors } = assemble()
  const all = seams.leg.implementations()

  // 状态从装配层算好的描述符里取——那是唯一一份状态规则
  const statusById = new Map((await descriptors()).map((item) => [item.id, item.status]))

  const ready = all.filter(({ declaration }) => {
    const status = statusById.get(declaration.id)
    return status?.kind === 'active'
  })

  return Promise.all(
    ready.map(async ({ declaration, impl }) => ({
      leg: impl,
      weight: await settings.getNumber(`retrieval.${declaration.id}.weight`),
    })),
  )
}

/**
 * 向量端口：把「查什么模型、怎么造向量」收在这里。
 *
 * 通道只拿到一个 `EmbedPort`，它不知道密钥在哪、用的哪家协议
 * （那是 provider 接缝的知识，§7.4）。维度从设置来——
 * 它与 `chunk_embeddings.dimension` 一起决定查哪批行。
 */
async function embedPort(): Promise<EmbedPort | undefined> {
  const { settings } = assemble()
  const model = await modelName('embed')
  if (model === '') return undefined

  const dimension = await settings.getNumber('model.embed.dimensions')

  return {
    model,
    dimension,
    async of(text: string) {
      const [vector] = await callEmbed([text], null)
      if (!vector) throw new Error('向量化没有返回结果')
      return vector
    },
  }
}

export async function search(params: SearchParams): Promise<SearchResponse> {
  const outcome = await searchChunks(params)

  // 前端契约在 M1-C 一个字没改：分块 id 与完整正文到这里被折掉，
  // 只留界面需要的那些字段（`SearchHit` 的解释见 shared/search.ts）
  return {
    mode: outcome.mode as SearchResponse['mode'],
    channels: outcome.channels as SearchResponse['channels'],
    tookMs: outcome.tookMs,
    // `total` 是本次返回的命中条数，不是库里的总数——契约里它一直是这个含义
    total: outcome.hits.length,
    hits: outcome.hits.map((hit) => ({
      documentId: hit.documentId,
      kind: hit.kind as SearchHit['kind'],
      title: hit.title,
      path: hit.path,
      url: hit.url,
      mime: hit.mime,
      size: hit.size,
      snippet: { text: hit.snippet.text, start: hit.snippet.start, end: hit.snippet.end },
      matchedBy: hit.matchedBy,
      score: hit.score,
    })),
  }
}
/**
 * 分块级的检索结果——**问答与引用组装用的是这一份**。
 *
 * 为什么不先折成 `SearchHit` 再反推分块 id：那个反推要么靠偏移猜、
 * 要么再查一次库，两条路都是把一个已有的信息丢掉再找回来。
 * 界面路径要的是「一条命中一个片段」，问答路径要的是「分块 + 相邻合并」——
 * 两个消费者对形状的需求本来就不同，让它们各自拿到合适的形状。
 *
 * `SearchHit`（前端契约）由 `search()` 折出来，所以界面不受影响。
 */
export interface ChunkHit {
  chunkId: string
  documentId: string
  kind: string
  title: string
  path: string | null
  url: string | null
  mime: string | null
  size: number | null
  idx: number
  snippet: { text: string; start: number; end: number }
  matchedBy: string[]
  score: number
}

export async function searchChunks(params: SearchParams): Promise<{
  mode: string
  channels: string[]
  tookMs: number
  hits: ChunkHit[]
}> {
  const { settings } = assemble()
  const legs = await readyLegs()
  const available = legs.map(({ leg }) => leg.id)
  const mode = params.mode ?? defaultMode(available)
  const embed = await embedPort()

  const pipeline = createPipeline({
    legs,
    snippets: snippetPort,
    settings,
    ...(embed ? { embed } : {}),
  })
  const outcome = await pipeline.search({
    q: params.q,
    limit: params.limit,
    ...(params.kind ? { kind: params.kind } : {}),
    ...(params.tag ? { tag: params.tag } : {}),
    ...(channelsForMode(mode, available) ? { only: channelsForMode(mode, available) } : {}),
  })

  return {
    mode,
    channels: outcome.channels,
    tookMs: outcome.tookMs,
    hits: outcome.hits.map((hit) => ({
      // 检索单元就是分块，所以 id 就是分块 id（M1-C 下沉的直接结果）
      chunkId: hit.id,
      documentId: hit.documentId,
      kind: hit.kind,
      title: hit.title,
      path: hit.path,
      url: hit.url,
      mime: hit.mime,
      size: hit.size,
      // idx 由分块 id 的冒号后半段给出（确定性 id 的价值之一：
      // 相邻判断不需要再查一次库）
      idx: idxOfChunkId(hit.id),
      snippet: hit.snippet,
      matchedBy: hit.matchedBy,
      score: hit.score,
    })),
  }
}

/** 从确定性 id（`文档 id:序号`）取序号。取不到时给一个不会与相邻块合并的大值 */
function idxOfChunkId(id: string): number {
  const tail = id.slice(id.lastIndexOf(':') + 1)
  const parsed = Number(tail)
  return Number.isInteger(parsed) ? parsed : Number.MAX_SAFE_INTEGER
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

/**
 * 引用组装（分块 → 引用卡片，§4.11 的四步）。
 *
 * ```
 *   1. 按融合分排序取前 N
 *   2. 同一文档的**相邻分块合并**（idx 连续则合成一段，偏移取并集）
 *   3. 每篇文档最多贡献 MAX_CHUNKS_PER_DOC 条，避免长文霸屏
 *   4. 仍按总分排序，编号与 citations 数组下标一一对应
 * ```
 *
 * 第 2、3 步是 M0 的 trace 里已经承诺过、而当时做不到的行为
 * （「读取命中的文档并合并相邻分块」）。
 *
 * **这不是给界面用的**（界面保持「一条命中一个片段」），它给的是
 * **问答的上下文**：模型看到合并后的整段，而不是同一段话被切成三块
 * 重复三次。
 *
 * 合并需要分块的**完整正文**（片段窗口只有 240 字），所以这里再取一次——
 * 只对最终入选的前 N 条取，与 `snippetPort` 的取舍同一条理由。
 */
export interface AssembledCitation {
  documentId: string
  /** 与 `SearchHit.kind` 同一套取值（来源），不在这里收窄成联合——
   *  收窄要在五处各断言一次，而 `Citation` 的构造点会自己校验 */
  kind: string
  title: string
  heading: string | null
  text: string
  start: number
  end: number
  matchedBy: string[]
}

export async function assembleCitations(
  hits: ChunkHit[],
  options: { limit: number; maxPerDoc: number },
): Promise<AssembledCitation[]> {
  const top = hits.slice(0, options.limit)
  if (top.length === 0) return []

  const ids = top.map((hit) => hit.chunkId)
  const rows = await db
    .select({
      id: chunks.id,
      heading: chunks.heading,
      content: chunks.content,
      startAt: chunks.startAt,
      endAt: chunks.endAt,
    })
    .from(chunks)
    .where(inArray(chunks.id, ids))
  const byId = new Map(rows.map((row) => [row.id, row]))

  interface Piece {
    idx: number
    start: number
    end: number
    content: string
    heading: string | null
  }

  /** 按文档分组。**组内顺序按融合后的名次**——它决定保留哪几段（第 3 步） */
  const byDocument = new Map<
    string,
    { base: ChunkHit; pieces: Piece[]; matchedBy: Set<string>; best: number }
  >()

  for (const hit of top) {
    const group = byDocument.get(hit.documentId) ?? {
      base: hit,
      pieces: [],
      matchedBy: new Set<string>(),
      best: hit.score,
    }
    for (const name of hit.matchedBy) group.matchedBy.add(name)
    group.best = Math.max(group.best, hit.score)

    const row = byId.get(hit.chunkId)
    group.pieces.push(
      row
        ? {
            idx: hit.idx,
            start: row.startAt,
            end: row.endAt,
            content: row.content,
            heading: row.heading,
          }
        : {
            // 分块读不到时退回命中片段（它至少能显示）——
            // 这在刚删掉文档时会发生，而一条没有正文的引用卡片是空白
            idx: hit.idx,
            start: hit.snippet.start,
            end: hit.snippet.end,
            content: hit.snippet.text,
            heading: null,
          },
    )

    byDocument.set(hit.documentId, group)
  }

  const assembled: AssembledCitation[] = []

  for (const group of byDocument.values()) {
    group.pieces.sort((a, b) => a.start - b.start)

    /** 合并 idx 连续（或偏移相接）的相邻块 */
    const merged: Piece[] = []
    for (const piece of group.pieces) {
      const last = merged[merged.length - 1]
      const contiguous = last !== undefined && piece.idx === last.idx + 1
      if (contiguous) {
        last.content += piece.content
        last.end = Math.max(last.end, piece.end)
      } else {
        merged.push({ ...piece })
      }
    }

    /**
     * 每篇最多 `maxPerDoc` 条（第 3 步）。
     *
     * 取**分最高的那几段**——组内是按融合名次进来的，所以直接取前几条。
     * 长文有三十段命中时，把整个文档塞进上下文会挤掉别的文档。
     */
    for (const piece of merged.slice(0, options.maxPerDoc)) {
      assembled.push({
        documentId: group.base.documentId,
        kind: group.base.kind,
        title: group.base.title,
        heading: piece.heading,
        text: piece.content,
        start: piece.start,
        end: piece.end,
        matchedBy: [...group.matchedBy],
      })
    }
  }

  // 第 4 步：仍按总分排序，编号与 citations 下标一一对应
  return assembled.toSorted((a, b) => b.matchedBy.length - a.matchedBy.length || a.start - b.start)
}
