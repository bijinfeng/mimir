import type { PluginHost, SettingSpec } from '@mimir/shared'
import { createGithubCapturer } from './github.js'
import { createWebCapturer } from './web.js'
import { createWechatCapturer } from './wechat.js'

/**
 * 抓取器插件包：URL → 原始内容 + 元数据。
 *
 * ## 边界：它只负责「把内容拿下来」
 *
 * 不转 Markdown（parser 接缝）、不写库（宿主的抓取路径）、不落盘快照
 * （宿主决定 RAW_DIR 在哪）。每个实现只封装**站点特有的知识**：
 * 微信公众号的 `#js_content` 与懒加载、GitHub 的 API 与限额。
 *
 * 这个边界让「加一个来源」不需要碰转换、存储与检索——
 * 那三处各自都不知道内容是从哪个站点来的。
 *
 * ## 注册顺序即匹配优先级
 *
 * `web` 的 `matches` 永远返回 true，它是兜底实现，必须排在最后。
 * 顺序由**这个数组**决定，不写在每个实现里——那样「谁优先」会散在多个文件里。
 */
/**
 * 抓取的参数由**抓取器自己声明**：超时与体积上限是「把网页拿下来」这件事
 * 的参数，与宿主、与解析无关（`.trellis/spec/project/architecture.md` §7.5 的归属规则）。
 */
const CAPTURE_PARAMS: SettingSpec[] = [
  {
    key: 'capture.fetchTimeoutMs',
    label: '抓取超时',
    group: 'capture',
    type: 'number',
    envName: 'CAPTURE_FETCH_TIMEOUT_MS',
    defaultValue: 20_000,
    rebuild: 'none',
    validate: (value) => {
      const n = Number(value)
      if (!Number.isFinite(n)) return '必须是数字'
      if (n < 1000 || n > 120_000) return '必须在 1000 到 120000 毫秒之间'
      return null
    },
  },
  {
    key: 'capture.maxBytes',
    label: '单次抓取体积上限',
    group: 'capture',
    type: 'number',
    envName: 'CAPTURE_MAX_BYTES',
    defaultValue: 8 * 1024 * 1024,
    rebuild: 'none',
    validate: (value) => {
      const n = Number(value)
      if (!Number.isFinite(n)) return '必须是数字'
      if (n < 64 * 1024 || n > 128 * 1024 * 1024) return '必须在 64KB 到 128MB 之间'
      return null
    },
  },
  {
    key: 'capture.githubToken',
    label: 'GitHub Token',
    description: '密钥会加密保存',
    group: 'capture',
    type: 'secret',
    envName: 'GITHUB_TOKEN',
    defaultValue: '',
    rebuild: 'none',
  },
]

export function install(host: PluginHost): void {
  // 三个抓取器共用同一组抓取参数：包级声明一次，而不是各写一份
  host.params(CAPTURE_PARAMS)

  host.capturer(
    {
      seam: 'capturer',
      id: 'wechat',
      name: '微信公众号',
      description: '图片保留原链接，正文可离线阅读',
      file: 'plugins/capturer/src/wechat.ts',
      configKeys: ['capture.fetchTimeoutMs', 'capture.maxBytes'],
    },
    createWechatCapturer(host.settings),
  )

  host.capturer(
    {
      seam: 'capturer',
      id: 'github',
      name: 'GitHub 仓库',
      description: '收集仓库信息和 README',
      file: 'plugins/capturer/src/github.ts',
      configKeys: ['capture.fetchTimeoutMs', 'capture.maxBytes', 'capture.githubToken'],
    },
    createGithubCapturer(host.settings),
  )

  host.capturer(
    {
      seam: 'capturer',
      id: 'web',
      name: '通用网页（兜底）',
      description: '提取网页正文',
      file: 'plugins/capturer/src/web.ts',
      configKeys: ['capture.fetchTimeoutMs', 'capture.maxBytes'],
    },
    createWebCapturer(host.settings),
  )
}
