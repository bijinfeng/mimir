import { PDF_IMAGE_TOOLS, executePdfImageTool, type PdfHostImages } from './pdf-image-agent.js'
import {
  pdfAnnotationOperationSchema,
  pdfFormOperationSchema,
  pdfTextBlockOperationSchema,
  pdfTextBlockTargetSchema,
  type PdfTextBlockOperation,
  type PdfTextBlockSnapshot,
  type PdfTextBlockTarget,
  type PdfFormOperation,
  type PdfFormSnapshot,
  type PdfAnnotationOperation,
  type PdfAnnotationSnapshot,
} from '@mimir/shared'
import type { PdfHostApply, PdfHostInspect, PdfHostMarkup } from '../editors/PdfEditor.js'
import type { PdfTextIndex } from '../editors/pdf-text.js'
import { pdfTextOccurrences } from '../editors/pdf-text-blocks.js'

export const PDF_CONTENT_TOOLS = [
  ...PDF_IMAGE_TOOLS,
  'list_form_fields',
  'list_text_blocks',
  'move_text_block',
  'edit_block',
  'edit_text',
  'markup_text',
  'read_annotations',
  'add_note',
  'reply_note',
  'edit_note',
  'delete_note',
  'delete_markup',
] as const
export interface PdfHostBlocks {
  (input: {
    bytes: Uint8Array
    expectedVersion: number
    operation: PdfTextBlockOperation
    signal?: AbortSignal
  }): Promise<{
    bytes?: Uint8Array
    version: number
    blocks: PdfTextBlockSnapshot
    target?: PdfTextBlockTarget
  }>
}
export interface PdfHostAnnotations {
  (input: {
    bytes: Uint8Array
    expectedVersion: number
    operation: PdfAnnotationOperation
    sha256?: string
    signal?: AbortSignal
  }): Promise<{ bytes?: Uint8Array; version: number; annotations: PdfAnnotationSnapshot }>
}
export interface PdfHostForms {
  (input: {
    bytes: Uint8Array
    expectedVersion: number
    operation: PdfFormOperation
    sha256?: string
    signal?: AbortSignal
  }): Promise<{ bytes?: Uint8Array; version: number; forms: PdfFormSnapshot }>
}
function pageIndex(value: unknown, total: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > total)
    throw new Error(`页号必须在 1–${total} 之间`)
  return value - 1
}

const squash = (text: string) => text.replace(/\s+/g, '')

/** Manual toolbar and Agent both enter this executor with the live byte version. */
export async function executePdfContentTool(input: {
  tool: string
  args: Record<string, unknown>
  bytes: Uint8Array
  version: number
  pageCount: number
  textIndex(): Promise<PdfTextIndex>
  inspect?: PdfHostInspect
  apply?: PdfHostApply
  markup?: PdfHostMarkup
  annotations?: PdfHostAnnotations
  forms?: PdfHostForms
  images?: PdfHostImages
  blocks?: PdfHostBlocks
  signal?: AbortSignal
  manual?: boolean
}): Promise<{ bytes?: Uint8Array; data?: unknown }> {
  const { tool, args, bytes, version, signal } = input
  if ((PDF_IMAGE_TOOLS as readonly string[]).includes(tool))
    return executePdfImageTool({ ...input, host: input.images })
  if (
    tool === 'list_text_blocks' ||
    tool === 'move_text_block' ||
    tool === 'edit_block' ||
    (tool === 'edit_text' && input.blocks)
  ) {
    if (!input.blocks) throw new Error('PDF 原文段落宿主未连接')
    const page = pageIndex(args.page, input.pageCount)
    if (signal?.aborted) throw new Error('操作已取消')
    let target: PdfTextBlockTarget
    let occurrence = args.occurrence === undefined ? 1 : args.occurrence
    if (
      typeof occurrence !== 'number' ||
      !Number.isInteger(occurrence) ||
      occurrence < 1 ||
      occurrence > 10000
    )
      throw new Error('occurrence必须是1起的出现次序')
    if (tool !== 'list_text_blocks' && input.manual && args.target !== undefined) {
      target = pdfTextBlockTargetSchema.parse(args.target)
      if (target.pageIndex !== page) throw new Error('PDF 段落与当前页面不一致')
    } else {
      if (args.target !== undefined) throw new Error('Agent 必须读取并定位原文段落')
      const before = await input.blocks({
        bytes,
        expectedVersion: version,
        operation: { op: 'read', pageIndex: page },
        signal,
      })
      if (signal?.aborted) throw new Error('操作已取消')
      if (before.version !== version || before.bytes) throw new Error('PDF 段落读取版本无效')
      if (tool === 'list_text_blocks') return { data: before.blocks }
      if (tool === 'edit_text') {
        if (
          typeof args.old_text !== 'string' ||
          !args.old_text.trim() ||
          args.old_text.length > 10000
        )
          throw new Error('请提供需要替换的原文')
        const hits = before.blocks.blocks.flatMap((block) =>
            pdfTextOccurrences(block.text, args.old_text as string).map((_, index) => ({
              block,
              occurrence: index + 1,
            })),
          ),
          match = hits[occurrence - 1]
        if (!match?.block.editable || !match.block.target)
          throw new Error(match?.block.reason ?? '没有指定出现次序的可编辑原文')
        target = match.block.target
        occurrence = match.occurrence
      } else {
        if (
          typeof args.paragraph_text !== 'string' ||
          !args.paragraph_text.trim() ||
          args.paragraph_text.length > 10000
        )
          throw new Error('请提供唯一段落片段 paragraph_text')
        const matches = before.blocks.blocks.filter((block) =>
          squash(block.text).includes(squash(args.paragraph_text as string)),
        )
        if (matches.length !== 1) throw new Error('段落片段不能唯一定位，请先读取并使用更长的原文')
        const selected = matches[0]!
        if (!selected.editable || !selected.target)
          throw new Error(selected.reason ?? '此段落无法安全移动')
        target = selected.target
      }
    }
    const operation = pdfTextBlockOperationSchema.parse(
      tool === 'move_text_block'
        ? {
            op: 'move',
            target,
            dx: args.dx,
            dy: args.dy,
          }
        : {
            op: 'rewrite',
            target,
            newText: args.new_text,
            replace: tool === 'edit_text' ? { oldText: args.old_text, occurrence } : undefined,
            fontSize: args.font_size,
            color: args.color,
            font: args.font,
            bold: args.bold,
            italic: args.italic,
            align: args.align,
          },
    )
    if (signal?.aborted) throw new Error('操作已取消')
    const result = await input.blocks({ bytes, expectedVersion: version, operation, signal })
    if (signal?.aborted) throw new Error('操作已取消')
    if (!result.bytes || result.version !== version + 1) throw new Error('PDF 段落宿主结果无效')
    return { bytes: result.bytes, data: result.blocks }
  }
  if (tool === 'list_form_fields' || tool === 'apply_ops') {
    if (!input.forms) throw new Error('PDF 表单宿主未连接')
    const before = await input.forms({
      bytes,
      expectedVersion: version,
      operation: { op: 'read' },
      signal,
    })
    if (before.version !== version) throw new Error('PDF 表单宿主版本无效')
    if (signal?.aborted) throw new Error('操作已取消')
    if (tool === 'list_form_fields') return { data: before.forms }
    const operation = pdfFormOperationSchema.parse({
      op: 'apply',
      ops: args.ops,
      dryRun: args.dry_run,
    })
    const result = await input.forms({
      bytes,
      expectedVersion: version,
      operation,
      sha256: before.forms.sha256,
      signal,
    })
    if (result.version !== version + (result.bytes ? 1 : 0)) throw new Error('PDF 表单宿主版本无效')
    if (operation.op === 'apply' && operation.dryRun && result.bytes)
      throw new Error('PDF 预检不能返回可写字节')
    if (operation.op === 'apply' && !operation.dryRun && !result.bytes)
      throw new Error('PDF 表单宿主缺少修改后的字节')
    return { bytes: result.bytes, data: result.forms }
  }
  const page = tool === 'read_annotations' ? 0 : pageIndex(args.page, input.pageCount)
  const wholeRun = async (text: unknown) => {
    if (typeof text !== 'string' || !text.trim() || text.length > 10_000)
      throw new Error('原文必须是 1–10000 字符的完整文字项')
    const index = await input.textIndex()
    const chunks = index.pages[page]?.chunks.filter((chunk) => chunk.sourceText === text) ?? []
    if (chunks.length !== 1)
      throw new Error('原文不是唯一完整文字项，请重新读取；暂不支持部分或重复原文')
    return chunks[0]!
  }
  if (tool === 'edit_text' || tool === 'markup_text') {
    const chunk = await wholeRun(tool === 'edit_text' ? args.old_text : args.text)
    if (!input.inspect) throw new Error('PDF 原文核验宿主未连接')
    if (args.occurrence !== undefined && args.occurrence !== 1)
      throw new Error('暂只支持唯一完整原文')
    if (args.all !== undefined && args.all !== false) throw new Error('暂不支持批量标注重复原文')
    const target = await input.inspect({
      bytes,
      probe: { pageIndex: page, oldText: chunk.sourceText, rect: [...chunk.pdfRect] },
      signal,
    })
    if (signal?.aborted) throw new Error('操作已取消')
    if (tool === 'markup_text') {
      if (!input.markup) throw new Error('PDF 标注宿主未连接')
      if (!['highlight', 'underline', 'strikeout'].includes(String(args.type)))
        throw new Error('标注类型无效')
      if (args.color !== undefined) throw new Error('暂不支持自定义标注颜色')
      const result = await input.markup({
        bytes,
        expectedVersion: version,
        markup: { target, type: args.type as 'highlight' | 'underline' | 'strikeout' },
        signal,
      })
      if (result.version !== version + 1) throw new Error('PDF 宿主返回了错误的画布版本')
      return { bytes: result.bytes }
    }
    if (!input.apply) throw new Error('PDF 文字宿主未连接')
    if (
      typeof args.new_text !== 'string' ||
      args.new_text.length > 10_000 ||
      (args.new_text !== '' && !args.new_text.trim())
    )
      throw new Error('替换文字无效')
    if (
      args.font_size !== undefined &&
      (typeof args.font_size !== 'number' ||
        !Number.isFinite(args.font_size) ||
        args.font_size <= 0 ||
        args.font_size > 500)
    )
      throw new Error('字号必须在 0–500 pt 之间')
    if (
      args.color !== undefined &&
      (typeof args.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(args.color))
    )
      throw new Error('颜色必须是 #RRGGBB')
    if (args.font !== undefined && !['arial', 'times', 'courier'].includes(String(args.font)))
      throw new Error('字体无效')
    for (const flag of ['bold', 'italic'])
      if (args[flag] !== undefined && typeof args[flag] !== 'boolean')
        throw new Error(`${flag} 必须是布尔值`)
    const result = await input.apply({
      bytes,
      expectedVersion: version,
      kind: 'edit',
      items: [
        {
          pageIndex: page,
          rect: [...chunk.pdfRect],
          oldText: chunk.sourceText,
          newText: args.new_text,
          fontSize: chunk.fontSizeHint,
          target,
          newFontSize: args.font_size,
          newColor:
            args.color === undefined
              ? undefined
              : [1, 3, 5].map((at) => parseInt((args.color as string).slice(at, at + 2), 16)),
          newFont: args.font,
          newBold: args.bold,
          newItalic: args.italic,
        },
      ],
      signal,
    })
    if (result.version !== version + 1) throw new Error('PDF 宿主返回了错误的画布版本')
    return { bytes: result.bytes }
  }
  if (!input.annotations) throw new Error('PDF 批注宿主未连接')
  const before = await input.annotations({
    bytes,
    expectedVersion: version,
    operation: { op: 'read' },
    signal,
  })
  if (before.version !== version) throw new Error('PDF 宿主返回了错误的画布版本')
  if (tool === 'read_annotations') {
    const start = args.start === undefined ? 0 : pageIndex(args.start, input.pageCount)
    const end = args.end === undefined ? input.pageCount - 1 : pageIndex(args.end, input.pageCount)
    if (end < start) throw new Error('批注页码范围无效')
    return {
      data: {
        ...before.annotations,
        annotations: before.annotations.annotations.filter(
          (entry) => entry.page > start && entry.page <= end + 1,
        ),
      },
    }
  }
  let operation: unknown = {
    ...args,
    op: tool,
    pageIndex: page,
    authorship: input.manual ? 'user' : 'agent',
  }
  if (tool === 'add_note' && args.anchor_text !== undefined) {
    if (args.x !== undefined || args.y !== undefined) throw new Error('便笺锚点文字与坐标不能混用')
    const chunk = await wholeRun(args.anchor_text)
    // Text rectangles already use the displayed page direction.
    const { loadPdfDocument } = await import('../editors/pdf-render.js')
    const viewport = (await (await loadPdfDocument(bytes)).getPage(page + 1)).getViewport({
      scale: 1,
    })
    operation = {
      ...args,
      authorship: input.manual ? 'user' : 'agent',
      op: tool,
      pageIndex: page,
      x: Math.max(
        0,
        Math.min(viewport.width - 20, (chunk.rect.x + chunk.rect.width) * viewport.width),
      ),
      y: Math.max(0, Math.min(viewport.height - 20, chunk.rect.y * viewport.height)),
    }
  }
  const parsed = pdfAnnotationOperationSchema.parse(operation)
  if (parsed.op === 'read') throw new Error('无效的批注修改')
  const result = await input.annotations({
    bytes,
    expectedVersion: version,
    operation: parsed,
    sha256: before.annotations.sha256,
    signal,
  })
  if (!result.bytes || result.version !== version + 1) throw new Error('PDF 批注宿主返回结果无效')
  return { bytes: result.bytes, data: result.annotations }
}
