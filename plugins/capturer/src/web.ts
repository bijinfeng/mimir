import type { Capturer, CaptureRaw, PluginSettings } from '@mimir/shared'
import { fetchHtml, fetchLimits } from './http.js'

/**
 * 通用网页抓取器。
 *
 * 它**不提取正文**——那是 `parser` 接缝的事（见 `plugins/parser/src/html.ts`）。
 * 这里只负责「把页面拿下来」，并把原始 HTML 交给解析层。
 *
 * 这个分工看着绕（两个包各一半），但它换来的是：换 HTML 转换策略时
 * 抓取器一行不用改，而加一个新来源（RSS、浏览器扩展）时也不用重写转换。
 *
 * `matches` 永远返回 true——它是兜底实现，注册顺序把它放在最后。
 */
export function createWebCapturer(settings: PluginSettings): Capturer {
  return {
    id: 'web',
    matches: () => true,

    async run(url: string): Promise<CaptureRaw> {
      const limits = await fetchLimits(settings)
      const { html } = await fetchHtml(url, limits)

      return {
        kind: 'web',
        // 标题的最终判定交给解析层（它能看到 DOM 的 <title> 与 article 标题）；
        // 这里给一个必定可用的兜底值
        title: url,
        content: { type: 'html', html },
        rawHtml: html,
        imageCount: 0,
      }
    },
  }
}
