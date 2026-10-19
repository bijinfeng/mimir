/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Editor } from '@tiptap/core'
import { undoDepth, redoDepth } from '@tiptap/pm/history'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import type { DocxAgentHandle } from '../agent/docx-agent.js'
import { DocxEditor } from './DocxEditor.js'
import { designFixture } from './docx-design-test-fixture.js'
import { setColumnLayout } from '../../vendor/apps/docs/src/renderer/editor/column-layout.js'
import { setPageGaps } from '../../vendor/apps/docs/src/renderer/editor/pagination-gaps.js'
import { docxFitZoom } from './docx-view.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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
}
async function boot() {
  const bytes = await designFixture(),
    downloaded: Blob[] = [],
    dirty = vi.fn<(dirty: boolean) => void>(),
    saved = vi.fn<(bytes: Uint8Array) => Promise<void>>()
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    downloaded.push(blob as Blob)
    return 'blob:views'
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const host = document.createElement('div'),
    root = createRoot(host)
  document.body.append(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  let handle: DocxAgentHandle | null = null
  const changes: (DocxAgentHandle | null)[] = []
  await act(async () =>
    root.render(
      <DocxEditor
        documentId="views"
        io={{ load: async () => bytes, save: saved }}
        onDirtyChange={dirty}
        onAgentHandleChange={(value) => {
          handle = value
          changes.push(value)
        }}
      />,
    ),
  )
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await settle(() => !!handle)
  const editor = (host.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor
  await act(async () => {
    ;[...host.querySelectorAll<HTMLElement>('[role="tab"]')]
      .find((el) => el.textContent === '视图')!
      .click()
  })
  return { host, editor, bytes, dirty, saved, downloaded, changes, handle: () => handle! }
}
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((part) => !part.dir)
        .map(async (part) => [part.name, await part.async('uint8array')]),
    ),
  )
}

it('keeps one mounted editor, source ZIP, clean state, selection, version and history through print/Web/read/zoom/navigation', async () => {
  const app = await boot(),
    { host, editor } = app,
    handle = app.handle(),
    pm = editor.view.dom
  const before = editor.getJSON(),
    selection = editor.state.selection.toJSON(),
    version = handle.getVersion(),
    history = [undoDepth(editor.state), redoDepth(editor.state)]
  const initialChanges = [...app.changes]
  await click(host, 'Web 布局')
  expect(host.querySelector('[data-docx-layout="web"]')).not.toBeNull()
  await click(host, '阅读模式')
  expect(editor.isEditable).toBe(false)
  expect(host.querySelector('[aria-label="阅读视图"]')).not.toBeNull()
  expect(host.querySelector('.mimir-docx-edit-toolbar')?.hasAttribute('hidden')).toBe(true)
  await click(host, '文档导航')
  expect(host.querySelector('[aria-label="文档导航面板"]')?.textContent).toContain('文档尚无标题')
  await act(async () =>
    host
      .querySelector('[aria-label="文档导航面板"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  )
  expect(host.querySelector('[aria-label="文档导航面板"]')).toBeNull()
  expect(editor.isEditable).toBe(false)
  expect(document.activeElement?.closest('[hidden]')).toBeNull()
  expect(document.activeElement?.getAttribute('aria-label')).toBe('文档导航')
  await act(async () =>
    pm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  )
  expect(editor.isEditable).toBe(true)
  await click(host, '打印布局')
  await click(host, '文档缩放')
  const menuItem = [...host.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (el) => el.textContent === '150%',
  )
  expect(menuItem).toBeDefined()
  await act(async () => menuItem!.click())
  expect((host.querySelector('.doc-zoom') as HTMLElement).style.zoom).toBe('1.5')
  await click(host, '实际大小 100%')
  expect((host.querySelector('.doc-zoom') as HTMLElement).style.zoom).toBe('1')
  expect(editor.view.dom).toBe(pm)
  expect(host.querySelectorAll('.ProseMirror')).toHaveLength(1)
  expect(editor.getJSON()).toEqual(before)
  expect(editor.state.selection.toJSON()).toEqual(selection)
  expect(app.handle()).toBe(handle)
  expect(app.changes).toEqual(initialChanges)
  expect(handle.getVersion()).toBe(version)
  expect([undoDepth(editor.state), redoDepth(editor.state)]).toEqual(history)
  expect(app.dirty).not.toHaveBeenCalledWith(true)
  await click(host, '导出当前 DOCX 副本')
  await settle(() => app.downloaded.length === 1)
  expect(await entries(new Uint8Array(await app.downloaded[0]!.arrayBuffer()))).toEqual(
    await entries(app.bytes),
  )
  expect(app.saved).not.toHaveBeenCalled()
})

it('exits reading for Ctrl+F and reveals the existing find/replace bar without an edit', async () => {
  const { host, editor, handle, dirty } = await boot(),
    before = editor.getJSON(),
    version = handle().getVersion(),
    history = undoDepth(editor.state)
  await click(host, '阅读模式')
  await act(async () => {
    editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }),
    )
  })
  const input = host.querySelector<HTMLElement>('[data-find-input]')!
  expect(input).not.toBeNull()
  expect(input.closest('[hidden]')).toBeNull()
  expect(editor.isEditable).toBe(true)
  expect(editor.getJSON()).toEqual(before)
  expect(handle().getVersion()).toBe(version)
  expect(undoDepth(editor.state)).toBe(history)
  expect(dirty).not.toHaveBeenCalledWith(true)
})

it.each(['query Escape', 'replace Escape', 'close button', 'toolbar toggle'])(
  '%s returns find focus to the original editor without changing content or history',
  async (method) => {
    const { host, editor, handle, dirty } = await boot(),
      pm = editor.view.dom,
      before = editor.getJSON(),
      version = handle().getVersion(),
      history = [undoDepth(editor.state), redoDepth(editor.state)]
    await act(async () =>
      pm.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }),
      ),
    )
    const query = host.querySelector<HTMLInputElement>('[data-find-input]')!
    await settle(() => document.activeElement === query)
    if (method.endsWith('Escape')) {
      const input =
        method === 'query Escape'
          ? query
          : host.querySelector<HTMLInputElement>('[aria-label="替换为"]')!
      await act(async () => {
        input.focus()
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      })
    } else if (method === 'close button') await click(host, '关闭查找')
    else {
      await act(async () =>
        [...host.querySelectorAll<HTMLElement>('[role="tab"]')]
          .find((node) => node.textContent === '视图')!
          .click(),
      )
      await click(host, '查找和替换 (Ctrl+F)')
    }
    expect(host.querySelector('[data-find-input]')).toBeNull()
    expect(document.activeElement).toBe(pm)
    expect(editor.view.dom).toBe(pm)
    expect(host.querySelectorAll('.ProseMirror')).toHaveLength(1)
    expect(editor.getJSON()).toEqual(before)
    expect(handle().getVersion()).toBe(version)
    expect([undoDepth(editor.state), redoDepth(editor.state)]).toEqual(history)
    expect(dirty).not.toHaveBeenCalledWith(true)
  },
)

it.each(['button', 'input'] as const)(
  'does not steal deliberately moved outside %s focus when find is closed',
  async (tag) => {
    const { host, editor } = await boot()
    await act(async () =>
      editor.view.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }),
      ),
    )
    const query = host.querySelector<HTMLInputElement>('[data-find-input]')!
    await settle(() => document.activeElement === query)
    const outside = document.createElement(tag)
    host.append(outside)
    await act(async () => outside.focus())
    await click(host, '关闭查找')
    expect(host.querySelector('[data-find-input]')).toBeNull()
    expect(document.activeElement === outside || document.activeElement === document.body).toBe(
      true,
    )
    expect(document.activeElement).not.toBe(editor.view.dom)
  },
)

it('closes a collapsed insertion group before opening its Inspector and returns to the live group', async () => {
  const originalRect = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.classList.contains('mimir-compact-toolbar__commands'))
      return { ...originalRect.call(this), width: 100 } as DOMRect
    if (this.dataset.sectionKey) return { ...originalRect.call(this), width: 600 } as DOMRect
    return originalRect.call(this)
  })
  const { host, editor, handle, dirty } = await boot(),
    before = editor.getJSON(),
    version = handle().getVersion(),
    history = [undoDepth(editor.state), redoDepth(editor.state)]
  await act(async () =>
    [...host.querySelectorAll<HTMLElement>('[role="tab"]')]
      .find((node) => node.textContent === '插入')!
      .click(),
  )
  await click(host, '表格、图片与链接')
  expect(host.querySelector('[role="menu"][aria-label="表格、图片与链接"]')).not.toBeNull()
  await click(host, '图表')
  const panel = host.querySelector<HTMLElement>('aside[aria-label="图表面板"]')!
  expect(panel).not.toBeNull()
  expect(host.querySelector('[role="menu"][aria-label="表格、图片与链接"]')).toBeNull()
  expect(document.activeElement).toBe(panel)
  await act(async () =>
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  )
  expect(host.querySelector('aside[aria-label="图表面板"]')).toBeNull()
  const liveEntry = host.querySelector('button[aria-label="表格、图片与链接"]')
  expect(document.activeElement).toBe(liveEntry)
  expect(liveEntry?.getAttribute('aria-expanded')).toBe('false')
  expect(editor.getJSON()).toEqual(before)
  expect(handle().getVersion()).toBe(version)
  expect([undoDepth(editor.state), redoDepth(editor.state)]).toEqual(history)
  expect(dirty).not.toHaveBeenCalledWith(true)
})

it('preserves dirty edits and an existing redo branch through view changes', async () => {
  const app = await boot(),
    { editor, host } = app,
    initial = editor.getJSON()
  act(() => editor.commands.insertContent('Unsaved view edit'))
  const edited = editor.getJSON(),
    version = app.handle().getVersion(),
    history = [undoDepth(editor.state), redoDepth(editor.state)]
  await click(host, 'Web 布局')
  await click(host, '阅读模式')
  await click(host, '退出阅读模式')
  await click(host, '打印布局')
  expect(editor.getJSON()).toEqual(edited)
  expect(app.handle().getVersion()).toBe(version)
  expect([undoDepth(editor.state), redoDepth(editor.state)]).toEqual(history)
  expect(host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')?.disabled).toBe(false)
  await click(host, '撤销 (Ctrl+Z)')
  expect(editor.getJSON()).toEqual(initial)
  const undoneVersion = app.handle().getVersion(),
    redoBranch = [undoDepth(editor.state), redoDepth(editor.state)]
  expect(redoBranch[1]).toBeGreaterThan(0)
  await click(host, 'Web 布局')
  await click(host, '阅读模式')
  await click(host, '退出阅读模式')
  await click(host, '打印布局')
  expect(editor.getJSON()).toEqual(initial)
  expect(app.handle().getVersion()).toBe(undoneVersion)
  expect([undoDepth(editor.state), redoDepth(editor.state)]).toEqual(redoBranch)
  await click(host, '重做 (Ctrl+Shift+Z)')
  expect(editor.getJSON()).toEqual(edited)
  expect(app.saved).not.toHaveBeenCalled()
})

it('measures actual pagination blocks at 100% before restoring the selected 150% display', async () => {
  const { host, editor, handle, dirty } = await boot(),
    wrap = host.querySelector<HTMLElement>('.doc-zoom')!,
    before = editor.getJSON(),
    version = handle().getVersion(),
    measurements: string[] = []
  for (const [index, block] of [...editor.view.dom.children].entries())
    vi.spyOn(block, 'getBoundingClientRect').mockImplementation(() => {
      // Other live preview consumers also read these blocks in display pixels.
      // Pagination explicitly marks its untransformed block measurement phase.
      if (block.closest('.measuring-columns')) measurements.push(wrap.style.zoom)
      return DOMRect.fromRect({ y: index * 80, width: 600, height: 80 })
    })
  await click(host, '文档缩放')
  const menuItem = [...host.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent === '150%',
  )!
  await act(async () => menuItem.click())
  await settle(() => measurements.length > 0)
  expect(new Set(measurements)).toEqual(new Set(['1']))
  expect(wrap.style.zoom).toBe('1.5')
  expect(editor.getJSON()).toEqual(before)
  expect(handle().getVersion()).toBe(version)
  expect(dirty).not.toHaveBeenCalledWith(true)
})

it('fits the live scroll viewport again when its available width or height changes', async () => {
  const observers: { callback: ResizeObserverCallback; targets: Element[] }[] = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      targets: Element[] = []
      constructor(callback: ResizeObserverCallback) {
        observers.push({ callback, targets: this.targets })
      }
      observe(element: Element) {
        this.targets.push(element)
      }
      unobserve() {}
      disconnect() {}
    },
  )
  const { host, editor, handle, dirty } = await boot(),
    scroller = host.querySelector<HTMLElement>('.mimir-docx-scroll')!,
    wrap = host.querySelector<HTMLElement>('.doc-zoom')!,
    before = editor.getJSON(),
    version = handle().getVersion()
  let width = 1000,
    height = 900
  Object.defineProperties(scroller, {
    clientWidth: { configurable: true, get: () => width },
    clientHeight: { configurable: true, get: () => height },
  })
  const resize = async () =>
    act(async () => {
      for (const observer of observers.filter((entry) => entry.targets.includes(scroller)))
        observer.callback([], {} as ResizeObserver)
    })
  await resize()
  await click(host, '适合页宽')
  const zoom = () => Number(host.querySelector<HTMLElement>('.doc-zoom')!.style.zoom)
  const paper = {
    width: parseFloat(wrap.style.getPropertyValue('--page-w')),
    height: parseFloat(wrap.style.getPropertyValue('--page-h')),
  }
  const wideZoom = zoom()
  expect(wideZoom).toBeGreaterThan(1)
  width = 680
  await resize()
  expect(zoom()).toBeCloseTo(wideZoom * ((680 - 48) / (1000 - 48)))
  await click(host, '显示整页')
  height = 420
  await resize()
  expect(zoom()).toBeCloseTo(docxFitZoom('page', { width, height }, paper))
  await click(host, '实际大小 100%')
  expect(zoom()).toBe(1)
  expect(editor.getJSON()).toEqual(before)
  expect(handle().getVersion()).toBe(version)
  expect(dirty).not.toHaveBeenCalledWith(true)
})

it('removes print column/gap/sheet/HF/image layout in Web and remeasures after returning to print', async () => {
  const { host, editor, handle } = await boot(),
    before = editor.getJSON(),
    version = handle().getVersion()
  const pm = editor.view.dom,
    wrap = host.querySelector<HTMLElement>('.page-wrap')!,
    page = host.querySelector<HTMLElement>('.doc-page')!
  const measurements = [...pm.children].map((element, index) =>
    vi
      .spyOn(element, 'getBoundingClientRect')
      .mockReturnValue(DOMRect.fromRect({ y: index * 80, width: 600, height: 80 })),
  )
  await act(async () => {
    setColumnLayout(editor.view, [
      { el: pm.firstElementChild as HTMLElement, dx: 120, dy: -40, widthPx: 240 },
    ])
    setPageGaps(editor.view, [
      {
        pos: 1,
        kind: 'inline',
        metrics: { marginTop: 80, marginBottom: 100, marginLeft: 60, marginRight: 60 },
      },
    ])
  })
  expect(pm.querySelector('.doc-col-block')).not.toBeNull()
  expect(pm.querySelector('.page-gap')).not.toBeNull()
  for (const className of ['mimir-edge-hf', 'mimir-page-images', 'page-sheets']) {
    const layer = document.createElement('div')
    layer.className = className
    wrap.append(layer)
  }
  wrap.classList.add('paper-mixed')
  wrap.style.minHeight = '4500px'
  page.style.minHeight = '4300px'
  await click(host, 'Web 布局')
  expect(pm.querySelector('.doc-col-block, .page-gap, .mimir-docx-endnotes')).toBeNull()
  expect(wrap.querySelector('.mimir-edge-hf, .mimir-page-images, .page-sheets')).toBeNull()
  expect(wrap.classList.contains('paper-mixed')).toBe(false)
  expect(wrap.style.minHeight).toBe('')
  expect(page.style.minHeight).toBe('')
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)))
  expect(pm.querySelector('.page-gap, .doc-col-block')).toBeNull()
  measurements.forEach((measure) => measure.mockClear())
  await click(host, '打印布局')
  await settle(() => measurements.some((measure) => measure.mock.calls.length > 0))
  expect(editor.getJSON()).toEqual(before)
  expect(handle().getVersion()).toBe(version)
})

it('keeps Agent reads in reading, exits before writes/drafts and retains dirty undo/redo and handle identity', async () => {
  const app = await boot(),
    handle = app.handle(),
    { editor, host } = app
  await click(host, '阅读模式')
  await act(async () => {
    await handle.execute('get_document_context', {})
  })
  expect(editor.isEditable).toBe(false)
  expect(app.handle()).toBe(handle)
  await act(async () => {
    await handle.execute('insert_content', { html: '<p>AI text</p>' })
  })
  expect(editor.isEditable).toBe(true)
  expect(host.querySelector('[data-docx-reading="true"]')).toBeNull()
  expect(editor.state.doc.textContent).toContain('AI text')
  expect(app.dirty).toHaveBeenCalledWith(true)
  await click(host, '阅读模式')
  await act(async () => handle.beginDraft('read-draft'))
  expect(editor.isEditable).toBe(true)
  act(() => handle.discardDraft('read-draft'))
  await click(host, '阅读模式')
  const before = editor.getJSON()
  act(() => editor.commands.insertContent('Pending external write'))
  expect(editor.isEditable).toBe(true)
  expect(editor.getJSON()).not.toEqual(before)
  const content = editor.getJSON()
  await click(host, '撤销 (Ctrl+Z)')
  expect(editor.getJSON()).not.toEqual(content)
  await click(host, '重做 (Ctrl+Shift+Z)')
  expect(editor.getJSON()).toEqual(content)
  expect(app.handle()).toBe(handle)
})

it('navigates live heading positions without editing the document and returns focus on Escape', async () => {
  const { host, editor, handle } = await boot()
  act(() =>
    editor.commands.setContent({
      type: 'doc',
      content: [
        { type: 'docHeading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Overview' }] },
        { type: 'docParagraph', content: [{ type: 'text', text: 'Body' }] },
        { type: 'docHeading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Detail' }] },
      ],
    }),
  )
  const before = editor.getJSON(),
    version = handle().getVersion(),
    history = undoDepth(editor.state)
  await click(host, '文档导航')
  const panel = host.querySelector<HTMLElement>('[aria-label="文档导航面板"]')!
  expect(document.activeElement).toBe(panel)
  const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {})
  await click(host, '转到标题：Detail')
  expect(editor.state.selection.from).toBe(
    editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize + 1,
  )
  expect(scroll).toHaveBeenCalledWith({ block: 'start' })
  await act(async () =>
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  )
  expect(document.activeElement?.getAttribute('aria-label')).toBe('文档导航')
  expect(editor.getJSON()).toEqual(before)
  expect(handle().getVersion()).toBe(version)
  expect(undoDepth(editor.state)).toBe(history)
})
