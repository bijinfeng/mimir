import { Button } from 'antd'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useId, useState } from 'react'
import type { PaletteItem } from './items'
import { useStyles } from './styles'

export function PaletteRow({
  item,
  active,
  disabled,
  onSelect,
  onExecute,
}: {
  item: PaletteItem
  active: boolean
  disabled: boolean
  onSelect: () => void
  onExecute: () => void
}) {
  const { styles, cx } = useStyles()
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()
  return (
    <div className={styles.row}>
      <button
        type="button"
        data-item-key={item.key}
        aria-current={active ? 'true' : undefined}
        className={cx(
          styles.item,
          item.type === 'document' && styles.documentItem,
          active && styles.itemActive,
        )}
        disabled={disabled}
        onMouseEnter={onSelect}
        onFocus={onSelect}
        onClick={onExecute}
      >
        <span className={styles.itemIcon}>{item.icon}</span>
        <span className={styles.itemMain}>
          <span className={styles.itemTitle} data-role="title">
            {item.title}
          </span>
          {item.sub && <span className={styles.itemSub}>{item.sub}</span>}
          {item.path && <span className={styles.path}>{item.path}</span>}
        </span>
      </button>
      {item.type === 'document' && (
        <Button
          type="text"
          size="small"
          className={styles.detailButton}
          aria-label={`查看完整信息：${item.title}`}
          aria-expanded={expanded}
          aria-controls={detailsId}
          icon={expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          disabled={disabled}
          onClick={() => setExpanded((value) => !value)}
        />
      )}
      {expanded && (
        <div id={detailsId} className={styles.detail}>
          {[item.title, item.path, item.sub].filter(Boolean).join('\n')}
        </div>
      )}
    </div>
  )
}
