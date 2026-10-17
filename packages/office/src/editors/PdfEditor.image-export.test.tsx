// @vitest-environment happy-dom
import { ConfigProvider } from 'antd'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PDFDocument } from 'pdf-lib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfAgentHandle } from '../agent/pdf-agent.js'
import { applyPdfLocalOperation } from '../../../../apps/server/src/services/pdf-local.js'
const rendering = vi.hoisted(() => ({
  images:
    vi.fn<(request: { bytes: Uint8Array; pageIndex: number; signal?: AbortSignal }) => void>(),
  gate: null as Promise<void> | null,
}))
vi.mock('./pdf-render.js', () => ({
  retainPdfDocument: () => () => {},
  awaitPdfTask: <T,>(task: Promise<T>) => task,
  loadPdfDocument: vi.fn<typeof import('./pdf-render.js').loadPdfDocument>(),
  cancelPdfRender() {},
  retainPdfDocuments() {},
  retainPdfImageExport: () => () => {},
  renderPdfPages: async () => ({ dispose() {} }),
  renderPdfPageImage: async (request: {
    bytes: Uint8Array
    pageIndex: number
    signal?: AbortSignal
  }) => {
    rendering.images(request)
    await rendering.gate
    request.signal?.throwIfAborted()
    const pdf = await PDFDocument.load(request.bytes)
    const box = pdf.getPage(request.pageIndex).getCropBox()
    return { bytes: new Uint8Array([137, 80, 78, 71]), width: box.width, height: box.height }
  },
}))
import { PdfEditor } from './PdfEditor.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const clean: Array<() => void> = []
afterEach(() => {
  clean.splice(0).forEach((f) => f())
  rendering.images.mockReset()
  rendering.gate = null
  vi.restoreAllMocks()
})
async function settle(predicate: () => boolean) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5))
    })
    expect(predicate()).toBe(true)
  })
}
async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 0))
  })
}
function byLabel(host: HTMLElement, name: string) {
  const el = host.querySelector<HTMLElement>(`[aria-label="${name}"]`)
  if (!el) throw new Error(name)
  return el
}
async function mount() {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:page-image')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const pdf = await PDFDocument.create()
  pdf.addPage([400, 600]).drawText('first page')
  pdf.addPage([300, 500]).drawText('second page')
  const field = pdf.getForm().createTextField('preserved')
  field.setText('value')
  field.addToPage(pdf.getPage(0), { x: 20, y: 100, width: 100, height: 20 })
  const original = await pdf.save()
  let handle: PdfAgentHandle | null = null
  const dirty: boolean[] = []
  const save = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  clean.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  const render = async (documentId = 'pdf-images') =>
    act(async () =>
      root.render(
        <ConfigProvider componentSize="small">
          <PdfEditor
            documentId={documentId}
            io={{ load: async () => original, save }}
            hostLocal={async ({ bytes, operation, expectedVersion, assetFile }) => {
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
            onDirtyChange={(d) => dirty.push(d)}
          />
        </ConfigProvider>,
      ),
    )
  await render()
  await settle(() => !!handle)
  return { host, handle: () => handle!, dirty, save, render }
}
async function open(host: HTMLElement) {
  await click(
    host.querySelector('[role="tab"][data-key="view"]') ??
      Array.from(host.querySelectorAll('[role="tab"]')).find((e) => e.textContent === '视图')!,
  )
  await click(byLabel(host, '导出页面图像'))
}
describe('PDF 页面图像 Inspector 与工作副本', () => {
  it('真实documentId换源取消迟到输出；后继导出不被旧请求清空或覆盖', async () => {
    const env = await mount()
    await open(env.host)
    let release!: () => void
    rendering.gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await click(byLabel(env.host, '生成页面图像'))
    await settle(() => rendering.images.mock.calls.length === 1)
    const oldSignal = rendering.images.mock.calls[0]![0].signal!
    await env.render('pdf-image-new-source')
    expect(oldSignal.aborted).toBe(true)
    rendering.gate = null
    await settle(() => !(byLabel(env.host, '生成页面图像') as HTMLButtonElement).disabled)
    await click(byLabel(env.host, '生成页面图像'))
    await settle(() => !!env.host.querySelector('[aria-label="下载 PNG 图像"]'))
    const downloadsBeforeOldResult = vi.mocked(URL.createObjectURL).mock.calls.length
    await act(async () => release())
    expect(vi.mocked(URL.createObjectURL).mock.calls).toHaveLength(downloadsBeforeOldResult)
    expect(env.host.querySelector('[aria-label="下载 PNG 图像"]')).not.toBeNull()
    expect(env.host.querySelector('[aria-label="取消页面图像生成"]')).toBeNull()
    expect(env.save).not.toHaveBeenCalled()
  })
  it('生成期间文档变化或关闭面板，迟到图像均被取消且不创建下载 URL', async () => {
    const env = await mount()
    await open(env.host)
    let release!: () => void
    rendering.gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await click(byLabel(env.host, '生成页面图像'))
    await settle(() => rendering.images.mock.calls.length === 1)
    const first = rendering.images.mock.calls[0]![0]
    await act(async () => {
      expect(
        (
          await env
            .handle()
            .execute('apply_ops', { ops: [{ op: 'rotatePages', pages: [1], dir: 90 }] })
        ).ok,
      ).toBe(true)
    })
    expect(first.signal?.aborted).toBe(true)
    await act(async () => release())
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(env.host.querySelector('[aria-label="下载 PNG 图像"]')).toBeNull()
    rendering.gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await click(byLabel(env.host, '生成页面图像'))
    await settle(() => rendering.images.mock.calls.length === 2)
    const second = rendering.images.mock.calls[1]![0]
    await click(byLabel(env.host, '关闭页面图像导出'))
    expect(second.signal?.aborted).toBe(true)
    await act(async () => release())
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(env.save).not.toHaveBeenCalled()
  })

  it('当前未保存旋转/裁剪进入输出快照，导出不保存、不增dirty且关闭回入口', async () => {
    const env = await mount()
    await act(async () => {
      expect(
        (
          await env.handle().execute('crop_pages', {
            pages: '1',
            left: 0.025,
            right: 0.95,
            top: 0.05,
            bottom: 14 / 15,
          })
        ).ok,
      ).toBe(true)
    })
    // The native local crop is already a working-byte edit; add a pending page rotation.
    await click(
      Array.from(env.host.querySelectorAll('[role="tab"]')).find((e) => e.textContent === '页面')!,
    )
    await click(byLabel(env.host, '向右旋转 90 度'))
    const beforeDirty = [...env.dirty]
    await open(env.host)
    await click(byLabel(env.host, '生成页面图像'))
    await settle(() => !!env.host.querySelector('[aria-label="下载 PNG 图像"]'))
    const snapshot = rendering.images.mock.calls[0]![0] as { bytes: Uint8Array }
    const parsed = await PDFDocument.load(snapshot.bytes)
    expect(parsed.getPage(0).getRotation().angle).toBe(90)
    expect(parsed.getPage(0).getCropBox()).toMatchObject({ width: 370, height: 530 })
    expect(parsed.getForm().getTextField('preserved').getText()).toBe('value')
    expect(env.save).not.toHaveBeenCalled()
    expect(env.dirty).toEqual(beforeDirty)
    const inspector = byLabel(env.host, 'PDF 属性工具')
    await act(async () =>
      inspector.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    )
    expect(env.host.querySelector('[aria-label="页面图像导出面板"]')).toBeNull()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('导出页面图像')
  })
  it('自定义页码可验证，全部页生成 ZIP；源变化和取消不会提供旧下载', async () => {
    const env = await mount()
    await open(env.host)
    pickSelectOption(env.host, '导出页面范围', '指定页码')
    expect((byLabel(env.host, '生成页面图像') as HTMLButtonElement).disabled).toBe(true)
    pickSelectOption(env.host, '导出页面范围', '全部页')
    await click(byLabel(env.host, '生成页面图像'))
    await settle(() => !!env.host.querySelector('[aria-label="下载图像 ZIP"]'))
    expect(rendering.images.mock.calls.map((call) => call[0].pageIndex)).toEqual([0, 1])
    await act(async () => {
      expect(
        (
          await env
            .handle()
            .execute('apply_ops', { ops: [{ op: 'rotatePages', pages: [1], dir: 90 }] })
        ).ok,
      ).toBe(true)
    })
    expect(env.host.querySelector('[aria-label="下载图像 ZIP"]')).toBeNull()
    let release!: () => void
    rendering.gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await click(byLabel(env.host, '生成页面图像'))
    await settle(() => !!env.host.querySelector('[aria-label="取消页面图像生成"]'))
    await click(byLabel(env.host, '取消页面图像生成'))
    await act(async () => {
      release()
    })
    await settle(() => !env.host.querySelector('[aria-label="取消页面图像生成"]'))
    expect(env.host.querySelector('[aria-label="下载图像 ZIP"]')).toBeNull()
    expect(env.host.querySelector('[aria-label="下载 PNG 图像"]')).toBeNull()
  })
})
