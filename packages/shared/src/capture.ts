import { z } from 'zod'
import { documentKindSchema } from './documents.js'

/**
 * 抓取。
 *
 * `docs/PRD.md` §2.1：知识库死于收集摩擦。所以抓取流程要**分阶段可见**，
 * 不是一个转圈——失败时能直接指认是哪一步挂的：
 * 「获取页面」失败是反爬，「提取正文」失败是页面结构不认识，
 * 「下载图片」失败是防盗链。三者对用户的下一步动作完全不同。
 */

/** 抓取阶段。前端按这个顺序渲染进度，失败时能指出具体卡在哪一步 */
export const captureStageSchema = z.enum(['fetch', 'extract', 'assets', 'convert'])
export type CaptureStage = z.infer<typeof captureStageSchema>

export const captureStageResultSchema = z.object({
  stage: captureStageSchema,
  status: z.enum(['done', 'failed']),
  /** 该阶段的实测数字，如「320 KB · 1.2s」「2,140 字」 */
  meta: z.string().optional(),
  /** 失败原因。带出来是为了让界面能给出针对性的出路 */
  error: z.string().optional(),
})
export type CaptureStageResult = z.infer<typeof captureStageResultSchema>

export const captureInputSchema = z.object({
  url: z.string().trim().url('请输入完整的链接（含 https://）').max(2000),
})
export type CaptureInput = z.infer<typeof captureInputSchema>

/**
 * 抓取结果。
 *
 * 两种落点：
 * - 成功：`saved` 带文档 id，内容已入库并进收件箱
 * - 部分失败：`stages` 里有一项 failed，`saved` 可能仍然有值——
 *   公众号图片下不动是常见情况，正文可用就先入库，不要因为图而丢掉正文
 */
export const captureResponseSchema = z.object({
  /** 识别出来的来源类型，用于界面显示「识别为 微信公众号」 */
  kind: documentKindSchema,
  /** 来源标签，如「微信公众号」「GitHub 仓库」 */
  label: z.string(),
  /** 该来源特有的坑，提前告诉用户 */
  note: z.string(),
  stages: z.array(captureStageResultSchema),
  /** 预览：确认后才入库时用 */
  preview: z
    .object({
      title: z.string(),
      excerpt: z.string(),
      charCount: z.number().int(),
      imageCount: z.number().int(),
    })
    .nullable(),
  documentId: z.string().nullable(),
})
export type CaptureResponse = z.infer<typeof captureResponseSchema>

/** 链接识别：输入框里边打边判断来源，与抓取共用同一套规则 */
export interface DetectedSource {
  kind: z.infer<typeof documentKindSchema>
  label: string
  note: string
}

export function detectSource(url: string): DetectedSource | null {
  const value = url.trim()
  if (!/^https?:\/\//i.test(value)) return null

  if (/mp\.weixin\.qq\.com/i.test(value)) {
    return {
      kind: 'wechat',
      label: '微信公众号',
      note: '图片需要带 Referer 才能下载，代码常是截图',
    }
  }
  if (/github\.com/i.test(value)) {
    return {
      kind: 'github',
      label: 'GitHub 仓库',
      note: '走 API 取 README 与 release，只抓 README 和 docs/',
    }
  }
  return { kind: 'web', label: '网页', note: 'Readability 提取正文' }
}
