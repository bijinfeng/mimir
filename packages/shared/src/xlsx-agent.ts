import { z } from 'zod'

export const xlsxHostActionSchema = z.enum(['apply_ops', 'recalculate_formulas'])
export type XlsxHostAction = z.infer<typeof xlsxHostActionSchema>
export const xlsxRecalculationSchema = z.object({
  engine: z.literal('ironcalc-wasm-xlsx'),
  engineVersion: z.literal('0.9.0'),
  formulaCount: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
})
export type XlsxRecalculation = z.infer<typeof xlsxRecalculationSchema>

/** Local toolbar extensions; the pinned upstream Agent DSL remains unchanged. */
const manualBase = { sheetId: z.string().min(1) }
export const xlsxManualOperationSchema = z.discriminatedUnion('op', [
  z.object({ ...manualBase, op: z.literal('flash_fill'), range: z.string().min(1) }).strict(),
  z
    .object({
      ...manualBase,
      op: z.literal('move_range'),
      sourceSheetId: z.string().min(1),
      source: z.string().min(1),
      target: z.string().min(1),
    })
    .strict(),
  z
    .object({
      ...manualBase,
      op: z.literal('copy_format'),
      sourceSheetId: z.string().min(1),
      source: z.string().min(1),
      range: z.string().min(1),
    })
    .strict(),
  z.object({ ...manualBase, op: z.literal('clear_format'), range: z.string().min(1) }).strict(),
  z
    .object({
      ...manualBase,
      op: z.literal('set_outline'),
      axis: z.enum(['rows', 'columns']),
      range: z.string().min(1),
      action: z.enum(['group', 'ungroup', 'collapse', 'expand']),
    })
    .strict(),
  z
    .object({
      ...manualBase,
      op: z.literal('auto_size'),
      axis: z.enum(['rows', 'columns']),
      sizes: z
        .array(
          z
            .object({
              index: z.number().int().min(0).max(1048575),
              pixels: z.number().finite().min(1).max(4096),
            })
            .strict(),
        )
        .min(1)
        .max(500),
    })
    .strict(),
])
export type XlsxManualOperation = z.infer<typeof xlsxManualOperationSchema>
export const XLSX_MANUAL_OPS = new Set(
  xlsxManualOperationSchema.options.map((schema) => schema.shape.op.value),
)
