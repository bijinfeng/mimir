import type { Citation, Message } from '@mimir/shared'
import type { UIMessage } from '@tanstack/ai-react'
import { useQuery } from '@tanstack/react-query'
import { Skeleton } from 'antd'
import { createStyles } from 'antd-style'
import { useRef, useState } from 'react'
import { CitationCards } from '@/components/chat/CitationCards'
import { Composer } from '@/components/chat/Composer'
import { FailureCard } from '@/components/chat/FailureCard'
import { TraceDisclosure } from '@/components/chat/TraceDisclosure'
import { KindBadge } from '@/components/DocumentBadges'
import { api } from '@/lib/api'
import type { AskDraft } from '@/lib/app-shell-context'
import { mimirChatUI } from '@/lib/chat-ui'
import { useMimirChat } from '@/lib/use-mimir-chat'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 右栏：对话视图。
 *
 * 会话优先意味着对话是**主视图**，不是侧边面板（`docs/PRD.md` §5.2）。
 *
 * 消息列表的渲染交给官方的 `createChatUI`（见 lib/chat-ui.tsx），
 * 流式状态交给 `useChat`（见 lib/use-mimir-chat.ts）。这里只负责：
 *  - 三栏里的布局与滚动
 *  - 检索过程与引用卡片的位置（它们是「本轮的结果」，不是消息里的片段）
 *  - 输入区
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

const useStyles = createStyles(({ css, token }) => ({
  wrap: css`
    height: 100%;
    display: flex;
    flex-direction: column;
    background: ${token.colorBgContainer};
  `,
  scroll: css`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 24px 0 16px;
  `,
  inner: css`
    max-width: 860px;
    margin: 0 auto;
    padding: 0 40px;
  `,

  /* 消息的排布。用户消息靠右、助手消息占满宽度——
     助手回答里会有表格与代码块，限宽会让它们挤成一团 */
  /* 消息之间的间距。原型的对话列是 max-width:860px 的居中单列，
     消息之间留 20px —— 比正文段落间距大，比卡片间距小。
     用户消息靠右、助手消息占满宽度（回答里会有表格与代码块，
     限宽会让它们挤成一团）。 */
  thread: css`
    display: flex;
    flex-direction: column;
    gap: 20px;

    [data-role='user'] {
      align-self: flex-end;
      max-width: 78%;
      padding: 9px 14px;
      border-radius: 12px 12px 2px 12px;
      background: ${token.colorPrimaryBg};
      font-size: ${FONT_SIZE.body}px;
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-word;
    }

    [data-role='assistant'] {
      font-size: ${FONT_SIZE.body}px;
      line-height: 1.75;
      color: ${token.colorText};
    }

    /* 助手回答是 Markdown（由官方的 TextPart 渲染），
       所以这里要覆盖它的元素样式以符合 mimir 的正文规范 */
    [data-role='assistant'] {
      p {
        margin: 12px 0;
      }
      h1,
      h2,
      h3 {
        margin: 20px 0 10px;
        line-height: 1.5;
      }
      h1 {
        font-size: ${FONT_SIZE.pageTitle}px;
      }
      h2 {
        font-size: ${FONT_SIZE.section}px;
      }
      ul,
      ol {
        margin: 12px 0;
        padding-left: 22px;
      }
      code {
        font-family: ${token.fontFamilyCode};
        font-size: ${FONT_SIZE.excerpt}px;
        background: ${token.colorFillSecondary};
        color: ${token.inlineCodeFg};
        padding: 1.5px 5px;
        border-radius: ${token.borderRadiusSM}px;
      }
      pre {
        background: ${token.colorFillTertiary};
        border: 1px solid ${token.colorBorderSecondary};
        border-radius: ${token.borderRadius}px;
        padding: 14px 16px;
        overflow-x: auto;
        font-size: ${FONT_SIZE.excerpt}px;

        code {
          background: none;
          color: ${token.colorText};
          padding: 0;
        }
      }
      a {
        color: ${token.colorLink};
        text-decoration: underline;
        text-underline-offset: 2px;
      }
    }
  `,

  empty: css`
    padding: 80px 20px;
    text-align: center;
  `,
  emptyTitle: css`
    font-size: ${FONT_SIZE.section}px;
    font-weight: 600;
    margin-bottom: 8px;
    color: ${token.colorText};
  `,
  /* 待整理建议（新对话空态里）。点一下把范围锁到那一篇——
     比「一句提示语」有用，因为启动新对话最典型的动机就是「我刚收了几篇东西」 */
  suggestions: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 22px;
    text-align: left;
  `,
  suggestionsLabel: css`
    padding: 0 0 6px;
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorTextTertiary};
  `,
  suggestion: css`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border: none;
    border-radius: 6px;
    background: ${token.tintList};
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s ease-out;

    &:hover {
      background: ${token.tintHover};
    }
  `,
  suggestionTitle: css`
    flex: 1;
    min-width: 0;
    font-size: ${FONT_SIZE.item}px;
    color: ${token.colorText};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  emptySub: css`
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorTextTertiary};
    line-height: 1.9;
  `,
}))

export function ChatPanel({
  conversationId,
  draft,
  initialMessages,
  messagesLoading,
  onOpenCitation,
  onConversationCreated,
}: ChatPanelProps) {
  const { styles } = useStyles()

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
  const { styles } = useStyles()
  const scrollRef = useRef<HTMLDivElement>(null)

  /**
   * 从空态里挑中的文档。
   *
   * 它必须住在这里而不是 Composer 里：点选发生在空态（Composer 之外），
   * 而「范围锁到这一篇」由 Composer 的输入框体现。两个组件是兄弟，
   * 所以选择落在共同祖先上。
   *
   * `draft?.documentId` 优先于它——那是从文档工具条带进来的，
   * 比在空态里点的更明确。
   */
  const [pickedDocumentId, setPickedDocumentId] = useState<string | undefined>()

  const chat = useMimirChat({
    conversationId,
    initialMessages,
    documentId: draft?.documentId ?? pickedDocumentId,
    onConversationCreated,
  })

  const isEmpty = chat.messages.length === 0
  const lastRole = chat.messages.at(-1)?.role

  /**
   * 落库消息里的检索过程与引用。
   *
   * **历史会话也必须能看到这两个**——它们不是「刚才读了什么」的实时状态，
   * 而是**这条回答的依据**，和回答本身一样是内容的一部分。
   *
   * 曾经只渲染实时事件推来的那一份，于是打开历史会话时：中栏显示
   * 「本次引用 2 个来源」，右栏却既没有检索过程也没有引用块——两栏说的
   * 不是同一件事。而库里明明存着它们（`messages.trace` / `messages.citations`），
   * 只是渲染层没用。
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
  const storedAssistant = (initialMessages ?? []).findLast((item) => item.role === 'assistant')

  /**
   * 当前该显示哪一份检索过程与引用。
   *
   * 实时那份（`chat.trace`）属于**最后一条助手消息**；历史消息用落库的。
   * 两者取其一而不是叠加，因为它们描述的是同一件事。
   */
  const activeTrace = chat.trace ?? storedAssistant?.trace ?? null
  const activeCitations =
    chat.citations.length > 0 ? chat.citations : (storedAssistant?.citations ?? [])

  return (
    <div className={styles.wrap}>
      <div className={styles.scroll} ref={scrollRef}>
        <div className={styles.inner}>
          {isEmpty ? (
            <ChatEmptyState draft={draft} onStartFromDocument={setPickedDocumentId} />
          ) : (
            <>
              {/* 检索过程渲染在回答**上方**。默认折叠，展开后是逐步记录
                  （PRD §5.6）：它是「这条回答的依据」，所以归到回答里，
                  而不是飘在页面顶端 */}
              {activeTrace && lastRole !== 'user' && <TraceDisclosure trace={activeTrace} />}

              <div className={styles.thread}>
                <mimirChatUI.Chat chat={chat as never} />
              </div>

              {/*
                失败卡片。有失败时渲染它而**不是**引用卡与重试入口——
                因为此时用户需要的不是「再试一次」，而是「这次花没花钱、
                内容丢没丢、换个做法有没有用」（PRD §5.8）。
              */}
              {chat.failure ? (
                <FailureCard
                  failure={chat.failure.kind}
                  detail={chat.failure.message}
                  onSearchOnly={() => void chat.send('只检索，不调模型，把命中的原文列出来', false)}
                  onRetry={() => {
                    const previous = lastQuestionOf(chat.messages)
                    if (previous) void chat.send(previous, false)
                  }}
                />
              ) : (
                lastRole !== 'user' && (
                  <CitationCards citations={activeCitations} onOpen={onOpenCitation} />
                )
              )}
            </>
          )}
        </div>
      </div>

      <Composer
        key={draft?.documentId ?? 'global'}
        initialText={draft?.text ?? ''}
        scopedDocumentId={draft?.documentId ?? pickedDocumentId}
        disabled={chat.isLoading}
        onSend={(text, deepReasoning) => void chat.send(text, deepReasoning)}
      />
    </div>
  )
}

/**
 * 对话空态。
 *
 * 除了「问点什么」这句提示，它还要承担一件事：**新对话时列出待整理的内容**
 * （`docs/PRD.md` §5.10）。
 *
 * 那条要求原本落在中栏（「新对话的中栏不空着」），动机是：启动新对话最典型的
 * 动机就是「我刚收了几篇东西，想问问」，把这个动机需要的东西直接摆在眼前，
 * 比一句提示语有用。
 *
 * 中栏在对话模式下删掉之后（§5.2），这个动机没有丢，只是搬到了空态里——
 * 而且**比原来更贴切**：原来那些条目在中栏，与输入框隔着一栏；现在它们就在
 * 输入框上方，点一下就把范围锁到那一篇。
 */
function ChatEmptyState({
  draft,
  onStartFromDocument,
}: {
  draft: AskDraft | null
  onStartFromDocument: (id: string) => void
}) {
  const { styles } = useStyles()

  /**
   * 待整理内容。**只在新对话时请求**——带着上下文进来的（`draft` 有值）
   * 不需要它，那时用户心里已经有问题了。
   */
  const pendingQuery = useQuery({
    queryKey: ['documents', 'inbox-pending'],
    queryFn: () => api.documents.list({ status: 'inbox', limit: 4 }),
    enabled: !draft,
  })

  const pending = pendingQuery.data?.items ?? []

  return (
    <div className={styles.empty}>
      <div className={styles.emptyTitle}>{draft ? '就这一篇提问' : '问点什么'}</div>
      <div className={styles.emptySub}>
        {draft
          ? '上下文已经准备好，范围锁定在这篇文档'
          : '它会先在你的知识库里检索，再基于命中的原文回答，并给出引用'}
      </div>

      {!draft && pending.length > 0 && (
        <div className={styles.suggestions}>
          <div className={styles.suggestionsLabel}>
            收件箱还有 {pendingQuery.data?.items.length} 条没整理，可以从它们开始问
          </div>
          {pending.map((doc) => (
            <button
              key={doc.id}
              type="button"
              className={styles.suggestion}
              onClick={() => onStartFromDocument(doc.id)}
            >
              <KindBadge kind={doc.kind} />
              <span className={styles.suggestionTitle}>{doc.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 重试要重发**上一个问题**，而不是发「重试」这两个字。
 *
 * 从 UIMessage 的 text part 里取——它没有直接的 text 字段，
 * 消息内容是 parts 数组。
 */
function lastQuestionOf(messages: UIMessage[]): string | undefined {
  const lastUser = messages.findLast((item) => item.role === 'user')
  if (!lastUser) return undefined

  return lastUser.parts
    .filter((part) => part.type === 'text')
    .map((part) => (typeof part.content === 'string' ? part.content : ''))
    .join('')
}
