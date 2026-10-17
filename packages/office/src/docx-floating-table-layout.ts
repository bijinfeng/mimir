import type { EditorView } from '@tiptap/pm/view'
import { setColumnLayout } from '../vendor/apps/docs/src/renderer/editor/column-layout.js'
import type { ColumnBlockPlacement } from '../vendor/apps/docs/src/renderer/pagination-types.js'

const MARKER = 'mimir-docx-section-float-right'
const MARGIN = '--mimir-tbl-margin-right'

/** Apply the engine's visual section placement, plus a real right-float inset.
 * Left floats and wrapping paragraphs share the same unshifted flow origin;
 * their common section transform preserves the browser's exclusion geometry.
 * Right floats additionally hang from the shared canvas' right edge. Reserve
 * the width outside their own section with a margin, so line wrapping happens
 * against the table's actual logical edge before either is painted translated.
 * The transient DOM property retains the engine's original anchor expression;
 * it is neither a PM attribute nor saved OOXML. */
export function setLiveColumnLayout(view: EditorView, placements: ColumnBlockPlacement[]): void {
  setColumnLayout(view, placements)
  const right = new Set(
    placements
      .filter(
        ({ el, contentWPx }) =>
          contentWPx !== undefined && el.classList.contains('doc-table-float-right'),
      )
      .map(({ el }) => el),
  )
  const observer = (view as unknown as { domObserver?: { stop(): void; start(): void } })
    .domObserver
  observer?.stop()
  try {
    for (const el of view.dom.querySelectorAll<HTMLElement>(`.${MARKER}`)) {
      if (right.has(el)) continue
      el.classList.remove(MARKER)
      el.style.removeProperty(MARGIN)
    }
    for (const el of right) {
      el.classList.add(MARKER)
      const original = el.style.marginRight || '0px'
      if (el.style.getPropertyValue(MARGIN) !== original) el.style.setProperty(MARGIN, original)
    }
  } finally {
    observer?.start()
  }
}
