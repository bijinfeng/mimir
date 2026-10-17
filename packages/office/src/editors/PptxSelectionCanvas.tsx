import { useEffect, useRef, useState, type RefObject } from 'react'
import './pptx-selection-canvas.css'
type Rect = { x: number; y: number; width: number; height: number }
/** Blank-canvas marquee; the SVG remains the only hit-test source. */
export function PptxSelectionCanvas({
  host,
  binding,
  ids,
  selectedIds,
  disabled,
  onSelect,
}: {
  host: RefObject<HTMLDivElement | null>
  binding: string
  ids: readonly string[]
  selectedIds: readonly string[]
  disabled: boolean
  onSelect: (ids: string[]) => void
}) {
  const [rect, setRect] = useState<Rect | null>(null)
  const current = useRef({ ids, selectedIds, onSelect })
  useEffect(() => {
    current.current = { ids, selectedIds, onSelect }
  })
  useEffect(() => {
    const node = host.current
    if (!node || disabled || !binding) return
    let drag: {
      pointerId: number
      x: number
      y: number
      additive: boolean
      before: string[]
      moved: boolean
    } | null = null
    let suppressClick = false
    const clear = () => {
      const previous = drag
      drag = null
      if (previous && node.hasPointerCapture?.(previous.pointerId))
        node.releasePointerCapture(previous.pointerId)
      setRect(null)
    }
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || drag || !event.isPrimary) return
      if ((event.target as Element).closest('[data-element-id]')) return
      const box = node.getBoundingClientRect()
      if (!box.width || !box.height) return
      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        additive: event.shiftKey || event.ctrlKey || event.metaKey,
        before: [...current.current.selectedIds],
        moved: false,
      }
      suppressClick = false
      node.focus({ preventScroll: true })
      node.setPointerCapture?.(event.pointerId)
      event.preventDefault()
    }
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      const box = node.getBoundingClientRect()
      const left = Math.max(box.left, Math.min(drag.x, event.clientX)),
        top = Math.max(box.top, Math.min(drag.y, event.clientY))
      const right = Math.min(box.right, Math.max(drag.x, event.clientX)),
        bottom = Math.min(box.bottom, Math.max(drag.y, event.clientY))
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4 && !drag.moved) return
      drag.moved = true
      setRect({
        x: left - box.left,
        y: top - box.top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      })
      event.preventDefault()
    }
    const up = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      if (drag.moved) {
        const left = Math.min(drag.x, event.clientX),
          right = Math.max(drag.x, event.clientX)
        const top = Math.min(drag.y, event.clientY),
          bottom = Math.max(drag.y, event.clientY)
        const wanted = new Set(current.current.ids)
        const hit = [...node.querySelectorAll('[data-element-id]')]
          .filter((item) => wanted.has(item.getAttribute('data-element-id') ?? ''))
          .filter((item) => {
            const box = item.getBoundingClientRect()
            return (
              box.width > 0 &&
              box.height > 0 &&
              box.right > left &&
              box.left < right &&
              box.bottom > top &&
              box.top < bottom
            )
          })
          .map((item) => item.getAttribute('data-element-id')!)
        current.current.onSelect([...new Set([...(drag.additive ? drag.before : []), ...hit])])
        suppressClick = true
      }
      clear()
    }
    const click = (event: MouseEvent) => {
      if (!suppressClick) return
      suppressClick = false
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const cancel = (event: PointerEvent) => {
      if (drag?.pointerId === event.pointerId) clear()
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && drag) {
        event.preventDefault()
        event.stopPropagation()
        suppressClick = drag.moved
        clear()
      }
    }
    node.addEventListener('pointerdown', down)
    node.addEventListener('click', click, true)
    node.addEventListener('lostpointercapture', cancel)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key, true)
    window.addEventListener('blur', clear)
    return () => {
      clear()
      node.removeEventListener('pointerdown', down)
      node.removeEventListener('click', click, true)
      node.removeEventListener('lostpointercapture', cancel)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('blur', clear)
    }
  }, [host, binding, disabled])
  return rect ? (
    <div
      className="mimir-pptx-marquee"
      aria-hidden="true"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    />
  ) : null
}
