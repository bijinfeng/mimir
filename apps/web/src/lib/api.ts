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
  ProbeResult,
  ProviderInstance,
  RuntimeConfig,
  SaveNoteInput,
  SearchQueryInput,
  SearchResponse,
  SuggestedTagsResponse,
  TagListResponse,
  UpdateSettingsResponse,
  UsageStats,
} from '@mimir/shared'

/**
 * 会话。`image` 是**带版本号的头像 URL**（`/api/avatar?v=...`）——
 * 文件名固定，不带版本就会一直显示缓存里的旧图（`docs/TECH.md` §12.6）。
 */
export interface AuthSession {
  user: { id: string; email: string; name: string; image?: string | null }
}

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

  /**
   * 写设置。`null` 表示**删除覆盖**，回落到环境变量或默认值——
   * 那是一个真实的动作，不是「清空输入框」的副作用（docs/TECH.md §7.5）。
   *
   * 服务端整批校验，任一键不合法则整批拒绝（400 + issues）。
   */
  updateSettings(values: Record<string, unknown>) {
    return request<UpdateSettingsResponse>('/api/config/settings', {
      method: 'PATCH',
      body: JSON.stringify({ values }),
    })
  },

  /**
   * 存储后端探测：真的写一个探针对象、读回、再删掉。
   *
   * **只探当前选中的那个后端**——它写的是真实位置。想验证 S3 的配置，
   * 先把「存储后端」切到 s3 再点，那时探通即代表真的能用
   * （见服务端 routes/config.ts 的注释）。
   *
   * 显式动作，不自动触发：每次进设置页都写一个对象是浪费，
   * 而且 S3 的写是按请求计费的（同 docs/TECH.md §7.8 对模型探测的判断）。
   */
  probeStorage() {
    return request<{ target: string; ok: boolean; message: string }>('/api/config/storage-probe', {
      method: 'POST',
    })
  },

  /**
   * 角色级探测：探这个角色绑定的模型。
   *
   * 只由用户显式点击触发——每次进设置页都发一次真实调用，慢且花钱
   * （docs/TECH.md §7.8）。
   */
  probeRole(role: string) {
    return request<ProbeResult>('/api/config/probe-role', {
      method: 'POST',
      body: JSON.stringify({ role }),
    })
  },

  /**
   * 供应商级探测：真的发一次最小请求。
   *
   * **不依赖角色绑定**，所以新建供应商、还没绑任何角色时就能验证它通不通
   * ——那正是用户此刻最想知道的事。
   */
  probeProvider(providerId: string, modelId?: string) {
    return request<ProbeResult>('/api/config/probe', {
      method: 'POST',
      body: JSON.stringify(modelId ? { providerId, modelId } : { providerId }),
    })
  },

  /**
   * 拉取一个供应商的模型列表。**这是一次真实网络请求，也是个写操作**
   * （结果会写回配置），所以用 POST 且由用户显式触发。
   */
  refreshProviderModels(providerId: string) {
    return request<{ ok: boolean; instance: ProviderInstance }>(
      `/api/config/providers/${encodeURIComponent(providerId)}/refresh`,
      { method: 'POST' },
    )
  },

  /**
   * 用量统计（`docs/TECH.md` §12）。
   *
   * 时区不由前端传——它是部署配置（`stats.timezone`），跟着服务端走。
   * 让前端传会让「同一份数据在两个浏览器上分档不同」，而那种差异
   * 看起来像数据错了。
   *
   * 覆盖范围同样不由前端定：固定一年（`USAGE_HISTORY_DAYS`）。
   */
  stats() {
    return request<UsageStats>('/api/stats')
  },

  /**
   * 头像。
   *
   * 上传走 multipart，**不走 `request()`**——那个函数会强制加上
   * `Content-Type: application/json`，而 multipart 的 boundary 必须由
   * 浏览器自己生成（手写一个 boundary 会让服务端解析不出来）。
   */
  avatar: {
    async upload(file: Blob) {
      const body = new FormData()
      body.append('file', file)

      const res = await fetch('/api/avatar', { method: 'POST', credentials: 'include', body })

      const text = await res.text()
      const parsed: unknown = text ? JSON.parse(text) : null

      if (!res.ok) {
        const err = parsed as ApiError | null
        throw new ApiRequestError(
          res.status,
          err?.error?.code ?? 'UNKNOWN',
          err?.error?.message ?? `上传失败（HTTP ${res.status}）`,
        )
      }

      return parsed as { image: string; mime: string; bytes: number }
    },
    remove() {
      return request<{ ok: boolean }>('/api/avatar', { method: 'DELETE' })
    },
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
    /**
     * 登出并回到登录页。
     *
     * **两处调用**（左导航账号菜单、设置 › 账号），所以抽在这里而不是
     * 各写一遍：两处要做的三件事完全一样——请求登出、清掉会话相关的
     * 查询缓存、整页跳到登录页。分开写的版本已经在细节上漂移了
     * （一处 `window.location.href`，另一处漏了缓存失效）。
     *
     * 用 `location.href` 而不是路由跳转：登出要丢掉**内存里的整个会话状态**
     * （查询缓存、编辑器草稿、上一条会话的历史），整页重载是最省事、
     * 也最不会漏的做法。
     */
    async signOutAndLeave(): Promise<void> {
      // 直接发请求，不走 `this`——对象字面量内部自引用能跑但读起来绕
      await request<{ success: boolean }>('/api/auth/sign-out', { method: 'POST' })
      // 整页重载会清掉内存里的一切（查询缓存、草稿、历史）
      window.location.href = '/login'
    },
    /** 未登录时返回 null，而不是抛错——它用于路由守卫判断 */
    async session() {
      try {
        return await request<AuthSession>('/api/auth/get-session')
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) return null
        throw error
      }
    },
    /**
     * 改名称。**走 Better Auth 自带的端点**，不在 `/api/` 下再包一层——
     * 包一层等于把校验规则复制到两处，而会话校验、字段白名单都在
     * Better Auth 里（`docs/TECH.md` §12.6）。
     */
    updateUser(input: { name: string }) {
      return request<{ status: boolean }>('/api/auth/update-user', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },
  },
}
