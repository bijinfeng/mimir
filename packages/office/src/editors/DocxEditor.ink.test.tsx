/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Editor } from '@tiptap/core'
import { undoDepth } from '@tiptap/pm/history'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import type { DocxAgentHandle } from '../agent/docx-agent.js'
import { DocxEditor } from './DocxEditor.js'
import { designFixture } from './docx-design-test-fixture.js'
import { inkAnnotations } from '../docx-ink-model.js'
import { measureInkAnchors, chooseInkAnchor } from './DocxInkOverlay.js'
import { openDocx } from '../docx.js'
import { setColumnLayout } from '../../vendor/apps/docs/src/renderer/editor/column-layout.js'
import { anchoredInkRunXml } from '../../vendor/packages/docx-engine/src/ink.js'
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})
async function settle(done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i++)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 2)))
  expect(done()).toBe(true)
}
async function click(host: HTMLElement, label: string) {
  const node = [...host.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`)].find(
    (el) => !el.closest('[hidden]'),
  )!
  expect(node).not.toBeUndefined()
  expect(node.disabled).toBe(false)
  await act(async () => {
    node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    node.click()
  })
  return node
}
async function tab(host: HTMLElement, label: string) {
  await act(async () =>
    [...host.querySelectorAll<HTMLElement>('[role="tab"]')]
      .find((el) => el.textContent === label)!
      .click(),
  )
}
const rect = (x: number, y: number, width: number, height: number) =>
  ({
    x,
    y,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    width,
    height,
    toJSON: () => ({}),
  }) as DOMRect
async function boot({
  narrow = false,
  sourceBytes,
}: { narrow?: boolean; sourceBytes?: Uint8Array } = {}) {
  const host = document.createElement('div'),
    root = createRoot(host),
    bytes = sourceBytes ?? (await designFixture())
  document.body.append(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  let handle: DocxAgentHandle | null = null
  const saved: Uint8Array[] = []
  await act(async () =>
    root.render(
      <DocxEditor
        documentId="ink"
        io={{
          load: async () => bytes,
          save: async (output) => {
            saved.push(output)
          },
        }}
        onAgentHandleChange={(value) => {
          handle = value
        }}
      />,
    ),
  )
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await settle(() => !!handle)
  const editor = (host.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor
  const overlay = host.querySelector<SVGSVGElement>('.mimir-docx-ink-overlay')!,
    stage = overlay.parentElement!
  const zoomState = { value: 1, scroll: 0 }
  vi.spyOn(stage, 'getBoundingClientRect').mockImplementation(() =>
    rect(50, 100 - zoomState.scroll, 700 * zoomState.value, 900 * zoomState.value),
  )
  vi.spyOn(overlay, 'getBoundingClientRect').mockImplementation(() => stage.getBoundingClientRect())
  const originalRect = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (narrow && this.classList.contains('mimir-compact-toolbar__commands'))
      return rect(0, 0, 100, 30)
    if (narrow && this.dataset.sectionKey === 'ink-tools') return rect(0, 0, 600, 30)
    let index = -1,
      ordinal = 0
    editor.state.doc.forEach((node, pos) => {
      if (editor.view.nodeDOM(pos) === this) index = ordinal
      ordinal++
    })
    if (index < 0) return originalRect.call(this)
    return rect(
      50 + (index ? 350 : 50) * zoomState.value,
      100 - zoomState.scroll + (index ? 160 : 60) * zoomState.value,
      260 * zoomState.value,
      40 * zoomState.value,
    )
  })
  const computed = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, ...rest) => {
    const actual = computed(element, ...rest)
    if (element.parentElement?.classList.contains('ProseMirror'))
      return new Proxy(actual, {
        get: (target, key) =>
          key === 'marginLeft' ? '24px' : key === 'marginRight' ? '0px' : Reflect.get(target, key),
      })
    return actual
  })
  await act(async () => window.dispatchEvent(new Event('resize')))
  await tab(host, '绘图')
  return { host, editor, stage, overlay, saved, zoomState, bytes, handle: () => handle! }
}
async function pointer(el: SVGSVGElement, type: string, x: number, y: number, pointerId = 1) {
  await act(async () =>
    el.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId,
        isPrimary: true,
        button: 0,
      }),
    ),
  )
}
async function draw(state: Awaited<ReturnType<typeof boot>>, tool = '笔') {
  await click(state.host, tool)
  await pointer(state.overlay, 'pointerdown', 110, 170)
  await pointer(state.overlay, 'pointermove', 140, 180)
  await pointer(state.overlay, 'pointerup', 150, 185)
}
it('actual editor draws/selects/deletes/undoes/erases a native stroke and saves reopened ink', async () => {
  const state = await boot(),
    { host, editor, overlay, saved } = state
  const before = editor.state.doc
  await draw(state)
  expect(undoDepth(editor.state)).toBe(1)
  expect(inkAnnotations(editor.state.doc)).toHaveLength(1)
  expect(overlay.querySelectorAll('[data-ink-id]')).toHaveLength(1)
  expect(inkAnnotations(editor.state.doc)[0]!.stroke!.points).toEqual([
    { x: 34, y: 10 },
    { x: 64, y: 20 },
    { x: 74, y: 25 },
  ])
  await click(host, '选择笔迹')
  await pointer(overlay, 'pointerdown', 140, 180)
  await click(host, '笔迹设置')
  const panel = host.querySelector('aside[aria-label="笔迹设置面板"]')!
  expect(panel.textContent).toContain('已选：笔 · 2px · #1F2937')
  await click(host, '删除选中笔迹')
  expect(inkAnnotations(editor.state.doc)).toHaveLength(0)
  await act(async () => editor.commands.undo())
  expect(inkAnnotations(editor.state.doc)).toHaveLength(1)
  await click(host, '关闭文档属性面板')
  await click(host, '逐笔擦除')
  await pointer(overlay, 'pointerdown', 130, 178)
  await pointer(overlay, 'pointerup', 135, 180)
  expect(inkAnnotations(editor.state.doc)).toHaveLength(0)
  await act(async () => editor.commands.undo())
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    scale: () => {},
    translate: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
  } as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
  )
  await click(host, '保存到库')
  await settle(() => saved.length === 1)
  const reopened = await openDocx(saved[0]!)
  expect(reopened.footnotes.parsed.inks).toHaveLength(1)
  await act(async () => {
    editor.commands.undo()
    editor.commands.undo()
  })
  expect(editor.state.doc.eq(before)).toBe(true)
})
it('keeps the first stroke when focusing the canvas would scroll its ancestor', async () => {
  const state = await boot(),
    { host, overlay, editor } = state
  const scroller = host.querySelector<HTMLElement>('.mimir-docx-scroll')!,
    focus = overlay.focus.bind(overlay)
  scroller.scrollTop = 0
  // Browser focus scrolls asynchronously after pointerdown. The real scroll
  // listener must still cancel user scrolling, so prevent this focus scroll.
  vi.spyOn(overlay, 'focus').mockImplementation((options) => {
    focus(options)
    if (!options?.preventScroll) {
      scroller.scrollTop = 24
      queueMicrotask(() => scroller.dispatchEvent(new Event('scroll')))
    }
  })
  await draw(state)
  expect(scroller.scrollTop).toBe(0)
  expect(inkAnnotations(editor.state.doc)).toHaveLength(1)
  expect(inkAnnotations(editor.state.doc)[0]!.stroke!.points).toHaveLength(3)
  expect(undoDepth(editor.state)).toBe(1)
})
it('keeps a stroke across display-only transactions when document and measured geometry stay fixed', async () => {
  const { host, overlay, editor } = await boot()
  await click(host, '荧光笔')
  await pointer(overlay, 'pointerdown', 110, 170)
  await pointer(overlay, 'pointermove', 140, 180)
  expect(overlay.querySelector('path')).not.toBeNull()
  const before = editor.state.doc
  // Pagination publishes decoration metadata asynchronously, without a content edit.
  await act(async () => editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false)))
  expect(editor.state.doc).toBe(before)
  expect(overlay.querySelector('path')).not.toBeNull()
  await pointer(overlay, 'pointerup', 150, 185)
  expect(inkAnnotations(editor.state.doc)).toHaveLength(1)
  expect(inkAnnotations(editor.state.doc)[0]!.stroke!.points).toHaveLength(3)
  expect(inkAnnotations(editor.state.doc)[0]!.stroke!.tool).toBe('highlighter')
  expect(undoDepth(editor.state)).toBe(1)
})
it('cancels a display-only transaction if the canvas viewport origin changed', async () => {
  const { host, overlay, editor, zoomState } = await boot()
  await click(host, '荧光笔')
  await pointer(overlay, 'pointerdown', 110, 170)
  await pointer(overlay, 'pointermove', 140, 180)
  expect(overlay.querySelector('path')).not.toBeNull()
  const before = editor.state.doc
  zoomState.scroll = 24
  await act(async () => editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false)))
  expect(overlay.querySelector('path')).toBeNull()
  await pointer(overlay, 'pointerup', 150, 185)
  expect(editor.state.doc).toBe(before)
  expect(inkAnnotations(editor.state.doc)).toHaveLength(0)
  expect(undoDepth(editor.state)).toBe(0)
})
it('cancels a display-only transaction if paragraph or canvas geometry changed', async () => {
  const { host, overlay, editor, zoomState } = await boot()
  await click(host, '荧光笔')
  await pointer(overlay, 'pointerdown', 110, 170)
  await pointer(overlay, 'pointermove', 140, 180)
  expect(overlay.querySelector('path')).not.toBeNull()
  const before = editor.state.doc
  zoomState.value = 1.2
  await act(async () => editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false)))
  expect(overlay.querySelector('path')).toBeNull()
  await pointer(overlay, 'pointerup', 150, 185)
  expect(editor.state.doc).toBe(before)
  expect(inkAnnotations(editor.state.doc)).toHaveLength(0)
  expect(undoDepth(editor.state)).toBe(0)
})
it('cancels pointercancel, external document writes, scrolling, tool changes and Escape without fake history', async () => {
  const state = await boot(),
    { host, editor, overlay } = state
  await click(host, '笔')
  await pointer(overlay, 'pointerdown', 110, 170)
  await pointer(overlay, 'pointermove', 140, 180)
  await pointer(overlay, 'pointercancel', 140, 180)
  expect(inkAnnotations(editor.state.doc)).toHaveLength(0)
  expect(undoDepth(editor.state)).toBe(0)
  await pointer(overlay, 'pointerdown', 110, 170)
  await pointer(overlay, 'pointermove', 140, 180)
  expect(overlay.querySelector('path')).not.toBeNull()
  await act(async () => editor.commands.insertContentAt(2, 'manual'))
  expect(overlay.querySelector('path')).toBeNull()
  await pointer(overlay, 'pointerup', 140, 180)
  expect(inkAnnotations(editor.state.doc)).toHaveLength(0)
  await pointer(overlay, 'pointerdown', 110, 170)
  await act(async () => window.dispatchEvent(new Event('scroll')))
  await pointer(overlay, 'pointerup', 140, 180)
  expect(inkAnnotations(editor.state.doc)).toHaveLength(0)
  await pointer(overlay, 'pointerdown', 110, 170)
  await click(host, '荧光笔')
  await pointer(overlay, 'pointerup', 140, 180)
  expect(inkAnnotations(editor.state.doc)).toHaveLength(0)
  await act(async () =>
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  )
  expect(overlay.getAttribute('data-active')).toBe('false')
  expect(document.activeElement?.getAttribute('aria-label')).toBe('笔')
})
it('uses independent current pen/highlighter width/colors, confirms clear, and shows live counts', async () => {
  const state = await boot(),
    { host, editor } = state
  await click(host, '笔迹设置')
  const width = host.querySelector<HTMLInputElement>('input[aria-label="荧光笔宽度"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(width, '22')
    width.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () =>
    width.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  )
  await click(host, '荧光笔颜色')
  await click(host, '#4472C4')
  await draw(state, '荧光笔')
  expect(inkAnnotations(editor.state.doc)[0]!.stroke).toMatchObject({
    tool: 'highlighter',
    width: 22,
    color: '4472C4',
  })
  await draw(state, '笔')
  expect(inkAnnotations(editor.state.doc)[1]!.stroke).toMatchObject({
    tool: 'pen',
    width: 2,
    color: '1F2937',
  })
  expect(host.querySelector('aside')!.textContent).toContain('2 笔可编辑墨迹')
  await click(host, '清除全部笔迹')
  expect(inkAnnotations(editor.state.doc)).toHaveLength(2)
  await click(host, '确认清除笔迹')
  expect(inkAnnotations(editor.state.doc)).toHaveLength(0)
  await act(async () => editor.commands.undo())
  expect(inkAnnotations(editor.state.doc)).toHaveLength(2)
})
it('closes only ink settings on Escape and keeps drawing enabled with focus on the live settings entry', async () => {
  const { host, overlay, editor } = await boot()
  await click(host, '笔')
  await click(host, '笔迹设置')
  const panel = host.querySelector<HTMLElement>('aside[aria-label="笔迹设置面板"]')!
  await act(async () =>
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  )
  expect(host.querySelector('aside[aria-label="笔迹设置面板"]')).toBeNull()
  expect(overlay.getAttribute('data-active')).toBe('true')
  expect(document.activeElement?.getAttribute('aria-label')).toBe('笔迹设置')
  expect(undoDepth(editor.state)).toBe(0)
})
it('closes the collapsed ink group when opening settings and returns Escape to its live group entry', async () => {
  const { host, editor } = await boot({ narrow: true })
  const entry = await click(host, '墨迹')
  expect(entry.getAttribute('aria-expanded')).toBe('true')
  const settings = host.querySelector<HTMLButtonElement>('button[aria-label="笔迹设置"]')!
  await act(async () => {
    settings.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
    settings.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    settings.click()
  })
  const panel = host.querySelector<HTMLElement>('aside[aria-label="笔迹设置面板"]')!
  expect(panel).not.toBeNull()
  expect(entry.getAttribute('aria-expanded')).toBe('false')
  expect(host.querySelector('[role="menu"][aria-label="墨迹"]')).toBeNull()
  expect(document.activeElement).toBe(panel)
  await act(async () =>
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  )
  expect(host.querySelector('aside')).toBeNull()
  expect(document.activeElement).toBe(entry)
  expect(undoDepth(editor.state)).toBe(0)
})
it('describes preserved table ink as original ink while disabling editing', async () => {
  const zip = await JSZip.loadAsync(await designFixture())
  const run = anchoredInkRunXml(
    {
      widthPx: 4,
      heightPx: 4,
      offsetXPx: 8,
      offsetYPx: 8,
      payload: JSON.stringify({ v: 1, tool: 'pen', color: '1F2937', width: 2, points: [[10, 10]] }),
    },
    'rInk',
    4000,
  )
  const xml = await zip.file('word/document.xml')!.async('string')
  zip.file(
    'word/document.xml',
    xml.replace(
      '<w:body>',
      `<w:body><w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:tc><w:tcPr/><w:p>${run}</w:p></w:tc></w:tr></w:tbl>`,
    ),
  )
  const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
  zip.file(
    'word/_rels/document.xml.rels',
    rels.replace(
      '</Relationships>',
      '<Relationship Id="rInk" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/aidocsink1.png"/></Relationships>',
    ),
  )
  zip.file(
    'word/media/aidocsink1.png',
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
    { base64: true },
  )
  const types = await zip.file('[Content_Types].xml')!.async('string')
  zip.file(
    '[Content_Types].xml',
    types.replace(
      '</Types>',
      '<Override PartName="/word/media/aidocsink1.png" ContentType="image/png"/></Types>',
    ),
  )
  const { host } = await boot({ sourceBytes: await zip.generateAsync({ type: 'uint8array' }) })
  expect(host.querySelector<HTMLButtonElement>('button[aria-label="笔"]')!.disabled).toBe(true)
  await click(host, '笔迹设置')
  const panel = host.querySelector('aside[aria-label="笔迹设置面板"]')!
  expect(panel.textContent).toContain('1 笔原有墨迹')
  expect(panel.textContent).not.toContain('笔可编辑墨迹')
  expect(host.querySelector('.mimir-editor__status')!.textContent).toContain(
    '表格内复杂墨迹暂未显示',
  )
})
it.each([false, true])(
  'returns settings Escape focus to the visible category after its entry unmounts, drawing=%s',
  async (drawing) => {
    const { host, overlay, editor } = await boot()
    if (drawing) await click(host, '笔')
    await click(host, '笔迹设置')
    await tab(host, '开始')
    const panel = host.querySelector<HTMLElement>('aside[aria-label="笔迹设置面板"]')!
    await act(async () => {
      panel.focus()
      panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(host.querySelector('aside[aria-label="笔迹设置面板"]')).toBeNull()
    expect(document.activeElement?.getAttribute('role')).toBe('tab')
    expect(document.activeElement?.textContent).toBe('开始')
    expect(overlay.getAttribute('data-active')).toBe(String(drawing))
    expect(undoDepth(editor.state)).toBe(0)
  },
)
it.each([0.5, 0.75, 1, 1.5, 2])(
  'measures column edge rather than indent at zoom %s, including scroll and mixed section column placement',
  async (zoom) => {
    const { editor, stage, zoomState } = await boot()
    zoomState.value = zoom
    zoomState.scroll = 123
    const second = editor.view.nodeDOM(editor.state.doc.child(0).nodeSize) as HTMLElement
    await act(async () =>
      setColumnLayout(editor.view, [
        {
          el: second,
          dx: 300,
          dy: -80,
          widthPx: 260,
          contentWPx: 600,
          marginLeftPx: 60,
          marginRightPx: 60,
        },
      ]),
    )
    const measured = measureInkAnchors(editor, stage, zoom)
    expect(measured.anchors[0]).toMatchObject({ x: 26, y: 60, right: 310, bottom: 100 })
    expect(measured.anchors[1]).toMatchObject({ x: 326, y: 160, right: 610, bottom: 200 })
    expect(chooseInkAnchor(measured.anchors, { x: 400, y: 180 })?.pos).toBe(
      editor.state.doc.child(0).nodeSize,
    )
    expect(chooseInkAnchor(measured.anchors, { x: 100, y: 70 })?.pos).toBe(0)
  },
)

it('draws in the second section at real 150% view zoom after scroll and cancels when reading begins', async () => {
  const state = await boot(),
    { host, editor, overlay, zoomState } = state
  await tab(host, '视图')
  await click(host, '文档缩放')
  await act(async () =>
    [...host.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')]
      .find((el) => el.textContent?.includes('150%'))!
      .click(),
  )
  zoomState.value = 1.5
  zoomState.scroll = 123
  await act(async () => window.dispatchEvent(new Event('resize')))
  await tab(host, '绘图')
  await click(host, '笔')
  await pointer(overlay, 'pointerdown', 650, 240)
  await pointer(overlay, 'pointerup', 680, 255)
  const ink = inkAnnotations(editor.state.doc)[0]!
  expect(ink.anchor).toBe(editor.state.doc.child(1).attrs.mimirInkAnchor)
  expect(ink.stroke!.points).toEqual([
    { x: 74, y: 15.333333333333343 },
    { x: 94, y: 25.333333333333343 },
  ])
  await pointer(overlay, 'pointerdown', 650, 240)
  await tab(host, '视图')
  await click(host, '阅读模式')
  await pointer(overlay, 'pointerup', 680, 255)
  expect(inkAnnotations(editor.state.doc)).toHaveLength(1)
  expect(overlay.getAttribute('data-active')).toBe('false')
})
