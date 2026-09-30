import type { Citation, FailureKind, Message, Trace } from '@mimir/shared'
import type { UIMessage } from '@tanstack/ai-react'
import { CitationCards } from '@/components/chat/CitationCards'
import { AnswerActionsRow } from '@/components/chat/AnswerActionsRow'
import { FailureCard, StreamErrorCard } from '@/components/chat/FailureCard'

/**
 * 「本轮的结果」：检索过程、引用、失败卡片，以及回答下面的动作行。
 *
 * 它们都**不是消息里的片段**（`lib/chat-ui.tsx` 因此不把它们注册成 part
 * 渲染器），而是按轮次对齐的一组信息：由 ChatPanel 在消息列表之外渲染，
 * 位置更可控（引用要横跨整列，见 `docs/PRD.md` §5.2）。
 *
 * ## 为什么单独一个文件
 *
 * ChatPanel 加「停止 / 状态行 / 回到底部」之前已经 536 行，超过
 * `apps/web/AGENTS.md` 说的 300 行。这一块是其中最大的一个**独立关注点**：
 * 它的全部内容就是「这一组结果该不该显示、显示的是哪一份」。搬出来之后
 * 对齐逻辑与它的理由在同一个文件里，ChatPanel 只剩下布局。
 */

/**
 * 落库消息里的检索过程、引用与失败。
 *
 * **历史会话也必须能看到这三个**——它们不是「刚才读了什么」的实时状态，
 * 而是**这条回答的依据**，和回答本身一样是内容的一部分。
 *
 * 曾经只渲染实时事件推来的那一份，于是打开历史会话时：中栏显示
 * 「本次引用 2 个来源」，右栏却既没有检索过程也没有引用块——两栏说的
 * 不是同一件事。而库里明明存着它们（`messages.trace` / `messages.citations`
 * / `messages.failure`），只是渲染层没用。
 *
 * ## 为什么按**位置**取而不是按 id
 *
 * `useChat` 会把传进去的 `initialMessages` 重新规范化，**消息 id 会被
 * 重新生成**（`normalizeToUIMessage(message, generateMessageId)`）。
 * 所以按 id 去查落库记录永远查不到——实测症状就是「代码明明写了，
 * 界面上什么都不显示」。
 *
 * 按「最后一条助手消息是第几条」对齐则稳定：两边的顺序都由服务端
 * 的写入顺序决定，不会因为 id 重生成而错位。
 */
function resolveRound({
  messages,
  initialMessages,
  trace,
  citations,
  failure,
}: {
  messages: UIMessage[]
  initialMessages?: Message[] | undefined
  trace: Trace | null
  citations: Citation[]
  failure: { kind: FailureKind; message: string } | null
}) {
  const storedAssistant = (initialMessages ?? []).findLast((item) => item.role === 'assistant')

  /**
   * 载入的那一轮还在不在渲染范围内。
   *
   * `chat.messages` 在灌入 `initialMessages` 之后**只由发送追加**，所以
   * 长度与载入时相等就说明用户还没发过新消息——落库的 trace / 引用 / 失败
   * 仍然属于当前显示的这一轮。
   *
   * 少了这一条会错在「发过新消息之后」：那时 `storedAssistant` 指的是
   * **上一轮**的回答，而它的失败卡片会挂在新回答下面（发一次成功的提问，
   * 却在回答下面看到上一轮的「模型额度用尽」）。
   */
  const showingLoadedRound = messages.length === (initialMessages?.length ?? 0)

  /**
   * 当前该显示哪一份检索过程、引用与失败。
   *
   * 实时那份（事件推来的）属于**最后一条助手消息**；历史消息用落库的。
   * 两者取其一而不是叠加，因为它们描述的是同一件事。
   *
   * 失败卡片原先只认实时那份，于是**打开历史会话时它完全不渲染**：
   * 库里存着「这条回答失败过、原因是什么」，界面却是一片空白，
   * 用户看不到额度用尽，也拿不到那三条出路（PRD §5.8）。
   */
  const activeTrace = trace ?? (showingLoadedRound ? (storedAssistant?.trace ?? null) : null)
  const activeCitations =
    citations.length > 0 ? citations : showingLoadedRound ? (storedAssistant?.citations ?? []) : []
  const activeFailure =
    failure?.kind ?? (showingLoadedRound ? (storedAssistant?.failure ?? null) : null)

  /**
   * 这一轮的结果现在该不该渲染。
   *
   * 两个条件的含义不同：
   *
   *  - **实时那份**只在最后一条不是用户消息时有意义。用户消息是新一轮的
   *    开端，它下面挂的块属于上一轮，看起来却像这一轮的检索过程
   *  - **落库那份**在最后一条是用户消息时**同样有效**——那正是「追问过、
   *    还没答」的历史会话：库里存着上一条回答的引用与检索过程，
   *    不该整组消失。原先只判 `lastRole !== 'user'`，于是这种会话里
   *    引用块和「存成笔记 / 复制」一个都不显示（PRD §5.2 说引用是回答的
   *    一部分，§5.7 说结论要能沉淀下来）
   */
  const visible =
    messages.at(-1)?.role !== 'user' || (showingLoadedRound && storedAssistant !== undefined)

  /** 最后一条助手回答的纯文本（复制动作用） */
  const answerText =
    messages
      .findLast((item) => item.role === 'assistant')
      ?.parts.map((part) => (part.type === 'text' ? part.content : ''))
      .join('') ?? ''

  return {
    trace: activeTrace,
    citations: activeCitations,
    failure: activeFailure,
    /** 落库只存分类、没有原始错误文本，所以 detail 只在实时那份存在时给 */
    failureDetail: failure?.message,
    visible,
    showingLoadedRound,
    answerText,
  }
}

export type ResolvedRound = ReturnType<typeof resolveRound>

export { resolveRound }

/**
 * 本轮问题的纯文本：重试要重发**上一个问题**，而不是发「重试」这两个字。
 *
 * 从 UIMessage 的 text part 里取——它没有直接的 `text` 字段，消息内容是
 * parts 数组。它是**历史轮**的兜底：本轮发出的文本由 ChatPanel 在发送时
 * 记下（那份还带着当时的「深度思考」开关，库里没存）。
 */
export function lastQuestionOf(
  messages: { role: string; parts: { type: string; content?: unknown }[] }[],
): string | undefined {
  const lastUser = messages.findLast((item) => item.role === 'user')
  if (!lastUser) return undefined

  return lastUser.parts
    .filter((part) => part.type === 'text')
    .map((part) => (typeof part.content === 'string' ? part.content : ''))
    .join('')
}

/**
 * 本轮结果块（检索过程在 ChatPanel 里、回答上方，不在这里）。
 *
 * ## 三个渲染门控，各自防一件具体的事
 *
 *  1. **`visible`** —— 见 `resolveRound`
 *  2. **`stopped`** —— 停止生成之后**不给动作条**。停止只 abort 本地请求
 *     （SDK 不发任何服务端消息），落库只在服务端 for-await 正常走完之后
 *     发生，所以这一轮在库里没有 assistant 行；而「存成笔记」取的是
 *     **库里最后一条 assistant**——它会安静地把上一轮的答案存下来并提示
 *     「已存为笔记」。宁可少一个按钮，也不许它说谎
 *  3. **`answerText` 非空** —— 同一个道理的通用版：流一开始就断掉时
 *     `useChat` 会留下 `[user, assistant(0 parts)]`，按位置算本轮结果是
 *     成立的，但下面挂「复制」（复制空串）与「存成笔记」（存上一轮）都是错的
 *
 * 失败卡片与引用块**互斥**：有失败时渲染它而**不是**引用与重试入口——
 * 因为此时用户需要的不是「再试一次」，而是「这次花没花钱、内容丢没丢、
 * 换个做法有没有用」（PRD §5.8）。
 */
export function RoundResult({
  round,
  stopped,
  activeId,
  streamError,
  onOpenCitation,
  onOpenNote,
  onRetry,
  onSearchOnly,
  onRefill,
  retryDeepReasoningKnown,
}: {
  round: ResolvedRound
  /** 这一轮被用户手动停止过 */
  stopped: boolean
  activeId: string | undefined
  /** 流中断的原始错误文本。有值时在引用之后补一张「连接中断」卡 */
  streamError: string | null
  onOpenCitation: (documentId: string, citation: Citation) => void
  onOpenNote: (noteId: string) => void
  onRetry: () => void
  onSearchOnly: () => void
  onRefill: () => void
  retryDeepReasoningKnown: boolean
}) {
  const hasAnswer = round.answerText.trim().length > 0

  return (
    <>
      {round.failure ? (
        <FailureCard
          failure={round.failure}
          detail={round.failureDetail}
          deepReasoningKnown={retryDeepReasoningKnown}
          onSearchOnly={onSearchOnly}
          onRetry={onRetry}
        />
      ) : (
        round.visible && (
          <>
            <CitationCards citations={round.citations} onOpen={onOpenCitation} />
            {!stopped && hasAnswer && (
              <AnswerActionsRow
                activeId={activeId}
                answerText={round.answerText}
                onOpenNote={onOpenNote}
              />
            )}
          </>
        )
      )}

      {/* 流中断：`chat.failure` 有值时交给 FailureCard（服务端已经分过类，
          同一件事说两遍只会更糊——见 StreamErrorCard 的说明） */}
      {streamError !== null && round.failure === null && (
        <StreamErrorCard detail={streamError} onRetry={onRetry} onRefill={onRefill} />
      )}
    </>
  )
}
