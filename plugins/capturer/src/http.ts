import type { PluginSettings } from '@mimir/shared'

/**
 * 抓取的 HTTP 层：三件事，每件都对应一类真实的失败。
 *
 *  1. **User-Agent**：默认的 node fetch UA 会被不少站点直接拒掉（403 或空响应）
 *  2. **超时**：没有超时的话，一个不响应的站点会把请求挂到天荒地老
 *  3. **体积上限**：有些页面会返回几百 MB 的响应，不设上限会打爆内存
 *
 * 超时与上限都可配（`capture.fetchTimeoutMs` / `capture.maxBytes`），
 * 因为它们与部署环境有关：家里的小机器该把上限调低。
 */

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'

export interface FetchOptions {
  headers?: Record<string, string>
  timeoutMs: number
  maxBytes: number
}

export interface FetchResult {
  html: string
  bytes: number
}

export async function fetchHtml(url: string, options: FetchOptions): Promise<FetchResult> {
  const { text, bytes } = await fetchText(url, options)
  return { html: text, bytes }
}

/**
 * 拉取一个 URL 并解码成文本。
 *
 * `fetchHtml` 与 feed 的拉取共用这一个实现——**UA / 超时 / 体积上限
 * 三件事各自都有实测踩过的坑**（见文件头注释），复制一份必然漂移。
 * 返回的字段叫 `text` 而不是 `html`：feed 是 XML，叫 html 会误导。
 */
export async function fetchText(
  url: string,
  options: FetchOptions,
): Promise<{ text: string; bytes: number }> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, ...options.headers },
    signal: AbortSignal.timeout(options.timeoutMs),
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }

  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > options.maxBytes) {
    const mb = (buffer.byteLength / 1024 / 1024).toFixed(1)
    const limitMb = (options.maxBytes / 1024 / 1024).toFixed(0)
    throw new Error(`内容过大（${mb} MB），超过 ${limitMb} MB 上限`)
  }

  return { text: new TextDecoder('utf-8').decode(buffer), bytes: buffer.byteLength }
}

/** 从设置里读抓取参数。每次抓取现读，用户在设置页改完立刻生效 */
export async function fetchLimits(settings: PluginSettings) {
  return {
    timeoutMs: await settings.getNumber('capture.fetchTimeoutMs'),
    maxBytes: await settings.getNumber('capture.maxBytes'),
  }
}
