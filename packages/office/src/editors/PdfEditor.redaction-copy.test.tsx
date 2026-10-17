/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PDFDocument, degrees } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { afterEach, expect, it, vi } from 'vitest'
import type { PdfHostLocal } from '../agent/pdf-local-agent.js'
import type { PdfAgentHandle } from '../agent/pdf-agent.js'
const rendering = vi.hoisted(() => ({ gate: null as Promise<void> | null }))
vi.mock('./pdf-render.js', () => ({
  retainPdfDocument: () => () => {},
  awaitPdfTask: <T,>(task: Promise<T>) => task,
  cancelPdfRender() {},
  retainPdfDocuments() {},
  renderPdfPages: async () => {
    await rendering.gate
    return { dispose() {} }
  },
  loadPdfDocument: async (bytes: Uint8Array) =>
    getDocument({ data: bytes.slice(), useSystemFonts: true }).promise,
}))
import { PdfEditor } from './PdfEditor.js'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const clean: (() => void)[] = []
afterEach(() => {
  clean.splice(0).forEach((f) => f())
  rendering.gate = null
  vi.restoreAllMocks()
})
async function settle(predicate: () => boolean) {
  for (let i = 0; i < 300 && !predicate(); i++)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)))
  expect(predicate()).toBe(true)
}
async function click(node: Element) {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    ;(node as HTMLElement).click()
  })
}
function button(host: HTMLElement, name: string) {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!
  expect(found).not.toBeNull()
  return found
}
async function tab(host: HTMLElement, name: string) {
  await click([...host.querySelectorAll('[role="tab"]')].find((el) => el.textContent === name)!)
}
async function boot() {
  const pdf = await PDFDocument.create()
  pdf.addPage([400, 600]).drawText('PUBLIC SECRET')
  const second = pdf.addPage([400, 600])
  second.setCropBox(15, 25, 350, 550)
  second.setRotation(degrees(90))
  second.drawText('ROTATED')
  const bytes = await pdf.save(),
    save = vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    dirty = vi.fn<(value: boolean) => void>()
  const hostLocal = vi.fn<PdfHostLocal>().mockImplementation(async ({ expectedVersion }) => ({
    version: expectedVersion,
    outputs: [{ name: 'document-redacted.pdf', bytes: new Uint8Array([37, 80, 68, 70]) }],
  }))
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:redacted')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  let handle: PdfAgentHandle | null = null
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const render = async (id = 'redaction') =>
    act(async () =>
      root.render(
        <PdfEditor
          documentId={id}
          io={{ load: async () => (id === 'redaction' ? bytes : bytes.slice()), save }}
          hostLocal={hostLocal}
          onDirtyChange={dirty}
          onAgentHandleChange={(value) => {
            handle = value
          }}
        />,
      ),
    )
  await render()
  await settle(() => !!handle)
  clean.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await tab(host, '编辑')
  return { host, bytes, save, dirty, hostLocal, download, render, handle: () => handle! }
}
async function open(host: HTMLElement) {
  await click(button(host, '标记涂黑副本'))
  await settle(() => !!host.querySelector('.mimir-pdf-redaction-overlay'))
}
function overlay(host: HTMLElement) {
  const el = host.querySelector<HTMLElement>('.mimir-pdf-redaction-overlay')!
  expect(el).not.toBeNull()
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 100, y: 200, width: 400, height: 600 }),
  )
  return el
}
async function pointer(el: HTMLElement, type: string, x: number, y: number, id = 1) {
  await act(async () => {
    el.dispatchEvent(
      new PointerEvent(type, {
        pointerId: id,
        button: 0,
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
        isPrimary: true,
      }),
    )
  })
}
async function mark(host: HTMLElement) {
  const el = overlay(host)
  await pointer(el, 'pointerdown', 140, 260)
  await pointer(el, 'pointermove', 240, 360)
  await pointer(el, 'pointerup', 240, 360)
}

it('exports frozen multi-page user-space regions, leaves source/dirty/version/history/save unchanged and shows the result', async () => {
  const app = await boot(),
    version = app.handle().getVersion(),
    context = app.handle().getContext()
  await open(app.host)
  await mark(app.host)
  await tab(app.host, '开始')
  await click(button(app.host, '下一页'))
  await settle(() => !!app.host.querySelector('.mimir-pdf-redaction-overlay'))
  await mark(app.host)
  expect(app.host.querySelectorAll('.mimir-pdf-redaction-list li')).toHaveLength(2)
  await click(button(app.host, '导出涂黑副本'))
  await settle(() => app.download.mock.calls.length === 1)
  const request = app.hostLocal.mock.calls.find(([r]) => r.operation.op === 'redact_copy')![0]
  expect(request.bytes).toBe(app.bytes)
  expect(request.expectedVersion).toBe(version)
  expect(request.operation).toEqual({
    op: 'redact_copy',
    regions: [
      { pageIndex: 0, rect: [40, 440, 140, 540] },
      { pageIndex: 1, rect: [50, 80, 108.33333333333333, 217.5] },
    ],
  })
  expect(app.handle().getVersion()).toBe(version)
  expect(app.handle().getContext()).toEqual({ ...context, currentPage: 2 })
  expect(app.dirty).not.toHaveBeenCalledWith(true)
  expect(app.save).not.toHaveBeenCalled()
  expect(app.host.textContent).toContain('已导出 2 个区域的涂黑副本')
})
it('ignores tiny drags, cancel/lost capture and wrong pointers; Escape cancels a gesture before closing with live trigger focus', async () => {
  const app = await boot()
  await open(app.host)
  const el = overlay(app.host)
  await pointer(el, 'pointerdown', 140, 260)
  await pointer(el, 'pointerup', 141, 261)
  await pointer(el, 'pointerdown', 140, 260)
  await pointer(el, 'pointerup', 240, 360, 2)
  await pointer(el, 'pointercancel', 240, 360)
  await pointer(el, 'pointerdown', 140, 260)
  await pointer(el, 'lostpointercapture', 240, 360)
  await pointer(el, 'pointerdown', 140, 260)
  await pointer(el, 'pointermove', 240, 360)
  await act(async () =>
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    ),
  )
  expect(app.host.querySelector('[aria-label="涂黑副本面板"]')).not.toBeNull()
  expect(app.host.querySelectorAll('.mimir-pdf-redaction-list li')).toHaveLength(0)
  await act(async () =>
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    ),
  )
  expect(app.host.querySelector('[aria-label="涂黑副本面板"]')).toBeNull()
  expect(document.activeElement?.getAttribute('aria-label')).toBe('标记涂黑副本')
})
it('retains markers and server failure for retry, removes individual regions and clears all', async () => {
  const app = await boot()
  await open(app.host)
  await mark(app.host)
  app.hostLocal.mockRejectedValueOnce(new Error('含共享图片，无法安全涂黑'))
  await click(button(app.host, '导出涂黑副本'))
  await settle(() => !!app.host.querySelector('[role="alert"]'))
  expect(app.host.textContent).toContain('含共享图片，无法安全涂黑')
  expect(app.host.querySelectorAll('.mimir-pdf-redaction-list li')).toHaveLength(1)
  await click(button(app.host, '导出涂黑副本'))
  await settle(() => app.download.mock.calls.length === 1)
  await mark(app.host)
  await click(button(app.host, '删除涂黑区域 1'))
  expect(app.host.querySelectorAll('.mimir-pdf-redaction-list li')).toHaveLength(1)
  await click(button(app.host, '清空涂黑标记'))
  expect(button(app.host, '导出涂黑副本').disabled).toBe(true)
})
it('returns Escape to the visible editing tab after navigating from another Ribbon category', async () => {
  const app = await boot()
  const editingTab = [...app.host.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (node) => node.textContent === '编辑',
  )!
  await open(app.host)
  await mark(app.host)
  await tab(app.host, '开始')
  await click(button(app.host, '下一页'))
  const panel = app.host.querySelector<HTMLElement>('.mimir-pdf-inspector')!
  panel.focus()
  expect(app.host.querySelector('button[aria-label="标记涂黑副本"]')).toBeNull()
  await act(async () =>
    panel.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    ),
  )
  expect(app.host.querySelector('[aria-label="涂黑副本面板"]')).toBeNull()
  expect(document.activeElement).toBe(editingTab)
  expect(app.hostLocal).not.toHaveBeenCalled()
  expect(app.save).not.toHaveBeenCalled()
})
it.each(['close', 'page', 'source', 'version', 'tool'] as const)(
  'cancels in-flight export on %s, blocks double clicks and rejects late downloads',
  async (reason) => {
    const app = await boot()
    await open(app.host)
    await mark(app.host)
    let release!: (value: Awaited<ReturnType<PdfHostLocal>>) => void
    app.hostLocal.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const version = app.handle().getVersion(),
      buttonExport = button(app.host, '导出涂黑副本')
    await act(async () => {
      buttonExport.click()
      buttonExport.click()
    })
    await settle(() => !!release)
    expect(
      app.hostLocal.mock.calls.filter(([request]) => request.operation.op === 'redact_copy'),
    ).toHaveLength(1)
    const signal = app.hostLocal.mock.calls[0]![0].signal!
    if (reason === 'close') await click(button(app.host, '关闭涂黑副本'))
    if (reason === 'page') {
      await tab(app.host, '开始')
      await click(button(app.host, '下一页'))
    }
    if (reason === 'source') await app.render('changed-source')
    if (reason === 'version')
      await act(async () => {
        await app
          .handle()
          .execute('apply_ops', { ops: [{ op: 'rotatePages', pages: [1], dir: 90 }] })
      })
    if (reason === 'tool') {
      await tab(app.host, '视图')
      await click(button(app.host, '导出页面图像'))
      await click(button(app.host, '关闭页面图像导出'))
    }
    expect(signal.aborted).toBe(true)
    await act(async () =>
      release({
        version,
        outputs: [{ name: 'document-redacted.pdf', bytes: new Uint8Array([1, 2, 3]) }],
      }),
    )
    expect(app.download).not.toHaveBeenCalled()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(app.host.querySelectorAll('.mimir-pdf-redaction-list li')).toHaveLength(
      reason === 'page' ? 1 : 0,
    )
    expect(
      reason !== 'tool' || app.host.querySelector('[aria-label="涂黑副本面板"]') === null,
    ).toBe(true)
    if (reason === 'tool') {
      await tab(app.host, '编辑')
      await open(app.host)
    }
    expect(app.host.querySelectorAll('.mimir-pdf-redaction-list li')).toHaveLength(
      reason === 'page' ? 1 : 0,
    )
  },
)
it('requires saving pending page edits before entering and waits for the rendered canvas identity', async () => {
  const app = await boot()
  await tab(app.host, '页面')
  await click(button(app.host, '向右旋转 90 度'))
  await tab(app.host, '编辑')
  await click(button(app.host, '标记涂黑副本'))
  expect(app.host.querySelector('[aria-label="涂黑副本面板"]')).toBeNull()
  expect(app.host.textContent).toContain('请先保存或取消')
  let release!: () => void
  rendering.gate = new Promise((resolve) => {
    release = resolve
  })
  await app.render('new-pristine')
  await settle(() => app.handle().documentId === 'new-pristine')
  await tab(app.host, '编辑')
  await click(button(app.host, '标记涂黑副本'))
  expect(app.host.querySelector('.mimir-pdf-redaction-overlay')).toBeNull()
  await act(async () => release())
  await settle(() => !!app.host.querySelector('.mimir-pdf-redaction-overlay'))
})

it('enforces the 100-region budget and a deletion immediately frees one slot', async () => {
  const app = await boot()
  await open(app.host)
  for (let index = 0; index < 101; index++) await mark(app.host)
  expect(app.host.querySelectorAll('.mimir-pdf-redaction-list li')).toHaveLength(100)
  expect(app.host.textContent).toContain('已达到100个区域')
  await click(button(app.host, '删除涂黑区域 100'))
  await mark(app.host)
  expect(app.host.querySelectorAll('.mimir-pdf-redaction-list li')).toHaveLength(100)
})

it.each(['version', 'working-bytes', 'multiple-outputs', 'filename'] as const)(
  'rejects an invalid %s export response without publishing or downloading',
  async (kind) => {
    const app = await boot()
    await open(app.host)
    await mark(app.host)
    const version = app.handle().getVersion()
    const output = {
      name: kind === 'filename' ? 'other.pdf' : 'document-redacted.pdf',
      bytes: new Uint8Array([1]),
    }
    app.hostLocal.mockResolvedValueOnce({
      version: version + (kind === 'version' ? 1 : 0),
      outputs: kind === 'multiple-outputs' ? [output, output] : [output],
      ...(kind === 'working-bytes' ? { bytes: new Uint8Array([2]) } : {}),
    })
    await click(button(app.host, '导出涂黑副本'))
    await settle(() => !!app.host.querySelector('[role="alert"]'))
    expect(app.host.textContent).toContain('涂黑副本响应无效')
    expect(app.host.querySelectorAll('.mimir-pdf-redaction-list li')).toHaveLength(1)
    expect(app.handle().getVersion()).toBe(version)
    expect(app.save).not.toHaveBeenCalled()
    expect(app.download).not.toHaveBeenCalled()
  },
)

it('cancels export when another host operation starts while keeping markers for a read-only operation', async () => {
  const app = await boot()
  await open(app.host)
  await mark(app.host)
  let release!: (value: Awaited<ReturnType<PdfHostLocal>>) => void
  app.hostLocal.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  app.hostLocal.mockImplementationOnce(async (request) => ({ version: request.expectedVersion }))
  await click(button(app.host, '导出涂黑副本'))
  const request = app.hostLocal.mock.calls[0]![0]
  await act(async () => {
    await app.handle().execute('get_document_properties', {})
  })
  expect(request.signal!.aborted).toBe(true)
  await act(async () =>
    release({
      version: request.expectedVersion,
      outputs: [{ name: 'document-redacted.pdf', bytes: new Uint8Array([1]) }],
    }),
  )
  expect(app.download).not.toHaveBeenCalled()
  expect(app.host.querySelectorAll('.mimir-pdf-redaction-list li')).toHaveLength(1)
})

it('cancels before a same-turn navigation can release a completed host export', async () => {
  const app = await boot()
  await open(app.host)
  await mark(app.host)
  let release!: (value: Awaited<ReturnType<PdfHostLocal>>) => void
  app.hostLocal.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  await click(button(app.host, '导出涂黑副本'))
  await tab(app.host, '开始')
  const request = app.hostLocal.mock.calls[0]![0]
  await act(async () => {
    button(app.host, '下一页').click()
    release({
      version: request.expectedVersion,
      outputs: [{ name: 'document-redacted.pdf', bytes: new Uint8Array([1]) }],
    })
  })
  expect(request.signal!.aborted).toBe(true)
  expect(app.download).not.toHaveBeenCalled()
  expect(URL.createObjectURL).not.toHaveBeenCalled()
})

it('allows entry after saving a page edit and marks the exact newly saved working bytes', async () => {
  const app = await boot()
  await tab(app.host, '页面')
  await click(button(app.host, '向右旋转 90 度'))
  app.hostLocal.mockImplementationOnce(async (request) => {
    const changed = await PDFDocument.load(request.bytes)
    changed.getPage(0).setRotation(degrees(90))
    return { bytes: await changed.save(), version: request.expectedVersion + 1 }
  })
  await click(button(app.host, '保存到库'))
  await settle(
    () =>
      app.save.mock.calls.length === 1 &&
      app.host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')?.disabled === true,
  )
  await tab(app.host, '编辑')
  await open(app.host)
  await mark(app.host)
  await click(button(app.host, '导出涂黑副本'))
  await settle(() => app.download.mock.calls.length === 1)
  const request = app.hostLocal.mock.calls.find(
    ([value]) => value.operation.op === 'redact_copy',
  )![0]
  expect(request.bytes).not.toBe(app.bytes)
  expect((await PDFDocument.load(request.bytes)).getPage(0).getRotation().angle).toBe(90)
  expect(app.save).toHaveBeenCalledTimes(1)
})
