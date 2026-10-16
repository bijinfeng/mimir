import { z } from 'zod'

export const PPTX_ZOOM_MAX_TILES = 24
export const PPTX_ZOOM_MAX_BASE64 = 7_500_000
export const pptxZoomModeSchema = z.enum(['slide', 'section', 'summary'])
export type PptxZoomMode = z.infer<typeof pptxZoomModeSchema>
/** User-selected snapshots only. Slide paths, XML, layout and sections remain host-owned. */
export const pptxManualZoomSchema = z
  .object({
    mode: pptxZoomModeSchema,
    slide: z.number().int().nonnegative(),
    targets: z
      .array(
        z
          .object({
            slide: z.number().int().nonnegative(),
            png: z
              .string()
              .min(32)
              .max(1_400_000)
              .regex(/^[A-Za-z0-9+/]+={0,2}$/),
          })
          .strict(),
      )
      .min(1)
      .max(PPTX_ZOOM_MAX_TILES),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (new Set(input.targets.map((target) => target.slide)).size !== input.targets.length)
      ctx.addIssue({ code: 'custom', message: '缩放导航不能重复选择同一幻灯片' })
    if (
      input.targets.reduce((total, target) => total + target.png.length, 0) > PPTX_ZOOM_MAX_BASE64
    )
      ctx.addIssue({ code: 'custom', message: '缩放快照总大小过大，请减少所选幻灯片' })
  })
export type PptxManualZoom = z.infer<typeof pptxManualZoomSchema>
