import { z } from 'zod'

export const pptxPictureCropSchema = z
  .object({
    l: z.number().finite().min(0).lt(1),
    t: z.number().finite().min(0).lt(1),
    r: z.number().finite().min(0).lt(1),
    b: z.number().finite().min(0).lt(1),
  })
  .strict()
  .refine((crop) => crop.l + crop.r < 1 && crop.t + crop.b < 1, '裁切后须保留可见区域')

/** Private manual action; the fixed upstream Agent vocabulary stays unchanged. */
export const pptxManualPictureSchema = z
  .object({
    slide: z.number().int().min(0).max(9999),
    group: z.string().min(1).max(300),
    elementId: z.string().min(1).max(300),
    opacity: z.number().finite().min(0).max(1).optional(),
    srcRect: pptxPictureCropSchema.nullable().optional(),
  })
  .strict()
  .refine((input) => input.opacity !== undefined || input.srcRect !== undefined, '请先调整图片')
export type PptxManualPicture = z.infer<typeof pptxManualPictureSchema>
