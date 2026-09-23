import { parseHTML } from 'linkedom'
import type { Capturer, CaptureRaw, PluginSettings } from '@mimir/shared'
import { fetchHtml, fetchLimits } from './http.js'

/**
 * 微信公众号抓取器。
 *
 * ## 两个必须处理的现实约束（`docs/PRD.md` §3.2）
 *
 * 1. **正文在 `#js_content`**，不在 Readability 能识别的 `<article>` 里。
 *    这是它不能走通用网页路径的原因
 * 2. **图片必须带 `Referer: https://mp.weixin.qq.com/` 才能下载**，否则 403。
 *    所以这一层把懒加载的 `data-src` 提升成 `src`——公众号图片默认是懒加载的，
 *    不提升的话 turndown 输出的全是占位图
 *
 * ## 没能做到的（如实记录）
 *
 * 图片**没有真的本地化**：现在只是把链接改写正确。真正的下载需要处理
 * 防盗链、去重、存储命名，而这一步的收益（原文删除后图片还在）要到
 * M2 的浏览器扩展才真正成立。界面如实显示「N 张（保留原链接）」，
 * 不假装已经本地化。
 *
 * 另一个已知限制：技术号经常把代码贴成**截图**，正文里根本没有代码文本。
 * 这只能靠 OCR 或接受，摘要里目前没有标注「该段为图片」。
 */
export function createWechatCapturer(settings: PluginSettings): Capturer {
  return {
    id: 'wechat',
    matches: (url) => /mp\.weixin\.qq\.com/i.test(url),

    async run(url: string): Promise<CaptureRaw> {
      const limits = await fetchLimits(settings)
      const { html } = await fetchHtml(url, limits)
      const { document } = parseHTML(html)

      const content = document.querySelector('#js_content')
      if (!content) {
        throw new Error('页面里没有找到 #js_content（文章可能已被删除，或需要验证）')
      }

      // 懒加载的 data-src 提升成 src，否则 turndown 输出的是占位图
      const images = content.querySelectorAll('img')
      for (const img of images) {
        const src = img.getAttribute('data-src') ?? img.getAttribute('src')
        if (src) img.setAttribute('src', src)
        // 懒加载占位属性留着会让 turndown 输出一堆无意义内容
        img.removeAttribute('data-src')
      }

      const title = document.querySelector('#activity-name')?.textContent?.trim() || document.title

      return {
        kind: 'wechat',
        title,
        // 交给 parser：公众号正文是 HTML，转换规则与别的站点相同
        content: { type: 'html', html: content.innerHTML },
        rawHtml: html,
        imageCount: images.length,
      }
    },
  }
}
