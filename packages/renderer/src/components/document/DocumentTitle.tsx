import { Button, Input, Typography } from 'antd'
import { Pencil } from 'lucide-react'
import { useRef, useState } from 'react'
import { DocumentCommandRefreshError } from './DocumentCommandModal'
import { useStyles } from './DocumentPanel.style'

const EMPTY_TAGS: readonly string[] = []

/** Metadata is kept outside the live Markdown; failed writes never discard its draft. */
export function DocumentTitle({
  title,
  updatedAt,
  tags = EMPTY_TAGS,
  onRename,
  onRefresh,
}: {
  title: string
  updatedAt: string
  tags?: readonly string[]
  onRename: (next: string) => Promise<unknown>
  onRefresh: () => Promise<unknown>
}) {
  const { styles } = useStyles()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const composing = useRef(false)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const finish = () => {
    setEditing(false)
    setError('')
    setSaved(false)
    requestAnimationFrame(() => editButtonRef.current?.focus())
  }
  const save = async () => {
    if (lock.current || composing.current) return
    const next = draft.trim()
    if (!next || next.length > 200) {
      setError(!next ? '请输入笔记标题' : '标题不能超过 200 个字符')
      return
    }
    if (!saved && next === title) {
      finish()
      return
    }
    lock.current = true
    setPending(true)
    setError('')
    try {
      if (saved) await onRefresh()
      else await onRename(next)
      finish()
    } catch (cause) {
      if (cause instanceof DocumentCommandRefreshError) setSaved(true)
      setError(cause instanceof Error ? cause.message : '标题保存失败，请重试')
    } finally {
      lock.current = false
      setPending(false)
    }
  }
  return (
    <div className={styles.noteHeading}>
      <div className={`note-title-group ${styles.noteTitleGroup}`}>
        {editing ? (
          <div data-title-editor>
            <Input
              autoFocus
              className={styles.noteTitleInput}
              variant="underlined"
              aria-label="笔记标题"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'document-title-error' : undefined}
              disabled={pending || saved}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value)
                setError('')
              }}
              onCompositionStart={() => {
                composing.current = true
              }}
              onCompositionEnd={() => {
                composing.current = false
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229)
                  return
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void save()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  event.stopPropagation()
                  if (!lock.current) finish()
                }
              }}
            />
            <div data-title-actions>
              <Button size="small" disabled={pending} onClick={finish}>
                取消
              </Button>
              <Button
                size="small"
                type="primary"
                loading={pending}
                disabled={pending}
                onClick={() => void save()}
              >
                {saved ? '重试刷新' : '保存标题'}
              </Button>
            </div>
            {error && (
              <div data-title-error id="document-title-error" role="alert">
                {error}
              </div>
            )}
          </div>
        ) : (
          <>
            <Typography.Title level={1} className={styles.noteTitle}>
              {title}
            </Typography.Title>
            <Button
              ref={editButtonRef}
              type="text"
              size="small"
              className={styles.headerTitleEdit}
              aria-label="修改笔记标题（会同步重命名文件）"
              title="修改笔记标题（会同步重命名文件）"
              icon={<Pencil size={15} />}
              onClick={() => {
                setDraft(title)
                setEditing(true)
              }}
            />
          </>
        )}
      </div>
      <div className={styles.noteUpdated} data-title-metadata>
        <time dateTime={updatedAt}>
          更新于{' '}
          {new Date(updatedAt).toLocaleString('zh-CN', {
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })}
        </time>
        {tags.length > 0 && <span>{tags.join(' · ')}</span>}
      </div>
    </div>
  )
}
