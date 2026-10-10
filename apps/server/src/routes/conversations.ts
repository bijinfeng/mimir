import { Hono } from 'hono'
import { askInputSchema, saveNoteInputSchema } from '@mimir/shared'
import { HttpError, parseInput } from '../lib/http.js'
import { ask } from '../services/assistant.js'
import { streamChat } from '../services/assistant-stream.js'
import {
  createConversation,
  deleteConversation,
  ensureTitle,
  getConversation,
  listConversations,
  saveMessageAsNote,
} from '../services/conversations.js'
import type { AppEnv } from '../types.js'

export const conversationsRoute = new Hono<AppEnv>()

conversationsRoute.get('/', async (c) => c.json({ items: await listConversations() }))

/**
 * 直连提问：不指定会话时自动开一个新的。
 * 命令面板里直接提问走这条（`.trellis/spec/project/product.md` §5.10：输入两个字以上会附 AI 回答）。
 */
conversationsRoute.post('/ask', async (c) => {
  const input = await parseInput(c, 'json', askInputSchema)
  const conversation = await createConversation()
  await ensureTitle(conversation.id, input.question)

  return c.json(await ask({ ...input, conversationId: conversation.id }), 201)
})

/** 存成笔记。保留引用来源，见 services/conversations.ts 的说明。 */
conversationsRoute.post('/messages/note', async (c) => {
  const input = await parseInput(c, 'json', saveNoteInputSchema)
  const result = await saveMessageAsNote(input.messageId)
  if (!result) throw new HttpError(404, 'NOT_FOUND', '消息不存在')
  return c.json({ noteId: result.noteId, conversationId: result.conversationId })
})

conversationsRoute.post('/', async (c) => c.json(await createConversation(), 201))

conversationsRoute.get('/:id', async (c) => {
  const conversation = await getConversation(c.req.param('id'))
  if (!conversation) throw new HttpError(404, 'NOT_FOUND', '会话不存在')
  return c.json(conversation)
})

conversationsRoute.delete('/:id', async (c) => {
  const ok = await deleteConversation(c.req.param('id'))
  if (!ok) throw new HttpError(404, 'NOT_FOUND', '会话不存在')
  return c.json({ ok: true })
})

/**
 * 提问。这是整个产品的主交互（会话优先，`.trellis/spec/project/product.md` §5.2），
 * 所以它同时做三件事：检索、可选地调模型、把结果落库。
 *
 * 两个入口分工明确：
 *  - `/ask` 一次性返回完整结果。测试与 curl 用它，无流式客户端也能工作
 *  - `/stream` 走 AG-UI 协议，由前端 `useChat` 消费。**界面用这条**
 *
 * 检索逻辑两者共用（同一个 search()），所以不会出现「界面看到的引用
 * 和测试验证的引用不一样」。
 */
conversationsRoute.post('/:id/ask', async (c) => {
  const id = c.req.param('id')
  const input = await parseInput(c, 'json', askInputSchema)

  const conversation = await getConversation(id)
  if (!conversation) throw new HttpError(404, 'NOT_FOUND', '会话不存在')

  await ensureTitle(id, input.question)

  return c.json(await ask({ ...input, conversationId: id }))
})

/**
 * 流式提问（AG-UI 协议）。前端界面走这条。
 *
 * 路径里**不含会话 id**：id 放在请求体的 forwardedProps 里。
 * 原因是连接地址一旦变化，`useChat` 就会重建 ChatClient 并切断正在进行的流
 * （见 services/assistant-stream.ts 的说明）。新建会话时服务端用
 * `mimir.conversation` 事件把 id 回传给客户端。
 */
export const chatRoute = new Hono<AppEnv>()

chatRoute.post('/', async (c) => streamChat(await c.req.json().catch(() => null)))
