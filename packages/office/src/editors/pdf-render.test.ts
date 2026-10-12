// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'

const { rendered, loads } = vi.hoisted(() => ({
  rendered: [] as HTMLCanvasElement[],
  loads: { count: 0 },
}))

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => {
    loads.count += 1
    return {
      promise: Promise.resolve({
        getPage: async () => ({
          getViewport: ({ scale }: { scale: number }) => ({
            width: 100 * scale,
            height: 150 * scale,
          }),
          render: ({ canvas }: { canvas: HTMLCanvasElement }) => {
            rendered.push(canvas)
            return { promise: Promise.resolve(), cancel: () => {} }
          },
        }),
      }),
      destroy: async () => {},
    }
  },
}))

import { renderPdfPages } from './pdf-render.js'

function makeCanvas(): HTMLCanvasElement {
  const node = document.createElement('canvas')
  Object.defineProperty(node, 'getContext', { value: () => ({}) })
  return node
}

describe('PDF 并发缩略图渲染', () => {
  it('两个 canvas 同时绘制不会相互作废，同一 canvas 仍只保留最新一笔', async () => {
    rendered.length = 0
    loads.count = 0
    const bytes = new Uint8Array([1, 2, 3])
    const main = makeCanvas()
    const thumbnail = makeCanvas()
    const options = { bytes, pageIndex: 0, rotation: 0, width: 100 }
    const [mainHandle, thumbnailHandle] = await Promise.all([
      renderPdfPages({ ...options, canvas: main }),
      renderPdfPages({ ...options, canvas: thumbnail }),
    ])
    expect(mainHandle).not.toBeNull()
    expect(thumbnailHandle).not.toBeNull()
    expect(rendered).toEqual([main, thumbnail])
    expect(loads.count).toBe(1)

    rendered.length = 0
    const [stale, latest] = await Promise.all([
      renderPdfPages({ ...options, canvas: main }),
      renderPdfPages({ ...options, canvas: main }),
    ])
    expect(stale).toBeNull()
    expect(latest).not.toBeNull()
    expect(rendered).toEqual([main])
  })
})
