import { StreamProcessor } from '@tanstack/ai'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import type { Citation, Trace, TraceStep, RetrievalScope } from '@mimir/shared'
import { queryTokens, toQueryText } from '@mimir/tokenizer'
import { assemble } from '../plugins/host.js'
import { assembleCitations, searchChunks, type AssembledCitation } from '../search/index.js'
import { getConversation } from './conversations.js'
import { requireFreshSources } from '../search/source-freshness.js'
import { normalizeRetrievalScope } from './retrieval-scope.js'
import { selectedConversationMessages } from './chat-history-selection.js'

const CONTEXT_CHAR_BUDGET = 6000
const PER_CITATION_CHARS = 1200
const CHANNEL_LABELS: Record<string, string> = {
  keyword: '词级召回',
  substring: '子串兜底',
  vector: '语义向量',
}
export const SYSTEM_PROMPT = `你是 mimir 的问答助手，帮用户回顾他自己的知识库。

规则：
1. 只根据【资料】回答。资料里没有的内容，明确说「知识库里没有相关记录」，不要用通用知识补全。
2. 资料里的事实要标注来源编号，写成 [1] [2] 这样的形式。
3. 用中文回答，简洁直接。不要写「根据提供的资料」这类套话。
4. 如果资料只能部分回答问题，说明哪部分能答、哪部分没有记录。`

export interface Retrieval {
  scope: RetrievalScope
  verifySources: boolean
  citations: Citation[]
  trace: Trace
  context: string
  total: number
  hitDocumentCount: number
  startedAt: number
}

/** Both streaming and JSON answers use the same bounded, scope-aware chunk preparation. */
export async function prepareRetrieval(
  question: string,
  inputScope: RetrievalScope = { type: 'all' },
  options: { verifySources?: boolean } = {},
): Promise<Retrieval> {
  const scope = await normalizeRetrievalScope(inputScope)
  const startedAt = performance.now()
  const keywords = toQueryText(question).split(' ').filter(Boolean)
  const steps: TraceStep[] = [
    {
      icon: 'think',
      text:
        scope.type === 'document'
          ? '在指定文档内查找相关段落'
          : scope.type === 'folder'
            ? `在 ${scope.path} 及其子目录查找`
            : '在知识库里查找相关内容',
    },
    { icon: 'search', text: '用 jieba 切分查询词', keywords },
  ]
  const result = await searchChunks({
    q: question,
    limit: 8,
    retrievalScope: scope,
    verifySources: options.verifySources ?? true,
  })
  steps.push({
    icon: 'search',
    text: '通道召回结果',
    meta: result.channels
      .map(
        (name) =>
          `${CHANNEL_LABELS[name] ?? name} ${result.hits.filter((hit) => hit.matchedBy.includes(name)).length} 段`,
      )
      .join(' · '),
  })
  const { settings } = assemble()
  const assembled = await assembleCitations(result.hits, {
    limit: 8,
    maxPerDoc: await settings.getNumber('retrieval.maxChunksPerDoc'),
    retrievalScope: scope,
    verifySources: options.verifySources ?? true,
  })
  const citations = buildCitations(assembled, question)
  const hitDocumentCount = new Set(citations.map((item) => item.documentId)).size
  if (citations.length)
    steps.push({
      icon: 'read',
      text: '读取相关段落并合并相邻分块',
      meta: `来自 ${hitDocumentCount} 个文档，共 ${citations.length} 段`,
    })
  steps.push({
    icon: 'check',
    text: citations.length ? '根据本次引用生成回答' : '当前范围未找到相关正文，未调用模型',
  })
  return {
    scope,
    verifySources: options.verifySources ?? true,
    citations,
    trace: finishTrace(steps, 1, result.hits.length ? 2 : 1, startedAt),
    context: formatContext(citations),
    total: citations.length,
    hitDocumentCount,
    startedAt,
  }
}

/**
 * 引用卡片由**组装好的分块段**给出（M1-C）。
 *
 * 与 M0 的区别：那时候输入是「文档级命中 + 现截的窗口」，位置是猜的；
 * 现在每段自带 `[start, end)` 的**真实偏移**，引用卡片上的
 * 「跳回原文并高亮」因此能落在正确的位置。
 */
function buildCitations(assembled: AssembledCitation[], question: string): Citation[] {
  const citations: Citation[] = []
  let budget = CONTEXT_CHAR_BUDGET

  for (const item of assembled) {
    if (budget <= 0) break
    const length = Math.min(PER_CITATION_CHARS, budget)
    // Adjacent hits can merge into a long passage. Keep its most relevant window,
    // including the tail, instead of always truncating the start after fusion.
    const tokens = queryTokens(question)
    let offset = 0
    let best = -1
    for (
      let position = 0;
      position < item.text.length;
      position += Math.max(1, Math.floor(length / 2))
    ) {
      const candidateOffset = Math.min(position, Math.max(0, item.text.length - length))
      const window = item.text.slice(candidateOffset, candidateOffset + length).toLowerCase()
      const score = tokens.reduce(
        (sum, token) => sum + (window.includes(token.toLowerCase()) ? 1 : 0),
        0,
      )
      if (score > best) {
        best = score
        offset = candidateOffset
      }
    }
    const text = item.text.slice(offset, offset + length)
    budget -= text.length

    citations.push({
      documentId: item.documentId,
      // 来源的联合类型在契约里收窄，而检索层只保证「它是 documents.kind」
      // （core 不认识这个枚举）。断言发生在**构造 Citation 的这一个点**上
      kind: item.kind as Citation['kind'],
      title: item.title,
      snippet: text,
      // 偏移是分块自己的真实区间（不是查询词猜出来的位置）。
      // 截断到 PER_CITATION_CHARS 时 end 跟着缩——契约里 end 的含义是
      // 「这段文字在正文里的结束位置」，不能与 snippet 对不上
      start: item.start + offset,
      end: item.start + offset + text.length,
      matchedBy: item.matchedBy,
    })
  }

  return citations
}

/** 组装成带编号的上下文，编号与 citations 数组下标一一对应 */
function formatContext(citations: Citation[]): string {
  if (citations.length === 0) return '（知识库里没有检索到相关内容）'

  return citations
    .map((cite, index) => `【${index + 1}】${cite.title}\n${cite.snippet}`)
    .join('\n\n---\n\n')
}

/** trace 的收口：轮次、工具数、耗时只在这里算一次，避免各分支各写一遍 */
function finishTrace(steps: TraceStep[], rounds: number, tools: number, startedAt: number): Trace {
  return { rounds, tools, tookMs: Math.round(performance.now() - startedAt), steps }
}

/** Prior assistant facts are eligible only while their source snapshots still match. */
export async function verifiedRetrievalHistory(
  conversationId: string,
  scope: RetrievalScope,
  verifySources = true,
  allowAttachmentHistory = false,
  historyMessageIds?: string[],
) {
  const conversation = await getConversation(conversationId)
  const history: ModelMessage[] = []
  const selected = selectedConversationMessages(conversation?.messages ?? [], historyMessageIds)
  const prior = historyMessageIds === undefined ? selected.slice(-7, -1) : selected.slice(-6)
  for (const message of prior) {
    if (message.failure || !message.text.trim()) continue
    if (verifySources && message.role === 'assistant') {
      if (!message.citations.length && !allowAttachmentHistory) continue
      try {
        const sources = await requireFreshSources(
          message.citations.map((citation) => citation.documentId),
          scope,
        )
        // A later normal application edit keeps the index fresh but invalidates the old snippet.
        let unchanged = true
        for (const citation of message.citations) {
          const document = sources.get(citation.documentId)
          if (!document || document.body.slice(citation.start, citation.end) !== citation.snippet) {
            unchanged = false
            break
          }
        }
        if (!unchanged) continue
      } catch {
        continue
      }
    }
    if (message.role === 'assistant' && message.protocolEvents?.length) {
      const processor = new StreamProcessor()
      for (const event of message.protocolEvents)
        processor.processChunk(event as unknown as StreamChunk)
      const canonical = processor.toModelMessages()
      if (canonical.length) {
        history.push(...canonical)
        continue
      }
    }
    history.push({ role: message.role, content: message.text.slice(0, 1500) })
  }
  return history
}
