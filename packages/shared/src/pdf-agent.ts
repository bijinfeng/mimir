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
export const pdfLocalOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('read') }).strict(),
  z
    .object({
      op: z.literal('apply_ops'),
      dry_run: z.boolean().optional(),
      ops: z
        .array(
          z.union([
            pdfFormOpSchema,
            z.object({ op: z.literal('setMetadata'), metadata: pdfMetadataSchema }).strict(),
          ]),
        )
        .min(1)
        .max(30),
    })
    .strict(),
  z.object({ op: z.literal('export_pdf') }).strict(),
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
}
