import { Button, Tooltip } from 'antd'
import { ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { useState } from 'react'
import { useStyles } from '../NavSidebar.style'
import { useRecentDocuments } from '../../lib/recent-documents'

export function RecentNotes({
  userId,
  activeId,
  onOpenDocument,
}: {
  userId?: string
  activeId?: string
  onOpenDocument: (id: string, scope: string) => void
}) {
  const { styles } = useStyles()
  const recentQuery = useRecentDocuments(userId)
  const [showRecent, setShowRecent] = useState(true)
  const notes = (recentQuery.data ?? []).filter((doc) => doc.kind === 'note').slice(0, 6)
  const failed = recentQuery.isError || recentQuery.retryableFailureCount > 0
  return (
    <div className={styles.recentGroup}>
      <Button
        type="text"
        className={styles.recentHeading}
        aria-expanded={showRecent}
        onClick={() => setShowRecent((value) => !value)}
      >
        <span>最近笔记</span>
        {showRecent ? (
          <ChevronDown size={15} aria-hidden />
        ) : (
          <ChevronRight size={15} aria-hidden />
        )}
      </Button>
      {showRecent && (
        <div className={styles.recentList}>
          {userId && recentQuery.isPending ? (
            <span className={styles.recentEmpty} role="status">
              正在读取最近笔记…
            </span>
          ) : notes.length === 0 && !failed ? (
            <span className={styles.recentEmpty}>还没有最近打开的笔记</span>
          ) : (
            notes.map((doc) => (
              <Tooltip
                key={doc.id}
                title={`${doc.title} · ${doc.folder ?? '知识库根'}`}
                trigger={['hover', 'focus']}
                placement="right"
              >
                <Button
                  type="text"
                  className={styles.recentItem}
                  aria-current={activeId === doc.id ? 'page' : undefined}
                  onClick={(event) => {
                    event.currentTarget.focus()
                    onOpenDocument(doc.id, doc.folder ? `folder:${doc.folder}` : 'all')
                  }}
                >
                  <FileText size={16} aria-hidden />
                  <span>{doc.title}</span>
                </Button>
              </Tooltip>
            ))
          )}
          {failed && (
            <div className={styles.recentEmpty} role="status">
              <span>{notes.length ? '部分笔记暂时无法读取' : '最近笔记暂时无法读取'}</span>
              <Button
                type="link"
                size="small"
                loading={recentQuery.isFetching}
                disabled={recentQuery.isFetching}
                onClick={() => void recentQuery.refetch()}
              >
                {recentQuery.isFetching ? '重试中…' : '重试'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
