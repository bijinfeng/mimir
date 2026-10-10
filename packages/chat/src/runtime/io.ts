import type { Message } from '@mimir/shared'

/**
 * 宿主注入的**动作**面（对话包 → 宿主）。
 *
 * ## 为什么是注入而不是 import
 *
 * 这个包不知道宿主是哪一个应用（主视图的三栏页、文档页的侧栏，将来可能还有
 * 别的地方），也不知道 API 客户端长什么样、路由怎么跳、query 缓存叫什么键。
 * 这些都由宿主以接口的形式注入——与 `@mimir/office` 的 `EditorIo`
 * （取字节 / 写回）是同一条边界：**壳与渲染归包，方言与取写归宿主**
 * （.trellis/spec/office/engine/index.md 的「宿主 / 包边界」一节）。
 *
 * 好处是结构性的：包内 **import 不到**宿主的 `api.ts` / `router` /
 * `queryClient`，所以「顺手在包里发个请求」在模块解析层面就不可能，
 * 而不是靠人记得别这么做。
 *
 * ## 全都是 async 或 void
 *
 * 没有一个是「返回 Promise 让包自己 await 之后再渲染」——包不持有宿主的
 * 状态，它只调动作、并把结果用在自己那一处（新建会话拿到的 id、
 * 存笔记拿到的 noteId）。宿主的状态刷新走 `onTurnSettled` 这种通知式回调。
 */
export interface ChatIo {
  /**
   * 建一个新会话，返回它的 id。
   *
   * 服务端本来也会在「没有会话 id」时自己建一个（`assistant-stream.ts` 的
   * `createConversation`），但那样 URL 上要等流回来才知道 id。前端先建的好处是
   * 会话一出现就能寻址（刷新、分享链接不丢上下文）——这也是 D-098 里
   * `creating` 那个补丁存在的原因，现在它落在 `onRunInitialized` 里
   * （见 `runtime/use-mimir-runtime.ts`）。
   */
  createConversation(): Promise<{ id: string }>
  /**
   * 取一个会话的落库消息（历史灌入用）。
   *
   * 返回 `null` 表示这个会话不存在——此时**不能**当成空会话放行，
   * 由宿主决定怎么报（主视图是 `LoadError` 那一份）。
   */
  loadConversation(id: string): Promise<{ messages: Message[] } | null>
  /**
   * 新会话建出来了。宿主在这里换 URL / 记下「这是自己建的」。
   *
   * 主视图的实现是 `setOwnedId(id)` + `navigate(/chat?id=…)`：自己建的会话
   * **不重挂载**对话体，否则正在接收的流会被丢掉（见 `_app.chat.tsx` 的说明）。
   */
  onConversationCreated(id: string): void
  /**
   * 这一轮落定了（成功 / 失败 / 停止）。
   *
   * 宿主用它让 `['conversations']` / `['conversation', id]` / `['documents']`
   * 失效——助手消息已经落库，左栏与记录详情要跟着变。
   *
   * **停止与失败也要调**：`onFinish` 在停止时不触发（SDK 只 abort 本地请求），
   * 而会话落库发生在服务端处理的开头，与流的好坏死活无关。
   * `id` 在「新会话还没建出来就失败」时是 undefined。
   */
  onTurnSettled(id: string | undefined): void
  /**
   * 把这一轮的回答存成笔记（PRD §5.7 的闭环）。
   *
   * **取哪一条由宿主决定**：服务端按「最后一条助手消息」存（按 messageId
   * 幂等），而「最后一条」得从落库记录里读——界面上的消息 id 是客户端生成的、
   * 与服务端不同（AG-UI 的 optimistic → server id 重指派）。
   * 所以这个动作留在宿主（它手上有 queryClient），包只负责「点了」。
   */
  saveAsNote(conversationId: string): Promise<{ noteId: string }>
  /** 「管理模型」菜单项。宿主决定去哪（主视图是 /settings 的 models 分区） */
  onManageModels(): void
  /**
   * 流式问答的地址。默认 `DEFAULT_CHAT_URL`（`/api/chat`）。
   *
   * 它是**固定**的：会话 id 走请求体（`forwardedProps`），不进 URL——
   * 地址一变，AG-UI 的 agent 就要重建，而重建会切断正在进行的流
   * （这条与旧的 `useChat` 同源，是协议客户端的性质，不是某一版的实现细节）。
   */
  chatUrl?: string
}

/**
 * `chatUrl` 的默认值。
 *
 * 导出它是为了宿主侧能引用同一个字符串——两处各写一份 `/api/chat` 的
 * 症状是「改了服务端路由、前端还指着旧的」，而那种错误只在运行时出现。
 */
export const DEFAULT_CHAT_URL = '/api/chat'
