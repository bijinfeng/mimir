import { z } from 'zod'
import { documentDetailSchema, documentKindSchema, documentSummarySchema } from './documents.js'
import { captureResponseSchema } from './capture.js'
import { retrievalFolderPathSchema, retrievalScopeSchema } from './retrieval.js'
import { searchModeSchema } from './search.js'

export type { RetrievalScope } from './retrieval.js'
export type { FolderNode, TagListResponse } from './structure.js'
export type {
  Citation,
  Trace,
  Message,
  ConversationSummary,
  ConversationDetail,
} from './conversations.js'
export type { SearchResponse } from './search.js'
export type { CaptureResponse } from './capture.js'

export const miniappRequestIdSchema = z
  .string()
  .min(16)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/)
const id = z.string().min(1).max(200)
const folder = retrievalFolderPathSchema
const tags = z.array(z.string().trim().min(1).max(50)).max(20)
export const miniappLoginSchema = z
  .object({
    identifier: z.string().trim().min(1).max(254),
    password: z.string().min(1).max(1024),
    deviceName: z.string().trim().max(100).default('微信小程序'),
  })
  .strict()
export type MiniappLoginInput = z.input<typeof miniappLoginSchema>
export const miniappSessionSchema = z.object({
  deviceId: z.string(),
  expiresAt: z.string(),
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
})
export type MiniappSession = z.infer<typeof miniappSessionSchema>
export type MiniappLoginResponse = MiniappSession & { token: string }

export const miniappPageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
})
export const miniappDocumentsQuerySchema = miniappPageQuerySchema.extend({
  folder: folder.optional(),
  tag: z.string().max(50).optional(),
  kind: documentKindSchema.optional(),
})
export type MiniappDocumentsQuery = z.input<typeof miniappDocumentsQuerySchema>
export const miniappDocumentSummarySchema = documentSummarySchema.omit({ path: true })
export type MiniappDocumentSummary = z.infer<typeof miniappDocumentSummarySchema>
export const miniappDocumentSchema = documentDetailSchema
  .omit({ path: true, sourceKey: true })
  .extend({
    revision: z.string(),
    canEditBody: z.boolean(),
    hasOriginal: z.boolean(),
    indexState: z.enum(['current', 'stale']),
  })
export type MiniappDocument = z.infer<typeof miniappDocumentSchema>
export interface MiniappPage<T> {
  items: T[]
  nextOffset: number | null
}

// GET /search: scope is a JSON-encoded RetrievalScope query parameter.
export const miniappSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(500),
  mode: searchModeSchema.default('keyword'),
  scope: z
    .string()
    .max(1000)
    .transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown
      } catch {
        ctx.addIssue({ code: 'custom', message: '检索范围不是有效 JSON' })
        return z.NEVER
      }
    })
    .pipe(retrievalScopeSchema),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
export const miniappChatSchema = z
  .object({
    requestId: miniappRequestIdSchema,
    question: z.string().trim().min(1).max(2000),
    conversationId: id.optional(),
    mode: z.enum(['ask', 'search']).default('ask'),
    scope: retrievalScopeSchema,
  })
  .strict()
export type MiniappChatInput = z.input<typeof miniappChatSchema>
export const miniappCreateNoteSchema = z
  .object({
    requestId: miniappRequestIdSchema,
    title: z.string().trim().min(1).max(200),
    body: z.string().max(2_000_000),
    tags: tags.default([]),
    folder,
  })
  .strict()
export type MiniappCreateNoteInput = z.input<typeof miniappCreateNoteSchema>
export const miniappUpdateSchema = z
  .object({
    requestId: miniappRequestIdSchema,
    expectedRevision: z.string().min(1).max(200),
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().max(2_000_000).optional(),
    tags: tags.optional(),
    folder: folder.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.title !== undefined ||
      value.body !== undefined ||
      value.tags !== undefined ||
      value.folder !== undefined,
    '没有需要保存的字段',
  )
export type MiniappUpdateInput = z.infer<typeof miniappUpdateSchema>
export const miniappAppendSchema = z
  .object({
    requestId: miniappRequestIdSchema,
    expectedRevision: z.string().min(1).max(200),
    text: z
      .string()
      .min(1)
      .max(2_000_000)
      .refine((value) => value.trim().length > 0, '追加内容不能为空'),
  })
  .strict()
export type MiniappAppendInput = z.infer<typeof miniappAppendSchema>
export const miniappSaveAnswerSchema = z
  .object({ requestId: miniappRequestIdSchema, folder })
  .strict()
export type MiniappSaveAnswerInput = z.infer<typeof miniappSaveAnswerSchema>
export const miniappCaptureSchema = z
  .object({
    requestId: miniappRequestIdSchema,
    url: z
      .string()
      .trim()
      .url()
      .max(2000)
      .refine((value) => /^https?:\/\//i.test(value), '只支持 HTTP/HTTPS 链接'),
    folder,
  })
  .strict()
export type MiniappCaptureInput = z.infer<typeof miniappCaptureSchema>

export const miniappOperationResultSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('document'), document: miniappDocumentSchema }),
  z.object({
    type: z.literal('saved-answer'),
    noteId: z.string(),
    folder: z.string().nullable(),
    alreadySaved: z.boolean(),
  }),
  z.object({ type: z.literal('capture'), capture: captureResponseSchema }),
  z.object({ type: z.literal('chat'), conversationId: z.string() }),
])
export type MiniappOperationResult = z.infer<typeof miniappOperationResultSchema>
export const miniappOperationSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  kind: z.enum(['chat', 'create', 'update', 'append', 'save-answer', 'capture']),
  status: z.enum(['pending', 'succeeded', 'failed', 'interrupted']),
  conversationId: z.string().nullable(),
  result: miniappOperationResultSchema.nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type MiniappOperation = z.infer<typeof miniappOperationSchema>
export interface MiniappWriteResponse {
  operation: MiniappOperation
}

/** SSE data is JSON. Existing AG-UI events are forwarded without accepting Agent inputs.
 * RUN_STARTED then CUSTOM mimir.operation is sent with {operation}; RUN_FINISHED means persisted success.
 * Replayed requests emit mimir.operation followed by RUN_FINISHED (succeeded) or RUN_ERROR.
 */
export const MINIAPP_EVENT_OPERATION = 'mimir.operation'
export interface MiniappStreamEvent {
  type: string
  name?: string
  value?: unknown
  delta?: string
  message?: string
  messageId?: string
  threadId?: string
  runId?: string
}
