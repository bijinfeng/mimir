import type { UIMessage } from '@tanstack/ai'
import { MessageParts } from '../ui/MessageParts.js'
import { useEffect, useRef, useState } from 'react'
import { Copy, Download, MoreHorizontal, Pencil, RotateCcw } from 'lucide-react'
import { Dropdown } from 'antd'
import { createStyles } from 'antd-style'
import { useChatPanelStyles } from '../ChatPanel.style.js'
import { MessageContext, useChatRuntime } from '../runtime/runtime-context.js'
import { useMimirChatApi } from '../runtime/chat-context.js'
import { AttachmentTile } from '../composer/Composer.js'
import { AnswerActions } from './AnswerActions.js'
import { CitationList } from './CitationList.js'
import { DocxAgentHistoryNotice } from './DocxAgentHistoryNotice.js'
import { FailureCard, StreamErrorCard } from './FailureNotice.js'
import { ImagePart } from './MediaParts.js'
import { StoppedNotice } from './StoppedNotice.js'
const useStyles = createStyles(({ css, token, prefixCls }) => ({
  actions: css`
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: 30px;
    flex-wrap: wrap;
    margin-top: 8px;
    font-size: var(--mimir-chat-font-meta, 12px);
    color: ${token.colorTextTertiary};
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      height: 30px;
      min-width: 30px;
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
      border-radius: ${token.borderRadius}px;
      padding: 0 6px;
      font: inherit;
    }
    button:hover:not(:disabled) {
      background: ${token.colorFillTertiary};
      color: ${token.colorText};
    }
    button:focus-visible {
      outline: 2px solid ${token.focusRing ?? token.colorPrimaryBorder};
      outline-offset: 2px;
    }
    button:disabled {
      cursor: not-allowed;
      color: ${token.colorTextDisabled};
    }
    @media (pointer: coarse) {
      button {
        min-width: 40px;
        height: 40px;
      }
    }
  `,
  menu: css`
    .${prefixCls}-dropdown-menu {
      min-width: 160px;
      max-width: calc(100vw - 24px);
      padding: 0;
      overflow: hidden;
    }
    .${prefixCls}-dropdown-menu-item {
      min-height: 32px;
      border-radius: 0;
    }
  `,
  waiting: css`
    display: inline-flex;
    align-items: center;
    height: 22px;
    color: ${token.colorPrimary};
    animation: mimir-wait 1.2s ease-in-out infinite;
    @keyframes mimir-wait {
      50% {
        opacity: 0.35;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      animation: none;
    }
  `,
  files: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
  `,
  edit: css`
    textarea {
      width: 100%;
      min-height: 80px;
      font: inherit;
      color: inherit;
      background: ${token.colorBgContainer};
      border: 1px solid ${token.fieldBorder ?? token.colorBorderSecondary};
      border-radius: 6px;
      padding: 10px 12px;
      resize: vertical;
      outline: none;
      &:hover {
        border-color: ${token.fieldBorderHover ?? token.colorBorder};
      }
      &:focus {
        border-color: ${token.fieldBorderFocus ?? token.colorPrimary};
      }
    }
  `,
}))
export function MessageItem({ message }: { message: UIMessage }) {
  const runtime = useChatRuntime()
  const index = runtime.messages.findIndex((item) => item.id === message.id)
  const api = useMimirChatApi()
  const { styles } = useChatPanelStyles()
  const { styles: local } = useStyles()
  const [editing, setEditing] = useState(false)
  const [edit, setEdit] = useState('')
  const [feedback, setFeedback] = useState('')
  const [more, setMore] = useState(false)
  const moreTrigger = useRef<HTMLButtonElement>(null)
  const editInput = useRef<HTMLTextAreaElement>(null)
  const editTrigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (editing) {
      editInput.current?.focus()
      editInput.current?.select()
    }
  }, [editing])
  function closeMore() {
    setMore(false)
    moreTrigger.current?.focus()
  }
  function closeEdit() {
    setEditing(false)
    editTrigger.current?.focus()
  }
  const sidecar = runtime.sidecars[message.id] ?? {}
  const isLast = index === runtime.messages.length - 1
  const running = isLast && runtime.running
  const text = message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.content)
    .join('')
  const user = message.role === 'user'
  const successful =
    !running &&
    !sidecar.error &&
    !sidecar.stopped &&
    !sidecar.failure &&
    !['failed', 'cancelled', 'pending'].includes(sidecar.agent?.status ?? '')
  function previousQuestion() {
    for (let i = index - (user ? 0 : 1); i >= 0; i--) {
      const item = runtime.messages[i]
      if (item?.role === 'user')
        return item.parts
          .filter((part) => part.type === 'text')
          .map((part) => part.content)
          .join('')
    }
    return ''
  }
  function previousUserId() {
    for (let i = index - (user ? 0 : 1); i >= 0; i--) {
      const entry = runtime.messages[i]
      if (entry?.role === 'user') return entry.id
    }
    return ''
  }
  function retry(searchOnly = false) {
    if (!api.retryTurn?.(previousUserId(), searchOnly))
      api.ask(previousQuestion(), searchOnly ? { scope: 'search' } : undefined)
  }
  function refill() {
    if (!api.refillTurn?.(previousUserId())) api.refill(previousQuestion())
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setFeedback('已复制')
    } catch {
      setFeedback('复制失败，请重试')
    }
  }
  function exportText() {
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = '回答.md'
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setFeedback('已导出')
    } catch {
      setFeedback('导出失败，请重试')
    }
    closeMore()
  }
  return (
    <MessageContext value={{ message, sidecar, running }}>
      <article data-role={user ? 'user' : 'assistant'}>
        <div className={styles.assistantHeading} data-message-heading="">
          {user ? '你' : 'mimir'}
        </div>
        <div data-message-body="">
          {!!sidecar.attachments?.length && (
            <div className={local.files}>
              {sidecar.attachments.map((file) => (
                <AttachmentTile file={file} key={file.id} />
              ))}
            </div>
          )}
          {sidecar.snapshot && (
            <ImagePart image={sidecar.snapshot.image.dataUrl} name={sidecar.snapshot.image.name} />
          )}
          {editing ? (
            <div className={local.edit}>
              <textarea
                ref={editInput}
                value={edit}
                aria-label="编辑消息"
                onChange={(event) => setEdit(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') closeEdit()
                }}
              />
              <div className={local.actions}>
                <button
                  type="button"
                  onClick={() => {
                    api.editTurn?.(message.id, edit)
                    closeEdit()
                  }}
                  disabled={!edit.trim()}
                >
                  保存并重新发送
                </button>
                <button type="button" onClick={closeEdit}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <MessageParts message={message} />
          )}
          {!user &&
            running &&
            !message.parts.some(
              (part) =>
                (part.type === 'text' && part.content) ||
                (part.type === 'thinking' && part.content),
            ) && (
              <span role="status" aria-label="正在生成回答" className={local.waiting}>
                ●
              </span>
            )}
        </div>
        {!user && sidecar.agent && <DocxAgentHistoryNotice agent={sidecar.agent} />}
        {!user && <CitationList citations={sidecar.citations ?? []} onOpen={api.onOpenCitation} />}
        {!user && sidecar.failure ? (
          <FailureCard
            failure={sidecar.failure.kind}
            detail={sidecar.failure.detail}
            deepReasoningKnown={
              api.sentHere || Boolean(runtime.sidecars[previousUserId()]?.modelSelection)
            }
            onSearchOnly={() => retry(true)}
            onRetry={() => retry()}
          />
        ) : !user && sidecar.error ? (
          <StreamErrorCard detail={sidecar.error} onRetry={() => retry()} onRefill={refill} />
        ) : null}
        {!user && sidecar.stopped && <StoppedNotice />}
        {text && !running && (user || successful) && !editing && (
          <div className={local.actions} data-message-actions="" data-older={!isLast || undefined}>
            {user ? (
              <>
                <button type="button" aria-label="复制消息" onClick={() => void copy()}>
                  <Copy size={14} />
                </button>
                <button
                  type="button"
                  aria-label="编辑消息"
                  ref={editTrigger}
                  disabled={runtime.running || !runtime.canEditBranch}
                  onClick={() => {
                    setEdit(text)
                    setEditing(true)
                  }}
                >
                  <Pencil size={14} />
                </button>
              </>
            ) : (
              <>
                <AnswerActions />
                <button
                  type="button"
                  aria-label="重新生成"
                  disabled={runtime.running || !runtime.canEditBranch}
                  onClick={() => api.regenerateTurn?.(previousUserId())}
                >
                  <RotateCcw size={14} />
                </button>
                <Dropdown
                  trigger={['click']}
                  placement="topLeft"
                  autoAdjustOverflow
                  autoFocus
                  destroyOnHidden
                  open={more}
                  onOpenChange={setMore}
                  classNames={{ root: local.menu }}
                  menu={{
                    'aria-label': '回答更多操作',
                    items: [
                      {
                        key: 'export',
                        label: '导出 Markdown',
                        icon: <Download size={14} />,
                        onClick: exportText,
                      },
                    ],
                  }}
                >
                  <button
                    type="button"
                    aria-label="更多操作"
                    ref={moreTrigger}
                    aria-expanded={more}
                    aria-haspopup="menu"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </Dropdown>
              </>
            )}
            {feedback && <span role="status">{feedback}</span>}
          </div>
        )}
      </article>
    </MessageContext>
  )
}
