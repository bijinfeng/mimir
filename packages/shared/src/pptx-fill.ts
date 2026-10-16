import { z } from 'zod'

/** Dedicated manual action; not a model apply_ops capability. */
const fillSource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('current') }).strict(),
  z
    .object({
      kind: z.literal('texture'),
      id: z.enum(['paper', 'canvas', 'wood', 'marble', 'granite', 'denim', 'cork', 'parchment']),
      png: z
        .string()
        .min(4)
        .max(1_400_000)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    })
    .strict(),
])
const slide = z.number().int().nonnegative()
export const pptxManualFillSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('copy-current-background'),
      slide,
      allSlides: z.literal(true),
    })
    .strict(),
  z
    .object({
      kind: z.literal('shape'),
      slide,
      elementId: z.string().min(1).max(300),
      source: fillSource,
      tile: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('background'),
      slide,
      allSlides: z.boolean().default(false),
      source: fillSource,
      tile: z.boolean(),
    })
    .strict(),
])
export type PptxManualFill = z.infer<typeof pptxManualFillSchema>
