import { Modal } from 'antd'
import { Folder, X } from 'lucide-react'
import type { PaletteItem } from './items'
import { useHostStyles } from './host-styles'

export function ResultDetail({
  item,
  busy,
  onReturn,
  afterClose,
  onOpen,
}: {
  item: PaletteItem | null
  busy: boolean
  onReturn: () => void
  afterClose: () => void
  onOpen: (item: PaletteItem) => void
}) {
  const { styles, cx } = useHostStyles()
  return (
    <Modal
      open={Boolean(item)}
      title="完整结果信息"
      width={480}
      className={styles.modal}
      style={{ top: '14vh' }}
      closeIcon={<X size={17} aria-hidden />}
      onCancel={onReturn}
      afterClose={afterClose}
      onOk={() => item && onOpen(item)}
      okText="打开这处命中"
      cancelText="返回搜索"
      okButtonProps={{
        autoInsertSpace: false,
        className: cx(styles.button, styles.primary),
        disabled: busy,
      }}
      cancelButtonProps={{ autoInsertSpace: false, className: styles.button, disabled: busy }}
      closable={{ disabled: busy, 'aria-label': '关闭完整信息' }}
      keyboard={!busy}
      mask={{ closable: !busy }}
      focusable={{ focusTriggerAfterClose: false }}
      destroyOnHidden
    >
      {item && (
        <>
          <h4 className={styles.detailTitle}>{item.title}</h4>
          <p className={styles.fullPath}>
            <Folder size={14} aria-hidden />
            {item.path || item.sub || '知识库根'}
          </p>
          <p className={styles.fullExcerpt}>{item.sub}</p>
        </>
      )}
    </Modal>
  )
}
