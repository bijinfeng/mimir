import { Hono } from 'hono'
import { captureInputSchema, detectSource } from '@mimir/shared'
import { HttpError, parseInput } from '../lib/http.js'
import { capture } from '../services/capture.js'
import type { AppEnv } from '../types.js'

/**
 * 抓取。
 *
 * `docs/PRD.md` §2.2：收集是五环里的第一环，「界面上根本没有地方粘贴链接」
 * 会让整条链失效。所以这个路由是 M0 的核心之一。
 */
export const captureRoute = new Hono<AppEnv>()

/**
 * 识别链接来源。输入框里边打边请求，用于显示「识别为 微信公众号」。
 *
 * 单独一个端点而不是让前端自己判断：识别规则必须与真正抓取时用的是同一套，
 * 否则会出现「界面说这是 GitHub，实际走了通用网页抓取」这种错位。
 */
captureRoute.get('/detect', (c) => {
  const url = c.req.query('url') ?? ''
  return c.json({ source: detectSource(url) })
})

captureRoute.post('/', async (c) => {
  const input = await parseInput(c, 'json', captureInputSchema)

  const source = detectSource(input.url)
  if (!source) {
    throw new HttpError(400, 'INVALID_URL', '无法识别的链接，需要以 http:// 或 https:// 开头')
  }

  const result = await capture({ url: input.url, source })

  // 抓取阶段失败时主动声明，让前端走失败分支而不是把空预览当成功。
  // 用 200 + stages 里的 failed 也可以，但那样前端要检查两层状态——
  // 抛出去只有一种判断
  const failed = result.stages.find((stage) => stage.status === 'failed')
  if (failed && !result.documentId) {
    throw new HttpError(400, 'CAPTURE_FAILED', failed.error ?? '抓取失败', {
      stage: failed.stage,
      label: result.label,
      note: result.note,
    })
  }

  return c.json(result)
})

/** 来源特有的注意点，让对话框能在粘贴前就把坑说清楚 */
captureRoute.get('/sources', (c) =>
  c.json({
    items: [
      {
        kind: 'web',
        label: '网页',
        note: 'Readability 提取正文，去掉导航与广告',
      },
      {
        kind: 'wechat',
        label: '微信公众号',
        note: '图片需要带 Referer 才能下载；技术文章里的代码常是截图',
      },
      {
        kind: 'github',
        label: 'GitHub 仓库',
        note: '走 API 取 README 与元数据，不克隆整个仓库',
      },
    ],
  }),
)
