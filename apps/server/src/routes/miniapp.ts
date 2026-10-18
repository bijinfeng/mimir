import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import {
  miniappAppendSchema,
  miniappCaptureSchema,
  miniappChatSchema,
  miniappCreateNoteSchema,
  miniappDocumentsQuerySchema,
  miniappLoginSchema,
  miniappPageQuerySchema,
  miniappSaveAnswerSchema,
  miniappSearchQuerySchema,
  miniappUpdateSchema,
} from '@mimir/shared/miniapp'
import { detectSource } from '@mimir/shared'
import { errorBody, HttpError, parseInput } from '../lib/http.js'
import {
  miniappEnabled,
  requireMiniappAuth,
  limitMiniappLogin,
} from '../middleware/miniapp-auth.js'
import { loginMiniapp, logoutMiniapp, miniappSession } from '../services/miniapp-auth.js'
import { getMiniappOperation, runMiniappOperation } from '../services/miniapp-operations.js'
import { miniappChat } from '../services/miniapp-chat.js'
import {
  appendMiniappDocument,
  createMiniappNote,
  getMiniappDocument,
  miniappSummary,
  updateMiniappDocument,
} from '../services/miniapp-documents.js'
import { saveMiniappAnswer } from '../services/miniapp-writes.js'
import { listAllTags, listDocuments } from '../services/documents.js'
import { listFolderTree } from '../services/folders.js'
import { getConversation, listConversations } from '../services/conversations.js'
import { capture } from '../services/capture.js'
import { normalizeRetrievalScope, requireExistingFolder } from '../services/retrieval-scope.js'
import { search } from '../search/index.js'
import { downloadDocumentFile } from './files.js'
import type { AppEnv } from '../types.js'

export const miniappRoute = new Hono<AppEnv>()
miniappRoute.use('*', miniappEnabled)
miniappRoute.use(
  '*',
  bodyLimit({
    maxSize: 8_000_000,
    onError: () => {
      throw new HttpError(413, 'INPUT_TOO_LARGE', '请求内容过大')
    },
  }),
)
miniappRoute.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  // Native requests supply no Origin. Browser origins keep the existing policy.
  await next()
})
miniappRoute.post('/auth/login', limitMiniappLogin, async (c) =>
  c.json(await loginMiniapp(await parseInput(c, 'json', miniappLoginSchema))),
)
miniappRoute.use('*', requireMiniappAuth)
miniappRoute.get('/auth/session', (c) => c.json(miniappSession(c.get('miniappDevice'))))
miniappRoute.post('/auth/logout', async (c) => {
  await logoutMiniapp(c.get('miniappDevice'))
  return c.json({ ok: true })
})
miniappRoute.get('/folders', async (c) => c.json({ items: await listFolderTree() }))
miniappRoute.get('/tags', async (c) => c.json({ items: await listAllTags() }))
miniappRoute.get('/documents', async (c) => {
  const query = await parseInput(c, 'query', miniappDocumentsQuerySchema)
  if (query.folder) await requireExistingFolder(query.folder)
  const rows = await listDocuments({ ...query, kinds: undefined, limit: query.limit + 1 })
  return c.json({
    items: rows.slice(0, query.limit).map(miniappSummary),
    nextOffset: rows.length > query.limit ? query.offset + query.limit : null,
  })
})
miniappRoute.get('/documents/:id/file', downloadDocumentFile)
miniappRoute.get('/documents/:id', async (c) => {
  const document = await getMiniappDocument(c.req.param('id'))
  if (!document) throw new HttpError(404, 'NOT_FOUND', '文档不存在')
  return c.json({ document })
})
miniappRoute.get('/search', async (c) => {
  const input = await parseInput(c, 'query', miniappSearchQuerySchema)
  const retrievalScope = await normalizeRetrievalScope(input.scope)
  const result = await search({ q: input.q, mode: input.mode, limit: input.limit, retrievalScope })
  return c.json({ ...result, hits: result.hits.map((hit) => ({ ...hit, path: null })) })
})
miniappRoute.get('/conversations', async (c) => {
  const query = await parseInput(c, 'query', miniappPageQuerySchema)
  const rows = await listConversations(query.limit + 1, query.offset)
  return c.json({
    items: rows.slice(0, query.limit),
    nextOffset: rows.length > query.limit ? query.offset + query.limit : null,
  })
})
miniappRoute.get('/conversations/:id', async (c) => {
  const conversation = await getConversation(c.req.param('id'))
  if (!conversation) throw new HttpError(404, 'CONVERSATION_NOT_FOUND', '会话不存在')
  return c.json({ conversation })
})
miniappRoute.get('/operations/:id', async (c) => {
  const operation = await getMiniappOperation(c.get('miniappDevice'), c.req.param('id'))
  if (!operation) throw new HttpError(404, 'OPERATION_NOT_FOUND', '未找到操作记录')
  return c.json({ operation })
})
miniappRoute.post('/chat', async (c) =>
  miniappChat(c.get('miniappDevice'), await parseInput(c, 'json', miniappChatSchema)),
)
miniappRoute.post('/notes', async (c) => {
  const input = await parseInput(c, 'json', miniappCreateNoteSchema)
  return c.json({
    operation: await runMiniappOperation(
      c.get('miniappDevice'),
      input.requestId,
      'create',
      input,
      async () => ({ type: 'document', document: await createMiniappNote(input) }),
    ),
  })
})
miniappRoute.post('/documents/:id/update', async (c) => {
  const input = await parseInput(c, 'json', miniappUpdateSchema)
  const id = c.req.param('id')
  return c.json({
    operation: await runMiniappOperation(
      c.get('miniappDevice'),
      input.requestId,
      'update',
      { id, ...input },
      async () => ({ type: 'document', document: await updateMiniappDocument(id, input) }),
    ),
  })
})
miniappRoute.post('/documents/:id/append', async (c) => {
  const input = await parseInput(c, 'json', miniappAppendSchema)
  const id = c.req.param('id')
  return c.json({
    operation: await runMiniappOperation(
      c.get('miniappDevice'),
      input.requestId,
      'append',
      { id, ...input },
      async () => ({
        type: 'document',
        document: await appendMiniappDocument(id, input.expectedRevision, input.text),
      }),
    ),
  })
})
miniappRoute.post('/messages/:id/note', async (c) => {
  const input = await parseInput(c, 'json', miniappSaveAnswerSchema)
  const id = c.req.param('id')
  return c.json({
    operation: await runMiniappOperation(
      c.get('miniappDevice'),
      input.requestId,
      'save-answer',
      { id, ...input },
      () => saveMiniappAnswer(id, input.folder),
    ),
  })
})
miniappRoute.post('/capture', async (c) => {
  const input = await parseInput(c, 'json', miniappCaptureSchema)
  const operation = await runMiniappOperation(
    c.get('miniappDevice'),
    input.requestId,
    'capture',
    input,
    async () => {
      const folder = await requireExistingFolder(input.folder)
      const source = detectSource(input.url)
      if (!source) throw new HttpError(400, 'INVALID_URL', '请输入完整的 HTTP/HTTPS 链接')
      return { type: 'capture', capture: await capture({ url: input.url, folder, source }) }
    },
    true,
  )
  return c.json({ operation }, operation.status === 'pending' ? 202 : 200)
})
// Terminate every dedicated path here. Unknown miniapp paths must never fall
// through to the full cookie-authenticated configuration/Agent API group.
miniappRoute.all('*', () => {
  throw new HttpError(404, 'NOT_FOUND', '接口不存在')
})
miniappRoute.onError((error, c) => {
  if (error instanceof HttpError) return c.json(errorBody(error), error.status)
  // Unlike the general development API, never expose SQL, filesystem paths or
  // provider diagnostics in the device response or write credential/body logs.
  console.error('小程序请求失败：', error.name)
  return c.json({ error: { code: 'INTERNAL_ERROR', message: '服务端错误，请稍后重试' } }, 500)
})
