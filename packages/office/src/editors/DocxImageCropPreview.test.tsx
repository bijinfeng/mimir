// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DocxImageCropPreview } from './DocxImageCropPreview.js'
import type { DocxImageInsets } from './docx-image.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})
const firePointer = (node: HTMLElement, type: string, x: number, y: number, id = 1) =>
  act(() =>
    node.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
        clientY: y,
        pointerId: id,
      }),
    ),
  )
function setup(width = 240, height = 160) {
  const changed = vi.fn<(value: DocxImageInsets) => void>()
  const escaped = vi.fn<() => void>()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  function Harness() {
    const [insets, setInsets] = useState({ left: 10, top: 5, right: 15, bottom: 20 })
    return (
      <div
        onKeyDown={(e) => {
          if (e.key === 'Escape') escaped()
        }}
      >
        <DocxImageCropPreview
          source="data:image/png;base64,aA=="
          insets={insets}
          disabled={false}
          onChange={(value) => {
            changed(value)
            setInsets(value)
          }}
        />
      </div>
    )
  }
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  act(() => root.render(<Harness />))
  const image = host.querySelector('img')!
  Object.defineProperties(image, {
    naturalWidth: { value: width },
    naturalHeight: { value: height },
  })
  vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({
    left: 30,
    top: 50,
    width: 240,
    height: 160,
  } as DOMRect)
  act(() => image.dispatchEvent(new Event('load')))
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  const button = (name: string) =>
    host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!

  return { host, button, pointer: firePointer, changed, escaped }
}
describe('DOCX image crop preview gestures', () => {
  it('has eight handles plus move, converts actual image content rect, ignores second pointer, restores gesture on Escape first', () => {
    const { host, button, pointer, changed, escaped } = setup()
    expect(host.querySelectorAll('button')).toHaveLength(9)
    const nw = button('裁切左上边界')
    pointer(nw, 'pointerdown', 54, 58)
    pointer(nw, 'pointermove', 150, 130, 2)
    expect(changed).not.toHaveBeenCalled()
    pointer(nw, 'pointermove', 150, 130)
    expect(changed.mock.calls.at(-1)![0].left).toBeCloseTo(50)
    expect(changed.mock.calls.at(-1)![0].top).toBeCloseTo(50)
    act(() => nw.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(changed.mock.calls.at(-1)![0].left).toBeCloseTo(10)
    expect(escaped).not.toHaveBeenCalled()
    act(() => nw.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(escaped).toHaveBeenCalledOnce()
  })
  it('keyboard moves one or ten original pixels, and pointer cancel restores the initial region', () => {
    const { button, pointer, changed } = setup()
    const east = button('裁切右侧边界')
    act(() =>
      east.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
      ),
    )
    expect(changed.mock.calls.at(-1)![0].right).toBeCloseTo(15 - 1000 / 240)
    const move = button('移动保留区域')
    pointer(move, 'pointerdown', 80, 80)
    pointer(move, 'pointermove', -1000, -1000)
    expect(changed.mock.calls.at(-1)![0].left).toBe(0)
    pointer(move, 'pointercancel', -1000, -1000)
    expect(changed.mock.calls.at(-1)![0].left).toBeCloseTo(10)
    pointer(move, 'pointerdown', 80, 80)
    pointer(move, 'pointermove', -1000, -1000)
    act(() => window.dispatchEvent(new Event('blur')))
    expect(changed.mock.calls.at(-1)![0].left).toBeCloseTo(10)
  })
  it('ignores cancellation and capture loss from a pointer that does not own the active gesture', () => {
    const { button, pointer, changed } = setup()
    const west = button('裁切左侧边界')
    pointer(west, 'pointerdown', 54, 58)
    pointer(west, 'pointermove', 78, 58)
    expect(changed.mock.calls.at(-1)![0].left).toBeCloseTo(20)
    pointer(west, 'pointercancel', 78, 58, 2)
    expect(changed.mock.calls.at(-1)![0].left).toBeCloseTo(20)
    pointer(west, 'lostpointercapture', 78, 58, 2)
    pointer(west, 'pointermove', 102, 58)
    expect(changed.mock.calls.at(-1)![0].left).toBeCloseTo(30)
    pointer(west, 'pointercancel', 102, 58)
    expect(changed.mock.calls.at(-1)![0].left).toBeCloseTo(10)
  })
  it.each([
    [4000, 200, '3600'],
    [200, 4000, '9'],
  ])(
    'fits %s×%s image with its intrinsic ratio and no forced minimum image height',
    (width, height, fitted) => {
      const { host } = setup(width, height)
      expect(host.querySelector<HTMLElement>('.mimir-docx-crop')!.style.maxWidth).toContain(
        `${fitted}px`,
      )
      expect(host.querySelector('img')!.getAttribute('style')).toBeNull()
    },
  )
})
