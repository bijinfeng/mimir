// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({
  width: 200,
  height: 300,
  gate: null as Promise<void> | null,
  cancelled: vi.fn<() => void>(),
  loads: vi.fn<() => void>(),
  destroyed: vi.fn<() => void>(),
  renders: vi.fn<(args: { canvas: HTMLCanvasElement; [key: string]: unknown }) => void>(),
}))
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => {
    state.loads()
    return {
      promise: Promise.resolve({
        getPage: async () => ({
          getViewport: ({ scale }: { scale: number }) => ({
            width: state.width * scale,
            height: state.height * scale,
          }),
          render: (args: { canvas: HTMLCanvasElement; [key: string]: unknown }) => {
            state.renders(args)
            return { promise: state.gate ?? Promise.resolve(), cancel: state.cancelled }
          },
        }),
      }),
      destroy: async () => {
        state.destroyed()
      },
    }
  },
}))
import { renderPdfPageImage, retainPdfImageExport, retainPdfDocuments } from './pdf-render.js'
beforeEach(() => {
  state.width = 200
  state.height = 300
  state.gate = null
  retainPdfDocuments([])
  state.loads.mockReset()
  state.destroyed.mockReset()
  state.cancelled.mockReset()
  state.renders.mockReset()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })),
  )
})
afterEach(() => vi.restoreAllMocks())
describe('PDF raster DPI 与取消', () => {
  it('两个导出引用共同持有文档；PNG编码期间取消也拒绝迟到像素并释放canvas', async () => {
    const bytes = new Uint8Array([8])
    const releaseA = retainPdfImageExport(bytes)
    const releaseB = retainPdfImageExport(bytes)
    await renderPdfPageImage({ bytes, pageIndex: 0, dpi: 72 })
    releaseA()
    retainPdfDocuments([])
    expect(state.destroyed).not.toHaveBeenCalled()
    let encode!: BlobCallback
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce((callback) => {
      encode = callback
    })
    const controller = new AbortController()
    const job = renderPdfPageImage({ bytes, pageIndex: 1, dpi: 72, signal: controller.signal })
    await vi.waitFor(() => expect(encode).toBeTypeOf('function'))
    controller.abort()
    encode(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }))
    await expect(job).rejects.toThrow(/abort/i)
    const canvas = state.renders.mock.calls.at(-1)![0].canvas
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
    expect(state.loads).toHaveBeenCalledTimes(1)
    releaseB()
    expect(state.destroyed).toHaveBeenCalledTimes(1)
  })
  it('整批只解析一次，释放导出不销毁主画布仍在使用的文档', async () => {
    const bytes = new Uint8Array([5])
    const release = retainPdfImageExport(bytes)
    await renderPdfPageImage({ bytes, pageIndex: 0, dpi: 72 })
    retainPdfDocuments([])
    await renderPdfPageImage({ bytes, pageIndex: 1, dpi: 72 })
    expect(state.loads).toHaveBeenCalledTimes(1)
    expect(state.destroyed).not.toHaveBeenCalled()
    release()
    release()
    expect(state.destroyed).toHaveBeenCalledTimes(1)
    const live = new Uint8Array([6])
    retainPdfDocuments([live])
    const releaseLive = retainPdfImageExport(live)
    await renderPdfPageImage({ bytes: live, pageIndex: 0, dpi: 72 })
    releaseLive()
    expect(state.destroyed).toHaveBeenCalledTimes(1)
    retainPdfDocuments([])
    expect(state.destroyed).toHaveBeenCalledTimes(2)
  })
  it('按页面实际 viewport 输出固定 DPI，不受 Retina 或编辑器缩放影响', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })
    const output = await renderPdfPageImage({ bytes: new Uint8Array([1]), pageIndex: 0, dpi: 150 })
    expect(output.width).toBe(416)
    expect(output.height).toBe(625)
    expect([...output.bytes]).toEqual([137, 80, 78, 71])
    expect(state.renders).toHaveBeenCalledWith(
      expect.objectContaining({
        background: '#ffffff',
        viewport: { width: (200 * 150) / 72, height: 625 },
      }),
    )
    const canvas = state.renders.mock.calls[0]![0].canvas as HTMLCanvasElement
    expect(canvas.width).toBe(0)
    expect(canvas.height).toBe(0)
  })
  it('过大图像在分配canvas前拒绝，取消实际render并不返回旧像素', async () => {
    state.width = 20000
    await expect(
      renderPdfPageImage({ bytes: new Uint8Array([2]), pageIndex: 0, dpi: 300 }),
    ).rejects.toThrow('降低分辨率')
    expect(state.renders).not.toHaveBeenCalled()
    state.width = 200
    let release!: () => void
    state.gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const controller = new AbortController()
    const job = renderPdfPageImage({
      bytes: new Uint8Array([3]),
      pageIndex: 0,
      dpi: 72,
      signal: controller.signal,
    })
    await vi.waitFor(() => expect(state.renders).toHaveBeenCalledTimes(1))
    controller.abort()
    release()
    await expect(job).rejects.toThrow(/abort/i)
    expect(state.cancelled).toHaveBeenCalledTimes(1)
  })
})
