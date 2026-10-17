import { z } from 'zod'
import { pdfVisualSignatureOperations, type PdfVisualSignature } from './pdf-visual-signature.js'

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

export const pdfTextBlockItemSchema = z
  .object({ text: z.string().min(1).max(10_000), bounds: pdfTextRectSchema })
  .strict()
export const pdfTextBlockProbeSchema = z
  .object({
    pageIndex: z.number().int().nonnegative(),
    items: z.array(pdfTextBlockItemSchema).min(1).max(500),
  })
  .strict()
const pdfObjectMatrixSchema = z.tuple([
  coordinate,
  coordinate,
  coordinate,
  coordinate,
  coordinate,
  coordinate,
])
export const pdfTextBlockTargetSchema = z
  .object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    pageIndex: z.number().int().nonnegative(),
    blockIndex: z.number().int().nonnegative(),
    members: z
      .array(
        pdfTextBlockItemSchema.extend({
          objectIndex: z.number().int().nonnegative(),
          matrix: pdfObjectMatrixSchema,
        }),
      )
      .min(1)
      .max(500),
  })
  .strict()
export const pdfTextBlockOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('read'), pageIndex: z.number().int().nonnegative() }).strict(),
  z.object({ op: z.literal('inspect'), probe: pdfTextBlockProbeSchema }).strict(),
  z
    .object({
      op: z.literal('move'),
      target: pdfTextBlockTargetSchema,
      // Points in the current page's displayed direction, including Rotate/CropBox.
      dx: coordinate.min(-14400).max(14400),
      dy: coordinate.min(-14400).max(14400),
    })
    .strict(),
  z
    .object({
      op: z.literal('rewrite'),
      target: pdfTextBlockTargetSchema,
      newText: z.string().max(10_000),
      // Omit replace to rewrite the complete paragraph; otherwise splice one occurrence.
      replace: z
        .object({
          oldText: z.string().min(1).max(10_000),
          occurrence: z.number().int().min(1).max(10000),
        })
        .strict()
        .optional(),
      fontSize: z.number().finite().positive().max(500).optional(),
      color: z
        .string()
        .regex(/^#[a-fA-F0-9]{6}$/)
        .optional(),
      font: z.enum(['arial', 'times', 'courier']).optional(),
      bold: z.boolean().optional(),
      italic: z.boolean().optional(),
      align: z.enum(['left', 'center', 'right']).optional(),
    })
    .strict()
    .refine(
      (operation) => !operation.replace || operation.align === undefined,
      '局部替换不支持整段对齐',
    ),
])
export type PdfTextBlockProbe = z.infer<typeof pdfTextBlockProbeSchema>
export type PdfTextBlockTarget = z.infer<typeof pdfTextBlockTargetSchema>
export type PdfTextBlockOperation = z.infer<typeof pdfTextBlockOperationSchema>
export interface PdfPageTextBlock {
  page: number
  blockIndex: number
  block_number: number
  text: string
  /** Displayed left/top/width/height, in points. */
  x: number
  y: number
  width: number
  height: number
  editable: boolean
  reason?: string
  target?: PdfTextBlockTarget
  canRewrite?: boolean
  rewriteReason?: string
  format?: { fontSize: number; leading: number; align: 'left' | 'center' | 'right' }
}
export interface PdfTextBlockSnapshot {
  sha256: string
  blocks: PdfPageTextBlock[]
}

const markupType = z.enum(['highlight', 'underline', 'strikeout'])
const markupHexColor = z.string().regex(/^#[a-fA-F0-9]{6}$/)
export const pdfMarkupInputSchema = z.union([
  z
    .object({ target: pdfTextTargetSchema, type: markupType, color: markupHexColor.optional() })
    .strict(),
  z
    .object({
      pageIndex: z.number().int().nonnegative(),
      text: z.string().min(1).max(10000),
      type: markupType,
      all: z.boolean().optional(),
      color: markupHexColor.optional(),
    })
    .strict(),
])
export type PdfMarkupInput = z.infer<typeof pdfMarkupInputSchema>

export const pdfInsertLayoutInputSchema = z
  .object({
    pageIndex: z.number().int().nonnegative(),
    text: z
      .string()
      .min(1)
      .max(10000)
      .refine((text) => !!text.trim()),
    fontSize: z.number().finite().positive().max(500),
    color: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]),
    font: z.enum(['arial', 'times', 'courier']).optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
    maxWidth: z.number().finite().positive().max(14400).optional(),
    x: z.number().finite().nonnegative().max(14400).optional(),
    y: z.number().finite().nonnegative().max(14400).optional(),
    anchorText: z.string().min(1).max(10000).optional(),
    placement: z.enum(['right', 'below', 'above']).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      (value.x === undefined) !== (value.y === undefined) ||
      (value.anchorText !== undefined && value.x !== undefined) ||
      (value.placement !== undefined && value.anchorText === undefined)
    )
      ctx.addIssue({ code: 'custom', message: '坐标须成对提供，且不能与文字锚点混用' })
  })
export type PdfInsertLayoutInput = z.infer<typeof pdfInsertLayoutInputSchema>
export interface PdfInsertLayout extends PdfInsertLayoutInput {
  x: number
  y: number
  wrappedText: string
  lineLeading: number
  lineXOffsets: number[]
  width: number
  height: number
}

const noteText = z
  .string()
  .min(1)
  .max(10_000)
  .refine((text) => text.trim().length > 0)
const annotationId = z.string().min(1).max(200)
export const pdfAnnotationOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('read') }),
  z.object({
    op: z.literal('add_note'),
    authorship: z.enum(['user', 'agent']).optional(),
    pageIndex: z.number().int().nonnegative(),
    text: noteText,
    x: coordinate.nonnegative(),
    y: coordinate.nonnegative(),
    color: z
      .string()
      .regex(/^#[a-fA-F0-9]{6}$/)
      .optional(),
  }),
  z.object({
    op: z.literal('reply_note'),
    authorship: z.enum(['user', 'agent']).optional(),
    pageIndex: z.number().int().nonnegative(),
    note_id: annotationId,
    text: noteText,
  }),
  z.object({
    op: z.literal('edit_note'),
    pageIndex: z.number().int().nonnegative(),
    note_id: annotationId,
    text: noteText,
  }),
  z.object({
    op: z.literal('delete_note'),
    pageIndex: z.number().int().nonnegative(),
    note_id: annotationId,
  }),
  z.object({
    op: z.literal('delete_markup'),
    pageIndex: z.number().int().nonnegative(),
    markup_ids: z.array(annotationId).min(1).max(200).optional(),
    type: z.enum(['highlight', 'underline', 'strikeout']).optional(),
  }),
])
export type PdfAnnotationOperation = z.infer<typeof pdfAnnotationOperationSchema>
export interface PdfAnnotation {
  id: string
  page: number
  type: 'note' | 'highlight' | 'underline' | 'strikeout'
  text: string
  author: string
  parentId?: string
}
export interface PdfAnnotationSnapshot {
  sha256: string
  annotations: PdfAnnotation[]
}

const formValue = z
  .object({
    name: z.string().min(1).max(1000),
    value: z.string().max(10_000).optional(),
    checked: z.boolean().optional(),
  })
  .strict()
export const pdfFormOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('setFormValue'), value: formValue }).strict(),
  z
    .object({
      op: z.literal('rotatePages'),
      pages: z.array(z.number().int().positive()).min(1),
      dir: z.union([z.literal(90), z.literal(-90), z.literal(180)]),
    })
    .strict(),
  z.object({ op: z.literal('deletePage'), page: z.number().int().positive() }).strict(),
  z
    .object({ op: z.literal('setPageOrder'), order: z.array(z.number().int().positive()).min(1) })
    .strict(),
])
export const pdfFormOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('read') }).strict(),
  z
    .object({
      op: z.literal('apply'),
      ops: z.array(pdfFormOpSchema).min(1).max(30),
      dryRun: z.boolean().optional(),
    })
    .strict(),
])
export type PdfFormOperation = z.infer<typeof pdfFormOperationSchema>
export interface PdfFormField {
  name: string
  type: 'text' | 'checkbox' | 'radio' | 'choice' | 'unsupported'
  value: string | string[] | boolean
  options: string[]
  readOnly: boolean
  required: boolean
  widgets: Array<{ page: number; rect: [number, number, number, number] }>
}
export interface PdfFormSnapshot {
  sha256: string
  fields: PdfFormField[]
}

export const pdfImageTargetSchema = z
  .object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    pageIndex: z.number().int().nonnegative(),
    objectIndex: z.number().int().nonnegative(),
    bounds: pdfTextRectSchema,
    resourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
const imageSource = {
  image: z.string().min(1).max(12_000_000).optional(),
  url: z.string().url().max(2000).optional(),
}
const imageDimensions = {
  x: coordinate.nonnegative().optional(),
  y: coordinate.nonnegative().optional(),
  width: coordinate.positive().optional(),
  height: coordinate.positive().optional(),
  layer: z.enum(['above_text', 'below_text']).optional(),
}
export const pdfImageOperationSchema = z.discriminatedUnion('op', [
  z
    .object({ op: z.literal('read'), pageIndex: z.number().int().nonnegative().optional() })
    .strict(),
  z
    .object({
      op: z.literal('insert_image'),
      pageIndex: z.number().int().nonnegative(),
      ...imageSource,
      ...imageDimensions,
      anchor: z
        .object({
          x: coordinate,
          y: coordinate,
          width: coordinate.positive(),
          height: coordinate.positive(),
          placement: z.enum(['below', 'above', 'right', 'left']),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({ op: z.literal('transform_image'), target: pdfImageTargetSchema, ...imageDimensions })
    .strict(),
  z
    .object({
      op: z.literal('rotate_image'),
      target: pdfImageTargetSchema,
      direction: z.enum(['cw', 'ccw', '180']),
    })
    .strict(),
  z
    .object({ op: z.literal('replace_image'), target: pdfImageTargetSchema, ...imageSource })
    .strict(),
  z
    .object({
      op: z.literal('flip_image'),
      target: pdfImageTargetSchema,
      axis: z.enum(['horizontal', 'vertical']),
    })
    .strict(),
  z
    .object({
      op: z.literal('set_image_opacity'),
      target: pdfImageTargetSchema,
      alpha: coordinate.min(0).max(1),
    })
    .strict(),
  z
    .object({
      op: z.literal('crop_image'),
      target: pdfImageTargetSchema,
      left: coordinate.min(0).max(1),
      top: coordinate.min(0).max(1),
      right: coordinate.min(0).max(1),
      bottom: coordinate.min(0).max(1),
    })
    .strict(),
  z
    .object({
      op: z.literal('remove_image_background'),
      target: pdfImageTargetSchema,
      tolerance: coordinate.min(0).max(100).optional(),
    })
    .strict(),
  z.object({ op: z.literal('delete_image'), target: pdfImageTargetSchema }).strict(),
])
export type PdfImageTarget = z.infer<typeof pdfImageTargetSchema>
export type PdfImageOperation = z.infer<typeof pdfImageOperationSchema>
export interface PdfPageImage {
  target: PdfImageTarget
  page: number
  image_number: number
  x: number
  y: number
  width: number
  height: number
  layer: 'above_text' | 'below_text'
  opacity?: number
  editable: boolean
  reason?: string
}
export interface PdfImageSnapshot {
  sha256: string
  images: PdfPageImage[]
  unsupportedPages: number[]
}

const pageRange = z.string().trim().min(1).max(1000)
const hexColor = z.string().regex(/^#[a-fA-F0-9]{6}$/)
const watermarkSchema = z
  .object({
    text: z.string().max(200),
    angle: coordinate.min(-180).max(180).default(45),
    opacity: coordinate.min(0).max(1).default(0.15),
    color: hexColor.default('#808080'),
    size_ratio: coordinate.min(0.02).max(0.5).default(0.15),
  })
  .strict()
const headerFooterSchema = z
  .object({
    header_left: z.string().max(500).default(''),
    header_center: z.string().max(500).default(''),
    header_right: z.string().max(500).default(''),
    footer_left: z.string().max(500).default(''),
    footer_center: z.string().max(500).default(''),
    footer_right: z.string().max(500).default(''),
    page_number: z.boolean().default(false),
    start_at: z.number().int().min(0).max(1_000_000).default(1),
    font_size: coordinate.min(6).max(72).default(10),
    color: hexColor.default('#555555'),
  })
  .strict()
export const pdfDrawingSchema = z
  .object({
    kind: z.enum(['rect', 'ellipse', 'line', 'arrow', 'ink', 'check', 'cross']),
    page: z.number().int().positive(),
    // Cropping may leave editable paths outside the visible page. Derived
    // geometry must round-trip without clipping or a fixed minimum stroke.
    x: coordinate,
    y: coordinate,
    width: coordinate.positive(),
    height: coordinate.positive(),
    color: hexColor.default('#2563EB'),
    fill: hexColor.optional(),
    thickness: coordinate.positive().default(2),
    opacity: coordinate.min(0).max(1).default(1),
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
    arrowHeadLength: coordinate.positive().optional(),
    points: z
      .array(z.tuple([coordinate, coordinate]))
      .min(2)
      .max(2000)
      .optional(),
  })
  .strict()
export type PdfDrawingInput = z.infer<typeof pdfDrawingSchema>
export const pdfMetadataSchema = z
  .object({
    title: z.string().max(1000).optional(),
    author: z.string().max(1000).optional(),
    subject: z.string().max(1000).optional(),
    keywords: z.string().max(2000).optional(),
  })
  .strict()
export const pdfOutlineEntrySchema = z
  .object({
    title: z.string().trim().min(1).max(1000),
    page: z.number().int().positive(),
    level: z.number().int().min(0).max(8).default(0),
  })
  .strict()
export type PdfOutlineEntry = z.infer<typeof pdfOutlineEntrySchema>
export const pdfBatchAnnotationOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('removeMarkup'), id: annotationId }).strict(),
  z
    .object({
      op: z.literal('setNoteContents'),
      id: annotationId,
      contents: z.string().trim().min(1).max(10_000),
    })
    .strict(),
])
export const pdfNativeBatchOpSchema = z.union([
  pdfFormOpSchema,
  z.object({ op: z.literal('setMetadata'), metadata: pdfMetadataSchema }).strict(),
  pdfBatchAnnotationOpSchema,
])
export const pdfBatchArgsSchema = z
  .object({
    dry_run: z.boolean().optional(),
    ops: z
      .array(
        z.union([
          pdfNativeBatchOpSchema,
          z
            .object({
              op: z.literal('removeTextInsert'),
              id: z.string().regex(/^T[a-zA-Z0-9-]{1,80}$/),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(30),
  })
  .strict()
export type PdfBatchArgs = z.infer<typeof pdfBatchArgsSchema>
export type PdfNativeBatchOp = z.infer<typeof pdfNativeBatchOpSchema>
export type PdfBatchAnnotationOp = z.infer<typeof pdfBatchAnnotationOpSchema>
export const pdfLocalOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('read') }).strict(),
  z
    .object({
      op: z.literal('apply_ops'),
      dry_run: z.boolean().optional(),
      ops: z.array(pdfNativeBatchOpSchema).min(1).max(30),
    })
    .strict(),
  z.object({ op: z.literal('export_pdf') }).strict(),
  z
    .object({
      op: z.literal('redact_copy'),
      regions: z
        .array(
          z
            .object({
              pageIndex: z.number().int().min(0).max(999),
              // PDF user space, before displayed Rotate; never silently clipped.
              rect: pdfTextRectSchema,
            })
            .strict(),
        )
        .min(1)
        .max(100),
    })
    .strict(),
  z
    .object({
      op: z.literal('apply_page_layout'),
      pages: z
        .array(
          z
            .object({
              source_page: z.number().int().min(1).max(1000).optional(),
              rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
              blank: z
                .object({
                  width: coordinate.min(20).max(14400),
                  height: coordinate.min(20).max(14400),
                })
                .strict()
                .optional(),
              crop: z
                .object({
                  top: coordinate.nonnegative(),
                  right: coordinate.nonnegative(),
                  bottom: coordinate.nonnegative(),
                  left: coordinate.nonnegative(),
                })
                .strict()
                .optional(),
              paper: z
                .object({
                  width: coordinate.min(20).max(14400),
                  height: coordinate.min(20).max(14400),
                })
                .strict()
                .optional(),
            })
            .strict(),
        )
        .min(1)
        .max(1000),
    })
    .strict(),
  z
    .object({ op: z.literal('insert_blank_page'), after_page: z.number().int().nonnegative() })
    .strict(),
  z
    .object({
      op: z.literal('set_page_size'),
      preset: z.enum(['A3', 'A4', 'A5', 'Letter', 'Legal']).optional(),
      width: coordinate.min(20).max(14400).optional(),
      height: coordinate.min(20).max(14400).optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal('crop_pages'),
      pages: pageRange,
      left: coordinate.min(0).max(1),
      top: coordinate.min(0).max(1),
      right: coordinate.min(0).max(1),
      bottom: coordinate.min(0).max(1),
    })
    .strict(),
  z.object({ op: z.literal('extract_pages'), pages: pageRange }).strict(),
  z.object({ op: z.literal('split_pdf'), pages_per_file: z.number().int().positive() }).strict(),
  z
    .object({
      op: z.literal('split_pages'),
      per_page: z.union([z.literal(2), z.literal(4), z.literal(9)]),
    })
    .strict(),
  z
    .object({
      op: z.literal('merge_pages'),
      per_sheet: z.number().int().min(2).max(16),
      direction: z.enum(['horizontal', 'vertical']).default('vertical'),
      separator: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      op: z.literal('import_pages'),
      after_page: z.number().int().nonnegative(),
      source_pages: pageRange.default('all'),
    })
    .strict(),
  z
    .object({
      op: z.literal('replace_pages'),
      pages: pageRange,
      source_pages: pageRange.default('all'),
    })
    .strict(),
  ...pdfVisualSignatureOperations,
  z.object({ op: z.literal('add_drawing'), drawing: pdfDrawingSchema }).strict(),
  z
    .object({ op: z.literal('update_drawing'), id: annotationId, drawing: pdfDrawingSchema })
    .strict(),
  z.object({ op: z.literal('delete_drawing'), id: annotationId }).strict(),
  z
    .object({
      op: z.literal('add_form_mark'),
      page: z.number().int().positive(),
      kind: z.enum(['check', 'cross']),
      x: coordinate.nonnegative(),
      y: coordinate.nonnegative(),
      size: coordinate.min(4).max(500).default(16),
      color: hexColor.default('#111111'),
    })
    .strict(),
  z.object({ op: z.literal('set_watermark'), ...watermarkSchema.shape }).strict(),
  z.object({ op: z.literal('set_header_footer'), ...headerFooterSchema.shape }).strict(),
  z.object({ op: z.literal('set_metadata'), metadata: pdfMetadataSchema }).strict(),
  z
    .object({ op: z.literal('set_outline'), entries: z.array(pdfOutlineEntrySchema).max(500) })
    .strict(),
])
export type PdfLocalOperation = z.input<typeof pdfLocalOperationSchema>
export interface PdfLocalInfo {
  metadata: z.infer<typeof pdfMetadataSchema>
  watermark: z.infer<typeof watermarkSchema> | null
  headerFooter: z.infer<typeof headerFooterSchema> | null
  outline: PdfOutlineEntry[]
  drawings: Array<PdfDrawingInput & { id: string }>
  signatures?: PdfVisualSignature[]
  signatureIssues?: Array<{ page: number; reason: string }>
}

/** External preparation is read-only; native insertion is a separate operation. */
export const PDF_IMAGE_ASPECT_RATIOS = [
  '1:1',
  '4:3',
  '16:9',
  '9:16',
  '3:4',
  '2:3',
  '3:2',
  'auto',
] as const
export const pdfAssetOperationSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('image_search'),
      query: z.string().trim().min(1).max(500),
      max_results: z.number().int().min(1).max(10).default(8),
    })
    .strict(),
  z
    .object({
      op: z.literal('generate_image'),
      prompt: z.string().trim().min(1).max(2000),
      aspect_ratio: z.enum(PDF_IMAGE_ASPECT_RATIOS).default('auto'),
    })
    .strict(),
])
export type PdfAssetOperation = z.infer<typeof pdfAssetOperationSchema>
export type PdfImageAspectRatio = (typeof PDF_IMAGE_ASPECT_RATIOS)[number]
export const pdfAssetScopeSchema = z.object({
  documentId: z.string().min(1).max(200),
  assetSessionId: z.uuid(),
})
export const pdfAssetRequestSchema = pdfAssetScopeSchema
  .extend({
    expectedVersion: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
    operation: pdfAssetOperationSchema,
  })
  .strict()
export const pdfAssetPreviewSchema = pdfAssetScopeSchema
  .extend({ url: z.string().max(200) })
  .strict()
export type PdfAssetReadiness = {
  image_search: { available: boolean; reason?: string }
  generate_image: { available: boolean; reason?: string }
}
export type PdfPreparedImage = {
  url: string
  mimeType: 'image/png' | 'image/jpeg'
  width: number
  height: number
  requestedRatio: PdfImageAspectRatio
  actualRatio: number
  expiresAt: number
}
export type PdfAssetData =
  | { results: { title: string; url: string; description: string; imageUrl?: string }[] }
  | PdfPreparedImage
