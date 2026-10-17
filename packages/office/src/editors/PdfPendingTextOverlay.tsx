import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { PdfPendingTextInsert } from '../agent/pdf-agent.js'
import './pdf-text-controls.css'

type Geometry = { x: number; y: number; width: number }
export function PdfPendingTextOverlay({
  insert,
  size,
  onCommit,
}: {
  insert: PdfPendingTextInsert & { width: number; height: number }
  size: { width: number; height: number }
  onCommit(geometry: Geometry): void
}) {
  const [draft, setDraft] = useState<Geometry | null>(null)
  const draftRef = useRef<Geometry | null>(null)
  const gesture = useRef<{
    pointer: number
    x: number
    y: number
    scaleX: number
    scaleY: number
    initial: Geometry
    resize: boolean
  } | null>(null)
  const value = draft ?? { x: insert.x, y: insert.y, width: insert.width }
  const cancel = () => {
    gesture.current = null
    draftRef.current = null
    setDraft(null)
  }
  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (gesture.current || event.button !== 0) return
    const sheet = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!sheet?.width || !sheet.height) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scaleX: size.width / sheet.width,
      scaleY: size.height / sheet.height,
      initial: value,
      resize: (event.target as Element).closest('[data-resize]') !== null,
    }
  }
  return (
    <div
      className="mimir-pdf-text-gesture"
      role="group"
      aria-label="调整待保存文字位置与宽度"
      tabIndex={0}
      style={{
        left: `${(value.x / size.width) * 100}%`,
        top: `${(value.y / size.height) * 100}%`,
        width: `${(value.width / size.width) * 100}%`,
        height: `${(insert.height / size.height) * 100}%`,
      }}
      onPointerDown={begin}
      onPointerMove={(event) => {
        const current = gesture.current
        if (!current || current.pointer !== event.pointerId) return
        const dx = (event.clientX - current.x) * current.scaleX,
          dy = (event.clientY - current.y) * current.scaleY
        const next = current.resize
          ? {
              ...current.initial,
              width: Math.max(
                1,
                Math.min(size.width - current.initial.x, current.initial.width + dx),
              ),
            }
          : {
              ...current.initial,
              x: Math.max(0, Math.min(size.width - current.initial.width, current.initial.x + dx)),
              y: Math.max(0, Math.min(size.height - insert.height, current.initial.y + dy)),
            }
        draftRef.current = next
        setDraft(next)
      }}
      onPointerUp={(event) => {
        if (gesture.current?.pointer !== event.pointerId) return
        const final = draftRef.current
        const changed =
          final && (final.x !== insert.x || final.y !== insert.y || final.width !== insert.width)
        cancel()
        if (changed && final) onCommit(final)
      }}
      onPointerCancel={(event) => {
        if (gesture.current?.pointer === event.pointerId) cancel()
      }}
      onLostPointerCapture={(event) => {
        if (gesture.current?.pointer === event.pointerId) cancel()
      }}
      onBlur={cancel}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && gesture.current) {
          event.preventDefault()
          event.stopPropagation()
          cancel()
          return
        }
        if (
          !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) ||
          gesture.current
        )
          return
        event.preventDefault()
        event.stopPropagation()
        const step = event.shiftKey ? 10 : 1
        const next = { ...value }
        if (event.key === 'ArrowLeft') next.x = Math.max(0, next.x - step)
        if (event.key === 'ArrowRight') next.x = Math.min(size.width - next.width, next.x + step)
        if (event.key === 'ArrowUp') next.y = Math.max(0, next.y - step)
        if (event.key === 'ArrowDown') next.y = Math.min(size.height - insert.height, next.y + step)
        if (next.x !== value.x || next.y !== value.y) onCommit(next)
      }}
    >
      <span
        className="mimir-pdf-text-gesture__resize"
        data-resize="true"
        aria-label="调整文字换行宽度"
        role="slider"
        tabIndex={0}
        aria-valuemin={1}
        aria-valuemax={size.width - insert.x}
        aria-valuenow={value.width}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || gesture.current) return
          event.preventDefault()
          event.stopPropagation()
          const width = Math.max(
            1,
            Math.min(
              size.width - value.x,
              value.width + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 10 : 1),
            ),
          )
          if (width !== value.width) onCommit({ ...value, width })
        }}
      />
    </div>
  )
}
