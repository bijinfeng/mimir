import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { columnResizingPluginKey } from '@tiptap/pm/tables'
import type { StyleInfo } from '../../vendor/packages/docx-engine/src/types.js'

export type DocxLayout = 'print' | 'web'
export type DocxZoomMode = 'manual' | 'width' | 'page'
export interface DocxHeading {
  position: number
  blockIndex: number
  level: number
  kind: 'heading' | 'outline' | 'style' | 'numbered'
  /** Raw text is never used to replace the rich heading. */
  text: string
  label: string
  styleName: string | null
}
export function docxHeadings(
  doc: PmNode | null,
  styles?: ReadonlyMap<string, StyleInfo>,
): DocxHeading[] {
  const headings: DocxHeading[] = []
  doc?.forEach((node, position, blockIndex) => {
    const type = node.type.name
    if (!['docHeading', 'docParagraph', 'docListItem'].includes(type)) return
    const style = styles?.get(node.attrs.styleId)
    if (type !== 'docHeading' && (!style?.headingLevel || style.headingOutlineOff)) return
    const level = type === 'docHeading' ? node.attrs.level : style?.headingLevel
    headings.push({
      position,
      blockIndex,
      level: Math.max(1, Math.min(9, Number(level) || 1)),
      kind:
        type === 'docListItem'
          ? 'numbered'
          : type === 'docParagraph'
            ? 'style'
            : node.attrs.outlineOnly
              ? 'outline'
              : 'heading',
      text: node.textContent,
      label: node.textContent.trim() || '空标题',
      styleName: style?.name ?? null,
    })
  })
  return headings
}
/** Fit the real canvas viewport, after a docked Inspector has taken its width. */
export function docxFitZoom(
  mode: Exclude<DocxZoomMode, 'manual'>,
  viewport: { width: number; height: number },
  paper: { width: number; height: number },
): number {
  const width = Math.max(1, viewport.width - 48) / Math.max(1, paper.width)
  const height = Math.max(1, viewport.height - 48) / Math.max(1, paper.height)
  return Math.max(0.1, Math.min(2, mode === 'page' ? Math.min(width, height) : width))
}
/** Pagination consumes 100% layout pixels; restore zoom before the browser paints. */
export function withDocxUnscaledLayout<T>(container: HTMLElement | null, run: () => T): T {
  const zoom = container?.querySelector<HTMLElement>('.doc-zoom')
  if (!zoom) return run()
  const value = zoom.style.zoom
  zoom.style.zoom = '1'
  try {
    return run()
  } finally {
    zoom.style.zoom = value
  }
}
/** Correct PM's raw clientX delta while preserving viewport coordinates for hit tests. */
export function installDocxScaledTableResize(editor: Editor, scale: () => number): () => void {
  let origin: { x: number; width: number } | null = null
  const normalize = (event: MouseEvent) => {
    if (editor.isDestroyed) return
    const state = columnResizingPluginKey.getState(editor.state) as
      | { dragging?: { startX: number; startWidth: number } | null }
      | undefined
    const dragging = state?.dragging
    if (!dragging) {
      origin = null
      return
    }
    origin ??= { x: dragging.startX, width: dragging.startWidth }
    const zoom = scale()
    if (Number.isFinite(zoom) && zoom > 0 && zoom !== 1) {
      const startX = event.clientX - (event.clientX - origin.x) / zoom
      editor.view.dispatch(
        editor.state.tr
          .setMeta(columnResizingPluginKey, { setDragging: { startX, startWidth: origin.width } })
          .setMeta('addToHistory', false),
      )
    }
    if (event.type === 'mouseup') origin = null
  }
  const win = editor.view.dom.ownerDocument.defaultView!
  win.addEventListener('mousemove', normalize, true)
  win.addEventListener('mouseup', normalize, true)
  return () => {
    win.removeEventListener('mousemove', normalize, true)
    win.removeEventListener('mouseup', normalize, true)
  }
}
