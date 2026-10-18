import { useRef, useState } from 'react'
import type { DocumentDetail } from '@mimir/shared'
import { Button, Dropdown, Tooltip, Typography, type MenuProps } from 'antd'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Download,
  Ellipsis,
  LoaderCircle,
  MessageCircle,
  TriangleAlert,
} from 'lucide-react'
import { StatusBadge } from '../DocumentBadges'
import { api } from '../../lib/api'
import { useUnsaved } from '../../lib/unsaved'
import { useStyles } from './DocumentPanel.style'
import type { NoteSaveState } from '../NoteEditor'

interface DocumentHeaderProps {
  doc: DocumentDetail
  onBack?: (() => void) | undefined
  onBackToChat?: (() => void) | undefined
  noteSaveState?: NoteSaveState | undefined
  onAskAi: () => void
  menu: MenuProps['items']
}

/** All document kinds share one compact header; only supported actions vary. */
export function DocumentHeader({
  doc,
  onBack,
  onBackToChat,
  noteSaveState,
  onAskAi,
  menu,
}: DocumentHeaderProps) {
  const { styles } = useStyles()
  const { runGuarded } = useUnsaved()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuTrigger = useRef<HTMLButtonElement>(null)
  const closeMenu = () => {
    setMenuOpen(false)
    menuTrigger.current?.focus()
  }
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
        <nav className={styles.headerPath} aria-label="文档路径">
          {doc.folder ? (
            <>
              <span className={styles.headerFolder} title={doc.folder}>
                {doc.folder.split('/').at(-1)}
              </span>
              <span aria-hidden="true">/</span>
            </>
          ) : null}
          <span className={styles.headerPathCurrent} aria-current="page" title={doc.title}>
            {doc.title}
          </span>
        </nav>
      ) : (
        <div className={styles.headerTitleGroup}>
          <Typography.Title level={1} className={styles.headerTitle} title={doc.title}>
            {doc.title}
          </Typography.Title>
        </div>
      )}
      {doc.status === 'failed' && <StatusBadge status={doc.status} />}

      <div className={styles.headerActions}>
        {doc.kind === 'note' && noteSaveState ? (
          <span
            className={styles.saveStatus}
            role="status"
            data-save-state={noteSaveState}
            title={noteSaveState === 'error' ? '保存失败，请使用工具栏的保存按钮重试' : undefined}
          >
            {noteSaveState === 'saving' ? (
              <LoaderCircle size={14} />
            ) : noteSaveState === 'error' ? (
              <TriangleAlert size={14} />
            ) : noteSaveState === 'pending' ? (
              <Circle size={12} />
            ) : (
              <CheckCircle2 size={14} />
            )}
            <span>
              {noteSaveState === 'saving'
                ? '保存中…'
                : noteSaveState === 'error'
                  ? '保存失败'
                  : noteSaveState === 'pending'
                    ? '未保存'
                    : '已保存'}
            </span>
          </span>
        ) : null}
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
              : '打开文档助手，围绕这篇文档提问'
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
          autoFocus
          open={menuOpen}
          onOpenChange={setMenuOpen}
          menu={{
            items: styledMenu,
            onClick: closeMenu,
            onKeyDown: (event) => {
              if (event.key !== 'Escape') return
              event.stopPropagation()
              closeMenu()
            },
          }}
          placement="bottomRight"
          classNames={{ root: styles.docMenu }}
        >
          <Button
            type="text"
            size="small"
            icon={<Ellipsis size={16} />}
            className={styles.tbBtn}
            ref={menuTrigger}
            aria-label="更多操作"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                closeMenu()
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setMenuOpen(true)
              }
            }}
          />
        </Dropdown>
      </div>
    </div>
  )
}
