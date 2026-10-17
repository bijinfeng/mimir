// @vitest-environment happy-dom
import { ConfigProvider } from 'antd'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PDFDocument } from 'pdf-lib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfAgentHandle } from '../agent/pdf-agent.js'
import type { PdfOcrPage } from './pdf-ocr.js'

const work = vi.hoisted(() => ({
  resolve: null as null | ((value: PdfOcrPage) => void),
  source: null as null | Uint8Array,
  signal: null as null | AbortSignal,
}))
vi.mock('./pdf-render.js', async () => ({
  retainPdfDocument: () => () => {},
  awaitPdfTask: <T,>(task: Promise<T>) => task,
  cancelPdfRender() {},
  retainPdfDocuments() {},
  renderPdfPages: async () => ({ dispose() {} }),
  loadPdfDocument: async (bytes: Uint8Array) =>
    (await import('pdfjs-dist/legacy/build/pdf.mjs')).getDocument({ data: bytes.slice() }).promise,
}))
vi.mock('./pdf-ocr.js', async (actual) => ({
  ...(await actual<typeof import('./pdf-ocr.js')>()),
  recognizePdfOcrPage: async (
    source: { bytes: Uint8Array },
    _doc: unknown,
    options: { signal: AbortSignal },
  ) => {
    work.source = source.bytes
    work.signal = options.signal
    return new Promise<PdfOcrPage>((resolve) => {
      work.resolve = resolve
    })
  },
}))
import { PdfEditor } from './PdfEditor.js'
let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  work.resolve = null
  work.source = null
  work.signal = null
})
async function settle(done: () => boolean) {
  const end = Date.now() + 3000
  while (!done() && Date.now() < end)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  expect(done()).toBe(true)
}
function named(host: HTMLElement, label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) =>
      item.getAttribute('aria-label') === label || item.textContent?.replaceAll(' ', '') === label,
  )
  if (!button) throw new Error(`Missing button ${label}`)
  return button
}
async function click(button: HTMLElement) {
  await act(async () => {
    button.click()
  })
}
async function setup(pageCount = 1) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const pdf = await PDFDocument.create()
  for (let page = 0; page < pageCount; page++) pdf.addPage([400, 600])
  const bytes = await pdf.save()
  const saved = vi.fn<() => Promise<void>>(),
    dirty = vi.fn<(value: boolean) => void>()
  let handle: PdfAgentHandle | null = null
  const host = document.createElement('div')
  host.style.width = '420px'
  document.body.append(host)
  const root = createRoot(host)
  cleanup = () => {
    act(() => root.unmount())
    host.remove()
  }
  await act(async () => {
    root.render(
      <ConfigProvider componentSize="small">
        <PdfEditor
          hostApply={async () => {
            throw new Error('unexpected native write')
          }}
          documentId="ocr"
          io={{ load: async () => bytes, save: saved }}
          onDirtyChange={dirty}
          onAgentHandleChange={(value) => {
            handle = value
          }}
        />
      </ConfigProvider>,
    )
  })
  await settle(() => !!handle)
  await click(
    [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(
      (item) => item.textContent === '视图',
    )!,
  )
  await click(named(host, '识别扫描文字'))
  return { host, bytes, saved, dirty, handle: handle! }
}
function finish() {
  work.resolve!({
    bytes: work.source!,
    sourceIndex: 0,
    text: '中文 OCR\n',
    confidence: 95,
    provenance: 'local-ocr',
    tokens: [
      {
        text: '中文',
        start: 0,
        end: 2,
        confidence: 95,
        corners: [
          [40, 560],
          [80, 560],
          [80, 540],
          [40, 540],
        ],
      },
      {
        text: 'OCR',
        start: 3,
        end: 6,
        confidence: 95,
        corners: [
          [90, 560],
          [130, 560],
          [130, 540],
          [90, 540],
        ],
      },
    ],
  })
}
describe('PDF temporary OCR integration', () => {
  it('shows the fixed action, reads OCR only for copy/search, and leaves version/history/save clean', async () => {
    const { host, bytes, saved, dirty, handle } = await setup(),
      version = handle.getVersion(),
      original = bytes.slice()
    expect(named(host, '开始本地识别').closest('footer')).not.toBe(null)
    await click(named(host, '开始本地识别'))
    await settle(() => !!work.resolve)
    expect(named(host, '停止识别')).toBeTruthy()
    await act(async () => {
      finish()
    })
    await settle(() => !!host.querySelector('.mimir-pdf-ocr-preview'))
    expect(host.querySelector('.mimir-pdf-ocr-preview')?.textContent).toBe('中文 OCR\n')
    expect(handle.getVersion()).toBe(version)
    expect(saved).not.toHaveBeenCalled()
    expect(dirty).not.toHaveBeenCalledWith(true)
    expect(named(host, '保存到库').disabled).toBe(true)
    expect(named(host, '撤销').disabled).toBe(true)
    await click(named(host, '在页面上选字'))
    await settle(() => !!host.querySelector('.mimir-pdf-ocr-overlay'))
    expect(host.querySelectorAll('.mimir-pdf-ocr-overlay text')).toHaveLength(2)
    const overlay = host.querySelector('.mimir-pdf-ocr-overlay')!
    expect(document.activeElement).toBe(overlay)
    await act(async () => {
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(host.querySelector('.mimir-pdf-ocr-overlay')).toBe(null)
    expect(document.activeElement).toBe(named(host, '识别扫描文字'))
    await click(named(host, '识别扫描文字'))
    await click(named(host, '在页面上选字'))
    await settle(() => !!host.querySelector('.mimir-pdf-ocr-overlay'))
    // OCR does not enter native text-object tools.
    const native = await handle.execute('read_pages', { start: 1 })
    expect(JSON.stringify(native)).not.toContain('中文 OCR')
    expect(bytes).toEqual(original)
    await click(named(host, '退出识别选字'))
    await click(
      [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(
        (item) => item.textContent === '开始',
      )!,
    )
    await click(named(host, '查找文字'))
    await settle(() => !!host.querySelector('input[aria-label="查找内容"]'))
    const input = host.querySelector<HTMLInputElement>('input[aria-label="查找内容"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '中文')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await settle(() => host.querySelectorAll('.mimir-pdf-hit').length > 0)
    expect(handle.getVersion()).toBe(version)
    expect(saved).not.toHaveBeenCalled()
  })
  it('closing aborts pending OCR; late completion cannot republish or dirty the document', async () => {
    const { host, handle, saved } = await setup(),
      version = handle.getVersion()
    await click(named(host, '开始本地识别'))
    await settle(() => !!work.resolve)
    await click(named(host, '关闭扫描文字识别'))
    expect(work.signal?.aborted).toBe(true)
    await act(async () => {
      finish()
    })
    await click(named(host, '识别扫描文字'))
    expect(host.querySelector('.mimir-pdf-ocr-preview')).toBe(null)
    expect(handle.getVersion()).toBe(version)
    expect(saved).not.toHaveBeenCalled()
  })
  it('entering page selection stops an ongoing scan before hiding its controls', async () => {
    const { host, handle, saved } = await setup(2)
    const version = handle.getVersion()
    await click(named(host, '开始本地识别'))
    await settle(() => !!work.resolve)
    await act(async () => finish())
    await settle(() => !!host.querySelector('.mimir-pdf-ocr-preview'))
    work.resolve = null
    await click(host.querySelector<HTMLInputElement>('input[value="scanned"]')!)
    expect(host.querySelector<HTMLInputElement>('input[value="scanned"]')?.checked).toBe(true)
    await click(named(host, '开始本地识别'))
    await settle(() => !!work.resolve)
    expect(named(host, '停止识别')).toBeTruthy()
    await click(named(host, '在页面上选字'))
    expect(work.signal?.aborted).toBe(true)
    expect(host.querySelector('.mimir-pdf-inspector')).toBe(null)
    await settle(() => !!host.querySelector('.mimir-pdf-ocr-overlay'))
    expect(handle.getVersion()).toBe(version)
    expect(saved).not.toHaveBeenCalled()
  })
  it('closing the active Ribbon toggle stops work before hiding its controls', async () => {
    const { host } = await setup()
    await click(named(host, '开始本地识别'))
    await settle(() => !!work.resolve)
    await click(named(host, '识别扫描文字'))
    expect(host.querySelector('.mimir-pdf-inspector')).toBe(null)
    expect(work.signal?.aborted).toBe(true)
  })
})
