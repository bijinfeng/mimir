/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import type { PictureElement } from '../../vendor/packages/pptx-engine/src/types.js'
import {
  PptxGroupPictureControls,
  type PptxGroupPictureControlsProps,
} from './PptxGroupPictureControls.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const element = {
  id: 'picture',
  type: 'picture',
  name: '产品图片',
  mediaRef: 'ppt/media/image1.png',
  opacity: 0.37,
  srcRect: { l: 0.1, r: 0.15, t: 0.05, b: 0.2 },
  transform: { offset: { x: 0, y: 0, cx: 1200000, cy: 800000 } },
  anchor: { originalXml: '' },
} as PictureElement
const target = { slide: 0, group: 'group', elementId: 'member' }
async function setup(overrides: Partial<PptxGroupPictureControlsProps> = {}) {
  if (globalThis.Image.name === 'Image' || globalThis.Image.name === 'HTMLImageElement')
    vi.stubGlobal(
      'Image',
      class extends EventTarget {
        naturalWidth = 1
        naturalHeight = 1
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_value: string) {
          queueMicrotask(() => this.dispatchEvent(new Event('load')))
        }
      },
    )
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const apply = vi.fn<PptxGroupPictureControlsProps['apply']>(async () => true)
  const upload = vi.fn<PptxGroupPictureControlsProps['upload']>(async () => true)
  const props = {
    element,
    groupName: '组合图片验收',
    target,
    source: 'data:image/png;base64,fixture',
    apply,
    upload,
    ...overrides,
  }
  let binding = 1
  const render = () =>
    root.render(
      <ConfigProvider componentSize="small">
        <PptxGroupPictureControls key={binding} {...props} />
      </ConfigProvider>,
    )
  await act(async () => render())
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return {
    host,
    apply,
    upload,
    rebind: async () => {
      binding++
      await act(async () => render())
    },
    render: async (changes: Partial<PptxGroupPictureControlsProps>) => {
      Object.assign(props, changes)
      await act(async () => render())
    },
  }
}
function button(host: HTMLElement, label: string) {
  const node = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!node) throw new Error(`Missing button: ${label}`)
  return node
}
function input(host: HTMLElement, label: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  act(() => {
    field.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
  act(() => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
  act(() => field.blur())
}
function tab(host: HTMLElement, label: string) {
  const node = [...host.querySelectorAll('label')].find((item) => item.textContent === label)!
  act(() => node.click())
}
it('shows real 37% opacity and four crop values, and omits untouched crop from one apply', async () => {
  const view = await setup()
  const preview = view.host.querySelector<HTMLElement>('[aria-label="图片预览"]')!
  expect(Number.parseFloat(preview.style.aspectRatio)).toBe(1.5)
  expect(preview.style.maxWidth).toBe('270px')
  expect(
    view.host.querySelector<HTMLInputElement>('input[aria-label="不透明度（%）"]')!.value,
  ).toBe('37')
  expect(
    Number(view.host.querySelector<HTMLInputElement>('input[aria-label="左侧（%）"]')!.value),
  ).toBe(10)
  expect(
    Number(view.host.querySelector<HTMLInputElement>('input[aria-label="右侧（%）"]')!.value),
  ).toBe(15)
  expect(button(view.host, '应用修改').disabled).toBe(true)
  input(view.host, '不透明度（%）', '62')
  expect(view.apply).not.toHaveBeenCalled()
  await act(async () => button(view.host, '应用修改').click())
  expect(view.apply).toHaveBeenCalledTimes(1)
  expect(view.apply.mock.calls[0]![0]).toEqual({ ...target, opacity: 0.62 })
})
it('keeps invalid crop local, resets to a null crop and cancels without writing', async () => {
  const view = await setup()
  input(view.host, '左侧（%）', '85')
  expect(view.host.querySelector('[role="alert"]')?.textContent).toContain('小于 100%')
  expect(button(view.host, '应用修改').disabled).toBe(true)
  act(() => button(view.host, '取消图片草稿').click())
  expect(
    Number(view.host.querySelector<HTMLInputElement>('input[aria-label="左侧（%）"]')!.value),
  ).toBe(10)
  expect(view.apply).not.toHaveBeenCalled()
  act(() => button(view.host, '重置裁切').click())
  await act(async () => button(view.host, '应用修改').click())
  expect(view.apply.mock.calls[0]![0]).toEqual({ ...target, srcRect: null })
})
it('retains failed drafts for retry and prevents duplicate submissions', async () => {
  const view = await setup()
  let release!: (value: boolean) => void
  view.apply.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  input(view.host, '不透明度（%）', '48')
  const applyButton = button(view.host, '应用修改')
  act(() => {
    applyButton.click()
    applyButton.click()
  })
  expect(view.apply).toHaveBeenCalledTimes(1)
  await act(async () => release(false))
  expect(view.host.querySelector('[role="alert"]')?.textContent).toContain('已保留草稿')
  expect(
    view.host.querySelector<HTMLInputElement>('input[aria-label="不透明度（%）"]')!.value,
  ).toBe('48')
  await act(async () => button(view.host, '应用修改').click())
  expect(view.apply).toHaveBeenCalledTimes(2)
})
it('cancels pending work when target/version rebinds, but does not cancel its own busy update', async () => {
  const view = await setup()
  let release!: (value: boolean) => void
  view.apply.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  input(view.host, '不透明度（%）', '48')
  act(() => button(view.host, '应用修改').click())
  const signal = view.apply.mock.calls[0]![1]
  await view.render({ disabled: true })
  expect(signal.aborted).toBe(false)
  await view.rebind()
  expect(signal.aborted).toBe(true)
  await act(async () => release(true))
  expect(
    view.host.querySelector<HTMLInputElement>('input[aria-label="不透明度（%）"]')!.value,
  ).toBe('37')
})
it('cancels work on tab change and reports a missing source instead of a fake cutout preview', async () => {
  const view = await setup({ source: '' })
  let release!: (value: boolean) => void
  view.apply.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  input(view.host, '不透明度（%）', '48')
  act(() => button(view.host, '应用修改').click())
  const signal = view.apply.mock.calls[0]![1]
  tab(view.host, '去背景')
  expect(signal.aborted).toBe(true)
  expect(view.host.querySelector('[role="alert"]')?.textContent).toContain('图片源未加载')
  expect(button(view.host, '应用去背景').disabled).toBe(true)
  expect(view.host.querySelector('img')).toBeNull()
  await act(async () => release(true))
})

it('keeps the selected replacement local, uploads it once with group ownership and resets crop', async () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:replacement')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const view = await setup()
  tab(view.host, '替换')
  const selected = new File(
    [
      Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X9WQAAAAASUVORK5CYII=',
        ),
        (c) => c.charCodeAt(0),
      ),
    ],
    'new-picture.png',
    { type: 'image/png' },
  )
  const picker = view.host.querySelector<HTMLInputElement>('input[type="file"]')!
  await act(async () => {
    Object.defineProperty(picker, 'files', { configurable: true, value: [selected] })
    picker.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(view.upload).not.toHaveBeenCalled()
  expect(view.host.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/png;base64,/)
  await act(async () => button(view.host, '替换图片').click())
  expect(view.upload).toHaveBeenCalledTimes(1)
  expect(view.upload.mock.calls[0]![0]).toEqual({
    kind: 'picture',
    ...target,
    widthPt: 72,
    keepCrop: false,
  })
  expect(view.upload.mock.calls[0]![1]).toBe(selected)
  await view.rebind()
  expect(view.host.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,fixture')
})

it('encodes a real-sized transparent cutout draft and uploads PNG with keepCrop only on explicit apply', async () => {
  vi.stubGlobal(
    'Image',
    class extends EventTarget {
      naturalWidth = 2
      naturalHeight = 2
      set src(_source: string) {
        queueMicrotask(() => this.dispatchEvent(new Event('load')))
      }
    },
  )
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
  const original = new ImageData(
    new Uint8ClampedArray([
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
    ]),
    2,
    2,
  )
  const put = vi.fn<(data: ImageData, x: number, y: number) => void>()
  const context = {
    drawImage: vi.fn<() => void>(),
    getImageData: () => original,
    putImageData: put,
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  )
  const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return `data:image/png;base64,${btoa(`${this.width}x${this.height}`)}`
  })
  const view = await setup()
  await act(async () => tab(view.host, '去背景'))
  expect(view.upload).not.toHaveBeenCalled()
  expect(encode).toHaveBeenCalledWith('image/png')
  expect(put.mock.calls[0]![0]).toMatchObject({ width: 2, height: 2 })
  expect((put.mock.calls[0]![0] as ImageData).data[3]).toBe(0)
  await act(async () => button(view.host, '应用去背景').click())
  expect(view.upload).toHaveBeenCalledTimes(1)
  expect(view.upload.mock.calls[0]![0]).toEqual({
    kind: 'picture',
    ...target,
    widthPt: 72,
    keepCrop: true,
  })
  expect(view.upload.mock.calls[0]![1].type).toBe('image/png')
})

it('rejects a replacement that cannot decode, retains the current source, and performs no upload', async () => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:invalid-picture')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const view = await setup()
  tab(view.host, '替换')
  const selected = new File(
    [
      Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X9WQAAAAASUVORK5CYII=',
        ),
        (c) => c.charCodeAt(0),
      ),
    ],
    'invalid.png',
    { type: 'image/png' },
  )
  const picker = view.host.querySelector<HTMLInputElement>('input[type="file"]')!
  await act(async () => {
    Object.defineProperty(picker, 'files', { configurable: true, value: [selected] })
    picker.dispatchEvent(new Event('change', { bubbles: true }))
  })
  act(() => view.host.querySelector('img')!.dispatchEvent(new Event('error')))
  expect(button(view.host, '替换图片').disabled).toBe(true)
  expect(view.host.querySelector('[role="alert"]')?.textContent).toContain('无法解码')
  expect(view.host.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,fixture')
  expect(view.upload).not.toHaveBeenCalled()
})
