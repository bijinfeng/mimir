import type { ChatIo } from '@mimir/chat'
import { api } from './api'
import { prepareDocxMedia, preparePptxVideo } from './docx-media'
import { mediaImageData, officeImageData } from './docx-image'

/**
 * `@mimir/chat` 的宿主侧动作实现（`ChatIo`）。
 *
 * ## 这一层为什么在宿主
 *
 * 对话包不知道 API 客户端长什么样、query 缓存的键叫什么、路由怎么跳——
 * 那些是**这个应用**的知识。与 `packages/office` 的 `EditorIo`
 * （取字节 / 写回）同一条边界：**壳与渲染归包，方言与取写归宿主**
 * （`.trellis/spec/office/engine/index.md` 的「宿主 / 包边界」）。好处是结构性的：
 * 包内 import 不到 `api.ts` / router / queryClient。
 *
 * ## 用工厂而不是常量对象
 *
 * 因为 `onConversationCreated` 与 `onTurnSettled` 要接宿主的状态与路由，
 * 而那些只有在 React 组件里拿得到（`useNavigate` / `useState`）。
 * 工厂由宿主组件调用一次，得到一个实现对象。
 *
 * ## 三个 invalidate 在这里
 *
 * 旧实现里它们是散在 `use-mimir-chat.ts` 的四处的（onFinish 三个、
 * onError 一个、stop 一个），而**每一处的理由都写在那一处**。现在收成
 * 一个 `onTurnSettled`——「这一轮落定了」是同一个事实，四处分别失效
 * 才是那四段注释要防的重复。
 */
export interface ChatIoDeps {
  /**
   * 宿主手上有 queryClient 的部分。
   *
   * 用最小接口而不是 `QueryClient` 类型：包与桥都只调这一个方法，
   * 收窄之后测试可以传一个假对象（不需要真的 QueryClient）。
   */
  invalidate: (keys: unknown[][]) => void
  /** 新会话建出来了：换 URL + 记账（自己建的会话不重挂载对话体） */
  onConversationCreated: (id: string) => void
  /** 「管理模型」菜单项的去处（宿主用它的 router） */
  onManageModels: () => void
  onOpenDocument?: (documentId: string) => void
}

/** 一轮落定之后要失效的键。写在一处，四处调用点共用同一份 */
export const SETTLED_KEYS: readonly (readonly unknown[])[] = [['conversations'], ['documents']]

export function createChatIo({
  invalidate,
  onConversationCreated,
  onManageModels,
  onOpenDocument,
}: ChatIoDeps): ChatIo {
  return {
    async createConversation() {
      return api.conversations.create()
    },

    async loadConversation(id) {
      const detail = await api.conversations.get(id)
      return { messages: detail.messages }
    },

    onConversationCreated,

    onTurnSettled(id) {
      /* 三个键各自防一件事：
         - ['conversations']：左栏列表（新建的会话要出现）
         - ['conversation', id]：记录详情（助手消息落库了，缓存是旧的）
         - ['documents']：新内容入库 → 文档列表的计数/时间变了
         停止与失败也要调：会话落库发生在服务端处理的开头，与流的好坏死活
         无关（旧实现同一条注释）。 */
      /* 逐个 invalidation 而不是拼一个大数组：`[...keys, …]` 那种写法会
         命中 `oxc(no-map-spread)`（每次迭代多分配一份），而这里的量级
         （三条）不值得为它写一段更绕的代码 */
      for (const key of SETTLED_KEYS) invalidate([[...key]])
      if (id !== undefined) invalidate([['conversation', id]])
    },

    async saveAsNote(conversationId) {
      /**
       * **现取落库记录**，按「最后一条助手消息」对齐。
       *
       * 不能按界面消息的 id 找：引擎会把客户端的乐观 id 换成服务端 id，
       * 而服务端按 messageId 幂等（重复点击返回同一篇笔记）。
       * 这段逻辑原在 `AnswerActionsRow.tsx` 里，搬到这里是因为它需要
       * queryClient（包没有）。
       */
      const conversation = await api.conversations.get(conversationId)
      const lastAssistant = conversation.messages
        .toReversed()
        .find((item) => item.role === 'assistant')
      if (!lastAssistant) throw new Error('没有可保存的回答')
      const result = await api.conversations.saveAsNote({ messageId: lastAssistant.id })
      // 存成笔记会在消息里记一条 ref，回读一次让界面拿到
      invalidate([['conversation', conversationId]])
      return { noteId: result.noteId }
    },

    onManageModels,
    onOpenDocument,
    async cancelDocxAgentRun(conversationId, runId) {
      await api.conversations.cancelDocumentAgentRun(conversationId, runId)
      invalidate([['conversation', conversationId]])
    },
    async generateDocxImage(documentId, prompt, signal, aspectRatio) {
      return officeImageData(
        await api.conversations.generateDocxImage(documentId, prompt, signal, aspectRatio),
        signal,
      )
    },
    async fetchDocxImage(documentId, url, signal) {
      return officeImageData(
        await api.conversations.fetchDocxImage(documentId, url, signal),
        signal,
      )
    },
    writeDocxDocument(input, signal, onDelta) {
      return api.conversations.writeDocxDocument(input, signal, onDelta)
    },
    async analyzeDocxMedia(input, signal) {
      let media: { mimeType: string; data: string }[]
      let audio: { mimeType: string; data: string } | undefined
      if (input.source instanceof File) {
        if (input.kind === 'video' && input.includeAudio !== undefined) {
          const prepared = await preparePptxVideo(input.source, input.includeAudio, signal)
          media = prepared.media
          audio = prepared.audio
        } else media = await prepareDocxMedia(input.source, input.kind, signal)
      } else {
        const image = await mediaImageData(input.source, signal)
        if (!image.dataUrl.startsWith(`data:${image.mimeType};base64,`))
          throw new Error('文档图片数据无效')
        media = [{ mimeType: image.mimeType, data: image.dataUrl.split(',')[1] ?? '' }]
      }
      if (signal.aborted) throw new Error('媒体分析已停止')
      return api.conversations.analyzeDocxMedia(
        {
          documentId: input.documentId,
          instruction: input.instruction,
          kind: input.kind,
          media,
          ...(audio ? { audio } : {}),
        },
        signal,
      )
    },
    async createDocxDocument(input, signal) {
      const created = await api.conversations.createDocxDocument(input, signal)
      invalidate([['documents']])
      return created
    },
  }
}
