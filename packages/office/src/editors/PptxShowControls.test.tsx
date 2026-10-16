/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import { openPptxForEdit } from '../pptx.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
import { openPptx, savePptx } from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn, type Op } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import { PptxShowControls, type PptxShowControlsProps } from './PptxShowControls.js'
import { PptxPresentation } from './PptxPresentation.js'
import {
  pptxPlayOrder,
  pptxReadCustomShows,
  pptxRehearsalOps,
  pptxRehearsalVisit,
  pptxShowIndices,
  type PptxRehearsalResult,
} from './pptx-show.js'

const bytes = new Uint8Array(
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures/title-layout.pptx'),
  ),
)
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
})
async function deck() {
  const original = await openPptxForEdit(bytes)
  original.duplicate(0)
  original.duplicate(1)
  return openPptxForEdit(await original.save())
}
function mount(content: React.ReactNode) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const render = (node: React.ReactNode) =>
    act(() => root.render(<ConfigProvider componentSize="small">{node}</ConfigProvider>))
  render(content)
  const dispose = () => {
    act(() => root.unmount())
    host.remove()
  }
  cleanup.push(dispose)
  return { host, render }
}
function click(host: HTMLElement, name: string) {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)
  if (!button) throw new Error(`Missing ${name}`)
  act(() => button.click())
}
function text(host: HTMLElement, name: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function key(value: string) {
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })))
}

it('filters stale and hidden show pages and retains path based custom order across reorder', () => {
  const slides = [
    { path: 'a', bodyPrefix: '' },
    { path: 'b', bodyPrefix: 'show="0"' },
    { path: 'c', bodyPrefix: '' },
  ]
  expect(pptxPlayOrder(slides, 0, [2, 1, 0, 2, 90])).toEqual([2, 0])
  expect(pptxPlayOrder(slides, 1)).toEqual([0, 1, 2])
  expect(pptxPlayOrder(slides, -1)).toEqual([])
  const show = { id: 'one', name: '客户', slidePaths: ['c', 'a', 'gone'] }
  expect(pptxShowIndices(show, [slides[2]!, slides[1]!, slides[0]!])).toEqual([0, 2])
  expect(pptxReadCustomShows(JSON.stringify([show, null, { name: 'bad' }]))).toEqual([show])
  expect(pptxReadCustomShows('{')).toEqual([])
})
it('accumulates revisit and last dwell and rounds visited pages without inventing unvisited timings', () => {
  let clock = { current: 0, enteredAt: 0, perPageMs: [0, 0, 0] }
  clock = pptxRehearsalVisit(clock, 2, 1200)
  clock = pptxRehearsalVisit(clock, 0, 3500)
  clock = pptxRehearsalVisit(clock, -1, 4400)
  expect(clock.perPageMs).toEqual([2100, 0, 2300])
  expect(
    pptxRehearsalOps({ version: 0, slidePaths: ['a', 'b', 'c'], perPageMs: clock.perPageMs }),
  ).toEqual([
    { op: 'setAdvanceTime', target: { slide: 0 }, ms: 2000 },
    { op: 'setAdvanceTime', target: { slide: 2 }, ms: 2000 },
  ])
})
it('saves named custom shows locally, reorders playback and does not edit the original', async () => {
  const session = await deck()
  const onStart = vi.fn<PptxShowControlsProps['onStart']>(),
    apply = vi.fn<PptxShowControlsProps['apply']>()
  const props: PptxShowControlsProps = {
    documentId: 'show-test',
    slides: session.slides(),
    version: session.version(),
    rehearsal: null,
    onDismissRehearsal: vi.fn<() => void>(),
    onStart,
    apply,
  }
  const ui = mount(<PptxShowControls {...props} />)
  text(ui.host, '列表名称', '客户演示')
  const checkboxes = ui.host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
  act(() => {
    checkboxes[0]!.click()
    checkboxes[2]!.click()
  })
  click(ui.host, '上移幻灯片 3')
  click(ui.host, '保存放映列表')
  expect(
    pptxReadCustomShows(localStorage.getItem('mimir:pptx-custom-shows:show-test'))[0],
  ).toMatchObject({
    name: '客户演示',
    slidePaths: [session.slides()[2]!.path, session.slides()[0]!.path],
  })
  expect(ui.host.querySelector('[aria-label="播放自定义放映"]')?.textContent).toBe('播放自定义放映')
  click(ui.host, '播放自定义放映')
  expect(onStart).toHaveBeenLastCalledWith(
    { start: 2, slideIndices: [2, 0] },
    ui.host.querySelector('button[aria-label="播放自定义放映"]'),
  )
  expect(apply).not.toHaveBeenCalled()
  expect(session.hasChanges()).toBe(false)
  ui.render(<PptxShowControls {...props} documentId="another" />)
  expect(ui.host.querySelector<HTMLInputElement>('input[aria-label="列表名称"]')!.value).toBe('')
  ui.render(<PptxShowControls {...props} />)
  await pickSelectOption(ui.host, '放映列表', '客户演示')
  expect(ui.host.querySelector<HTMLInputElement>('input[aria-label="列表名称"]')!.value).toBe(
    '客户演示',
  )
  click(ui.host, '播放自定义放映')
  expect(onStart).toHaveBeenLastCalledWith(
    { start: 2, slideIndices: [2, 0] },
    ui.host.querySelector('button[aria-label="播放自定义放映"]'),
  )
})
it('presents actual final dwell for explicit application, applies one atomic batch and preserves two-save native timings', async () => {
  let session = await deck()
  let source = await session.save()
  const originalZip = await JSZip.loadAsync(source)
  const result: PptxRehearsalResult = {
    version: session.version(),
    slidePaths: session.slides().map((slide) => slide.path),
    perPageMs: [2100, 0, 4300],
  }
  const dismiss = vi.fn<() => void>()
  const apply = vi.fn<PptxShowControlsProps['apply']>(async (ops: Record<string, unknown>[]) => {
    const model = await openPptx(source)
    const txn = runTxn(model, { isolation: 'atomic', ops: ops as Op[] })
    expect(txn.applied).toBe(true)
    source = await savePptx(model)
    session = await openPptxForEdit(source)
    return true
  })
  const props: PptxShowControlsProps = {
    documentId: 'times',
    slides: session.slides(),
    version: session.version(),
    rehearsal: result,
    onDismissRehearsal: dismiss,
    onStart: vi.fn<PptxShowControlsProps['onStart']>(),
    apply,
  }
  const ui = mount(<PptxShowControls {...props} />)
  expect(ui.host.textContent).toContain('已记录 2 页')
  expect(apply).not.toHaveBeenCalled()
  click(ui.host, '应用排练计时')
  await act(async () => {
    await vi.waitFor(() => expect(dismiss).toHaveBeenCalledOnce())
  })
  expect(apply).toHaveBeenCalledOnce()
  const first = await session.save()
  session.commit()
  const second = await session.save()
  for (const saved of [first, second]) {
    const zip = await JSZip.loadAsync(saved)
    expect(await zip.file(result.slidePaths[0]!)!.async('string')).toContain('advTm="2000"')
    expect(await zip.file(result.slidePaths[1]!)!.async('string')).not.toContain('advTm=')
    expect(await zip.file(result.slidePaths[2]!)!.async('string')).toContain('advTm="4000"')
    expect(Object.keys(zip.files).toSorted()).toEqual(Object.keys(originalZip.files).toSorted())
    for (const [path, entry] of Object.entries(originalZip.files)) {
      if (entry.dir || path === result.slidePaths[0] || path === result.slidePaths[2]) continue
      expect(await zip.file(path)!.async('uint8array')).toEqual(await entry.async('uint8array'))
    }
  }
  ui.render(<PptxShowControls {...props} version={props.version + 1} />)
  expect(
    ui.host.querySelector<HTMLButtonElement>('button[aria-label="应用排练计时"]')!.disabled,
  ).toBe(true)
  click(ui.host, '丢弃排练计时')
  expect(dismiss).toHaveBeenCalledTimes(2)
})
it('guards pending timing writes and ignores late completion after document switch', async () => {
  const session = await deck()
  let finish!: (value: boolean) => void
  const apply = vi.fn<PptxShowControlsProps['apply']>(
    () =>
      new Promise<boolean>((complete) => {
        finish = complete
      }),
  )
  const dismiss = vi.fn<() => void>()
  const props: PptxShowControlsProps = {
    documentId: 'old',
    slides: session.slides(),
    version: session.version(),
    rehearsal: {
      version: session.version(),
      slidePaths: session.slides().map((slide) => slide.path),
      perPageMs: [1000, 0, 0],
    },
    onDismissRehearsal: dismiss,
    onStart: vi.fn<PptxShowControlsProps['onStart']>(),
    apply,
  }
  const ui = mount(<PptxShowControls {...props} />)
  expect(ui.host.querySelector('[aria-label="应用排练计时"]')?.textContent).toBe('应用排练计时')
  click(ui.host, '应用排练计时')
  expect(ui.host.querySelector('[aria-label="应用排练计时"]')?.textContent).toBe('应用排练计时')
  expect(ui.host.querySelector('.mimir-pptx-show')?.getAttribute('aria-busy')).toBe('true')
  expect(ui.host.querySelector('[aria-label="应用排练计时"] svg')).not.toBeNull()
  click(ui.host, '应用排练计时')
  expect(apply).toHaveBeenCalledOnce()
  expect(
    ui.host.querySelector<HTMLButtonElement>('button[aria-label="丢弃排练计时"]')!.disabled,
  ).toBe(true)
  ui.render(<PptxShowControls {...props} documentId="new" rehearsal={null} />)
  await act(async () => finish(true))
  expect(dismiss).not.toHaveBeenCalled()
})
it('plays a specified subset, skips other slides, ends rehearsal with real cumulative dwell and restores focus', async () => {
  const session = await deck()
  const result = vi.fn<(value: PptxRehearsalResult) => void>(),
    close = vi.fn<() => void>()
  const trigger = document.createElement('button')
  document.body.append(trigger)
  cleanup.push(() => trigger.remove())
  const triggerRef = createRef<HTMLButtonElement>()
  triggerRef.current = trigger
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'],
  })
  const ui = mount(
    <PptxPresentation
      session={session}
      start={2}
      presenter={false}
      slideIndices={[2, 0]}
      rehearse
      onRehearsal={result}
      onClose={close}
      triggerRef={triggerRef}
    />,
  )
  await act(async () => {
    vi.advanceTimersByTime(1200)
  })
  key('ArrowRight')
  expect(ui.host.textContent).toContain('2 / 2 · 幻灯片 1')
  await act(async () => {
    vi.advanceTimersByTime(2100)
  })
  key('ArrowLeft')
  await act(async () => {
    vi.advanceTimersByTime(900)
  })
  key('Escape')
  expect(result).toHaveBeenCalledOnce()
  expect(result.mock.calls[0]![0].perPageMs).toEqual([2100, 0, 2100])
  expect(close).toHaveBeenCalledOnce()
  ui.render(null)
  expect(document.activeElement).toBe(trigger)
  expect(session.hasChanges()).toBe(false)
})
it('last-page next ends rehearsal and ordinary playback emits no timing result', async () => {
  const session = await deck()
  const result = vi.fn<(value: PptxRehearsalResult) => void>(),
    close = vi.fn<() => void>(),
    triggerRef = createRef<HTMLButtonElement>()
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'],
  })
  const ui = mount(
    <PptxPresentation
      session={session}
      start={0}
      presenter={false}
      slideIndices={[0]}
      rehearse
      onRehearsal={result}
      onClose={close}
      triggerRef={triggerRef}
    />,
  )
  await act(async () => {
    vi.advanceTimersByTime(1800)
  })
  key('ArrowRight')
  expect(close).toHaveBeenCalledOnce()
  expect(result.mock.calls[0]![0].perPageMs).toEqual([1800, 0, 0])
  ui.render(null)
  ui.render(
    <PptxPresentation
      session={session}
      start={0}
      presenter={false}
      onRehearsal={result}
      onClose={close}
      triggerRef={triggerRef}
    />,
  )
  key('Escape')
  expect(result).toHaveBeenCalledOnce()
  expect(close).toHaveBeenCalledTimes(2)
})
it('rehearsal overrides existing auto-advance until the user finishes', async () => {
  const clean = await deck()
  const model = await openPptx(await clean.save())
  expect(
    runTxn(model, {
      isolation: 'atomic',
      ops: [{ op: 'setAdvanceTime', target: { slide: 0 }, ms: 500 }],
    }).applied,
  ).toBe(true)
  const session = await openPptxForEdit(await savePptx(model))
  const close = vi.fn<() => void>(),
    result = vi.fn<(value: PptxRehearsalResult) => void>()
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'],
  })
  mount(
    <PptxPresentation
      session={session}
      start={0}
      slideIndices={[0]}
      presenter={false}
      rehearse
      onClose={close}
      onRehearsal={result}
      triggerRef={createRef<HTMLButtonElement>()}
    />,
  )
  await act(async () => {
    vi.advanceTimersByTime(1700)
  })
  expect(close).not.toHaveBeenCalled()
  key('Escape')
  expect(result.mock.calls[0]![0].perPageMs).toEqual([1700, 0, 0])
})
it('does not publish rehearsal results for a superseded canvas version', async () => {
  const session = await deck()
  const close = vi.fn<() => void>(),
    result = vi.fn<(value: PptxRehearsalResult) => void>()
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'],
  })
  mount(
    <PptxPresentation
      session={session}
      start={0}
      presenter={false}
      rehearse
      onClose={close}
      onRehearsal={result}
      triggerRef={createRef<HTMLButtonElement>()}
    />,
  )
  await act(async () => {
    vi.advanceTimersByTime(1200)
  })
  session.duplicate(0)
  key('Escape')
  expect(close).toHaveBeenCalledOnce()
  expect(result).not.toHaveBeenCalled()
})

it('restores a missing launch button to its Inspector and does not steal deliberate outside focus', async () => {
  const session = await deck()
  const editor = document.createElement('div')
  editor.className = 'mimir-editor'
  const inspector = document.createElement('aside')
  inspector.className = 'mimir-pptx-inspector'
  const close = document.createElement('button')
  const trigger = document.createElement('button')
  inspector.append(close, trigger)
  editor.append(inspector)
  document.body.append(editor)
  cleanup.push(() => editor.remove())
  const triggerRef = createRef<HTMLButtonElement>()
  triggerRef.current = trigger
  const presentation = (
    <PptxPresentation
      session={session}
      start={0}
      presenter={false}
      onClose={() => {}}
      triggerRef={triggerRef}
    />
  )
  const ui = mount(presentation)
  trigger.remove()
  ui.render(null)
  expect(document.activeElement).toBe(close)
  inspector.append(trigger)
  ui.render(presentation)
  const outside = document.createElement('button')
  document.body.append(outside)
  cleanup.push(() => outside.remove())
  outside.focus()
  ui.render(null)
  expect(document.activeElement).toBe(outside)
})
