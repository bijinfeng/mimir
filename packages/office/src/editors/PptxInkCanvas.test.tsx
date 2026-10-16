/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PptxInkCanvas, type PptxInkCanvasProps } from './PptxInkCanvas.js'
import { encodeInkPayload, INK_NAME_PREFIX } from '../pptx-ink.js'
import type { RenderSlide } from '../../vendor/packages/pptx-render/src/render-tree.js'

const tree = { nodes: [] } as unknown as RenderSlide
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})
function mount(patch: Partial<PptxInkCanvasProps> = {}) {
  const host = document.createElement('div')
  host.className = 'mimir-editor'
  document.body.append(host)
  const root = createRoot(host)
  let props: PptxInkCanvasProps = {
    slide: 0,
    version: 0,
    tree,
    width: 960,
    height: 540,
    tool: 'pen',
    preset: { tool: 'pen', color: '0070C0', width: 3.5 },
    disabled: false,
    apply: vi.fn<PptxInkCanvasProps['apply']>(async () => true),
    onBusy: vi.fn<(busy: boolean) => void>(),
    onExit: vi.fn<() => void>(),
    ...patch,
  }
  const render = (next: Partial<PptxInkCanvasProps>) => {
    props = { ...props, ...next }
    act(() => root.render(<PptxInkCanvas {...props} />))
    setup()
  }
  const setup = () => {
    const svg = host.querySelector('svg')!
    if (svg) {
      svg.getBoundingClientRect = () => ({
        x: 20,
        y: 10,
        left: 20,
        top: 10,
        width: 480,
        height: 270,
        right: 500,
        bottom: 280,
        toJSON: () => null,
      })
      svg.setPointerCapture = vi.fn<(pointerId: number) => void>()
      svg.releasePointerCapture = vi.fn<(pointerId: number) => void>()
    }
  }
  render({})
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return { host, render, props }
}
function pointer(host: HTMLElement, kind: string, x = 50, y = 50, id = 1) {
  const svg = host.querySelector('svg')!
  act(() =>
    svg.dispatchEvent(
      new PointerEvent(kind, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId: id,
        isPrimary: true,
        button: 0,
      }),
    ),
  )
}
function rasterMock() {
  const ctx = {
    scale: vi.fn<(...args: number[]) => void>(),
    beginPath: vi.fn<(...args: number[]) => void>(),
    moveTo: vi.fn<(...args: number[]) => void>(),
    lineTo: vi.fn<(...args: number[]) => void>(),
    stroke: vi.fn<(...args: number[]) => void>(),
    globalAlpha: 1,
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA')
  return ctx
}
async function settle() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}
describe('PPTX pointer ink', () => {
  it('samples scaled page coordinates and commits pen/highlighter once, with alpha preserved in PNG rasterization', async () => {
    const ctx = rasterMock(),
      mounted = mount({
        tool: 'highlighter',
        preset: { tool: 'highlighter', color: 'FFFF00', width: 10 },
      })
    pointer(mounted.host, 'pointerdown', 70, 60)
    pointer(mounted.host, 'pointermove', 100, 80)
    pointer(mounted.host, 'pointerup', 110, 90)
    await settle()
    expect(mounted.props.apply).toHaveBeenCalledTimes(1)
    const [input, version, signal] = vi.mocked(mounted.props.apply).mock.calls[0]!
    expect(input).toMatchObject({
      kind: 'add',
      slide: 0,
      fitWidthPx: 960,
      stroke: {
        tool: 'highlighter',
        width: 10,
        color: 'FFFF00',
        points: [
          { x: 100, y: 100 },
          { x: 160, y: 140 },
          { x: 180, y: 160 },
        ],
      },
    })
    expect(version).toBe(0)
    expect(signal.aborted).toBe(false)
    expect(ctx.globalAlpha).toBe(0.45)
    expect(mounted.props.onBusy).toHaveBeenNthCalledWith(1, true)
    expect(mounted.props.onBusy).toHaveBeenLastCalledWith(false)
  })
  it('cancels pointercancel, blur, source-version/page/tool changes and Escape without applying', async () => {
    rasterMock()
    const { host, render, props } = mount()
    pointer(host, 'pointerdown')
    pointer(host, 'pointercancel')
    pointer(host, 'pointerup')
    pointer(host, 'pointerdown')
    act(() =>
      host.querySelector('svg')!.dispatchEvent(new FocusEvent('focusout', { bubbles: true })),
    )
    pointer(host, 'pointerup')
    pointer(host, 'pointerdown')
    render({ version: 1 })
    pointer(host, 'pointerup')
    pointer(host, 'pointerdown')
    render({ slide: 1 })
    pointer(host, 'pointerup')
    pointer(host, 'pointerdown')
    render({ tool: 'highlighter' })
    pointer(host, 'pointerup')
    pointer(host, 'pointerdown')
    act(() =>
      host
        .querySelector('svg')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    )
    pointer(host, 'pointerup')
    await settle()
    expect(props.apply).not.toHaveBeenCalled()
    expect(props.onExit).toHaveBeenCalledTimes(1)
  })
  it('rejects a second pointer, prevents pending re-entry, aborts late result after changing page, and displays failure', async () => {
    rasterMock()
    let done!: (value: boolean) => void
    const apply = vi.fn<PptxInkCanvasProps['apply']>(
      () =>
        new Promise<boolean>((resolve) => {
          done = resolve
        }),
    )
    const { host, render } = mount({ apply })
    pointer(host, 'pointerdown')
    pointer(host, 'pointermove', 200, 200, 2)
    pointer(host, 'pointerup', 220, 220, 2)
    expect(apply).not.toHaveBeenCalled()
    pointer(host, 'pointerup')
    await settle()
    pointer(host, 'pointerdown')
    pointer(host, 'pointerup')
    expect(apply).toHaveBeenCalledTimes(1)
    const signal = apply.mock.calls[0]![2] as AbortSignal
    render({ slide: 2 })
    expect(signal.aborted).toBe(true)
    await act(async () => done(false))
    expect(host.querySelector('[role="alert"]')).toBeNull()
    render({ apply: vi.fn<PptxInkCanvasProps['apply']>(async () => false) })
    pointer(host, 'pointerdown')
    pointer(host, 'pointerup')
    await settle()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('原有内容已保留')
  })
  it('hits a stroke crossed between fast samples and sends only own ink ids in one atomic erase', async () => {
    const payload = encodeInkPayload({
      tool: 'pen',
      color: '000000',
      width: 2,
      points: [
        { x: 2, y: 2 },
        { x: 2, y: 82 },
      ],
    })
    const inkTree = {
      nodes: [
        {
          id: 'ink',
          sourceId: 'pic-1',
          durableId: 'e_ink',
          type: 'picture',
          name: `${INK_NAME_PREFIX} test`,
          descr: payload,
          box: { x: 100, y: 100, w: 4, h: 84 },
        },
        {
          id: 'regular',
          sourceId: 'regular',
          type: 'picture',
          name: '普通图片',
          box: { x: 0, y: 0, w: 960, h: 540 },
        },
      ],
    } as unknown as RenderSlide
    const { host, props } = mount({ tree: inkTree, tool: 'eraser' })
    pointer(host, 'pointerdown', 40, 85)
    pointer(host, 'pointermove', 160, 85)
    pointer(host, 'pointerup', 180, 85)
    await settle()
    expect(props.apply).toHaveBeenCalledExactlyOnceWith(
      { kind: 'erase', slide: 0, ids: ['e_ink'] },
      0,
      expect.any(AbortSignal),
    )
  })
})
