import { useEffect, useRef, useState } from 'react'
import {
  cropInsets,
  cropRect,
  moveDocxCrop,
  type DocxCropHandle,
  type DocxCropRect,
} from './docx-image-crop.js'
import type { DocxImageInsets } from './docx-image.js'

const HANDLES = [
  ['nw', '左上'],
  ['n', '顶部'],
  ['ne', '右上'],
  ['e', '右侧'],
  ['se', '右下'],
  ['s', '底部'],
  ['sw', '左下'],
  ['w', '左侧'],
] as const
export function DocxImageCropPreview({
  source,
  insets,
  disabled,
  onChange,
  onSize,
}: {
  source: string
  insets: DocxImageInsets
  disabled: boolean
  onChange: (value: DocxImageInsets) => void
  onSize?: (size: { width: number; height: number }) => void
}) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const image = useRef<HTMLImageElement>(null)
  const gesture = useRef<{
    id: number
    x: number
    y: number
    width: number
    height: number
    rect: DocxCropRect
    handle: DocxCropHandle
    control: HTMLButtonElement
    restore: (insets: DocxImageInsets) => void
  } | null>(null)
  useEffect(() => {
    const blur = () => {
      const current = gesture.current
      gesture.current = null
      if (!current) return
      if (current.control.hasPointerCapture?.(current.id))
        current.control.releasePointerCapture(current.id)
      current.restore(cropInsets(current.rect))
    }
    window.addEventListener('blur', blur)
    return () => window.removeEventListener('blur', blur)
  }, [])
  const rect = cropRect(insets)
  const valid =
    rect.left >= 0 &&
    rect.top >= 0 &&
    rect.right <= 1 &&
    rect.bottom <= 1 &&
    rect.left < rect.right &&
    rect.top < rect.bottom
  const end = (cancel: boolean) => {
    const current = gesture.current
    if (!current) return
    gesture.current = null
    if (current.control.hasPointerCapture?.(current.id))
      current.control.releasePointerCapture(current.id)
    if (cancel) onChange(cropInsets(current.rect))
  }
  return (
    <div
      className="mimir-docx-crop"
      style={{
        width: '100%',
        maxWidth: size.height ? (180 * size.width) / size.height : undefined,
      }}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape' && gesture.current) {
          event.preventDefault()
          event.stopPropagation()
          end(true)
        }
      }}
    >
      <img
        ref={image}
        src={source}
        alt="裁切原图预览"
        draggable={false}
        onLoad={(event) => {
          const next = {
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          }
          setSize(next)
          onSize?.(next)
        }}
      />
      {size.width > 0 && valid && (
        <div
          className="mimir-docx-crop__region"
          style={{
            left: `${insets.left}%`,
            top: `${insets.top}%`,
            right: `${insets.right}%`,
            bottom: `${insets.bottom}%`,
          }}
        >
          {(
            [
              ['move', '移动保留区域'],
              ...HANDLES.map(([key, name]) => [key, `裁切${name}边界`] as const),
            ] as const
          ).map(([handle, label]) => (
            <button
              key={handle}
              type="button"
              aria-label={label}
              title={`${label}；方向键移动，Shift 加速`}
              disabled={disabled}
              className={`mimir-docx-crop__handle mimir-docx-crop__handle--${handle}`}
              onPointerDown={(event) => {
                if (disabled || gesture.current || event.button !== 0) return
                const bounds = image.current?.getBoundingClientRect()
                if (!bounds?.width || !bounds.height) return
                event.preventDefault()
                event.currentTarget.focus()
                gesture.current = {
                  id: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                  width: bounds.width,
                  height: bounds.height,
                  rect,
                  handle: handle as DocxCropHandle,
                  control: event.currentTarget,
                  restore: onChange,
                }
                event.currentTarget.setPointerCapture?.(event.pointerId)
              }}
              onPointerMove={(event) => {
                const g = gesture.current
                if (!g || g.id !== event.pointerId || disabled) return
                onChange(
                  cropInsets(
                    moveDocxCrop(
                      g.rect,
                      g.handle,
                      (event.clientX - g.x) / g.width,
                      (event.clientY - g.y) / g.height,
                      size.width,
                      size.height,
                    ),
                  ),
                )
              }}
              onPointerUp={(event) => {
                if (gesture.current?.id === event.pointerId) end(false)
              }}
              onPointerCancel={(event) => {
                if (gesture.current?.id === event.pointerId) end(true)
              }}
              onLostPointerCapture={(event) => {
                if (gesture.current?.id === event.pointerId) end(false)
              }}
              onKeyDown={(event) => {
                const delta = {
                  ArrowLeft: [-1, 0],
                  ArrowRight: [1, 0],
                  ArrowUp: [0, -1],
                  ArrowDown: [0, 1],
                }[event.key]
                if (!delta || disabled) return
                event.preventDefault()
                event.stopPropagation()
                const step = event.shiftKey ? 10 : 1
                onChange(
                  cropInsets(
                    moveDocxCrop(
                      rect,
                      handle as DocxCropHandle,
                      (delta[0]! * step) / size.width,
                      (delta[1]! * step) / size.height,
                      size.width,
                      size.height,
                    ),
                  ),
                )
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
