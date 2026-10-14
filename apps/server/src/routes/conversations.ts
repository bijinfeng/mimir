import { Hono } from 'hono'
import { z } from 'zod'
import {
  askInputSchema,
  htmlPlanPageInputSchema,
  htmlWriteDocumentInputSchema,
  saveNoteInputSchema,
} from '@mimir/shared'
import { HttpError, parseInput } from '../lib/http.js'
import { ask } from '../services/assistant.js'
import { streamChat } from '../services/assistant-stream.js'
import { cancelPendingDocxRun } from '../services/docx-agent-runs.js'
import { docxAgentCapabilities } from '../services/docx-agent-capabilities.js'
import { documentAgentCapabilities } from '../services/document-agent-capabilities.js'
import { generateDocxImage } from '../services/docx-image-generation.js'
import { streamDocxWriting } from '../services/docx-writing.js'
import { analyzeDocxMedia, DocxMediaInputError } from '../services/docx-media-analysis.js'
import { createDocxAgentDocument } from '../services/docx-create-document.js'
import { fetchDocxImage } from '../services/docx-image-fetch.js'
import { getDocument } from '../services/documents.js'
import { writeMarkdownDocument } from '../services/markdown-agent-writing.js'
import {
  MarkdownFrontmatterConflictError,
  readMarkdownFrontmatter,
  updateMarkdownFrontmatter,
} from '../services/markdown-agent-frontmatter.js'
import { planHtmlPage, writeHtmlDocument } from '../services/html-agent-writing.js'
import { applyPptxOpsOnHost } from '../services/pptx-agent-host.js'
import { applyXlsxOpsOnHost } from '../services/xlsx-agent-host.js'
import { applyPdfTextEdits, applyPdfTextInserts } from '../services/pdf-agent-host.js'
import { documentAgentFormatOf } from '../services/document-agent-format.js'
import { readUploadForm } from '../lib/multipart.js'
import { MAX_ZIP_INPUT_BYTES } from '../../../../packages/office/src/zip-bounds.js'
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

conversationsRoute.get('/document-agent/capabilities', async (c) => {
  const documentId = c.req.query('documentId')
  if (!documentId || documentId.length > 200)
    throw new HttpError(400, 'INVALID_INPUT', '缺少文档 ID')
  const capabilities = await documentAgentCapabilities(documentId)
  if (!capabilities) throw new HttpError(404, 'DOCUMENT_AGENT_NOT_FOUND', '当前文档没有编辑格式')
  return c.json(capabilities)
})

conversationsRoute.post('/html-agent/plan-page', async (c) => {
  const input = await parseInput(c, 'json', htmlPlanPageInputSchema)
  try {
    return c.json(await planHtmlPage({ ...input, signal: c.req.raw.signal }))
  } catch (error) {
    throw new HttpError(
      400,
      'HTML_PLAN_FAILED',
      error instanceof Error ? error.message : '页面规划失败',
    )
  }
})

conversationsRoute.post('/html-agent/write-document', async (c) => {
  const input = await parseInput(c, 'json', htmlWriteDocumentInputSchema)
  try {
    return c.json(await writeHtmlDocument({ ...input, signal: c.req.raw.signal }))
  } catch (error) {
    throw new HttpError(
      400,
      'HTML_WRITE_FAILED',
      error instanceof Error ? error.message : '页面写作失败',
    )
  }
})

conversationsRoute.post('/pptx-agent/apply-ops', async (c) => {
  const form = await readUploadForm(c.req.raw)
  const file = form.get('file')
  if (!(file instanceof File) || file.size > MAX_ZIP_INPUT_BYTES)
    throw new HttpError(413, 'PPTX_INPUT_TOO_LARGE', 'PPTX 原件超过 50 MiB 上限')
  const values = z
    .object({
      documentId: z.string().min(1).max(200),
      expectedVersion: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .pipe(z.number().int().nonnegative()),
      ops: z.string().max(1_000_000),
    })
    .safeParse({
      documentId: form.get('documentId'),
      expectedVersion: form.get('expectedVersion'),
      ops: form.get('ops'),
    })
  if (!values.success) throw new HttpError(400, 'INVALID_INPUT', 'PPTX 操作参数无效')
  let ops: unknown
  try {
    ops = JSON.parse(values.data.ops)
  } catch {
    throw new HttpError(400, 'INVALID_INPUT', 'PPTX 操作不是有效 JSON')
  }
  if (!Array.isArray(ops) || ops.length < 1 || ops.length > 50)
    throw new HttpError(400, 'INVALID_INPUT', 'PPTX 操作批次必须包含 1–50 项')
  try {
    const result = await applyPptxOpsOnHost({
      documentId: values.data.documentId,
      bytes: new Uint8Array(await file.arrayBuffer()),
      expectedVersion: values.data.expectedVersion,
      ops,
      signal: c.req.raw.signal,
    })
    return c.json({
      bytesBase64: Buffer.from(result.bytes).toString('base64'),
      records: result.records,
      version: result.version,
      sampleData: result.sampleData,
    })
  } catch (error) {
    throw new HttpError(
      400,
      'PPTX_OPERATION_FAILED',
      error instanceof Error ? error.message : 'PPTX 操作失败',
    )
  }
})

conversationsRoute.post('/xlsx-agent/apply-ops', async (c) => {
  const form = await readUploadForm(c.req.raw)
  const file = form.get('file')
  if (!(file instanceof File) || file.size > MAX_ZIP_INPUT_BYTES)
    throw new HttpError(413, 'XLSX_INPUT_TOO_LARGE', 'XLSX 原件超过 50 MiB 上限')
  const values = z
    .object({
      documentId: z.string().min(1).max(200),
      expectedVersion: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .pipe(z.number().int().nonnegative()),
      ops: z.string().max(1_000_000),
    })
    .safeParse({
      documentId: form.get('documentId'),
      expectedVersion: form.get('expectedVersion'),
      ops: form.get('ops'),
    })
  if (!values.success) throw new HttpError(400, 'INVALID_INPUT', 'XLSX 操作参数无效')
  let ops: unknown
  try {
    ops = JSON.parse(values.data.ops)
  } catch {
    throw new HttpError(400, 'INVALID_INPUT', 'XLSX 操作不是有效 JSON')
  }
  if (!Array.isArray(ops) || ops.length < 1 || ops.length > 50)
    throw new HttpError(400, 'INVALID_INPUT', 'XLSX 操作批次必须包含 1–50 项')
  try {
    const result = await applyXlsxOpsOnHost({
      documentId: values.data.documentId,
      bytes: new Uint8Array(await file.arrayBuffer()),
      expectedVersion: values.data.expectedVersion,
      ops,
      signal: c.req.raw.signal,
    })
    return c.json({
      bytesBase64: Buffer.from(result.bytes).toString('base64'),
      version: result.version,
      changedCells: result.changedCells,
      touchedEntries: result.touchedEntries,
    })
  } catch (error) {
    throw new HttpError(
      400,
      'XLSX_OPERATION_FAILED',
      error instanceof Error ? error.message : 'XLSX 操作失败',
    )
  }
})

const pdfPoint = z.tuple([z.number().finite(), z.number().finite()])
const pdfRect = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
])
const pdfTextEdit = z.object({
  pageIndex: z.number().int().nonnegative(),
  rect: pdfRect,
  oldText: z.string().min(1).max(10_000),
  newText: z.string().max(10_000),
  fontSize: z.number().finite().positive().max(500),
})
const pdfTextInsert = z.object({
  pageIndex: z.number().int().nonnegative(),
  origin: pdfPoint,
  text: z.string().min(1).max(10_000),
  fontSize: z.number().finite().positive().max(500),
  color: z.tuple([
    z.number().finite().min(0).max(1),
    z.number().finite().min(0).max(1),
    z.number().finite().min(0).max(1),
  ]),
})

conversationsRoute.post('/pdf-agent/apply-text', async (c) => {
  const form = await readUploadForm(c.req.raw)
  const file = form.get('file')
  if (!(file instanceof File) || file.size > 50 * 1024 * 1024)
    throw new HttpError(413, 'PDF_INPUT_TOO_LARGE', 'PDF 原件超过 50 MiB 上限')
  const values = z
    .object({
      documentId: z.string().min(1).max(200),
      expectedVersion: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .pipe(z.number().int().nonnegative()),
      kind: z.enum(['edit', 'insert']),
      items: z.string().max(1_000_000),
    })
    .safeParse({
      documentId: form.get('documentId'),
      expectedVersion: form.get('expectedVersion'),
      kind: form.get('kind'),
      items: form.get('items'),
    })
  if (!values.success) throw new HttpError(400, 'INVALID_INPUT', 'PDF 文字操作参数无效')
  const document = await getDocument(values.data.documentId)
  if (!document || documentAgentFormatOf(document) !== 'pdf')
    throw new HttpError(404, 'PDF_NOT_FOUND', '当前文档不是可编辑 PDF')
  let raw: unknown
  try {
    raw = JSON.parse(values.data.items)
  } catch {
    throw new HttpError(400, 'INVALID_INPUT', 'PDF 文字操作不是有效 JSON')
  }
  const items = z
    .array(values.data.kind === 'edit' ? pdfTextEdit : pdfTextInsert)
    .min(1)
    .max(30)
    .safeParse(raw)
  if (!items.success) throw new HttpError(400, 'INVALID_INPUT', 'PDF 文字操作列表无效')
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const result =
      values.data.kind === 'edit'
        ? await applyPdfTextEdits(bytes, items.data as z.infer<typeof pdfTextEdit>[])
        : await applyPdfTextInserts(bytes, items.data as z.infer<typeof pdfTextInsert>[])
    return c.json({
      bytesBase64: Buffer.from(result).toString('base64'),
      version: values.data.expectedVersion + 1,
    })
  } catch (error) {
    throw new HttpError(
      400,
      'PDF_TEXT_EDIT_FAILED',
      error instanceof Error ? error.message : 'PDF 文字编辑失败',
    )
  }
})

const markdownDocumentId = z.object({ documentId: z.string().min(1).max(200) })
async function requireMarkdownNote(documentId: string) {
  const document = await getDocument(documentId)
  if (!document || document.kind !== 'note')
    throw new HttpError(404, 'MARKDOWN_NOT_FOUND', '当前文档不是可编辑的笔记')
}

conversationsRoute.post('/markdown-agent/fetch-image', async (c) => {
  const input = await parseInput(
    c,
    'json',
    markdownDocumentId.extend({ url: z.string().url().max(2_000) }),
  )
  await requireMarkdownNote(input.documentId)
  try {
    return c.json(await fetchDocxImage(input.url))
  } catch (error) {
    throw new HttpError(
      400,
      'MARKDOWN_IMAGE_FETCH_FAILED',
      error instanceof Error ? error.message : '图片下载失败',
    )
  }
})

conversationsRoute.post('/markdown-agent/generate-image', async (c) => {
  const input = await parseInput(
    c,
    'json',
    markdownDocumentId.extend({ prompt: z.string().trim().min(1).max(2_000) }),
  )
  await requireMarkdownNote(input.documentId)
  const capability = await documentAgentCapabilities(input.documentId)
  if (!capability?.availableTools.includes('generate_image'))
    throw new HttpError(409, 'MARKDOWN_IMAGE_UNAVAILABLE', '请先配置图片生成服务')
  try {
    return c.json(await generateDocxImage(input.prompt, input.documentId))
  } catch (error) {
    throw new HttpError(
      500,
      'MARKDOWN_IMAGE_FAILED',
      error instanceof Error ? error.message : '图片生成失败',
    )
  }
})

conversationsRoute.post('/markdown-agent/write-document', async (c) => {
  const input = await parseInput(
    c,
    'json',
    markdownDocumentId.extend({
      plan: z.string().trim().min(1).max(8_000),
      title: z.string().max(160).optional(),
      context: z.string().max(20_000).optional(),
    }),
  )
  await requireMarkdownNote(input.documentId)
  try {
    return c.json({ markdown: await writeMarkdownDocument({ ...input, signal: c.req.raw.signal }) })
  } catch (error) {
    throw new HttpError(
      500,
      'MARKDOWN_WRITE_FAILED',
      error instanceof Error ? error.message : '长文写作失败',
    )
  }
})

conversationsRoute.get('/markdown-agent/frontmatter', async (c) => {
  const input = await parseInput(c, 'query', markdownDocumentId)
  await requireMarkdownNote(input.documentId)
  return c.json({ yaml: await readMarkdownFrontmatter(input.documentId) })
})

conversationsRoute.put('/markdown-agent/frontmatter', async (c) => {
  const input = await parseInput(
    c,
    'json',
    markdownDocumentId.extend({
      yaml: z.string().max(20_000),
      expectedYaml: z.string().max(20_000),
    }),
  )
  await requireMarkdownNote(input.documentId)
  try {
    return c.json(await updateMarkdownFrontmatter(input.documentId, input.yaml, input.expectedYaml))
  } catch (error) {
    if (error instanceof MarkdownFrontmatterConflictError)
      throw new HttpError(409, 'MARKDOWN_FRONTMATTER_CONFLICT', error.message)
    throw new HttpError(
      400,
      'MARKDOWN_FRONTMATTER_INVALID',
      error instanceof Error ? error.message : 'frontmatter 无效',
    )
  }
})

conversationsRoute.get('/docx-agent/capabilities', async (c) => {
  const documentId = c.req.query('documentId')
  if (!documentId || documentId.length > 200)
    throw new HttpError(400, 'INVALID_INPUT', '缺少文档 ID')
  const capabilities = await docxAgentCapabilities(documentId)
  if (!capabilities) throw new HttpError(404, 'DOCX_NOT_FOUND', '当前文档不是可编辑的 DOCX 文件')
  return c.json(capabilities)
})

conversationsRoute.post('/docx-agent/generate-image', async (c) => {
  const input = await parseInput(
    c,
    'json',
    z.object({
      documentId: z.string().min(1).max(200),
      prompt: z.string().trim().min(1).max(2_000),
    }),
  )
  const capabilities = await docxAgentCapabilities(input.documentId)
  if (!capabilities) throw new HttpError(404, 'DOCX_NOT_FOUND', '当前文档不是可编辑的 DOCX 文件')
  if (!capabilities.availableTools.includes('generate_image')) {
    throw new HttpError(409, 'DOCX_IMAGE_UNAVAILABLE', '请先配置聊天模型和 DOCX 图片生成服务')
  }
  try {
    return c.json(await generateDocxImage(input.prompt, input.documentId))
  } catch (error) {
    throw new HttpError(
      500,
      'DOCX_IMAGE_FAILED',
      error instanceof Error ? error.message : '图片生成失败',
    )
  }
})

conversationsRoute.post('/docx-agent/fetch-image', async (c) => {
  const input = await parseInput(
    c,
    'json',
    z.object({
      documentId: z.string().min(1).max(200),
      url: z.string().url().max(2_000),
    }),
  )
  const capabilities = await docxAgentCapabilities(input.documentId)
  if (!capabilities) throw new HttpError(404, 'DOCX_NOT_FOUND', '当前文档不是可编辑的 DOCX 文件')
  try {
    return c.json(await fetchDocxImage(input.url))
  } catch (error) {
    throw new HttpError(
      400,
      'DOCX_IMAGE_FETCH_FAILED',
      error instanceof Error ? error.message : '图片下载失败',
    )
  }
})

conversationsRoute.post('/docx-agent/write-document', async (c) => {
  const input = await parseInput(
    c,
    'json',
    z.object({
      documentId: z.string().min(1).max(200),
      instruction: z.string().trim().min(1).max(8_000),
      context: z.string().max(20_000),
    }),
  )
  return streamDocxWriting({ ...input, signal: c.req.raw.signal })
})

conversationsRoute.post('/docx-agent/analyze-media', async (c) => {
  const input = await parseInput(
    c,
    'json',
    z.object({
      documentId: z.string().min(1).max(200),
      instruction: z.string().trim().min(1).max(4_000),
      kind: z.enum(['image', 'audio', 'video']),
      media: z
        .array(z.object({ mimeType: z.string().max(100), data: z.string().max(14_000_000) }))
        .min(1)
        .max(4),
    }),
  )
  const capabilities = await docxAgentCapabilities(input.documentId)
  if (!capabilities) throw new HttpError(404, 'DOCX_NOT_FOUND', '当前文档不是可编辑的 DOCX 文件')
  if (!capabilities.availableTools.includes('analyze_media')) {
    throw new HttpError(409, 'DOCX_MEDIA_UNAVAILABLE', '请先配置 DOCX 媒体分析服务')
  }
  try {
    return c.json(await analyzeDocxMedia(input))
  } catch (error) {
    if (error instanceof DocxMediaInputError)
      throw new HttpError(400, 'DOCX_MEDIA_INVALID', error.message)
    throw new HttpError(
      500,
      'DOCX_MEDIA_FAILED',
      error instanceof Error ? error.message : '媒体分析失败',
    )
  }
})

conversationsRoute.post('/docx-agent/create-document', async (c) => {
  const input = await parseInput(
    c,
    'json',
    z.object({
      documentId: z.string().min(1).max(200),
      title: z.string().trim().min(1).max(160),
      format: z.enum(['docx', 'pdf', 'md', 'html']),
      content: z.string().trim().min(1).max(100_000),
    }),
  )
  if (!(await docxAgentCapabilities(input.documentId))) {
    throw new HttpError(404, 'DOCX_NOT_FOUND', '当前文档不是可编辑的 DOCX 文件')
  }
  try {
    const result = await createDocxAgentDocument(input)
    return c.json(result, 201)
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(
      500,
      'DOCX_CREATE_FAILED',
      error instanceof Error ? error.message : '新文档创建失败',
    )
  }
})

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

conversationsRoute.post('/:id/docx-agent/:runId/cancel', async (c) => {
  const conversation = await getConversation(c.req.param('id'))
  if (!conversation) throw new HttpError(404, 'NOT_FOUND', '会话不存在')
  const cancelled = await cancelPendingDocxRun(conversation.id, c.req.param('runId'))
  if (!cancelled) throw new HttpError(409, 'DOCX_AGENT_NOT_PENDING', '该工具轮已完成或已取消')
  return c.json({ ok: true })
})

conversationsRoute.post('/:id/document-agent/:runId/cancel', async (c) => {
  const conversation = await getConversation(c.req.param('id'))
  if (!conversation) throw new HttpError(404, 'NOT_FOUND', '会话不存在')
  const cancelled = await cancelPendingDocxRun(conversation.id, c.req.param('runId'))
  if (!cancelled) throw new HttpError(409, 'DOCUMENT_AGENT_NOT_PENDING', '该工具轮已完成或已取消')
  return c.json({ ok: true })
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
