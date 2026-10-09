import type { DocumentDetail } from '@mimir/shared'
import { useStyles } from './DocumentPanel.style'

/**
 * 双链页脚。
 *
 * 借鉴 WeKnora（`docs/PRD.md` §5.10）：列出「来源」和「被引用」，
 * 让双向链接是双向的。没有链接时不渲染——空的两行标签只是噪音。
 *
 * ## 每一条是 button 而不是带 onClick 的 span
 *
 * span 不在 tab 序列里、回车也点不动——键盘用户在这个页脚上**什么都做不了**
 * （它是「跳来源 / 跳被引用」的唯一入口）。样式上它们看起来一样，所以这个
 * 缺陷只在用键盘时才会被发现。button 拿到键盘与焦点环，外观由 footLink 覆写成
 * 与正文链接同样的观感。
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
              <button
                key={link.id}
                type="button"
                className={styles.footLink}
                onClick={() => onOpenDocument(link.id)}
              >
                {link.title}
              </button>
            ))}
          </span>
        </div>
      )}
      {backlinks.length > 0 && (
        <div className={styles.footRow}>
          <span className={styles.footLabel}>被引用</span>
          <span className={styles.footLinks}>
            {backlinks.map((link) => (
              <button
                key={link.id}
                type="button"
                className={styles.footLink}
                onClick={() => onOpenDocument(link.id)}
              >
                {link.title}
              </button>
            ))}
          </span>
        </div>
      )}
    </div>
  )
}
