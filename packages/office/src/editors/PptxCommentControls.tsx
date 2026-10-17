import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MessageSquarePlus, RotateCcw, Trash2 } from 'lucide-react'
import type { PptxMetadata } from '../pptx-metadata.js'
import {
  ToolbarButton,
  ToolbarMenuNote,
  ToolbarNotice,
  ToolbarPropertyForm,
  ToolbarTextArea,
} from '../shell/EditorShell.js'
import type { PptxApply } from './PptxControlPanel.js'
import './pptx-comment-controls.css'

export function PptxCommentControls({
  metadata,
  index,
  apply,
  embedded = false,
  disabled = false,
}: {
  metadata: PptxMetadata
  index: number
  apply: PptxApply
  embedded?: boolean
  disabled?: boolean
}) {
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef<AbortController | null>(null)
  const fieldset = useRef<HTMLFieldSetElement>(null)
  const restoreAfterAdd = useRef(false)
  useLayoutEffect(() => {
    if (busy || disabled || !restoreAfterAdd.current) return
    restoreAfterAdd.current = false
    const node = fieldset.current
    if (node && (document.activeElement === document.body || node.contains(document.activeElement)))
      node.querySelector('textarea')?.focus()
  }, [busy, disabled])
  useEffect(() => () => pending.current?.abort(), [])
  const run = async (op: Record<string, unknown>, added = false) => {
    if (pending.current || disabled) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    setError('')
    try {
      const ok = await apply(op)
      if (controller.signal.aborted) return
      if (ok && added) {
        restoreAfterAdd.current = true
        setComment('')
      }
      if (!ok) setError('批注未更新，请检查提示后重试。')
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : '批注未更新，请稍后重试。')
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null
        setBusy(false)
      }
    }
  }
  return (
    <fieldset
      ref={fieldset}
      className={`mimir-pptx-comment-controls${embedded ? ' mimir-pptx-comment-controls--embedded' : ''}`}
      disabled={busy || disabled}
      aria-busy={busy}
    >
      <div className="mimir-pptx-comment-controls__content">
        <ToolbarPropertyForm>
          <ToolbarTextArea
            label="新批注"
            value={comment}
            rows={4}
            placeholder="为本页添加批注…"
            onChange={(value) => {
              setComment(value)
              setError('')
            }}
          />
        </ToolbarPropertyForm>
        {comment.trim() && <ToolbarMenuNote>添加后才会写入文稿。</ToolbarMenuNote>}
        <section className="mimir-pptx-comment-controls__thread" aria-label="本页批注">
          <h3>本页批注 · {metadata.comments.length}</h3>
          {metadata.comments.length ? (
            metadata.comments.map((item) => (
              <article key={`${item.authorId}:${item.idx}`}>
                <div className="mimir-pptx-comment-controls__author">
                  <strong>{item.author}</strong>
                  <ToolbarButton
                    label={`删除批注 ${item.idx}`}
                    onClick={() =>
                      void run({
                        op: 'deleteComment',
                        target: { slide: index },
                        authorId: item.authorId,
                        idx: item.idx,
                      })
                    }
                  >
                    <Trash2 size={14} />
                  </ToolbarButton>
                </div>
                {item.date && (
                  <time dateTime={item.date}>
                    {Number.isNaN(Date.parse(item.date))
                      ? item.date
                      : new Date(item.date).toLocaleString('zh-CN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })}
                  </time>
                )}
                <p>{item.text}</p>
              </article>
            ))
          ) : (
            <ToolbarMenuNote>本页还没有批注。</ToolbarMenuNote>
          )}
        </section>
      </div>
      <div className="mimir-pptx-comment-controls__actions">
        {error && <ToolbarNotice>{error}</ToolbarNotice>}
        <ToolbarButton
          label="添加本页批注"
          primary
          disabled={!comment.trim() || busy || disabled}
          disabledReason={busy ? '正在更新批注' : '请输入批注内容'}
          onClick={() =>
            void run(
              { op: 'addComment', target: { slide: index }, text: comment, author: '用户' },
              true,
            )
          }
        >
          <MessageSquarePlus size={14} />
        </ToolbarButton>
        <ToolbarButton
          label="清空批注草稿"
          disabled={!comment || busy || disabled}
          disabledReason="没有批注草稿"
          onClick={() => {
            setComment('')
            setError('')
          }}
        >
          <RotateCcw size={14} />
          清空草稿
        </ToolbarButton>
      </div>
    </fieldset>
  )
}
