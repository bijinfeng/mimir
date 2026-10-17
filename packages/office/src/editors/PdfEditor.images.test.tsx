// @vitest-environment happy-dom
import { ConfigProvider } from 'antd'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfHostImages } from '../agent/pdf-image-agent.js'
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
async function setup(imageHost?: PdfHostImages, waitForRead = true, pageCount = 1) {
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
  if (pageCount > 1) pdf.addPage([400, 500])
  const original = await pdf.save(),
    saves: Uint8Array[] = []
  let handle: PdfAgentHandle | null = null
  const host = document.createElement('div')
  host.style.width = '691px'
  document.body.append(host)
  const root = createRoot(host)
  const operations: string[] = []
  const dirty = vi.fn<(value: boolean) => void>()
  let documentId = 'pdf-images'
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const render = () =>
    root.render(
      <ConfigProvider componentSize="small">
        <PdfEditor
          documentId={documentId}
          onDirtyChange={dirty}
          io={{
            load: async () => original,
            save: async (bytes) => {
              saves.push(bytes)
            },
          }}
          onAgentHandleChange={(value) => {
            handle = value
          }}
          hostImages={async (input) => {
            const { bytes, expectedVersion, operation } = input
            operations.push(operation.op)
            if (imageHost) return imageHost(input)
            const result = await applyPdfImageOperation(bytes, operation)
            return { ...result, version: expectedVersion + (result.bytes ? 1 : 0) }
          }}
        />
      </ConfigProvider>,
    )
  await act(async () => render())
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await settle(() => handle !== null)
  await click([...host.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === '编辑')!)
  await click(button(host, 'PDF图片工具'))
  if (waitForRead) await settle(() => !button(host, '刷新PDF图片').disabled)
  return {
    host,
    saves,
    operations,
    original,
    dirty,
    handle: handle!,
    getHandle: () => handle!,
    changeSource: async () => {
      documentId = 'pdf-images-b'
      await act(async () => render())
    },
  }
}

describe('PDF image Inspector and real working bytes', () => {
  it('automatically reads the current bytes after saved Undo/Redo without extra writes or self-refresh', async () => {
    const h = await setup()
    const panel = () => h.host.querySelector('[aria-label="PDF 图片面板"]')!
    await click(openSelect(h.host, '选择PDF图片').find((o) => o.textContent?.includes('图片1'))!)
    await click(openSelect(h.host, 'PDF图片操作').find((o) => o.textContent === '翻转')!)
    const before = h.operations.length
    await click(button(h.host, '翻转所选PDF图片'))
    await settle(() => !button(h.host, '刷新PDF图片').disabled)
    expect(h.operations.slice(before)).toEqual(['read', 'flip_image'])
    expect(panel().textContent).toContain('1 张图片')
    await click(button(h.host, '保存到库'))
    await settle(() => h.saves.length === 1)
    const flipped = h.saves[0]!
    const version = h.handle.getVersion()
    await click(button(h.host, '撤销'))
    await settle(
      () =>
        panel().textContent?.includes('1 张图片') === true &&
        !button(h.host, '刷新PDF图片').disabled,
    )
    expect(h.operations.slice(before)).toEqual(['read', 'flip_image', 'read'])
    expect(h.handle.getVersion()).toBe(version + 1)
    expect(button(h.host, '撤销').disabled).toBe(true)
    expect(button(h.host, '重做').disabled).toBe(false)
    await click(button(h.host, '保存到库'))
    await settle(() => h.saves.length === 2)
    expect(h.saves[1]).toEqual(h.original)
    await click(button(h.host, '重做'))
    await settle(
      () =>
        panel().textContent?.includes('1 张图片') === true &&
        !button(h.host, '刷新PDF图片').disabled,
    )
    expect(h.operations.slice(before)).toEqual(['read', 'flip_image', 'read', 'read'])
    await click(button(h.host, '保存到库'))
    await settle(() => h.saves.length === 3)
    expect(h.saves[2]).toEqual(flipped)
  })
  it('check: discards an Undo read when Redo restores cached exact bytes before its reply', async () => {
    let defer = false
    let release!: () => void
    let staleSignal!: AbortSignal
    const h = await setup(async (input) => {
      if (defer && input.operation.op === 'read') {
        defer = false
        staleSignal = input.signal!
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return {
          version: input.expectedVersion,
          images: { sha256: 'poison', images: [], unsupportedPages: [1] },
        }
      }
      const result = await applyPdfImageOperation(input.bytes, input.operation)
      return { ...result, version: input.expectedVersion + (result.bytes ? 1 : 0) }
    })
    await click(openSelect(h.host, '选择PDF图片').find((o) => o.textContent?.includes('图片1'))!)
    await click(openSelect(h.host, 'PDF图片操作').find((o) => o.textContent === '翻转')!)
    await click(button(h.host, '翻转所选PDF图片'))
    await settle(() => !button(h.host, '刷新PDF图片').disabled)
    await click(button(h.host, '保存到库'))
    await settle(() => h.saves.length === 1 && !button(h.host, '刷新PDF图片').disabled)
    const flipped = h.saves[0]!
    defer = true
    await click(button(h.host, '撤销'))
    await settle(() => !!release)
    expect(h.host.textContent).toContain('正在读取图片')
    expect(h.host.textContent).not.toContain('0 张图片')
    await click(button(h.host, '重做'))
    await settle(() => !button(h.host, '刷新PDF图片').disabled)
    const version = h.handle.getVersion(),
      reads = h.operations.filter((op) => op === 'read').length
    await act(async () => {
      release()
      await Promise.resolve()
    })
    expect(staleSignal.aborted).toBe(true)
    expect(h.host.textContent).toContain('1 张图片')
    expect(h.host.textContent).not.toContain('此页含嵌套图片结构')
    expect(h.handle.getVersion()).toBe(version)
    expect(h.operations.filter((op) => op === 'read')).toHaveLength(reads)
    expect(h.handle.getContext().dirty).toBe(false)
    await click(button(h.host, '撤销'))
    await settle(() => !button(h.host, '刷新PDF图片').disabled)
    await click(button(h.host, '保存到库'))
    await settle(() => h.saves.length === 2)
    expect(h.saves[1]).toEqual(h.original)
    expect(h.saves[0]).toEqual(flipped)
  })

  it('check: a successful current Agent image read supersedes an earlier automatic read failure', async () => {
    let fail = true
    const h = await setup(async (input) => {
      if (fail) throw new Error('check old read failure')
      const result = await applyPdfImageOperation(input.bytes, input.operation)
      return { ...result, version: input.expectedVersion + (result.bytes ? 1 : 0) }
    })
    expect(h.host.textContent).toContain('check old read failure')
    const version = h.handle.getVersion()
    fail = false
    await act(async () => {
      expect((await h.handle.execute('list_page_images', {})).ok).toBe(true)
    })
    await settle(() => !button(h.host, '刷新PDF图片').disabled)
    expect(h.host.textContent).toContain('1 张图片')
    expect(h.host.textContent).not.toContain('check old read failure')
    expect(h.handle.getVersion()).toBe(version)
    expect(h.handle.getContext().dirty).toBe(false)
    expect(button(h.host, '撤销').disabled).toBe(true)
  })

  it('reports failed reads as unknown and retries only on explicit refresh', async () => {
    let fail = true
    const h = await setup(async ({ bytes, expectedVersion, operation }) => {
      if (fail) throw new Error('测试读取失败')
      const result = await applyPdfImageOperation(bytes, operation)
      return { ...result, version: expectedVersion }
    })
    expect(h.host.textContent).toContain('图片列表未读取')
    expect(h.host.textContent).toContain('测试读取失败')
    expect(h.host.textContent).not.toContain('0 张图片')
    expect(h.operations).toEqual(['read'])
    expect(button(h.host, '保存到库').disabled).toBe(true)
    expect(button(h.host, '撤销').disabled).toBe(true)
    const version = h.handle.getVersion()
    fail = false
    await click(button(h.host, '刷新PDF图片'))
    await settle(() => h.host.textContent?.includes('1 张图片') === true)
    expect(h.operations).toEqual(['read', 'read'])
    expect(h.handle.getVersion()).toBe(version)
    expect(h.handle.getContext().dirty).toBe(false)
    expect(button(h.host, '保存到库').disabled).toBe(true)
  })
  it.each(['close', 'source', 'edit', 'page'])(
    'rejects a delayed image read after %s changes',
    async (change) => {
      let release!: () => void
      let signal!: AbortSignal
      const h = await setup(
        async ({ bytes, expectedVersion, operation, signal: inputSignal }) => {
          if (!release) {
            signal = inputSignal!
            await new Promise<void>((resolve) => {
              release = resolve
            })
            // A deliberately poisoned stale reply must never replace the current page/source.
            return {
              version: expectedVersion,
              images: { sha256: 'stale', images: [], unsupportedPages: [1, 2] },
            }
          }
          const result = await applyPdfImageOperation(bytes, operation)
          return { ...result, version: expectedVersion }
        },
        false,
        change === 'page' ? 2 : 1,
      )
      expect(h.host.textContent).toContain('正在读取图片')
      expect(h.host.textContent).not.toContain('0 张图片')
      let result = { ok: true }
      if (change === 'close') await click(button(h.host, '关闭PDF图片面板'))
      if (change === 'source') await h.changeSource()
      if (change === 'edit')
        await act(async () => {
          result = await h.handle.execute('apply_ops', {
            ops: [{ op: 'rotatePages', pages: [1], dir: 90 }],
          })
        })
      if (change === 'page')
        await act(async () => {
          result = await h.handle.execute('goto_page', { page: 2 })
        })
      expect(result.ok).toBe(true)
      expect(signal.aborted).toBe(true)
      await act(async () => {
        release()
        await Promise.resolve()
      })
      expect(h.host.textContent).not.toContain('此页含嵌套图片结构，暂不能编辑')
      const expectedCount = change === 'source' ? '1 张图片' : change === 'page' ? '0 张图片' : null
      if (expectedCount) await settle(() => h.host.textContent?.includes(expectedCount) === true)
      expect(expectedCount === null || h.host.textContent?.includes(expectedCount)).toBe(true)
      await settle(() => h.getHandle() !== null)
      expect(h.getHandle().getContext().dirty).toBe(change === 'edit')
      expect(h.saves).toHaveLength(0)
    },
  )

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
