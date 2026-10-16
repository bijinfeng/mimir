import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { PptxManualShape } from '@mimir/shared'
import { ToolbarButton } from '../shell/EditorShell.js'
import { pptxShapeLabel, pptxShapePreview, isPptxLineKind } from './pptx-shape-presets.js'
import {
  resolveShapeDraw,
  shapeCanvasPoint,
  shapeInsertInput,
  type ShapeDrawRect,
  type ShapePoint,
} from './pptx-shape-insert.js'
import './pptx-shape-insert.css'

export interface PptxShapeInsertCanvasProps {
  documentId: string
  slideKey: string
  slide: number
  version: number
  kind: PptxManualShape['kind'] | null
  width: number
  height: number
  slideWidth: number
  slideHeight: number
  disabled: boolean
  apply: (input: PptxManualShape, expectedVersion: number, signal: AbortSignal) => Promise<boolean>
  onExit: () => void
  onBusy: (busy: boolean) => void
}
export function PptxShapeInsertCanvas(props: PptxShapeInsertCanvasProps) {
  if (!props.kind) return null
  return (
    <ShapeGesture
      key={`${props.documentId}:${props.slideKey}:${props.version}:${props.kind}:${props.width}:${props.height}:${props.disabled}`}
      {...props}
      kind={props.kind}
    />
  )
}
function ShapeGesture(props: PptxShapeInsertCanvasProps & { kind: PptxManualShape['kind'] }) {
  const { kind, width, height, slide, version, disabled, apply, onExit, onBusy } = props
  const surface = useRef<SVGSVGElement>(null)
  const draft = useRef<{ pointer: number; start: ShapePoint; screen: ShapePoint } | null>(null)
  const pending = useRef<AbortController | null>(null)
  const [preview, setPreview] = useState<ShapeDrawRect | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cancel = () => {
    draft.current = null
    pending.current?.abort()
    pending.current = null
    setPreview(null)
    setBusy(false)
    onBusy(false)
  }
  useEffect(() => {
    surface.current?.focus()
    return () => {
      draft.current = null
      pending.current?.abort()
      onBusy(false)
    }
  }, [onBusy])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      const editor = surface.current?.closest('.mimir-editor')
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        !(event.target instanceof Node) ||
        !editor?.contains(event.target)
      )
        return
      event.preventDefault()
      event.stopPropagation()
      draft.current = null
      pending.current?.abort()
      pending.current = null
      setPreview(null)
      setBusy(false)
      onBusy(false)
      onExit()
    }
    const blur = () => {
      draft.current = null
      pending.current?.abort()
      pending.current = null
      setPreview(null)
      setBusy(false)
      onBusy(false)
      onExit()
    }
    document.addEventListener('keydown', escape, true)
    window.addEventListener('blur', blur)
    return () => {
      document.removeEventListener('keydown', escape, true)
      window.removeEventListener('blur', blur)
    }
  }, [onBusy, onExit])
  const point = (event: { clientX: number; clientY: number }) => {
    const bounds = surface.current?.getBoundingClientRect()
    return bounds
      ? shapeCanvasPoint({ x: event.clientX, y: event.clientY }, bounds, width, height)
      : null
  }
  const rectangle = (event: PointerEvent<SVGSVGElement>) => {
    const current = draft.current,
      end = point(event)
    if (!current || current.pointer !== event.pointerId || !end) return null
    return resolveShapeDraw(
      kind,
      current.start,
      end,
      event.shiftKey,
      Math.hypot(event.clientX - current.screen.x, event.clientY - current.screen.y),
    )
  }
  const finish = async (event: PointerEvent<SVGSVGElement>) => {
    const rect = rectangle(event)
    if (!rect || !draft.current) return
    draft.current = null
    surface.current?.releasePointerCapture?.(event.pointerId)
    setPreview(null)
    if (disabled || pending.current || (!rect.w && !rect.h)) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    onBusy(true)
    setError('')
    try {
      const changed = await apply(
        shapeInsertInput(kind, slide, rect, props),
        version,
        controller.signal,
      )
      if (!controller.signal.aborted) {
        if (changed) onExit()
        else setError('形状未插入，请重试；原有内容已保留')
      }
    } catch {
      if (!controller.signal.aborted) setError('形状未插入，请重试；原有内容已保留')
    } finally {
      if (pending.current === controller) {
        pending.current = null
        setBusy(false)
        onBusy(false)
      }
    }
  }
  const paths = preview
    ? pptxShapePreview(kind, Math.max(1, preview.w), Math.max(1, preview.h))
    : null
  const line = isPptxLineKind(kind)
  return (
    <div className="mimir-pptx-shape-insert-layer">
      <svg
        ref={surface}
        className="mimir-pptx-shape-insert-canvas"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        tabIndex={0}
        role="img"
        aria-label={`绘制${pptxShapeLabel(kind)}的幻灯片画布（Escape取消）`}
        aria-busy={busy}
        onPointerDown={(event) => {
          if (draft.current && draft.current.pointer !== event.pointerId) {
            cancel()
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
          const start = point(event)
          if (!start) return
          event.preventDefault()
          event.stopPropagation()
          surface.current?.focus()
          surface.current?.setPointerCapture?.(event.pointerId)
          draft.current = {
            pointer: event.pointerId,
            start,
            screen: { x: event.clientX, y: event.clientY },
          }
          setError('')
        }}
        onPointerMove={(event) => {
          const current = draft.current
          if (current?.pointer !== event.pointerId) return
          if (Math.hypot(event.clientX - current.screen.x, event.clientY - current.screen.y) > 3)
            setPreview(rectangle(event))
        }}
        onPointerUp={(event) => {
          void finish(event)
        }}
        onPointerCancel={(event) => {
          if (draft.current?.pointer === event.pointerId) cancel()
        }}
        onLostPointerCapture={(event) => {
          if (draft.current?.pointer === event.pointerId) cancel()
        }}
        onBlur={() => {
          if (draft.current || pending.current) cancel()
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {preview && (
          <g
            transform={`translate(${preview.x} ${preview.y})`}
            className="mimir-pptx-shape-insert-preview"
          >
            {!line && <rect width={preview.w} height={preview.h} fill="none" />}
            <g
              transform={
                line
                  ? `translate(${preview.flipH ? preview.w : 0} ${preview.flipV ? 0 : preview.h}) scale(${preview.flipH ? -1 : 1} ${preview.flipV ? 1 : -1})`
                  : undefined
              }
            >
              {paths?.path && <path d={paths.path} />}
              {paths?.fillPath && <path d={paths.fillPath} />}
              {paths?.strokePath && <path d={paths.strokePath} fill="none" />}
            </g>
          </g>
        )}
      </svg>
      <div className="mimir-pptx-shape-insert-feedback">
        <span role={error ? 'alert' : 'status'}>
          {error ||
            (busy
              ? '正在插入形状…'
              : `${pptxShapeLabel(kind)}：点击放置，拖动定大小；Shift约束，Esc取消`)}
        </span>
        <ToolbarButton
          label="取消绘制形状"
          onClick={() => {
            cancel()
            onExit()
          }}
        >
          取消
        </ToolbarButton>
      </div>
    </div>
  )
}
