// @vitest-environment happy-dom
import { ConfigProvider } from 'antd'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PDFDocument } from 'pdf-lib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfLocalInfo } from '@mimir/shared'
import type { PdfAgentHandle } from '../agent/pdf-agent.js'
import { applyPdfLocalOperation } from '../../../../apps/server/src/services/pdf-local.js'
const renderGate = vi.hoisted(() => ({ promise: null as Promise<void> | null }))
vi.mock('./pdf-render.js', () => ({
  cancelPdfRender() {},
  retainPdfDocuments() {},
  renderPdfPages: async () => {
    await renderGate.promise
    return { dispose() {} }
  },
}))
import { PdfEditor } from './PdfEditor.js'
import { pickMenuItem, pickSelectOption } from '../shell/antd-test-dom.js'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const clean: Array<() => void> = []
afterEach(() => {
  renderGate.promise = null
  clean.splice(0).forEach((f) => f())
})
async function settle(predicate: () => boolean) {
  const end = Date.now() + 5000
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
}: {
  form?: boolean
  offsetCrop?: boolean
  save?: () => Promise<void>
  beforeWrite?: (signal?: AbortSignal) => Promise<void>
} = {}) {
  const pdf = await PDFDocument.create()
  pdf.addPage([400, 600]).drawText('Working document')
  if (offsetCrop) pdf.getPage(0).setCropBox(15, 25, 350, 550)
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
            if (operation.op === 'add_drawing' || operation.op === 'update_drawing')
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
async function openCanvas(host: HTMLElement) {
  await click(
    Array.from(host.querySelectorAll('button[role="tab"]')).find((b) => b.textContent === '绘制')!,
  )
  await click(button(host, '打开画布绘图'))
  await settle(() => !!host.querySelector('svg[aria-label="PDF 画布绘图"]'))
  return canvas(host)
}
function canvas(host: HTMLElement) {
  const node = host.querySelector<SVGSVGElement>('svg[aria-label="PDF 画布绘图"]')!
  expect(node).not.toBeNull()
  const [, , width, height] = node.getAttribute('viewBox')!.split(' ').map(Number)
  Object.defineProperty(node, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 20, top: 30, width, height, right: 20 + width!, bottom: 30 + height! }),
  })
  return node
}
async function pointer(node: Element, type: string, x: number, y: number, id = 1) {
  await act(async () =>
    node.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        clientX: x + 20,
        clientY: y + 30,
        button: 0,
        pointerId: id,
        isPrimary: true,
      }),
    ),
  )
}
function textButton(host: HTMLElement, text: string) {
  return Array.from(host.querySelectorAll('button')).find((b) => b.textContent === text)!
}
async function ink(host: HTMLElement) {
  pickSelectOption(host, '画布绘图工具', '自由笔')
  const node = canvas(host)
  await pointer(node, 'pointerdown', 30, 40)
  await pointer(node, 'pointermove', 90, 100)
  await pointer(node, 'pointerup', 130, 80)
}
describe('PDF actual Editor canvas gestures and native history', () => {
  it('keeps precise numeric creation separate and continues dragging a draft at its preview location', async () => {
    const app = await mount(),
      h = app.getHandle()
    await act(async () => {
      expect(
        (
          await h.execute('add_drawing', {
            drawing: {
              kind: 'rect',
              page: 1,
              x: 30,
              y: 40,
              width: 40,
              height: 30,
              color: '#2563EB',
              thickness: 2,
              opacity: 1,
            },
          })
        ).ok,
      ).toBe(true)
    })
    await openCanvas(app.host)
    const precise = app.host.querySelector<HTMLElement>('.ant-collapse-header')!
    expect(precise.textContent).toBe('精确数值绘图')
    expect(precise.getAttribute('aria-expanded')).toBe('false')
    expect(app.host.querySelector('[aria-label="绘图形状"]')).toBeNull()
    const node = canvas(app.host)
    let target = node.querySelector('[data-drawing-id]')!
    await pointer(target, 'pointerdown', 40, 50)
    await pointer(node, 'pointermove', 140, 150)
    await pointer(node, 'pointerup', 140, 150)
    target = node.querySelector('[data-drawing-id]')!
    expect(target.querySelector('rect')!.getAttribute('x')).toBe('130')
    expect(target.querySelector('rect')!.getAttribute('y')).toBe('140')
    // A click on the new location must retain the unapplied adjustment.
    await pointer(target, 'pointerdown', 140, 150)
    await pointer(node, 'pointerup', 140, 150)
    expect(textButton(app.host, '应用画布绘图').disabled).toBe(false)
    await pointer(target, 'pointerdown', 140, 150)
    await pointer(node, 'pointermove', 160, 170)
    await pointer(node, 'pointerup', 160, 170)
    const version = h.getVersion()
    await click(textButton(app.host, '应用画布绘图'))
    await settle(() => h.getVersion() === version + 1)
    await act(async () => {
      const read = await h.execute('get_document_properties', {})
      expect((read.data as PdfLocalInfo).drawings[0]).toMatchObject({
        x: 150,
        y: 160,
        width: 40,
        height: 30,
      })
    })
    await click(precise)
    expect(precise.getAttribute('aria-expanded')).toBe('true')
    expect(app.host.textContent).toContain('这里的参数不会修改画布草稿')
    expect(app.host.querySelector('[aria-label="绘图形状"]')).not.toBeNull()
  })
  it('draws on the materialized rotated/cropped paper and keeps two saves and undo/redo native', async () => {
    const app = await mount({ form: true }),
      h = app.getHandle()
    await act(async () => {
      await h.execute('apply_ops', { ops: [{ op: 'rotatePages', pages: [1], dir: 90 }] })
    })
    await click(
      Array.from(app.host.querySelectorAll('button[role="tab"]')).find(
        (b) => b.textContent === '页面',
      )!,
    )
    pickMenuItem(app.host, '页面与版式操作', '四边各裁 20 pt')
    const version = h.getVersion()
    await openCanvas(app.host)
    expect(canvas(app.host).getAttribute('viewBox')).toBe('0 0 560 360')
    await ink(app.host)
    expect(h.getVersion()).toBe(version)
    expect(app.saves).toHaveLength(0)
    expect(textButton(app.host, '应用画布绘图').disabled).toBe(false)
    await click(textButton(app.host, '应用画布绘图'))
    await settle(() => h.getVersion() === version + 1)
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 1)
    const saved = await PDFDocument.load(app.saves[0]!)
    expect(saved.getPage(0).getRotation().angle).toBe(90)
    expect(saved.getPage(0).getCropBox().width).toBe(360)
    expect(saved.getForm().getTextField('name').getText()).toBe('Preserved value')
    const first = (await applyPdfLocalOperation(app.saves[0]!, { op: 'read' })).info!.drawings[0]!
    expect(first.points).toEqual([
      [30, 40],
      [90, 100],
      [130, 80],
    ])
    await settle(() => !!app.host.querySelector('svg[aria-label="PDF 画布绘图"]'))
    const moveVersion = h.getVersion()
    pickSelectOption(app.host, '画布绘图工具', '选择与调整')
    let node = canvas(app.host),
      target = node.querySelector(`[data-drawing-id="${first.id}"]`)!
    await pointer(target, 'pointerdown', 60, 60)
    await pointer(node, 'pointermove', 80, 70)
    await pointer(node, 'pointerup', 80, 70)
    await click(textButton(app.host, '应用画布绘图'))
    await settle(() => h.getVersion() === moveVersion + 1)
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 2)
    const moved = (await applyPdfLocalOperation(app.saves[1]!, { op: 'read' })).info!.drawings[0]!
    expect(moved.points).toEqual([
      [50, 50],
      [110, 110],
      [150, 90],
    ])
    await click(button(app.host, '撤销'))
    let read = await h.execute('get_document_properties', {})
    expect((read.data as PdfLocalInfo).drawings[0]).toEqual(first)
    await click(button(app.host, '重做'))
    read = await h.execute('get_document_properties', {})
    expect((read.data as PdfLocalInfo).drawings[0]).toEqual(moved)
    await settle(() => !!app.host.querySelector('svg[aria-label="PDF 画布绘图"]'))
    node = canvas(app.host)
    target = node.querySelector(`[data-drawing-id="${first.id}"]`)!
    await pointer(target, 'pointerdown', 60, 60)
    await pointer(node, 'pointerup', 60, 60)
    const handle = node.querySelector('[data-drawing-handle="se"]')!
    await pointer(handle, 'pointerdown', 150, 110)
    await pointer(node, 'pointermove', 250, 170)
    await pointer(node, 'pointerup', 250, 170)
    await click(textButton(app.host, '应用画布绘图'))
    await settle(() => h.getVersion() > moveVersion + 3)
    read = await h.execute('get_document_properties', {})
    expect((read.data as PdfLocalInfo).drawings[0]!.points).toEqual([
      [50, 50],
      [170, 170],
      [250, 130],
    ])
  })
  it.each([0, 90, 180, 270])(
    'uses actual pending A5/CropBox coordinates at rotation %s',
    async (rotation) => {
      const app = await mount({ offsetCrop: true }),
        h = app.getHandle()
      if (rotation)
        await act(async () => {
          await h.execute('apply_ops', {
            ops: [{ op: 'rotatePages', pages: [1], dir: rotation === 270 ? -90 : rotation }],
          })
        })
      await click(
        Array.from(app.host.querySelectorAll('button[role="tab"]')).find(
          (b) => b.textContent === '页面',
        )!,
      )
      pickMenuItem(app.host, '页面与版式操作', '四边各裁 10 pt')
      await click(button(app.host, '页面与版式操作'))
      pickSelectOption(app.host, '这一页的纸型（会按比例缩放内容）', 'A5（420 × 595 pt）')
      // Dismiss the still-open page menu before selecting the drawing tab.
      await click(button(app.host, '页面与版式操作'))
      const version = h.getVersion()
      await openCanvas(app.host)
      const size = rotation === 90 || rotation === 270 ? [595.28, 419.53] : [419.53, 595.28]
      expect(canvas(app.host).getAttribute('viewBox')).toBe(`0 0 ${size[0]} ${size[1]}`)
      await ink(app.host)
      expect(h.getVersion()).toBe(version)
      await click(textButton(app.host, '应用画布绘图'))
      await settle(() => h.getVersion() === version + 1)
      await click(button(app.host, '保存到库'))
      await settle(() => app.saves.length === 1)
      const d = (await applyPdfLocalOperation(app.saves[0]!, { op: 'read' })).info!.drawings[0]!
      for (const [i, point] of [
        [30, 40],
        [90, 100],
        [130, 80],
      ].entries()) {
        expect(d.points![i]![0]).toBeCloseTo(point[0]!)
        expect(d.points![i]![1]).toBeCloseTo(point[1]!)
      }
      const saved = await PDFDocument.load(app.saves[0]!)
      expect(saved.getPage(0).getRotation().angle).toBe(rotation)
      expect(saved.getPage(0).getCropBox().width).toBeCloseTo(419.53)
      expect(saved.getPage(0).getCropBox().height).toBeCloseTo(595.28)
    },
  )

  it('cancels pointercancel, outside pointerup, Escape, and page changes without writing or history', async () => {
    const app = await mount(),
      h = app.getHandle()
    await openCanvas(app.host)
    pickSelectOption(app.host, '画布绘图工具', '矩形')
    const version = h.getVersion()
    for (const cancel of ['pointercancel', 'outside', 'escape', 'blur']) {
      const node = canvas(app.host)
      await pointer(node, 'pointerdown', 30, 40)
      await pointer(node, 'pointermove', 130, 100)
      if (cancel === 'pointercancel') await pointer(node, 'pointercancel', 130, 100)
      if (cancel === 'outside')
        await act(async () => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 })))
      if (cancel === 'escape')
        await act(async () =>
          node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
        )
      if (cancel === 'blur') await act(async () => window.dispatchEvent(new Event('blur')))
      expect(textButton(app.host, '应用画布绘图').disabled).toBe(true)
      expect(h.getVersion()).toBe(version)
    }
    await ink(app.host)
    await click(button(app.host, '第 2 页'))
    await settle(() => !!app.host.querySelector('svg[aria-label="PDF 画布绘图"]'))
    expect(textButton(app.host, '应用画布绘图').disabled).toBe(true)
    expect(h.getVersion()).toBe(version)
    expect(app.saves).toHaveLength(0)
    expect(button(app.host, '保存到库').disabled).toBe(true)
  })
  it('waits for the actual materialized page render before accepting gesture points', async () => {
    const app = await mount()
    await click(
      Array.from(app.host.querySelectorAll('button[role="tab"]')).find(
        (b) => b.textContent === '页面',
      )!,
    )
    pickMenuItem(app.host, '页面与版式操作', '四边各裁 20 pt')
    let release: (() => void) | undefined
    renderGate.promise = new Promise<void>((r) => {
      release = r
    })
    await click(
      Array.from(app.host.querySelectorAll('button[role="tab"]')).find(
        (b) => b.textContent === '绘制',
      )!,
    )
    await click(button(app.host, '打开画布绘图'))
    await settle(() => !!app.host.querySelector('input[aria-label="画布绘图工具"]'))
    expect(app.host.querySelector('svg[aria-label="PDF 画布绘图"]')).toBeNull()
    await act(async () => release!())
    await settle(() => !!app.host.querySelector('svg[aria-label="PDF 画布绘图"]'))
    expect(canvas(app.host).getAttribute('viewBox')).toBe('0 0 360 560')
    expect(button(app.host, '保存到库').disabled).toBe(false)
  })
  it('persists every shape gesture in a single native drawing transaction', async () => {
    const app = await mount(),
      h = app.getHandle()
    await openCanvas(app.host)
    const tools = [
      ['矩形', 'rect'],
      ['椭圆', 'ellipse'],
      ['直线', 'line'],
      ['箭头', 'arrow'],
      ['勾选', 'check'],
      ['叉号', 'cross'],
    ] as const
    for (const [label, kind] of tools) {
      pickSelectOption(app.host, '画布绘图工具', label)
      const node = canvas(app.host),
        v = h.getVersion()
      await pointer(node, 'pointerdown', 160, 90)
      await pointer(node, 'pointermove', 40, kind === 'line' || kind === 'arrow' ? 90 : 30)
      await pointer(node, 'pointerup', 40, kind === 'line' || kind === 'arrow' ? 90 : 30)
      expect(h.getVersion()).toBe(v)
      await click(textButton(app.host, '应用画布绘图'))
      await settle(() => h.getVersion() === v + 1)
      await settle(() => !!app.host.querySelector('svg[aria-label="PDF 画布绘图"]'))
    }
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 1)
    const drawings = (await applyPdfLocalOperation(app.saves[0]!, { op: 'read' })).info!.drawings
    expect(drawings.map((d) => d.kind)).toEqual(tools.map((t) => t[1]))
    expect(drawings.find((d) => d.kind === 'arrow')!.arrowHeadLength).toBe(12)
    expect(drawings.every((d) => d.x === 40 && d.width === 120)).toBe(true)
  })
  it('completes a delayed accepted write without aborting itself when busy changes', async () => {
    let release: (() => void) | undefined, signal: AbortSignal | undefined
    const app = await mount({
        beforeWrite: async (s) => {
          signal = s
          await new Promise<void>((r) => {
            release = r
          })
        },
      }),
      h = app.getHandle()
    await openCanvas(app.host)
    await ink(app.host)
    const version = h.getVersion()
    await click(textButton(app.host, '应用画布绘图'))
    await settle(() => !!release)
    expect(signal?.aborted).toBe(false)
    await act(async () => release!())
    await settle(() => h.getVersion() === version + 1)
    expect(button(app.host, '保存到库').disabled).toBe(false)
    await click(button(app.host, '保存到库'))
    await settle(() => app.saves.length === 1)
    expect(
      (await applyPdfLocalOperation(app.saves[0]!, { op: 'read' })).info!.drawings,
    ).toHaveLength(1)
  })
  it('keeps an accepted request alive across busy, and aborts late bytes on page change', async () => {
    let release: (() => void) | undefined, signal: AbortSignal | undefined
    const app = await mount({
        beforeWrite: async (s) => {
          signal = s
          await new Promise<void>((r) => {
            release = r
          })
        },
      }),
      h = app.getHandle()
    await openCanvas(app.host)
    await ink(app.host)
    const version = h.getVersion()
    await click(textButton(app.host, '应用画布绘图'))
    await settle(() => !!release)
    expect(signal?.aborted).toBe(false)
    // Navigation remains available during a content operation; the gesture binds to its page.
    await click(button(app.host, '第 2 页'))
    expect(signal?.aborted).toBe(true)
    await act(async () => release!())
    await settle(() => !app.host.querySelector('.ant-btn-loading'))
    expect(h.getVersion()).toBe(version)
    expect(button(app.host, '保存到库').disabled).toBe(true)
    expect(app.saves).toHaveLength(0)
  })
})
