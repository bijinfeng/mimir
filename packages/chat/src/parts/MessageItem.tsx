import { MessagePrimitive, useAuiState } from '@assistant-ui/react'
import { SEARCH_ONLY_RESULT_TEXT } from '@mimir/shared'
import type { ComponentType, ReactNode } from 'react'
import { useChatPanelStyles } from '../ChatPanel.style.js'
import { askOptionsFor, questionBefore, useMimirChatApi } from '../runtime/chat-context.js'
import { AnswerActions } from './AnswerActions.js'
import { CitationList } from './CitationList.js'
import { DocxAgentHistoryNotice } from './DocxAgentHistoryNotice.js'
import { FailureCard, StreamErrorCard } from './FailureNotice.js'
import { MarkdownPart } from './MarkdownPart.js'
import { AudioPart, FilePart, ImagePart, SourcePart } from './MediaParts.js'
import { ReasoningPart } from './ReasoningPart.js'
import { ToolCallPart } from './ToolCallPart.js'
import { StoppedNotice } from './StoppedNotice.js'
import { TraceDisclosure } from './TraceActivity.js'
import { useCitationsPart, useDocxAgentPart, useFailurePart, useTracePart } from './data-parts.js'

/**
 * 消息根：一条消息的骨架。
 *
 * ## 顺序是**显式**的，不靠 parts 顺序
 *
 * ```
 * 检索过程（回答的依据，PRD §5.6）
 * 正文（Markdown）
 * 引用块（回答的出处，PRD §5.2）
 * 失败卡 / 连接中断
 * 已停止那一行
 * 动作条（常驻但不占视觉重量）
 * ```
 *
 * 为什么不让 parts 顺序说了算：服务端**先发**检索过程与引用、**后发**正文
 * （那是有意的——引用与过程要让用户立刻看到，不要对着空白等模型），
 * 所以 parts 的顺序是 `trace → citations → 正文`，而设计要的版式是
 * 「过程在上、引用在下」。见 `data-parts.ts` 里那一节（还有为什么不用
 * flex + order 重排：那会取消正文的段间距折叠，是一次看不见的排版改动）。
 *
 * ## 消息形态
 *
 * 1. 用户消息右对齐、使用浅色气泡；助手回答以 mimir 名称引出正文。
 * 2. **一条 part 都没有的助手消息不渲染**。停止生成或流一开始就断掉时，
 *    引擎会留下 `[user, assistant(0 parts)]`（实测：一个字都没到时就是这个
 *    形状），而空盒子仍然占着 `thread` 的 `gap: 20px`——用户看到的是
 *    「提问下面莫名多出一段空白」，看起来像空气泡
 *
 * ## 动作条只出现在最后一条
 *
 * `s.message.isLast`——不是「最后一条助手消息」而是「消息列的最后一条」。
 * 追问已发、回答未到时最后一条是用户消息，上一轮的动作条因此自然撤掉
 * （那是旧实现里 `round.visible` 要判的三件事之一）。
 */
export function MessageItem() {
  const role = useAuiState((state) => state.message.role)
  if (role === 'user') return <UserMessage />
  return <AssistantMessage />
}

function UserMessage() {
  return (
    <MessagePrimitive.Root data-role="user">
      <MessagePrimitive.Parts
        components={{
          /* 用户消息的文本：自己打的字不需要流式光标那种装饰，
             也不需要 markdown（用户写什么就显示什么） */
          Text: UserText,
          /* 附件（将来带图/文件提问时会出现；同样不许静默丢弃） */
          File: FilePart,
          Image: ImagePart,
        }}
      />
    </MessagePrimitive.Root>
  )
}

function UserText() {
  const text = useAuiState((state) => (state.part.type === 'text' ? state.part.text : ''))
  return <div>{text}</div>
}

function AssistantMessage() {
  const { styles } = useChatPanelStyles()
  const api = useMimirChatApi()
  const trace = useTracePart()
  const citations = useCitationsPart()
  const failure = useFailurePart()
  const docxAgent = useDocxAgentPart()
  const parts = useAuiState((state) => state.message.parts.length)
  const searchOnly = useAuiState((state) =>
    state.message.parts.some(
      (part) => part.type === 'text' && part.text === SEARCH_ONLY_RESULT_TEXT,
    ),
  )
  /**
   * 消息状态**取整个对象**，不是 `.type`：停止与失败都是 `incomplete`，
   * 区分靠 `reason`（`cancelled` 才是用户按了停止；`error` 是流断了，
   * 由失败卡/连接中断卡交代）。取对象本身是安全的——它在 store 里是同一个
   * 不可变引用；在 selector 里拼 `{ type, reason }` 字面量会让
   * useSyncExternalStore 误判变化（实测：无限渲染、整页白屏）。
   */
  const status = useAuiState((state) => state.message.status)
  const isLast = useAuiState((state) => state.message.isLast)
  const isRunning = useAuiState((state) => state.thread.isRunning)
  /** 这条消息在消息列里的位置（失败卡要按它回溯「上一问」） */
  const index = useAuiState((state) => state.message.index)
  const threadMessages = useAuiState((state) => state.thread.messages)

  /**
   * 「这一轮还在跑」= 这条消息的状态是 running，或整条 thread 在跑且它是最后一条。
   *
   * 后者兜住「检索刚开始、正文一个字都还没到」的那一刻：那时消息已经存在
   * （服务端的 trace 事件让它出现，实测 `user/text, assistant/data+data`），
   * 而它的状态在引擎眼里已经不再是 running 了吗？——不，它在跑。
   * 两个判据取或，是因为不同阶段下哪一个先亮不完全一致。
   */
  const running = status?.type === 'running' || (isRunning && isLast)

  /**
   * 0 part 的助手消息。
   *
   * 平时**不渲染**（见文件头第 3 条）：停止生成或流一开始就断掉时，
   * 引擎会留下这样一条空消息，而空盒子仍然占着 `thread` 的 `gap: 20px`
   * ——用户看到的是「提问下面莫名多出一段空白」。
   *
   * 但**还在跑的时候**它正是「正在检索知识库 · Ns」该出现的位置：
   * 消息在 `composer.send()` 那一刻就已经存在（乐观占位），而第一个
   * part 要到服务端发来事件才有。这段窗口（几十毫秒到几秒）里如果
   * 什么都不显示，用户对着一个按了发送却没反应的界面——而那正是
   * 他刚做完一个动作、最需要反馈的时候。
   *
   * 所以这一支不是「空消息渲染成空盒子」，而是「空消息在跑的时候
   * 是那条检索过程行的载体」。
   */
  if (parts === 0) {
    if (!running || !isLast) return null
    return (
      <MessagePrimitive.Root data-role="assistant">
        <TraceDisclosure trace={null} live expanded />
      </MessagePrimitive.Root>
    )
  }

  return (
    <MessagePrimitive.Root data-role="assistant">
      <div className={styles.assistantHeading}>
        <span>mimir</span>
      </div>
      {/* 检索过程行。干活时（running）无条件在——检索结果没到时它是
          「正在检索知识库 · Ns」，到了就地展开成步骤。
          `expanded` 跟着 `running`：正文一出翻 false → 自动折叠
          （折叠摘要里秒数继续走，那是服务端那条整轮 trace 补上的） */}
      <TraceDisclosure trace={trace} live={running} expanded={running} searchOnly={searchOnly} />

      <MessagePrimitive.Parts
        components={{
          Text: AssistantText,
          /* data part 由上面的三个读取口显式渲染（顺序见文件头），
             这里跳过它们 */
          data: { Fallback: NoPart },
          /* —— AG-UI 的其余消息体类型（每一种都按官方件渲染，D-099）——
             引擎的平台默认组件是 `() => null`：不挂这些槽位，对应类型的
             part 会**静默消失**（模型思考、工具调用、来源、附件）。
             Reasoning 与检索过程共用官方 Reasoning 外壳（两张皮同一件） */
          Reasoning: ReasoningPart,
          Source: SourcePart,
          File: FilePart,
          Image: ImagePart,
          /* audio 是引擎里已废弃的类型（提示经 File 槽），但类型在就接线
             ——漏掉的表现同样是「静默消失」 */
          Unstable_Audio: AudioPart,
          /* 工具调用没有注册表（mimir 服务端今天不产 TOOL_CALL_*，将来
             子代理 / MCP 才会），一律走官方 ToolFallback 的换算 */
          tools: { Fallback: ToolCallPart },
        }}
      />

      {docxAgent && <DocxAgentHistoryNotice agent={docxAgent} />}

      <CitationList citations={citations} onOpen={api.onOpenCitation} />

      {/* 失败卡与「连接中断」互斥：有 `mimir.failure` part 说明服务端已经
          分过类（PRD §5.8 的四类出路），否则才是真·中断 */}
      {failure !== null ? (
        <FailureCard
          failure={failure.kind}
          detail={failure.detail}
          deepReasoningKnown={api.sentHere}
          onSearchOnly={() => {
            const question = questionBefore(threadMessages, index - 1)
            if (question) api.ask(question, askOptionsFor(failure.kind, null))
          }}
          onRetry={() => {
            const question = questionBefore(threadMessages, index - 1)
            if (question) api.ask(question)
          }}
        />
      ) : (
        <MessagePrimitive.Error>
          <StreamErrorLine />
        </MessagePrimitive.Error>
      )}

      {/* 「已停止生成」：**只有用户按了停止才显示**——`incomplete` 被停止与
          失败共用，停止是 `reason: 'cancelled'`，失败是 `reason: 'error'`
          （那一支由上面的失败卡交代）。只看 `incomplete` 会把这一行挂到
          失败卡下面：界面同时说「请求超时」与「已停止生成」，互相打架
          （实测踩过） */}
      {status?.type === 'incomplete' && status.reason === 'cancelled' ? <StoppedNotice /> : null}

      {/* 动作条（存成笔记 / 复制）**与失败互斥**（旧实现的决定，PRD §5.7/
          §5.8）：失败轮的正文是错误原文，存成笔记会把一句 400 存进知识库、
          复制也只会复制报错——那时用户要的是出路，不是沉淀。有
          `mimir.failure` part（或状态是 incomplete/error）都不给 */}
      {isLast &&
      failure === null &&
      status?.type !== 'incomplete' &&
      docxAgent?.status !== 'pending' &&
      docxAgent?.status !== 'cancelled' &&
      docxAgent?.status !== 'failed' ? (
        <AnswerActions />
      ) : null}
    </MessagePrimitive.Root>
  )
}

function AssistantText() {
  const text = useAuiState((state) => (state.part.type === 'text' ? state.part.text : ''))
  return <MarkdownPart text={text} />
}

/** 显式渲染之外的一切 part 都不渲染（引用卡与检索过程已单独渲染） */
const NoPart = () => null

/**
 * 连接中断卡。
 *
 * 它是 `MessagePrimitive.Error` 的 children——错误态是消息状态的一部分
 * （`incomplete` + `reason: 'error'`），不是外挂的一行。`role="alert"`
 * 由这张卡自己带（见 `FailureNotice.tsx`）。
 */
function StreamErrorLine(): ReactNode {
  const api = useMimirChatApi()
  const detail = useAuiState((state) => {
    const status = state.message.status
    if (status?.type !== 'incomplete') return null
    if (status.error instanceof Error) return status.error.message
    if (status.reason === 'error') return '连接中断'
    return null
  })
  const question = useAuiState((state) => {
    let text = ''
    for (let i = state.message.index - 1; i >= 0; i -= 1) {
      const message = state.thread.messages[i]
      if (message?.role !== 'user') continue
      for (const part of message.parts) {
        if (part.type === 'text' && typeof part.text === 'string') text += part.text
      }
      break
    }
    return text
  })

  if (detail === null) return null
  return (
    <StreamErrorCard
      detail={detail}
      onRetry={() => {
        if (question) api.ask(question)
      }}
      onRefill={() => {
        if (question) api.refill(question)
      }}
    />
  )
}

/** 消息部件的组件表。提到模块级：每次渲染新建对象会让引擎那层
    记忆化判断失效（等于每次都重挂载整棵消息子树） */
export const MESSAGE_COMPONENTS: { Message: ComponentType } = {
  Message: MessageItem,
}
