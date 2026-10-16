import { Button } from 'antd'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react'
import type { Slide } from '../../vendor/packages/pptx-engine/src/types.js'
import { textOfElement } from '../pptx.js'
import { renderSlide, type PptxRenderable } from '../pptx-render.js'
import { ToolbarButton, ToolbarLabel } from '../shell/EditorShell.js'
import { ChevronLeftIcon, ChevronRightIcon } from '../shell/icons.js'
import './pptx-workspace-views.css'

export type PptxWorkspaceMode = 'normal' | 'outline' | 'sorter' | 'reading'
export const pptxWorkspaceModes = [
  { value: 'normal', label: '普通' },
  { value: 'outline', label: '大纲' },
  { value: 'sorter', label: '幻灯片浏览' },
  { value: 'reading', label: '阅读' },
] as const

/** Same title heuristic as the fixed upstream: largest text, then topmost. */
export function pptxSlideOutline(slide: Slide) {
  const entries: { key: string; text: string; size: number; y: number }[] = []
  const walk = (elements: Slide['elements']) => {
    for (const element of elements) {
      if (element.type === 'group') walk(element.children)
      const body = textOfElement(element)
      if (!body) continue
      const text = body.paragraphs
        .map((p) => p.runs.map((r) => r.text).join(''))
        .join('\n')
        .trim()
      if (text)
        entries.push({
          key: element.id,
          text,
          size: Math.max(0, ...body.paragraphs.flatMap((p) => p.runs.map((r) => r.fontSize ?? 0))),
          y: element.transform.offset.y,
        })
    }
  }
  walk(slide.elements)
  const title = entries.toSorted((a, b) => b.size - a.size || a.y - b.y)[0]
  return {
    title: title?.text ?? '无文字幻灯片',
    lines: entries
      .filter((item) => item !== title)
      .toSorted((a, b) => a.y - b.y)
      .map((item) => ({ key: item.key, text: item.text })),
  }
}

/** Insertion boundary is in the original order; the selected block keeps its order. */
export function pptxSlideMoveOps(
  paths: readonly string[],
  selected: readonly string[],
  boundary: number,
) {
  const chosen = paths.filter((path) => selected.includes(path))
  if (!chosen.length || boundary < 0 || boundary > paths.length) return []
  const remaining = paths.filter((path) => !chosen.includes(path))
  const at = boundary - paths.slice(0, boundary).filter((path) => chosen.includes(path)).length
  const desired = [...remaining.slice(0, at), ...chosen, ...remaining.slice(at)]
  const working = [...paths]
  const ops: Record<string, unknown>[] = []
  desired.forEach((path, index) => {
    const from = working.indexOf(path)
    if (from === index) return
    ops.push({ op: 'moveSlide', target: { slide: from }, to: index })
    working.splice(index, 0, ...working.splice(from, 1))
  })
  return ops
}

function SlidePreview({
  deck,
  index,
  width = 280,
}: {
  deck: PptxRenderable
  index: number
  width?: number
}) {
  const prefix = useId()
  const rendered = useMemo(
    () => renderSlide(deck, index, { fitWidthPx: width, svgIdPrefix: prefix }),
    [deck, index, width, prefix],
  )
  return rendered ? (
    <span
      className="mimir-pptx-view-preview"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: rendered.svg }}
    />
  ) : null
}

export function PptxWorkspaceViews({
  mode,
  deck,
  active,
  busy,
  reorderReason,
  onSelect,
  onMode,
  onReorder,
  normal,
  children,
}: {
  mode: PptxWorkspaceMode
  deck: PptxRenderable
  active: number
  busy: boolean
  reorderReason?: string
  onSelect(index: number): void
  onMode(mode: PptxWorkspaceMode): void
  onReorder(paths: string[], boundary: number): Promise<boolean>
  normal: ReactNode
  children: ReactNode
}) {
  const slides = deck.slides()
  const paths = slides.map((slide) => slide.path)
  const root = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<string[]>([])
  const [anchor, setAnchor] = useState<string | null>(null)
  const [drag, setDrag] = useState<string[] | null>(null)
  const [drop, setDrop] = useState<number | null>(null)
  const selected = selection.filter((path) => paths.includes(path))
  const chosen = selected.length ? selected : paths[active] ? [paths[active]!] : []
  const indices = chosen.map((path) => paths.indexOf(path)).toSorted((a, b) => a - b)
  const first = indices[0] ?? 0,
    last = indices.at(-1) ?? 0
  const outlines = useMemo(() => deck.slides().map(pptxSlideOutline), [deck])
  useEffect(() => {
    if (mode === 'sorter' || mode === 'reading') root.current?.focus()
  }, [mode])
  const select = (
    index: number,
    modifiers?: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
  ) => {
    const path = paths[index]
    if (!path) return
    if (modifiers?.shiftKey) {
      const start = Math.max(0, paths.indexOf(anchor ?? paths[active]!))
      setSelection(paths.slice(Math.min(start, index), Math.max(start, index) + 1))
    } else if (modifiers?.metaKey || modifiers?.ctrlKey) {
      setSelection(
        chosen.includes(path) ? chosen.filter((item) => item !== path) : [...chosen, path],
      )
      setAnchor(path)
    } else {
      setSelection([path])
      setAnchor(path)
    }
    onSelect(index)
  }
  const edit = (index = active) => {
    onSelect(index)
    onMode('normal')
  }
  const move = async (items: string[], boundary: number) => {
    if (busy || reorderReason) return
    if (await onReorder(items, boundary)) setSelection(items)
    setDrag(null)
    setDrop(null)
  }
  const keydown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      event.defaultPrevented ||
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    )
      return
    if (event.key === 'Escape') {
      event.preventDefault()
      onMode('normal')
      return
    }
    if (mode === 'sorter' && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      setSelection(paths)
      return
    }
    if (
      mode === 'sorter' &&
      event.altKey &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      event.preventDefault()
      void move(chosen, event.key === 'ArrowLeft' ? first - 1 : last + 2)
      return
    }
    if (event.target !== root.current && (event.key === 'Enter' || event.key === ' ')) return
    if (event.key === 'Enter' && mode === 'sorter') {
      event.preventDefault()
      edit()
      return
    }
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? slides.length - 1
          : ['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key)
            ? Math.min(slides.length - 1, active + 1)
            : ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)
              ? Math.max(0, active - 1)
              : null
    if (next !== null) {
      event.preventDefault()
      if (mode === 'sorter') {
        select(next, event)
        root.current?.querySelector<HTMLElement>(`[data-slide-index="${next}"]`)?.focus()
      } else onSelect(next)
    }
  }
  if (mode === 'normal') return normal
  if (mode === 'outline')
    return (
      <div className="mimir-pptx-outline-workspace">
        <nav className="mimir-pptx-outline" aria-label="幻灯片大纲">
          {slides.map((slide, index) => (
            <Button
              type="text"
              key={slide.path}
              className="mimir-pptx-outline-item"
              aria-current={index === active ? 'page' : undefined}
              aria-label={`第 ${index + 1} 页：${outlines[index]!.title}`}
              onClick={() => onSelect(index)}
            >
              <span className="mimir-pptx-outline-number">{index + 1}</span>
              <span className="mimir-pptx-outline-text">
                <strong>{outlines[index]!.title}</strong>
                {outlines[index]!.lines.map((line) => (
                  <span key={line.key}>{line.text}</span>
                ))}
              </span>
            </Button>
          ))}
        </nav>
        {children}
      </div>
    )
  return (
    <div
      ref={root}
      tabIndex={-1}
      className={`mimir-pptx-${mode}`}
      style={
        {
          '--reading-ratio': `${deck.size.cx} / ${deck.size.cy}`,
          '--reading-factor': deck.size.cx / deck.size.cy,
        } as CSSProperties
      }
      aria-label={mode === 'reading' ? '阅读视图' : '幻灯片浏览视图'}
      onKeyDown={keydown}
    >
      {mode === 'reading' ? (
        <>
          <div className="mimir-pptx-reading-stage">
            <Button
              type="text"
              className="mimir-pptx-reading-slide"
              aria-label="阅读幻灯片，点击下一页"
              onClick={() => onSelect(Math.min(slides.length - 1, active + 1))}
            >
              <SlidePreview deck={deck} index={active} width={1100} />
            </Button>
          </div>
          <div className="mimir-pptx-view-actions">
            <ToolbarButton
              label="阅读上一页"
              disabled={active === 0}
              onClick={() => onSelect(active - 1)}
            >
              <ChevronLeftIcon />
            </ToolbarButton>
            <ToolbarLabel>
              第 {active + 1} / {slides.length} 页
            </ToolbarLabel>
            <ToolbarButton
              label="阅读下一页"
              disabled={active === slides.length - 1}
              onClick={() => onSelect(active + 1)}
            >
              <ChevronRightIcon />
            </ToolbarButton>
            <ToolbarButton label="返回普通视图" onClick={() => onMode('normal')}>
              返回编辑
            </ToolbarButton>
          </div>
        </>
      ) : (
        <>
          <div className="mimir-pptx-view-actions">
            <ToolbarLabel>已选 {chosen.length} 张</ToolbarLabel>
            <ToolbarButton label="编辑所选幻灯片" onClick={() => edit()}>
              编辑
            </ToolbarButton>
            <ToolbarButton
              label="前移所选幻灯片"
              disabled={busy || !!reorderReason || first === 0}
              disabledReason={reorderReason ?? (busy ? '正在处理文档' : '已经在最前')}
              onClick={() => void move(chosen, first - 1)}
            >
              前移
            </ToolbarButton>
            <ToolbarButton
              label="后移所选幻灯片"
              disabled={busy || !!reorderReason || last === slides.length - 1}
              disabledReason={reorderReason ?? (busy ? '正在处理文档' : '已经在最后')}
              onClick={() => void move(chosen, last + 2)}
            >
              后移
            </ToolbarButton>
          </div>
          <div
            className="mimir-pptx-sorter-grid"
            role="listbox"
            aria-label="幻灯片排序"
            aria-multiselectable="true"
          >
            {slides.map((slide, index) => (
              <Button
                type="text"
                role="option"
                aria-selected={chosen.includes(slide.path)}
                aria-label={`第 ${index + 1} 页：${outlines[index]!.title}${/<p:sld\b[^>]*\bshow=["']0["']/.test(slide.originalXml) ? '（放映时隐藏）' : ''}`}
                tabIndex={index === active ? 0 : -1}
                key={slide.path}
                data-slide-index={index}
                draggable={!busy && !reorderReason}
                className={`mimir-pptx-sorter-item${index === active ? ' is-current' : ''}${drop === index ? ' drop-before' : ''}${drop === slides.length && index === slides.length - 1 ? ' drop-after' : ''}`}
                onClick={(event) => select(index, event)}
                onDoubleClick={() => edit(index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.stopPropagation()
                    edit(index)
                  }
                }}
                onDragStart={(event) => {
                  const block = chosen.includes(slide.path) ? chosen : [slide.path]
                  setDrag(block)
                  setSelection(block)
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(event) => {
                  if (!drag) return
                  event.preventDefault()
                  const rect = event.currentTarget.getBoundingClientRect()
                  setDrop(index + (event.clientX >= rect.left + rect.width / 2 ? 1 : 0))
                }}
                onDrop={(event) => {
                  if (!drag) return
                  event.preventDefault()
                  const rect = event.currentTarget.getBoundingClientRect()
                  void move(drag, index + (event.clientX >= rect.left + rect.width / 2 ? 1 : 0))
                }}
                onDragEnd={() => {
                  setDrag(null)
                  setDrop(null)
                }}
              >
                <SlidePreview deck={deck} index={index} />
                <span className="mimir-pptx-sorter-caption">
                  <span>{index + 1}</span>
                  <span>{outlines[index]!.title}</span>
                  {/<p:sld\b[^>]*\bshow=["']0["']/.test(slide.originalXml) && <span>隐藏</span>}
                </span>
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
