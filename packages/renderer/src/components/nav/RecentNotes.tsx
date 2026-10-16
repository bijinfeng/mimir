import { Button } from 'antd'
import { ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { useState } from 'react'
import { useStyles } from '../NavSidebar.style'
import { useRecentDocuments } from '../../lib/recent-documents'

export function RecentNotes({
  userId,
  activeId,
  onBeforeOpen,
  onOpenDocument,
}: {
  userId?: string
  activeId?: string
  onBeforeOpen: () => void
  onOpenDocument: (id: string, scope: string) => void
}) {
  const { styles } = useStyles()
  const recentQuery = useRecentDocuments(userId)
  const [showRecent, setShowRecent] = useState(true)
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
          {(recentQuery.data ?? []).filter((doc) => doc.kind === 'note').length === 0 ? (
            <span className={styles.recentEmpty}>还没有最近打开的笔记</span>
          ) : (
            (recentQuery.data ?? [])
              .filter((doc) => doc.kind === 'note')
              .slice(0, 6)
              .map((doc) => (
                <Button
                  key={doc.id}
                  type="text"
                  className={styles.recentItem}
                  aria-current={activeId === doc.id ? 'page' : undefined}
                  title={`${doc.title} · ${doc.folder ?? '知识库根'}`}
                  onClick={() => {
                    onBeforeOpen()
                    onOpenDocument(doc.id, doc.folder ? `folder:${doc.folder}` : 'all')
                  }}
                >
                  <FileText size={16} aria-hidden />
                  <span>{doc.title}</span>
                </Button>
              ))
          )}
        </div>
      )}
    </div>
  )
}
