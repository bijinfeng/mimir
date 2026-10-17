/** @vitest-environment happy-dom */
import { Editor } from '@tiptap/core'
import { columnResizingPluginKey } from '@tiptap/pm/tables'
import { undoDepth } from '@tiptap/pm/history'
import { expect, it } from 'vitest'
import { editorExtensions } from '../../vendor/apps/docs/src/renderer/editor/extensions.js'
import { docxFitZoom, installDocxScaledTableResize, withDocxUnscaledLayout } from './docx-view.js'
import { DocxTableDesignExtension } from './docx-table-design.js'

it('fits the remaining middle column and page height, including 420px, without changing paper geometry', () => {
  const paper = { width: 800, height: 1100 }
  expect(docxFitZoom('width', { width: 1000, height: 800 }, paper)).toBe(952 / 800)
  expect(docxFitZoom('width', { width: 680, height: 800 }, paper)).toBe(632 / 800)
  expect(docxFitZoom('width', { width: 420, height: 800 }, paper)).toBe(372 / 800)
  expect(docxFitZoom('page', { width: 1000, height: 800 }, paper)).toBe(752 / 1100)
})
it('always restores display zoom after synchronous layout, including a failed measure', () => {
  const container = document.createElement('div'),
    paper = document.createElement('div')
  paper.className = 'doc-zoom'
  paper.style.zoom = '1.5'
  container.append(paper)
  expect(() =>
    withDocxUnscaledLayout(container, () => {
      expect(paper.style.zoom).toBe('1')
      throw new Error('measure')
    }),
  ).toThrow('measure')
  expect(paper.style.zoom).toBe('1.5')
})
it.each([0.5, 1, 1.5, 2])(
  'uses real PM column-resize mouse gestures at scale %s and one native undo step',
  (scale) => {
    const element = document.createElement('div')
    document.body.append(element)
    const editor = new Editor({
      element,
      extensions: editorExtensions,
      content: {
        type: 'doc',
        content: [
          {
            type: 'docTable',
            content: [0, 1].map(() => ({
              type: 'docTableRow',
              content: [0, 1].map(() => ({
                type: 'docTableCell',
                attrs: { colwidth: [100] },
                content: [{ type: 'docParagraph' }],
              })),
            })),
          },
          { type: 'docParagraph' },
        ],
      },
    })
    const dispose = installDocxScaledTableResize(editor, () => scale),
      before = editor.getJSON(),
      depth = undoDepth(editor.state)
    try {
      editor.view.dispatch(editor.state.tr.setMeta(columnResizingPluginKey, { setHandle: 2 }))
      const cell = editor.view.dom.querySelector('td')!
      cell.dispatchEvent(
        new MouseEvent('mousedown', { clientX: 200, buttons: 1, bubbles: true, cancelable: true }),
      )
      expect(columnResizingPluginKey.getState(editor.state)?.dragging).not.toBeNull()
      const move = new MouseEvent('mousemove', { clientX: 230, buttons: 1, bubbles: true })
      Object.defineProperty(move, 'which', { value: 1 })
      window.dispatchEvent(move)
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 230, bubbles: true }))
      for (let row = 0; row < 2; row++) {
        expect(editor.state.doc.child(0).child(row).child(0).attrs.colwidth).toEqual([
          100 + 30 / scale,
        ])
        expect(editor.state.doc.child(0).child(row).child(1).attrs.colwidth).toEqual([100])
      }
      expect(move.clientX).toBe(230)
      expect(undoDepth(editor.state)).toBe(depth + 1)
      editor.commands.undo()
      expect(editor.getJSON()).toEqual(before)
    } finally {
      dispose()
      editor.destroy()
      element.remove()
    }
  },
)

it.each([0.5, 1, 1.5, 2])(
  'preserves the native image resize zoom contract at scale %s',
  (scale) => {
    const wrap = document.createElement('div')
    wrap.className = 'doc-zoom'
    wrap.style.zoom = String(scale)
    const element = document.createElement('div')
    wrap.append(element)
    document.body.append(wrap)
    const editor = new Editor({
      element,
      extensions: editorExtensions,
      content: {
        type: 'doc',
        content: [
          {
            type: 'docProtected',
            attrs: {
              blockType: 'image',
              imageDataUrl:
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNioAAAAASUVORK5CYII=',
              imageWidthPx: 100,
              imageHeightPx: 80,
            },
          },
          { type: 'docParagraph' },
        ],
      },
    })
    const before = editor.getJSON(),
      depth = undoDepth(editor.state)
    try {
      const handle = editor.view.dom.querySelector<HTMLElement>('[data-resize-handle="e"]')!
      expect(handle).not.toBeNull()
      handle.dispatchEvent(
        new MouseEvent('mousedown', { clientX: 200, buttons: 1, bubbles: true, cancelable: true }),
      )
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 230, buttons: 1, bubbles: true }))
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 230, bubbles: true }))
      expect(editor.state.doc.child(0).attrs.imageWidthPx).toBe(100 + 30 / scale)
      expect(editor.state.doc.child(0).attrs.imageHeightPx).toBe(80)
      expect(undoDepth(editor.state)).toBe(depth + 1)
      editor.commands.undo()
      expect(editor.getJSON()).toEqual(before)
    } finally {
      editor.destroy()
      wrap.remove()
    }
  },
)

it('synchronizes the visible fixed table grid and total width after a scaled native drag', () => {
  const element = document.createElement('div')
  document.body.append(element)
  const editor = new Editor({
    element,
    extensions: [...editorExtensions, DocxTableDesignExtension],
    content: {
      type: 'doc',
      content: [
        {
          type: 'docTable',
          attrs: { widthPx: 280, colWidthsPct: [50, 50], tblFixedLayout: true },
          content: [0, 1].map(() => ({
            type: 'docTableRow',
            content: [0, 1].map(() => ({
              type: 'docTableCell',
              attrs: { colwidth: [140] },
              content: [{ type: 'docParagraph' }],
            })),
          })),
        },
        { type: 'docParagraph' },
      ],
    },
  })
  const dispose = installDocxScaledTableResize(editor, () => 1.5),
    original = editor.getJSON(),
    depth = undoDepth(editor.state)
  try {
    editor.view.dispatch(editor.state.tr.setMeta(columnResizingPluginKey, { setHandle: 2 }))
    editor.view.dom
      .querySelector('td')!
      .dispatchEvent(
        new MouseEvent('mousedown', { clientX: 200, buttons: 1, bubbles: true, cancelable: true }),
      )
    const move = new MouseEvent('mousemove', { clientX: 260, buttons: 1, bubbles: true })
    Object.defineProperty(move, 'which', { value: 1 })
    window.dispatchEvent(move)
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 260, bubbles: true }))
    const resized = editor.getJSON()
    expect(editor.state.doc.firstChild!.firstChild!.firstChild!.attrs.colwidth).toEqual([180])
    expect(editor.state.doc.firstChild!.attrs.widthPx).toBe(320)
    expect(editor.state.doc.firstChild!.attrs.colWidthsPct).toEqual([56.25, 43.75])
    const table = editor.view.dom.querySelector('table')!
    expect(table.style.width).toBe('320px')
    expect([...table.querySelectorAll('col')].map((col) => col.style.width)).toEqual([
      '56.25%',
      '43.75%',
    ])
    expect(undoDepth(editor.state)).toBe(depth + 1)
    editor.commands.undo()
    expect(editor.getJSON()).toEqual(original)
    expect(editor.view.dom.querySelector('table')!.style.width).toBe('280px')
    editor.commands.redo()
    expect(editor.getJSON()).toEqual(resized)
  } finally {
    dispose()
    editor.destroy()
    element.remove()
  }
})

it.each(['window', 'contents', 'percentage'] as const)(
  'keeps imported %s sizing and float metadata when live column widths change',
  (mode) => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: [...editorExtensions, DocxTableDesignExtension],
      content: {
        type: 'doc',
        content: [
          {
            type: 'docTable',
            attrs: {
              widthPx: 280,
              widthPct: mode === 'percentage' ? 75 : null,
              tblAutoFit: mode === 'percentage' ? 'fixed' : mode,
              colWidthsPct: [50, 50],
              tblFloat: 'left',
              tblFloatXTwips: 900,
              tblFloatYTwips: 300,
              tblFloatSource: '<w:tblpPr w:tblpX="900" w:tblpY="300"/>',
            },
            content: [
              {
                type: 'docTableRow',
                content: [0, 1].map(() => ({
                  type: 'docTableCell',
                  attrs: { colwidth: [140] },
                  content: [{ type: 'docParagraph' }],
                })),
              },
            ],
          },
          { type: 'docParagraph' },
        ],
      },
    })
    try {
      const before = editor.getJSON(),
        attrs = editor.state.doc.firstChild!.attrs,
        cell = editor.state.doc.nodeAt(2)!
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(2, undefined, { ...cell.attrs, colwidth: [180] }),
      )
      const current = editor.state.doc.firstChild!.attrs
      expect(current).toEqual({
        ...attrs,
        colWidthsPct: mode === 'contents' ? [50, 50] : [56.25, 43.75],
      })
      editor.commands.undo()
      expect(editor.getJSON()).toEqual(before)
    } finally {
      editor.destroy()
    }
  },
)
