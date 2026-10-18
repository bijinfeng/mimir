import { Button } from 'antd'
import { ChevronDown, Folder } from 'lucide-react'
import type { PaletteItem } from './items'
import { useStyles } from './styles'

export function PaletteRow({
  item,
  active,
  disabled,
  onSelect,
  onExecute,
  onDetail,
}: {
  item: PaletteItem
  active: boolean
  disabled: boolean
  onSelect: () => void
  onExecute: () => void
  onDetail: () => void
}) {
  const { styles, cx } = useStyles()
  return (
    <div className={styles.row}>
      <button
        type="button"
        data-item-key={item.key}
        aria-current={active ? 'true' : undefined}
        className={cx(
          styles.item,
          item.type === 'document' && styles.documentItem,
          item.key.startsWith('hit:') && styles.hitItem,
          active && styles.itemActive,
        )}
        title={`${item.title}${item.path ? `\n${item.path}` : ''}`}
        disabled={disabled}
        onMouseEnter={onSelect}
        onFocus={onSelect}
        onClick={onExecute}
      >
        <span className={styles.itemIcon} data-role="icon">
          {item.icon}
        </span>
        <span className={styles.itemMain}>
          <span className={styles.itemTitle} data-role="title">
            {item.title}
          </span>
          {item.sub && (
            <span className={styles.itemSub} data-role="snippet">
              {item.sub}
            </span>
          )}
          {item.path && (
            <span className={styles.path}>
              <Folder size={11} aria-hidden />
              <span>{item.path.replaceAll('/', ' / ')}</span>
            </span>
          )}
        </span>
      </button>
      {item.type === 'document' && (
        <Button
          autoInsertSpace={false}
          type="text"
          size="small"
          className={styles.detailButton}
          aria-label={`查看完整信息：${item.title}`}
          aria-haspopup="dialog"
          title="查看完整标题与片段"
          icon={<ChevronDown size={14} aria-hidden />}
          disabled={disabled}
          onClick={onDetail}
        />
      )}
    </div>
  )
}
