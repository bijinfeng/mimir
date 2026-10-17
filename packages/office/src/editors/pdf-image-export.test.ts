import JSZip from 'jszip'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const render = vi.hoisted(() =>
  vi.fn<
    (request: {
      bytes: Uint8Array
      pageIndex: number
      dpi: number
      signal?: AbortSignal
    }) => Promise<{ bytes: Uint8Array; width: number; height: number }>
  >(),
)
const release = vi.hoisted(() => vi.fn<() => void>())
vi.mock('./pdf-render.js', () => ({
  renderPdfPageImage: render,
  retainPdfImageExport: () => release,
}))
import { exportPdfPageImages, pdfImagePages } from './pdf-image-export.js'

beforeEach(() => {
  release.mockReset()
  render.mockReset().mockImplementation(async ({ pageIndex }) => ({
    bytes: new Uint8Array([137, 80, 78, 71, pageIndex]),
    width: 600,
    height: 800,
  }))
})
describe('PDF 页面图像输出', () => {
  it('页码去重并按当前文档顺序导出，拒绝越界/逆序和无效语法', () => {
    expect(pdfImagePages('5, 1-3，2', 5)).toEqual([1, 2, 3, 5])
    for (const range of ['', '0', '1-6', '4-2', '1,,2', '1.5', 'x', '9999999999999999999'])
      expect(() => pdfImagePages(range, 5)).toThrow(/./)
  })
  it('单页保持 PNG 字节，多页 ZIP 使用实际页码、正确次序和完整像素', async () => {
    const progress = vi.fn<(done: number, total: number) => void>()
    const request = {
      bytes: new Uint8Array([1]),
      dpi: 150,
      signal: new AbortController().signal,
      assertCurrent() {},
      onProgress: progress,
    }
    const single = await exportPdfPageImages({ ...request, pages: [3] })
    expect(single.name).toBe('page-003.png')
    expect(single.mime).toBe('image/png')
    expect([...single.bytes]).toEqual([137, 80, 78, 71, 2])
    const multiple = await exportPdfPageImages({ ...request, pages: [1, 3] })
    const zip = await JSZip.loadAsync(multiple.bytes)
    expect(Object.keys(zip.files)).toEqual(['page-001.png', 'page-003.png'])
    expect([...(await zip.file('page-003.png')!.async('uint8array'))]).toEqual([137, 80, 78, 71, 2])
    expect(multiple.pages).toEqual([
      { page: 1, width: 600, height: 800 },
      { page: 3, width: 600, height: 800 },
    ])
    expect(progress).toHaveBeenLastCalledWith(2, 2)
    expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ pageIndex: 2, dpi: 150 }))
  })
  it('中途取消、画布变化或某页失败时不返回部分 ZIP', async () => {
    const controller = new AbortController()
    render.mockImplementationOnce(async () => {
      controller.abort()
      return { bytes: new Uint8Array([1]), width: 1, height: 1 }
    })
    const request = {
      bytes: new Uint8Array([1]),
      pages: [1, 2],
      dpi: 150,
      signal: controller.signal,
      assertCurrent() {},
      onProgress() {},
    }
    await expect(exportPdfPageImages(request)).rejects.toThrow(/./)
    expect(render).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
    await expect(
      exportPdfPageImages({
        ...request,
        signal: new AbortController().signal,
        assertCurrent() {
          throw new Error('stale')
        },
      }),
    ).rejects.toThrow('stale')
    render.mockRejectedValueOnce(new Error('page failed'))
    await expect(
      exportPdfPageImages({ ...request, signal: new AbortController().signal }),
    ).rejects.toThrow('page failed')
  })
})
