import type { DocumentDetail } from '@mimir/shared'
import { useStyles } from '@/components/document/DocumentPanel.style'

/**
 * 双链页脚。
 *
 * 借鉴 WeKnora（`docs/PRD.md` §5.10）：列出「来源」和「被引用」，
 * 让双向链接是双向的。没有链接时不渲染——空的两行标签只是噪音。
 */
export function DocumentFooter({
  doc,
  onOpenDocument,
}: {
  doc: DocumentDetail
  onOpenDocument: (id: string) => void
}) {
  const { styles } = useStyles()
  const { sources, backlinks } = doc.links

  if (sources.length === 0 && backlinks.length === 0) return null

  return (
    <div className={styles.foot}>
      {sources.length > 0 && (
        <div className={styles.footRow}>
          <span className={styles.footLabel}>来源</span>
          <span className={styles.footLinks}>
            {sources.map((link) => (
              <span
                key={link.id}
                className={styles.footLink}
                onClick={() => onOpenDocument(link.id)}
              >
                {link.title}
              </span>
            ))}
          </span>
        </div>
      )}
      {backlinks.length > 0 && (
        <div className={styles.footRow}>
          <span className={styles.footLabel}>被引用</span>
          <span className={styles.footLinks}>
            {backlinks.map((link) => (
              <span
                key={link.id}
                className={styles.footLink}
                onClick={() => onOpenDocument(link.id)}
              >
                {link.title}
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  )
}
