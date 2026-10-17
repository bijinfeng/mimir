/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import { PptxOutlineControls, pptxElementStroke, pptxOutlineOp } from './PptxOutlineControls.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
import { openPptxForEdit } from '../pptx.js'
import { PptxHistory } from '../pptx-history.js'
import {
  elementDurableId,
  openPptx,
  savePptx,
} from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn, type Op } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import { pptxInsertShapeOp } from './pptx-shape-presets.js'
import type { PptxApply } from './PptxControlPanel.js'
import type { SlideElement, Stroke } from '../../vendor/packages/pptx-engine/src/types.js'

const fixture = new Uint8Array(
  readFileSync(
    resolvePath(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures/title-layout.pptx'),
  ),
)
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})
function button(host: HTMLElement, label: string) {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!found) throw new Error(`Missing ${label}`)
  return found
}
function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}
async function setup() {
  const source = await openPptx(fixture)
  expect(
    runTxn(source, {
      isolation: 'atomic',
      ops: [pptxInsertShapeOp('lineArrowDouble', 0, 9144000, 5143500)],
    }).applied,
  ).toBe(true)
  let bytes = await savePptx(source)
  let version = 1
  let element: SlideElement = (await openPptxForEdit(bytes)).slides()[0]!.elements.at(-1)!
  let target = { slide: 0, el: elementDurableId(element)! }
  const apply = vi.fn<PptxApply>(async (op) => {
    const opened = await openPptx(bytes)
    const result = runTxn(opened, { isolation: 'atomic', ops: [op as Op] })
    expect(result.failures ?? []).toEqual([])
    expect(result.applied).toBe(true)
    bytes = await savePptx(opened)
    element = (await openPptxForEdit(bytes)).slides()[0]!.elements.at(-1)!
    version++
    render()
    return true
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const render = () =>
    root.render(
      <ConfigProvider componentSize="small">
        <PptxOutlineControls element={element} target={target} version={version} apply={apply} />
      </ConfigProvider>,
    )
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () => render())
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return {
    host,
    apply,
    bytes: () => bytes,
    changeSource: async (changeTarget = false) => {
      version++
      if (changeTarget) target = { ...target, el: 'another-element' }
      await act(async () => render())
    },
    submit: async () => {
      await act(async () => {
        button(host, '应用轮廓').click()
        await new Promise((resolve) => setTimeout(resolve, 20))
      })
      for (let i = 0; i < 100 && host.querySelector('[aria-busy="true"]'); i++)
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 5))
        })
    },
    unmount: () => act(() => root.unmount()),
  }
}
function setWidth(host: HTMLElement, value: string) {
  const input = host.querySelector<HTMLInputElement>('[aria-label="轮廓宽度（pt）"]')!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}
it('stages native current values and applies width/dash/cap/compound/join in one save, preserving arrow ends and unrelated entries', async () => {
  const view = await setup()
  const before = await JSZip.loadAsync(view.bytes())
  expect(view.host.textContent).toContain('当前轮廓：1pt · 实线')
  setWidth(view.host, '4.5')
  pickSelectOption(view.host, '轮廓线型', '点划线')
  pickSelectOption(view.host, '端点样式', '圆头')
  pickSelectOption(view.host, '连接样式', '斜角')
  pickSelectOption(view.host, '复合线条', '粗细双线')
  expect(view.apply).not.toHaveBeenCalled()
  await view.submit()
  expect(view.apply).toHaveBeenCalledTimes(1)
  const first = await openPptxForEdit(view.bytes())
  const once = await first.save()
  first.commit()
  const twice = await (await openPptxForEdit(once)).save()
  const after = await JSZip.loadAsync(twice)
  const xml = await after.file('ppt/slides/slide1.xml')!.async('string')
  const stroke = pptxElementStroke((await openPptxForEdit(twice)).slides()[0]!.elements.at(-1)!)!
  expect(stroke).toMatchObject({
    width: 57150,
    dash: 'dashDot',
    cap: 'round',
    compound: 'thickThin',
    join: 'bevel',
    headEnd: { type: 'triangle' },
    tailEnd: { type: 'triangle' },
  })
  expect(xml).toContain('<a:headEnd type="triangle"')
  expect(xml).toContain('<a:tailEnd type="triangle"')
  for (const [path, entry] of Object.entries(before.files)) {
    if (entry.dir || path === 'ppt/slides/slide1.xml') continue
    expect(await after.file(path)!.async('uint8array')).toEqual(await entry.async('uint8array'))
  }
  expect(view.host.textContent).toContain('当前轮廓：4.5pt · 点划线')
  expect(button(view.host, '应用轮廓').disabled).toBe(true)
})
it('discards draft explicitly, keeps rejected drafts, locks composite selectors and guards duplicate submits', async () => {
  const view = await setup()
  pickSelectOption(view.host, '轮廓线型', '短划线')
  click(button(view.host, '重置轮廓草稿'))
  expect(button(view.host, '应用轮廓').disabled).toBe(true)
  pickSelectOption(view.host, '轮廓显示', '无轮廓')
  let finish!: (ok: boolean) => void
  view.apply.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  click(button(view.host, '应用轮廓'))
  click(button(view.host, '正在应用轮廓'))
  expect(view.apply).toHaveBeenCalledTimes(1)
  expect(view.host.querySelector('.ant-select-disabled')).not.toBeNull()
  await act(async () => finish(false))
  expect(view.host.textContent).toContain('已保留草稿')
  expect(button(view.host, '应用轮廓').disabled).toBe(false)
  expect(view.apply.mock.calls[0]![0]).toMatchObject({ stroke: null })
  view.apply.mockRejectedValueOnce(new Error('offline'))
  await view.submit()
  expect(view.host.textContent).toContain('已保留草稿')
})
it('permanently clears source/version drafts and ignores pending failures after target changes', async () => {
  const view = await setup()
  pickSelectOption(view.host, '轮廓线型', '长划线')
  await view.changeSource()
  expect(button(view.host, '应用轮廓').disabled).toBe(true)
  let finish!: (ok: boolean) => void
  view.apply.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  pickSelectOption(view.host, '轮廓线型', '点线')
  click(button(view.host, '应用轮廓'))
  await view.changeSource(true)
  await act(async () => finish(false))
  expect(view.host.textContent).not.toContain('已保留草稿')
  expect(button(view.host, '应用轮廓').disabled).toBe(true)
})
it('preserves linear gradient and alpha during width-only writes, and refuses lossy complex fills until a colour is explicitly chosen', () => {
  const stroke: Stroke = {
    width: 25400,
    fill: {
      type: 'gradient',
      stops: [
        { pos: 0, color: '#12345680' },
        { pos: 1, color: '#ABCDEF' },
      ],
      angle: 2700000,
      scaled: true,
    },
    dash: 'lgDash',
    cap: 'square',
    join: 'round',
    compound: 'dbl',
  }
  const target = { slide: 0, el: 'e_1' }
  expect(pptxOutlineOp(target, stroke, { widthPt: 3 })).toMatchObject({
    stroke: {
      widthEmu: 38100,
      dash: 'lgDash',
      cap: 'sq',
      join: 'round',
      compound: 'dbl',
      gradient: { stops: stroke.fill.type === 'gradient' ? stroke.fill.stops : [], angle: 2700000 },
    },
  })
  const complex = {
    ...stroke,
    fill: { ...stroke.fill, type: 'gradient' as const, stops: [], path: 'circle' as const },
  }
  expect(() => pptxOutlineOp(target, complex, { widthPt: 3 })).toThrow('复杂填充')
  expect(pptxOutlineOp(target, complex, { color: '#4472C4' })).toMatchObject({
    stroke: { color: '#4472C4' },
  })
  expect(() => pptxOutlineOp(target, stroke, { widthPt: NaN })).toThrow('宽度')
})
it('restores native outline archives through real session history after save, undo/save and redo/save', async () => {
  const view = await setup()
  const session = await openPptxForEdit(view.bytes())
  const history = new PptxHistory(session)
  const original = await session.save()
  pickSelectOption(view.host, '轮廓显示', '无轮廓')
  await view.submit()
  await session.replaceFromHost(view.bytes(), session.version())
  history.record()
  const changed = await session.save()
  session.commit()
  history.synchronize()
  expect(
    pptxElementStroke((await openPptxForEdit(changed)).slides()[0]!.elements.at(-1)!),
  ).toBeUndefined()
  expect(history.undo()).toBe(true)
  const undone = await session.save()
  session.commit()
  history.synchronize()
  expect(history.redo()).toBe(true)
  const redone = await session.save()
  for (const [expected, actual] of [
    [original, undone],
    [changed, redone],
  ]) {
    const left = await JSZip.loadAsync(expected!),
      right = await JSZip.loadAsync(actual!)
    for (const [path, entry] of Object.entries(left.files).filter(([, item]) => !item.dir))
      expect(await right.file(path)!.async('uint8array')).toEqual(await entry.async('uint8array'))
  }
})

it('saves alpha gradient width edits and keeps original non-edited line details through reparse', async () => {
  const opened = await openPptx(fixture)
  expect(
    runTxn(opened, {
      isolation: 'atomic',
      ops: [pptxInsertShapeOp('lineArrowDouble', 0, 9144000, 5143500)],
    }).applied,
  ).toBe(true)
  const shape = opened.deck.slides[0]!.elements.at(-1)!
  const target = { slide: 0, el: elementDurableId(shape)! }
  expect(
    runTxn(opened, {
      isolation: 'atomic',
      ops: [
        {
          op: 'setStroke',
          target,
          stroke: {
            color: '#12345680',
            widthEmu: 25400,
            dash: 'lgDash',
            cap: 'sq',
            compound: 'dbl',
            join: 'round',
            gradient: {
              stops: [
                { pos: 0, color: '#12345680' },
                { pos: 1, color: '#ABCDEF' },
              ],
              angle: 2700000,
            },
          },
        },
      ],
    }).applied,
  ).toBe(true)
  const source = await openPptx(await savePptx(opened))
  const previous = pptxElementStroke(source.deck.slides[0]!.elements.at(-1)!)!
  expect(
    runTxn(source, {
      isolation: 'atomic',
      ops: [pptxOutlineOp(target, previous, { widthPt: 3 }) as Op],
    }).applied,
  ).toBe(true)
  const bytes = await savePptx(source)
  const session = await openPptxForEdit(bytes)
  const saved = await session.save()
  session.commit()
  const repeated = await (await openPptxForEdit(saved)).save()
  const read = pptxElementStroke((await openPptxForEdit(repeated)).slides()[0]!.elements.at(-1)!)!
  expect(read.width).toBe(38100)
  expect(read.fill).toEqual(previous.fill)
  expect(read).toMatchObject({
    cap: 'square',
    compound: 'dbl',
    join: 'round',
    dash: 'lgDash',
    headEnd: { type: 'triangle' },
    tailEnd: { type: 'triangle' },
  })
})
it('shows the original custom colour swatch, validates custom values and ignores a late completion after unmount', async () => {
  const view = await setup()
  const input = view.host.querySelector<HTMLInputElement>('[aria-label="轮廓色值"]')!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'invalid',
    )
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await view.submit()
  expect(view.apply).not.toHaveBeenCalled()
  expect(view.host.textContent).toContain('#RRGGBB')
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      '#12345680',
    )
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(button(view.host, '轮廓当前颜色').getAttribute('aria-pressed')).toBe('true')
  let finish!: (ok: boolean) => void
  view.apply.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  click(button(view.host, '应用轮廓'))
  view.unmount()
  await act(async () => finish(true))
  expect(view.host.textContent).toBe('')
})
