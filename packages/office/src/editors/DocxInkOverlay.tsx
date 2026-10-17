import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import {
  INK_ANCHOR,
  INK_PARAGRAPHS,
  MAX_INK_POINTS,
  inkAnnotations,
  inkHit,
  inkPath,
  type InkPoint,
  type InkStroke,
} from '../docx-ink-model.js'
import { addDocxInk, removeDocxInk, type InkController } from './docx-ink.js'
import { useInkUi } from './DocxInkControls.js'
interface Anchor {
  id: string | null
  pos: number
  x: number
  y: number
  right: number
  bottom: number
}
interface Geometry {
  width: number
  height: number
  anchors: Anchor[]
}
/** Horizontal origin is the column edge, not the paragraph's indented border box. */
export function measureInkAnchors(editor: Editor, stage: HTMLElement, zoom: number): Geometry {
  const root = stage.getBoundingClientRect(),
    anchors: Anchor[] = []
  editor.state.doc.forEach((node, pos) => {
    if (
      !INK_PARAGRAPHS.has(node.type.name) &&
      !(node.type.name === 'docProtected' && node.attrs[INK_ANCHOR])
    )
      return
    const dom = editor.view.nodeDOM(pos)
    if (!(dom instanceof HTMLElement)) return
    const rect = dom.getBoundingClientRect(),
      css = getComputedStyle(dom)
    const marginLeft = Number.parseFloat(css.marginLeft) || 0,
      marginRight = Number.parseFloat(css.marginRight) || 0
    anchors.push({
      id: typeof node.attrs[INK_ANCHOR] === 'string' ? node.attrs[INK_ANCHOR] : null,
      pos,
      x: (rect.left - root.left) / zoom - marginLeft,
      y: (rect.top - root.top) / zoom,
      right: (rect.right - root.left) / zoom + marginRight,
      bottom: (rect.bottom - root.top) / zoom,
    })
  })
  return { width: Math.max(1, root.width / zoom), height: Math.max(1, root.height / zoom), anchors }
}
export function chooseInkAnchor(anchors: Anchor[], point: InkPoint): Anchor | null {
  const column = anchors.filter((a) => point.x >= a.x - 12 && point.x <= a.right + 12)
  const candidates = column.length ? column : anchors
  const above = candidates.filter((a) => a.y <= point.y)
  return (
    [...(above.length ? above : candidates)].toSorted(
      (a, b) =>
        Math.abs(point.y - a.y) - Math.abs(point.y - b.y) ||
        Math.abs(point.x - a.x) - Math.abs(point.x - b.x),
    )[0] ?? null
  )
}
interface Gesture {
  pointer: number
  doc: PmNode
  anchor: Anchor | null
  points: InkPoint[]
  erased: Set<string>
  stroke: InkStroke | null
}
export function DocxInkOverlay({
  editor,
  controller,
  doc,
  zoom,
  reading,
  reason,
  onError,
}: {
  editor: Editor
  controller: InkController
  doc: PmNode
  zoom: number
  reading: boolean
  reason: string | null
  onError: (message: string) => void
}) {
  const ui = useInkUi(controller),
    svg = useRef<SVGSVGElement>(null),
    gesture = useRef<Gesture | null>(null)
  const [geometry, setGeometry] = useState<Geometry>({ width: 1, height: 1, anchors: [] })
  const [previewAnchor, setPreviewAnchor] = useState<Anchor | null>(null)
  const [preview, setPreview] = useState<InkStroke | null>(null),
    [erased, setErased] = useState<string[]>([])
  const measure = useCallback(() => {
    const stage = svg.current?.parentElement
    if (!stage || editor.isDestroyed) return
    const next = measureInkAnchors(editor, stage, zoom)
    setGeometry((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next))
  }, [editor, zoom])
  const cancel = useCallback(() => {
    gesture.current = null
    setPreview(null)
    setPreviewAnchor(null)
    setErased([])
  }, [])
  useEffect(() => {
    queueMicrotask(measure)
    const stage = svg.current?.parentElement
    if (!stage) return
    const resize = new ResizeObserver(measure),
      mutation = new MutationObserver(measure)
    resize.observe(stage)
    resize.observe(editor.view.dom)
    mutation.observe(editor.view.dom, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })
    window.addEventListener('resize', measure)
    // Viewport coordinates shift on ancestor scroll; geometry stays in the zoomed stage.
    window.addEventListener('scroll', measure, true)
    return () => {
      resize.disconnect()
      mutation.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [editor, measure])
  useEffect(() => {
    const changed = () => {
      cancel()
      measure()
    }
    const unsubscribe = controller.subscribe(changed)
    editor.on('transaction', changed)
    window.addEventListener('blur', cancel)
    window.addEventListener('scroll', cancel, true)
    window.addEventListener('resize', cancel)
    const shell = editor.view.dom.closest('.mimir-editor')
    const escape = (event: Event) => {
      const key = event as KeyboardEvent
      if (key.key !== 'Escape' || key.defaultPrevented || !controller.getSnapshot().enabled) return
      if (
        key.target instanceof Element &&
        key.target.closest('[data-toolbar-popup], .mimir-docx-inspector')
      )
        return
      key.stopPropagation()
      cancel()
      controller.update({ enabled: false, selected: null })
      const trigger =
        shell?.querySelector<HTMLButtonElement>('button[aria-label="笔"]') ??
        shell?.querySelector<HTMLButtonElement>(
          '[data-section-key="ink-tools"] > button[aria-haspopup="menu"]',
        ) ??
        shell?.querySelector<HTMLButtonElement>(
          '.mimir-compact-toolbar__tabs [role="tab"][aria-selected="true"]',
        )
      trigger?.focus()
    }
    shell?.addEventListener('keydown', escape)
    return () => {
      unsubscribe()
      shell?.removeEventListener('keydown', escape)
      editor.off('transaction', changed)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('scroll', cancel, true)
      window.removeEventListener('resize', cancel)
      cancel()
    }
  }, [editor, controller, cancel, measure])
  const active = ui.enabled && !reading && !reason && editor.isEditable
  const annotations = inkAnnotations(doc)
  const anchorOf = (id: string) => geometry.anchors.find((a) => a.id === id)
  const point = (event: ReactPointerEvent) => {
    const rect = svg.current!.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom }
  }
  const hit = (p: InkPoint, excluded?: Set<string>) =>
    annotations.toReversed().find((ink) => {
      const a = anchorOf(ink.anchor)
      return (
        !excluded?.has(ink.id) &&
        a &&
        ink.stroke &&
        inkHit(ink.stroke, { x: p.x - a.x, y: p.y - a.y }, 6 / zoom)
      )
    })
  const erase = (g: Gesture, p: InkPoint) => {
    const target = hit(p, g.erased)
    if (target) {
      g.erased.add(target.id)
      setErased([...g.erased])
    }
  }
  const start = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!active || event.button !== 0 || gesture.current || !event.isPrimary) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.focus({ preventScroll: true })
    const p = point(event)
    if (ui.tool === 'select') {
      controller.update({ selected: hit(p)?.id ?? null })
      return
    }
    const stage = event.currentTarget.parentElement
    if (!stage) return
    const measured = measureInkAnchors(editor, stage, zoom)
    setGeometry(measured)
    const anchor = chooseInkAnchor(
      measured.anchors.filter((a) =>
        INK_PARAGRAPHS.has(editor.state.doc.nodeAt(a.pos)?.type.name ?? ''),
      ),
      p,
    )
    if (ui.tool !== 'eraser' && !anchor) {
      onError('请先添加可编辑正文段落')
      return
    }
    const stroke: InkStroke | null =
      ui.tool === 'eraser'
        ? null
        : {
            tool: ui.tool,
            color: ui.tool === 'pen' ? ui.penColor : ui.highlighterColor,
            width: ui.tool === 'pen' ? ui.penWidth : ui.highlighterWidth,
            points: [{ x: p.x - anchor!.x, y: p.y - anchor!.y }],
          }
    const g: Gesture = {
      pointer: event.pointerId,
      doc: editor.state.doc,
      anchor,
      points: [],
      erased: new Set(),
      stroke,
    }
    gesture.current = g
    setPreviewAnchor(anchor)
    event.currentTarget.setPointerCapture?.(event.pointerId)
    if (stroke) setPreview(stroke)
    else erase(g, p)
  }
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current
    if (!g || g.pointer !== event.pointerId) return
    if (editor.state.doc !== g.doc || !active) {
      cancel()
      return
    }
    event.preventDefault()
    const p = point(event)
    if (g.stroke && g.anchor) {
      if (g.stroke.points.length >= MAX_INK_POINTS) {
        cancel()
        onError('单笔点数超过限制，请分成较短笔迹')
        return
      }
      const next = { x: p.x - g.anchor.x, y: p.y - g.anchor.y },
        last = g.stroke.points.at(-1)!
      if (Math.hypot(next.x - last.x, next.y - last.y) >= 0.4) {
        g.stroke = { ...g.stroke, points: [...g.stroke.points, next] }
        setPreview(g.stroke)
      }
    } else erase(g, p)
  }
  const end = (event: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current
    if (!g || g.pointer !== event.pointerId) return
    if (event.type === 'pointercancel') {
      cancel()
      return
    }
    move(event)
    if (gesture.current !== g) return
    try {
      if (g.stroke && g.anchor)
        controller.update({ selected: addDocxInk(editor, g.doc, g.anchor.pos, g.stroke) })
      else removeDocxInk(editor, g.doc, [...g.erased])
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause))
    }
    cancel()
  }
  return (
    <svg
      ref={svg}
      className="mimir-docx-ink-overlay"
      data-active={active}
      data-tool={ui.tool}
      width={geometry.width}
      height={geometry.height}
      aria-label="文档笔迹画布"
      role={active ? 'application' : 'img'}
      tabIndex={active ? 0 : -1}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={cancel}
      onKeyDown={(event) => {
        if (!active) return
        if (event.key === 'Escape') {
          event.stopPropagation()
          cancel()
          controller.update({ enabled: false, selected: null })
          editor.commands.focus()
        }
        if ((event.key === 'Delete' || event.key === 'Backspace') && ui.selected) {
          event.preventDefault()
          event.stopPropagation()
          try {
            removeDocxInk(editor, editor.state.doc, [ui.selected])
            controller.update({ selected: null })
          } catch (cause) {
            onError(String(cause))
          }
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault()
          event.stopPropagation()
          cancel()
          if (event.shiftKey) editor.commands.redo()
          else editor.commands.undo()
        }
      }}
    >
      {annotations.map((ink) => {
        const a = anchorOf(ink.anchor)
        if (!a || erased.includes(ink.id)) return null
        return (
          <g key={ink.id} transform={`translate(${a.x},${a.y})`}>
            {ink.stroke ? (
              <>
                {ui.selected === ink.id && (
                  <path
                    d={inkPath(ink.stroke)}
                    fill="none"
                    stroke="var(--me-accent)"
                    strokeWidth={ink.stroke.width + 4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.35}
                  />
                )}
                <path
                  data-ink-id={ink.id}
                  d={inkPath(ink.stroke)}
                  fill="none"
                  stroke={`#${ink.stroke.color}`}
                  strokeWidth={ink.stroke.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={ink.stroke.tool === 'highlighter' ? 0.45 : 1}
                />
              </>
            ) : ink.image?.dataUrl ? (
              <image
                href={ink.image.dataUrl}
                x={ink.image.x}
                y={ink.image.y}
                width={ink.image.width}
                height={ink.image.height}
              />
            ) : null}
          </g>
        )
      })}
      {preview && previewAnchor && (
        <path
          transform={`translate(${previewAnchor.x},${previewAnchor.y})`}
          d={inkPath(preview)}
          fill="none"
          stroke={`#${preview.color}`}
          strokeWidth={preview.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={preview.tool === 'highlighter' ? 0.45 : 1}
        />
      )}
    </svg>
  )
}
