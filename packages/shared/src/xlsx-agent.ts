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
export const xlsxPivotLayoutEditSchema = z
  .object({
    ...manualBase,
    op: z.literal('edit_pivot_layout'),
    pivotPath: z.string().min(1).max(512),
    rowFields: z.array(z.string().min(1)).min(1).max(8),
    columnFields: z.array(z.string().min(1)).max(8),
    values: z
      .array(
        z
          .object({
            field: z.string().min(1),
            agg: z.enum(['sum', 'count', 'average', 'max', 'min']),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict()
export type XlsxPivotLayoutEdit = z.infer<typeof xlsxPivotLayoutEditSchema>
/** Toolbar-only ordered sorting; public Agent sort_range keeps its pinned single-key schema. */
export const xlsxManualSortSchema = z
  .object({
    ...manualBase,
    op: z.literal('sort_range_multi'),
    range: z.string().min(1).max(32),
    rules: z
      .array(
        z
          .object({
            column: z.string().regex(/^[A-Z]{1,3}$/),
            order: z.enum(['asc', 'desc']),
          })
          .strict(),
      )
      .min(1)
      .max(8)
      .refine(
        (rules) => new Set(rules.map((rule) => rule.column)).size === rules.length,
        '排序列不能重复',
      ),
    hasHeader: z.boolean(),
  })
  .strict()
export type XlsxManualSort = z.infer<typeof xlsxManualSortSchema>
export const xlsxPasteModeSchema = z.enum([
  'all',
  'value',
  'formula',
  'format',
  'column-width',
  'besides-border',
])
export type XlsxPasteMode = z.infer<typeof xlsxPasteModeSchema>
export const xlsxSpecialPasteSchema = z
  .object({
    ...manualBase,
    op: z.literal('paste_range'),
    sourceSheetId: z.string().min(1),
    source: z.string().min(1).max(32),
    target: z.string().min(1).max(32),
    kind: z.enum(['copy', 'cut']),
    mode: xlsxPasteModeSchema,
  })
  .strict()
export type XlsxSpecialPaste = z.infer<typeof xlsxSpecialPasteSchema>
export const xlsxManualOperationSchema = z.discriminatedUnion('op', [
  xlsxPivotLayoutEditSchema,
  xlsxManualSortSchema,
  xlsxSpecialPasteSchema,
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

/** Private grid-only warning handshake. Never part of the model's operation vocabulary. */
export const xlsxValidationConsentSchema = z
  .object({
    intent: z.literal('manual_cell'),
    token: z.string().uuid().optional(),
  })
  .strict()
export type XlsxValidationConsent = z.infer<typeof xlsxValidationConsentSchema>
export const xlsxValidationWarningSchema = z
  .object({
    token: z.string().uuid(),
    title: z.string().max(256),
    message: z.string().max(4096),
    style: z.enum(['warning', 'information']),
    address: z.string().max(20),
  })
  .strict()
export type XlsxValidationWarning = z.infer<typeof xlsxValidationWarningSchema>
export class XlsxValidationConfirmationError extends Error {
  constructor(readonly warning: XlsxValidationWarning) {
    super(warning.message)
    this.name = 'XlsxValidationConfirmationError'
  }
}
export const xlsxValidationOptionsSchema = z
  .object({
    showErrorMessage: z.boolean(),
    errorStyle: z.enum(['stop', 'warning', 'information']),
    errorTitle: z.string().max(32),
    error: z.string().max(255),
    showInputMessage: z.boolean(),
    promptTitle: z.string().max(32),
    prompt: z.string().max(255),
    showDropDown: z.boolean(),
  })
  .strict()
export type XlsxValidationOptions = z.infer<typeof xlsxValidationOptionsSchema>
export const xlsxValidationMessageEditSchema = z
  .object({
    op: z.literal('edit_validation_options'),
    sheetId: z.string().min(1),
    ruleXml: z.string().min(1).max(32768),
    options: xlsxValidationOptionsSchema,
  })
  .strict()
