import type { Citation, Message } from '@mimir/shared'
import { PauseCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { ChatEmptyState } from '@/components/chat/ChatEmptyState'
import { useChatPanelStyles } from '@/components/chat/ChatPanel.style'
import { RoundResult, lastQuestionOf, resolveRound } from '@/components/chat/RoundResult'
import { StreamStatusLine } from '@/components/chat/StreamStatusLine'
import { TraceDisclosure } from '@/components/chat/TraceDisclosure'
import type { AskDraft } from '@/lib/app-shell-context'
import { mimirChatUI } from '@/lib/chat-ui'
import type { MimirChat } from '@/lib/use-mimir-chat'

/**
 * 消息区（滚动容器里的那一列）。
 *
 * 从 `ChatPanel.tsx` 拆出来（它加「停止 / 状态行 / 回到底部」之前已经 536 行）。
 * 这一块的关注点是**顺序**——下面这几样的上下关系是刻意的，散在各处最容易乱掉：
 *
 * ```
 * 检索过程（回答的依据，PRD §5.6）
 * 消息列表
 * 生成期状态行（正文一出就撤）
 * 已停止 / 发送失败那两行
 * 本轮结果（引用 / 失败卡 / 动作条）
 * ```
 *
 * 它们在时间上是**同一块内容在不同阶段的样子**，所以归一个文件。
 *
 * 空态例外：问候语与输入框是**一组**（居中舞台，`ChatPanel` 的 data-empty
 * 承担布局），所以空态分支多渲染一个外部传进来的 `composer` 节点——
 * 同一个节点在会话开始后由 `ChatPanel` 挂回面板底部。
 */
export function ChatThread({
  chat,
  draft,
  initialMessages,
  lastSend,
  sendError,
  composer,
  emptyStage = true,
  onOpenCitation,
  onOpenNote,
  onRetry,
  onSearchOnly,
  onRefill,
}: {
  chat: MimirChat
  draft: AskDraft | null
  /** 已落库的历史消息。本轮结果要按它回退（见 `resolveRound`） */
  initialMessages: Message[] | undefined
  /** 本轮发出的文本与深度思考（重试 / 回填要用，见 ChatPanel 的说明） */
  lastSend: { text: string; deepReasoning: boolean; known: boolean }
  /** 建会话失败的文字（`send()` 唯一会 reject 的一支） */
  sendError: string | null
  /** 输入区节点：空态时渲染在问候语下面（居中成组），非空时由 ChatPanel 挂底部 */
  composer: ReactNode
  /**
   * 空态是否用「居中舞台」形态（问候语 + 输入框成一组）。
   *
   * 侧栏的指南模式传 `false`：那边输入框固定在底部、指南占滚动区
   * （D-090），空态不渲染 `ChatEmptyState`（指南自己带问候与说明）。
   */
  emptyStage?: boolean
  onOpenCitation: (documentId: string, citation: Citation) => void
  onOpenNote: (noteId: string) => void
  onRetry: () => void
  onSearchOnly: () => void
  onRefill: () => void
}) {
  const { styles } = useChatPanelStyles()

  const isEmpty = chat.messages.length === 0
  const round = resolveRound({
    messages: chat.messages,
    initialMessages,
    trace: chat.trace,
    citations: chat.citations,
    failure: chat.failure,
  })

  /**
   * 还在等回答（状态行显示与否）。
   *
   * 判据不是「最后一条是 user」——那是错的：只发到 `RUN_STARTED` 时
   * messages 里**连 assistant 都没有**（实测），空的 assistant 要到
   * `TEXT_MESSAGE_START` 才出现。按字面实现会把「检索 + 首 token」这整段
   * （最该显示的时候）漏成空白。
   *
   * 所以是：最后一条是 user，**或**最后一条 assistant 还没有正文。
   * 正文一出整行撤掉——不与流式并存两个进度指示。
   *
   * 再加两个前提：
   *
   *  - **这一轮已经失败了就不显示**。失败时「还在跑」是假的——流已经断了，
   *    屏幕上该有的是那张带出路的卡（实测：不加这一条，失败卡下面还挂着一行
   *    「正在生成 · 1s」，两个信号互相打架）
   *  - **停止之后不显示**。同理，而且更直接：下面那一行已经写着「已停止生成」，
   *    上面还转着「正在生成 · 3s」是自相矛盾的
   */
  const awaitingAnswer =
    !isEmpty &&
    !chat.stopped &&
    chat.failure === null &&
    chat.error === undefined &&
    (chat.messages.at(-1)?.role === 'user' || (chat.messages.at(-1)?.parts.length ?? 0) === 0)

  /**
   * 建会话失败那一行。
   *
   * **空态里也要渲染。** 它最容易发生的时候恰恰是空会话：`send()` 的
   * 第一件事是建会话，那一步失败就什么消息都没有，`isEmpty` 仍然成立。
   * 只在消息列表那一条分支里渲染它，等于最该报错的那一次不报
   * （实测：`POST /api/conversations` 401 时界面完全没反应）。
   */
  const sendErrorLine =
    sendError === null ? null : <div className={styles.stopped}>发送失败：{sendError}</div>

  if (isEmpty) {
    return (
      <>
        {emptyStage && <ChatEmptyState draft={draft} />}
        {/* 建会话失败在空态里最容易发生（send() 第一件事就是建会话），
            居中组里也要有它——用居中版的一行，组的其它内容都居中 */}
        {sendError !== null && <div className={styles.emptyError}>发送失败：{sendError}</div>}
        {composer}
      </>
    )
  }

  return (
    <>
      {/* 检索过程渲染在回答**上方**。默认折叠，展开后是逐步记录（PRD §5.6）：
          它是「这条回答的依据」，所以归到回答里，而不是飘在页面顶端 */}
      {round.trace && round.visible && <TraceDisclosure trace={round.trace} />}

      <div className={styles.thread}>
        <mimirChatUI.Chat chat={chat as never} />
      </div>

      {awaitingAnswer && (
        <StreamStatusLine retrieved={chat.trace !== null} hitCount={chat.citations.length} />
      )}

      {/* 停止之后的一句交代。半截回答留在屏幕上，用户需要知道「为什么停在这里」
          以及「它没有被保存」——停止只 abort 本地请求，不保证落库 */}
      {chat.stopped && (
        <div className={styles.stopped}>
          <PauseCircle size={14} />
          已停止生成 · 以上是已生成的部分
        </div>
      )}

      <RoundResult
        round={round}
        stopped={chat.stopped}
        activeId={chat.activeId}
        streamError={chat.error ? chat.error.message : null}
        retryDeepReasoningKnown={lastSend.known}
        onOpenCitation={onOpenCitation}
        onOpenNote={onOpenNote}
        onRetry={onRetry}
        onSearchOnly={onSearchOnly}
        onRefill={onRefill}
      />

      {/* 建会话失败：`send()` 唯一会 reject 的一支。它原先被 `void chat.send(...)`
          吞掉——界面像什么都没发生 */}
      {sendErrorLine}
    </>
  )
}

/** 「把问题放回输入框」要取的那条文本：本轮记下的优先，历史轮从消息里推 */
export function questionToRefill(chat: MimirChat, sentText: string): string | undefined {
  return sentText || lastQuestionOf(chat.messages)
}
