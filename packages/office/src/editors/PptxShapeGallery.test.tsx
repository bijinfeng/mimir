/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import { PptxShapeGallery } from './PptxShapeGallery.js'
import {
  currentPptxShapeStyle,
  PPTX_SHAPE_GROUPS,
  PPTX_SHAPES,
  PPTX_SHAPE_STYLES,
  pptxInsertShapeOp,
  pptxShapeLabel,
  pptxShapePreview,
  pptxShapeStyleOps,
} from './pptx-shape-presets.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
import { openPptxForEdit } from '../pptx.js'
import {
  elementDurableId,
  openPptx,
  savePptx,
} from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn, type Op } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import type { SlideElement } from '../../vendor/packages/pptx-engine/src/types.js'

const fixture = new Uint8Array(
  readFileSync(
    resolvePath(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures/title-layout.pptx'),
  ),
)
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.restoreAllMocks()
})
function click(element: Element) {
  act(() => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
}
function button(host: HTMLElement, label: string) {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!found) throw new Error(`Missing ${label}`)
  return found
}
function tab(host: HTMLElement, label: string) {
  click([...host.querySelectorAll('[role="tab"]')].find((item) => item.textContent === label)!)
}
function search(host: HTMLElement, value: string) {
  const input = host.querySelector<HTMLInputElement>('[aria-label="搜索形状"]')!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  return input
}
async function readTwice(bytes: Uint8Array) {
  const first = await openPptxForEdit(bytes)
  const once = await first.save()
  first.commit()
  const second = await openPptxForEdit(once)
  const twice = await second.save()
  const zip = await JSZip.loadAsync(twice)
  expect(await zip.file('ppt/theme/theme1.xml')!.async('uint8array')).toEqual(
    await (await JSZip.loadAsync(fixture)).file('ppt/theme/theme1.xml')!.async('uint8array'),
  )
  return { session: second, xml: await zip.file('ppt/slides/slide1.xml')!.async('string') }
}
async function setup(reject = false, onDrawShape?: (kind: 'rect' | string) => void) {
  const opened = await openPptx(fixture)
  expect(
    runTxn(opened, {
      isolation: 'atomic',
      ops: [pptxInsertShapeOp('roundRect', 0, 9144000, 5143500)],
    }).applied,
  ).toBe(true)
  let bytes = await savePptx(opened)
  let version = 1
  let element: SlideElement | null = (await openPptxForEdit(bytes)).slides()[0]!.elements.at(-1)!
  const target = { slide: 0, el: elementDurableId(element)! }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const render = () =>
    root.render(
      <ConfigProvider componentSize="small">
        <PptxShapeGallery
          version={version}
          element={element}
          target={element ? target : null}
          slide={0}
          width={9144000}
          height={5143500}
          applyOps={apply}
          onDrawShape={onDrawShape}
        />
      </ConfigProvider>,
    )
  const apply = vi.fn<(ops: Record<string, unknown>[]) => Promise<boolean>>(async (ops) => {
    if (reject) return false
    const source = await openPptx(bytes)
    const txn = runTxn(source, { isolation: 'atomic', ops: ops as Op[] })
    expect(txn.failures ?? []).toEqual([])
    expect(txn.applied).toBe(true)
    bytes = await savePptx(source)
    element = (await openPptxForEdit(bytes))
      .slides()[0]!
      .elements.find((item) => elementDurableId(item) === target.el)!
    version++
    render()
    return true
  })
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () => render())
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  const submit = async (label: string) => {
    await act(async () => {
      button(host, label).click()
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    for (let tries = 0; tries < 80 && host.querySelector('[aria-busy="true"]'); tries++)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
      })
    return readTwice(bytes)
  }
  return {
    host,
    apply,
    submit,
    getBytes: () => bytes,
    source: async (next: SlideElement | null) => {
      element = next
      version++
      await act(async () => render())
    },
    getElement: () => element,
  }
}

it('locks the Ant Design category selector while a shape write is pending', async () => {
  const view = await setup()
  let finish!: (result: boolean) => void
  view.apply.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  click(button(view.host, '插入所选形状'))
  expect(view.apply).toHaveBeenCalledTimes(1)
  expect(view.host.querySelector('.ant-select-disabled')).not.toBeNull()
  await act(async () => finish(false))
  expect(view.host.querySelector('.ant-select-disabled')).toBeNull()
})

it('provides all 109 fixed-upstream shapes in seven labelled groups with real previews and native save readback', async () => {
  expect(PPTX_SHAPE_GROUPS.map((group) => group.shapes.length)).toEqual([5, 9, 37, 14, 16, 24, 4])
  expect(new Set(PPTX_SHAPES.map((shape) => shape.kind)).size).toBe(109)
  for (const shape of PPTX_SHAPES) {
    const paths = pptxShapePreview(shape.kind)
    expect(paths).not.toBeNull()
    expect([paths?.path, paths?.fillPath, paths?.strokePath].some(Boolean)).toBe(true)
    expect(JSON.stringify(paths)).not.toMatch(/NaN|Infinity/)
  }
  const opened = await openPptx(fixture)
  const result = runTxn(opened, {
    isolation: 'atomic',
    ops: PPTX_SHAPES.map((shape) => pptxInsertShapeOp(shape.kind, 0, 9144000, 5143500)),
  })
  expect(result.failures ?? []).toEqual([])
  expect(result.applied).toBe(true)
  const { session, xml } = await readTwice(await savePptx(opened))
  const inserted = session.slides()[0]!.elements.slice(-109)
  const alias: Record<string, string> = {
    line: 'line',
    lineArrow: 'straightConnector1',
    lineArrowDouble: 'straightConnector1',
    lineBent: 'bentConnector3',
    lineCurved: 'curvedConnector3',
  }
  PPTX_SHAPES.forEach((shape, index) => {
    const element = inserted[index]!
    expect(element.type === 'shape' || element.type === 'text').toBe(true)
    if (element.type !== 'shape' && element.type !== 'text') throw new Error(shape.kind)
    expect(element.presetGeometry).toBe(alias[shape.kind] ?? shape.kind)
    expect(xml).toContain(`prst="${alias[shape.kind] ?? shape.kind}"`)
  })
  expect(xml).toContain('<a:headEnd type="triangle"')
  expect(xml).toContain('<a:tailEnd type="triangle"')
})

it('applies all 32 native fill/outline combinations without changing text, width or unrelated theme', async () => {
  expect(PPTX_SHAPE_STYLES).toHaveLength(32)
  const source = await openPptx(fixture)
  expect(
    runTxn(source, {
      isolation: 'atomic',
      ops: [pptxInsertShapeOp('hexagon', 0, 9144000, 5143500)],
    }).applied,
  ).toBe(true)
  const element = source.deck.slides[0]!.elements.at(-1)!
  const target = { slide: 0, el: elementDurableId(element)! }
  expect(
    runTxn(source, {
      isolation: 'atomic',
      ops: [
        { op: 'setText', target, paragraphs: [{ runs: [{ text: '组合样式保留文字' }] }] },
        { op: 'setStroke', target, stroke: { color: '#123456', widthEmu: 38100 } },
      ],
    }).applied,
  ).toBe(true)
  let bytes = await savePptx(source)
  for (const style of PPTX_SHAPE_STYLES) {
    const current = await openPptx(bytes)
    const shape = current.deck.slides[0]!.elements.at(-1)!
    expect(
      runTxn(current, { isolation: 'atomic', ops: pptxShapeStyleOps(target, shape, style) })
        .applied,
    ).toBe(true)
    bytes = await savePptx(current)
    const { session, xml } = await readTwice(bytes)
    const next = session.slides()[0]!.elements.at(-1)!
    expect(currentPptxShapeStyle(next)?.key).toBe(style.key)
    expect(next.type === 'shape' || next.type === 'text').toBe(true)
    if (next.type !== 'shape' && next.type !== 'text') throw new Error('Expected a saved shape')
    expect(next.stroke?.width).toBe(38100)
    expect(xml).toContain('组合样式保留文字')
    expect(xml).toContain(`val="${style.fill.slice(1)}"`)
    expect(xml).toContain(`val="${style.stroke.slice(1)}"`)
    expect(xml.includes('<a:prstDash val="dash"')).toBe(style.dash === 'dash')
  }
})

it('rolls back both style changes when the atomic outline operation fails', async () => {
  const source = await openPptx(fixture)
  const shape = source.deck.slides[0]!.elements.find((element) => element.type === 'text')!
  const target = { slide: 0, el: elementDurableId(shape)! }
  const before = await savePptx(source)
  const ops = pptxShapeStyleOps(target, shape, PPTX_SHAPE_STYLES[0]!)
  ops[1] = { ...ops[1]!, target: { slide: 0, el: 'missing-element' } }
  expect(runTxn(source, { isolation: 'atomic', ops }).applied).toBe(false)
  const zipBefore = await JSZip.loadAsync(before),
    zipAfter = await JSZip.loadAsync(await savePptx(source))
  expect(await zipAfter.file('ppt/slides/slide1.xml')!.async('string')).toBe(
    await zipBefore.file('ppt/slides/slide1.xml')!.async('string'),
  )
})

it('matches native stroke-only connector styles only when the visible combination is unique', async () => {
  const source = await openPptx(fixture)
  expect(
    runTxn(source, {
      isolation: 'atomic',
      ops: [pptxInsertShapeOp('lineArrowDouble', 0, 9144000, 5143500)],
    }).applied,
  ).toBe(true)
  let bytes = await savePptx(source)
  for (const [key, expected] of [
    ['dash-purple', 'dash-purple'],
    ['solid-purple', 'solid-purple'],
    ['outline-blue', undefined],
    ['soft-blue', undefined],
  ] as const) {
    const current = await openPptx(bytes)
    const connector = current.deck.slides[0]!.elements.at(-1)!
    const target = { slide: 0, el: elementDurableId(connector)! }
    const style = PPTX_SHAPE_STYLES.find((item) => item.key === key)!
    expect(
      runTxn(current, { isolation: 'atomic', ops: pptxShapeStyleOps(target, connector, style) })
        .applied,
    ).toBe(true)
    bytes = await savePptx(current)
    const saved = (await openPptxForEdit(bytes)).slides()[0]!.elements.at(-1)!
    expect(saved.type).toBe('shape')
    if (saved.type !== 'shape') throw new Error('Expected native connector')
    expect(saved.fill).toEqual({ type: 'none' })
    expect(currentPptxShapeStyle(saved)?.key).toBe(expected)
    // The stroke-only rule cannot invent a fill for a closed shape.
    expect(currentPptxShapeStyle({ ...saved, presetGeometry: 'rect' })).toBeUndefined()
  }
})

it.each([
  ['straightConnector1', '直线连接线'],
  ['bentConnector3', '折线连接线'],
  ['curvedConnector3', '曲线连接线'],
  ['lineArrowDouble', '双箭头'],
])('uses the readable current geometry label for %s', (kind, label) => {
  expect(pptxShapeLabel(kind)).toBe(label)
})

it('searches all categories, provides one Tab stop per gallery, and uses arrows without editing', async () => {
  const { host, apply } = await setup()
  expect(host.textContent).toContain('当前形状：圆角矩形')
  expect(button(host, '插入所选形状').textContent).toBe('插入所选形状')
  expect(host.querySelectorAll('[role="radio"][tabindex="0"]')).toHaveLength(1)
  const selected = button(host, '圆角矩形')
  selected.focus()
  act(() =>
    selected.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
  )
  expect(document.activeElement).toBe(button(host, '剪去单角的矩形'))
  expect(button(host, '剪去单角的矩形').getAttribute('aria-checked')).toBe('true')
  expect(apply).not.toHaveBeenCalled()
  search(host, 'flowChartDocument')
  expect(button(host, '流程图: 文档')).toBeTruthy()
  expect(host.querySelectorAll('[role="radio"]')).toHaveLength(1)
  click(button(host, '流程图: 文档'))
  tab(host, '组合样式')
  expect(button(host, '应用组合样式').textContent).toBe('应用组合样式')
  expect(host.querySelectorAll('[role="radio"]')).toHaveLength(32)
  expect(host.querySelectorAll('[role="radio"][tabindex="0"]')).toHaveLength(4)
  tab(host, '形状图库')
  expect(host.textContent).toContain('已选：流程图: 文档')
  const input = search(host, '找不到')
  expect(host.textContent).toContain('没有匹配的形状')
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  act(() => input.dispatchEvent(escape))
  expect(escape.defaultPrevented).toBe(true)
  expect(input.value).toBe('')
  expect(apply).not.toHaveBeenCalled()
})

it('keeps line aliases insert-only and saves real connector geometry from the labelled gallery', async () => {
  const { host, submit, apply } = await setup()
  pickSelectOption(host, '形状分类', '线条（5）')
  click(button(host, '双箭头'))
  expect(button(host, '更改选中形状').disabled).toBe(true)
  const { xml } = await submit('插入所选形状')
  expect(apply.mock.calls[0]![0]).toHaveLength(1)
  expect(xml).toContain('prst="straightConnector1"')
  expect(xml).toContain('<a:headEnd type="triangle"')
  expect(xml).toContain('<a:tailEnd type="triangle"')
})

it('applies the chosen combination in one atomic callback and refreshes its current value after two saves', async () => {
  const { host, submit, apply } = await setup()
  tab(host, '组合样式')
  expect(host.textContent).toContain('当前样式：自定义样式')
  click(button(host, '紫色·虚线描边'))
  expect(apply).not.toHaveBeenCalled()
  const { session, xml } = await submit('应用组合样式')
  expect(apply).toHaveBeenCalledTimes(1)
  expect(apply.mock.calls[0]![0].map((op) => op.op)).toEqual(['setFill', 'setStroke'])
  expect(currentPptxShapeStyle(session.slides()[0]!.elements.at(-1)!)?.key).toBe('dash-purple')
  expect(xml).toContain('prst="roundRect"')
  expect(host.textContent).toContain('当前样式：紫色·虚线描边')
  expect(button(host, '应用组合样式').disabled).toBe(true)
})

it('preserves the selected draft and exact bytes on a rejected or throwing apply', async () => {
  const { host, apply, submit, getBytes } = await setup(true)
  const before = getBytes()
  tab(host, '组合样式')
  click(button(host, '蓝色·实心填充'))
  await submit('应用组合样式')
  expect(getBytes()).toBe(before)
  expect(host.textContent).toContain('已保留所选草稿')
  expect(button(host, '蓝色·实心填充').getAttribute('aria-checked')).toBe('true')
  apply.mockRejectedValueOnce(new Error('offline'))
  await submit('应用组合样式')
  expect(host.textContent).toContain('修改未应用，请重试')
  expect(getBytes()).toBe(before)
  expect(button(host, '应用组合样式').disabled).toBe(false)
})

it('invalidates pending shape and style drafts on an external version change while keeping the category', async () => {
  const { host, source, getElement } = await setup()
  search(host, '六边形')
  click(button(host, '六边形'))
  tab(host, '组合样式')
  click(button(host, '红色·实心填充'))
  await source(structuredClone(getElement()))
  expect(host.textContent).toContain('当前样式：自定义样式')
  expect(host.textContent).toContain('已选：请选择组合样式')
  expect(button(host, '应用组合样式').disabled).toBe(true)
  tab(host, '形状图库')
  expect(host.textContent).toContain('已选：圆角矩形')
  expect(host.querySelector<HTMLInputElement>('[aria-label="搜索形状"]')?.value).toBe('六边形')
  await source(null)
  tab(host, '组合样式')
  expect(host.textContent).toContain('未选择形状')
  expect(button(host, '应用组合样式').disabled).toBe(true)
})

it('guards repeated submissions and ignores a late failed response after the source changes', async () => {
  const { host, source, getElement, apply, getBytes } = await setup()
  let finish: ((ok: boolean) => void) | undefined
  apply.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve
      }),
  )
  const before = getBytes()
  tab(host, '组合样式')
  click(button(host, '青色·浅色填充'))
  click(button(host, '应用组合样式'))
  click(button(host, '应用组合样式'))
  expect(apply).toHaveBeenCalledTimes(1)
  expect(host.querySelector('fieldset')?.disabled).toBe(true)
  await source(structuredClone(getElement()))
  await act(async () => finish?.(false))
  expect(host.textContent).not.toContain('已保留所选草稿')
  expect(host.textContent).toContain('已选：请选择组合样式')
  expect(getBytes()).toBe(before)
})

it('arms the selected gallery geometry without writing, with a separate accessible immediate insertion', async () => {
  const draw = vi.fn<(kind: string) => void>()
  const { host, apply } = await setup(false, draw)
  click(button(host, '在画布绘制所选形状'))
  expect(draw).toHaveBeenCalledExactlyOnceWith('roundRect')
  expect(apply).not.toHaveBeenCalled()
  expect(button(host, '在画布绘制所选形状').textContent).toBe('在画布绘制所选形状')
  expect(button(host, '插入所选形状').textContent).toBe('直接插入')
})
