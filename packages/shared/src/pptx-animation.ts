import { z } from 'zod'

/** Absolute OOXML/SVG path subset used by the five pinned motion presets. */
function validMotionPath(value: string): boolean {
  const tokens = value.match(/[MLCZE]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g) ?? []
  if (
    value.replace(/[MLCZE]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g, '').replace(/[\s,]/g, '') ||
    tokens[0] !== 'M'
  )
    return false
  let position = 0,
    command = '',
    points = 0
  while (position < tokens.length) {
    if (/^[MLCZE]$/.test(tokens[position]!)) command = tokens[position++]!
    if (command === 'E') return position === tokens.length && points > 0
    if (command === 'Z') {
      command = ''
      continue
    }
    const count = command === 'C' ? 6 : command === 'M' || command === 'L' ? 2 : 0
    if (
      !count ||
      position + count > tokens.length ||
      tokens.slice(position, position + count).some((token) => !Number.isFinite(Number(token)))
    )
      return false
    position += count
    points++
    if (command === 'M') command = 'L'
  }
  return points > 0
}

/** Manual Ribbon semantics, expanded from the authoritative file in one private transaction. */
const slide = z.number().int().nonnegative()
const effect = z.enum([
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
export const pptxManualAnimationSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('transition-all'), slide }).strict(),
    z
      .object({
        kind: z.literal('animation'),
        slide,
        elementId: z.string().min(1).max(300),
        operation: z.enum(['replace', 'add', 'remove']),
        effect: effect.optional(),
        byParagraph: z.boolean().optional(),
        trigger: z.enum(['onClick', 'withPrev', 'afterPrev']).optional(),
        durationMs: z.number().int().min(0).max(60000).optional(),
        delayMs: z.number().int().min(0).max(60000).optional(),
        direction: z.enum(['top', 'bottom', 'left', 'right']).optional(),
        paragraph: z.number().int().nonnegative().optional(),
        motionPath: z
          .string()
          .min(1)
          .max(3000)
          .refine(validMotionPath, '运动路径须为完整的 M/L/C/Z 绝对坐标路径')
          .optional(),
      })
      .strict(),
  ])
  .superRefine((input, ctx) => {
    if (input.kind !== 'animation') return
    if (input.operation !== 'remove' && !input.effect)
      ctx.addIssue({ code: 'custom', message: '动画需要效果', path: ['effect'] })
    if (
      input.operation === 'remove' &&
      Object.keys(input).some((key) => !['kind', 'slide', 'elementId', 'operation'].includes(key))
    )
      ctx.addIssue({ code: 'custom', message: '移除动画不能同时设置效果' })
    if (input.motionPath && input.effect !== 'motionPath')
      ctx.addIssue({ code: 'custom', message: '路径仅适用于运动路径动画', path: ['motionPath'] })
    if (input.direction && !['flyIn', 'flyOut', 'wipe', 'wipeOut'].includes(input.effect ?? ''))
      ctx.addIssue({ code: 'custom', message: '此效果不支持方向', path: ['direction'] })
    if (input.paragraph !== undefined && input.byParagraph)
      ctx.addIssue({ code: 'custom', message: '单段定位与自动逐段不能同时使用' })
    if (input.effect?.startsWith('media') && (input.byParagraph || input.paragraph !== undefined))
      ctx.addIssue({ code: 'custom', message: '媒体动画不能按段落拆分' })
  })
export type PptxManualAnimation = z.infer<typeof pptxManualAnimationSchema>
