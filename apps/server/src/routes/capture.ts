import { Hono } from 'hono'
import { captureInputSchema, detectSource } from '@mimir/shared'
import { HttpError, parseInput } from '../lib/http.js'
import { assemble } from '../plugins/host.js'
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
 * 识别链接来源。
 *
 * **用注册表判定，而不是 `shared` 里的 `detectSource`**：
 * 抓取时选实现用的是 `capturer.matches`（`services/capture.ts`），
 * 如果这里走另一套规则，就会出现「界面说这是 GitHub，实际走了通用网页抓取」
 * 这种错位。两者必须是同一套。
 *
 * `shared` 的那份保留给**前端边打边显示**用（不能每个字符发一次请求），
 * `structure.test.ts` 有一条断言防止两者漂移。
 */
captureRoute.get('/detect', async (c) => {
  const url = c.req.query('url') ?? ''
  const { seams } = assemble()

  const found = seams.capturer.implementations().find(({ impl }) => impl.matches(url))

  if (!found || !/^https?:\/\//i.test(url.trim())) {
    return c.json({ source: null })
  }

  return c.json({
    source: {
      kind: found.declaration.id,
      label: found.declaration.name,
      // note 用实现的 description：它就是「这个来源有什么坑」那句话，
      // 写在一个地方就够了
      note: found.declaration.description,
    },
  })
})

captureRoute.post('/', async (c) => {
  const input = await parseInput(c, 'json', captureInputSchema)

  const source = detectSource(input.url)
  if (!source) {
    throw new HttpError(400, 'INVALID_URL', '无法识别的链接，需要以 http:// 或 https:// 开头')
  }

  const result = await capture({ url: input.url, source, folder: input.folder })

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

/** 已注册的来源清单。让对话框在粘贴前就把坑说清楚 */
captureRoute.get('/sources', async (c) => {
  const { seams } = assemble()

  return c.json({
    items: seams.capturer.implementations().map(({ declaration }) => ({
      kind: declaration.id,
      label: declaration.name,
      note: declaration.description,
    })),
  })
})
