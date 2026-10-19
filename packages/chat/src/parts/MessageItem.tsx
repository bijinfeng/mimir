import type { UIMessage, MessagePart } from '@tanstack/ai'
import { useEffect, useRef, useState } from 'react'
import { Copy, Download, MoreHorizontal, Pencil, RotateCcw, X } from 'lucide-react'
import { createStyles } from 'antd-style'
import { useChatPanelStyles } from '../ChatPanel.style.js'
import { MessageContext, useChatRuntime } from '../runtime/runtime-context.js'
import { useMimirChatApi } from '../runtime/chat-context.js'
import { AttachmentTile } from '../composer/Composer.js'
import { AnswerActions } from './AnswerActions.js'
import { CitationList } from './CitationList.js'
import { DocxAgentHistoryNotice } from './DocxAgentHistoryNotice.js'
import { FailureCard, StreamErrorCard } from './FailureNotice.js'
import { MarkdownPart } from './MarkdownPart.js'
import { FilePart, ImagePart } from './MediaParts.js'
import { ReasoningPart } from './ReasoningPart.js'
import { ToolCallPart, ToolGroup } from './ToolCallPart.js'
import { StoppedNotice } from './StoppedNotice.js'
const useStyles = createStyles(({ css, token }) => ({
  actions: css`
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: 30px;
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
      border-radius: 4px;
    }
    button:hover {
      background: ${token.colorFillTertiary};
      color: ${token.colorText};
    }
    &[data-older] {
      opacity: 0;
    }
    article:hover &,
    article:focus-within & {
      opacity: 1;
    }
    @media (hover: none) {
      &[data-older] {
        opacity: 1;
      }
    }
    button:focus-visible {
      outline: 1px solid ${token.colorPrimary};
      outline-offset: 2px;
    }
  `,
  menu: css`
    position: absolute;
    bottom: calc(100% + 6px);
    left: 60px;
    z-index: 30;
    padding: 6px;
    min-width: 180px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 6px;
    box-shadow: ${token.boxShadowSecondary};
    background: ${token.colorBgElevated};
    color: ${token.colorText};
    button {
      width: 100%;
      justify-content: flex-start;
      padding: 0 8px;
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
      border: 1px solid ${token.colorBorder};
      border-radius: 6px;
      padding: 8px;
    }
  `,
}))
export function MessageItem({ message, index }: { message: UIMessage; index: number }) {
  const runtime = useChatRuntime()
  const api = useMimirChatApi()
  const { styles } = useChatPanelStyles()
  const { styles: local } = useStyles()
  const [editing, setEditing] = useState(false)
  const [edit, setEdit] = useState('')
  const [feedback, setFeedback] = useState('')
  const [more, setMore] = useState(false)
  const moreRoot = useRef<HTMLDivElement>(null)
  const moreTrigger = useRef<HTMLButtonElement>(null)
  const editInput = useRef<HTMLTextAreaElement>(null)
  const editTrigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (editing) {
      editInput.current?.focus()
      editInput.current?.select()
    }
  }, [editing])
  useEffect(() => {
    if (!more) return
    moreRoot.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const outside = (event: PointerEvent) => {
      if (
        !moreRoot.current?.contains(event.target as Node) &&
        !moreTrigger.current?.contains(event.target as Node)
      )
        setMore(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [more])
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
        <div className={styles.assistantHeading}>{user ? '你' : 'mimir'}</div>
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
          keyedParts(message.parts, message.id).map(({ part, position: partIndex, key }) =>
            user && part.type === 'text' ? (
              <div key={key}>{part.content}</div>
            ) : sidecar.snapshot && part.type === 'image' ? null : part.type === 'tool-call' ? (
              message.parts[partIndex - 1]?.type === 'tool-call' ? null : (
                <ToolGroup
                  halted={
                    sidecar.stopped
                      ? 'cancelled'
                      : sidecar.error || sidecar.failure
                        ? 'error'
                        : undefined
                  }
                  key={part.id}
                  parts={message.parts
                    .slice(
                      partIndex,
                      message.parts.findIndex(
                        (next, i) => i > partIndex && next.type !== 'tool-call',
                      ) < 0
                        ? undefined
                        : message.parts.findIndex(
                            (next, i) => i > partIndex && next.type !== 'tool-call',
                          ),
                    )
                    .filter(
                      (next): next is Extract<MessagePart, { type: 'tool-call' }> =>
                        next.type === 'tool-call',
                    )}
                />
              )
            ) : (
              <NativePart
                key={key}
                part={part}
                reasoningRunning={sidecar.reasoningRunning ?? running}
              />
            ),
          )
        )}
        {!user &&
          running &&
          !message.parts.some(
            (part) =>
              (part.type === 'text' && part.content) || (part.type === 'thinking' && part.content),
          ) && (
            <span role="status" aria-label="正在生成回答" className={local.waiting}>
              ●
            </span>
          )}
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
          <div className={local.actions} data-older={!isLast || undefined}>
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
                <button
                  type="button"
                  aria-label="更多操作"
                  ref={moreTrigger}
                  aria-expanded={more}
                  aria-haspopup="menu"
                  onClick={() => setMore(!more)}
                >
                  <MoreHorizontal size={16} />
                </button>
                {more && (
                  <div
                    role="menu"
                    className={local.menu}
                    ref={moreRoot}
                    onKeyDown={(event) => {
                      const items = [
                        ...moreRoot.current!.querySelectorAll<HTMLButtonElement>(
                          '[role="menuitem"]',
                        ),
                      ]
                      if (event.key === 'Escape' || event.key === 'Tab') closeMore()
                      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                        event.preventDefault()
                        const i = items.indexOf(document.activeElement as HTMLButtonElement)
                        items[
                          event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? items.length - 1
                              : (i + (event.key === 'ArrowUp' ? -1 : 1) + items.length) %
                                items.length
                        ]?.focus()
                      }
                    }}
                  >
                    <button type="button" role="menuitem" onClick={exportText}>
                      <Download size={14} />
                      导出 Markdown
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      aria-label="关闭更多操作"
                      onClick={closeMore}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </>
            )}
            {feedback && <span role="status">{feedback}</span>}
          </div>
        )}
      </article>
    </MessageContext>
  )
}
function NativePart({ part, reasoningRunning }: { part: MessagePart; reasoningRunning: boolean }) {
  if (part.type === 'text') return <MarkdownPart text={part.content} />
  if (part.type === 'thinking' && part.redacted) return <p>加密思考内容不展示</p>
  if (part.type === 'thinking')
    return (
      <ReasoningPart
        text={part.content}
        status={{ type: reasoningRunning ? 'running' : 'complete' }}
      />
    )
  if (part.type === 'tool-call') return <ToolCallPart part={part} />
  if (part.type === 'tool-result')
    return (
      <details>
        <summary>工具结果</summary>
        <pre>
          {typeof part.content === 'string' ? part.content : JSON.stringify(part.content, null, 2)}
        </pre>
      </details>
    )
  if (
    part.type === 'image' ||
    part.type === 'document' ||
    part.type === 'audio' ||
    part.type === 'video'
  ) {
    const source = part.source
    const mime = source.type === 'data' ? source.mimeType : 'application/octet-stream'
    const value =
      source.type === 'url'
        ? source.value
        : source.type === 'data'
          ? `data:${mime};base64,${source.value}`
          : ''
    if (part.type === 'image') return <ImagePart image={value} />
    if (part.type === 'audio') return <audio controls src={value} aria-label="音频附件" />
    if (part.type === 'video')
      return <video controls src={value} aria-label="视频附件" style={{ maxWidth: '100%' }} />
    const metadata = part.metadata as Record<string, unknown> | undefined
    return (
      <FilePart
        data={value}
        mimeType={mime}
        filename={typeof metadata?.filename === 'string' ? metadata.filename : '附件'}
      />
    )
  }
  if (part.type === 'activity')
    return (
      <details>
        <summary>{part.activityType}</summary>
        <pre>{JSON.stringify(part.content, null, 2)}</pre>
      </details>
    )
  if (part.type === 'structured-output')
    return <pre>{JSON.stringify(part.data ?? part.partial, null, 2)}</pre>
  if (part.type === 'subagent')
    return (
      <details>
        <summary>子任务 · {part.subagent.status}</summary>
        <pre>{JSON.stringify(part.subagent.messages, null, 2)}</pre>
      </details>
    )
  return null
}

function keyedParts(parts: MessagePart[], messageId: string) {
  const counts = new Map<string, number>()
  const result = []
  let position = 0
  for (const part of parts) {
    const number = counts.get(part.type) ?? 0
    counts.set(part.type, number + 1)
    result.push({ part, position: position++, key: `${messageId}:${part.type}:${number}` })
  }
  return result
}
