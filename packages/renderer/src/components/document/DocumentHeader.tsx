import type { DocumentDetail } from '@mimir/shared'
import { Button, Dropdown, Input, Tooltip, Typography, type MenuProps } from 'antd'
import { ArrowLeft, Download, Ellipsis, MessageCircle, Pencil } from 'lucide-react'
import { useRef, useState } from 'react'
import { StatusBadge } from '../DocumentBadges'
import { api } from '../../lib/api'
import { useUnsaved } from '../../lib/unsaved'
import { useStyles } from './DocumentPanel.style'

interface DocumentHeaderProps {
  doc: DocumentDetail
  onBack?: (() => void) | undefined
  onBackToChat?: (() => void) | undefined
  onRename: (title: string) => void
  onAskAi: () => void
  menu: MenuProps['items']
}

/** All document kinds share one compact header; only supported actions vary. */
export function DocumentHeader({
  doc,
  onBack,
  onBackToChat,
  onRename,
  onAskAi,
  menu,
}: DocumentHeaderProps) {
  const { styles } = useStyles()
  const { runGuarded } = useUnsaved()
  // Ant Design portals submenu popups outside the root dropdown. Give those
  // popups the same scoped class so their rows keep the document-menu styling.
  const styledMenu = menu?.map((item) =>
    item && 'children' in item && item.type !== 'group'
      ? { ...item, popupClassName: styles.docMenu }
      : item,
  )

  return (
    <div className={styles.header}>
      {onBackToChat && (
        <button
          type="button"
          className={styles.back}
          aria-label="返回对话"
          onClick={() => runGuarded(onBackToChat)}
        >
          <ArrowLeft size={14} />
          <span>返回对话</span>
        </button>
      )}
      {onBack && (
        <button
          type="button"
          className={styles.back}
          aria-label="返回知识库"
          onClick={() => runGuarded(onBack)}
        >
          <ArrowLeft size={14} />
          <span>返回库</span>
        </button>
      )}

      {doc.kind === 'note' ? (
        <EditableNoteTitle key={doc.id} title={doc.title} onRename={onRename} />
      ) : (
        <div className={styles.headerTitleGroup}>
          <Typography.Title level={1} className={styles.headerTitle} title={doc.title}>
            {doc.title}
          </Typography.Title>
        </div>
      )}
      {doc.status === 'failed' && <StatusBadge status={doc.status} />}

      <div className={styles.headerActions}>
        {doc.kind === 'file' && doc.sourceKey && (
          <Button
            type="text"
            size="small"
            icon={<Download size={16} />}
            className={styles.tbBtn}
            aria-label="下载原件"
            href={api.documents.sourceUrl(doc.id, { download: true })}
          >
            下载
          </Button>
        )}
        <Tooltip
          title={
            doc.body.trim() === ''
              ? '这篇还没有可检索的正文，问答里引用不到它'
              : '带这篇的上下文去主视图对话，范围自动锁到这一篇'
          }
        >
          <Button
            type="text"
            size="small"
            icon={<MessageCircle size={14} />}
            className={styles.tbBtn}
            aria-label="询问这篇文档"
            onClick={onAskAi}
            disabled={doc.body.trim() === ''}
          >
            问 AI
          </Button>
        </Tooltip>
        <Dropdown
          trigger={['click']}
          menu={{ items: styledMenu }}
          placement="bottomRight"
          classNames={{ root: styles.docMenu }}
        >
          <Button
            type="text"
            size="small"
            icon={<Ellipsis size={16} />}
            className={styles.tbBtn}
            aria-label="更多操作"
          />
        </Dropdown>
      </div>
    </div>
  )
}

function EditableNoteTitle({
  title,
  onRename,
}: {
  title: string
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

  if (editing) {
    return (
      <Input
        autoFocus
        className={styles.headerTitleInput}
        variant="underlined"
        size="small"
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
    )
  }

  return (
    <div className={`note-title-group ${styles.headerTitleGroup}`}>
      <Typography.Title level={1} className={styles.headerTitle} title={title}>
        {title}
      </Typography.Title>
      <Button
        ref={editButtonRef}
        type="text"
        size="small"
        className={styles.headerTitleEdit}
        aria-label="修改笔记标题（会同步重命名文件）"
        title="修改笔记标题（会同步重命名文件）"
        icon={<Pencil size={13} />}
        onClick={() => {
          settledRef.current = false
          setDraft(title)
          setEditing(true)
        }}
      />
    </div>
  )
}
