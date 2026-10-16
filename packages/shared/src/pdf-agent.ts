import { z } from 'zod'

const coordinate = z.number().finite()
export const pdfTextRectSchema = z
  .tuple([coordinate, coordinate, coordinate, coordinate])
  .refine(([left, bottom, right, top]) => left < right && bottom < top, 'PDF 文字矩形无效')

export const pdfTextProbeSchema = z.object({
  pageIndex: z.number().int().nonnegative(),
  rect: pdfTextRectSchema,
  oldText: z.string().min(1).max(10_000),
})

export const pdfTextTargetSchema = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  pageIndex: z.number().int().nonnegative(),
  objectIndex: z.number().int().nonnegative(),
  text: z.string().min(1).max(10_000),
  bounds: pdfTextRectSchema,
})

export type PdfTextProbe = z.infer<typeof pdfTextProbeSchema>
export type PdfTextTarget = z.infer<typeof pdfTextTargetSchema>

export const pdfMarkupInputSchema = z.object({
  target: pdfTextTargetSchema,
  type: z.enum(['highlight', 'underline', 'strikeout']),
})

export type PdfMarkupInput = z.infer<typeof pdfMarkupInputSchema>
