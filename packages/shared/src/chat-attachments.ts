import { z } from 'zod'

export const CHAT_ATTACHMENT_LIMITS = {
  files: 4,
  totalBytes: 20 * 1024 * 1024,
  documentBytes: 10 * 1024 * 1024,
  imageBytes: 5 * 1024 * 1024,
  imageEdge: 4096,
  imagePixels: 16_000_000,
  textCharacters: 12_000,
  roundCharacters: 24_000,
  conversationBytes: 200 * 1024 * 1024,
  draftMs: 24 * 60 * 60 * 1000,
  orphanMs: 60 * 60 * 1000,
  preparationMs: 30_000,
  leaseMs: 5 * 60 * 1000,
} as const

export const chatAttachmentRefSchema = z.object({
  id: z.string().min(1).max(100),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})
export type ChatAttachmentRef = z.infer<typeof chatAttachmentRefSchema>
export const chatAttachmentSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  name: z.string(),
  mime: z.string(),
  size: z.number(),
  sha256: z.string(),
  kind: z.enum(['document', 'image']),
  status: z.enum(['processing', 'ready', 'failed', 'unavailable']),
  error: z.string().optional(),
  originalUrl: z.string(),
  createdAt: z.string(),
  expiresAt: z.string().optional(),
  bound: z.boolean(),
})
export type ChatAttachment = z.infer<typeof chatAttachmentSchema>

export function attachmentDefaultQuestion(
  attachments: readonly Pick<ChatAttachment, 'kind'>[],
): string {
  return attachments.some((item) => item.kind === 'document')
    ? '请概括附件内容'
    : '请描述并分析这些图片'
}
