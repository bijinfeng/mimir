import { Button, Dropdown } from 'antd'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import './thumbnail-sidebar.css'

export interface ThumbnailPage {
  key: string
  label?: string
}
export interface ThumbnailSidebarProps {
  pages: readonly ThumbnailPage[]
  activeIndex: number
  onSelect(index: number): void
  onInsert(afterIndex: number): void
  onDuplicate(index: number): void
  onDelete(index: number): void
  onMove(fromIndex: number, toIndex: number): void
  renderThumbnail(index: number): ReactNode
  noun?: string
  children: ReactNode
}

type ThumbnailItemProps = Pick<
  ThumbnailSidebarProps,
  'renderThumbnail' | 'onSelect' | 'onInsert' | 'onDuplicate' | 'onDelete' | 'onMove'
> & {
  page: ThumbnailPage
  index: number
  count: number
  active: boolean
  noun: string
  scrollRoot: React.RefObject<HTMLDivElement | null>
  dragIndex: number | null
  dropAt: number | null
  onDragStart(index: number, event: DragEvent<HTMLDivElement>): void
  onDragOver(index: number, event: DragEvent<HTMLDivElement>): void
  onDrop(event: DragEvent<HTMLDivElement>): void
  onDragEnd(): void
}

function ThumbnailItem({
  page,
  index,
  count,
  active,
  noun,
  scrollRoot,
  renderThumbnail,
  onSelect,
  onInsert,
  onDuplicate,
  onDelete,
  onMove,
  dragIndex,
  dropAt,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: ThumbnailItemProps) {
  const itemRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(active || index < 3)
  const [menuOpen, setMenuOpen] = useState(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdPoint = useRef<{ x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const cancelHold = () => {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current)
    holdTimer.current = null
    holdPoint.current = null
  }
  useEffect(
    () => () => {
      if (holdTimer.current !== null) clearTimeout(holdTimer.current)
      if (suppressTimer.current !== null) clearTimeout(suppressTimer.current)
    },
    [],
  )
  useEffect(() => {
    if (!menuOpen) return
    const timer = setTimeout(() => {
      const root = itemRef.current?.closest('.mimir-page-browser')
      const popup = [...(root?.querySelectorAll<HTMLElement>('.ant-dropdown') ?? [])].findLast(
        (node) => !node.classList.contains('ant-dropdown-hidden'),
      )
      popup?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus()
    }, 0)
    return () => clearTimeout(timer)
  }, [menuOpen])
  const openAt = (x: number, y: number) => {
    itemRef.current?.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      }),
    )
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
    event.preventDefault()
    const rect = itemRef.current?.getBoundingClientRect()
    if (rect) openAt(rect.left + rect.width / 2, rect.top + rect.height / 2)
  }
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return
    cancelHold()
    const point = { x: event.clientX, y: event.clientY }
    holdPoint.current = point
    holdTimer.current = setTimeout(() => {
      suppressClick.current = true
      suppressTimer.current = setTimeout(() => {
        suppressClick.current = false
      }, 800)
      holdTimer.current = null
      openAt(point.x, point.y)
    }, 550)
  }
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = holdPoint.current
    if (point && Math.hypot(event.clientX - point.x, event.clientY - point.y) > 10) cancelHold()
  }
  useEffect(() => {
    const node = itemRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
      { root: scrollRoot.current, rootMargin: '220px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [scrollRoot])
  useEffect(() => {
    if (active && typeof itemRef.current?.scrollIntoView === 'function') {
      itemRef.current.scrollIntoView({ block: 'nearest' })
    }
  }, [active])
  return (
    <Dropdown
      trigger={['contextMenu']}
      autoFocus
      open={menuOpen}
      onOpenChange={setMenuOpen}
      placement="bottomLeft"
      destroyOnHidden
      getPopupContainer={(node) =>
        (node.closest('.mimir-page-browser') as HTMLElement) ?? document.body
      }
      menu={{
        items: [
          { key: 'insert', label: `在此${noun}后新增` },
          { key: 'duplicate', label: `复制此${noun}` },
          {
            key: 'delete',
            label:
              count <= 1
                ? `删除此${noun}（${noun === '幻灯片' ? '至少保留一张幻灯片' : '至少保留一页'}）`
                : `删除此${noun}`,
            disabled: count <= 1,
            danger: true,
          },
          { type: 'divider' },
          { key: 'up', label: '上移', disabled: index === 0 },
          { key: 'down', label: '下移', disabled: index === count - 1 },
        ],
        onClick: ({ key }) => {
          if (key === 'insert') onInsert(index)
          if (key === 'duplicate') onDuplicate(index)
          if (key === 'delete') onDelete(index)
          if (key === 'up') onMove(index, index - 1)
          if (key === 'down') onMove(index, index + 1)
          setMenuOpen(false)
        },
      }}
    >
      <div
        ref={itemRef}
        className="mimir-page-browser__item"
        data-active={active}
        data-dragging={dragIndex === index}
        data-drop-before={dropAt === index}
        data-drop-after={dropAt === count && index === count - 1}
        draggable
        onDragStart={(event) => {
          cancelHold()
          onDragStart(index, event)
        }}
        onDragOver={(event) => onDragOver(index, event)}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
      >
        <Button
          type="text"
          className="mimir-page-browser__preview-button"
          aria-label={`第 ${index + 1} ${noun}${page.label ? `：${page.label}` : ''}`}
          aria-current={active ? 'page' : undefined}
          aria-keyshortcuts="Shift+F10"
          title="右键或长按打开页面操作；键盘可按 Shift+F10"
          onKeyDown={onKeyDown}
          onClick={(event) => {
            if (suppressClick.current) {
              event.preventDefault()
              suppressClick.current = false
              if (suppressTimer.current !== null) clearTimeout(suppressTimer.current)
              suppressTimer.current = null
              return
            }
            onSelect(index)
          }}
        >
          <span className="mimir-page-browser__preview" aria-hidden="true">
            {active || visible || typeof IntersectionObserver === 'undefined'
              ? renderThumbnail(index)
              : null}
          </span>
        </Button>
        <div className="mimir-page-browser__item-footer">
          <span className="mimir-page-browser__number">{index + 1}</span>
        </div>
      </div>
    </Dropdown>
  )
}

/** The list owns navigation controls; the editor owns page data and persistence. */
export function ThumbnailSidebar({
  pages,
  activeIndex,
  onSelect,
  onInsert,
  onDuplicate,
  onDelete,
  onMove,
  renderThumbnail,
  noun = '页',
  children,
}: ThumbnailSidebarProps) {
  const scrollRoot = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(true)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const onDragStart = (index: number, event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
    setDragIndex(index)
    setDropAt(null)
  }
  const onDragOver = (index: number, event: DragEvent<HTMLDivElement>) => {
    if (dragIndex === null) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const rect = event.currentTarget.getBoundingClientRect()
    setDropAt(index + (event.clientY >= rect.top + rect.height / 2 ? 1 : 0))
  }
  const onDragEnd = () => {
    setDragIndex(null)
    setDropAt(null)
  }
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (dragIndex !== null && dropAt !== null) {
      const target = dropAt > dragIndex ? dropAt - 1 : dropAt
      if (target !== dragIndex) onMove(dragIndex, target)
    }
    onDragEnd()
  }
  return (
    <div className="mimir-page-browser" data-open={open}>
      <aside className="mimir-page-browser__sidebar" aria-label={`${noun}缩略图`} hidden={!open}>
        <div className="mimir-page-browser__header">
          <span>{noun}缩略图</span>
          <Button
            size="small"
            type="text"
            aria-label={`新增${noun}`}
            title={`新增${noun}`}
            icon={<Plus size={16} aria-hidden="true" />}
            onClick={() => onInsert(Math.max(0, activeIndex))}
          />
          <Button
            size="small"
            type="text"
            aria-label="收起缩略图"
            title="收起缩略图"
            icon={<ChevronLeft size={16} aria-hidden="true" />}
            onClick={() => setOpen(false)}
          />
        </div>
        <div ref={scrollRoot} className="mimir-page-browser__list">
          {pages.map((page, index) => (
            <ThumbnailItem
              key={page.key}
              page={page}
              index={index}
              count={pages.length}
              active={index === activeIndex}
              noun={noun}
              scrollRoot={scrollRoot}
              renderThumbnail={renderThumbnail}
              onSelect={onSelect}
              onInsert={onInsert}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              onMove={onMove}
              dragIndex={dragIndex}
              dropAt={dropAt}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      </aside>
      <div className="mimir-page-browser__canvas">
        {!open && (
          <Button
            size="small"
            type="text"
            className="mimir-page-browser__reopen"
            aria-label="显示缩略图"
            title="显示缩略图"
            icon={<ChevronRight size={16} aria-hidden="true" />}
            onClick={() => setOpen(true)}
          />
        )}
        {children}
      </div>
    </div>
  )
}
