import type {
  AiTagsResponse,
  AiTextResponse,
  ApiError,
  AuthSetupState,
  CaptureResponse,
  ConversationDetail,
  ConversationSummary,
  DocumentCounts,
  DocumentDetail,
  DocumentListQuery,
  DocumentSummary,
  ExportStats,
  FeedRefreshResult,
  FeedSummary,
  FetchedModelsResult,
  FileUploadResponse,
  FolderDeleteResponse,
  FolderListResponse,
  FolderMoveResponse,
  NoteCreate,
  NoteLookupItem,
  NoteUpdate,
  ProbeResult,
  RuntimeConfig,
  SaveNoteInput,
  SearchQueryInput,
  SearchResponse,
  SuggestedTagsResponse,
  TagListResponse,
  UpdateSettingsResponse,
  UsageStats,
} from '@mimir/shared'
import { appBasePath, appPath, serverAssetPath } from './app-path'

/**
 * 会话。`image` 是**带版本号的头像 URL**（`/api/avatar?v=...`）——
 * 文件名固定，不带版本就会一直显示缓存里的旧图（`.trellis/spec/project/architecture.md` §12.6）。
 */
export interface AuthSession {
  user: { id: string; email: string; name: string; image?: string | null }
}

/**
 * 类型安全的 API 客户端——**前端唯一的服务端访问口**（`.trellis/spec/project/architecture.md` §14）。
 *
 * 四点约定：
 *  1. 开发时经 Vite 代理打到后端（见 vite.config.ts），生产由同一个服务提供；
 *     默认请求前缀来自构建的 BASE_URL，根路径部署时为空。
 *  2. 一律 credentials: 'include'——鉴权走 cookie，不是 header。
 *  3. 服务端的错误外壳是 { error: { code, message } }，这里统一抛 ApiRequestError，
 *     调用方只需要 catch 一种形状。
 *  4. 传输可注入（D-046）：「前端怎么连上服务端」是载体（浏览器 / 桌面壳 /
 *     将来的 CLI 与扩展）的事——configureApiTransport() 注入，业务代码
 *     只认这个 api 对象的形状。桌面端窗口加载的就是宿主自己的地址，
 *     因此与浏览器部署走同一条默认配置。
 */

/** 载体注入的传输配置。全部可选——默认值就是浏览器部署的现状 */
export interface RpcConfig {
  /**
   * 请求前缀。空串 = 同源相对路径（浏览器与桌面壳都是这种形态）。
   * 指向别的宿主时给绝对地址（如 `http://127.0.0.1:19387`）。
   */
  baseUrl?: string
  /** 附加到每个 JSON 请求上的头。用于载体注入的认证（dsh 的 authenticated Host） */
  headers?: Record<string, string>
  /** 传输实现。默认 globalThis.fetch——测试与非浏览器载体可注入 */
  fetchImpl?: typeof fetch
}

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

/**
 * 当前生效的传输配置。默认走当前应用路径下的同源请求；需要指向别的宿主时
 * 在应用启动最前面 configureApiTransport()。
 *
 * 为什么是「单例 + 模块级配置」而不是 createApi() 工厂：实测 TypeScript 7
 * （本项目的编译器）对「泛型函数作为参数传入、返回大对象字面量」的工厂模式
 * 会**丢失方法返回类型的推理**（调用方全部退化成 unknown，且不报错地通过
 * 编译器内部的宽松路径）——这是静默的类型塌陷，比重复代码危险得多。
 * api 字面量保持直接形态（类型完整），传输配置显式注入，两者兼得（D-046）。
 */
let transport: RpcConfig = {}

/** 指向别的宿主时调用（CLI / 扩展 / 跨源载体）。必须在第一次请求前完成 */
export function configureApiTransport(config: RpcConfig): void {
  transport = { ...transport, ...config }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const doFetch = transport.fetchImpl ?? fetch
  const res = await doFetch(`${transport.baseUrl ?? appBasePath}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...transport.headers,
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

/**
 * multipart 请求。与 `request()` 分开的理由见 `documents.upload` 的注释。
 *
 * 错误外壳仍与 `request()` 一致（`{ error: { code, message } }`），
 * 所以调用方只需要 catch 一种形状——这是 `lib/api.ts` 的约定之一。
 */
async function sendMultipart<T>(path: string, method: 'POST' | 'PUT', body: FormData): Promise<T> {
  const doFetch = transport.fetchImpl ?? fetch
  const res = await doFetch(`${transport.baseUrl ?? appBasePath}${path}`, {
    method,
    credentials: 'include',
    body,
    headers: { ...transport.headers },
  })

  const text = await res.text()
  const parsed: unknown = text ? JSON.parse(text) : null

  if (!res.ok) {
    const err = parsed as ApiError | null
    throw new ApiRequestError(
      res.status,
      err?.error?.code ?? 'UNKNOWN',
      err?.error?.message ?? `上传失败（HTTP ${res.status}）`,
      err?.error?.details,
    )
  }

  return parsed as T
}

/**
 * 查询参数序列化。
 *
 * **数组值用逗号连接**（`kinds=web,file`），与 `documentListQuerySchema`
 * 的 `kinds` 参数形状一一对应。用重复参数（`kinds=web&kinds=file`）也可以，
 * 但那样 `kinds=a` 与 `kinds=a,b` 在服务端要走两条解析分支——而这一处
 * 只有一种形状要维护。
 */
function toQuery(params: Record<string, string | number | boolean | string[] | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(','))
      continue
    }
    search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export const api = {
  documents: {
    list(query: Partial<DocumentListQuery> = {}) {
      return request<{ items: DocumentSummary[] }>(
        `/api/documents${toQuery(query as Record<string, string | string[] | undefined>)}`,
      )
    },
    findNotes(query: string) {
      return request<{ items: NoteLookupItem[] }>(
        `/api/documents/notes/lookup${toQuery({ q: query })}`,
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
    /**
     * 建议标签。整理条把它直接摆成按钮，用户点一下就能挂上——
     * 这是把收件箱从「死胡同」变成能整理的关键一步（`.trellis/spec/project/product.md` §2.2）。
     */
    suggestedTags(id: string) {
      return request<SuggestedTagsResponse>(
        `/api/documents/${encodeURIComponent(id)}/suggested-tags`,
      )
    },
    /**
     * AI 标签建议（M1-D）。与上面那条的区别：这是**模型判断**，
     * 要花钱、要用户显式点一下，所以是 POST。界面上的文案也不同
     * （「建议标签」vs「让 AI 建议」）——一次付费调用不该藏在
     * 一个用户以为是本地计算的动作里。
     */
    suggestedTagsAi(id: string) {
      return request<AiTagsResponse>(`/api/documents/${encodeURIComponent(id)}/suggested-tags/ai`, {
        method: 'POST',
      })
    },
    /**
     * AI 摘要（M1-D）。走 `summarize` 角色（有自己的适配器）。
     * **不落库**——要看就重新生成，比维护一份会过期的摘要便宜（见服务端注释）。
     */
    summary(id: string) {
      return request<AiTextResponse>(`/api/documents/${encodeURIComponent(id)}/summary`, {
        method: 'POST',
      })
    },
    counts() {
      return request<DocumentCounts>('/api/documents/counts')
    },
    /**
     * 删除文档。服务端把它移进回收站（笔记）或直接删记录 + 原件（上传件）。
     * **界面必须先过确认框**——不可撤销的动作不能挂在一步之内
     * （`doc-menu.tsx` 的同一条判断）。
     */
    remove(id: string) {
      return request<{ ok: boolean }>(`/api/documents/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },
    /**
     * 上传一个文件。**走 multipart，不复用 `request()`**——那个函数会
     * 强制 `Content-Type: application/json`，而 multipart 的 boundary
     * 必须由 fetch 自己生成（手写它会与实际的 body 不一致）。
     * 与 `avatar.upload` 同一条做法（那里是仓库里第一个 multipart 端点）。
     *
     * `folder`：归入的目录。从知识库页上传时带上，「上传文件夹」展开出的
     * 相对子路径也拼在里面；不带 = 落库根。
     */
    async upload(file: File, folder?: string) {
      const body = new FormData()
      body.append('file', file)
      if (folder) body.append('folder', folder)

      return sendMultipart<FileUploadResponse>('/api/documents/files', 'POST', body)
    },
    /**
     * 替换某个上传件的原件（下载 → 改 → 传回）。标签与目录保持不变。
     *
     * Office 在线编辑保存走的就是它：编辑器产出新字节 → multipart 传回。
     * 服务端会重算正文、哈希与 parse_error（`.trellis/spec/project/architecture.md` §13.9），
     * 所以改完的文档立刻能被检索到。
     */
    async replaceSource(id: string, file: File) {
      const body = new FormData()
      body.append('file', file)

      return sendMultipart<FileUploadResponse>(
        `/api/documents/${encodeURIComponent(id)}/file`,
        'PUT',
        body,
      )
    },
    /**
     * 原件的 URL。
     *
     * 前端各处（`<img>` / `<iframe>` / `<video>` / 下载链接）都直接用它，
     * **不走 fetch**——这些元素需要浏览器自己去发请求、去处理 Range 与缓存，
     * 而把 50MB 读进内存再转 blob URL 是白白多一份拷贝。
     * 鉴权靠 cookie，而浏览器发同源请求时会带上它。
     */
    sourceUrl(id: string, options: { download?: boolean } = {}) {
      const url = appPath(`/api/documents/${encodeURIComponent(id)}/file`)
      return options.download ? `${url}?download=1` : url
    },
  },

  folders: {
    list() {
      return request<FolderListResponse>('/api/folders')
    },
    /**
     * 新建目录 / 知识库。路径含父级（mkdir -p），已存在时抛 409。
     * 描述与图标（D-078）附着在被创建的那一级上，可省略。
     */
    create(path: string, meta: { description?: string; icon?: string } = {}) {
      return request<{ path: string }>('/api/folders', {
        method: 'POST',
        body: JSON.stringify({ path, ...meta }),
      })
    },
    /** 改名与移动是同一个操作：from 子树整体搬到 to */
    move(from: string, to: string) {
      return request<FolderMoveResponse>('/api/folders', {
        method: 'PATCH',
        body: JSON.stringify({ from, to }),
      })
    },
    /** 删除目录（文档保留、指派清空）。返回被移出的文档数 */
    remove(path: string) {
      return request<FolderDeleteResponse>(`/api/folders?path=${encodeURIComponent(path)}`, {
        method: 'DELETE',
      })
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
    /**
     * 存成笔记（PRD §5.7）。服务端把回答与引用写成站内链接（进双链），
     * 且按 messageId 幂等——重复调用返回同一篇笔记。
     */
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
    /** `folder`：抓完归入的目录（知识库页发起时带上） */
    run(url: string, folder?: string) {
      return request<CaptureResponse>('/api/capture', {
        method: 'POST',
        body: JSON.stringify({ url, ...(folder ? { folder } : {}) }),
      })
    },
  },

  export: {
    stats() {
      return request<ExportStats>('/api/export/stats')
    },
    url(format: 'markdown' | 'json') {
      return appPath(`/api/export/${format}`)
    },
  },

  search(query: SearchQueryInput) {
    return request<SearchResponse>(
      `/api/search${toQuery(query as unknown as Record<string, string | number | undefined>)}`,
    )
  },

  maintenance: {
    reindex() {
      return request<{
        scanned: number
        created: number
        updated: number
        removed: number
        orphans: number
      }>('/api/maintenance/reindex', { method: 'POST' })
    },
    /** 分块状态：共 N 段 · 待嵌入 M 段（`pending` 为 null = 没配向量化模型） */
    chunks() {
      return request<{
        total: number
        documents: number
        pending: number | null
      }>('/api/maintenance/chunks')
    },
    /**
     * 补一批嵌入（M1-B）。**分批**是可中断的保证：一次嵌完全库，
     * 中途断线就全白费。`remaining` 归零时界面说「全部已嵌入」。
     */
    embed(limit = 64) {
      return request<{ processed: number; remaining: number | null; failed: number }>(
        '/api/maintenance/embed',
        { method: 'POST', body: JSON.stringify({ limit }) },
      )
    },
    /** 全量核对分块（参数变化或升级修复旧索引后用）。不含嵌入——那是另一步 */
    rebuildChunks() {
      return request<{ documents: number; chunks: number }>('/api/maintenance/chunks/rebuild', {
        method: 'POST',
      })
    },
  },

  /**
   * 内联改写（M1-D）。**挂在 /api/ai 而不是文档下**：改写的文本
   * 可能还没保存（编辑器里选中一段直接改），所以它不要求先有文档。
   */
  ai: {
    rewrite(input: {
      text: string
      action: 'rewrite' | 'translate' | 'shorten' | 'expand'
      instruction?: string
      documentId?: string
    }) {
      return request<AiTextResponse>('/api/ai/rewrite', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },
  },

  /** RSS / Atom 订阅（M1-E）。收进来的文章仍在 documents，这里只管订阅关系 */
  feeds: {
    list() {
      return request<{ items: FeedSummary[] }>('/api/feeds')
    },
    create(input: { url: string; folder?: string }) {
      return request<{ feed: FeedSummary; imported: number; skipped: number }>('/api/feeds', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },
    update(input: { url: string; title?: string; folder?: string | null }) {
      return request<{ ok: boolean }>('/api/feeds', {
        method: 'PATCH',
        body: JSON.stringify(input),
      })
    },
    remove(url: string) {
      return request<{ ok: boolean }>(`/api/feeds?url=${encodeURIComponent(url)}`, {
        method: 'DELETE',
      })
    },
    /** 拉取新条目。带 url 更新一个、不带则全部更新（串行，见服务端注释） */
    refresh(url?: string) {
      return request<{ items: FeedRefreshResult[] }>('/api/feeds/refresh', {
        method: 'POST',
        body: JSON.stringify(url ? { url } : {}),
      })
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
   * 那是一个真实的动作，不是「清空输入框」的副作用（.trellis/spec/project/architecture.md §7.5）。
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
   * 而且 S3 的写是按请求计费的（同 .trellis/spec/project/architecture.md §7.8 对模型探测的判断）。
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
   * （.trellis/spec/project/architecture.md §7.8）。
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
   * 拉取一个供应商的模型清单。**纯读**：结果不写配置，进表单草稿（D-080）。
   *
   * 密钥的三种来源由服务端按序解析（新填的草稿 > 已存实例）。
   * 所以新建时也能拉——传刚填进表单的地址与密钥即可。
   */
  fetchModels(input: { providerId: string | null; baseUrl: string; apiKeyDraft: string | null }) {
    return request<FetchedModelsResult>('/api/config/fetch-models', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  /**
   * 用量统计（`.trellis/spec/project/architecture.md` §12）。
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
   * 某个会话最近一次模型调用的记账——对话页「上下文容量」chip 的数据源。
   * promptTokens 是那次请求真正发给模型的完整上下文——比字符估算真。
   * 没有记账（新会话还没发过、或供应商没回传）返回 null。
   */
  conversationContext(id: string) {
    return request<{
      promptTokens: number | null
      completionTokens: number | null
      totalTokens: number | null
      model: string
      at: string
    } | null>(`/api/stats/conversation/${encodeURIComponent(id)}`)
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

      const doFetch = transport.fetchImpl ?? fetch
      const res = await doFetch(`${transport.baseUrl ?? appBasePath}/api/avatar`, {
        method: 'POST',
        credentials: 'include',
        body,
        headers: { ...transport.headers },
      })

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

      const uploaded = parsed as { image: string; mime: string; bytes: number }
      return { ...uploaded, image: serverAssetPath(uploaded.image) ?? uploaded.image }
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
      return request<{ success: boolean }>('/api/auth/sign-out', {
        method: 'POST',
        body: '{}',
      })
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
      await request<{ success: boolean }>('/api/auth/sign-out', {
        method: 'POST',
        body: '{}',
      })
      // 整页重载会清掉内存里的一切（查询缓存、草稿、历史）
      window.location.href = appPath('/login')
    },
    /** 未登录时返回 null，而不是抛错——它用于路由守卫判断 */
    async session() {
      try {
        const session = await request<AuthSession>('/api/auth/get-session')
        return {
          ...session,
          user: { ...session.user, image: serverAssetPath(session.user.image) },
        }
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) return null
        throw error
      }
    },
    /**
     * 改名称。**走 Better Auth 自带的端点**，不在 `/api/` 下再包一层——
     * 包一层等于把校验规则复制到两处，而会话校验、字段白名单都在
     * Better Auth 里（`.trellis/spec/project/architecture.md` §12.6）。
     *
     * 本地模式下用不了它（那条路径要求一个真实会话，而本地模式靠宿主
     * 注入的本机令牌进入）——那种情况下走下面的 `api.local`。
     */
    updateUser(input: { name: string }) {
      return request<{ status: boolean }>('/api/auth/update-user', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },
  },

  /**
   * 本地模式专有（D-100）。
   *
   * 「要不要显示这一组能力」由服务端说了算（`RuntimeConfig.localMode`），
   * 界面不猜——猜错的两种表现都是坏界面：在本地模式里显示一个点了必然
   * 失败的「登出」，或在云端模式里把账号那块拆掉。
   */
  local: {
    /** 改本机用户的名称。语义与 `auth.updateUser({ name })` 相同，入口不同 */
    updateProfile(input: { name: string }) {
      return request<{ name: string }>('/api/local/profile', {
        method: 'PATCH',
        body: JSON.stringify(input),
      })
    },
  },
}

export type Api = typeof api
