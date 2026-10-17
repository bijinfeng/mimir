// @vitest-environment happy-dom
import { ConfigProvider } from 'antd'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PDFDocument, PDFName, PDFNumber } from 'pdf-lib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfAgentHandle } from '../agent/pdf-agent.js'
import { applyPdfLocalOperation } from '../../../../apps/server/src/services/pdf-local.js'
const renderGate = vi.hoisted(() => ({ promise: null as Promise<void> | null }))
vi.mock('./pdf-render.js', () => ({
  retainPdfDocument: () => () => {},
  awaitPdfTask: <T,>(task: Promise<T>) => task,
  loadPdfDocument: vi.fn<typeof import('./pdf-render.js').loadPdfDocument>(),
  cancelPdfRender() {},
  retainPdfDocuments() {},
  renderPdfPages: async () => {
    await renderGate.promise
    return { dispose() {} }
  },
}))
import { PdfEditor } from './PdfEditor.js'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const clean: Array<() => void> = []
afterEach(() => {
  renderGate.promise = null
  vi.restoreAllMocks()
  clean.splice(0).forEach((f) => f())
})
async function settle(predicate: () => boolean) {
  const end = Date.now() + 10000
  while (!predicate() && Date.now() < end)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
  expect(predicate()).toBe(true)
}
async function click(node: Element) {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 0))
  })
}
function button(host: HTMLElement, name: string) {
  const b = host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)
  if (!b) throw new Error(name)
  return b
}
async function mount({
  form = false,
  save,
  beforeWrite,
  offsetCrop = false,
  unusualGeometry,
}: {
  form?: boolean
  offsetCrop?: boolean
  unusualGeometry?: 'crop' | 'unit'
  save?: () => Promise<void>
  beforeWrite?: (signal?: AbortSignal) => Promise<void>
} = {}) {
  const pdf = await PDFDocument.create()
  pdf.addPage([400, 600]).drawText('Working document')
  if (offsetCrop) pdf.getPage(0).setCropBox(15, 25, 350, 550)
  if (unusualGeometry === 'crop') pdf.getPage(0).setCropBox(-20, -30, 440, 660)
  if (unusualGeometry === 'unit') pdf.getPage(0).node.set(PDFName.of('UserUnit'), PDFNumber.of(2))
  pdf.addPage([400, 600])
  if (form) {
    const field = pdf.getForm().createTextField('name')
    field.setText('Preserved value')
    field.addToPage(pdf.getPage(0), { x: 40, y: 400, width: 180, height: 24 })
  }
  const original = await pdf.save()
  let handle: PdfAgentHandle | null = null
  const saves: Uint8Array[] = []
  const dirty: boolean[] = []
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  clean.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await act(async () =>
    root.render(
      <ConfigProvider componentSize="small">
        <PdfEditor
          documentId="pdf-local"
          io={{
            load: async () => original,
            save: async (bytes) => {
              await save?.()
              saves.push(bytes)
            },
          }}
          hostLocal={async ({ bytes, operation, expectedVersion, assetFile, signal }) => {
            if (
              operation.op === 'add_visual_signature' ||
              operation.op === 'transform_visual_signature'
            )
              await beforeWrite?.(signal)
            const result = await applyPdfLocalOperation(
              bytes,
              operation,
              assetFile ? new Uint8Array(await assetFile.arrayBuffer()) : undefined,
            )
            return { ...result, version: expectedVersion + (result.bytes ? 1 : 0) }
          }}
          onAgentHandleChange={(h) => {
            handle = h
          }}
          onDirtyChange={(v) => dirty.push(v)}
        />
      </ConfigProvider>,
    ),
  )
  await settle(() => handle !== null)
  return { host, getHandle: () => handle!, saves, dirty }
}
function textButton(host: HTMLElement, text: string) {
  const b = Array.from(host.querySelectorAll('button')).find((item) => item.textContent === text)
  if (!b) throw new Error(text)
  return b
}
function setGeometry(node: Element, width = 560, height = 280) {
  Object.defineProperty(node, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, top: 0, width, height, right: width, bottom: height }),
  })
}
async function pointer(node: Element, type: string, x: number, y: number, id = 1) {
  await act(async () => {
    node.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        clientX: x,
        clientY: y,
        button: 0,
        pointerId: id,
        isPrimary: true,
      }),
    )
  })
}
async function writeSignature(host: HTMLElement, expectReady = true) {
  const node = host.querySelector('canvas[aria-label="手写签名区域"]')!
  setGeometry(node)
  for (const [x, y] of [
    [30, 40],
    [120, 150],
  ]) {
    await pointer(node, 'pointerdown', x!, y!)
    await pointer(node, 'pointermove', x! + 70, y! + 20)
    await pointer(node, 'pointerup', x! + 70, y! + 20)
  }
  if (expectReady) await settle(() => !textButton(host, '准备放置').hasAttribute('disabled'))
}
async function prepare(host: HTMLElement, center = true) {
  await writeSignature(host)
  await click(textButton(host, '准备放置'))
  await settle(() => !!host.querySelector('[aria-label="签名位置预览"]'))
  expect(host.querySelector('.mimir-pdf-inspector')).toBeNull()
  if (center) await click(textButton(host, '放在页面中央'))
  return host.querySelector<SVGSVGElement>('[aria-label="签名位置预览"]')!
}
async function readSaved(bytes: Uint8Array) {
  return (await applyPdfLocalOperation(bytes, { op: 'read' })).info!.signatures!
}
describe('PDF visual signatures actual Editor', () => {
  it.each(['crop', 'unit'] as const)(
    'blocks unsupported %s geometry in the panel and native manual path without history',
    async (unusualGeometry) => {
      const app = await mount({ unusualGeometry }),
        h = app.getHandle(),
        version = h.getVersion()
      await click(
        Array.from(app.host.querySelectorAll('button[role="tab"]')).find(
          (b) => b.textContent === '绘制',
        )!,
      )
      await click(button(app.host, '签名与印章'))
      await settle(() =>
        app.host.textContent!.includes(
          unusualGeometry === 'crop' ? '裁剪框超出' : '非标准 UserUnit',
        ),
      )
      await writeSignature(app.host, false)
      expect(textButton(app.host, '准备放置').hasAttribute('disabled')).toBe(true)
      let result!: Awaited<ReturnType<PdfAgentHandle['execute']>>
      await act(async () => {
        result = await h.execute(
          'add_visual_signature',
          {
            page: 1,
            source: {
              kind: 'ink',
              width: 100,
              height: 50,
              thickness: 3,
              color: '#000000',
              strokes: [
                [
                  [5, 5],
                  [90, 40],
                ],
              ],
            },
            rect: { x: 20, y: 30, width: 100, height: 50 },
          },
          { manual: true },
        )
      })
      expect(result.ok).toBe(false)
      expect(result.error).toContain(unusualGeometry === 'crop' ? '裁剪框' : 'UserUnit')
      expect(h.getVersion()).toBe(version)
      expect(app.dirty).not.toContain(true)
      expect(button(app.host, '撤销').disabled).toBe(true)
    },
  )
  it('cannot smuggle a visual signature through another public local tool', async () => {
    const app = await mount(),
      h = app.getHandle(),
      version = h.getVersion()
    let result!: Awaited<ReturnType<PdfAgentHandle['execute']>>
    await act(async () => {
      result = await h.execute('set_metadata', {
        op: 'add_visual_signature',
        page: 1,
        source: {
          kind: 'ink',
          width: 100,
          height: 50,
          thickness: 3,
          color: '#000000',
          strokes: [
            [
              [5, 5],
              [90, 40],
            ],
          ],
        },
        rect: { x: 20, y: 30, width: 100, height: 50 },
      })
    })
    expect(result.ok).toBe(false)
    expect(h.getVersion()).toBe(version)
    expect(app.dirty).not.toContain(true)
    expect(app.saves).toEqual([])
  })
  it('discards an unapplied placement when saving starts and does not revive it after saving', async () => {
    let finish!: () => void
    const app = await mount({
        save: () =>
          new Promise<void>((resolve) => {
            finish = resolve
          }),
      }),
      h = app.getHandle()
    await act(async () => {
      expect(
        (await h.execute('apply_ops', { ops: [{ op: 'rotatePages', pages: [1], dir: 90 }] })).ok,
      ).toBe(true)
    })
    await click(
      Array.from(app.host.querySelectorAll('button[role="tab"]')).find(
        (b) => b.textContent === '绘制',
      )!,
    )
    await click(button(app.host, '签名与印章'))
    await settle(() => !!app.host.querySelector('canvas[aria-label="手写签名区域"]'))
    await prepare(app.host)
    const version = h.getVersion()
    await click(button(app.host, '保存到库'))
    await settle(() => typeof finish === 'function')
    expect(app.host.querySelector('[aria-label="签名位置预览"]')).toBeNull()
    await act(async () => {
      finish()
    })
    await settle(() => app.saves.length === 1)
    expect(app.host.querySelector('[aria-label="签名位置预览"]')).toBeNull()
    // Saving materializes the pending page layout and invalidates its version once.
    expect(h.getVersion()).toBe(version + 1)
    expect(await readSaved(app.saves[0]!)).toEqual([])
  })
  it('prepares without history; drags twice and aspect-resizes; applies once and saves/undo/redo native bytes', async () => {
    const scroll = vi.fn<(options?: ScrollIntoViewOptions) => void>()
    const previous = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'scrollIntoView')
    Object.defineProperty(SVGElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scroll,
    })
    clean.push(() => {
      if (previous) Object.defineProperty(SVGElement.prototype, 'scrollIntoView', previous)
      else delete (SVGElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
    })
    const app = await mount({ form: true }),
      h = app.getHandle(),
      version = h.getVersion()
    const refused = await h.execute('add_visual_signature', {})
    expect(refused.ok).toBe(false)
    expect(refused.error).toContain('手动')
    expect(h.getVersion()).toBe(version)
    await click(
      Array.from(app.host.querySelectorAll('button[role="tab"]')).find(
        (b) => b.textContent === '绘制',
      )!,
    )
    await click(button(app.host, '签名与印章'))
    await settle(() => !!app.host.querySelector('canvas[aria-label="手写签名区域"]'))
    await new Promise((r) => setTimeout(r, 50))
    let node = await prepare(app.host, false)
    setGeometry(node, 400, 600)
    await pointer(node, 'pointerdown', 100, 150)
    expect(scroll).not.toHaveBeenCalled()
    await click(textButton(app.host, '取消'))
    node = await prepare(app.host)
    expect(scroll).toHaveBeenCalledOnce()
    expect(scroll.mock.contexts[0]).toBe(node.querySelector('.mimir-pdf-signature-canvas__box'))
    expect(scroll).toHaveBeenCalledWith({ block: 'center', inline: 'center' })
    const [, , w, height] = node.getAttribute('viewBox')!.split(' ').map(Number)
    setGeometry(node, w, height)
    const box = () => node.querySelector('.mimir-pdf-signature-canvas__box')!
    const before = Number(box().getAttribute('x'))
    await pointer(node, 'pointerdown', before + 5, Number(box().getAttribute('y')) + 5)
    await pointer(node, 'pointermove', before + 25, Number(box().getAttribute('y')) + 15)
    await pointer(node, 'pointerup', before + 25, 100)
    const after = Number(box().getAttribute('x'))
    expect(after).toBeCloseTo(before + 20)
    await pointer(node, 'pointerdown', after + 5, Number(box().getAttribute('y')) + 5)
    await pointer(node, 'pointermove', after + 15, Number(box().getAttribute('y')) + 5)
    await pointer(node, 'pointerup', after + 15, 100)
    expect(Number(box().getAttribute('x'))).toBeCloseTo(before + 30)
    const handle = node.querySelector('.mimir-pdf-signature-canvas__resize')!,
      width = Number(box().getAttribute('width')),
      oldHeight = Number(box().getAttribute('height'))
    await pointer(handle, 'pointerdown', 10, 10)
    await pointer(node, 'pointermove', 30, 30)
    await pointer(node, 'pointerup', 30, 30)
    expect(Number(box().getAttribute('width')) / Number(box().getAttribute('height'))).toBeCloseTo(
      width / oldHeight,
    )
    expect(scroll).toHaveBeenCalledOnce()
    expect(h.getVersion()).toBe(version)
    await click(textButton(app.host, '应用签名'))
    await settle(() => h.getVersion() === version + 1)
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 1)
    expect(await readSaved(app.saves[0]!)).toHaveLength(1)
    expect((await readSaved(app.saves[0]!))[0]!.strokes).toHaveLength(2)
    const pdf = await PDFDocument.load(app.saves[0]!)
    expect(pdf.getForm().getTextField('name').getText()).toBe('Preserved value')
    await click(button(app.host, '撤销'))
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 2)
    expect(await readSaved(app.saves[1]!)).toEqual([])
    await click(button(app.host, '重做'))
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 3)
    expect(await readSaved(app.saves[2]!)).toEqual(await readSaved(app.saves[0]!))
  })
  it('cancel and page change clear placement with no write/version; late host result after close cannot publish', async () => {
    let finish!: () => void
    let started = false
    const app = await mount({
        beforeWrite: async () => {
          started = true
          await new Promise<void>((r) => {
            finish = r
          })
        },
      }),
      h = app.getHandle(),
      version = h.getVersion()
    await click(
      Array.from(app.host.querySelectorAll('button[role="tab"]')).find(
        (b) => b.textContent === '绘制',
      )!,
    )
    await click(button(app.host, '签名与印章'))
    await settle(() => !!app.host.querySelector('canvas[aria-label="手写签名区域"]'))
    await new Promise((r) => setTimeout(r, 50))
    let node = await prepare(app.host)
    await act(async () => {
      node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(h.getVersion()).toBe(version)
    expect(app.host.querySelector('[aria-label="签名位置预览"]')).toBeNull()
    node = await prepare(app.host)
    await act(async () => {
      await h.execute('goto_page', { page: 2 })
    })
    await settle(() => !app.host.querySelector('[aria-label="签名位置预览"]'))
    expect(h.getVersion()).toBe(version)
    await act(async () => {
      await h.execute('goto_page', { page: 1 })
    })
    await new Promise((r) => setTimeout(r, 50))
    await prepare(app.host)
    await click(textButton(app.host, '应用签名'))
    await settle(() => started)
    // Escape closes the closest placement and aborts its in-flight native host.
    await act(async () => {
      app.host
        .querySelector('[aria-label="签名位置预览"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    await act(async () => {
      finish()
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(h.getVersion()).toBe(version)
    expect(app.saves).toEqual([])
  })
})

it('closes the collapsed signature group before opening Inspector and restores Escape focus', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.classList.contains('mimir-compact-toolbar__commands'))
      return DOMRect.fromRect({ width: 100, height: 56 })
    if (this.dataset.sectionKey)
      return DOMRect.fromRect({ width: this.hasAttribute('data-collapsed') ? 72 : 150, height: 56 })
    return DOMRect.fromRect({ width: 100, height: 32 })
  })
  const app = await mount()
  await click(
    Array.from(app.host.querySelectorAll('button[role="tab"]')).find(
      (b) => b.textContent === '绘制',
    )!,
  )
  await click(button(app.host, '签名'))
  await settle(() => !!app.host.querySelector('[role="menu"]'))
  await click(button(app.host, '签名与印章'))
  await settle(() => !!app.host.querySelector('.mimir-pdf-inspector'))
  expect(app.host.querySelector('[role="menu"]')).toBeNull()
  const panel = app.host.querySelector('.mimir-pdf-inspector')!
  await act(async () => {
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  expect(app.host.querySelector('.mimir-pdf-inspector')).toBeNull()
  expect(document.activeElement).toBe(button(app.host, '签名'))
  vi.restoreAllMocks()
})
