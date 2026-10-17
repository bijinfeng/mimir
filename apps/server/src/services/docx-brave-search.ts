import { assemble } from '../plugins/host.js'
import { migrateAiServiceSettings } from './ai-service-settings.js'

const BRAVE_BASE = 'https://api.search.brave.com/res/v1'

export type BraveResult = { title: string; url: string; description: string; imageUrl?: string }

async function key(): Promise<string> {
  const issues = await migrateAiServiceSettings()
  const migrationIssue = issues.find((item) => item.key === 'search.web.brave.apiKey')
  if (migrationIssue) throw new Error(migrationIssue.message)
  const { settings } = assemble()
  const secret = await settings.getSecret('search.web.brave.apiKey')
  if (!secret.ok) {
    throw new Error(
      secret.reason === 'corrupted'
        ? 'Brave Search 密钥无法解密，请在设置中重新填写'
        : '尚未配置 Brave Search API 密钥',
    )
  }
  return secret.value
}

export async function braveSearchReady(): Promise<boolean> {
  try {
    return (await key()).length > 0
  } catch {
    return false
  }
}

function inputOf(input: unknown): { query: string; maxResults: number } {
  if (!input || typeof input !== 'object') throw new Error('搜索参数必须是对象')
  const raw = input as { query?: unknown; maxResults?: unknown }
  if (typeof raw.query !== 'string' || raw.query.trim().length < 1 || raw.query.length > 500) {
    throw new Error('搜索词不能为空且不能超过 500 字符')
  }
  const maxResults = raw.maxResults === undefined ? 6 : raw.maxResults
  if (!Number.isInteger(maxResults) || (maxResults as number) < 1 || (maxResults as number) > 10) {
    throw new Error('搜索结果数量必须在 1 到 10 之间')
  }
  return { query: raw.query.trim(), maxResults: maxResults as number }
}

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.slice(0, limit) : ''
}

async function braveFetch(
  kind: 'web' | 'images',
  input: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  signal?.throwIfAborted()
  const { query, maxResults } = inputOf(input)
  const apiKey = await key()
  signal?.throwIfAborted()
  const url = new URL(`${BRAVE_BASE}/${kind}/search`)
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(maxResults))
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
        : AbortSignal.timeout(10_000),
    })
  } catch (error) {
    signal?.throwIfAborted()
    throw new Error('Brave Search 连接失败或超时', { cause: error })
  }
  if (response.status === 401 || response.status === 403)
    throw new Error('Brave Search 密钥无效或权限不足')
  if (response.status === 429) throw new Error('Brave Search 请求额度或速率已用尽')
  if (!response.ok) throw new Error(`Brave Search 返回 HTTP ${response.status}`)
  const data: unknown = await response.json()
  signal?.throwIfAborted()
  return data
}

/** Real Brave Search API responses, normalized to a small model-safe result. */
export async function braveWebSearch(input: unknown): Promise<{ results: BraveResult[] }> {
  const raw = (await braveFetch('web', input)) as { web?: { results?: unknown } }
  const entries = Array.isArray(raw.web?.results) ? raw.web.results : []
  return {
    results: entries.flatMap((entry): BraveResult[] => {
      if (!entry || typeof entry !== 'object') return []
      const item = entry as Record<string, unknown>
      const url = text(item.url, 2_000)
      if (!/^https?:\/\//i.test(url)) return []
      return [{ title: text(item.title, 300), url, description: text(item.description, 1_000) }]
    }),
  }
}

export async function braveImageSearch(
  input: unknown,
  signal?: AbortSignal,
): Promise<{ results: BraveResult[] }> {
  const raw = (await braveFetch('images', input, signal)) as { results?: unknown }
  const entries = Array.isArray(raw.results) ? raw.results : []
  return {
    results: entries.flatMap((entry): BraveResult[] => {
      if (!entry || typeof entry !== 'object') return []
      const item = entry as Record<string, unknown>
      const properties =
        item.properties && typeof item.properties === 'object'
          ? (item.properties as Record<string, unknown>)
          : {}
      const imageUrl = text(properties.url, 2_000)
      const pageUrl = text(item.url, 2_000)
      if (!/^https?:\/\//i.test(imageUrl) || !/^https?:\/\//i.test(pageUrl)) return []
      return [
        {
          title: text(item.title, 300),
          url: pageUrl,
          imageUrl,
          description: text(item.description, 1_000),
        },
      ]
    }),
  }
}
