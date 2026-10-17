import { z } from 'zod'

export const PPTX_DECK_STREAM_MAX_BYTES = 256 * 1024 * 1024
export const PPTX_DECK_CANDIDATE_MAX_BYTES = 50 * 1024 * 1024
export const PPTX_DECK_STREAM_MAX_LINE = Math.ceil(PPTX_DECK_CANDIDATE_MAX_BYTES / 3) * 4 + 20000
export const PPTX_DECK_STREAM_MAX_EVENTS = 250
export const PPTX_DECK_GENERATION_TIMEOUT = 10 * 60 * 1000
const base = {
  generationId: z.string().min(1).max(100),
  total: z.number().int().min(1).max(80),
  completed: z.number().int().min(0).max(80),
  insertMode: z.enum(['replace', 'append']),
  originalPages: z.number().int().min(1).max(10000),
}
export const pptxDeckProgressSchema = z
  .object({
    ...base,
    stage: z.enum(['planning', 'generating', 'checkpoint']),
    title: z.string().max(300).optional(),
  })
  .strict()
  .refine((v) => v.completed <= v.total)
export type PptxDeckProgress = z.infer<typeof pptxDeckProgressSchema>
export const pptxDeckCandidateDataSchema = z
  .object({
    pages: z.number().int().min(1).max(80),
    style: z.string().max(12000),
    topic: z.string().max(6000),
  })
  .strict()
export const pptxDeckStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('progress'), progress: pptxDeckProgressSchema }).strict(),
  z
    .object({
      type: z.literal('checkpoint'),
      progress: pptxDeckProgressSchema,
      bytesBase64: z
        .string()
        .min(1)
        .max(PPTX_DECK_STREAM_MAX_LINE)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/),
      data: pptxDeckCandidateDataSchema,
      sampleData: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('done'),
      generationId: z.string(),
      completed: z.number().int().min(1).max(80),
    })
    .strict(),
  z
    .object({
      type: z.literal('error'),
      generationId: z.string(),
      message: z.string().max(2000),
      recoverable: z.boolean(),
    })
    .strict(),
])
export type PptxDeckStreamEvent = z.infer<typeof pptxDeckStreamEventSchema>
export interface PptxDeckCheckpoint {
  bytes: Uint8Array
  data: z.infer<typeof pptxDeckCandidateDataSchema>
  sampleData: boolean
}
export type PptxDeckProgressListener = (
  progress: PptxDeckProgress,
  candidate?: PptxDeckCheckpoint,
) => Promise<void>
/** Only a clean server failure or an explicit local Stop permits a completed candidate. */
export class PptxDeckStreamError extends Error {
  constructor(
    message: string,
    readonly partialAllowed = false,
  ) {
    super(message)
  }
}
