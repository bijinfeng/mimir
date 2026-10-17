// @vitest-environment happy-dom
import { ConfigProvider } from 'antd'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfAgentHandle } from '../agent/pdf-agent.js'
import { openSelect } from '../shell/antd-test-dom.js'
vi.mock('./pdf-render.js', () => ({
  retainPdfDocument: () => () => {},
  awaitPdfTask: <T,>(task: Promise<T>) => task,
  loadPdfDocument: vi.fn<typeof import('./pdf-render.js').loadPdfDocument>(),
  cancelPdfRender() {},
  retainPdfDocuments() {},
  renderPdfPages: async () => ({ dispose() {} }),
}))
import { PdfEditor } from './PdfEditor.js'
import {
  applyPdfImageOperation,
  readPdfImages,
} from '../../../../apps/server/src/services/pdf-images.js'
import { encodePdfPng } from '../../../../apps/server/src/services/pdf-image-codec.js'
const cleanup: Array<() => void> = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})
async function settle(predicate: () => boolean) {
  const deadline = Date.now() + 5000
  while (!predicate() && Date.now() < deadline)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  expect(predicate()).toBe(true)
}
function button(host: HTMLElement, label: string) {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!found) throw new Error(`Missing ${label}`)
  return found
}
async function click(node: Element) {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}
function imageBytes() {
  return encodePdfPng({
    width: 4,
    height: 2,
    data: new Uint8ClampedArray([
      255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 128, 0, 0, 255, 128, 255, 0, 0, 255, 255, 0, 0,
      255, 0, 0, 255, 128, 0, 0, 255, 128,
    ]),
  })
}
async function setup() {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage([400, 500])
  page.drawText('ORIGINAL', {
    font: await pdf.embedFont(StandardFonts.Helvetica),
    x: 20,
    y: 460,
    size: 12,
  })
  const image = await pdf.embedPng(imageBytes())
  page.drawImage(image, { x: 40, y: 300, width: 80, height: 40 })
  const original = await pdf.save(),
    saves: Uint8Array[] = []
  let handle: PdfAgentHandle | null = null
  const host = document.createElement('div')
  host.style.width = '691px'
  document.body.append(host)
  const root = createRoot(host)
  const operations: string[] = []
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () =>
    root.render(
      <ConfigProvider componentSize="small">
        <PdfEditor
          documentId="pdf-images"
          io={{
            load: async () => original,
            save: async (bytes) => {
              saves.push(bytes)
            },
          }}
          onAgentHandleChange={(value) => {
            handle = value
          }}
          hostImages={async ({ bytes, expectedVersion, operation }) => {
            operations.push(operation.op)
            const result = await applyPdfImageOperation(bytes, operation)
            return { ...result, version: expectedVersion + (result.bytes ? 1 : 0) }
          }}
        />
      </ConfigProvider>,
    ),
  )
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await settle(() => handle !== null)
  await click([...host.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === '编辑')!)
  await click(button(host, 'PDF图片工具'))
  await settle(() => !button(host, '刷新PDF图片').disabled)
  return { host, saves, operations, handle: handle! }
}

describe('PDF image Inspector and real working bytes', () => {
  it('shares selected image pixels, Agent round undo and two saved files through the real host', async () => {
    const { host, saves, handle } = await setup()
    const panel = host.querySelector('[aria-label="PDF 图片面板"]')!
    expect(panel.closest('[aria-label="PDF 属性工具"]')).not.toBeNull()
    expect(panel.closest('.mimir-editor__subbar')).toBeNull()
    await click(
      openSelect(host, '选择PDF图片').find((option) => option.textContent?.includes('图片1'))!,
    )
    expect(host.querySelector('[data-image-selected="true"]')).not.toBeNull()
    expect(panel.textContent).toContain('宽度 · pt')
    await click(
      openSelect(host, 'PDF图片操作').find((option) => option.textContent === '不透明度')!,
    )
    expect(panel.textContent).toContain('目标不透明度 · %')
    expect(panel.textContent).toContain('当前不透明度未读取')
    await click(openSelect(host, 'PDF图片操作').find((option) => option.textContent === '翻转')!)
    await click(button(host, '翻转所选PDF图片'))
    await settle(() => !button(host, '刷新PDF图片').disabled)
    expect(host.querySelector('[role="status"]')?.textContent ?? host.textContent).toContain(
      '已应用到文档',
    )
    expect(handle.getContext().dirty).toBe(true)
    await click(button(host, '保存到库'))
    await settle(() => saves.length === 1)
    const saved = saves[0]!.slice()
    const priorVersion = handle.getVersion()
    let result: Awaited<ReturnType<PdfAgentHandle['execute']>> | undefined
    await act(async () => {
      result = await handle.execute(
        'transform_image',
        { page: 1, image_number: 1, x: 70, y: 100 },
        { roundId: 'images-round' },
      )
    })
    expect(result).toMatchObject({ ok: true, changed: true })
    expect(handle.getVersion()).toBeGreaterThan(priorVersion)
    act(() => {
      expect(handle.undoRound('images-round')).toBe(true)
    })
    await act(async () => {
      result = await handle.execute('list_page_images', {})
    })
    expect(result).toMatchObject({
      ok: true,
      data: { images: [{ x: 40, y: 160, width: 80, height: 40 }] },
    })
    await act(async () => {
      result = await handle.execute('set_image_opacity', { page: 1, image_number: 1, opacity: 0.5 })
    })
    expect(result).toMatchObject({ ok: true, changed: true })
    await click(button(host, '保存到库'))
    await settle(() => saves.length === 2)
    expect((await readPdfImages(saves[1]!)).images[0]).toMatchObject({
      x: 40,
      y: 160,
      opacity: 0.5,
    })
    expect(saves[0]).toEqual(saved)
    expect((await PDFDocument.load(saves[1]!)).getPageCount()).toBe(1)
    await act(async () => {
      host
        .querySelector('[aria-label="PDF 属性工具"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(host.querySelector('[aria-label="PDF 属性工具"]')).toBeNull()
    expect(document.activeElement).toBe(button(host, 'PDF图片工具'))
  })
  it('rejects an asynchronous file read after an intervening Agent edit', async () => {
    const { host, handle, operations } = await setup()
    const reads: FileReader[] = []
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      reads.push(this)
    })
    const input = button(host, '选择PDF图片文件')
      .closest('.ant-upload')!
      .querySelector('input[type="file"]')!
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File([new Uint8Array(imageBytes())], 'upload.png', { type: 'image/png' })],
    })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(reads).toHaveLength(0)
    await click(button(host, '插入PDF图片'))
    expect(reads).toHaveLength(1)
    await act(async () => {
      expect((await handle.execute('rotate_image', { page: 1, image_number: 1 })).ok).toBe(true)
    })
    const version = handle.getVersion()
    await act(async () => {
      Object.defineProperty(reads[0]!, 'result', {
        value: `data:image/png;base64,${imageBytes().toString('base64')}`,
      })
      reads[0]!.dispatchEvent(new Event('load'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(handle.getVersion()).toBe(version)
    expect(operations).not.toContain('insert_image')
  })
})
