/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import { openPptx, savePptx, elementSpid } from '../../vendor/packages/pptx-engine/src/index.js'
import { elementDurableId } from '../../vendor/packages/pptx-engine/src/identity.js'
import { runTxn } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import { openPptxForEdit } from '../pptx.js'
import { renderSlide } from '../pptx-render.js'
import { PptxAnimationGallery } from './PptxAnimationGallery.js'
import {
  PptxAnimationPreview,
  pptxAnimationFrames,
  pptxMotionPoints,
  pptxPreviewSchedule,
} from './PptxAnimationPreview.js'
import type { PptxManualAnimation } from '../../../shared/src/pptx-animation.js'
import type { PptxAnimationPreviewRequest } from './PptxAnimationPreview.js'
import { SlidePlaybackControls } from './PptxAdvancedControls.js'
import {
  PPTX_MOTION_PRESETS,
  pptxAnimationDefaultDuration,
  pptxAnimationItems,
  pptxAnimationParagraphCount,
} from './pptx-animation-tools.js'
const fixture = new Uint8Array(
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures/title-layout.pptx'),
  ),
)
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.useRealTimers()
  vi.restoreAllMocks()
})
async function deck() {
  const opened = await openPptx(fixture),
    element = opened.deck.slides[0]!.elements[0]!
  expect(
    runTxn(opened, {
      isolation: 'atomic',
      ops: [
        {
          op: 'setText',
          target: { slide: 0, el: element.id },
          paragraphs: [
            { runs: [{ text: '第一段文字 '.repeat(20) }] },
            { runs: [{ text: '第二段' }] },
            { runs: [{ text: '第三段' }] },
          ],
        },
        { op: 'addAnimation', target: { slide: 0, el: element.id }, effect: 'pulse' },
      ],
    }).applied,
  ).toBe(true)
  return openPptxForEdit(await savePptx(opened))
}
function mount(node: React.ReactNode) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const render = (value: React.ReactNode) =>
    act(() => root.render(<ConfigProvider componentSize="small">{value}</ConfigProvider>))
  render(node)
  const dispose = () => {
    act(() => root.unmount())
    host.remove()
  }
  cleanup.push(dispose)
  return { host, render, dispose }
}
function button(host: HTMLElement, label: string) {
  const node = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!node) throw new Error(`missing ${label}`)
  return node
}
function tab(host: HTMLElement, label: string) {
  const node = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (item) => item.textContent === label,
  )!
  act(() => node.click())
}
it('counts model paragraphs rather than wrapped lines, gives pinned defaults and five curved presets', async () => {
  const session = await deck(),
    slide = session.slides()[0]!,
    element = slide.elements[0]!
  expect(pptxAnimationParagraphCount(element)).toBe(3)
  expect(
    pptxAnimationItems(slide, elementDurableId(element)!, {
      effect: 'bounce',
      byParagraph: true,
    }).map((item) => [item.paragraph, item.durationMs]),
  ).toEqual([
    [0, 2000],
    [1, 2000],
    [2, 2000],
  ])
  expect(
    ['appear', 'fade', 'spin', 'pulse', 'mediaPlay'].map((effect) =>
      pptxAnimationDefaultDuration(effect as 'fade'),
    ),
  ).toEqual([0, 500, 2000, 1000, 0])
  const circle = PPTX_MOTION_PRESETS[3]
  const points = pptxMotionPoints(circle.path)
  expect(points.length).toBeGreaterThan(90)
  expect(points.at(-1)).toEqual({ x: 0, y: 0 })
  expect(points.some((point) => point.x < -0.12)).toBe(true)
  const frames = pptxAnimationFrames(
    {
      spid: 1,
      effect: 'motionPath',
      trigger: 'onClick',
      durationMs: 2000,
      delayMs: 0,
      motionPath: circle.path,
    },
    1000,
    500,
  )
  expect(frames.length).toBeGreaterThan(90)
  expect(frames.at(-1)?.translate).toBe('0px 0px')
  expect(frames.some((frame) => frame.translate !== '0px 0px')).toBe(true)
})
it('gallery replaces, none removes, add preserves and paths append; delayed hover/focus never writes', async () => {
  const session = await deck(),
    slide = session.slides()[0]!,
    target = { slide: 0, el: elementDurableId(slide.elements[0]!)! }
  const run = vi.fn<(input: PptxManualAnimation) => Promise<boolean>>(async () => true),
    preview = vi.fn<(request: PptxAnimationPreviewRequest | null) => void>()
  const { host, dispose } = mount(
    <PptxAnimationGallery
      slide={slide}
      target={target}
      busy={false}
      run={run}
      onPreview={preview}
    />,
  )
  vi.useFakeTimers()
  const fade = button(host, '替换为淡入动画')
  act(() => fade.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })))
  act(() => vi.advanceTimersByTime(349))
  expect(preview.mock.calls.filter(([request]) => request)).toHaveLength(0)
  act(() => vi.advanceTimersByTime(1))
  expect(preview.mock.lastCall?.[0]?.items?.[0]?.effect).toBe('fade')
  expect(run).not.toHaveBeenCalled()
  act(() => fade.dispatchEvent(new PointerEvent('pointerout', { bubbles: true })))
  expect(preview.mock.lastCall?.[0]).toBeNull()
  act(() => host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
  await act(async () => button(host, '无动画').click())
  expect(run.mock.lastCall?.[0]).toEqual({
    kind: 'animation',
    slide: 0,
    elementId: target.el,
    operation: 'remove',
  })
  await act(async () => fade.click())
  expect(run.mock.lastCall?.[0]).toMatchObject({
    operation: 'replace',
    effect: 'fade',
    byParagraph: true,
  })
  await act(async () => button(host, '为选中对象添加动画').click())
  expect(run.mock.lastCall?.[0]).toMatchObject({
    operation: 'add',
    effect: 'fade',
    byParagraph: true,
    durationMs: 500,
  })
  for (const preset of PPTX_MOTION_PRESETS) {
    await act(async () => button(host, `添加${preset.label}运动路径`).click())
    expect(run.mock.lastCall?.[0]).toMatchObject({
      operation: 'add',
      effect: 'motionPath',
      motionPath: preset.path,
    })
    expect(run.mock.lastCall?.[0]).not.toHaveProperty('byParagraph')
  }
  act(() => fade.focus())
  act(() => vi.advanceTimersByTime(350))
  expect(preview.mock.lastCall?.[0]?.items).toHaveLength(3)
  act(() => fade.blur())
  expect(preview.mock.lastCall?.[0]).toBeNull()
  dispose()
  expect(preview.mock.lastCall?.[0]).toBeNull()
})
it('manual long operation is single pending request; unmount aborts and stale completion publishes no new state', async () => {
  const session = await deck(),
    slide = session.slides()[0]!,
    target = { slide: 0, el: elementDurableId(slide.elements[0]!)! }
  let finish!: (ok: boolean) => void
  const applyAnimation = vi.fn<(input: unknown, signal: AbortSignal) => Promise<boolean>>(
    (_input: unknown, _signal: AbortSignal) =>
      new Promise<boolean>((resolvePending) => {
        finish = resolvePending
      }),
  )
  const { host, dispose } = mount(
    <SlidePlaybackControls
      slide={slide}
      index={0}
      notes=""
      target={target}
      apply={async () => true}
      slideCount={55}
      applyAnimation={applyAnimation}
    />,
  )
  tab(host, '切换')
  act(() => button(host, '将本页切换应用到全部幻灯片').click())
  expect(applyAnimation).toHaveBeenCalledTimes(1)
  expect(applyAnimation.mock.calls[0]![0]).toEqual({ kind: 'transition-all', slide: 0 })
  expect(button(host, '将本页切换应用到全部幻灯片').disabled).toBe(true)
  dispose()
  expect(applyAnimation.mock.calls[0]![1].aborted).toBe(true)
  await act(async () => finish(true))
  expect(applyAnimation).toHaveBeenCalledTimes(1)
})
it('preview targets semantic paragraph in actual SVG, restores styles and cancels on selection/version/Escape without dirty/history', async () => {
  const session = await deck(),
    slide = session.slides()[0]!,
    element = slide.elements[0]!,
    spid = elementSpid(element)!
  const canvas = document.createElement('div')
  canvas.innerHTML = renderSlide(session.view(), 0, {
    fitWidthPx: 300,
    svgIdPrefix: 'paragraph-test',
  })!.svg
  document.body.append(canvas)
  cleanup.push(() => canvas.remove())
  const shape = [...canvas.querySelectorAll<SVGElement>('[data-element-id]')].find(
    (node) => node.dataset.elementId === element.id,
  )!
  expect(shape.querySelectorAll('[data-pptx-paragraph]')).toHaveLength(3)
  const ref = createRef<HTMLElement>()
  ref.current = canvas
  const cancels: ReturnType<typeof vi.fn<() => void>>[] = [],
    targets: SVGElement[] = []
  Object.defineProperty(SVGElement.prototype, 'animate', {
    configurable: true,
    value: function (this: SVGElement) {
      targets.push(this)
      const cancel = vi.fn<() => void>()
      cancels.push(cancel)
      return { cancel }
    },
  })
  cleanup.push(() => {
    delete (SVGElement.prototype as { animate?: unknown }).animate
  })
  const onEnd = vi.fn<() => void>(),
    request = {
      token: 1,
      items: [
        {
          spid,
          effect: 'fade' as const,
          trigger: 'onClick' as const,
          durationMs: 500,
          delayMs: 0,
          paragraph: 1,
        },
      ],
    }
  const { render } = mount(
    <PptxAnimationPreview
      host={ref}
      slide={slide}
      version={0}
      selectionKey="a"
      request={request}
      onEnd={onEnd}
    />,
  )
  expect(targets).toHaveLength(1)
  expect(targets[0]!.dataset.pptxParagraph).toBe('1')
  expect(targets[0]!.style.transformOrigin).toBe('center')
  render(
    <PptxAnimationPreview
      host={ref}
      slide={slide}
      version={1}
      selectionKey="a"
      request={request}
      onEnd={onEnd}
    />,
  )
  expect(cancels[0]).toHaveBeenCalledOnce()
  expect(targets).toHaveLength(1)
  expect(targets[0]!.hasAttribute('style')).toBe(false)
  render(
    <PptxAnimationPreview
      host={ref}
      slide={slide}
      version={1}
      selectionKey="b"
      request={{ ...request, token: 2 }}
      onEnd={onEnd}
    />,
  )
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(cancels[1]).toHaveBeenCalledOnce()
  expect(onEnd).toHaveBeenCalled()
  expect(session.hasChanges()).toBe(false)
  expect(session.version()).toBe(0)
})
it('preview completion and window blur restore author styles exactly and call onEnd only once', async () => {
  const session = await deck(),
    slide = session.slides()[0]!,
    element = slide.elements[0]!,
    spid = elementSpid(element)!
  const canvas = document.createElement('div')
  canvas.innerHTML = `<svg viewBox="0 0 1000 500"><g data-element-id="${element.id}" style="opacity: .7"><text>原文</text></g></svg>`
  document.body.append(canvas)
  cleanup.push(() => canvas.remove())
  const ref = createRef<HTMLElement>()
  ref.current = canvas
  const cancel = vi.fn<() => void>(),
    onEnd = vi.fn<() => void>()
  const animate = vi.fn<
    (frames: Keyframe[], options: KeyframeAnimationOptions) => { cancel: typeof cancel }
  >(() => ({ cancel }))
  Object.defineProperty(SVGElement.prototype, 'animate', { configurable: true, value: animate })
  cleanup.push(() => {
    delete (SVGElement.prototype as { animate?: unknown }).animate
  })
  const items = [
    { spid, effect: 'spin' as const, trigger: 'onClick' as const, durationMs: 500, delayMs: 0 },
    {
      spid,
      effect: 'fadeOut' as const,
      trigger: 'afterPrev' as const,
      durationMs: 500,
      delayMs: 0,
    },
  ]
  vi.useFakeTimers()
  const { render } = mount(
    <PptxAnimationPreview
      host={ref}
      slide={slide}
      version={0}
      selectionKey="x"
      request={{ token: 1, items }}
      onEnd={onEnd}
    />,
  )
  expect(animate).toHaveBeenCalledTimes(1)
  expect(animate.mock.calls[0]![1].fill).toBe('forwards')
  act(() => vi.advanceTimersByTime(499))
  expect(animate).toHaveBeenCalledTimes(1)
  act(() => vi.advanceTimersByTime(1))
  expect(animate).toHaveBeenCalledTimes(2)
  act(() => vi.advanceTimersByTime(650))
  expect(cancel).toHaveBeenCalledTimes(2)
  expect(onEnd).toHaveBeenCalledTimes(1)
  expect(canvas.querySelector('g')!.getAttribute('style')).toBe('opacity: .7')
  render(
    <PptxAnimationPreview
      host={ref}
      slide={slide}
      version={0}
      selectionKey="x"
      request={{ token: 2, items }}
      onEnd={onEnd}
    />,
  )
  act(() => window.dispatchEvent(new Event('blur')))
  act(() => vi.advanceTimersByTime(650))
  expect(cancel).toHaveBeenCalledTimes(3)
  expect(animate).toHaveBeenCalledTimes(3)
  expect(onEnd).toHaveBeenCalledTimes(2)
  expect(canvas.querySelector('g')!.getAttribute('style')).toBe('opacity: .7')
})
const make = (trigger: 'onClick' | 'withPrev' | 'afterPrev', durationMs: number, delayMs = 0) => ({
  spid: 1,
  effect: 'spin' as const,
  trigger,
  durationMs,
  delayMs,
})
it('step preview respects with/after timing and reduced motion removes path/rotation movement', () => {
  expect(
    pptxPreviewSchedule([
      make('onClick', 500, 10),
      make('withPrev', 100, 20),
      make('afterPrev', 200, 30),
      make('onClick', 100),
    ]).map((item) => item.startMs),
  ).toEqual([10, 30, 160, 690])
  expect(pptxAnimationFrames(make('onClick', 2000), 1000, 500, true)).toEqual([
    { opacity: 1 },
    { opacity: 1 },
  ])
})
