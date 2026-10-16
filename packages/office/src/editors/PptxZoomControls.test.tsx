/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import { PptxZoomControls, type PptxZoomControlsProps } from './PptxZoomControls.js'
import { openPptxForEdit } from '../pptx.js'
import { pptxSummaryZoomFrames, pptxSummaryZoomSections, pptxZoomGroups } from '../pptx-zoom.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const fixture = new Uint8Array(readFileSync(resolve(rootDir, 'tests/fixtures/title-layout.pptx')))
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X9WQAAAAASUVORK5CYII='
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.restoreAllMocks()
})
async function settle() {
  await act(async () => {
    await new Promise((done) => setTimeout(done, 0))
  })
}
async function setup(overrides: Partial<PptxZoomControlsProps> = {}) {
  const session = await openPptxForEdit(fixture)
  session.duplicate(0)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const applyZoom = vi.fn<PptxZoomControlsProps['applyZoom']>(async () => true)
  const snapshot = vi.fn<NonNullable<PptxZoomControlsProps['snapshot']>>(async () => png)
  let props: PptxZoomControlsProps = {
    deck: session.view(),
    sections: [],
    slideIndex: 0,
    version: 0,
    applyZoom,
    snapshot,
    ...overrides,
  }
  const render = (patch: Partial<PptxZoomControlsProps> = {}) => {
    props = { ...props, ...patch }
    act(() =>
      root.render(
        <ConfigProvider componentSize="small">
          <PptxZoomControls {...props} />
        </ConfigProvider>,
      ),
    )
  }
  render()
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  const click = (label: string) => {
    const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
    if (!button) throw new Error(`Missing ${label}`)
    act(() => button.click())
  }
  const select = (index: number) => {
    const button = host.querySelectorAll<HTMLButtonElement>('.mimir-pptx-zoom__list button')[index]!
    act(() => button.click())
  }
  return { host, click, select, settle, applyZoom, snapshot, render, session }
}
it('shows named pages/current selection/preview and sends sorted targets from the current unsaved canvas once', async () => {
  const view = await setup()
  expect(view.host.querySelector('[aria-label="插入缩放导航"]')?.textContent).toBe('插入缩放导航')
  expect(view.host.querySelector('[aria-label="插入缩放导航"] svg')).not.toBeNull()
  expect(view.host.querySelector('[aria-label="插入缩放导航"]')?.hasAttribute('disabled')).toBe(
    true,
  )
  view.select(1)
  view.select(0)
  expect(view.host.textContent).toContain('已选 2 / 24')
  expect(view.host.querySelector('[aria-label="第 1 页快照预览"] svg')).not.toBeNull()
  view.click('插入缩放导航')
  view.click('插入缩放导航')
  await view.settle()
  expect(view.snapshot.mock.calls.map((call) => (call as unknown[])[1])).toEqual([0, 1])
  expect(view.applyZoom).toHaveBeenCalledTimes(1)
  expect(view.applyZoom).toHaveBeenCalledWith(
    {
      mode: 'slide',
      slide: 0,
      targets: [
        { slide: 0, png },
        { slide: 1, png },
      ],
    },
    expect.any(AbortSignal),
  )
  expect(view.host.textContent).toContain('已选 0 / 24')
})
it('offers current section ranges, excludes empty sections, and clears choices on mode change', async () => {
  const view = await setup({
    sections: [
      { id: 'a', name: '分析', slideIndices: [1] },
      { id: 'empty', name: '空节', slideIndices: [] },
    ],
  })
  view.select(0)
  pickSelectOption(view.host, '缩放导航类型', '节缩放')
  expect(view.host.textContent).toContain('已选 0 / 24')
  expect(view.host.querySelector('.mimir-pptx-zoom__list')?.textContent).toContain('默认节')
  expect(view.host.querySelector('.mimir-pptx-zoom__list')?.textContent).toContain('分析')
  expect(view.host.querySelector('.mimir-pptx-zoom__list')?.textContent).not.toContain('空节')
  view.select(1)
  view.click('插入缩放导航')
  await view.settle()
  expect(view.applyZoom).toHaveBeenCalledWith(
    { mode: 'section', slide: 0, targets: [{ slide: 1, png }] },
    expect.any(AbortSignal),
  )
})
it('cancels a snapshot on page/version change, ignores late results and never sends an old target', async () => {
  let finish: ((value: string) => void) | undefined
  let signal: AbortSignal | undefined
  const snapshot = vi.fn<NonNullable<PptxZoomControlsProps['snapshot']>>(
    (_deck, _index, current) => {
      signal = current
      return new Promise((done) => {
        finish = done
      })
    },
  )
  const view = await setup({ snapshot })
  view.select(1)
  view.click('插入缩放导航')
  expect(view.host.querySelector('fieldset')?.getAttribute('aria-busy')).toBe('true')
  expect(view.host.querySelector('[aria-label="插入缩放导航"]')?.textContent).toBe('插入缩放导航')
  expect(view.host.querySelector('[aria-label="插入缩放导航"] svg')).not.toBeNull()
  view.render({ version: 1, slideIndex: 1 })
  expect(signal?.aborted).toBe(true)
  await act(async () => finish!(png))
  expect(view.applyZoom).not.toHaveBeenCalled()
  expect(view.host.textContent).toContain('已选 0 / 24')
})
it('reports snapshot failure without executing a partial insert and leaves selection available for retry', async () => {
  const view = await setup({
    snapshot: async () => {
      throw new Error('快照生成失败')
    },
  })
  view.select(1)
  view.click('插入缩放导航')
  await view.settle()
  expect(view.host.querySelector('[role="alert"]')?.textContent).toContain('快照生成失败')
  expect(view.applyZoom).not.toHaveBeenCalled()
  expect(view.host.textContent).toContain('已选 1 / 24')
  expect(view.host.querySelector('[aria-label="插入缩放导航"]')?.hasAttribute('disabled')).toBe(
    false,
  )
})
it('keeps summary section IDs and complete contiguous ranges and lays out every thumbnail inside its body box', () => {
  const sections = [{ id: 'keep', name: '现有节', slideIndices: [2, 3] }]
  expect(pptxZoomGroups(sections, 4)).toEqual([
    { id: '', name: '默认节', start: 0, end: 2 },
    { id: 'keep', name: '现有节', start: 2, end: 4 },
  ])
  expect(pptxSummaryZoomSections(sections, 4, [0, 2], (index) => `标题${index}`)).toEqual([
    { id: '', name: '摘要节', slideIndices: [0] },
    { id: '', name: '标题0', slideIndices: [1, 2] },
    { id: 'keep', name: '现有节', slideIndices: [3, 4] },
  ])
  for (let count = 1; count <= 24; count++) {
    const box = { x: 100, y: 150, w: 800, h: 400 }
    const frames = pptxSummaryZoomFrames(count, box, 16 / 9)
    expect(frames).toHaveLength(count)
    for (const frame of frames) {
      expect(frame.x).toBeGreaterThanOrEqual(box.x)
      expect(frame.y).toBeGreaterThanOrEqual(box.y)
      expect(frame.x + frame.w).toBeLessThanOrEqual(box.x + box.w)
      expect(frame.y + frame.h).toBeLessThanOrEqual(box.y + box.h)
    }
  }
})
