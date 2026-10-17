import { Button } from 'antd'
import { Check, Pencil, X } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { PdfDrawingInput, PdfLocalInfo } from '@mimir/shared'
import { ToolbarSelect } from '../shell/EditorShell.js'
import {
  DRAWING_HANDLES,
  DRAWING_LABELS,
  createDrawing,
  drawingPath,
  drawingPoint,
  handlePoint,
  moveDrawing,
  resizeDrawing,
  type DrawingHandle,
  type DrawingPoint,
  type PdfCanvasTool,
} from './pdf-drawing-canvas.js'
import type { PdfAgentHandle } from '../agent/pdf-agent.js'
import { buildPdfWorkingCopy } from '../agent/pdf-working-copy.js'
import type { PdfHostLocal } from '../agent/pdf-local-agent.js'
import { readPdfPages, type PdfPageRef } from './pdf-pages.js'
import type { PdfPanelResult } from './PdfInspector.js'
import './pdf-drawing-canvas.css'

type Draft = { id?: string; drawing: PdfDrawingInput; version: number }
export function usePdfDrawingPreview({
  enabled,
  bytes,
  layout,
  imports,
  host,
  revision,
  agent,
}: {
  enabled: boolean
  bytes: Uint8Array | null
  layout: readonly PdfPageRef[]
  imports: ReadonlyMap<string, Uint8Array>
  host?: PdfHostLocal
  revision: number
  agent: RefObject<PdfAgentHandle | null>
}) {
  const [result, setResult] = useState<{
    source: Uint8Array
    layout: readonly PdfPageRef[]
    revision: number
    bytes: Uint8Array
    pages: Awaited<ReturnType<typeof readPdfPages>>
  } | null>(null)
  const [error, setError] = useState<{
    source: Uint8Array
    layout: readonly PdfPageRef[]
    message: string
  } | null>(null)
  useEffect(() => {
    if (!enabled || !bytes || !host) return
    const controller = new AbortController()
    const version = agent.current?.getVersion() ?? 0
    const assertCurrent = () => {
      if (controller.signal.aborted || agent.current?.getVersion() !== version)
        throw new Error('页面预览已取消')
    }
    void (async () => {
      const materialized = await buildPdfWorkingCopy({
        bytes,
        layout,
        imports,
        host,
        version,
        signal: controller.signal,
        assertCurrent,
      })
      const pages = await readPdfPages(materialized)
      assertCurrent()
      setResult({ source: bytes, layout, revision, bytes: materialized, pages })
      setError(null)
    })().catch((cause) => {
      if (!controller.signal.aborted)
        setError({
          source: bytes,
          layout,
          message: cause instanceof Error ? cause.message : String(cause),
        })
    })
    return () => controller.abort()
  }, [enabled, bytes, layout, imports, host, revision, agent])
  return {
    value:
      result?.source === bytes && result.layout === layout && result.revision === revision
        ? result
        : null,
    error: error?.source === bytes && error.layout === layout ? error.message : null,
  }
}
type Binding = {
  documentId: string
  currentBytes: Uint8Array | null
  layout: readonly PdfPageRef[]
  at: number
  drawingEnabled: boolean
  historyVersion: number
}
function sameBinding(a: Binding, b: Binding) {
  return (
    a.documentId === b.documentId &&
    a.currentBytes === b.currentBytes &&
    a.layout === b.layout &&
    a.at === b.at &&
    a.drawingEnabled === b.drawingEnabled &&
    a.historyVersion === b.historyVersion
  )
}
export function usePdfDrawingCanvas({
  enabled,
  binding,
  selectionKey,
  page,
  size,
  drawings,
  ready,
  busy,
  getVersion,
  apply,
}: {
  enabled: boolean
  binding: Binding
  selectionKey: string
  page: number
  size: { width: number; height: number }
  drawings: PdfLocalInfo['drawings']
  ready: boolean
  busy: boolean
  getVersion(): number
  apply(
    tool: string,
    args: Record<string, unknown>,
    version: number,
    signal: AbortSignal,
  ): Promise<PdfPanelResult | undefined>
}) {
  const [state, setState] = useState<{
    binding: Binding
    selectionKey: string
    generation: number
    draft: Draft | null
    selected: string | null
    tool: PdfCanvasTool
  }>({ binding, selectionKey, generation: 0, draft: null, selected: null, tool: 'select' })
  if (!sameBinding(state.binding, binding))
    setState({
      binding,
      selectionKey,
      generation: state.generation + 1,
      draft: null,
      selected: state.selectionKey === selectionKey ? state.selected : null,
      tool: state.tool,
    })
  const current = sameBinding(state.binding, binding)
    ? state
    : {
        ...state,
        draft: null,
        selected: state.selectionKey === selectionKey ? state.selected : null,
      }
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  const requestBinding = useRef(binding)
  useEffect(() => {
    requestBinding.current = state.binding
    return () => {
      request.current?.abort()
      request.current = null
    }
  }, [state.binding])
  const cancel = () => {
    request.current?.abort()
    setState((s) => ({ ...s, draft: null }))
    setError(null)
  }
  const selected = drawings.find((d) => d.id === current.selected)
  const draft = enabled ? current.draft : null
  const changeDraft = (value: Draft | null) => setState((s) => ({ ...s, draft: value }))
  const select = (id: string | null) => {
    if (busy || applying) return
    setState((s) => ({
      ...s,
      selected: id,
      draft: id !== null && s.selected === id ? s.draft : null,
      tool: 'select',
    }))
    setError(null)
  }
  const submit = async () => {
    if (!draft || busy || applying || !ready) return
    const controller = new AbortController()
    request.current = controller
    setApplying(true)
    setError(null)
    try {
      const result = await apply(
        draft.id ? 'update_drawing' : 'add_drawing',
        { ...(draft.id ? { id: draft.id } : {}), drawing: draft.drawing },
        draft.version,
        controller.signal,
      )
      if (controller.signal.aborted || !sameBinding(requestBinding.current, state.binding)) return
      if (result?.ok) changeDraft(null)
      else setError(result?.error ?? '绘图未应用，请重试')
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (request.current === controller) {
        request.current = null
        setApplying(false)
      }
      // A changed binding owns the next draft, but the old request must release its busy state.
      else if (controller.signal.aborted) setApplying(false)
    }
  }
  const controls = (
    <div className="mimir-pdf-drawing-controls">
      <ToolbarSelect
        label="画布绘图工具"
        value={current.tool}
        options={Object.entries(DRAWING_LABELS).map(([value, label]) => ({ value, label }))}
        disabled={busy || applying || !ready}
        onChange={(value) => {
          cancel()
          setState((s) => ({ ...s, tool: value as PdfCanvasTool, selected: null }))
        }}
      />
      <p className="mimir-pdf-inspector__meta">
        {!ready
          ? '正在准备当前页面…'
          : current.tool === 'select'
            ? '选择本编辑器的绘图，拖移对象或拖动八个尺寸手柄。'
            : '在纸面拖动绘制，松手后预览，再应用。'}
      </p>
      {draft && (
        <p className="mimir-pdf-inspector__meta" role="status">
          {draft.id ? '调整草稿' : '新绘图草稿'} · {draft.drawing.width.toFixed(1)} ×{' '}
          {draft.drawing.height.toFixed(1)} pt
        </p>
      )}
      {error && (
        <p role="alert" className="mimir-pdf-inspector__error">
          {error}
        </p>
      )}
    </div>
  )
  const footer = (
    <footer
      className="mimir-pdf-inspector__footer mimir-pdf-drawing-footer"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && (draft || applying)) {
          e.preventDefault()
          e.stopPropagation()
          cancel()
        }
      }}
    >
      <Button
        type="primary"
        icon={<Check size={14} />}
        block
        loading={applying}
        disabled={!draft || busy || !ready}
        onClick={() => void submit()}
      >
        应用画布绘图
      </Button>
      <Button icon={<X size={14} />} block disabled={!draft && !applying} onClick={cancel}>
        取消绘图草稿
      </Button>
    </footer>
  )
  const overlay =
    enabled && ready ? (
      <PdfDrawingCanvas
        key={state.generation}
        page={page}
        size={size}
        drawings={drawings}
        selected={selected}
        draft={draft}
        tool={current.tool}
        busy={busy || applying}
        getVersion={getVersion}
        onSelect={select}
        onDraft={changeDraft}
        onCancel={cancel}
      />
    ) : null
  return {
    controls,
    footer,
    overlay,
    selectedId: current.selected,
    onSelect: select,
    cancel,
    hasDraft: !!draft || applying,
  }
}

function Shape({ drawing: d, hit = false }: { drawing: PdfDrawingInput; hit?: boolean }) {
  const props = {
    fill: hit ? 'transparent' : (d.fill ?? 'none'),
    stroke: hit ? 'transparent' : d.color,
    strokeWidth: hit ? Math.max(d.thickness, 10) : d.thickness,
    opacity: hit ? 1 : d.opacity,
  }
  if (d.kind === 'rect')
    return <rect x={d.x} y={d.y} width={d.width} height={d.height} {...props} />
  if (d.kind === 'ellipse')
    return (
      <ellipse
        cx={d.x + d.width / 2}
        cy={d.y + d.height / 2}
        rx={d.width / 2}
        ry={d.height / 2}
        {...props}
      />
    )
  return (
    <path d={drawingPath(d)} {...props} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  )
}

type Gesture = {
  pointer: number
  start: DrawingPoint
  points: DrawingPoint[]
  before: Draft | null
  version: number
  original?: PdfDrawingInput
  id?: string
  handle?: DrawingHandle
}
export function PdfDrawingCanvas({
  page,
  size,
  drawings,
  selected,
  draft,
  tool,
  busy,
  getVersion,
  onSelect,
  onDraft,
  onCancel,
}: {
  page: number
  size: { width: number; height: number }
  drawings: PdfLocalInfo['drawings']
  selected?: PdfLocalInfo['drawings'][number]
  draft: Draft | null
  tool: PdfCanvasTool
  busy: boolean
  getVersion(): number
  onSelect(id: string | null): void
  onDraft(draft: Draft | null): void
  onCancel(): void
}) {
  const svg = useRef<SVGSVGElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [dragging, setDragging] = useState(false)
  const callbacks = useRef({ onDraft, onCancel })
  useEffect(() => {
    callbacks.current = { onDraft, onCancel }
  }, [onDraft, onCancel])
  useEffect(() => {
    const cancelGesture = () => {
      const g = gesture.current
      if (!g) return
      gesture.current = null
      setDragging(false)
      callbacks.current.onDraft(g.before)
    }
    const outsideUp = () => cancelGesture()
    window.addEventListener('pointerup', outsideUp)
    window.addEventListener('pointercancel', cancelGesture)
    window.addEventListener('blur', cancelGesture)
    return () => {
      window.removeEventListener('pointerup', outsideUp)
      window.removeEventListener('pointercancel', cancelGesture)
      window.removeEventListener('blur', cancelGesture)
    }
  }, [])
  const point = (e: ReactPointerEvent): DrawingPoint | null => {
    if (!svg.current) return null
    return drawingPoint([e.clientX, e.clientY], svg.current.getBoundingClientRect(), size)
  }
  const down = (
    e: ReactPointerEvent,
    object?: PdfLocalInfo['drawings'][number],
    handle?: DrawingHandle,
  ) => {
    if (busy || e.button !== 0 || gesture.current || e.isPrimary === false) return
    const start = point(e)
    if (!start) return
    if (tool === 'select' && !object) {
      onSelect(null)
      return
    }
    e.preventDefault()
    e.stopPropagation()
    svg.current?.focus()
    svg.current?.setPointerCapture?.(e.pointerId)
    if (object) onSelect(object.id)
    gesture.current = {
      pointer: e.pointerId,
      start,
      points: [start],
      before: draft,
      version: draft?.version ?? getVersion(),
      ...(object
        ? { id: object.id, original: draft?.id === object.id ? draft.drawing : object }
        : {}),
      handle,
    }
    setDragging(true)
  }
  const move = (e: ReactPointerEvent) => {
    const g = gesture.current
    if (!g || e.pointerId !== g.pointer) return
    const at = point(e)
    if (!at) return
    const clamped: DrawingPoint = [
      Math.max(0, Math.min(size.width, at[0])),
      Math.max(0, Math.min(size.height, at[1])),
    ]
    if (g.original) {
      const { id: _, ...original } = g.original as PdfLocalInfo['drawings'][number]
      const drawing = g.handle
        ? resizeDrawing(original, g.handle, at)
        : moveDrawing(original, at[0] - g.start[0], at[1] - g.start[1])
      if (Math.hypot(at[0] - g.start[0], at[1] - g.start[1]) >= 0.25)
        onDraft({ id: g.id, drawing, version: g.version })
    } else if (tool !== 'select') {
      if (tool === 'ink') {
        if (g.points.length >= 2000) return
        if (Math.hypot(clamped[0] - g.points.at(-1)![0], clamped[1] - g.points.at(-1)![1]) < 0.3)
          return
        g.points.push(clamped)
      } else g.points = [g.start, clamped]
      const drawing = createDrawing(tool, page, g.points)
      if (drawing) onDraft({ drawing, version: g.version })
    }
  }
  const shown = draft?.drawing ?? selected
  const handleSize = Math.max(4, size.width / 90)
  return (
    <svg
      ref={svg}
      className={`mimir-pdf-drawing-canvas${tool !== 'select' ? ' mimir-pdf-drawing-canvas--draw' : ''}`}
      viewBox={`0 0 ${size.width} ${size.height}`}
      preserveAspectRatio="none"
      role="group"
      aria-label="PDF 画布绘图"
      tabIndex={0}
      data-dragging={dragging || undefined}
      onPointerDown={(e) => down(e)}
      onPointerMove={move}
      onPointerUp={(e) => {
        if (gesture.current?.pointer !== e.pointerId) return
        const at = point(e)
        if (!at || at[0] < 0 || at[1] < 0 || at[0] > size.width || at[1] > size.height)
          onDraft(gesture.current.before)
        else move(e)
        gesture.current = null
        setDragging(false)
        if (svg.current?.hasPointerCapture?.(e.pointerId))
          svg.current.releasePointerCapture(e.pointerId)
      }}
      onPointerCancel={() => {
        const g = gesture.current
        gesture.current = null
        setDragging(false)
        if (g) onDraft(g.before)
      }}
      onLostPointerCapture={() => {
        const g = gesture.current
        gesture.current = null
        setDragging(false)
        if (g) onDraft(g.before)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && (gesture.current || draft)) {
          e.preventDefault()
          e.stopPropagation()
          gesture.current = null
          setDragging(false)
          onCancel()
        }
      }}
    >
      {tool !== 'select' && (
        <rect
          width={size.width}
          height={size.height}
          fill="transparent"
          className="mimir-pdf-drawing-canvas__surface"
        />
      )}
      {tool === 'select' &&
        drawings
          .filter((d) => d.page === page)
          .map((d) => (
            <g
              key={d.id}
              data-drawing-id={d.id}
              className="mimir-pdf-drawing-canvas__target"
              onPointerDown={(e) => down(e, d)}
            >
              <title>{DRAWING_LABELS[d.kind]}</title>
              <Shape drawing={draft?.id === d.id ? draft.drawing : d} hit />
            </g>
          ))}
      {draft && (
        <g pointerEvents="none" className="mimir-pdf-drawing-canvas__draft">
          <Shape drawing={draft.drawing} />
        </g>
      )}
      {shown && (
        <g className="mimir-pdf-drawing-canvas__selection">
          <rect
            x={shown.x}
            y={shown.y}
            width={shown.width}
            height={shown.height}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
          {tool === 'select' &&
            selected &&
            DRAWING_HANDLES.map((h) => {
              const [x, y] = handlePoint(shown, h)
              return (
                <rect
                  key={h}
                  data-drawing-handle={h}
                  aria-label={`绘图尺寸 ${h}`}
                  x={x - handleSize / 2}
                  y={y - handleSize / 2}
                  width={handleSize}
                  height={handleSize}
                  className={`mimir-pdf-drawing-canvas__handle mimir-pdf-drawing-canvas__handle--${h}`}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(e) => down(e, selected, h)}
                />
              )
            })}
        </g>
      )}
      <title>
        {tool === 'select' ? <>{DRAWING_LABELS.select}</> : <>{DRAWING_LABELS[tool]}</>}
      </title>
    </svg>
  )
}

export function PdfDrawingRibbonIcon() {
  return <Pencil size={14} />
}
