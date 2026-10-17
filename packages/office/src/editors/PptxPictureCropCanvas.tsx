import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Check, Crop, RotateCcw, X } from 'lucide-react'
import type { EmuRect, PictureElement } from '../../vendor/packages/pptx-engine/src/types.js'
import { ToolbarButton } from '../shell/EditorShell.js'
import {
  PICTURE_CROP_HANDLES,
  movePictureCropHandle,
  pictureCropCommit,
  pictureCropHandlePoint,
  pictureCropToLocal,
  pictureCropToSlide,
  pictureCropTransform,
  pptxPictureCropGeometry,
  pptxPictureCropUnavailableReason,
  type PictureCropFrame,
  type PictureCropGeometry,
  type PictureCropHandle,
  type PictureCropPoint,
  type PictureCropRect,
  type PictureCropViewport,
} from './pptx-picture-crop.js'
import './pptx-picture-crop.css'

export interface PptxPictureCropCanvasProps extends PictureCropViewport {
  documentId: string
  slideKey: string
  version: number
  element: PictureElement
  target: { slide: number; el: string }
  imageHref?: string
  disabled: boolean
  apply: (
    srcRect: PictureCropRect | null,
    expectedVersion: number,
    signal: AbortSignal,
    box?: EmuRect,
  ) => Promise<boolean>
  onExit: () => void
  onBusy: (busy: boolean) => void
}
const handleLabels: Record<PictureCropHandle, string> = {
  nw: '左上',
  n: '上',
  ne: '右上',
  e: '右',
  se: '右下',
  s: '下',
  sw: '左下',
  w: '左',
}
export function PptxPictureCropCanvas(props: PptxPictureCropCanvasProps) {
  const geometry = pptxPictureCropGeometry(props.element, props)
  if (!geometry)
    return (
      <div className="mimir-pptx-picture-crop-feedback" role="alert">
        <span>{pptxPictureCropUnavailableReason(props.element, props)}</span>
        <ToolbarButton label="关闭图片拖动裁切" onClick={props.onExit}>
          <X size={14} />
          关闭
        </ToolbarButton>
      </div>
    )
  return (
    <PictureCropGesture
      key={`${props.documentId}:${props.slideKey}:${props.target.slide}:${props.target.el}:${props.version}:${props.width}:${props.height}:${props.disabled}`}
      {...props}
      geometry={geometry}
    />
  )
}
function PictureCropGesture(props: PptxPictureCropCanvasProps & { geometry: PictureCropGeometry }) {
  const { geometry, width, height, version, disabled, apply, onExit, onBusy } = props,
    full = geometry.full,
    clipId = useId().replaceAll(':', ''),
    surface = useRef<SVGSVGElement>(null),
    root = useRef<HTMLDivElement>(null),
    pending = useRef<AbortController | null>(null),
    closed = useRef(false),
    drag = useRef<{
      pointer: number
      handle: PictureCropHandle
      start: PictureCropPoint
      frame: PictureCropFrame
    } | null>(null),
    callbacks = useRef({ onExit, onBusy }),
    [frame, setFrame] = useState(geometry.frame),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    callbacks.current = { onExit, onBusy }
  }, [onExit, onBusy])
  useEffect(() => {
    surface.current?.focus()
    return () => {
      drag.current = null
      pending.current?.abort()
      callbacks.current.onBusy(false)
    }
  }, [])
  const cancel = () => {
    if (closed.current) return
    closed.current = true
    drag.current = null
    pending.current?.abort()
    pending.current = null
    setBusy(false)
    callbacks.current.onBusy(false)
    callbacks.current.onExit()
  }
  useEffect(() => {
    const cancelOnBlur = () => {
      if (closed.current) return
      closed.current = true
      drag.current = null
      pending.current?.abort()
      pending.current = null
      setBusy(false)
      callbacks.current.onBusy(false)
      callbacks.current.onExit()
    }
    const escape = (event: globalThis.KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        !(event.target instanceof Node) ||
        !root.current?.contains(event.target)
      )
        return
      event.preventDefault()
      event.stopPropagation()
      cancelOnBlur()
    }
    window.addEventListener('blur', cancelOnBlur)
    document.addEventListener('keydown', escape, true)
    return () => {
      window.removeEventListener('blur', cancelOnBlur)
      document.removeEventListener('keydown', escape, true)
    }
  }, [])
  const changed =
    Math.abs(frame.x) > 0.001 ||
    Math.abs(frame.y) > 0.001 ||
    Math.abs(frame.w - geometry.frame.w) > 0.001 ||
    Math.abs(frame.h - geometry.frame.h) > 0.001
  const submit = async () => {
    if (closed.current || disabled || pending.current || !changed) return
    drag.current = null
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    callbacks.current.onBusy(true)
    setError('')
    const value = pictureCropCommit(geometry, frame)
    try {
      const accepted = await apply(value.srcRect, version, controller.signal, value.box)
      if (!controller.signal.aborted) {
        if (accepted) {
          closed.current = true
          callbacks.current.onExit()
        } else setError('裁切未应用，请重试；原图片已保留')
      }
    } catch {
      if (!controller.signal.aborted) setError('裁切未应用，请重试；原图片已保留')
    } finally {
      if (pending.current === controller) {
        pending.current = null
        setBusy(false)
        callbacks.current.onBusy(false)
      }
    }
  }
  const local = (event: { clientX: number; clientY: number }) => {
    const bounds = surface.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null
    return pictureCropToLocal(geometry, {
      x: ((event.clientX - bounds.left) * width) / bounds.width,
      y: ((event.clientY - bounds.top) * height) / bounds.height,
    })
  }
  const update = (event: PointerEvent<SVGSVGElement>) => {
    const current = drag.current,
      point = local(event)
    if (!current || current.pointer !== event.pointerId || !point) return
    setFrame(
      movePictureCropHandle(current.frame, full, current.handle, {
        x: point.x - current.start.x,
        y: point.y - current.start.y,
      }),
    )
    setError('')
  }
  const keyHandle = (handle: PictureCropHandle, event: KeyboardEvent<SVGGElement>) => {
    if (
      closed.current ||
      disabled ||
      busy ||
      pending.current ||
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    )
      return
    event.preventDefault()
    event.stopPropagation()
    const amount = event.shiftKey ? 10 : 1,
      origin = pictureCropToSlide(geometry, { x: 0, y: 0 }),
      delta = pictureCropToLocal(geometry, {
        x:
          origin.x +
          (event.key === 'ArrowRight' ? amount : event.key === 'ArrowLeft' ? -amount : 0),
        y: origin.y + (event.key === 'ArrowDown' ? amount : event.key === 'ArrowUp' ? -amount : 0),
      })
    setFrame((current) => movePictureCropHandle(current, full, handle, delta))
    setError('')
  }
  const imageHref = props.imageHref ?? props.element.dataUrl,
    retained = Math.round((frame.w / full.w) * (frame.h / full.h) * 100)
  return (
    <div ref={root} className="mimir-pptx-picture-crop-layer" aria-busy={busy}>
      <svg
        ref={surface}
        className="mimir-pptx-picture-crop-canvas"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        tabIndex={0}
        role="group"
        aria-label="图片拖动裁切画布"
        aria-describedby={`${clipId}-help`}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.stopPropagation()
            void submit()
          }
        }}
        onPointerDown={(event) => {
          event.stopPropagation()
          if (drag.current && drag.current.pointer !== event.pointerId) {
            setFrame(drag.current.frame)
            drag.current = null
          }
        }}
        onPointerMove={update}
        onPointerUp={(event) => {
          if (drag.current?.pointer !== event.pointerId) return
          update(event)
          drag.current = null
          surface.current?.releasePointerCapture?.(event.pointerId)
        }}
        onPointerCancel={(event) => {
          if (drag.current?.pointer !== event.pointerId) return
          setFrame(drag.current.frame)
          drag.current = null
        }}
        onLostPointerCapture={(event) => {
          if (drag.current?.pointer !== event.pointerId) return
          setFrame(drag.current.frame)
          drag.current = null
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <defs>
          <clipPath id={clipId}>
            <rect {...{ x: frame.x, y: frame.y, width: frame.w, height: frame.h }} />
          </clipPath>
        </defs>
        <g transform={pictureCropTransform(geometry)}>
          <rect
            x={full.x}
            y={full.y}
            width={full.w}
            height={full.h}
            className="mimir-pptx-picture-crop-backing"
          />
          {imageHref && (
            <>
              <image
                href={imageHref}
                x={full.x}
                y={full.y}
                width={full.w}
                height={full.h}
                preserveAspectRatio="none"
                opacity=".3"
              />
              <image
                href={imageHref}
                x={full.x}
                y={full.y}
                width={full.w}
                height={full.h}
                preserveAspectRatio="none"
                clipPath={`url(#${clipId})`}
              />
            </>
          )}
          <rect
            x={frame.x}
            y={frame.y}
            width={frame.w}
            height={frame.h}
            className="mimir-pptx-picture-crop-frame"
          />
          {[1 / 3, 2 / 3].map((ratio) => (
            <g key={ratio} className="mimir-pptx-picture-crop-guide">
              <line
                x1={frame.x + frame.w * ratio}
                y1={frame.y}
                x2={frame.x + frame.w * ratio}
                y2={frame.y + frame.h}
              />
              <line
                x1={frame.x}
                y1={frame.y + frame.h * ratio}
                x2={frame.x + frame.w}
                y2={frame.y + frame.h * ratio}
              />
            </g>
          ))}
        </g>
        {PICTURE_CROP_HANDLES.map((handle) => {
          const point = pictureCropToSlide(geometry, pictureCropHandlePoint(frame, handle))
          return (
            <g
              key={handle}
              transform={`translate(${point.x} ${point.y})`}
              className="mimir-pptx-picture-crop-handle"
              data-crop-handle={handle}
              tabIndex={disabled || busy ? -1 : 0}
              role="button"
              aria-disabled={disabled || busy}
              aria-label={`裁切${handleLabels[handle]}边缘`}
              onKeyDown={(event) => keyHandle(handle, event)}
              onPointerDown={(event) => {
                event.stopPropagation()
                if (drag.current && drag.current.pointer !== event.pointerId) {
                  setFrame(drag.current.frame)
                  drag.current = null
                  return
                }
                if (
                  disabled ||
                  busy ||
                  pending.current ||
                  event.button !== 0 ||
                  event.isPrimary === false
                )
                  return
                const start = local(event)
                if (!start) return
                event.preventDefault()
                event.currentTarget.focus()
                surface.current?.setPointerCapture?.(event.pointerId)
                drag.current = { pointer: event.pointerId, handle, start, frame }
              }}
            >
              <rect
                x={-12}
                y={-12}
                width={24}
                height={24}
                className="mimir-pptx-picture-crop-hit"
              />
              <rect x={-4} y={-4} width={8} height={8} className="mimir-pptx-picture-crop-grip" />
            </g>
          )
        })}
      </svg>
      <div className="mimir-pptx-picture-crop-feedback">
        <div className="mimir-pptx-picture-crop-description">
          <span className="mimir-pptx-picture-crop-title">
            <Crop size={14} />
            图片裁切<span>{retained}%</span>
          </span>
          <span id={`${clipId}-help`} role={error ? 'alert' : 'status'}>
            {error || (busy ? '正在应用裁切…' : '拖动边缘；方向键微调，Shift加速')}
          </span>
        </div>
        <div className="mimir-pptx-picture-crop-actions">
          <ToolbarButton
            label="恢复图片完整范围"
            disabled={disabled || busy || (!props.element.srcRect && !changed)}
            disabledReason="图片已显示完整范围"
            onClick={() => {
              setFrame(full)
              setError('')
            }}
          >
            <RotateCcw size={14} />
            完整
          </ToolbarButton>
          <ToolbarButton label="取消图片拖动裁切" onClick={cancel}>
            <X size={14} />
            取消
          </ToolbarButton>
          <ToolbarButton
            label="应用拖动裁切"
            primary
            disabled={disabled || busy || !changed}
            disabledReason={busy ? '正在应用裁切' : '请先拖动裁切边缘'}
            onClick={() => void submit()}
          >
            <Check size={14} />
          </ToolbarButton>
        </div>
      </div>
    </div>
  )
}
