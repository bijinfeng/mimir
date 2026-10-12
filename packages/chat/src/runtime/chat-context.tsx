import type { Citation, FailureKind } from '@mimir/shared'
import { createContext, useContext } from 'react'

/**
 * 包内的对话动作面（**不是**给宿主的公开面）。
 *
 * 为什么需要它：失败卡上的「重试 / 只检索」、空态指南里的建议问题、
 * 快捷提问胶囊——它们都要「把一段文本作为新一轮发出去」，而它们身处
 * 组件树的不同深度（消息里、滚动区里、输入框上方）。一层层传回调会
 * 让每个部件都长出一串与自己无关的 prop。
 *
 * 它同时也把「重试」的实现收在一处：重试要**先把文本放回 composer 再送**，
 * 而不是直接把文本 append 给 thread——用 composer 那条路，服务端收到的
 * 消息与用户手打的完全一致（包括 runConfig 里那轮的检索范围）。
 */
export interface MimirChatApi {
  /** 当前会话 id（新建之后与宿主传进来的那个不同） */
  activeId: string | undefined
  /**
   * 引用卡片被点击（跳回原文）。宿主实现，包只负责把点击转出去。
   *
   * 放在这个 context 里而不是一路传 prop：点它的地方在消息内部
   * （`MessageItem` → `CitationList`），而消息列由引擎按组件表渲染，
   * 那条路径上塞不进 props。
   */
  onOpenCitation: (documentId: string, citation: Citation) => void
  /** 「打开笔记」（存成笔记之后） */
  onOpenNote: (noteId: string) => void
  onOpenDocument?: (documentId: string) => void
  cancelDocxAgentRun?: (runId: string) => Promise<void>
  docxDocumentId?: string
  /**
   * 把一条问题作为新一轮发出。
   *
   * 生成中调用会**排队**（与用户在输入框里按 Enter 是同一条路）——
   * 这是失败卡「重试」在生成中按下时的正确行为。
   *
   * 这一轮的参数 = **输入区当前的设置**（思考强度、范围）+ 这里给的覆盖。
   * 与旧实现的差异要说明白：从前「重试」用的是**原来那一轮记下的**
   * 思考强度；现在用输入区里那个可见的开关——用户看到什么就用什么，
   * 不需要相信一个看不见的历史值。
   */
  ask(question: string, options?: AskOptions): void
  /**
   * 把这一轮的回答存成笔记（PRD §5.7 的闭环）。
   *
   * 由宿主实现（它要现取落库记录、按「最后一条助手消息」对齐——
   * 界面消息的 id 与服务端的不同），包只负责「点了」。
   */
  saveAsNote(): Promise<{ noteId: string }>
  /** 停止当前这一轮。排队的那条会**还回输入框**（D-098 的语义） */
  stop(): void
  /**
   * 把文本放回输入框。
   *
   * 「放回输入框」在旧实现里是一个 nonce 重挂载的补丁（Composer 的文本在
   * 它自己的 state 里，只认挂载时的初值）。现在 composer 的文本归引擎管，
   * 这就是一条普通的 setText——那个补丁与它的三个调用点一并退役。
   */
  refill(text: string): void
  /**
   * 「这一轮的思考强度」是不是**这一块面板自己发过的**。
   *
   * 打开历史会话时，库里没有存那一轮的开关（`packages/shared/src/
   * conversations.ts` 的 messageSchema 只有 text / trace / citations /
   * failure），所以失败卡上要说清「重试按你现在的设置来」。
   * 面板自己发过至少一轮之后，输入区里那个开关就是用户自己设的，
   * 不必再解释。
   */
  sentHere: boolean
}

export interface AskOptions {
  /** 这一轮的检索范围（「+ 添加上下文」所选，或 draft 锁定） */
  documentId?: string | null
  /** 深入 = 用推理角色回答 */
  deepReasoning?: boolean
  /** 只检索不调模型（失败卡上的一条出路，PRD §5.8） */
  scope?: 'search'
}

const ChatContext = createContext<MimirChatApi | null>(null)

export function MimirChatProvider({
  api,
  children,
}: {
  api: MimirChatApi
  children: React.ReactNode
}) {
  return <ChatContext.Provider value={api}>{children}</ChatContext.Provider>
}

/**
 * 取对话动作面。
 *
 * **拿不到就抛**：这个 provider 只在这个包内部用，缺了说明有人把一个部件
 * 挂到了面板之外——那时静默降级（比如让「重试」什么都不做）会变成一个
 * 很难查的「按钮没反应」。
 */
export function useMimirChatApi(): MimirChatApi {
  const api = useContext(ChatContext)
  if (api === null) {
    throw new Error('对话部件必须挂在 <ChatPanel> 内部（MimirChatProvider 缺失）')
  }
  return api
}

/**
 * 失败卡的「重试 / 只检索」重发**哪个问题**。
 *
 * 取这条消息之前最近的一条用户消息——不取「全局最后一条用户消息」：
 * 历史会话里用户可能已经追问过，那时重试失败的那一轮会发错问题。
 *
 * 抽成函数是因为它是**跨消息**的查询（消息组件自己看不到别人），
 * 而失败卡渲染时正需要它。
 */
export function questionBefore(
  threadMessages: readonly { role: string; parts: readonly { type: string; text?: string }[] }[],
  index: number,
): string {
  for (let i = index; i >= 0; i -= 1) {
    const message = threadMessages[i]
    if (message?.role !== 'user') continue
    let text = ''
    for (const part of message.parts) {
      if (part.type === 'text' && typeof part.text === 'string') text += part.text
    }
    return text
  }
  return ''
}

/** 失败分类 → 重发时要带的选项（「只检索」是失败卡上的一条出路） */
export function askOptionsFor(failure: FailureKind, documentId: string | null): AskOptions {
  return failure === 'quota' || failure === 'offline'
    ? { documentId, scope: 'search' }
    : { documentId }
}
