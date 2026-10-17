import { z } from 'zod'

export const PDF_SIGNATURE_LIMITS = {
  strokes: 64,
  points: 2000,
  pngBytes: 4 * 1024 * 1024,
  imageSide: 1600,
  sourceBytes: 16 * 1024 * 1024,
  count: 100,
} as const
const scalar = z.number().finite().min(-100000).max(100000)
const positive = z.number().finite().positive().max(14400)
export const pdfSignatureRectSchema = z
  .object({
    x: scalar,
    y: scalar,
    width: positive,
    height: positive,
  })
  .strict()
const point = z.tuple([z.number().finite().min(0).max(1600), z.number().finite().min(0).max(1600)])
export const pdfSignatureSourceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('ink'),
      width: positive.max(1600),
      height: positive.max(1600),
      color: z.string().regex(/^#[\da-f]{6}$/i),
      thickness: z.number().finite().min(0.25).max(24),
      strokes: z.array(z.array(point).min(2).max(2000)).min(1).max(64),
    })
    .strict()
    .refine((s) => s.strokes.reduce((n, p) => n + p.length, 0) <= 2000, '签名累计不得超过 2000 点'),
  z
    .object({
      kind: z.literal('stamp'),
      width: z.number().int().min(1).max(1600),
      height: z.number().int().min(1).max(1600),
      png: z
        .string()
        .min(4)
        .max(Math.ceil(PDF_SIGNATURE_LIMITS.pngBytes / 3) * 4)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    })
    .strict(),
])
export type PdfSignatureSource = z.infer<typeof pdfSignatureSourceSchema>
export const pdfVisualSignatureOperations = [
  z
    .object({
      op: z.literal('add_visual_signature'),
      page: z.number().int().positive(),
      source: pdfSignatureSourceSchema,
      rect: pdfSignatureRectSchema,
    })
    .strict(),
  z
    .object({
      op: z.literal('transform_visual_signature'),
      page: z.number().int().positive(),
      id: z.string().min(1).max(200),
      rect: pdfSignatureRectSchema,
    })
    .strict(),
  z
    .object({
      op: z.literal('delete_visual_signature'),
      page: z.number().int().positive(),
      id: z.string().min(1).max(200),
    })
    .strict(),
] as const
export type PdfVisualSignatureOperation = z.infer<(typeof pdfVisualSignatureOperations)[number]>
export interface PdfVisualSignature {
  id: string
  page: number
  kind: 'ink' | 'stamp'
  rect: z.infer<typeof pdfSignatureRectSchema>
  /** Display-local preview, at most 240px per edge. No original PNG is returned. */
  preview?: string
  strokes?: [number, number][][]
  color?: string
  thickness?: number
}
