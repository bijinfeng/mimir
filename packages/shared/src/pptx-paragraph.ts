import { z } from 'zod'

/** Fixed GenOffice numbering gallery; existing other schemes remain untouched. */
export const PPTX_PARAGRAPH_NUMBER_TYPES = [
  'arabicPeriod',
  'arabicParenR',
  'romanUcPeriod',
  'alphaUcPeriod',
  'alphaLcParenR',
  'alphaLcPeriod',
  'romanLcPeriod',
  'circleNumDbPlain',
  'ea1ChsPeriod',
] as const
export const PPTX_PARAGRAPH_IMAGE_MAX_BYTES = 512 * 1024
const xmlText = (value: string) =>
  Array.from(value).every((character) => {
    const point = character.codePointAt(0)!
    return (
      point >= 32 && (point <= 0xd7ff || (point >= 0xe000 && point <= 0xfffd) || point >= 0x10000)
    )
  })
export const pptxParagraphFormatSchema = z
  .object({
    align: z.enum(['left', 'center', 'right', 'justify']).optional(),
    rtl: z.boolean().optional(),
    lineSpacingPct: z.number().finite().min(0).max(13200).optional(),
    spaceBeforePt: z.number().finite().min(0).max(1584).optional(),
    spaceAfterPt: z.number().finite().min(0).max(1584).optional(),
    indentDelta: z.union([z.literal(1), z.literal(-1)]).optional(),
    bullet: z.enum(['none', 'char', 'number', 'blip']).optional(),
    bulletChar: z.string().min(1).max(16).refine(xmlText).optional(),
    bulletFont: z.string().trim().min(1).max(128).refine(xmlText).optional(),
    numType: z.enum(PPTX_PARAGRAPH_NUMBER_TYPES).optional(),
    startAt: z.number().int().min(1).max(32767).optional(),
    bulletHangEmu: z.number().int().min(0).max(51206400).optional(),
    bulletSizePct: z.number().finite().min(25).max(400).optional(),
    bulletColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    bulletImage: z
      .object({
        ext: z.enum(['png', 'jpg', 'jpeg']),
        base64: z
          .string()
          .min(4)
          .max(Math.ceil(PPTX_PARAGRAPH_IMAGE_MAX_BYTES / 3) * 4)
          .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((format, ctx) => {
    if (!Object.values(format).some((value) => value !== undefined))
      ctx.addIssue({ code: 'custom', message: '请先修改段落格式' })
    if ((format.bullet === 'blip') !== !!format.bulletImage)
      ctx.addIssue({ code: 'custom', message: '图片符号必须同时提供所选图片' })
  })
export type PptxParagraphFormat = z.infer<typeof pptxParagraphFormatSchema>
export const pptxManualParagraphSchema = z
  .object({
    slide: z.number().int().nonnegative().max(9999),
    el: z.string().min(1).max(300),
    paraIndices: z
      .array(z.number().int().nonnegative().max(9999))
      .min(1)
      .max(10000)
      .refine((indices) => new Set(indices).size === indices.length, '段落序号不得重复'),
    format: pptxParagraphFormatSchema,
  })
  .strict()
export type PptxManualParagraph = z.infer<typeof pptxManualParagraphSchema>
