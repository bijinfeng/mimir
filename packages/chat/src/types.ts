import type { Citation } from '@mimir/shared'
import type { ReactNode } from 'react'

/**
 * 这个包的公开类型面。
 *
 * 放在单独一个文件里是为了断开环：`ChatPanel.tsx` 要 import 各部件，
 * 而各部件要 import `ChatDraft`——类型从中间那一层出去，谁都不需要
 * import 面板本身。
 */

/**
 * 从宿主带进来的「这一问的上下文」（瞬时状态，不进 URL）。
 *
 * 与宿主的 `AskDraft` 同形但**不是同一个类型**：包不 import 宿主的模块，
 * 宿主在渲染前做一次映射（多一个字段就多一行，比一条隐式耦合便宜）。
 *
 * - `text`：预填进输入框（命令面板的「问 AI」带过来的问题、
 *   文档里「就这段提问」带过来的那段话）
 * - `documentId`：把这一轮的检索范围锁到某一篇
 */
export interface ChatDraft {
  text?: string
  documentId?: string
}

/** 输入区底栏要显示的那三个数据（由宿主的 useQuery 取，包只渲染） */
export interface ChatComposerStatus {
  documents: {
    items: { id: string; title: string }[]
    isLoading: boolean
    isError: boolean
    refetch: () => void
  }
  modelRoles: { chat?: string | undefined; reasoning?: string | undefined }
  usage: {
    model: string
    promptTokens: number | null
    completionTokens: number | null
    totalTokens: number | null
  } | null
}

export interface ChatPanelProps {
  /**
   * 会话 id。`undefined` = 新对话（第一问时由包调 `io.createConversation` 建）。
   *
   * 切换会话仍然由宿主用 `key` 重挂载控制——这不是遗留，是**契约**：
   * agent 的 threadId 与这一批消息在挂载时定下，而「自己刚建的会话不能重挂」
   * 是保流式的唯一办法（`routes/_app.chat.tsx` 的 `ownedId`）。
   */
  conversationId: string | undefined
  /** 这一问的上下文（预填 / 范围锁定）。瞬时状态，不进 URL */
  draft: ChatDraft | null
  /** 新建对话时直接把焦点放进提问框；文档侧栏保持原有焦点 */
  focusComposer?: boolean
  /** 引用卡片被点击 → 跳回原文 */
  onOpenCitation: (documentId: string, citation: Citation) => void
  /** 「打开笔记」（存成笔记之后） */
  onOpenNote: (noteId: string) => void
  /**
   * 空态的使用指南（**侧栏专用**，D-090）。
   *
   * 给出时布局换成「指南在上、输入框固定底部」——与语雀的阅读助手同形。
   * 主视图不传它：那边的空态是**居中舞台**（问候语与输入框成一组，
   * ChatGPT / Notion 的形态，用户拍板过）。两种形态各自服务一个场景：
   * 侧栏窄、是「辅助当前阅读」的工具，指南 + 底部输入更像助手面板。
   *
   * 传的是**渲染函数而不是节点**：指南里的建议问题要能一键发出去，
   * 而 `send` 只在这个包里。函数收下 `ask`，返回的仍是普通 JSX
   * （不是组件——那个坑见下面的 `no-unstable-nested-components` 红线）。
   *
   * **宿主必须传模块级函数**：写成 `guide={(ask) => <Foo/>}` 会让
   * `react(no-unstable-nested-components)` 判它是「渲染期定义组件」，
   * React Compiler 随即跳过**宿主**那个组件（`DocChatSidebar.tsx` 的
   * `renderGuide` / `renderQuickAsks` 是先例）。
   */
  guide?: ((ask: (question: string) => void) => ReactNode) | undefined
  /**
   * 输入框**正上方**那一排动作（侧栏的快捷提问胶囊，D-093）。
   *
   * 与 `guide` 分开是因为位置不同：指南占滚动区，而这一排要贴着输入框
   * ——「马上要用的动作」放在底部栏才顺手（语雀的阅读助手也是这个位置）。
   * 只在空态（指南模式）显示：对话一开始，那一排的使命就结束了。
   */
  guideActions?: ((ask: (question: string) => void) => ReactNode) | undefined
  /** 宿主注入的动作面。见 `runtime/io.ts` */
  io: ChatIo
  /** 输入区底栏的数据槽（宿主用 useQuery 取好传进来） */
  composerStatus: ChatComposerStatus
}

/** 与 `runtime/io.ts` 的 `ChatIo` 同一个类型，这里重导出给宿主写实现时用 */
import type { ChatIo } from './runtime/io.js'
export type { ChatIo }
