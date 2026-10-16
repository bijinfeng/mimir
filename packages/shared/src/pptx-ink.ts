import { z } from 'zod'

/** Fixed GenOffice draw-tab format: picture + editable vector metadata, not InkML. */
export const pptxInkStrokeSchema = z
  .object({
    tool: z.enum(['pen', 'highlighter']),
    color: z.string().regex(/^[0-9a-fA-F]{6}$/),
    width: z.number().finite().positive().max(200),
    points: z
      .array(
        z
          .object({
            x: z.number().finite().min(-20000).max(20000),
            y: z.number().finite().min(-20000).max(20000),
          })
          .strict(),
      )
      .min(1)
      .max(20000),
  })
  .strict()
export type PptxInkStroke = z.infer<typeof pptxInkStrokeSchema>
export const pptxManualInkSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('add'),
      slide: z.number().int().nonnegative(),
      fitWidthPx: z.number().finite().min(100).max(4096),
      stroke: pptxInkStrokeSchema,
      png: z
        .string()
        .min(1)
        .max(600000)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    })
    .strict(),
  z
    .object({
      kind: z.literal('erase'),
      slide: z.number().int().nonnegative(),
      ids: z.array(z.string().min(1).max(300)).min(1).max(500),
    })
    .strict(),
  z.object({ kind: z.literal('clear'), slide: z.number().int().nonnegative() }).strict(),
])
export type PptxManualInk = z.infer<typeof pptxManualInkSchema>
