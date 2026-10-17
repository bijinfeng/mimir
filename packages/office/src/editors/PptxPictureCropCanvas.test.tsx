/** @vitest-environment happy-dom */
import { act } from 'react'
import { readFileSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { PictureElement } from '../../vendor/packages/pptx-engine/src/types.js'
import { PptxPictureCropCanvas, type PptxPictureCropCanvasProps } from './PptxPictureCropCanvas.js'
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})
const imageHref = 'data:image/png;base64,test'
function mount(patch: Partial<PptxPictureCropCanvasProps> = {}) {
  const host = document.createElement('div')
  host.className = 'mimir-editor'
  document.body.append(host)
  const root = createRoot(host)
  let props: PptxPictureCropCanvasProps = {
    documentId: 'doc',
    slideKey: 'slide1.xml',
    version: 3,
    element: {
      type: 'picture',
      id: 'pic',
      mediaRef: 'image1.png',
      anchor: { originalXml: '', range: [0, 0] },
      transform: {
        offset: { x: 952500, y: 952500, cx: 3810000, cy: 1905000 },
        rot: 0,
        flipH: false,
        flipV: false,
      },
    } as PictureElement,
    target: { slide: 0, el: 'e_pic' },
    width: 960,
    height: 540,
    slideWidth: 9144000,
    slideHeight: 5143500,
    imageHref,
    disabled: false,
    apply: vi.fn<PptxPictureCropCanvasProps['apply']>(async () => true),
    onExit: vi.fn<() => void>(),
    onBusy: vi.fn<(busy: boolean) => void>(),
    ...patch,
  }
  const render = (next: Partial<PptxPictureCropCanvasProps> = {}) => {
    props = { ...props, ...next }
    act(() => root.render(<PptxPictureCropCanvas {...props} />))
    const svg = host.querySelector('svg.mimir-pptx-picture-crop-canvas')
    if (svg) {
      svg.getBoundingClientRect = () => ({
        left: 20,
        top: 10,
        width: 480,
        height: 270,
        x: 20,
        y: 10,
        right: 500,
        bottom: 280,
        toJSON: () => null,
      })
      ;(svg as SVGSVGElement).setPointerCapture = vi.fn<(pointerId: number) => void>()
      ;(svg as SVGSVGElement).releasePointerCapture = vi.fn<(pointerId: number) => void>()
    }
  }
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  render()
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  const getProps = () => props
  return { host, render, getProps }
}
function pointer(
  host: HTMLElement,
  type: string,
  x: number,
  y: number,
  handle?: string,
  pointerId = 1,
) {
  act(() => {
    const target = handle
      ? host.querySelector(`[data-crop-handle="${handle}"]`)!
      : host.querySelector('.mimir-pptx-picture-crop-canvas')!
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId,
        isPrimary: pointerId === 1,
        button: 0,
      }),
    )
  })
}
function key(host: HTMLElement, name: string, handle?: string, shiftKey = false) {
  act(() => {
    const target = handle
      ? host.querySelector(`[data-crop-handle="${handle}"]`)!
      : host.querySelector('.mimir-pptx-picture-crop-canvas')!
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true }),
    )
  })
}
function button(host: HTMLElement, name: string) {
  return host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!
}
function click(host: HTMLElement, name: string) {
  act(() => button(host, name).click())
}
async function settle() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}
it('anchors the crop actions to the scrollport bottom within the overlay instead of below the entire slide', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync(
    resolvePath(dirname(fileURLToPath(import.meta.url)), 'pptx-picture-crop.css'),
    'utf8',
  )
  document.head.append(style)
  cleanups.push(() => style.remove())
  const { host } = mount()
  const layer = host.querySelector<HTMLElement>('.mimir-pptx-picture-crop-layer')!,
    feedback = host.querySelector<HTMLElement>('.mimir-pptx-picture-crop-feedback')!,
    canvas = host.querySelector<SVGSVGElement>('.mimir-pptx-picture-crop-canvas')!
  expect(getComputedStyle(layer).display).toBe('grid')
  expect(getComputedStyle(canvas).gridRow).toBe('1 / -1')
  expect(getComputedStyle(feedback).position).toBe('sticky')
  expect(getComputedStyle(feedback).gridRow).toBe('1 / -1')
  expect(getComputedStyle(feedback).alignSelf).toBe('end')
  expect(getComputedStyle(feedback).top).toBe('auto')
  expect(getComputedStyle(feedback).bottom).toBe('8px')
  expect(feedback.contains(button(host, '应用拖动裁切'))).toBe(true)
  expect(feedback.contains(button(host, '取消图片拖动裁切'))).toBe(true)
})
it('only applies a media poster crop after the actual image loads and rejects an unreadable poster', async () => {
  const { host, getProps, render } = mount()
  const element: PictureElement = {
    ...getProps().element,
    media: { kind: 'video', target: 'ppt/media/video1.mov' },
  }
  render({ element, version: 4 })
  key(host, 'ArrowRight', 'w')
  expect(button(host, '应用拖动裁切').disabled).toBe(true)
  key(host, 'Enter')
  await settle()
  expect(getProps().apply).not.toHaveBeenCalled()
  act(() => host.querySelector('image')!.dispatchEvent(new Event('error')))
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('封面无法读取')
  expect(button(host, '应用拖动裁切').disabled).toBe(true)
  render({ version: 5 })
  act(() => host.querySelector('image')!.dispatchEvent(new Event('load')))
  key(host, 'ArrowRight', 'w')
  expect(button(host, '应用拖动裁切').disabled).toBe(false)
  click(host, '应用拖动裁切')
  await settle()
  expect(getProps().apply).toHaveBeenCalledOnce()
})
it('has eight keyboard grips and a live ghost preview; scaled drag drafts only until explicit apply, committing frame and crop once', async () => {
  const { host, getProps } = mount()
  expect(host.querySelectorAll('[data-crop-handle]')).toHaveLength(8)
  expect(host.querySelector('image')?.getAttribute('href')).toBe(imageHref)
  expect(button(host, '应用拖动裁切').disabled).toBe(true)
  // Original left edge at slide x100 => client x70. Move 40 local pixels inwards.
  pointer(host, 'pointerdown', 70, 110, 'w')
  pointer(host, 'pointermove', 90, 110)
  expect(host.querySelector('.mimir-pptx-picture-crop-frame')?.getAttribute('x')).toBe('40')
  expect(getProps().apply).not.toHaveBeenCalled()
  pointer(host, 'pointerup', 90, 110)
  expect(getProps().apply).not.toHaveBeenCalled()
  click(host, '应用拖动裁切')
  click(host, '应用拖动裁切')
  await settle()
  expect(getProps().apply).toHaveBeenCalledExactlyOnceWith(
    { l: 0.1, t: 0, r: 0, b: 0 },
    3,
    expect.any(AbortSignal),
    { x: 1333500, y: 952500, cx: 3429000, cy: 1905000 },
  )
  expect(getProps().onExit).toHaveBeenCalledTimes(1)
})
it('restores previous cropped content outward, Arrow/Shift microadjust and Enter apply', async () => {
  const { host, getProps } = mount()
  key(host, 'ArrowRight', 'w')
  key(host, 'ArrowRight', 'w', true)
  expect(host.querySelector('.mimir-pptx-picture-crop-frame')?.getAttribute('x')).toBe('11')
  key(host, 'Enter')
  await settle()
  expect(getProps().apply).toHaveBeenCalledTimes(1)
  const element = getProps().element
  const second = mount({ element: { ...element, srcRect: { l: 0.25, t: 0.1, r: 0.25, b: 0.1 } } })
  click(second.host, '恢复图片完整范围')
  expect(second.getProps().apply).not.toHaveBeenCalled()
  click(second.host, '应用拖动裁切')
  await settle()
  expect(second.getProps().apply).toHaveBeenCalledExactlyOnceWith(
    null,
    3,
    expect.any(AbortSignal),
    { x: -952500, y: 714375, cx: 7620000, cy: 2381250 },
  )
})
it('maps screen-right keyboard movement through a rotated/flipped local coordinate system', () => {
  const { host, getProps, render } = mount()
  render({
    element: {
      ...getProps().element,
      transform: { ...getProps().element.transform, rot: 90 * 60000, flipH: true },
    },
  })
  // Native R·F: local bottom edge points screen-left. Right arrow trims bottom.
  key(host, 'ArrowRight', 's', true)
  expect(
    Number(host.querySelector('.mimir-pptx-picture-crop-frame')?.getAttribute('height')),
  ).toBeCloseTo(190)
})
it('Escape cancels before the parent Inspector listener, aborts pending and ignores late completion', async () => {
  let resolve!: (accepted: boolean) => void
  const apply = vi.fn<PptxPictureCropCanvasProps['apply']>(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const { host, getProps } = mount({ apply }),
    parent = vi.fn<(event: Event) => void>()
  host.addEventListener('keydown', parent)
  key(host, 'ArrowRight', 'w', true)
  click(host, '应用拖动裁切')
  expect(getProps().onBusy).toHaveBeenLastCalledWith(true)
  parent.mockClear()
  key(host, 'Escape')
  expect(apply.mock.calls[0]![2].aborted).toBe(true)
  expect(parent).not.toHaveBeenCalled()
  expect(getProps().onExit).toHaveBeenCalledTimes(1)
  await act(async () => resolve(true))
  expect(getProps().onExit).toHaveBeenCalledTimes(1)
  expect(host.querySelector('[role="alert"]')).toBeNull()
})
it.each([
  'documentId',
  'slideKey',
  'target',
  'groupRef',
  'width',
  'height',
  'version',
  'disabled',
] as const)(
  'aborts a pending apply when %s changes and never closes a new target from late results',
  async (field) => {
    let resolve!: (accepted: boolean) => void
    const apply = vi.fn<PptxPictureCropCanvasProps['apply']>(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const { host, getProps, render } = mount({ apply })
    key(host, 'ArrowRight', 'w', true)
    click(host, '应用拖动裁切')
    render(
      field === 'documentId'
        ? { documentId: 'other' }
        : field === 'slideKey'
          ? { slideKey: 'slide2.xml' }
          : field === 'target'
            ? { target: { slide: 0, el: 'other' } }
            : field === 'groupRef'
              ? { groupRef: 'other-group' }
              : field === 'width'
                ? { width: 480 }
                : field === 'height'
                  ? { height: 270 }
                  : field === 'version'
                    ? { version: 4 }
                    : { disabled: true },
    )
    expect(apply.mock.calls[0]![2].aborted).toBe(true)
    await act(async () => resolve(true))
    expect(getProps().onExit).not.toHaveBeenCalled()
  },
)
it('reverts an interrupted pointer gesture, preserves a retryable failure, cancels from footer and window blur', async () => {
  const apply = vi.fn<PptxPictureCropCanvasProps['apply']>(async () => false)
  const { host, getProps } = mount({ apply })
  pointer(host, 'pointerdown', 70, 110, 'w')
  pointer(host, 'pointermove', 90, 110)
  pointer(host, 'pointercancel', 90, 110)
  expect(host.querySelector('.mimir-pptx-picture-crop-frame')?.getAttribute('x')).toBe('0')
  key(host, 'ArrowRight', 'w', true)
  click(host, '应用拖动裁切')
  await settle()
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('原图片已保留')
  expect(button(host, '应用拖动裁切').disabled).toBe(false)
  expect(getProps().onExit).not.toHaveBeenCalled()
  click(host, '取消图片拖动裁切')
  expect(getProps().onExit).toHaveBeenCalledTimes(1)
  act(() => window.dispatchEvent(new Event('blur')))
  expect(getProps().onExit).toHaveBeenCalledTimes(1)
})
it('does not reset drafts or abort its own request for a callback identity rerender', async () => {
  let resolve!: (accepted: boolean) => void
  const apply = vi.fn<PptxPictureCropCanvasProps['apply']>(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const { host, render } = mount({ apply })
  key(host, 'ArrowRight', 'w', true)
  click(host, '应用拖动裁切')
  const nextBusy = vi.fn<(busy: boolean) => void>(),
    nextExit = vi.fn<() => void>()
  render({ onBusy: nextBusy, onExit: nextExit })
  expect(apply.mock.calls[0]![2].aborted).toBe(false)
  expect(host.querySelector('.mimir-pptx-picture-crop-frame')?.getAttribute('x')).toBe('10')
  await act(async () => resolve(true))
  expect(nextExit).toHaveBeenCalledTimes(1)
  expect(nextBusy).toHaveBeenLastCalledWith(false)
})

// Independent raw EMU projection: child R37·flipV, parent scale1.5×2,
// then parent R90·flipH. The rendered surface is480×270 over960×720.
const groupFixtureScreen = (x: number, y: number) => {
  const rad = (37 * Math.PI) / 180,
    dx = x - 600000,
    dy = -(y - 400000)
  const nativeX = 2600000 + Math.cos(rad) * dx - Math.sin(rad) * dy
  const nativeY = 1000000 + Math.sin(rad) * dx + Math.cos(rad) * dy
  const gx = (nativeX - 200000) * 1.5 - 3000000
  const gy = (nativeY - 100000) * 2 - 1500000
  return { x: 20 + ((4200000 - gy) / 9525) * 0.5, y: 10 + ((2200000 - gx) / 9525) * 0.375 }
}

it('drags a grouped grip through scaled, rotated, flipped native coordinates without writing until apply', async () => {
  const original = mount().getProps().element
  const element = {
    ...original,
    transform: {
      ...original.transform,
      offset: { x: 2000000, y: 600000, cx: 1200000, cy: 800000 },
      rot: 37 * 60000,
      flipV: true,
    },
  }
  const parent = {
    type: 'group',
    id: 'group',
    anchor: { originalXml: '', range: [0, 0] },
    transform: {
      offset: { x: 1200000, y: 700000, cx: 6000000, cy: 3000000 },
      rot: 90 * 60000,
      flipH: true,
      flipV: false,
    },
    childOffset: { x: 200000, y: 100000, cx: 4000000, cy: 1500000 },
    children: [element],
  } as NonNullable<PptxPictureCropCanvasProps['parent']>
  const { host, getProps } = mount({
    element,
    parent,
    groupRef: 'group-ref',
    target: { slide: 0, el: 'child-ref' },
    height: 720,
    slideHeight: 6858000,
  })
  const start = groupFixtureScreen(0, 400000),
    end = groupFixtureScreen(120000, 400000)
  pointer(host, 'pointerdown', start.x, start.y, 'w')
  pointer(host, 'pointermove', end.x, end.y)
  pointer(host, 'pointerup', end.x, end.y)
  expect(
    Number(host.querySelector('.mimir-pptx-picture-crop-frame')?.getAttribute('x')),
  ).toBeCloseTo(120000 / 9525)
  expect(getProps().apply).not.toHaveBeenCalled()
  click(host, '应用拖动裁切')
  await settle()
  expect(getProps().apply).toHaveBeenCalledExactlyOnceWith(
    { l: 0.1, t: 0, r: 0, b: 0 },
    3,
    expect.any(AbortSignal),
    { x: 2107918, y: 636109, cx: 1080000, cy: 800000 },
  )
})
