import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { UIMessage, MessagePart } from '@tanstack/ai'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Brain,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileText,
  Maximize2,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  Wrench,
  X,
  MoreHorizontal,
  Play,
  Pause,
  Pencil,
} from 'lucide-react'
import type { Attachment, ThreadMessageLike } from './local-types'
export function toMessages(messages: ThreadMessageLike[]): UIMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    parts: (typeof m.content === 'string'
      ? [{ type: 'text', text: m.content } as const]
      : m.content
    ).map((p) =>
      p.type === 'text'
        ? { type: 'text', content: p.text }
        : p.type === 'reasoning'
          ? { type: 'thinking', content: p.text }
          : p.type === 'tool-call'
            ? {
                type: 'tool-call',
                id: p.toolCallId,
                name: p.toolName,
                arguments: p.argsText || JSON.stringify(p.args),
                state:
                  p.result === undefined ? 'input-streaming' : p.isError ? 'error' : 'complete',
                ...(p.result === undefined ? {} : { output: p.result }),
                metadata: p.demoMetadata,
              }
            : p.type === 'image'
              ? {
                  type: 'image',
                  source: { type: 'url', url: p.image },
                  metadata: { filename: p.filename },
                }
              : {
                  type: p.mimeType.startsWith('audio/')
                    ? 'audio'
                    : p.mimeType.startsWith('video/')
                      ? 'video'
                      : p.mimeType.startsWith('image/')
                        ? 'image'
                        : 'document',
                  source: { type: 'url', url: p.data },
                  mediaType: p.mimeType,
                  metadata: { filename: p.filename },
                },
    ) as MessagePart[],
  }))
}
export function IconButton({
  label,
  children,
  onClick,
  disabled = false,
}: {
  label: string
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="icon-button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
export function CopyButton({ value, label = '复制' }: { value: string; label?: string }) {
  const [status, setStatus] = useState('')
  return (
    <>
      <IconButton
        label={status || label}
        onClick={() => {
          navigator.clipboard
            .writeText(value)
            .then(() => {
              setStatus('已复制')
              window.setTimeout(() => setStatus(''), 2000)
            })
            .catch(() => setStatus('复制失败，请选择文字后手动复制'))
        }}
      >
        {status === '已复制' ? <Check size={15} /> : <Copy size={15} />}
      </IconButton>
      {status.includes('失败') && (
        <span role="status" className="inline-error">
          {status}
        </span>
      )}
    </>
  )
}
export function CodeBlock({ children, ...props }: { children?: ReactNode; className?: string }) {
  const node = children as { props?: { children?: string; className?: string } }
  return (
    <div className="code-block">
      <div className="code-header">
        <span>{node?.props?.className?.replace('language-', '') || '代码'}</span>
        <CopyButton value={String(node?.props?.children || '')} label="Copy code" />
      </div>
      <pre {...props}>{children}</pre>
    </div>
  )
}
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: CodeBlock,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
export function Reasoning({ text, running = false }: { text: string; running?: boolean }) {
  const [manual, setManual] = useState<boolean | null>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  useEffect(() => {
    if (pinned.current && viewport.current)
      viewport.current.scrollTop = viewport.current.scrollHeight
  }, [text])
  return (
    <details
      className="reasoning-block"
      open={manual ?? running}
      onToggle={(e) => {
        if (e.currentTarget.open !== (manual ?? running)) setManual(e.currentTarget.open)
      }}
    >
      <summary
        onClick={(e) => {
          e.preventDefault()
          setManual(!(manual ?? running))
        }}
      >
        <Brain size={15} />
        <span>{running ? '正在思考…' : '思考过程'}</span>
        <ChevronDown size={13} />
      </summary>
      <div
        className="reasoning-content"
        ref={viewport}
        onScroll={() => {
          const el = viewport.current
          if (el) pinned.current = el.scrollHeight - el.clientHeight - el.scrollTop < 20
        }}
      >
        {text || '等待模型的推理内容…'}
      </div>
    </details>
  )
}
export function ToolCall({ part }: { part: Extract<MessagePart, { type: 'tool-call' }> }) {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)
  const open =
    manualOpen ??
    (part.state === 'approval-requested' ||
      (part.metadata as { demoOpen?: boolean } | undefined)?.demoOpen === true)
  const cancelled = (part.metadata as { cancelled?: boolean } | undefined)?.cancelled === true
  const busy = part.state === 'input-streaming' || part.state === 'input-complete'
  const error = part.state === 'error'
  return (
    <section className={`tool-block ${error ? 'tool-error' : ''}`}>
      <button
        type="button"
        className="disclosure-trigger"
        aria-expanded={open}
        onClick={() => setManualOpen(!open)}
      >
        <Wrench size={15} />
        <span>{part.name}</span>
        <small>{cancelled ? '已取消' : error ? '调用失败' : busy ? '调用中…' : '已完成'}</small>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="tool-content">
          <strong>参数</strong>
          <pre>{part.arguments || '{}'}</pre>
          {part.output !== undefined && (
            <>
              <strong>{error ? '错误' : '结果'}</strong>
              <pre>
                {typeof part.output === 'string'
                  ? part.output
                  : JSON.stringify(part.output, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}
    </section>
  )
}
export function ToolGroup({ parts }: { parts: Extract<MessagePart, { type: 'tool-call' }>[] }) {
  const [open, setOpen] = useState(
    (parts[0]?.metadata as { demoGroupOpen?: boolean } | undefined)?.demoGroupOpen === true,
  )
  const running = parts.some((p) => p.state === 'input-streaming' || p.state === 'input-complete')
  return (
    <section className="tool-group">
      <button
        type="button"
        className="disclosure-trigger"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Wrench size={15} />
        <span>工具调用 · {parts.length}</span>
        <small>{running ? '调用中…' : '已完成'}</small>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div>
          {parts.map((p) => (
            <ToolCall key={p.id} part={p} />
          ))}
        </div>
      )}
    </section>
  )
}
export const safeUrl = (url: string) =>
  /^(https?:|data:(image\/|audio\/|application\/|text\/)|blob:)/i.test(url)
export function ImageDialog({
  url,
  name,
  onClose,
}: {
  url: string
  name: string
  onClose: () => void
}) {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const old = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    close.current?.focus()
    return () => {
      document.body.style.overflow = old
      previous?.focus()
    }
  }, [])
  return (
    <div
      className="media-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${name}`}
      onClick={(e) => {
        if (e.currentTarget === e.target) onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onClose()
        }
        if (e.key === 'Tab') {
          e.preventDefault()
          close.current?.focus()
        }
      }}
    >
      <button
        type="button"
        ref={close}
        className="icon-button"
        aria-label="Close image"
        onClick={onClose}
      >
        <X size={18} />
      </button>
      <img src={url} alt={name} onClick={onClose} />
    </div>
  )
}
export function AudioPlayer({ url, name }: { url: string; name: string }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)
  const [error, setError] = useState(false)
  const time = (value: number) =>
    Number.isFinite(value) && value > 0
      ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`
      : '--:--'
  return (
    <div className="audio-player">
      <audio
        ref={audio}
        preload="metadata"
        src={url}
        onLoadedMetadata={() => setDuration(audio.current?.duration || 0)}
        onTimeUpdate={() => setPosition(audio.current?.currentTime || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setError(true)
          setPlaying(false)
        }}
      />
      <button
        type="button"
        className="icon-button"
        aria-label={playing ? 'Pause audio' : 'Play audio'}
        disabled={error}
        onClick={() => {
          if (playing) audio.current?.pause()
          else void audio.current?.play().catch(() => setPlaying(false))
        }}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <div>
        <strong>{name}</strong>
        <input
          type="range"
          aria-label="Audio progress"
          min={0}
          max={Number.isFinite(duration) && duration > 0 ? duration : 0}
          step={0.1}
          value={position}
          disabled={error || !duration || !Number.isFinite(duration)}
          onChange={(e) => {
            const value = Number(e.target.value)
            if (audio.current) audio.current.currentTime = value
            setPosition(value)
          }}
        />
        <span>
          {time(position)} / {time(duration)}
        </span>
      </div>
      {error && <p role="alert">音频读取失败，播放和进度控制已停用。</p>}
    </div>
  )
}
export function Media({ part }: { part: MessagePart }) {
  const [error, setError] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const record = part as unknown as {
    source?: { url?: string; data?: string; type?: string }
    mediaType?: string
    metadata?: { filename?: string }
  }
  const url = record.source?.url || record.source?.data || ''
  const name = record.metadata?.filename || '附件'
  if (part.type === 'image')
    return (
      <div className="message-image">
        {error ? (
          <div className="media-error" role="status">
            图片读取失败，可通过消息来源恢复。
          </div>
        ) : (
          <button type="button" onClick={() => setExpanded(true)} aria-label="Enlarge image">
            <img src={url} alt={name} onError={() => setError(true)} />
            <Maximize2 size={16} />
          </button>
        )}
        {expanded && <ImageDialog url={url} name={name} onClose={() => setExpanded(false)} />}
      </div>
    )
  if (part.type === 'audio') return <AudioPlayer key={url} url={url} name={name} />
  if (part.type === 'video')
    return (
      <div className="message-media">
        <span>{name}</span>
        <video
          key={url}
          controls
          playsInline
          preload="metadata"
          src={url}
          onError={() => setError(true)}
        />
        {error && <p role="alert">视频读取失败，请检查来源文件。</p>}
      </div>
    )
  return (
    <div className="message-file">
      <FileText size={21} />
      <span title={name}>{name}</span>
      {safeUrl(url) ? (
        <a
          href={url}
          download={name}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`下载 ${name}`}
        >
          <Download size={16} />
        </a>
      ) : (
        <span className="inline-error">链接不可下载</span>
      )}
    </div>
  )
}
export function AttachmentTile({
  attachment,
  onRemove,
}: {
  attachment: Attachment
  onRemove?: () => void
}) {
  const [preview, setPreview] = useState(false)
  const error = attachment.status?.type === 'incomplete'
  const pending = attachment.status?.type === 'running'
  return (
    <div
      className={`attachment-tile ${error ? 'attachment-error' : ''}`}
      title={attachment.status?.message || attachment.name}
    >
      {attachment.type === 'image' && attachment.content?.[0]?.type === 'image' ? (
        <button
          type="button"
          className="attachment-preview"
          aria-label={`Preview ${attachment.name}`}
          onClick={() => setPreview(true)}
        >
          <img src={attachment.content[0].image} alt={attachment.name} />
        </button>
      ) : (
        <FileText size={23} />
      )}
      <span>
        <strong>{attachment.name}</strong>
        <small>
          {error
            ? attachment.status?.message
            : pending
              ? '准备中…'
              : attachment.type === 'image'
                ? '图片'
                : '文档附件'}
        </small>
      </span>
      {preview && attachment.content?.[0]?.type === 'image' && (
        <ImageDialog
          url={attachment.content[0].image}
          name={attachment.name}
          onClose={() => setPreview(false)}
        />
      )}
      {onRemove && (
        <IconButton label={`Remove attachment ${attachment.name}`} onClick={onRemove}>
          <X size={14} />
        </IconButton>
      )}
    </div>
  )
}
export function ChatMessages({
  messages,
  source = [],
  running = false,
  reasoningRunning,
  onRetry,
  onEdit,
  allowRetry = true,
  feedbackEnabled = false,
}: {
  messages: UIMessage[]
  source?: ThreadMessageLike[]
  running?: boolean
  reasoningRunning?: boolean
  onRetry?: () => void
  onEdit?: (id: string, text: string) => void
  allowRetry?: boolean
  feedbackEnabled?: boolean
}) {
  const [feedback, setFeedback] = useState<Record<string, string>>({})
  const [edit, setEdit] = useState<{ id: string; text: string } | null>(null)
  const end = useRef<HTMLDivElement>(null)
  return (
    <>
      {messages
        .filter(
          (message) =>
            message.role === 'user' || message.role === 'assistant' || message.role === 'activity',
        )
        .map((message) => {
          const origin = source.find((m) => m.id === message.id)
          const text = message.parts
            .filter((p) => p.type === 'text')
            .map((p) => p.content)
            .join('\n')
          const isLast = message.id === messages.at(-1)?.id
          return (
            <article
              className={`chat-message ${message.role}`}
              key={message.id}
              aria-label={message.role === 'user' ? '你的消息' : 'Mimir 回答'}
            >
              <div className="message-author">{message.role === 'user' ? '你' : 'mimir'}</div>
              {origin?.attachments?.length ? (
                <div className="sent-attachments">
                  {origin.attachments.map((a) => (
                    <AttachmentTile key={a.id} attachment={a} />
                  ))}
                </div>
              ) : null}
              {edit?.id === message.id ? (
                <div className="edit-message">
                  <textarea
                    autoFocus
                    aria-label="编辑消息"
                    value={edit.text}
                    onChange={(e) => setEdit({ ...edit, text: e.target.value })}
                  />
                  <button type="button" onClick={() => setEdit(null)}>
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onEdit?.(edit.id, edit.text)
                      setEdit(null)
                    }}
                  >
                    保存并重新发送
                  </button>
                </div>
              ) : (
                message.parts.map((part, j) =>
                  part.type === 'text' ? (
                    message.role === 'user' ? (
                      <div key={j} className="user-text">
                        {part.content}
                      </div>
                    ) : (
                      <Markdown key={j} text={part.content} />
                    )
                  ) : part.type === 'thinking' ? (
                    part.redacted ? (
                      <p key={j} className="muted">
                        加密思考内容不展示
                      </p>
                    ) : (
                      <Reasoning
                        key={j}
                        text={part.content}
                        running={(reasoningRunning ?? running) && isLast}
                      />
                    )
                  ) : part.type === 'tool-call' ? (
                    message.parts[j - 1]?.type === 'tool-call' ? null : (
                      <ToolGroup
                        key={j}
                        parts={message.parts
                          .slice(
                            j,
                            message.parts.findIndex(
                              (p, index) => index > j && p.type !== 'tool-call',
                            ) < 0
                              ? undefined
                              : message.parts.findIndex(
                                  (p, index) => index > j && p.type !== 'tool-call',
                                ),
                          )
                          .filter(
                            (p): p is Extract<MessagePart, { type: 'tool-call' }> =>
                              p.type === 'tool-call',
                          )}
                      />
                    )
                  ) : part.type === 'tool-result' ? (
                    <details key={j} className="tool-block">
                      <summary>工具结果</summary>
                      <pre>
                        {typeof part.content === 'string'
                          ? part.content
                          : JSON.stringify(part.content, null, 2)}
                      </pre>
                    </details>
                  ) : ['image', 'document', 'audio', 'video'].includes(part.type) ? (
                    <Media key={j} part={part} />
                  ) : part.type === 'activity' ? (
                    <details key={j}>
                      <summary>{part.activityType} · 协议活动演示</summary>
                      <pre>{JSON.stringify(part.content, null, 2)}</pre>
                    </details>
                  ) : part.type === 'subagent' ? (
                    <details key={j}>
                      <summary>子 Agent · {part.subagent.status}</summary>
                      <ChatMessages messages={part.subagent.messages} />
                    </details>
                  ) : part.type === 'structured-output' ? (
                    <pre key={j}>{JSON.stringify(part.data ?? part.partial, null, 2)}</pre>
                  ) : null,
                )
              )}
              {isLast && running && (
                <span
                  className="typing-cursor"
                  aria-label="Assistant is responding"
                  role="status"
                />
              )}
              {origin?.status?.type === 'incomplete' && origin.status.reason === 'error' && (
                <div className="message-error" role="alert">
                  {String(origin.status.error || '连接异常')}{' '}
                  {allowRetry && (
                    <button type="button" onClick={onRetry}>
                      重试
                    </button>
                  )}
                </div>
              )}
              {!running && text && (
                <div className={`message-actions ${isLast ? 'last' : 'older'}`}>
                  {message.role === 'assistant' && <CopyButton value={text} label="Copy message" />}
                  {message.role === 'assistant' ? (
                    <>
                      {allowRetry && (
                        <IconButton label="Reload" onClick={onRetry}>
                          <RotateCcw size={15} />
                        </IconButton>
                      )}
                      <>
                        {feedbackEnabled && (
                          <>
                            <IconButton
                              label="Good response"
                              onClick={() =>
                                setFeedback({ ...feedback, [message.id]: '已标记为有帮助' })
                              }
                            >
                              <ThumbsUp size={15} />
                            </IconButton>
                            <IconButton
                              label="Bad response"
                              onClick={() =>
                                setFeedback({ ...feedback, [message.id]: '已标记为无帮助' })
                              }
                            >
                              <ThumbsDown size={15} />
                            </IconButton>
                          </>
                        )}
                        <ExportMenu text={text} />
                      </>
                    </>
                  ) : (
                    <IconButton
                      label="Edit message"
                      disabled={!onEdit}
                      onClick={() => setEdit({ id: message.id, text })}
                    >
                      <Pencil size={15} />
                    </IconButton>
                  )}
                  {feedback[message.id] && <span role="status">{feedback[message.id]}</span>}
                </div>
              )}
            </article>
          )
        })}
      <div ref={end} />
    </>
  )
}

export function ExportMenu({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const item = useRef<HTMLButtonElement>(null)
  const close = () => {
    setOpen(false)
    button.current?.focus()
  }
  useEffect(() => {
    if (!open) return
    item.current?.focus()
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  return (
    <div
      className="export-menu"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          close()
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          e.preventDefault()
          item.current?.focus()
        }
      }}
    >
      <button
        type="button"
        ref={button}
        className="icon-button"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div role="menu" className="action-menu">
          <button
            type="button"
            ref={item}
            role="menuitem"
            onClick={() => {
              const a = document.createElement('a')
              const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
              a.href = url
              a.download = '回答.md'
              a.click()
              window.setTimeout(() => URL.revokeObjectURL(url), 1000)
              close()
            }}
          >
            <Download size={14} />
            Export as Markdown
          </button>
        </div>
      )}
    </div>
  )
}
