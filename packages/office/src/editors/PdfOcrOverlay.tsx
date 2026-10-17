import type { ProjectedPdfOcrPage } from './pdf-ocr.js'
import { useEffect, useRef } from 'react'
import './pdf-ocr.css'

/** SVG selection adds visual line breaks between glyph elements; recover only the actual source span. */
export function pdfOcrSelectionText(
  root: SVGSVGElement,
  selection: Selection | null,
  sourceText: string,
): string | null {
  if (!selection || selection.isCollapsed) return null
  const boundary = (node: Node | null, offset: number): number | null => {
    if (!node || !root.contains(node)) return null
    if (node === root) {
      const next = root.childNodes.item(offset)
      return next instanceof Element
        ? Number(next.getAttribute('data-ocr-start'))
        : sourceText.length
    }
    const element = node instanceof Element ? node : node.parentElement
    const text = element?.closest('text[data-ocr-start]')
    if (!text || !root.contains(text)) return null
    let characters =
      node.nodeType === Node.TEXT_NODE
        ? Math.min(offset, node.textContent?.length ?? 0)
        : Array.from(node.childNodes)
            .slice(0, offset)
            .reduce((sum, child) => sum + (child.textContent?.length ?? 0), 0)
    let current = node
    while (current !== text) {
      for (let previous = current.previousSibling; previous; previous = previous.previousSibling)
        characters += previous.textContent?.length ?? 0
      if (!current.parentNode) return null
      current = current.parentNode
    }
    return Number(text.getAttribute('data-ocr-start')) + characters
  }
  const anchor = boundary(selection.anchorNode, selection.anchorOffset)
  const focus = boundary(selection.focusNode, selection.focusOffset)
  if (anchor === null || focus === null || !Number.isFinite(anchor) || !Number.isFinite(focus))
    return null
  return sourceText.slice(Math.min(anchor, focus), Math.max(anchor, focus))
}

/** Real selectable glyph boxes, including rotated pages; no original-text editing targets. */
export function PdfOcrOverlay({ page, onExit }: { page: ProjectedPdfOcrPage; onExit(): void }) {
  const root = useRef<SVGSVGElement>(null)
  useEffect(() => {
    root.current?.focus({ preventScroll: true })
  }, [])
  return (
    <svg
      ref={root}
      className="mimir-pdf-ocr-overlay"
      aria-label="临时 OCR 文字（可能有误）"
      tabIndex={0}
      onCopy={(event) => {
        const text = pdfOcrSelectionText(event.currentTarget, window.getSelection(), page.text)
        if (text === null) return
        event.clipboardData.setData('text/plain', text)
        event.preventDefault()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onExit()
        }
      }}
      viewBox={`0 0 ${page.viewport.width} ${page.viewport.height}`}
      preserveAspectRatio="none"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {page.boxes.map(({ token, points }, index) => {
        const [p0, p1, , p3] = points as readonly [number[], number[], number[], number[]]
        const dx = p1[0]! - p0[0]!,
          dy = p1[1]! - p0[1]!
        const hx = p3[0]! - p0[0]!,
          hy = p3[1]! - p0[1]!
        const width = Math.hypot(dx, dy),
          height = Math.hypot(hx, hy)
        if (!width || !height) return null
        return (
          <text
            key={`${token.start}:${token.end}`}
            data-ocr-start={token.start}
            fontSize={height}
            textLength={width}
            lengthAdjust="spacingAndGlyphs"
            dominantBaseline="text-before-edge"
            x={0}
            y={0}
            transform={`matrix(${dx / width} ${dy / width} ${hx / height} ${hy / height} ${p0[0]} ${p0[1]})`}
          >
            {token.text}
            {page.text.slice(token.end, page.boxes[index + 1]?.token.start ?? page.text.length)}
          </text>
        )
      })}
    </svg>
  )
}
