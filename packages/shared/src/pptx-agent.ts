import { z } from 'zod'

const text = (max: number) => z.string().trim().min(1).max(max)
const clipboardSlide = z.number().int().nonnegative()
/** Manual clipboard accepts server-issued references, never browser-supplied OOXML. */
export const pptxManualAssetSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('animation_style'),
      slide: clipboardSlide,
      seq: z.number().int().min(0).max(10000),
      effect: z
        .enum([
          'appear',
          'fade',
          'flyIn',
          'wipe',
          'wipeDown',
          'splitIn',
          'bounce',
          'flipIn',
          'zoom',
          'pulse',
          'spin',
          'grow',
          'teeter',
          'disappear',
          'fadeOut',
          'flyOut',
          'wipeOut',
          'shrink',
          'zoomOut',
          'motionPath',
          'mediaPlay',
          'mediaPause',
          'mediaStop',
        ])
        .optional(),
      direction: z.enum(['top', 'bottom', 'left', 'right']).optional(),
      paragraph: z.number().int().min(0).max(999).nullable().optional(),
      motionPath: z
        .string()
        .trim()
        .min(1)
        .max(1000)
        .regex(/^[MLCZmlcz\d.,\s+eE-]+$/)
        .optional(),
    })
    .strict(),
  z.object({ kind: z.literal('master_parts') }).strict(),
  z
    .object({
      kind: z.literal('master_edit'),
      part: z
        .string()
        .regex(/^ppt\/(slideMasters\/slideMaster|slideLayouts\/slideLayout)\d+\.xml$/),
      elementId: text(300),
      operation: z.discriminatedUnion('action', [
        z
          .object({
            action: z.literal('fill'),
            color: z.union([z.literal('none'), z.string().regex(/^#[0-9A-Fa-f]{6}$/)]),
          })
          .strict(),
        z
          .object({
            action: z.literal('stroke'),
            color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
            widthPt: z.number().finite().min(0).max(100),
          })
          .strict(),
        z.object({ action: z.literal('text'), text: z.string().max(20000) }).strict(),
        z
          .object({
            action: z.literal('transform'),
            x: z.number().finite().min(-7200).max(7200),
            y: z.number().finite().min(-7200).max(7200),
            width: z.number().finite().min(1).max(7200),
            height: z.number().finite().min(1).max(7200),
            rotation: z.number().finite().min(-360).max(360),
          })
          .strict(),
        z.object({ action: z.literal('delete') }).strict(),
      ]),
    })
    .strict(),
  z
    .object({
      kind: z.enum(['copy_elements', 'cut_elements']),
      slide: clipboardSlide,
      elementIds: z.array(text(300)).min(1).max(100),
    })
    .strict(),
  z.object({ kind: z.enum(['copy_slide', 'cut_slide']), slide: clipboardSlide }).strict(),
  z
    .object({
      kind: z.literal('paste_elements'),
      slide: clipboardSlide,
      ref: z.uuid(),
      dx: z.number().finite().min(-100000000).max(100000000).default(190500),
      dy: z.number().finite().min(-100000000).max(100000000).default(190500),
    })
    .strict(),
  z
    .object({
      kind: z.literal('paste_slide'),
      afterIndex: z.number().int().min(-1),
      ref: z.uuid(),
      keepSourceFormatting: z.boolean().default(false),
    })
    .strict(),
])
export type PptxManualAsset = z.infer<typeof pptxManualAssetSchema>
export const PPTX_ASSET_MAX_BYTES = 32 * 1024 * 1024
export const pptxManualUploadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('model3d'), slide: clipboardSlide }).strict(),
  z
    .object({
      kind: z.literal('picture'),
      slide: clipboardSlide,
      elementId: text(300).optional(),
      widthPt: z.number().finite().min(6).max(720).default(72),
      keepCrop: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      kind: z.literal('media'),
      slide: clipboardSlide,
      mediaKind: z.enum(['video', 'audio']),
    })
    .strict(),
  z
    .object({
      kind: z.literal('image_fill'),
      slide: clipboardSlide,
      elementId: text(300),
      tile: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      kind: z.literal('image_background'),
      slide: clipboardSlide,
      tile: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      kind: z.literal('import_slides'),
      afterIndex: z.number().int().min(-1),
      slideIndices: z.array(clipboardSlide).min(1).max(40),
      keepSourceFormatting: z.boolean().default(false),
    })
    .strict(),
])
export type PptxManualUpload = z.infer<typeof pptxManualUploadSchema>
export const pptxSlidePlanSchema = z
  .object({
    title: text(300),
    type: z.enum(['cover', 'content', 'data', 'closing']).optional(),
    brief: text(12000),
    layout: text(300),
    image_queries: z.array(text(2000)).max(8).default([]),
  })
  .strict()
export const pptxDeckPlanSchema = z
  .object({
    core_hook: text(2000),
    style: text(12000),
    pages: z.array(pptxSlidePlanSchema).min(1).max(80),
  })
  .strict()
export const pptxGenerateDeckSchema = z
  .object({
    topic: text(6000).optional(),
    approx_pages: z.number().int().min(1).max(80).optional(),
    context: z.string().max(40000).optional(),
    core_hook: text(2000).optional(),
    style: text(12000).optional(),
    pages: z.array(pptxSlidePlanSchema).min(1).max(80).optional(),
    insert_mode: z.enum(['replace', 'append']).default('replace'),
    style_template: text(100).optional(),
    dataSource: z.enum(['user', 'document', 'search', 'sample']).optional(),
  })
  .strict()
  .refine((v) => v.topic || v.pages, '需要主题或逐页提纲')
export const pptxRegenerateSlideSchema = z
  .object({
    slideIndex: z.number().int().nonnegative(),
    brief: text(12000),
    title: z.string().max(300).optional(),
    layout: z.string().max(300).optional(),
    image_urls: z.array(z.url().max(2000)).max(8).default([]),
    style: z.string().max(12000).optional(),
    dataSource: z.enum(['user', 'document', 'search', 'sample']).optional(),
  })
  .strict()
export const pptxInsertWebImageSchema = z
  .object({
    slideIndex: z.number().int().nonnegative(),
    url: text(2000),
    x: z.number().finite(),
    y: z.number().finite(),
    w: z.number().finite().positive().max(20000),
    h: z.number().finite().positive().max(20000),
  })
  .strict()
export const pptxReplaceImageSchema = z
  .object({
    slideIndex: z.number().int().nonnegative(),
    url: text(2000),
    sourceId: text(300),
    keepCrop: z.boolean().optional(),
  })
  .strict()
export const pptxClarificationSchema = z
  .object({
    questions: z
      .array(
        z
          .object({
            id: text(100),
            label: text(400),
            description: z.string().max(1000).optional(),
            options: z.array(text(300)).min(2).max(5),
            multi: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict()
  .refine(
    (v) => new Set(v.questions.map((q) => q.id)).size === v.questions.length,
    '问题标识不能重复',
  )
export type PptxClarification = z.infer<typeof pptxClarificationSchema>
export const PPTX_SERVICE_ACTIONS = [
  'insert_web_image',
  'replace_image',
  'plan_deck',
  'generate_deck',
  'regenerate_slide',
  'save_style_template',
  'list_style_templates',
  'generate_image',
  'analyze_media',
] as const
