// @vitest-environment happy-dom
import { ConfigProvider } from 'antd'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PDFDocument } from 'pdf-lib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfHostImages } from '../agent/pdf-image-agent.js'
import type { PdfHostAssets } from '../agent/pdf-asset-agent.js'
import type { PdfAgentHandle } from '../agent/pdf-agent.js'
import { PdfEditor } from './PdfEditor.js'
import {
  applyPdfImageOperation,
  readPdfImages,
} from '../../../../apps/server/src/services/pdf-images.js'
import { encodePdfPng } from '../../../../apps/server/src/services/pdf-image-codec.js'
vi.mock('./pdf-render.js', () => ({
  retainPdfDocument: () => () => {},
  awaitPdfTask: <T,>(task: Promise<T>) => task,
  loadPdfDocument: vi.fn<typeof import('./pdf-render.js').loadPdfDocument>(),
  cancelPdfRender() {},
  retainPdfDocuments() {},
  renderPdfPages: async () => ({ dispose() {} }),
}))
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
async function click(node: Element) {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
  })
}
function button(host: HTMLElement, name: string) {
  const node = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.getAttribute('aria-label') === name || item.textContent === name,
  )
  if (!node) throw new Error(`Missing ${name}`)
  return node
}
async function fill(node: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const prototype =
      node instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(node, value)
    node.dispatchEvent(new Event('input', { bubbles: true }))
    node.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
async function setup(
  ready = true,
  prepare?: PdfHostAssets,
  imageHost?: PdfHostImages,
  pageCount = 1,
) {
  const pdf = await PDFDocument.create()
  pdf.addPage([400, 500]).drawText('ORIGINAL', { x: 20, y: 450 })
  if (pageCount > 1) pdf.addPage([400, 500])
  const original = await pdf.save(),
    saves: Uint8Array[] = [],
    native = vi.fn<(input: Parameters<PdfHostImages>[0]) => void>(),
    assets = vi.fn<(input: Parameters<PdfHostAssets>[0]) => void>(),
    dirty = vi.fn<(dirty: boolean) => void>()
  const png = encodePdfPng({
    width: 4,
    height: 2,
    data: new Uint8ClampedArray(Array.from({ length: 8 }, () => [20, 80, 220, 255]).flat()),
  })
  let session = '',
    handle: PdfAgentHandle | null = null
  let documentId = 'pdf-external-images'
  const host = document.createElement('div')
  host.style.width = '420px'
  host.style.height = '500px'
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pdf-generated-test')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const render = () =>
    root.render(
      <ConfigProvider componentSize="small">
        <PdfEditor
          documentId={documentId}
          io={{
            load: async () => original,
            save: async (bytes) => {
              saves.push(bytes)
            },
          }}
          onDirtyChange={dirty}
          onAgentHandleChange={(value) => {
            handle = value
          }}
          hostAssets={async (input) => {
            assets(input)
            session = input.assetSessionId
            if (prepare) return prepare(input)
            return {
              version: input.expectedVersion,
              data:
                input.operation.op === 'generate_image'
                  ? {
                      url: 'mimir-generated://fixture',
                      mimeType: 'image/png',
                      width: 4,
                      height: 2,
                      actualRatio: 2,
                      requestedRatio: input.operation.aspect_ratio,
                      expiresAt: Date.now() + 1200000,
                    }
                  : { results: [] },
            }
          }}
          hostAssetReadiness={async () => ({
            image_search: {
              available: ready,
              reason: ready ? undefined : '搜索未配置，请前往设置',
            },
            generate_image: {
              available: ready,
              reason: ready ? undefined : '图片生成未配置，请前往设置',
            },
          })}
          hostAssetPreview={async (input) => {
            expect(input.assetSessionId).toBe(session)
            return new Blob([new Uint8Array(png)], { type: 'image/png' })
          }}
          hostImages={async (input) => {
            native(input)
            if (imageHost) return imageHost(input)
            const op = input.operation
            const resolved =
              (op.op === 'insert_image' || op.op === 'replace_image') &&
              op.url === 'mimir-generated://fixture'
            if (resolved && input.assetSessionId !== session) throw new Error('素材会话不匹配')
            const result = await applyPdfImageOperation(
              input.bytes,
              resolved ? { ...op, url: undefined, image: png.toString('base64') } : op,
              input.signal,
            )
            return { ...result, version: input.expectedVersion + (result.bytes ? 1 : 0) }
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
  await settle(() => !button(host, '刷新PDF图片').disabled)
  return {
    host,
    get handle() {
      return handle!
    },
    original,
    saves,
    assets,
    native,
    dirty,
    png,
    async changeDocument(next: string) {
      documentId = next
      await act(async () => render())
      await settle(() => handle?.documentId === next)
    },
  }
}
describe('PDF external image manual flow', () => {
  it('uses one fixed insertion action, prepares without dirty/history then saves/reopens and undo/redo real native bytes', async () => {
    const h = await setup(),
      version = h.handle.getVersion(),
      reads = h.native.mock.calls.length
    await click(
      [...h.host.querySelectorAll('.ant-segmented-item')].find(
        (node) => node.textContent === '生成',
      )!,
    )
    await fill(h.host.querySelector('textarea[aria-label="PDF生成图片描述"]')!, 'blue landscape')
    await click(button(h.host, '生成图片'))
    await settle(() => h.host.querySelector('img[alt="生成图片预览"]') !== null)
    expect(h.assets).toHaveBeenCalledTimes(1)
    expect(h.native).toHaveBeenCalledTimes(reads)
    expect.soft(h.handle.getVersion()).toBe(version)
    expect.soft(h.handle.getContext().dirty).toBe(false)
    expect.soft(button(h.host, '撤销').disabled).toBe(true)
    expect(button(h.host, '插入所选图片').closest('.mimir-pdf-inspector__content')).toBeNull()
    expect(h.host.querySelectorAll('.mimir-pdf-image-panel .ant-btn-primary')).toHaveLength(1)
    await click(button(h.host, '插入所选图片'))
    await settle(
      () => h.handle.getContext().dirty === true && !button(h.host, '刷新PDF图片').disabled,
    )
    expect(h.handle.getVersion()).toBe(version + 1)
    await click(button(h.host, '保存到库'))
    await settle(() => h.saves.length === 1)
    const saved = h.saves[0]!
    expect((await readPdfImages(saved)).images).toHaveLength(1)
    await click(button(h.host, '撤销'))
    await settle(() => !button(h.host, '重做').disabled)
    await click(button(h.host, '保存到库'))
    await settle(() => h.saves.length === 2)
    expect(h.saves[1]).toEqual(h.original)
    await click(button(h.host, '重做'))
    await settle(() => !button(h.host, '保存到库').disabled)
    await click(button(h.host, '保存到库'))
    await settle(() => h.saves.length === 3)
    expect(h.saves[2]).toEqual(saved)
  })
  it('prepares a local upload without a mutation and applies one native image through the fixed action', async () => {
    const h = await setup(),
      version = h.handle.getVersion(),
      reads = h.native.mock.calls.length
    const input = button(h.host, '选择PDF图片文件')
      .closest('.ant-upload')!
      .querySelector('input[type="file"]')!
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File([new Uint8Array(h.png)], 'upload.png', { type: 'image/png' })],
    })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(h.native).toHaveBeenCalledTimes(reads)
    expect.soft(h.handle.getVersion()).toBe(version)
    expect.soft(h.handle.getContext().dirty).toBe(false)
    expect.soft(button(h.host, '撤销').disabled).toBe(true)
    const apply = button(h.host, '插入PDF图片')
    expect(apply.closest('.mimir-pdf-inspector__content')).toBeNull()
    await click(apply)
    await settle(
      () => h.handle.getContext().dirty === true && !button(h.host, '刷新PDF图片').disabled,
    )
    expect(
      h.native.mock.calls.filter(([request]) => request.operation.op === 'insert_image'),
    ).toHaveLength(1)
    expect(h.handle.getVersion()).toBe(version + 1)
    expect(button(h.host, '插入PDF图片').disabled).toBe(true)
    await click(button(h.host, '保存到库'))
    await settle(() => h.saves.length === 1)
    expect((await readPdfImages(h.saves[0]!)).images).toMatchObject([
      { x: 40, y: 40, width: 100, height: 50 },
    ])
    await click(button(h.host, '撤销'))
    await settle(() => !button(h.host, '重做').disabled)
    await click(button(h.host, '保存到库'))
    await settle(() => h.saves.length === 2)
    expect(h.saves[1]).toEqual(h.original)
    await click(button(h.host, '重做'))
    await settle(() => !button(h.host, '保存到库').disabled)
    await click(button(h.host, '保存到库'))
    await settle(() => h.saves.length === 3)
    expect(h.saves[2]).toEqual(h.saves[0])
  })
  it('check: closing during external image insertion cancels its late native result', async () => {
    let release!: () => void
    let appliedSignal!: AbortSignal
    const h = await setup(true, undefined, async (input) => {
      if (input.operation.op !== 'read') {
        appliedSignal = input.signal!
        await new Promise<void>((resolve) => {
          release = resolve
        })
        const result = await applyPdfImageOperation(input.bytes, {
          op: 'insert_image',
          pageIndex: 0,
          image: h.png.toString('base64'),
          width: 180,
        })
        return { ...result, version: input.expectedVersion + 1 }
      }
      return { images: await readPdfImages(input.bytes), version: input.expectedVersion }
    })
    await click(
      [...h.host.querySelectorAll('.ant-segmented-item')].find(
        (node) => node.textContent === '生成',
      )!,
    )
    await fill(h.host.querySelector<HTMLTextAreaElement>('textarea')!, 'independent delayed insert')
    await click(button(h.host, '生成图片'))
    await settle(() => !button(h.host, '插入所选图片').disabled)
    const version = h.handle.getVersion()
    await click(button(h.host, '插入所选图片'))
    await settle(() => !!release)
    await click(button(h.host, '关闭PDF图片面板'))
    await act(async () => {
      release()
      await Promise.resolve()
    })
    await settle(() => !button(h.host, 'PDF图片工具').disabled)
    expect.soft(appliedSignal.aborted).toBe(true)
    expect.soft(h.handle.getVersion()).toBe(version)
    expect.soft(h.handle.getContext().dirty).toBe(false)
    expect.soft(button(h.host, '撤销').disabled).toBe(true)
    expect(h.saves).toHaveLength(0)
  })

  it.each(['source', 'page'])(
    'cancels the final external native insertion when %s changes',
    async (change) => {
      let release!: () => void
      let appliedSignal!: AbortSignal
      let lateBytes!: Uint8Array
      const h = await setup(
        true,
        undefined,
        async (input) => {
          if (input.operation.op === 'insert_image') {
            appliedSignal = input.signal!
            await new Promise<void>((resolve) => {
              release = resolve
            })
            // Deliberately ignore abort in the host; the Editor must reject real late bytes.
            const result = await applyPdfImageOperation(input.bytes, {
              ...input.operation,
              url: undefined,
              image: h.png.toString('base64'),
            })
            lateBytes = result.bytes!
            return { ...result, version: input.expectedVersion + 1 }
          }
          return { images: await readPdfImages(input.bytes), version: input.expectedVersion }
        },
        change === 'page' ? 2 : 1,
      )
      await click(
        [...h.host.querySelectorAll('.ant-segmented-item')].find(
          (node) => node.textContent === '生成',
        )!,
      )
      await fill(h.host.querySelector<HTMLTextAreaElement>('textarea')!, 'late native fixture')
      await click(button(h.host, '生成图片'))
      await settle(() => !button(h.host, '插入所选图片').disabled)
      const version = h.handle.getVersion()
      await click(button(h.host, '插入所选图片'))
      await settle(() => !!release)
      let changed = { ok: true }
      if (change === 'source')
        await click(
          [...h.host.querySelectorAll('.ant-segmented-item')].find(
            (node) => node.textContent === '上传',
          )!,
        )
      if (change === 'page')
        await act(async () => {
          changed = await h.handle.execute('goto_page', { page: 2 })
        })
      expect(changed.ok).toBe(true)
      expect(appliedSignal.aborted).toBe(true)
      await act(async () => {
        release()
        await Promise.resolve()
      })
      await settle(() => !button(h.host, '刷新PDF图片').disabled)
      expect((await readPdfImages(lateBytes)).images).toHaveLength(1)
      expect(h.handle.getVersion()).toBe(version)
      expect(h.handle.getContext().dirty).toBe(false)
      expect(button(h.host, '撤销').disabled).toBe(true)
      expect(button(h.host, '保存到库').disabled).toBe(true)
      expect(h.saves).toHaveLength(0)
      expect(h.host.querySelector('img[alt="生成图片预览"]')).toBeNull()
    },
  )
  it('accepts one deferred external native success and retains exactly one history entry', async () => {
    let release!: () => void
    let appliedSignal!: AbortSignal
    const h = await setup(true, undefined, async (input) => {
      if (input.operation.op === 'insert_image') {
        appliedSignal = input.signal!
        await new Promise<void>((resolve) => {
          release = resolve
        })
        const result = await applyPdfImageOperation(input.bytes, {
          ...input.operation,
          url: undefined,
          image: h.png.toString('base64'),
        })
        return { ...result, version: input.expectedVersion + 1 }
      }
      return { images: await readPdfImages(input.bytes), version: input.expectedVersion }
    })
    await click(
      [...h.host.querySelectorAll('.ant-segmented-item')].find(
        (node) => node.textContent === '生成',
      )!,
    )
    await fill(h.host.querySelector<HTMLTextAreaElement>('textarea')!, 'deferred accepted fixture')
    await click(button(h.host, '生成图片'))
    await settle(() => !button(h.host, '插入所选图片').disabled)
    const version = h.handle.getVersion()
    const primary = button(h.host, '插入所选图片')
    await click(primary)
    await settle(() => !!release)
    await click(primary)
    expect(
      h.native.mock.calls.filter(([input]) => input.operation.op === 'insert_image'),
    ).toHaveLength(1)
    expect(appliedSignal.aborted).toBe(false)
    expect(h.handle.getContext().dirty).toBe(false)
    await act(async () => {
      release()
      await Promise.resolve()
    })
    await settle(
      () => h.handle.getContext().dirty === true && !button(h.host, '刷新PDF图片').disabled,
    )
    expect(h.handle.getVersion()).toBe(version + 1)
    expect(h.host.textContent).toContain('已应用到文档')
    expect(h.host.querySelector('img[alt="生成图片预览"]')).toBeNull()
    await click(button(h.host, '保存到库'))
    await settle(() => h.saves.length === 1)
    const saved = h.saves[0]!
    expect((await readPdfImages(saved)).images).toHaveLength(1)
    await click(button(h.host, '撤销'))
    await settle(() => !button(h.host, '刷新PDF图片').disabled)
    expect(button(h.host, '撤销').disabled).toBe(true)
    expect(button(h.host, '重做').disabled).toBe(false)
    await click(button(h.host, '保存到库'))
    await settle(() => h.saves.length === 2)
    expect(h.saves[1]).toEqual(h.original)
    await click(button(h.host, '重做'))
    await settle(() => !button(h.host, '刷新PDF图片').disabled)
    await click(button(h.host, '保存到库'))
    await settle(() => h.saves.length === 3)
    expect(h.saves[2]).toEqual(saved)
  })

  it.each(['document roundtrip', 'intervening page edit'])(
    'check: rejects an ignored-abort native insert after a real %s',
    async (change) => {
      let release!: () => void
      let finished!: () => void
      const returned = new Promise<void>((resolve) => {
        finished = resolve
      })
      let signal!: AbortSignal
      let lateBytes!: Uint8Array
      const h = await setup(true, undefined, async (input) => {
        if (input.operation.op !== 'insert_image')
          return { images: await readPdfImages(input.bytes), version: input.expectedVersion }
        signal = input.signal!
        await new Promise<void>((resolve) => {
          release = resolve
        })
        // The host deliberately finishes native work even after cancellation.
        const result = await applyPdfImageOperation(input.bytes, {
          ...input.operation,
          url: undefined,
          image: h.png.toString('base64'),
        })
        lateBytes = result.bytes!
        finished()
        return { ...result, version: input.expectedVersion + 1 }
      })
      await click(
        [...h.host.querySelectorAll('.ant-segmented-item')].find(
          (node) => node.textContent === '生成',
        )!,
      )
      await fill(h.host.querySelector<HTMLTextAreaElement>('textarea')!, 'independent source gate')
      await click(button(h.host, '生成图片'))
      await settle(() => !button(h.host, '插入所选图片').disabled)
      const originalHandle = h.handle
      const version = originalHandle.getVersion()
      await click(button(h.host, '插入所选图片'))
      await settle(() => !!release)
      const switchedHandles: PdfAgentHandle[] = []
      let edited: Awaited<ReturnType<PdfAgentHandle['execute']>> | undefined
      if (change === 'document roundtrip') {
        await h.changeDocument('pdf-external-images-b')
        switchedHandles.push(h.handle)
        await h.changeDocument('pdf-external-images')
        switchedHandles.push(h.handle)
      } else {
        await act(async () => {
          edited = await h.handle.execute('apply_ops', {
            ops: [{ op: 'rotatePages', pages: [1], dir: 90 }],
          })
        })
      }
      expect(switchedHandles.map((handle) => handle === originalHandle)).toEqual(
        change === 'document roundtrip' ? [false, false] : [],
      )
      expect(edited && { ok: edited.ok, changed: edited.changed, version: edited.version }).toEqual(
        change === 'document roundtrip'
          ? undefined
          : { ok: true, changed: true, version: version + 1 },
      )
      expect(h.handle.getVersion()).toBe(change === 'document roundtrip' ? version : version + 1)
      expect(signal.aborted).toBe(true)
      const acceptedVersion = h.handle.getVersion()
      await act(async () => {
        release()
        await returned
      })
      await settle(() => button(h.host, '保存到库').disabled === (change === 'document roundtrip'))
      expect((await readPdfImages(lateBytes)).images).toHaveLength(1)
      expect(h.handle.getVersion()).toBe(acceptedVersion)
      expect(h.saves).toHaveLength(0)
      expect(
        h.native.mock.calls.filter(([input]) => input.operation.op === 'insert_image'),
      ).toHaveLength(1)
      expect(h.handle.getContext()).toMatchObject({
        dirty: change === 'intervening page edit',
        pageRotations: [change === 'intervening page edit' ? 90 : 0],
      })
      if (change === 'intervening page edit') await click(button(h.host, '撤销'))
      expect(h.handle.getContext()).toMatchObject({ dirty: false, pageRotations: [0] })
      expect(button(h.host, '撤销').disabled).toBe(true)
      expect(button(h.host, '保存到库').disabled).toBe(true)
      expect(h.host.querySelector('img[alt="生成图片预览"]')).toBeNull()
    },
  )

  it('shows truthful missing config and search empty state without modifying the PDF', async () => {
    const h = await setup(false)
    await click(
      [...h.host.querySelectorAll('.ant-segmented-item')].find(
        (node) => node.textContent === '搜索',
      )!,
    )
    await settle(() => h.host.textContent?.includes('搜索未配置') === true)
    expect(button(h.host, '搜索图片').disabled).toBe(true)
    expect(button(h.host, '插入所选图片').disabled).toBe(true)
    expect(h.assets).not.toHaveBeenCalled()
    expect(h.handle.getContext().dirty).toBe(false)
  })
  it('shows a real empty search result without marking a history checkpoint', async () => {
    const h = await setup()
    await click(
      [...h.host.querySelectorAll('.ant-segmented-item')].find(
        (node) => node.textContent === '搜索',
      )!,
    )
    await fill(h.host.querySelector('input[aria-label="搜索PDF图片关键词"]')!, 'no matches')
    await click(button(h.host, '搜索图片'))
    await settle(() => h.host.textContent?.includes('没有找到图片') === true)
    expect(button(h.host, '插入所选图片').disabled).toBe(true)
    expect(h.handle.getContext().dirty).toBe(false)
    expect(button(h.host, '撤销').disabled).toBe(true)
  })
  it('aborts source preparation on closing the Inspector and refuses a late provider response', async () => {
    let release!: (response: Awaited<ReturnType<PdfHostAssets>>) => void
    let input!: Parameters<PdfHostAssets>[0]
    const h = await setup(true, (request) => {
      input = request
      return new Promise((resolve) => {
        release = resolve
      })
    })
    await click(
      [...h.host.querySelectorAll('.ant-segmented-item')].find(
        (node) => node.textContent === '搜索',
      )!,
    )
    await fill(h.host.querySelector('input[aria-label="搜索PDF图片关键词"]')!, 'pending')
    await click(button(h.host, '搜索图片'))
    await settle(() => input !== undefined)
    await click(button(h.host, '关闭PDF图片面板'))
    expect(input.signal!.aborted).toBe(true)
    await act(async () => {
      release({ version: input.expectedVersion, data: { results: [] } })
      await Promise.resolve()
    })
    expect(h.host.querySelector('[aria-label="PDF 图片面板"]')).toBeNull()
    expect(h.handle.getContext().dirty).toBe(false)
    expect(button(h.host, '撤销').disabled).toBe(true)
  })
})
