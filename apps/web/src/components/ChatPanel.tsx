import type { Citation, Message } from '@mimir/shared'
import { App as AntApp, Button, Skeleton } from 'antd'
import { ArrowDown } from 'lucide-react'
import { useRef, useState } from 'react'
import { useChatPanelStyles } from '@/components/chat/ChatPanel.style'
import { ChatThread, questionToRefill } from '@/components/chat/ChatThread'
import { Composer } from '@/components/chat/Composer'
import type { AskDraft } from '@/lib/app-shell-context'
import { useAppShell } from '@/lib/app-shell-context'
import { useMimirChat } from '@/lib/use-mimir-chat'
import { useScrolled } from '@/lib/use-scrolled'
import { useStickToBottom } from '@/lib/use-stick-to-bottom'

/**
 * 对话面板（右栏）。
 *
 * 会话优先意味着对话是**主视图**，不是侧边面板（`docs/PRD.md` §5.2）。
 *
 * 消息列表的渲染交给官方的 `createChatUI`（见 lib/chat-ui.tsx），
 * 流式状态交给 `useChat`（见 lib/use-mimir-chat.ts）。这里只负责：
 *  - 主区里的滚动与外壳（`lib/use-stick-to-bottom.ts`）
 *  - 会话相关的本地状态：发送前的 pending、建会话失败、本轮发出的参数
 *  - 输入区
 *
 * 其余各块在 `components/chat/` 里各有文件：消息区（含检索过程 / 状态行 /
 * 本轮结果的位置）、空态、引用卡、失败卡、输入区。这个文件曾经 536 行，
 * `apps/web/AGENTS.md` 的 300 行是信号，拆的依据是「它是不是一个独立关注点」。
 */

export interface ChatPanelProps {
  conversationId: string | undefined
  draft: AskDraft | null
  /** 已落库的历史消息。加载完成前不要传（见 ChatPanel 里的说明） */
  initialMessages?: Message[] | undefined
  /** 历史消息是否还在加载 */
  messagesLoading?: boolean | undefined
  /** 引用卡片被点击 → 跳回原文 */
  onOpenCitation: (documentId: string, citation: Citation) => void
  /** 新会话建出来后换 URL */
  onConversationCreated: (conversationId: string) => void
}

export function ChatPanel({
  conversationId,
  draft,
  initialMessages,
  messagesLoading,
  onOpenCitation,
  onConversationCreated,
}: ChatPanelProps) {
  const { styles } = useChatPanelStyles()

  /**
   * **数据没到位就不挂载对话体。**
   *
   * 这不是优化，是正确性要求：`useChat` 只在挂载那一刻读 `initialMessages`
   * （它内部把客户端建在 `useMemo(..., [])` 里，之后传的变化不会生效）。
   * 若先挂载、后拿到历史消息，右栏就会一直是空的——而中栏的「本次引用」
   * 却显示着这次对话读过的文档，两栏说的不是同一件事。
   *
   * **重挂载的时机由外层决定**（`_app.chat.tsx` 的 `key={panelKey}`）：
   * 只有「用户切到另一个已有会话」才重建，自己新建的会话不重建——
   * 否则会把正在接收的流丢掉。
   */
  if (messagesLoading) {
    return (
      <div className={styles.wrap}>
        <div className={styles.scroll}>
          <div className={styles.inner}>
            <Skeleton active paragraph={{ rows: 4 }} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <ChatPanelBody
      conversationId={conversationId}
      draft={draft}
      initialMessages={initialMessages}
      onOpenCitation={onOpenCitation}
      onConversationCreated={onConversationCreated}
    />
  )
}

function ChatPanelBody({
  conversationId,
  draft,
  initialMessages,
  onOpenCitation,
  onConversationCreated,
}: ChatPanelProps) {
  const { styles } = useChatPanelStyles()
  const { openDocument } = useAppShell()
  const { message: antdMessage } = AntApp.useApp()
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  /* 输入区上方的界线随消息滚动显形（D-070） */
  const scrolled = useScrolled(scrollRef)

  const chat = useMimirChat({
    conversationId,
    initialMessages,
    /**
     * 范围锁定的来源**只有 `draft`**（从文档工具条或引用带进来的）。
     *
     * 这里曾经还有第二个来源：空态里点选的那一篇（`pickedDocumentId`）。
     * 收件箱退役后空态不再列文档（D-054），那个状态因此没有写入方——
     * 一个永远是 undefined 的 state 会让「范围为什么锁在这一篇」多一条
     * 不存在的路径，所以删掉而不是留着。
     */
    documentId: draft?.documentId,
    onConversationCreated,
  })

  /**
   * 建会话失败时的错误。
   *
   * `send()` 唯一会 reject 的一支就是它（流侧的失败不 reject：实测
   * `rejected = no`，错误只出现在 `chat.error` 上，由「连接中断」那张卡渲染）。
   * 原先这里 `void chat.send(...)` 把 reject 丢掉，于是「按了发送、界面回到
   * 原样」——连一句报错都没有。
   */
  const [sendError, setSendError] = useState<string | null>(null)

  /**
   * 本轮发出的文本与「深度思考」。
   *
   * 失败卡片的「重试 / 只检索」要重发**原来那个问题**，而不是把「重试」
   * 两个字发出去；而历史轮没有落库这两个字段
   * （`packages/shared/src/conversations.ts` 的 messageSchema 只有
   * text / trace / citations / failure），只能从本地消息里取文本、并按
   * 「开关未知」渲染一条说明。
   *
   * `nonce` 是「把问题放回输入框」用的杠杆：Composer 的文本在它自己的 state 里
   * （只认挂载时的 `initialText`），而它的 key 已经是重挂载的开关
   * （`key={draft?.documentId ?? 'global'}`）——点按钮时改 nonce 是最小的接法。
   */
  const [lastSend, setLastSend] = useState<{
    text: string
    deepReasoning: boolean
    /** 是本地刚发的（true）还是从历史记录推的（false） */
    known: boolean
    nonce: number
  }>({ text: '', deepReasoning: false, known: false, nonce: 0 })

  /**
   * 忙 = 这一轮在飞，或**正在新建会话**。
   *
   * `creating` 那一段 `chat.isLoading` 还是假，界面看不出有东西在飞——新会话里
   * 连按两次 Enter 会建出两个会话。它由 hook 维护（只有它知道建会话那一趟的
   * 起止），而且**只在建会话期间为真**：把标志位罩住整个 `send()` 会被停止
   * 生成卡死（实测在只收到 `RUN_STARTED` 时停止，SDK 的 `sendMessage` Promise
   * 不落地，界面就永久停在「生成中」）。
   */
  const busy = chat.isLoading || chat.creating
  /**
   * 本轮检索范围（「+ 添加上下文」所选，或从文档工具条带进来的 draft 锁定）。
   * 每轮发送都以它的 documentId 覆盖挂载值（见 use-mimir-chat 的 send）；
   * null = 整个知识库。
   */
  const [contextDoc, setContextDoc] = useState<{ id: string; title: string } | null>(
    draft?.documentId ? { id: draft.documentId, title: '当前文档' } : null,
  )

  const send = async (
    text: string,
    options: {
      deepReasoning?: boolean
      scope?: 'search'
      documentId?: string | null
    } = {},
  ) => {
    setSendError(null)
    setLastSend({
      text,
      deepReasoning: options.deepReasoning ?? false,
      known: true,
      nonce: lastSend.nonce,
    })
    /* 建会话失败是 `send()` 唯一会 reject 的一支（流侧的失败不 reject，
       见上面 `sendError` 的说明）。这里**不设忙标志**——那是 hook 的
       `creating` 的职责，而且它只覆盖建会话那一趟。 */
    try {
      await chat.send(text, options)
    } catch (error) {
      setSendError(error instanceof Error ? error.message : '发送失败')
    }
  }

  /** 重发本轮的问题（重试 / 只检索两条出路共用） */
  const resend = (scope?: 'search') => {
    const previous = questionToRefill(chat, lastSend.text)
    if (!previous) return
    void send(previous, {
      deepReasoning: lastSend.deepReasoning,
      scope,
      documentId: contextDoc?.id ?? null,
    })
  }

  /**
   * 自动跟随（DESIGN §8.7）。
   *
   * `jumpKey` 用消息条数：用户自己发出的新消息总是跳到底；流式追加的
   * token 不改变条数，于是它只在贴底时跟随（`use-stick-to-bottom` 的两条规则）。
   */
  const { atBottom, scrollToBottom } = useStickToBottom(scrollRef, contentRef, chat.messages.length)

  /* 停止生成：半截回答**不保证落库**（SDK 只 abort 本地请求，不发任何服务端
     消息），所以界面只说「已停止」+「以上是已生成的部分」，不说「已保存」 */
  const stop = () => {
    chat.stop()
    antdMessage.info('已停止生成')
  }

  const isEmpty = chat.messages.length === 0

  /**
   * 输入区节点，**两个位置共用**：空态时渲染在问候语下面（居中成组，
   * Notion / ChatGPT 的新对话形态——用户拍板），开始对话后由面板底部
   * 的 composerLine 接管。发第一条消息时消息数 0→1，它从居中组挪到
   * 底部——组件会重挂载，文字已经清空所以没有损失；「深度思考」的开关
   * 状态会随之回到默认关，这是本次重挂载的已知代价。
   */
  const composer = (
    <Composer
      key={`${draft?.documentId ?? 'global'}:${lastSend.nonce}`}
      initialText={lastSend.nonce > 0 ? lastSend.text : (draft?.text ?? '')}
      conversationId={chat.activeId}
      contextDocument={contextDoc ?? undefined}
      onContextDocumentChange={setContextDoc}
      busy={busy}
      onSend={(text, deepReasoning) =>
        void send(text, { deepReasoning, documentId: contextDoc?.id ?? null })
      }
      onStop={stop}
    />
  )

  return (
    <div className={styles.wrap}>
      <div className={styles.scrollWrap}>
        <div className={styles.scroll} ref={scrollRef} data-empty={isEmpty || undefined}>
          <div className={isEmpty ? styles.innerEmpty : styles.inner} ref={contentRef}>
            <ChatThread
              chat={chat}
              draft={draft}
              initialMessages={initialMessages}
              lastSend={lastSend}
              sendError={sendError}
              composer={composer}
              onOpenCitation={onOpenCitation}
              onOpenNote={(noteId) => openDocument(noteId, 'all')}
              onRetry={() => resend()}
              onSearchOnly={() => resend('search')}
              onRefill={() => {
                const question = questionToRefill(chat, lastSend.text)
                if (!question) return
                setLastSend((current) => ({
                  ...current,
                  text: question,
                  nonce: current.nonce + 1,
                }))
              }}
            />
          </div>
        </div>

        {/* 离底时才出现。它浮在滚动区之上，所以不能放进滚动容器里 */}
        {!atBottom && (
          <Button
            className={styles.backToBottom}
            size="small"
            shape="circle"
            icon={<ArrowDown size={16} />}
            aria-label="回到底部"
            onClick={scrollToBottom}
          />
        )}
      </div>

      {/* 空态时输入区在居中组里（ChatThread 渲染），底部这条不渲染——
          否则同一个输入框会出现两份 */}
      {!isEmpty && (
        <div className={styles.composerLine} data-scrolled={scrolled || undefined}>
          {composer}
        </div>
      )}
    </div>
  )
}
