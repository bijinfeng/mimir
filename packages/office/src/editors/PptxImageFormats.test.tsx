/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { PptxImageFillControls, type PptxUpload } from './PptxAssetControls.js'
import { readPptxImageInfo } from '@mimir/shared'
const rootDirectory = resolvePath(
  dirname(fileURLToPath(import.meta.url)),
  '../../tests/fixtures/pptx-images',
)
const source = (name: string) => new Uint8Array(readFileSync(resolvePath(rootDirectory, name)))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
async function mount() {
  vi.stubGlobal(
    'Image',
    class extends EventTarget {
      naturalWidth = 12
      naturalHeight = 8
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.dispatchEvent(new Event('load')))
      }
    },
  )
  const host = document.createElement('div'),
    root = createRoot(host)
  document.body.append(host)
  const upload = vi.fn<PptxUpload>(async () => true)
  await act(async () =>
    root.render(<PptxImageFillControls slide={0} elementId="shape" upload={upload} />),
  )
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  const choose = async (file: File) => {
    const input = host.querySelector<HTMLInputElement>('input[type=file]')!
    await act(async () => {
      Object.defineProperty(input, 'files', { configurable: true, value: [file] })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }
  const apply = () => host.querySelector<HTMLButtonElement>('button[aria-label="应用图片填充"]')!
  return { host, root, upload, choose, apply }
}
it.each(['gif', 'bmp', 'webp'])(
  'previews real %s locally, uploads its original File exactly once on apply',
  async (ext) => {
    const view = await mount(),
      bytes = source(`picture.${ext}`)
    const file = new File([bytes], `photo.${ext}`, { type: `image/${ext}` })
    await view.choose(file)
    expect(view.host.querySelector('input[type=file]')?.getAttribute('accept')).toContain('.tiff')
    expect(view.host.querySelector('img')?.getAttribute('src')).toMatch(
      new RegExp(`^data:image/${ext};base64,`),
    )
    expect(view.upload).not.toHaveBeenCalled()
    const body = view.host.querySelector('.mimir-pptx-image-fill__body')!
    const footer = view.host.querySelector('.mimir-pptx-image-fill__footer')!
    expect(body.contains(view.host.querySelector('img'))).toBe(true)
    expect(body.contains(view.apply())).toBe(false)
    expect(footer.querySelectorAll('button')).toHaveLength(1)
    expect(footer.contains(view.apply())).toBe(true)
    act(() => {
      view.apply().click()
      view.apply().click()
    })
    expect(view.upload).toHaveBeenCalledTimes(1)
    expect(view.upload.mock.calls[0]![0]).toEqual({
      kind: 'image_fill',
      slide: 0,
      elementId: 'shape',
      tile: false,
    })
    expect(view.upload.mock.calls[0]![1]).toBe(file)
  },
)
it('previews the largest actual TIFF page as PNG, states the policy and keeps TIFF for upload', async () => {
  const view = await mount(),
    pixels: unknown[] = []
  vi.stubGlobal(
    'ImageData',
    class {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number,
      ) {}
    },
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    putImageData: (value: unknown) => pixels.push(value),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/png;base64,cHJldmlldw==',
  )
  const bytes = source('picture.tiff'),
    file = new File([bytes], 'photo.tif', { type: 'image/tiff' })
  await view.choose(file)
  expect(view.host.textContent).toContain('尺寸最大的安全页面')
  expect(pixels[0]).toMatchObject({ width: 12, height: 8 })
  expect(view.host.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/png/)
  expect(view.apply().closest('.mimir-pptx-image-fill__footer')).not.toBeNull()
  await act(async () => view.apply().click())
  expect(view.upload.mock.calls[0]![1]).toBe(file)
  expect(new Uint8Array(await view.upload.mock.calls[0]![1].arrayBuffer())).toEqual(bytes)
})
it('keeps malformed/MIME failures visible and cannot apply them', async () => {
  const view = await mount()
  await view.choose(new File([source('picture.gif')], 'false.png', { type: 'image/png' }))
  expect(view.host.querySelector('[role=alert]')?.textContent).toContain('MIME')
  expect(view.apply().disabled).toBe(true)
  expect(view.upload).not.toHaveBeenCalled()
})
it('does not republish a late file read after a newer file is chosen', async () => {
  const view = await mount(),
    bytes = source('picture.gif')
  let release!: (buffer: ArrayBuffer) => void
  const late = new File([bytes], 'old.gif', { type: 'image/gif' })
  vi.spyOn(late, 'arrayBuffer').mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  await view.choose(late)
  expect(view.apply().disabled).toBe(true)
  const newer = source('picture.webp')
  await view.choose(new File([newer], 'new.webp', { type: 'image/webp' }))
  await act(async () => release(new Uint8Array(bytes).buffer))
  expect(view.host.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/webp/)
  expect(view.host.textContent).not.toContain('old.gif')
  expect(readPptxImageInfo(newer).ext).toBe('webp')
})

it('aborts a pending file read when the actual panel unmounts', async () => {
  const view = await mount(),
    bytes = source('picture.gif')
  let release!: (buffer: ArrayBuffer) => void
  const late = new File([bytes], 'old.gif', { type: 'image/gif' })
  vi.spyOn(late, 'arrayBuffer').mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  await view.choose(late)
  cleanup.pop()?.()
  await act(async () => release(new Uint8Array(bytes).buffer))
  expect(view.host.querySelector('img')).toBeNull()
  expect(view.upload).not.toHaveBeenCalled()
  view.host.remove()
})
