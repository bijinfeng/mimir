import { z } from 'zod'
import { htmlPageBriefSchema } from './html-brief.js'
import type { DocumentDetail } from './documents.js'
import { viewerFor } from './files.js'

/** Editor format is verified against the authenticated document before tools are selected. */
export const documentAgentFormatSchema = z.enum(['docx', 'xlsx', 'pptx', 'markdown', 'html', 'pdf'])
export type DocumentAgentFormat = z.infer<typeof documentAgentFormatSchema>

/** The separate action keeps non-model setChart out of the general operation allowlist. */
export const pptxHostActionSchema = z.enum([
  'apply_ops',
  'edit_chart',
  'edit_animation',
  'manual_asset',
  'manual_ink',
  'manual_fill',
  'manual_zoom',
  'manual_animation',
  'manual_shape',
  'manual_paragraph',
  'manual_picture',
  'insert_web_image',
  'replace_image',
  'plan_deck',
  'generate_deck',
  'regenerate_slide',
  'save_style_template',
  'list_style_templates',
  'generate_image',
  'analyze_media',
])
export type PptxHostAction = z.infer<typeof pptxHostActionSchema>
const chartColor = z.string().regex(/^#[0-9a-fA-F]{6}$/)
export const pptxChartPatchSchema = z
  .object({
    kind: z
      .enum([
        'bar',
        'barStacked',
        'barPercentStacked',
        'bar3D',
        'line',
        'area',
        'pie',
        'pie3D',
        'doughnut',
        'scatter',
        'radar',
        'comboBarLine',
      ])
      .optional(),
    barDir: z.enum(['col', 'bar']).optional(),
    title: z.string().max(500).optional(),
    categories: z.array(z.string().max(500)).min(1).max(200).optional(),
    series: z
      .array(
        z
          .object({
            name: z.string().max(500),
            values: z.array(z.number().finite()).min(1).max(200),
          })
          .strict(),
      )
      .min(1)
      .max(20)
      .optional(),
    colorScheme: z.array(chartColor).min(1).max(20).optional(),
    legendPos: z.enum(['b', 't', 'r', 'l', 'none']).optional(),
    dataLabels: z.boolean().optional(),
    gridlines: z.boolean().optional(),
    catAxisTitle: z.string().max(500).optional(),
    valAxisTitle: z.string().max(500).optional(),
    gapWidthPct: z.number().min(0).max(500).optional(),
    holeSizePct: z.number().min(10).max(90).optional(),
    switchRowCol: z.boolean().optional(),
    pointColors: z
      .record(
        z.string().regex(/^\d{1,3}$/),
        z.record(z.string().regex(/^\d{1,3}$/), chartColor.nullable()),
      )
      .optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, '图表修改不能为空')
export const pptxChartEditOpSchema = z
  .object({
    op: z.literal('setChart'),
    target: z
      .object({ slide: z.number().int().nonnegative(), el: z.string().min(1).max(200) })
      .strict(),
    patch: pptxChartPatchSchema,
    dataSource: z.enum(['user', 'document', 'sample']).optional(),
    confirmImport: z.boolean().optional(),
  })
  .strict()

/** Manual-only timing patch; raw timing XML and shape ids never come from clients. */
export const pptxAnimationTimingOpSchema = z
  .object({
    op: z.literal('editAnimationTiming'),
    target: z.object({ slide: z.number().int().nonnegative() }).strict(),
    seq: z.number().int().min(0).max(10000),
    durationMs: z.number().finite().min(0).max(60000).optional(),
    delayMs: z.number().finite().min(0).max(60000).optional(),
    trigger: z.enum(['onClick', 'withPrev', 'afterPrev']).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.durationMs !== undefined || value.delayMs !== undefined || value.trigger !== undefined,
    '动画时间修改不能为空',
  )

/** Multipart local image command. Media bytes and the current PPTX are separate file fields. */
export const PPTX_IMAGE_MAX_BYTES = 8 * 1024 * 1024
export const pptxManualPictureFieldsSchema = z.object({
  documentId: z.string().min(1).max(200),
  expectedVersion: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().nonnegative()),
  slide: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().nonnegative()),
  action: z.enum(['insert', 'replace']),
  elementId: z.string().min(1).max(200).optional(),
})
export type PptxManualPictureFields = z.output<typeof pptxManualPictureFieldsSchema>

/** Both UI and host use the persisted MIME and active source extension. */
export function documentAgentFormatOf(
  document: Pick<DocumentDetail, 'kind' | 'mime' | 'fileExtension'>,
): DocumentAgentFormat | null {
  if (document.kind === 'note') return 'markdown'
  if (document.kind !== 'file') return null
  switch (document.mime) {
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx'
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return 'xlsx'
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return 'pptx'
    case 'text/markdown':
    case 'text/x-markdown':
      return 'markdown'
    case 'text/html':
      return 'html'
    case 'application/pdf':
      return 'pdf'
    default:
      if (document.mime !== 'application/octet-stream') return null
      switch (document.fileExtension) {
        case 'docx':
        case 'xlsx':
        case 'pptx':
        case 'html':
        case 'pdf':
          return document.fileExtension
        case 'md':
        case 'markdown':
          return 'markdown'
        default:
          return null
      }
  }
}

/** An identified format is writable only when the shared renderer opens its editor. */
export function documentAgentCanvasSupported(
  document: Pick<DocumentDetail, 'kind' | 'mime' | 'fileExtension'>,
): boolean {
  const format = documentAgentFormatOf(document)
  if (!format) return false
  if (document.kind === 'note') return format === 'markdown'
  const viewer = viewerFor(document.mime)
  return (
    (format === 'docx' && viewer === 'office') ||
    (format === 'xlsx' && viewer === 'sheet') ||
    (format === 'pptx' && viewer === 'deck') ||
    (format === 'html' && viewer === 'html') ||
    (format === 'pdf' && viewer === 'pdf')
  )
}

export const documentAgentRoundSchema = z.object({
  format: documentAgentFormatSchema,
  documentId: z.string().min(1),
  roundId: z.string().min(1).max(100),
  version: z.number().int().nonnegative(),
  context: z.record(z.string(), z.unknown()),
})
export type DocumentAgentRound = z.infer<typeof documentAgentRoundSchema>

export const documentAgentToolResultSchema = z.object({
  ok: z.boolean(),
  changed: z.boolean().optional(),
  version: z.number().int().nonnegative().optional(),
  summary: z.string().optional(),
  error: z.string().optional(),
  data: z.unknown().optional(),
})
export type DocumentAgentToolResult = z.infer<typeof documentAgentToolResultSchema>

export interface DocumentAgentCapabilities {
  format: DocumentAgentFormat
  documentId: string
  modelReady: boolean
  executorReady: boolean
  mediaKinds?: Array<'image' | 'audio' | 'video'>
  availableTools: string[]
  unavailableTools: { name: string; reason: string }[]
}

export { htmlPageBriefSchema, type HtmlPageBrief } from './html-brief.js'

export const htmlPlanPageInputSchema = z.object({
  documentId: z.string().min(1).max(200),
  mode: z.enum(['new', 'redesign', 'restyle', 'extract']),
  instruction: z.string().trim().min(1).max(4_000),
  notes: z.string().max(2_000).optional(),
  currentSource: z.string().max(8_000).optional(),
})
export type HtmlPlanPageInput = z.infer<typeof htmlPlanPageInputSchema>

export const htmlWriteDocumentInputSchema = z.object({
  documentId: z.string().min(1).max(200),
  kind: z.enum(['design', 'content']),
  instruction: z.string().trim().min(1).max(4_000),
  brief: htmlPageBriefSchema.optional(),
  title: z.string().max(200).optional(),
  plan: z.string().max(4_000).optional(),
  context: z.string().max(8_000).optional(),
})
export type HtmlWriteDocumentInput = z.infer<typeof htmlWriteDocumentInputSchema>

/** Incremental HTML writing: a final done event is required before automatic apply. */
export const htmlWriteStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('delta'), text: z.string().max(200_000) }),
  z.object({ type: z.literal('done'), html: z.string().max(200_000), complete: z.literal(true) }),
  z.object({ type: z.literal('error'), message: z.string().max(2000) }),
])
export type HtmlWriteStreamEvent = z.infer<typeof htmlWriteStreamEventSchema>

export const markdownWriteDocumentInputSchema = z.object({
  documentId: z.string().min(1).max(200),
  plan: z.string().trim().min(1).max(8_000),
  title: z.string().max(160).optional(),
  context: z.string().max(20_000).optional(),
})
export type MarkdownWriteDocumentInput = z.infer<typeof markdownWriteDocumentInputSchema>

export const markdownWriteStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('delta'), text: z.string().max(100_000) }),
  z.object({
    type: z.literal('done'),
    markdown: z.string().max(100_000),
    complete: z.literal(true),
  }),
  z.object({ type: z.literal('error'), message: z.string().max(2000) }),
])
export type MarkdownWriteStreamEvent = z.infer<typeof markdownWriteStreamEventSchema>

/** New files use the existing upload/index path; the source canvas is unchanged. */
export const documentAgentCreateInputSchema = z.object({
  documentId: z.string().min(1).max(200),
  title: z.string().trim().min(1).max(160),
  format: z.enum(['docx', 'pdf', 'md', 'html']),
  content: z
    .string()
    .min(1)
    .max(100_000)
    .refine((value) => value.trim().length > 0),
})
export type DocumentAgentCreateInput = z.infer<typeof documentAgentCreateInputSchema>
export const documentAgentCreateFileFieldsSchema = z.object({
  documentId: z.string().min(1).max(200),
  title: z.string().trim().min(1).max(160),
  format: z.enum(['xlsx', 'csv']),
})
export type DocumentAgentCreateFileFields = z.infer<typeof documentAgentCreateFileFieldsSchema>
export interface DocumentAgentCreatedDocument {
  documentId: string
  title: string
  format: 'docx' | 'pdf' | 'md' | 'html' | 'xlsx' | 'csv'
  parseError: string | null
}
