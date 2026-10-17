import { layoutPdfTextInsert } from '../services/pdf-insert-layout.js'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  askInputSchema,
  htmlPlanPageInputSchema,
  htmlWriteDocumentInputSchema,
  markdownWriteDocumentInputSchema,
  documentAgentCreateInputSchema,
  documentAgentCreateFileFieldsSchema,
  pptxManualPictureFieldsSchema,
  pptxManualUploadSchema,
  pptxHostActionSchema,
  xlsxHostActionSchema,
  PPTX_IMAGE_MAX_BYTES,
  PPTX_ASSET_MAX_BYTES,
  pdfTextProbeSchema,
  pdfTextTargetSchema,
  pdfTextBlockOperationSchema,
  pdfMarkupInputSchema,
  pdfInsertLayoutInputSchema,
  pdfAnnotationOperationSchema,
  pdfFormOperationSchema,
  pdfImageOperationSchema,
  pdfAssetRequestSchema,
  pdfAssetPreviewSchema,
  pdfLocalOperationSchema,
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
import {
  createDocxAgentDocument,
  createDocumentAgentDocument,
  createDocumentAgentFile,
} from '../services/docx-create-document.js'
import { fetchDocxImage } from '../services/docx-image-fetch.js'
import { getDocument } from '../services/documents.js'
import {
  writeMarkdownDocument,
  streamMarkdownDocument,
} from '../services/markdown-agent-writing.js'
import {
  MarkdownFrontmatterConflictError,
  readMarkdownFrontmatter,
  updateMarkdownFrontmatter,
} from '../services/markdown-agent-frontmatter.js'
import {
  planHtmlPage,
  writeHtmlDocument,
  streamHtmlDocument,
} from '../services/html-agent-writing.js'
import {
  applyPptxManualPictureOnHost,
  applyPptxManualUploadOnHost,
  applyPptxOpsOnHost,
} from '../services/pptx-agent-host.js'
import { applyXlsxOpsOnHost } from '../services/xlsx-agent-host.js'
import {
  applyPdfTextInserts,
  applyPdfVerifiedTextEdit,
  applyPdfMarkupWithCount,
  inspectPdfTextTarget,
  applyPdfTextBlockOperation,
} from '../services/pdf-agent-host.js'
import {
  pdfAssetReadiness,
  preparePdfAsset,
  pdfAssetRegistry,
} from '../services/pdf-external-assets.js'
import { applyPdfImageOperation } from '../services/pdf-images.js'
import { applyPdfLocalOperation } from '../services/pdf-local.js'
import { applyPreservingPdfFormOperation } from '../services/pdf-preserving-forms.js'
import { applyPdfAnnotationOperation } from '../services/pdf-annotations.js'
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
  if (c.req.query('stream') === '1') {
    const controller = new AbortController()
    const abort = () => controller.abort()
    c.req.raw.signal.addEventListener('abort', abort, { once: true })
    if (c.req.raw.signal.aborted) controller.abort()
    let cancelled = false
    const encoder = new TextEncoder()
    const events = streamHtmlDocument({ ...input, signal: controller.signal })
    return new Response(
      new ReadableStream<Uint8Array>({
        async pull(stream) {
          try {
            const event = await events.next()
            if (cancelled) return
            if (event.done) {
              c.req.raw.signal.removeEventListener('abort', abort)
              stream.close()
            } else stream.enqueue(encoder.encode(JSON.stringify(event.value) + '\n'))
          } catch (error) {
            if (cancelled) return
            c.req.raw.signal.removeEventListener('abort', abort)
            stream.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: 'error',
                  message: error instanceof Error ? error.message.slice(0, 2000) : '页面写作失败',
                }) + '\n',
              ),
            )
            stream.close()
          }
        },
        async cancel() {
          cancelled = true
          controller.abort()
          c.req.raw.signal.removeEventListener('abort', abort)
          await events.return(undefined)
        },
      }),
      {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
        },
      },
    )
  }
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
      ops: z.string().max(8_000_000),
      action: pptxHostActionSchema.default('apply_ops'),
    })
    .superRefine((input, ctx) => {
      if (input.action !== 'manual_zoom' && input.ops.length > 1_000_000)
        ctx.addIssue({ code: 'custom', path: ['ops'], message: 'PPTX 操作参数过大' })
    })
    .safeParse({
      documentId: form.get('documentId'),
      expectedVersion: form.get('expectedVersion'),
      ops: form.get('ops'),
      action: form.get('action') ?? undefined,
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
      action: values.data.action,
      signal: c.req.raw.signal,
    })
    return c.json({
      bytesBase64: Buffer.from(result.bytes).toString('base64'),
      records: result.records,
      version: result.version,
      sampleData: result.sampleData,
      changed: result.changed,
      data: result.data,
    })
  } catch (error) {
    throw new HttpError(
      400,
      'PPTX_OPERATION_FAILED',
      error instanceof Error ? error.message : 'PPTX 操作失败',
    )
  }
})

conversationsRoute.post('/pptx-agent/manual-picture', async (c) => {
  const form = await readUploadForm(
    c.req.raw,
    MAX_ZIP_INPUT_BYTES + PPTX_IMAGE_MAX_BYTES + 1024 * 1024,
  )
  const file = form.get('file')
  const image = form.get('image')
  if (!(file instanceof File) || file.size > MAX_ZIP_INPUT_BYTES)
    throw new HttpError(413, 'PPTX_INPUT_TOO_LARGE', 'PPTX 原件超过 50 MiB 上限')
  if (!(image instanceof File) || image.size > PPTX_IMAGE_MAX_BYTES)
    throw new HttpError(413, 'PPTX_IMAGE_TOO_LARGE', '图片超过 8 MiB 上限')
  const values = pptxManualPictureFieldsSchema.safeParse({
    documentId: form.get('documentId'),
    expectedVersion: form.get('expectedVersion'),
    slide: form.get('slide'),
    action: form.get('action'),
    elementId: form.get('elementId') ?? undefined,
  })
  if (!values.success) throw new HttpError(400, 'INVALID_INPUT', 'PPTX 图片参数无效')
  try {
    const result = await applyPptxManualPictureOnHost({
      ...values.data,
      bytes: new Uint8Array(await file.arrayBuffer()),
      imageBytes: new Uint8Array(await image.arrayBuffer()),
      signal: c.req.raw.signal,
    })
    return c.json({
      bytesBase64: Buffer.from(result.bytes).toString('base64'),
      records: result.records,
      version: result.version,
    })
  } catch (error) {
    throw new HttpError(
      400,
      'PPTX_PICTURE_FAILED',
      error instanceof Error ? error.message : 'PPTX 图片操作失败',
    )
  }
})

conversationsRoute.post('/pptx-agent/manual-asset', async (c) => {
  const form = await readUploadForm(
    c.req.raw,
    MAX_ZIP_INPUT_BYTES + PPTX_ASSET_MAX_BYTES + PPTX_IMAGE_MAX_BYTES + 1024 * 1024,
  )
  const file = form.get('file')
  const asset = form.get('asset')
  const poster = form.get('poster')
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_ZIP_INPUT_BYTES)
    throw new HttpError(413, 'PPTX_INPUT_TOO_LARGE', 'PPTX 原件为空或超过 50 MiB 上限')
  if (!(asset instanceof File) || asset.size === 0 || asset.size > PPTX_ASSET_MAX_BYTES)
    throw new HttpError(413, 'PPTX_ASSET_TOO_LARGE', '素材为空或超过 32 MiB 上限')
  if (
    poster !== null &&
    (!(poster instanceof File) || poster.size === 0 || poster.size > PPTX_IMAGE_MAX_BYTES)
  )
    throw new HttpError(413, 'PPTX_POSTER_TOO_LARGE', '海报为空或超过 8 MiB 上限')
  if (poster instanceof File && poster.type !== 'image/png')
    throw new HttpError(400, 'PPTX_POSTER_INVALID', '请选择 PNG 海报')
  const fields = z
    .object({
      documentId: z.string().min(1).max(200),
      expectedVersion: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .pipe(z.number().int().nonnegative()),
      input: z.string().max(100_000),
    })
    .safeParse({
      documentId: form.get('documentId'),
      expectedVersion: form.get('expectedVersion'),
      input: form.get('input'),
    })
  if (!fields.success) throw new HttpError(400, 'INVALID_INPUT', 'PPTX 素材参数无效')
  let rawInput: unknown
  try {
    rawInput = JSON.parse(fields.data.input)
  } catch {
    throw new HttpError(400, 'INVALID_INPUT', 'PPTX 素材操作不是有效 JSON')
  }
  const input = pptxManualUploadSchema.safeParse(rawInput)
  if (!input.success) throw new HttpError(400, 'INVALID_INPUT', 'PPTX 素材操作参数无效')
  try {
    const result = await applyPptxManualUploadOnHost({
      documentId: fields.data.documentId,
      expectedVersion: fields.data.expectedVersion,
      bytes: new Uint8Array(await file.arrayBuffer()),
      input: input.data,
      assetBytes: new Uint8Array(await asset.arrayBuffer()),
      assetName: asset.name,
      assetMime: asset.type,
      posterBytes: poster instanceof File ? new Uint8Array(await poster.arrayBuffer()) : undefined,
      signal: c.req.raw.signal,
    })
    return c.json({
      bytesBase64: Buffer.from(result.bytes).toString('base64'),
      version: result.version,
      records: result.records,
      data: result.data,
    })
  } catch (error) {
    throw new HttpError(
      400,
      'PPTX_ASSET_FAILED',
      error instanceof Error ? error.message : 'PPTX 素材操作失败',
    )
  }
})

conversationsRoute.post('/xlsx-agent/apply-ops', async (c) => {
  const imageMaxBytes = 8 * 1024 * 1024
  const form = await readUploadForm(c.req.raw, MAX_ZIP_INPUT_BYTES + imageMaxBytes + 1024 * 1024)
  const file = form.get('file')
  if (!(file instanceof File) || file.size > MAX_ZIP_INPUT_BYTES)
    throw new HttpError(413, 'XLSX_INPUT_TOO_LARGE', 'XLSX 原件超过 50 MiB 上限')
  const image = form.get('imageBlob')
  if (
    image !== null &&
    (!(image instanceof File) || image.size === 0 || image.size > imageMaxBytes)
  )
    throw new HttpError(413, 'XLSX_IMAGE_TOO_LARGE', '图片为空或超过 8 MiB 上限')
  if (image instanceof File && !['image/png', 'image/jpeg'].includes(image.type))
    throw new HttpError(400, 'XLSX_IMAGE_INVALID', '请选择 PNG 或 JPEG 图片')
  const values = z
    .object({
      documentId: z.string().min(1).max(200),
      expectedVersion: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .pipe(z.number().int().nonnegative()),
      ops: z.string().max(1_000_000),
      action: xlsxHostActionSchema,
    })
    .safeParse({
      documentId: form.get('documentId'),
      expectedVersion: form.get('expectedVersion'),
      ops: form.get('ops'),
      action: form.get('action') ?? 'apply_ops',
    })
  if (!values.success) throw new HttpError(400, 'INVALID_INPUT', 'XLSX 操作参数无效')
  let ops: unknown
  try {
    ops = JSON.parse(values.data.ops)
  } catch {
    throw new HttpError(400, 'INVALID_INPUT', 'XLSX 操作不是有效 JSON')
  }
  if (
    !Array.isArray(ops) ||
    ops.length > 50 ||
    (values.data.action === 'apply_ops' ? ops.length < 1 : ops.length !== 0)
  )
    throw new HttpError(400, 'INVALID_INPUT', 'XLSX 操作批次必须包含 1–50 项')
  try {
    const result = await applyXlsxOpsOnHost({
      documentId: values.data.documentId,
      bytes: new Uint8Array(await file.arrayBuffer()),
      expectedVersion: values.data.expectedVersion,
      ops,
      action: values.data.action,
      image:
        image instanceof File
          ? { bytes: new Uint8Array(await image.arrayBuffer()), mimeType: image.type }
          : undefined,
      signal: c.req.raw.signal,
    })
    return c.json({
      bytesBase64: Buffer.from(result.bytes).toString('base64'),
      version: result.version,
      changedCells: result.changedCells,
      touchedEntries: result.touchedEntries,
      recalculation: result.recalculation,
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
  target: pdfTextTargetSchema.optional(),
  newFontSize: z.number().finite().positive().max(500).optional(),
  newColor: z
    .tuple([
      z.number().int().min(0).max(255),
      z.number().int().min(0).max(255),
      z.number().int().min(0).max(255),
    ])
    .optional(),
  newFont: z.enum(['arial', 'times', 'courier']).optional(),
  newBold: z.boolean().optional(),
  newItalic: z.boolean().optional(),
})
const pdfTextInsert = z.object({
  font: z.enum(['arial', 'times', 'courier']).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  lineLeading: z.number().finite().positive().max(1000).optional(),
  lineXOffsets: z.array(z.number().finite().nonnegative().max(14400)).max(10000).optional(),
  rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
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

conversationsRoute.post('/pdf-agent/local', async (c) => {
  const maxFileBytes = 50 * 1024 * 1024
  const form = await readUploadForm(c.req.raw, 2 * maxFileBytes + 1024 * 1024)
  const file = form.get('file')
  const asset = form.get('asset')
  if (!(file instanceof File) || file.size === 0 || file.size > maxFileBytes)
    throw new HttpError(413, 'PDF_INPUT_TOO_LARGE', 'PDF 原件应为 1 字节至 50 MiB')
  if (asset !== null && (!(asset instanceof File) || asset.size === 0 || asset.size > maxFileBytes))
    throw new HttpError(413, 'PDF_INPUT_TOO_LARGE', '导入 PDF 应为 1 字节至 50 MiB')
  const fields = z
    .object({
      documentId: z.string().min(1).max(200),
      expectedVersion: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .pipe(
          z
            .number()
            .int()
            .min(0)
            .max(Number.MAX_SAFE_INTEGER - 1),
        ),
    })
    .safeParse({ documentId: form.get('documentId'), expectedVersion: form.get('expectedVersion') })
  if (!fields.success) throw new HttpError(400, 'INVALID_INPUT', 'PDF 操作参数无效')
  const document = await getDocument(fields.data.documentId)
  if (!document || documentAgentFormatOf(document) !== 'pdf')
    throw new HttpError(404, 'PDF_NOT_FOUND', '当前文档不是可编辑 PDF')
  let raw: unknown
  try {
    raw = JSON.parse(String(form.get('operation')))
  } catch {
    throw new HttpError(400, 'INVALID_INPUT', 'PDF 操作不是有效 JSON')
  }
  const operation = pdfLocalOperationSchema.safeParse(raw)
  if (!operation.success) throw new HttpError(400, 'INVALID_INPUT', 'PDF 操作内容无效')
  const needsAsset = operation.data.op === 'import_pages' || operation.data.op === 'replace_pages'
  if (needsAsset !== asset instanceof File)
    throw new HttpError(
      400,
      'INVALID_INPUT',
      needsAsset ? '请选择导入 PDF' : '此操作不接受导入文件',
    )
  try {
    const result = await applyPdfLocalOperation(
      new Uint8Array(await file.arrayBuffer()),
      operation.data,
      asset instanceof File ? new Uint8Array(await asset.arrayBuffer()) : undefined,
      c.req.raw.signal,
    )
    c.req.raw.signal.throwIfAborted()
    return c.json({
      bytesBase64: result.bytes ? Buffer.from(result.bytes).toString('base64') : undefined,
      outputs: result.outputs?.map((output) => ({
        name: output.name,
        bytesBase64: Buffer.from(output.bytes).toString('base64'),
      })),
      info: result.info,
      version: fields.data.expectedVersion + (result.bytes ? 1 : 0),
    })
  } catch (error) {
    throw new HttpError(
      400,
      'PDF_LOCAL_FAILED',
      error instanceof Error ? error.message : 'PDF 操作失败',
    )
  }
})

conversationsRoute.post('/pdf-agent/text-blocks', async (c) => {
  const form = await readUploadForm(c.req.raw)
  const file = form.get('file')
  if (!(file instanceof File) || file.size < 1 || file.size > 50 * 1024 * 1024)
    throw new HttpError(413, 'PDF_INPUT_TOO_LARGE', 'PDF 原件超过 50 MiB 上限')
  const fields = z
    .object({
      documentId: z.string().min(1).max(200),
      expectedVersion: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .pipe(
          z
            .number()
            .int()
            .nonnegative()
            .max(Number.MAX_SAFE_INTEGER - 1),
        ),
    })
    .safeParse({ documentId: form.get('documentId'), expectedVersion: form.get('expectedVersion') })
  if (!fields.success) throw new HttpError(400, 'INVALID_INPUT', 'PDF 段落参数无效')
  const document = await getDocument(fields.data.documentId)
  if (!document || documentAgentFormatOf(document) !== 'pdf')
    throw new HttpError(404, 'PDF_NOT_FOUND', '当前文档不是可编辑 PDF')
  let raw: unknown
  try {
    raw = JSON.parse(String(form.get('operation')))
  } catch {
    throw new HttpError(400, 'INVALID_INPUT', 'PDF 段落不是有效 JSON')
  }
  const operation = pdfTextBlockOperationSchema.safeParse(raw)
  if (!operation.success) throw new HttpError(400, 'INVALID_INPUT', 'PDF 段落内容无效')
  try {
    const result = await applyPdfTextBlockOperation(
      new Uint8Array(await file.arrayBuffer()),
      operation.data,
      c.req.raw.signal,
    )
    return c.json({
      ...result,
      bytes: undefined,
      bytesBase64: result.bytes ? Buffer.from(result.bytes).toString('base64') : undefined,
      version: fields.data.expectedVersion + (result.bytes ? 1 : 0),
    })
  } catch (error) {
    throw new HttpError(
      400,
      'PDF_BLOCK_FAILED',
      error instanceof Error ? error.message : 'PDF 段落操作失败',
    )
  }
})

async function requirePdf(documentId: string) {
  const document = await getDocument(documentId)
  if (!document || documentAgentFormatOf(document) !== 'pdf')
    throw new HttpError(404, 'PDF_NOT_FOUND', '当前文档不是可编辑 PDF')
}
async function pdfAssetJson(request: Request): Promise<unknown> {
  // Count streaming bytes as well as Content-Length before JSON parsing.
  const reader = request.body?.getReader()
  if (!reader) throw new HttpError(400, 'INVALID_INPUT', 'PDF 图片素材参数缺失')
  const parts: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const item = await reader.read()
      if (item.done) break
      size += item.value.length
      if (size > 16 * 1024) {
        await reader.cancel()
        throw new HttpError(413, 'PDF_ASSET_INPUT_TOO_LARGE', 'PDF 图片素材参数超过16KiB')
      }
      parts.push(item.value)
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(400, 'INVALID_INPUT', 'PDF 图片素材参数不是有效 JSON')
  }
}
conversationsRoute.get('/pdf-agent/assets', async (c) => {
  const { documentId } = await parseInput(
    c,
    'query',
    z.object({ documentId: z.string().min(1).max(200) }),
  )
  await requirePdf(documentId)
  return c.json(await pdfAssetReadiness())
})
conversationsRoute.post('/pdf-agent/assets', async (c) => {
  const parsed = pdfAssetRequestSchema.safeParse(await pdfAssetJson(c.req.raw))
  if (!parsed.success) throw new HttpError(400, 'INVALID_INPUT', 'PDF 图片素材参数无效')
  const input = parsed.data
  await requirePdf(input.documentId)
  try {
    const data = await preparePdfAsset(
      {
        principal: c.get('user').id,
        documentId: input.documentId,
        assetSessionId: input.assetSessionId,
      },
      input.operation,
      c.req.raw.signal,
    )
    c.req.raw.signal.throwIfAborted()
    return c.json({ version: input.expectedVersion, data })
  } catch (error) {
    throw new HttpError(
      400,
      'PDF_ASSET_FAILED',
      error instanceof Error ? error.message : 'PDF 图片素材准备失败',
    )
  }
})
conversationsRoute.post('/pdf-agent/assets/preview', async (c) => {
  const parsed = pdfAssetPreviewSchema.safeParse(await pdfAssetJson(c.req.raw))
  if (!parsed.success) throw new HttpError(400, 'INVALID_INPUT', 'PDF 图片预览参数无效')
  const input = parsed.data
  await requirePdf(input.documentId)
  try {
    c.req.raw.signal.throwIfAborted()
    const image = pdfAssetRegistry.resolve(
      {
        principal: c.get('user').id,
        documentId: input.documentId,
        assetSessionId: input.assetSessionId,
      },
      input.url,
    )
    return new Response(new Uint8Array(image.bytes), {
      headers: {
        'Content-Type': image.mimeType,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    throw new HttpError(
      400,
      'PDF_ASSET_FAILED',
      error instanceof Error ? error.message : '图片预览已过期',
    )
  }
})

conversationsRoute.post('/pdf-agent/images', async (c) => {
  const form = await readUploadForm(c.req.raw)
  const file = form.get('file')
  if (!(file instanceof File) || file.size > 50 * 1024 * 1024)
    throw new HttpError(413, 'PDF_INPUT_TOO_LARGE', 'PDF 原件超过 50 MiB 上限')
  const fields = z
    .object({
      documentId: z.string().min(1).max(200),
      expectedVersion: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .pipe(
          z
            .number()
            .int()
            .nonnegative()
            .max(Number.MAX_SAFE_INTEGER - 1),
        ),
      assetSessionId: z.uuid().optional(),
      sha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
    })
    .safeParse({
      documentId: form.get('documentId'),
      expectedVersion: form.get('expectedVersion'),
      assetSessionId: form.get('assetSessionId') ?? undefined,
      sha256: form.get('sha256') ?? undefined,
    })
  if (!fields.success) throw new HttpError(400, 'INVALID_INPUT', 'PDF 图片参数无效')
  const document = await getDocument(fields.data.documentId)
  if (!document || documentAgentFormatOf(document) !== 'pdf')
    throw new HttpError(404, 'PDF_NOT_FOUND', '当前文档不是可编辑 PDF')
  let raw: unknown
  try {
    raw = JSON.parse(String(form.get('operation')))
  } catch {
    throw new HttpError(400, 'INVALID_INPUT', 'PDF 图片不是有效 JSON')
  }
  const operation = pdfImageOperationSchema.safeParse(raw)
  if (!operation.success) throw new HttpError(400, 'INVALID_INPUT', 'PDF 图片内容无效')
  try {
    c.req.raw.signal.throwIfAborted()
    let nativeOperation = operation.data
    if (
      (nativeOperation.op === 'insert_image' || nativeOperation.op === 'replace_image') &&
      nativeOperation.url?.startsWith('mimir-generated:')
    ) {
      if (!fields.data.assetSessionId) throw new Error('生成图片缺少当前文档会话，请重新生成')
      const image = pdfAssetRegistry.resolve(
        {
          principal: c.get('user').id,
          documentId: fields.data.documentId,
          assetSessionId: fields.data.assetSessionId,
        },
        nativeOperation.url,
      )
      const { url: _url, ...rest } = nativeOperation
      nativeOperation = { ...rest, image: Buffer.from(image.bytes).toString('base64') }
    }
    const result = await applyPdfImageOperation(
      new Uint8Array(await file.arrayBuffer()),
      nativeOperation,
      c.req.raw.signal,
    )
    return c.json({
      bytesBase64: result.bytes ? Buffer.from(result.bytes).toString('base64') : undefined,
      images: result.images,
      version: fields.data.expectedVersion + (result.bytes ? 1 : 0),
    })
  } catch (error) {
    throw new HttpError(
      400,
      'PDF_IMAGE_FAILED',
      error instanceof Error ? error.message : 'PDF 图片失败',
    )
  }
})

conversationsRoute.post('/pdf-agent/forms', async (c) => {
  const form = await readUploadForm(c.req.raw)
  const file = form.get('file')
  if (!(file instanceof File) || file.size > 50 * 1024 * 1024)
    throw new HttpError(413, 'PDF_INPUT_TOO_LARGE', 'PDF 原件超过 50 MiB 上限')
  const fields = z
    .object({
      documentId: z.string().min(1).max(200),
      expectedVersion: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .pipe(z.number().int().nonnegative()),
      sha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
    })
    .safeParse({
      documentId: form.get('documentId'),
      expectedVersion: form.get('expectedVersion'),
      sha256: form.get('sha256') ?? undefined,
    })
  if (!fields.success) throw new HttpError(400, 'INVALID_INPUT', 'PDF 表单参数无效')
  const document = await getDocument(fields.data.documentId)
  if (!document || documentAgentFormatOf(document) !== 'pdf')
    throw new HttpError(404, 'PDF_NOT_FOUND', '当前文档不是可编辑 PDF')
  let raw: unknown
  try {
    raw = JSON.parse(String(form.get('operation')))
  } catch {
    throw new HttpError(400, 'INVALID_INPUT', 'PDF 表单不是有效 JSON')
  }
  const operation = pdfFormOperationSchema.safeParse(raw)
  if (!operation.success) throw new HttpError(400, 'INVALID_INPUT', 'PDF 表单内容无效')
  try {
    const result = await applyPreservingPdfFormOperation(
      new Uint8Array(await file.arrayBuffer()),
      operation.data,
      fields.data.sha256,
    )
    return c.json({
      bytesBase64: result.bytes ? Buffer.from(result.bytes).toString('base64') : undefined,
      forms: result.forms,
      version: fields.data.expectedVersion + (result.bytes ? 1 : 0),
    })
  } catch (error) {
    throw new HttpError(
      400,
      'PDF_FORM_FAILED',
      error instanceof Error ? error.message : 'PDF 表单失败',
    )
  }
})

conversationsRoute.post('/pdf-agent/annotations', async (c) => {
  const form = await readUploadForm(c.req.raw)
  const file = form.get('file')
  if (!(file instanceof File) || file.size > 50 * 1024 * 1024)
    throw new HttpError(413, 'PDF_INPUT_TOO_LARGE', 'PDF 原件超过 50 MiB 上限')
  const fields = z
    .object({
      documentId: z.string().min(1).max(200),
      expectedVersion: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .pipe(z.number().int().nonnegative()),
      sha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
    })
    .safeParse({
      documentId: form.get('documentId'),
      expectedVersion: form.get('expectedVersion'),
      sha256: form.get('sha256') ?? undefined,
    })
  if (!fields.success) throw new HttpError(400, 'INVALID_INPUT', 'PDF 批注参数无效')
  const document = await getDocument(fields.data.documentId)
  if (!document || documentAgentFormatOf(document) !== 'pdf')
    throw new HttpError(404, 'PDF_NOT_FOUND', '当前文档不是可编辑 PDF')
  let raw: unknown
  try {
    raw = JSON.parse(String(form.get('operation')))
  } catch {
    throw new HttpError(400, 'INVALID_INPUT', 'PDF 批注不是有效 JSON')
  }
  const operation = pdfAnnotationOperationSchema.safeParse(raw)
  if (!operation.success) throw new HttpError(400, 'INVALID_INPUT', 'PDF 批注内容无效')
  try {
    const result = await applyPdfAnnotationOperation(
      new Uint8Array(await file.arrayBuffer()),
      operation.data,
      fields.data.sha256,
      (operation.data.op === 'add_note' || operation.data.op === 'reply_note') &&
        operation.data.authorship === 'user'
        ? c.get('user').name
        : 'AI Assistant',
    )
    return c.json({
      bytesBase64:
        operation.data.op === 'read' ? undefined : Buffer.from(result.bytes).toString('base64'),
      annotations: result.annotations,
      version: fields.data.expectedVersion + (operation.data.op === 'read' ? 0 : 1),
    })
  } catch (error) {
    throw new HttpError(
      400,
      'PDF_ANNOTATION_FAILED',
      error instanceof Error ? error.message : 'PDF 批注失败',
    )
  }
})

conversationsRoute.post('/pdf-agent/apply-markup', async (c) => {
  const form = await readUploadForm(c.req.raw)
  const file = form.get('file')
  if (!(file instanceof File) || file.size > 50 * 1024 * 1024)
    throw new HttpError(413, 'PDF_INPUT_TOO_LARGE', 'PDF 原件超过 50 MiB 上限')
  const fields = z
    .object({
      documentId: z.string().min(1).max(200),
      expectedVersion: z
        .string()
        .regex(/^\d+$/)
        .transform(Number)
        .pipe(z.number().int().nonnegative()),
    })
    .safeParse({ documentId: form.get('documentId'), expectedVersion: form.get('expectedVersion') })
  if (!fields.success) throw new HttpError(400, 'INVALID_INPUT', 'PDF 标注参数无效')
  const document = await getDocument(fields.data.documentId)
  if (!document || documentAgentFormatOf(document) !== 'pdf')
    throw new HttpError(404, 'PDF_NOT_FOUND', '当前文档不是可编辑 PDF')
  let raw: unknown
  try {
    raw = JSON.parse(String(form.get('markup')))
  } catch {
    throw new HttpError(400, 'INVALID_INPUT', 'PDF 标注不是有效 JSON')
  }
  const markup = pdfMarkupInputSchema.safeParse(raw)
  if (!markup.success) throw new HttpError(400, 'INVALID_INPUT', 'PDF 标注内容无效')
  try {
    const result = await applyPdfMarkupWithCount(
      new Uint8Array(await file.arrayBuffer()),
      markup.data,
    )
    return c.json({
      bytesBase64: Buffer.from(result.bytes).toString('base64'),
      version: fields.data.expectedVersion + 1,
      count: result.count,
    })
  } catch (error) {
    throw new HttpError(
      400,
      'PDF_MARKUP_FAILED',
      error instanceof Error ? error.message : 'PDF 标注失败',
    )
  }
})

conversationsRoute.post('/pdf-agent/inspect-text', async (c) => {
  const form = await readUploadForm(c.req.raw)
  const file = form.get('file')
  if (!(file instanceof File) || file.size > 50 * 1024 * 1024)
    throw new HttpError(413, 'PDF_INPUT_TOO_LARGE', 'PDF 原件超过 50 MiB 上限')
  const documentId = z.string().min(1).max(200).safeParse(form.get('documentId'))
  if (!documentId.success) throw new HttpError(400, 'INVALID_INPUT', 'PDF 文档标识无效')
  const document = await getDocument(documentId.data)
  if (!document || documentAgentFormatOf(document) !== 'pdf')
    throw new HttpError(404, 'PDF_NOT_FOUND', '当前文档不是可编辑 PDF')
  let raw: unknown
  try {
    raw = JSON.parse(String(form.get('probe')))
  } catch {
    throw new HttpError(400, 'INVALID_INPUT', 'PDF 原文定位参数不是有效 JSON')
  }
  const probe = pdfTextProbeSchema.safeParse(raw)
  if (!probe.success) throw new HttpError(400, 'INVALID_INPUT', 'PDF 原文定位参数无效')
  try {
    return c.json({
      target: await inspectPdfTextTarget(new Uint8Array(await file.arrayBuffer()), probe.data),
    })
  } catch (error) {
    throw new HttpError(
      400,
      'PDF_TEXT_INSPECT_FAILED',
      error instanceof Error ? error.message : 'PDF 原文定位失败',
    )
  }
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
      kind: z.enum(['edit', 'insert', 'layout']),
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
    .array(
      values.data.kind === 'edit'
        ? pdfTextEdit
        : values.data.kind === 'layout'
          ? pdfInsertLayoutInputSchema
          : pdfTextInsert,
    )
    .min(1)
    .max(30)
    .safeParse(raw)
  if (!items.success) throw new HttpError(400, 'INVALID_INPUT', 'PDF 文字操作列表无效')
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (values.data.kind === 'layout') {
      const layouts = []
      for (const item of items.data as z.infer<typeof pdfInsertLayoutInputSchema>[])
        layouts.push(await layoutPdfTextInsert(bytes, item))
      return c.json({
        bytesBase64: Buffer.from(bytes).toString('base64'),
        version: values.data.expectedVersion,
        layouts,
      })
    }
    let result: Uint8Array
    if (values.data.kind === 'edit') {
      const edits = items.data as z.infer<typeof pdfTextEdit>[]
      if (edits.length !== 1 || edits[0]?.target === undefined)
        throw new Error('替换原文需要先核验一段完整文字对象')
      result = await applyPdfVerifiedTextEdit(bytes, edits[0], edits[0].target)
    } else {
      result = await applyPdfTextInserts(bytes, items.data as z.infer<typeof pdfTextInsert>[])
    }
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
  const input = await parseInput(c, 'json', markdownWriteDocumentInputSchema)
  await requireMarkdownNote(input.documentId)
  if (c.req.query('stream') === '1') {
    const controller = new AbortController()
    const abort = () => controller.abort()
    c.req.raw.signal.addEventListener('abort', abort, { once: true })
    if (c.req.raw.signal.aborted) controller.abort()
    let cancelled = false
    const encoder = new TextEncoder()
    const events = streamMarkdownDocument({ ...input, signal: controller.signal })
    return new Response(
      new ReadableStream<Uint8Array>({
        async pull(stream) {
          try {
            const event = await events.next()
            if (cancelled) return
            if (event.done) {
              c.req.raw.signal.removeEventListener('abort', abort)
              stream.close()
            } else stream.enqueue(encoder.encode(JSON.stringify(event.value) + '\n'))
          } catch (error) {
            if (cancelled) return
            c.req.raw.signal.removeEventListener('abort', abort)
            stream.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: 'error',
                  message: error instanceof Error ? error.message.slice(0, 2000) : '长文写作失败',
                }) + '\n',
              ),
            )
            stream.close()
          }
        },
        async cancel() {
          cancelled = true
          controller.abort()
          c.req.raw.signal.removeEventListener('abort', abort)
          await events.return(undefined)
        },
      }),
      {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
        },
      },
    )
  }
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

conversationsRoute.post('/document-agent/create-document', async (c) => {
  const input = await parseInput(c, 'json', documentAgentCreateInputSchema)
  try {
    return c.json(await createDocumentAgentDocument(input), 201)
  } catch (error) {
    throw new HttpError(
      400,
      'DOCUMENT_CREATE_FAILED',
      error instanceof Error ? error.message : '新文档创建失败',
    )
  }
})

conversationsRoute.post('/document-agent/create-file', async (c) => {
  const form = await readUploadForm(c.req.raw)
  const input = documentAgentCreateFileFieldsSchema.safeParse({
    documentId: form.get('documentId'),
    title: form.get('title'),
    format: form.get('format'),
  })
  if (!input.success) throw new HttpError(400, 'INVALID_INPUT', '新文件参数无效')
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_ZIP_INPUT_BYTES)
    throw new HttpError(413, 'DOCUMENT_CREATE_TOO_LARGE', '新文件为空或超过 50 MiB 上限')
  try {
    return c.json(
      await createDocumentAgentFile({
        ...input.data,
        bytes: new Uint8Array(await file.arrayBuffer()),
      }),
      201,
    )
  } catch (error) {
    throw new HttpError(
      400,
      'DOCUMENT_CREATE_FAILED',
      error instanceof Error ? error.message : '新文件创建失败',
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
