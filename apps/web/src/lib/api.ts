import type {
  ApiError,
  DocumentDetail,
  DocumentListQuery,
  DocumentSummary,
  NoteCreate,
  NoteUpdate,
  SearchQuery,
  SearchResponse,
} from '@mimir/shared'

/**
 * 类型安全的 API 客户端。
 *
 * 三点约定：
 *  1. 开发时经 Vite 代理打到后端（见 vite.config.ts），所以 baseUrl 是空的；
 *     生产时前端由同一个服务提供，同样不需要跨源。
 *  2. 一律 credentials: 'include'——鉴权走 cookie，不是 header。
 *  3. 服务端的错误外壳是 { error: { code, message } }，这里统一抛 ApiRequestError，
 *     调用方只需要 catch 一种形状。
 */

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })

  if (res.status === 204) return undefined as T

  const text = await res.text()
  const body: unknown = text ? JSON.parse(text) : null

  if (!res.ok) {
    const err = body as ApiError | null
    throw new ApiRequestError(
      res.status,
      err?.error?.code ?? 'UNKNOWN',
      err?.error?.message ?? `请求失败（HTTP ${res.status}）`,
      err?.error?.details,
    )
  }

  return body as T
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export const api = {
  documents: {
    list(query: Partial<DocumentListQuery> = {}) {
      return request<{ items: DocumentSummary[] }>(
        `/api/documents${toQuery(query as Record<string, string | number | undefined>)}`,
      )
    },
    get(id: string) {
      return request<DocumentDetail>(`/api/documents/${encodeURIComponent(id)}`)
    },
    createNote(input: NoteCreate) {
      return request<DocumentDetail>('/api/documents/notes', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },
    update(id: string, input: NoteUpdate) {
      return request<DocumentDetail>(`/api/documents/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      })
    },
    remove(id: string) {
      return request<{ ok: boolean }>(`/api/documents/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },
  },

  tags: {
    list() {
      return request<{ items: { name: string; count: number }[] }>('/api/tags')
    },
  },

  search(query: SearchQuery) {
    return request<SearchResponse>(
      `/api/search${toQuery(query as unknown as Record<string, string | number | undefined>)}`,
    )
  },

  maintenance: {
    reindex() {
      return request<{ scanned: number; created: number; updated: number; removed: number }>(
        '/api/maintenance/reindex',
        { method: 'POST' },
      )
    },
  },

  auth: {
    /** 单用户规则：只有系统里一个用户都没有时注册才会成功 */
    signUp(input: { email: string; password: string; name: string }) {
      return request<{ user: unknown }>('/api/auth/sign-up/email', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },
    signIn(input: { email: string; password: string }) {
      return request<{ user: unknown }>('/api/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },
    signOut() {
      return request<{ success: boolean }>('/api/auth/sign-out', { method: 'POST' })
    },
    /** 未登录时返回 null，而不是抛错——它用于路由守卫判断 */
    async session() {
      try {
        return await request<{ user: { id: string; email: string; name: string } } | null>(
          '/api/auth/get-session',
        )
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) return null
        throw error
      }
    },
  },
}
