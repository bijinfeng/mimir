import { Button, Input, Typography } from 'antd'
import { Pencil } from 'lucide-react'
import { useRef, useState } from 'react'
import { useStyles } from './DocumentPanel.style'

/** Note metadata above the live editor, outside the editable Markdown. */
export function DocumentTitle({
  title,
  updatedAt,
  onRename,
}: {
  title: string
  updatedAt: string
  onRename: (next: string) => void
}) {
  const { styles } = useStyles()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const settledRef = useRef(false)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const finish = (save: boolean, restoreFocus: boolean) => {
    if (settledRef.current) return
    settledRef.current = true
    setEditing(false)
    const next = draft.trim()
    if (save && next && next !== title) onRename(next)
    if (restoreFocus) requestAnimationFrame(() => editButtonRef.current?.focus())
  }
  return (
    <div className={styles.noteHeading}>
      <div className={`note-title-group ${styles.noteTitleGroup}`}>
        {editing ? (
          <Input
            autoFocus
            className={styles.noteTitleInput}
            variant="underlined"
            aria-label="笔记标题"
            maxLength={200}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onPressEnter={(event) => {
              event.preventDefault()
              finish(true, true)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              event.preventDefault()
              event.stopPropagation()
              finish(false, true)
            }}
            onBlur={() => finish(true, false)}
          />
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
                settledRef.current = false
                setDraft(title)
                setEditing(true)
              }}
            />
          </>
        )}
      </div>
      <time className={styles.noteUpdated} dateTime={updatedAt}>
        更新于{' '}
        {new Date(updatedAt).toLocaleString('zh-CN', {
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })}
      </time>
    </div>
  )
}
