import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { PptxManualInk, PptxInkStroke } from '@mimir/shared'
import type { RenderSlide } from '../../vendor/packages/pptx-render/src/render-tree.js'
import {
  HIGHLIGHTER_ALPHA,
  inkNodeHitTest,
  inkNodesOf,
  strokePathD,
  type InkPoint,
  type InkPreset,
  type InkTool,
} from '../pptx-ink.js'
import { rasterizeInk } from './pptx-ink-raster.js'
import './pptx-ink.css'

type Draft = {
  pointer: number
  version: number
  tool: InkTool
  stroke: PptxInkStroke
  ids: Set<string>
  last: InkPoint
  overflow?: boolean
}
export interface PptxInkCanvasProps {
  slide: number
  version: number
  tree: RenderSlide
  width: number
  height: number
  tool: InkTool
  preset: InkPreset
  disabled: boolean
  apply: (input: PptxManualInk, expectedVersion: number, signal: AbortSignal) => Promise<boolean>
  onExit: () => void
  onBusy: (busy: boolean) => void
}
/** One pointer gesture = one atomic native transaction and one existing history entry. */
export function PptxInkCanvas(props: PptxInkCanvasProps) {
  return <InkGesture key={`${props.slide}:${props.version}:${props.tool}`} {...props} />
}
function InkGesture({
  slide,
  version,
  tree,
  width,
  height,
  tool,
  preset,
  disabled,
  apply,
  onExit,
  onBusy,
}: PptxInkCanvasProps) {
  const entries = useMemo(() => inkNodesOf(tree), [tree])
  const draft = useRef<Draft | null>(null),
    pending = useRef<AbortController | null>(null)
  const surface = useRef<SVGSVGElement>(null)
  const [preview, setPreview] = useState<PptxInkStroke | null>(null),
    [erased, setErased] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const cancelDraft = () => {
    draft.current = null
    setPreview(null)
    setErased([])
  }
  useEffect(
    () => () => {
      draft.current = null
      pending.current?.abort()
      onBusy(false)
    },
    [onBusy],
  )
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const editor = surface.current?.closest('.mimir-editor')
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        !(event.target instanceof Node) ||
        !editor?.contains(event.target)
      )
        return
      event.preventDefault()
      draft.current = null
      pending.current?.abort()
      pending.current = null
      setPreview(null)
      setErased([])
      setBusy(false)
      onBusy(false)
      onExit()
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [onBusy, onExit])
  const point = (event: { clientX: number; clientY: number }) => {
    const bounds = surface.current?.getBoundingClientRect()
    if (!bounds?.width || !bounds.height) return null
    return {
      x: Math.max(0, Math.min(width, ((event.clientX - bounds.left) * width) / bounds.width)),
      y: Math.max(0, Math.min(height, ((event.clientY - bounds.top) * height) / bounds.height)),
    }
  }
  const eraseAt = (current: Draft, next: InkPoint) => {
    const distance = Math.hypot(next.x - current.last.x, next.y - current.last.y),
      steps = Math.max(1, Math.ceil(distance / 4))
    for (let step = 0; step <= steps; step++) {
      const p = {
        x: current.last.x + ((next.x - current.last.x) * step) / steps,
        y: current.last.y + ((next.y - current.last.y) * step) / steps,
      }
      for (const entry of entries)
        if (inkNodeHitTest(entry, p, 6))
          current.ids.add(entry.node.durableId ?? entry.node.sourceId)
    }
    current.last = next
    setErased([...current.ids])
  }
  const sample = (event: PointerEvent<SVGSVGElement>) => {
    const current = draft.current
    if (!current || current.pointer !== event.pointerId) return
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [event]
    for (const item of samples.length ? samples : [event]) {
      const p = point(item)
      if (!p) continue
      if (current.tool === 'eraser') eraseAt(current, p)
      else if (current.stroke.points.length >= 20000) current.overflow = true
      else if (Math.hypot(p.x - current.last.x, p.y - current.last.y) >= 0.35) {
        current.stroke.points.push(p)
        current.last = p
      }
    }
    if (current.tool !== 'eraser')
      setPreview({ ...current.stroke, points: [...current.stroke.points] })
  }
  const finish = async (event: PointerEvent<SVGSVGElement>) => {
    const current = draft.current
    if (!current || current.pointer !== event.pointerId) return
    sample(event)
    draft.current = null
    surface.current?.releasePointerCapture?.(event.pointerId)
    if (current.overflow) {
      cancelDraft()
      setError('这笔采样过长，请分成几笔绘制')
      return
    }
    if (disabled || current.version !== version || current.tool !== tool) {
      cancelDraft()
      return
    }
    if (current.tool === 'eraser' && !current.ids.size) {
      cancelDraft()
      return
    }
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    onBusy(true)
    setError('')
    try {
      const input: PptxManualInk =
        current.tool === 'eraser'
          ? { kind: 'erase', slide, ids: [...current.ids] }
          : {
              kind: 'add',
              slide,
              fitWidthPx: width,
              stroke: current.stroke,
              png: rasterizeInk(current.stroke),
            }
      if (JSON.stringify(input).length > 950000) throw new Error('这笔内容较大，请分成几笔绘制')
      const changed = await apply(input, current.version, controller.signal)
      if (!controller.signal.aborted && !changed) setError('笔迹未应用，请重试；原有内容已保留')
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : '笔迹未应用，请重试')
    } finally {
      if (pending.current === controller) {
        pending.current = null
        if (!controller.signal.aborted) {
          setBusy(false)
          setPreview(null)
          setErased([])
        }
        onBusy(false)
      }
    }
  }
  const exit = () => {
    cancelDraft()
    pending.current?.abort()
    pending.current = null
    setBusy(false)
    onBusy(false)
    onExit()
  }
  if (tool === 'select') return null
  return (
    <div className="mimir-pptx-ink-layer">
      <svg
        ref={surface}
        className={`mimir-pptx-ink-canvas${tool === 'eraser' ? ' is-eraser' : ''}`}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        tabIndex={0}
        role="img"
        aria-label="幻灯片手写画布（Escape退出）"
        aria-busy={busy}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            exit()
          }
        }}
        onPointerDown={(event) => {
          if (
            disabled ||
            busy ||
            pending.current ||
            draft.current ||
            event.button !== 0 ||
            event.isPrimary === false
          )
            return
          const p = point(event)
          if (!p) return
          event.preventDefault()
          event.stopPropagation()
          surface.current?.focus()
          surface.current?.setPointerCapture?.(event.pointerId)
          const stroke = { ...preset, points: [p] }
          const current = {
            pointer: event.pointerId,
            version,
            tool,
            stroke,
            ids: new Set<string>(),
            last: p,
          }
          draft.current = current
          setError('')
          if (tool === 'eraser') eraseAt(current, p)
          else setPreview(stroke)
        }}
        onPointerMove={sample}
        onPointerUp={(event) => {
          void finish(event)
        }}
        onPointerCancel={(event) => {
          if (draft.current?.pointer === event.pointerId) cancelDraft()
        }}
        onLostPointerCapture={(event) => {
          if (draft.current?.pointer === event.pointerId) cancelDraft()
        }}
        onBlur={() => {
          if (draft.current) cancelDraft()
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {preview && (
          <path
            d={strokePathD(preview.points)}
            fill="none"
            stroke={`#${preview.color}`}
            strokeWidth={preview.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={preview.tool === 'highlighter' ? HIGHLIGHTER_ALPHA : 1}
          />
        )}
        {erased.length > 0 &&
          entries
            .filter((entry) => erased.includes(entry.node.durableId ?? entry.node.sourceId))
            .map((entry) => (
              <rect
                key={entry.node.id}
                x={entry.node.box.x}
                y={entry.node.box.y}
                width={entry.node.box.w}
                height={entry.node.box.h}
                className="mimir-pptx-ink-erasing"
              />
            ))}
      </svg>
      {(busy || error) && (
        <div className="mimir-pptx-ink-feedback" role={error ? 'alert' : 'status'}>
          {error || '正在应用笔迹…'}
        </div>
      )}
    </div>
  )
}
