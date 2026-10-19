import type { AskInput, AskResponse, FailureKind } from '@mimir/shared'
import { appendMessage, ensureConversationScope, getConversation } from './conversations.js'
import { callChat, modelReady, selectedModel } from './model.js'
import { HttpError } from '../lib/http.js'
import {
  prepareRetrieval,
  verifiedRetrievalHistory,
  SYSTEM_PROMPT,
  type Retrieval,
} from './retrieval-preparation.js'
import { prepareChatAttachmentContext, bindChatAttachments } from './chat-attachments.js'
import {
  attachmentSystemPrompts,
  attachmentModelInput,
  attachmentQuestion,
  validateAttachmentModel,
  validateAttachmentWindow,
} from './chat-model-input.js'
import { searchOnlyAnswer } from './search-only-answer.js'

export interface AskParams extends AskInput {
  conversationId: string
}

export async function ask(params: AskParams): Promise<AskResponse> {
  if (params.modelSelection) {
    try {
      await selectedModel(params.modelSelection)
    } catch (error) {
      throw new HttpError(
        422,
        'MODEL_SELECTION_INVALID',
        error instanceof Error ? error.message : '模型选择已失效',
      )
    }
  }
  const conversation = await getConversation(params.conversationId)
  if (!conversation) throw new HttpError(404, 'CONVERSATION_NOT_FOUND', '会话不存在')
  if (params.scope === 'document' && !params.documentId && !params.retrievalScope)
    throw new HttpError(400, 'INVALID_SCOPE', '单篇范围缺少文档 ID')
  const scope =
    params.retrievalScope ??
    (params.scope === 'document' && params.documentId
      ? { type: 'document' as const, documentId: params.documentId }
      : { type: 'all' as const })
  if (params.retrievalScope || conversation.retrievalScope)
    await ensureConversationScope(params.conversationId, scope)
  params = { ...params, question: params.question.trim() }
  const attachments = await prepareChatAttachmentContext({
    conversationId: params.conversationId,
    refs: params.attachments,
    includeHistory: true,
  })
  try {
    await validateAttachmentModel(attachments, params.modelSelection, params.scope === 'search')
    params.question ||= attachmentQuestion(
      attachments.attachments.filter((item) =>
        params.attachments?.some((ref) => ref.id === item.id),
      ),
    )
  } catch (error) {
    await attachments.release()
    throw error
  }
  try {
    const retrieval = await prepareRetrieval(params.question, scope, {
      verifySources: !!(params.retrievalScope || conversation.retrievalScope),
    })
    await validateAttachmentWindow(
      attachments,
      params.modelSelection,
      [
        ...conversation.messages
          .slice(-6)
          .map((message) => ({ role: message.role, content: message.text.slice(0, 1500) })),
        {
          role: 'user',
          content: attachmentModelInput(
            { ...attachments, images: [] },
            `【资料】\n${retrieval.context}\n\n【问题】\n${params.question}`,
          ),
        },
      ],
      [SYSTEM_PROMPT],
    )
    // 先落用户消息：即使后面模型调用失败，用户的提问也不会丢
    const userMessage = await appendMessage({
      conversationId: params.conversationId,
      role: 'user',
      ...(params.modelSelection ? { modelSelection: params.modelSelection } : {}),
      retrievalScope: scope,
      text: params.question,
    })

    if (params.attachments?.length) {
      await bindChatAttachments(params.conversationId, userMessage.id, params.attachments)
      userMessage.attachments = attachments.attachments
        .filter((item) => params.attachments?.some((ref) => ref.id === item.id))
        .map((item) => Object.assign({}, item, { bound: true, expiresAt: undefined }))
    }
    const wantsSearchOnly =
      params.scope === 'search' ||
      (retrieval.citations.length === 0 && !attachments.attachments.length) ||
      (!params.modelSelection && !(await modelReady('chat')))
    if (wantsSearchOnly) {
      const assistant = await appendMessage({
        conversationId: params.conversationId,
        role: 'assistant',
        usedAttachmentRefs: attachments.attachments.map(({ id, sha256 }) => ({ id, sha256 })),
        ...(params.modelSelection ? { modelSelection: params.modelSelection } : {}),
        retrievalScope: scope,
        text: searchOnlyAnswer(retrieval.citations),

        citations: retrieval.citations,
      })
      return { conversationId: params.conversationId, messages: [userMessage, assistant] }
    }

    try {
      const answer = await callModel(params, retrieval, attachments)
      const assistant = await appendMessage({
        conversationId: params.conversationId,
        role: 'assistant',
        usedAttachmentRefs: attachments.attachments.map(({ id, sha256 }) => ({ id, sha256 })),
        ...(params.modelSelection ? { modelSelection: params.modelSelection } : {}),
        retrievalScope: scope,
        text: answer,

        citations: retrieval.citations,
      })
      return { conversationId: params.conversationId, messages: [userMessage, assistant] }
    } catch (error) {
      // 失败路径每类给不同出路（.trellis/spec/project/product.md §5.8）。这里把异常映射成
      // 前端能识别的一类，前端据此渲染对应的出路按钮，而不是统一一个「重试」。
      const assistant = await appendMessage({
        conversationId: params.conversationId,
        role: 'assistant',
        usedAttachmentRefs: attachments.attachments.map(({ id, sha256 }) => ({ id, sha256 })),
        ...(params.modelSelection ? { modelSelection: params.modelSelection } : {}),
        retrievalScope: scope,
        text: error instanceof Error ? error.message : String(error),

        citations: retrieval.citations,
        failure: classifyFailure(error),
      })
      return { conversationId: params.conversationId, messages: [userMessage, assistant] }
    }
  } finally {
    await attachments.release()
  }
}

async function callModel(
  params: AskParams,
  retrieval: Retrieval,
  attachments: Awaited<ReturnType<typeof prepareChatAttachmentContext>>,
): Promise<string> {
  // 对话历史作为上下文带上，让追问能接住上文。
  // 截断到最近若干轮：更早的内容对当前问题帮助有限，却会挤掉检索到的原文。
  const history = await verifiedRetrievalHistory(
    params.conversationId,
    retrieval.scope,
    retrieval.verifySources,
    attachments.attachments.length > 0,
  )

  // 适配器不再在这里构造——它在 provider 接缝里（plugins/provider/）。
  // 宿主只知道「要哪个角色」，不知道用的是哪个工厂、模型名怎么断言
  await validateAttachmentWindow(
    attachments,
    params.modelSelection,
    [
      ...history,
      {
        role: 'user',
        content: attachmentModelInput(
          { ...attachments, images: [] },
          `【资料】\n${retrieval.context}\n\n【问题】\n${params.question}`,
        ),
      },
    ],
    [SYSTEM_PROMPT],
  )
  return callChat({
    role: params.modelSelection ? 'chat' : params.deepReasoning ? 'reasoning' : 'chat',
    ...(params.modelSelection ? { modelSelection: params.modelSelection } : {}),
    stream: false,
    systemPrompts: [SYSTEM_PROMPT, ...attachmentSystemPrompts(attachments)],
    // 非流式那条问答路径。与流式的 'chat' 分开记：
    // 「命令面板里随手问的一句」与「认真聊了一轮」在账上不是同一件事
    source: 'ask',
    refId: params.conversationId,
    messages: [
      ...history,
      {
        role: 'user',
        content: attachmentModelInput(
          attachments,
          `【资料】\n${retrieval.context}\n\n【问题】\n${params.question}`,
        ),
      },
    ],
  })
}

/**
 * 把异常映射成前端能识别的失败类型。
 *
 * 四类的区分是刻意的（`.trellis/spec/project/product.md` §5.8）：它们对用户的下一步动作完全不同——
 * 额度用尽要去充值或换模型，超时要缩小范围，被截断要接着生成，
 * 网络不可达可以先用检索。合并成一个「失败了」等于把判断推回给用户。
 */
export function classifyFailure(error: unknown): FailureKind {
  const message = error instanceof Error ? error.message : String(error)
  const status = (error as { status?: number }).status

  if (status === 402 || /quota|balance|insufficient|余额/i.test(message)) return 'quota'
  if (status === 408 || /timeout|timed out|超时/i.test(message)) return 'timeout'
  if (status === 429 || /rate limit|限流/i.test(message)) return 'quota'
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|network|不可达/i.test(message)) return 'offline'
  if (/length|max_tokens|truncat|截断/i.test(message)) return 'truncated'

  // 认不出来的当超时处理：它是最温和的一类（可重试、内容没丢），
  // 猜错的代价最小。猜成「额度用尽」会让用户去充值，那是真的花钱。
  return 'timeout'
}
