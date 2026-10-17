import { Button } from 'antd'
import { Check, X } from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from 'react'
import type { PdfSignatureSource, PdfVisualSignature } from '@mimir/shared'
import { clampSignature, placeSignature, type SignatureRect } from './pdf-signature.js'
import { PdfSignaturePanel } from './PdfSignaturePanel.js'
import type { PdfPanelResult } from './PdfInspector.js'
interface Draft {
  id?: string
  source?: PdfSignatureSource
  display: Pick<PdfVisualSignature, 'preview' | 'strokes' | 'color' | 'thickness'>
  rect: SignatureRect | null
  version: number
  initial?: SignatureRect
}
interface Identity {
  documentId: string
  bytes: Uint8Array | null
  layout: unknown
  page: number
  revision: number
  enabled: boolean
  saving: boolean
}
const same = (a: Identity, b: Identity) =>
  a.documentId === b.documentId &&
  a.bytes === b.bytes &&
  a.layout === b.layout &&
  a.page === b.page &&
  a.revision === b.revision &&
  a.enabled === b.enabled &&
  a.saving === b.saving
function sourceDisplay(source: PdfSignatureSource): Draft['display'] {
  return source.kind === 'stamp'
    ? { preview: source.png }
    : { strokes: source.strokes, color: source.color, thickness: source.thickness }
}
export function usePdfSignature({
  identity,
  size,
  ready,
  busy,
  issue,
  signatures,
  getVersion,
  apply,
  onClose,
}: {
  identity: Identity
  size: { width: number; height: number }
  ready: boolean
  busy: boolean
  issue?: string | null
  signatures: PdfVisualSignature[]
  getVersion(): number
  apply(
    tool: string,
    args: Record<string, unknown>,
    version: number,
    signal: AbortSignal,
  ): Promise<PdfPanelResult | undefined>
  onClose(): void
}) {
  const [state, setState] = useState<{
      identity: Identity
      draft: Draft | null
      generation: number
    }>({
      identity,
      draft: null,
      generation: 0,
    }),
    [error, setError] = useState<string | null>(null),
    [applying, setApplying] = useState(false)
  const request = useRef<AbortController | null>(null),
    live = useRef(identity),
    centerRequested = useRef(false),
    svg = useRef<SVGSVGElement>(null)
  if (!same(state.identity, identity)) {
    setState({ identity, draft: null, generation: state.generation + 1 })
  }
  const draft = same(state.identity, identity) ? state.draft : null
  useLayoutEffect(() => {
    if (!centerRequested.current) return
    centerRequested.current = false
    if (!draft?.rect) return
    svg.current?.querySelector('.mimir-pdf-signature-canvas__box')?.scrollIntoView?.({
      block: 'center',
      inline: 'center',
    })
  }, [draft])
  const placing = !!draft
  useEffect(() => {
    if (!placing) return
    const frame = requestAnimationFrame(() => svg.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [placing])
  useLayoutEffect(() => {
    live.current = state.identity
    return () => {
      request.current?.abort()
      request.current = null
    }
  }, [state.identity])
  const cancel = () => {
    centerRequested.current = false
    request.current?.abort()
    setState((s) => ({ identity: live.current, draft: null, generation: s.generation + 1 }))
    setError(null)
  }
  const change = (next: Draft | null) =>
    setState((s) => ({ ...s, identity: live.current, draft: next }))
  const submit = async (remove?: PdfVisualSignature) => {
    if (busy || applying || (!remove && (!ready || !draft?.rect))) return
    const frozen = identity,
      token = state.generation,
      controller = new AbortController()
    request.current = controller
    setApplying(true)
    setError(null)
    try {
      const result = await apply(
        remove
          ? 'delete_visual_signature'
          : draft!.id
            ? 'transform_visual_signature'
            : 'add_visual_signature',
        remove
          ? { page: identity.page, id: remove.id }
          : {
              page: identity.page,
              ...(draft!.id ? { id: draft!.id } : { source: draft!.source }),
              rect: draft!.rect,
            },
        remove ? getVersion() : draft!.version,
        controller.signal,
      )
      if (!controller.signal.aborted && same(live.current, frozen) && token === state.generation) {
        if (result?.ok) change(null)
        else setError(result?.error ?? '签名未应用，请重试')
      }
    } catch (e) {
      if (!controller.signal.aborted && same(live.current, frozen))
        setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (request.current === controller) request.current = null
      setApplying(false)
    }
  }
  const panel = (
    <PdfSignaturePanel
      key={`${identity.documentId}:${identity.page}:${identity.revision}:${busy}`}
      busy={busy || applying}
      ready={ready}
      signatures={signatures.filter((s) => s.page === identity.page)}
      error={issue || error}
      onPrepare={(source) => {
        setError(null)
        change({ source, display: sourceDisplay(source), rect: null, version: getVersion() })
      }}
      onSelect={(s) => {
        setError(null)
        change({
          id: s.id,
          display: {
            preview: s.preview,
            strokes: s.strokes,
            color: s.color,
            thickness: s.thickness,
          },
          rect: s.rect,
          initial: s.rect,
          version: getVersion(),
        })
      }}
      onDelete={(s) => void submit(s)}
      onClose={onClose}
    />
  )
  const basis =
    draft?.initial ??
    (draft?.source ? { x: 0, y: 0, width: draft.source.width, height: draft.source.height } : null)
  const center = () => {
    if (!draft || !basis) return
    const rect = placeSignature(basis.width, basis.height, size)
    centerRequested.current = true
    change({ ...draft, rect })
    requestAnimationFrame(() => svg.current?.focus({ preventScroll: true }))
  }
  const actions = draft ? (
    <div
      className="mimir-pdf-signature-actions"
      role="region"
      aria-label="签名放置操作"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          cancel()
        }
      }}
    >
      <div>
        <strong>{draft.rect ? '签名位置草稿' : '点击纸面放置'}</strong>
        <span>
          {draft.rect
            ? `${draft.rect.width.toFixed(1)} × ${draft.rect.height.toFixed(1)} pt · 拖移 / 角部缩放`
            : '放置后可移动和等比缩放'}
        </span>
      </div>
      {!draft.rect && (
        <Button disabled={busy || applying} onClick={center}>
          放在页面中央
        </Button>
      )}
      {draft.rect && (
        <Button
          type="primary"
          icon={<Check size={14} />}
          loading={applying}
          disabled={busy || !ready}
          onClick={() => void submit()}
        >
          应用签名
        </Button>
      )}
      <Button icon={<X size={14} />} onClick={cancel}>
        取消
      </Button>
      {draft.rect && (
        <details className="mimir-pdf-signature-position">
          <summary>精确位置</summary>
          <div>
            {(['x', 'y', 'width'] as const).map((field) => (
              <label key={field}>
                <span>{field === 'x' ? '左侧 pt' : field === 'y' ? '顶部 pt' : '宽度 pt'}</span>
                <input
                  type="number"
                  step="0.1"
                  min={field === 'width' ? 4 : 0}
                  aria-label={`签名${field === 'x' ? '左侧位置' : field === 'y' ? '顶部位置' : '宽度'}`}
                  disabled={busy || applying}
                  value={Number(draft.rect![field].toFixed(1))}
                  onChange={(event) => {
                    const n = event.currentTarget.valueAsNumber
                    if (!Number.isFinite(n) || (field === 'width' && n < 4)) return
                    const rect =
                      field === 'width'
                        ? {
                            ...draft.rect!,
                            width: n,
                            height: (n * draft.rect!.height) / draft.rect!.width,
                          }
                        : { ...draft.rect!, [field]: n }
                    change({ ...draft, rect: clampSignature(rect, size) })
                  }}
                />
              </label>
            ))}
          </div>
        </details>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  ) : null
  const overlay =
    draft && basis && ready ? (
      <PdfSignatureCanvas
        refObject={svg}
        size={size}
        draft={draft}
        basis={basis}
        busy={busy || applying}
        onChange={(rect) => change({ ...draft, rect })}
        onCancel={cancel}
        onApply={() => void submit()}
      />
    ) : null
  return { panel, overlay, actions, placing: !!draft, cancel, hasDraft: !!draft || applying }
}
function PdfSignatureCanvas({
  refObject,
  size,
  draft,
  basis,
  busy,
  onChange,
  onCancel,
  onApply,
}: {
  refObject: RefObject<SVGSVGElement | null>
  size: { width: number; height: number }
  draft: Draft
  basis: SignatureRect
  busy: boolean
  onChange(rect: SignatureRect): void
  onCancel(): void
  onApply(): void
}) {
  const gesture = useRef<{
      id: number
      x: number
      y: number
      rect: SignatureRect
      resize: boolean
    } | null>(null),
    callbacks = useRef({ onChange })
  useEffect(() => {
    callbacks.current = { onChange }
  }, [onChange])
  useEffect(() => {
    const cancel = () => {
      if (gesture.current) {
        callbacks.current.onChange(gesture.current.rect)
        gesture.current = null
      }
    }
    window.addEventListener('blur', cancel)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('blur', cancel)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [])
  const point = (e: PointerEvent): [number, number] => {
    const r = refObject.current!.getBoundingClientRect()
    return [
      ((e.clientX - r.left) / r.width) * size.width,
      ((e.clientY - r.top) / r.height) * size.height,
    ]
  }
  const down = (e: PointerEvent, resize = false) => {
    if (busy || gesture.current || e.button !== 0 || e.isPrimary === false) return
    e.preventDefault()
    e.stopPropagation()
    refObject.current?.focus({ preventScroll: true })
    const [x, y] = point(e)
    if (!draft.rect) {
      onChange(placeSignature(basis.width, basis.height, size, x, y))
      return
    }
    refObject.current?.setPointerCapture?.(e.pointerId)
    gesture.current = { id: e.pointerId, x, y, rect: draft.rect, resize }
  }
  const rect = draft.rect,
    display = draft.display
  return (
    <svg
      ref={refObject}
      className="mimir-pdf-signature-canvas"
      viewBox={`0 0 ${size.width} ${size.height}`}
      preserveAspectRatio="none"
      role="application"
      aria-label="签名位置预览"
      tabIndex={0}
      onPointerDown={(e) => down(e)}
      onPointerMove={(e) => {
        const g = gesture.current
        if (!g || g.id !== e.pointerId || busy) return
        const [x, y] = point(e)
        if (g.resize) {
          const w = Math.max(8, g.rect.width + x - g.x)
          const max = Math.min(
            size.width - g.rect.x,
            ((size.height - g.rect.y) * g.rect.width) / g.rect.height,
          )
          const width = Math.min(max, w)
          onChange({ ...g.rect, width, height: (width * g.rect.height) / g.rect.width })
        } else
          onChange(
            clampSignature({ ...g.rect, x: g.rect.x + x - g.x, y: g.rect.y + y - g.y }, size),
          )
      }}
      onPointerUp={(e) => {
        if (gesture.current?.id === e.pointerId) {
          gesture.current = null
          e.stopPropagation()
          refObject.current?.releasePointerCapture?.(e.pointerId)
        }
      }}
      onPointerCancel={() => {
        if (gesture.current) onChange(gesture.current.rect)
        gesture.current = null
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onCancel()
        } else if (e.key === 'Enter' && rect) {
          e.preventDefault()
          e.stopPropagation()
          onApply()
        } else if (
          rect &&
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) &&
          !busy
        ) {
          e.preventDefault()
          const n = e.shiftKey ? 10 : 1
          onChange(
            clampSignature(
              {
                ...rect,
                x: rect.x + (e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0),
                y: rect.y + (e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0),
              },
              size,
            ),
          )
        }
      }}
    >
      {rect && (
        <g>
          <svg
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            viewBox={`0 0 ${basis.width} ${basis.height}`}
            preserveAspectRatio="none"
            opacity={0.85}
          >
            {display.preview ? (
              <image
                href={`data:image/png;base64,${display.preview}`}
                width={basis.width}
                height={basis.height}
                preserveAspectRatio="none"
              />
            ) : (
              display.strokes?.map((path, i) => (
                <path
                  // Ordered immutable paths have no per-stroke IDs; identical strokes remain distinct.
                  // eslint-disable-next-line react/no-array-index-key
                  key={i}
                  d={path.map(([x, y], j) => `${j ? 'L' : 'M'}${x},${y}`).join(' ')}
                  fill="none"
                  stroke={display.color}
                  strokeWidth={display.thickness}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))
            )}
          </svg>
          <rect
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            className="mimir-pdf-signature-canvas__box"
            vectorEffect="non-scaling-stroke"
          />
          <rect
            x={rect.x + rect.width - 5}
            y={rect.y + rect.height - 5}
            width={10}
            height={10}
            className="mimir-pdf-signature-canvas__resize"
            vectorEffect="non-scaling-stroke"
            onPointerDown={(e) => down(e, true)}
          />
        </g>
      )}
    </svg>
  )
}
