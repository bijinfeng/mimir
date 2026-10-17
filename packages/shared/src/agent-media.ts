import { z } from 'zod'
import { PDF_IMAGE_ASPECT_RATIOS } from './pdf-agent.js'

/** Shared provider size choices; ratios map to the provider's discrete supported sizes. */
export const agentImageAspectRatioSchema = z.enum(PDF_IMAGE_ASPECT_RATIOS)
export type AgentImageAspectRatio = z.infer<typeof agentImageAspectRatioSchema>
export const agentImageGenerationSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  aspectRatio: agentImageAspectRatioSchema.optional(),
})
export const pptxImageGenerationSchema = agentImageGenerationSchema
  .extend({
    referenceImageUrls: z.array(z.string().min(1).max(2000)).max(4).optional(),
    transparentBackground: z.boolean().optional(),
  })
  .strict()
export const pptxMediaAnalysisSchema = z
  .object({
    mediaUrls: z.array(z.string().min(1).max(2000)).min(1).max(4).optional(),
    kind: z.enum(['image', 'audio', 'video']).default('image'),
    requirements: z.string().trim().min(1).max(4000),
    includeAudio: z.boolean().default(false),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.kind === 'image' && !input.mediaUrls?.length)
      ctx.addIssue({ code: 'custom', path: ['mediaUrls'], message: '图片分析需要素材地址' })
    if (input.kind !== 'video' && input.includeAudio)
      ctx.addIssue({ code: 'custom', path: ['includeAudio'], message: '仅视频可选择同时分析音轨' })
  })

/** Filename is an exact request-local alias, never a filesystem path. */
export function agentAttachmentName(url: string): string | null {
  if (!url.startsWith('attachment://')) return null
  let name: string
  try {
    name = decodeURIComponent(url.slice('attachment://'.length))
  } catch {
    throw new Error('附件名称编码无效')
  }
  if (
    !name ||
    name.length > 200 ||
    /[\\/]/.test(name) ||
    [...name].some((character) => character.charCodeAt(0) < 32) ||
    name === '.' ||
    name === '..'
  )
    throw new Error('附件须使用原文件名，不得包含路径')
  return name
}

/** Original bytes selected by the user; never accepted as model tool JSON. */
export interface AgentMediaAttachment {
  name: string
  mimeType: string
  bytes: Uint8Array
}

const agentMediaPayloadSchema = z
  .object({
    mimeType: z.string().max(100),
    data: z.string().min(1).max(14_000_000),
  })
  .strict()
/** Prepared media only: video originals stay local; frames/audio reach the service. */
export const agentMediaAnalysisInputSchema = z
  .object({
    documentId: z.string().min(1).max(200),
    instruction: z.string().trim().min(1).max(4000),
    kind: z.enum(['image', 'audio', 'video']),
    media: z.array(agentMediaPayloadSchema).min(1).max(4),
    audio: agentMediaPayloadSchema.optional(),
  })
  .strict()
export type AgentMediaAnalysisInput = z.infer<typeof agentMediaAnalysisInputSchema>
