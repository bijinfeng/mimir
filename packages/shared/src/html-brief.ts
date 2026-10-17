import { z } from 'zod'

const short = z.string().max(400)
const color = z.string().regex(/^#[\da-f]{6}$/i, '请输入六位 RGB 颜色，如 #4472C4')
export const htmlBriefStyleSchema = z.object({
  name: z.string().max(100).optional(),
  tone: short,
  palette: z
    .object({
      primary: color.optional(),
      accent: color.optional(),
      bg: color.optional(),
      surface: color.optional(),
      text: color.optional(),
    })
    .default({}),
  typography: z
    .object({
      heading: short.optional(),
      body: short.optional(),
      scale: short.optional(),
    })
    .default({}),
  tokens: z
    .object({
      radius: short.optional(),
      spacing: short.optional(),
      shadow: short.optional(),
    })
    .optional(),
  layout: short.optional(),
  density: z.string().max(100).optional(),
  docx_friendly: z.boolean().optional(),
})
export type HtmlBriefStyle = z.infer<typeof htmlBriefStyleSchema>

/** Legacy title/tone/audience remain accepted by existing clients. */
export const htmlPageBriefSchema = z.object({
  title: z.string().max(200),
  tone: short,
  audience: short,
  core_hook: z.string().max(2000).optional(),
  style: htmlBriefStyleSchema.optional(),
  alternatives: z.array(htmlBriefStyleSchema).max(2).optional(),
  sections: z
    .array(
      z.object({
        title: z.string().max(200),
        purpose: z.string().max(1000),
        type: z.string().max(100).optional(),
        layout: short.optional(),
        image_queries: z.array(z.string().max(200)).max(5).optional(),
      }),
    )
    .min(1)
    .max(20),
  meta: z
    .object({
      title: z.string().max(200).optional(),
      language: z.string().max(100).optional(),
      audience: short.optional(),
      length: short.optional(),
    })
    .optional(),
  user_edited: z.array(z.string().max(100)).max(60).optional(),
  version: z.literal(1).optional(),
})
export type HtmlPageBrief = z.infer<typeof htmlPageBriefSchema>
export type HtmlBriefDecision =
  | { kind: 'confirmed'; brief: HtmlPageBrief }
  | { kind: 'redo'; note: string }
  | { kind: 'cancelled' }

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

/** Validates both the upstream brief shape and Mimir's original brief response. */
export function normalizeHtmlPageBrief(raw: unknown): HtmlPageBrief {
  const value = record(raw),
    meta = record(value.meta),
    style = record(value.style)
  const parsed = htmlPageBriefSchema.safeParse({
    ...value,
    title: value.title ?? meta.title ?? value.core_hook,
    tone: value.tone ?? style.tone,
    audience: value.audience ?? meta.audience ?? '',
    sections: Array.isArray(value.sections)
      ? value.sections.map((item) => {
          const section = record(item)
          return { ...section, purpose: section.purpose ?? section.brief }
        })
      : value.sections,
  })
  if (!parsed.success) throw new Error('页面规划字段无效，请检查标题、章节与设计参数')
  const brief = parsed.data
  return {
    ...brief,
    core_hook: brief.core_hook ?? brief.title,
    style: brief.style ?? { tone: brief.tone, palette: {}, typography: {} },
    meta: { ...brief.meta, title: brief.title, audience: brief.audience },
    version: 1,
  }
}
