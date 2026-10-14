import { z } from 'zod'
import type { DocumentDetail } from './documents.js'
import { viewerFor } from './files.js'

/** Editor format is verified against the authenticated document before tools are selected. */
export const documentAgentFormatSchema = z.enum(['docx', 'xlsx', 'pptx', 'markdown', 'html', 'pdf'])
export type DocumentAgentFormat = z.infer<typeof documentAgentFormatSchema>

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

export const htmlPageBriefSchema = z.object({
  title: z.string().max(200),
  tone: z.string().max(400),
  audience: z.string().max(400),
  sections: z
    .array(
      z.object({
        title: z.string().max(200),
        purpose: z.string().max(1_000),
      }),
    )
    .min(1)
    .max(20),
})
export type HtmlPageBrief = z.infer<typeof htmlPageBriefSchema>

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
