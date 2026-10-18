import { z } from 'zod'
import { retrievalScopeSchema } from './retrieval.js'
import { documentKindSchema } from './documents.js'
import { documentAgentFormatSchema } from './document-agent.js'

/**
 * 对话。
 *
 * 会话优先的导航（`.trellis/spec/project/product.md` §5.2）意味着会话是一等公民：它出现在左导航、
 * 占据中栏的「本次引用」、在右栏展开检索过程。所以它必须落库——
 * 只存在内存里的话，刷新一次「会话历史」就空了，那这个导航结构就是假的。
 */

export const messageRoleSchema = z.enum(['user', 'assistant'])
export type MessageRole = z.infer<typeof messageRoleSchema>

/**
 * 检索过程的一步。
 *
 * 每一步带**具体数字**（`.trellis/spec/project/product.md` §5.6）：个人知识库里这条比在企业里更重要——
 * AI 说「没找到」时，你能分辨是确实没存过、还是存了但分词没匹配上。
 * 所以这些字段来自真实的通道召回结果，不是渲染时编的。
 */
export const traceStepSchema = z.object({
  /** think | search | read | check —— 决定图标，前端映射 */
  icon: z.enum(['think', 'search', 'read', 'check']),
  text: z.string(),
  /** 分词结果，用于展示「用 jieba 切分查询词 组件 / 性能」 */
  keywords: z.array(z.string()).optional(),
  /** 这一步的具体数字，如「词级召回 3 段 · 子串兜底 1 段」 */
  meta: z.string().optional(),
})
export type TraceStep = z.infer<typeof traceStepSchema>

export const traceSchema = z.object({
  rounds: z.number().int(),
  tools: z.number().int(),
  tookMs: z.number().int(),
  steps: z.array(traceStepSchema),
})
export type Trace = z.infer<typeof traceSchema>

/**
 * 引用卡片。`documentId` 指回真实的 `documents` 行，
 * 所以「点引用跳回原文」是真的能跳的，不是装饰。
 */
export const citationSchema = z.object({
  documentId: z.string(),
  kind: documentKindSchema,
  title: z.string(),
  snippet: z.string(),
  /** 引用在原文中的字符区间，供跳转后高亮 */
  start: z.number().int(),
  end: z.number().int(),
  /** 这条引用是被哪个检索通道命中的，如 keyword / substring */
  matchedBy: z.array(z.string()),
})
export type Citation = z.infer<typeof citationSchema>

/** 只检索消息的持久化状态；保存与复制时据此从引用中还原可用内容。 */
export const SEARCH_ONLY_RESULT_TEXT = '仅展示检索结果，未调用模型。'

/**
 * 模型侧失败。四类各自给不同出路（`.trellis/spec/project/product.md` §5.8）——
 * 统一给一个「重试」等于把判断推回给用户，而用户此刻最缺判断依据。
 */
export const failureKindSchema = z.enum(['quota', 'timeout', 'truncated', 'offline'])
export type FailureKind = z.infer<typeof failureKindSchema>

/** Compact DOCX tool history; arguments and document content are deliberately excluded. */
export const docxAgentToolHistorySchema = z.object({
  interruptId: z.string(),
  name: z.string(),
  status: z.enum(['pending', 'completed', 'failed', 'cancelled']),
  changed: z.boolean().optional(),
})
export const docxAgentHistorySchema = z.object({
  runId: z.string(),
  documentId: z.string(),
  /** Old DOCX histories have no format field. */
  format: documentAgentFormatSchema.optional(),
  status: z.enum(['pending', 'completed', 'failed', 'cancelled']),
  tools: z.array(docxAgentToolHistorySchema),
})
export type DocxAgentHistory = z.infer<typeof docxAgentHistorySchema>
export type DocxAgentToolHistory = z.infer<typeof docxAgentToolHistorySchema>

export const messageSchema = z.object({
  id: z.string(),
  role: messageRoleSchema,
  text: z.string(),
  trace: traceSchema.nullable(),
  citations: z.array(citationSchema),
  /** 非空表示这条消息是一次失败，渲染成失败卡片而不是回答 */
  failure: failureKindSchema.nullable(),
  /** 「存成笔记」之后置位，界面据此显示「已存为笔记」 */
  savedNoteId: z.string().nullable(),
  agent: docxAgentHistorySchema.optional(),
  createdAt: z.string(),
})
export type Message = z.infer<typeof messageSchema>

export const conversationSummarySchema = z.object({
  /** Absent on legacy conversations: their historical scope was not persisted. */
  retrievalScope: retrievalScopeSchema.optional(),
  id: z.string(),
  title: z.string(),
  /** 中栏「本次引用」用的来源 id 列表 */
  refs: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ConversationSummary = z.infer<typeof conversationSummarySchema>

export const conversationDetailSchema = conversationSummarySchema.extend({
  messages: z.array(messageSchema),
})
export type ConversationDetail = z.infer<typeof conversationDetailSchema>

/**
 * 一次提问。
 *
 * `scope` 是原型输入框里那个「范围」pill：
 * - all：整个知识库
 * - document：锁到某一篇（从文档工具条「问 AI」或内联「就这段提问」进来）
 * - search：只用检索，不调模型。这是原型的失败出路之一，也是没配模型时的退路
 */
export const askScopeSchema = z.enum(['all', 'document', 'search'])
export type AskScope = z.infer<typeof askScopeSchema>

export const askInputSchema = z.object({
  question: z.string().trim().min(1, '问题不能为空').max(2000),
  /** 不传表示新开一个会话 */
  conversationId: z.string().optional(),
  scope: askScopeSchema.default('all'),
  retrievalScope: retrievalScopeSchema.optional(),
  /** scope 为 document 时必填 */
  documentId: z.string().optional(),
  /** 深度思考：打开时用推理模型 */
  deepReasoning: z.boolean().default(false),
})
export type AskInput = z.infer<typeof askInputSchema>

export const askResponseSchema = z.object({
  conversationId: z.string(),
  messages: z.array(messageSchema),
})
export type AskResponse = z.infer<typeof askResponseSchema>

/** 「存成笔记」的请求体：保留引用来源，而不是存一段孤零零的话 */
export const saveNoteInputSchema = z.object({
  messageId: z.string(),
})
export type SaveNoteInput = z.infer<typeof saveNoteInputSchema>

/**
 * 流式回答里 mimir 自己的自定义事件。
 *
 * 前后端共用这些字面量：服务端 `services/assistant-stream.ts` 发，
 * 前端 `lib/use-mimir-chat.ts` 收。写成共享常量而不是两边各写一遍字符串——
 * 打错一个字母的后果是**静默不生效**（事件被忽略，界面就是不显示检索过程），
 * 而这类 bug 很难从现象反推原因。
 *
 * 为什么走自定义事件而不是协议原生的 part：
 *  - trace 是**结构化的分步记录**（每步有图标、关键词、具体数字），
 *    而协议原生的 thinking part 只是一个字符串，塞进去就丢了结构
 *  - citations 是引用卡片，含文档 id 与字符偏移，协议里没有对应形状
 *
 * 三个事件都**先于**模型开始生成发出，所以引用卡片与检索过程会立刻出现，
 * 用户不必对着空白等模型。
 */
export const EVENT_CONVERSATION = 'mimir.conversation'
export const EVENT_TRACE = 'mimir.trace'
export const EVENT_CITATIONS = 'mimir.citations'
export const EVENT_FAILURE = 'mimir.failure'

/**
 * 新会话的 id 回传。
 *
 * 为什么需要它：会话 id 放在请求体（forwardedProps）而不是 URL 里，
 * 于是**连接地址是固定的**——如果 id 进了 URL，新建会话时地址一变，
 * 客户端就会重建，正在进行的流会被切断。
 * 代价是客户端不知道新 id，所以服务端建好之后用这个事件告诉它。
 */
export interface ConversationEventPayload {
  conversationId: string
}
export interface TraceEventPayload {
  trace: Trace
}
export interface CitationsEventPayload {
  citations: Citation[]
}

/**
 * 模型侧的失败。
 *
 * 单独一个事件而不是让前端从 `RUN_ERROR` 的分类里猜：**失败分类是服务端的
 * 知识**（它看得到 HTTP 状态码与原始错误），前端只看到一句被规范化过的
 * 文本。让前端按字符串猜会得到「认不出来就当成超时」这种反复漂移的逻辑。
 *
 * 带上 message 是因为服务端的原始信息往往比预设文案更具体
 * （比如「403 限额用尽，配置 GITHUB_TOKEN 可提到 5000 次」）。
 */
export interface FailureEventPayload {
  failure: FailureKind
  message: string
}
