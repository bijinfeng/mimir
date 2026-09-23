import type {
  ApiError,
  AuthSetupState,
  AskInput,
  AskResponse,
  CaptureResponse,
  ConversationDetail,
  ConversationSummary,
  DetectedSource,
  DocumentCounts,
  DocumentDetail,
  DocumentListQuery,
  DocumentSummary,
  ExportStats,
  FolderListResponse,
  NoteCreate,
  NoteUpdate,
  RuntimeConfig,
  SaveNoteInput,
  SearchQueryInput,
  SearchResponse,
  SuggestedTagsResponse,
  TagListResponse,
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
    /**
     * 建议标签。整理条把它直接摆成按钮，用户点一下就能挂上——
     * 这是把收件箱从「死胡同」变成能整理的关键一步（`docs/PRD.md` §2.2）。
     */
    suggestedTags(id: string) {
      return request<SuggestedTagsResponse>(
        `/api/documents/${encodeURIComponent(id)}/suggested-tags`,
      )
    },
    counts() {
      return request<DocumentCounts>('/api/documents/counts')
    },
  },

  folders: {
    list() {
      return request<FolderListResponse>('/api/folders')
    },
  },

  tags: {
    list() {
      return request<TagListResponse>('/api/tags')
    },
  },

  conversations: {
    list() {
      return request<{ items: ConversationSummary[] }>('/api/conversations')
    },
    get(id: string) {
      return request<ConversationDetail>(`/api/conversations/${encodeURIComponent(id)}`)
    },
    create() {
      return request<ConversationSummary>('/api/conversations', { method: 'POST' })
    },
    remove(id: string) {
      return request<{ ok: boolean }>(`/api/conversations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },
    /** 在已有会话里提问 */
    ask(id: string, input: AskInput) {
      return request<AskResponse>(`/api/conversations/${encodeURIComponent(id)}/ask`, {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },
    /** 不指定会话时自动开一个新的。命令面板里直接提问走这条。 */
    askNew(input: AskInput) {
      return request<AskResponse>('/api/conversations/ask', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },
    /** 存成笔记。保留引用来源，见 docs/PRD.md §5.7。 */
    saveAsNote(input: SaveNoteInput) {
      return request<{ noteId: string; conversationId: string }>(
        '/api/conversations/messages/note',
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      )
    },
  },

  capture: {
    /** 输入框里边打边识别来源。规则与服务端抓取共用同一套。 */
    detect(url: string) {
      return request<{ source: DetectedSource | null }>(`/api/capture/detect${toQuery({ url })}`)
    },
    run(url: string) {
      return request<CaptureResponse>('/api/capture', {
        method: 'POST',
        body: JSON.stringify({ url }),
      })
    },
  },

  export: {
    stats() {
      return request<ExportStats>('/api/export/stats')
    },
  },

  search(query: SearchQueryInput) {
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

  /**
   * 生效中的运行时配置，只读。
   *
   * 设置页显示它而不是在组件里硬编码一份——配置的真相在服务端
   * （环境变量与代码常量），前端各写一份必然会漂移。
   */
  config() {
    return request<RuntimeConfig>('/api/config')
  },

  auth: {
    /**
     * 登录页的公开状态：库里有没有账号、要不要显示首次注册。
     *
     * 它免鉴权，所以登录页在登录前就能调。**不要**用「先试登录、失败再试
     * 注册」去猜这个状态——那会把「密码错误」显示成「邮箱已被使用」。
     */
    setupState() {
      return request<AuthSetupState>('/api/auth/setup/state')
    },
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
