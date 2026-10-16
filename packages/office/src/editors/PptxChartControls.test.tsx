/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import { ChartEditControls } from './PptxAdvancedControls.js'
import { pptxChartEditKind } from './PptxChartAppearance.js'
import { pickSelectOption, selectValueText } from '../shell/antd-test-dom.js'
import type { NewChartKind } from '../../vendor/packages/pptx-engine/src/chart-insert.js'
import { openPptxForEdit } from '../pptx.js'
import {
  elementDurableId,
  openPptx,
  savePptx,
} from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn, type Op } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import type { ChartElement } from '../../vendor/packages/pptx-engine/src/types.js'

const fixture = new Uint8Array(
  readFileSync(
    resolvePath(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures/title-layout.pptx'),
  ),
)
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})
function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}
function button(host: HTMLElement, label: string) {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!found) throw new Error(`Missing button ${label}`)
  return found
}
function tab(host: HTMLElement, label: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (item) => item.textContent === label,
  )!
  click(found)
  return found
}
function field(host: HTMLElement, label: string, value: string, commit = false) {
  const input = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[aria-label="${label}"]`,
  )!
  act(() => {
    Object.getOwnPropertyDescriptor(
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  if (commit)
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
}
async function setup(kind: NewChartKind = 'bar', rejected = false) {
  const opened = await openPptx(fixture)
  expect(
    runTxn(opened, {
      isolation: 'atomic',
      ops: [
        {
          op: 'addChart',
          target: { slide: 0 },
          kind,
          title: '季度数据',
          categories: ['Q1', 'Q2'],
          series: [
            { name: '收入', values: [12, 18] },
            { name: '成本', values: [3, 5] },
          ],
          offset: { x: 914400, y: 1371600, cx: 5486400, cy: 2743200 },
        },
      ],
    }).applied,
  ).toBe(true)
  let bytes = await savePptx(opened)
  const initial = await openPptxForEdit(bytes)
  const chart = initial
    .slides()[0]!
    .elements.find((item): item is ChartElement => item.type === 'chart')!
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const apply = vi.fn<(input: Record<string, unknown>) => Promise<boolean>>(async (input) => {
    if (rejected) return false
    const source = await openPptx(bytes)
    const txn = runTxn(source, {
      isolation: 'atomic',
      ops: [{ op: 'setChart', target: input.target, patch: input.patch } as Op],
    })
    expect(txn.failures ?? []).toEqual([])
    expect(txn.applied).toBe(true)
    bytes = await savePptx(source)
    return true
  })
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () =>
    root.render(
      <ConfigProvider componentSize="small">
        <ChartEditControls
          chart={chart}
          target={{ slide: 0, el: elementDurableId(chart)! }}
          apply={apply}
        />
      </ConfigProvider>,
    ),
  )
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  const applyAndRead = async () => {
    await act(async () => {
      button(host, '应用图表修改').click()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    for (let i = 0; i < 40 && host.querySelector('[aria-busy="true"]'); i++)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
      })
    return readTwice()
  }
  const readTwice = async () => {
    const first = await openPptxForEdit(bytes),
      once = await first.save()
    first.commit()
    const reopened = await openPptxForEdit(once),
      second = await reopened.save(),
      zip = await JSZip.loadAsync(second)
    const next = reopened
      .slides()[0]!
      .elements.find((item): item is ChartElement => item.type === 'chart')!
    const part = Object.keys(zip.files).find((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name))!
    expect(await zip.file('ppt/theme/theme1.xml')!.async('uint8array')).toEqual(
      await (await JSZip.loadAsync(fixture)).file('ppt/theme/theme1.xml')!.async('uint8array'),
    )
    return { chart: next.chart, xml: await zip.file(part)!.async('string') }
  }
  return { host, apply, applyAndRead, readTwice }
}
it('keeps drafts across the three keyboard-accessible categories and saves native style, palette and point colors twice', async () => {
  const { host, apply, applyAndRead } = await setup()
  expect(
    host.querySelector('[aria-label="更改图表类型"]')?.closest('.me-property-field')?.textContent,
  ).toContain('柱状图')
  field(host, '图表标题', '年度收入')
  pickSelectOption(host, '图表样式预设', '详细')
  field(host, '类别轴标题', '季度')
  field(host, '数值轴标题', '万元')
  pickSelectOption(host, '柱形方向', '横向条形')
  field(host, '柱形间距（%）', '75', true)
  const style = host.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')!
  act(() => {
    style.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  })
  expect(document.activeElement?.textContent).toBe('配色')
  expect(host.querySelector('[aria-label="图表标题"]')).toBeNull()
  pickSelectOption(host, '图表配色方案', '暖色')
  expect(selectValueText(host, '图表配色方案')).toBe('暖色')
  pickSelectOption(host, '数据点所属系列', '成本')
  click(button(host, '数据点颜色'))
  click(button(host, '#7030A0'))
  tab(host, '数据')
  expect(button(host, '切换图表行列').disabled).toBe(true)
  expect(host.querySelectorAll('textarea[aria-label*="数值"]')).toHaveLength(1)
  tab(host, '样式')
  expect(host.querySelector<HTMLInputElement>('[aria-label="图表标题"]')!.value).toBe('年度收入')
  expect(
    host.querySelector('.mimir-pptx-chart-editor__content')?.contains(button(host, '应用图表修改')),
  ).toBe(false)
  const result = await applyAndRead()
  expect(apply).toHaveBeenCalledTimes(1)
  expect(result.chart).toMatchObject({
    title: '年度收入',
    legendPos: 'b',
    barDir: 'bar',
    gapWidthPct: 75,
    dataLabels: true,
  })
  expect(result.chart.catAxis?.title).toBe('季度')
  expect(result.chart.valAxis?.title).toBe('万元')
  expect(result.chart.series.map((s) => s.color)).toEqual(['#ED7D31', '#FFC000'])
  expect(result.chart.series[1]!.pointColors?.[0]).toBe('#7030A0')
  expect(result.xml).toContain('<c:majorGridlines')
  expect(result.xml).toContain('<c:gapWidth val="75"')
  expect(result.xml).toContain('<c:dPt>')
  expect(result.xml).toContain('7030A0')
})
it('shows the palette draft across categories and can restore the unchanged native palette', async () => {
  const { host } = await setup()
  tab(host, '配色')
  pickSelectOption(host, '图表配色方案', '暖色')
  tab(host, '数据')
  tab(host, '配色')
  expect(selectValueText(host, '图表配色方案')).toBe('暖色')
  pickSelectOption(host, '图表配色方案', '保留当前配色')
  expect(selectValueText(host, '图表配色方案')).toBe('保留当前配色')
  expect(button(host, '应用图表修改').disabled).toBe(true)
})

it.each<NewChartKind>([
  'barStacked',
  'barPercentStacked',
  'bar3D',
  'pie3D',
  'doughnut',
  'comboBarLine',
])(
  'title-only editing preserves the native %s subtype and data through two saves',
  async (kind) => {
    const { host, apply, applyAndRead } = await setup(kind)
    field(host, '图表标题', '只改标题')
    const result = await applyAndRead()
    expect(pptxChartEditKind(result.chart)).toBe(kind)
    expect(result.chart.categories).toEqual(['Q1', 'Q2'])
    expect(
      result.chart.series.map((series) => ({ name: series.name, values: series.values })),
    ).toEqual([
      { name: '收入', values: [12, 18] },
      { name: '成本', values: [3, 5] },
    ])
    const input = apply.mock.calls[0]![0]
    expect(input.patch).not.toHaveProperty('kind')
    expect(input.patch).not.toHaveProperty('categories')
    expect(input.patch).not.toHaveProperty('series')
    expect(input).not.toHaveProperty('dataSource')
  },
)

it('edits native combo column gap without exposing an unsupported horizontal direction', async () => {
  const { host, apply, applyAndRead } = await setup('comboBarLine')
  expect(host.querySelector('[aria-label="柱形方向"]')).toBeNull()
  pickSelectOption(host, '图表样式预设', '宽柱')
  expect(host.querySelector<HTMLInputElement>('[aria-label="柱形间距（%）"]')!.value).toBe('50')
  field(host, '柱形间距（%）', '75', true)
  const result = await applyAndRead()
  expect(pptxChartEditKind(result.chart)).toBe('comboBarLine')
  expect(result.chart.gapWidthPct).toBe(75)
  expect(result.xml).toContain('<c:lineChart>')
  expect(result.xml).toContain('<c:gapWidth val="75"')
  expect(apply.mock.calls[0]![0].patch).not.toHaveProperty('barDir')
})

it('switches actual native chart rows and columns as a separate operation', async () => {
  const { host, apply, readTwice } = await setup()
  tab(host, '数据')
  await act(async () => {
    button(host, '切换图表行列').click()
    await new Promise((resolve) => setTimeout(resolve, 40))
  })
  expect(apply).toHaveBeenCalledWith({ target: expect.anything(), patch: { switchRowCol: true } })
  const { chart } = await readTwice()
  expect(chart.categories).toEqual(['收入', '成本'])
  expect(chart.series.map((s) => ({ name: s.name, values: s.values }))).toEqual([
    { name: 'Q1', values: [12, 3] },
    { name: 'Q2', values: [18, 5] },
  ])
})
it('validates only the current data editor, retains failed drafts, and adds/removes whole series without a stacked form', async () => {
  const { host, apply } = await setup('bar', true)
  tab(host, '数据')
  click(button(host, '添加图表系列'))
  expect(host.querySelector('[aria-label="系列 1 名称"]')).toBeNull()
  expect(host.querySelector<HTMLInputElement>('[aria-label="系列 3 名称"]')!.value).toBe('系列3')
  field(host, '系列 3 数值（每行一项）', '4')
  expect(button(host, '应用图表修改').disabled).toBe(true)
  field(host, '系列 3 数值（每行一项）', '4\n8')
  tab(host, '样式')
  field(host, '图表标题', '保留草稿')
  tab(host, '数据')
  expect(
    host.querySelector<HTMLTextAreaElement>('[aria-label="系列 3 数值（每行一项）"]')!.value,
  ).toBe('4\n8')
  await act(async () => button(host, '应用图表修改').click())
  expect(apply).toHaveBeenCalledWith(
    expect.objectContaining({
      dataSource: 'user',
      patch: expect.objectContaining({
        title: '保留草稿',
        series: [
          { name: '收入', values: [12, 18] },
          { name: '成本', values: [3, 5] },
          { name: '系列3', values: [4, 8] },
        ],
      }),
    }),
  )
  expect(
    host.querySelector<HTMLTextAreaElement>('[aria-label="系列 3 数值（每行一项）"]')!.value,
  ).toBe('4\n8')
  click(button(host, '删除系列 3'))
  expect(host.querySelector('[aria-label="系列 2 名称"]')).not.toBeNull()
})
it('shows and persists doughnut hole size without exposing bar or axis parameters', async () => {
  const { host, applyAndRead } = await setup('doughnut')
  expect(host.querySelector('[aria-label="类别轴标题"]')).toBeNull()
  expect(host.querySelector('[aria-label="柱形间距（%）"]')).toBeNull()
  field(host, '圆环孔径（%）', '65', true)
  const result = await applyAndRead()
  expect(result.chart.holePct).toBe(65)
  expect(result.xml).toContain('<c:holeSize val="65"')
})

it('adds and removes native series with the exact user values after two saves', async () => {
  const { host, applyAndRead } = await setup()
  tab(host, '数据')
  click(button(host, '添加图表系列'))
  field(host, '系列 3 名称', '利润')
  field(host, '系列 3 数值（每行一项）', '9\n13')
  pickSelectOption(host, '要编辑的系列', '成本')
  click(button(host, '删除系列 2'))
  const result = await applyAndRead()
  expect(result.chart.series.map((s) => ({ name: s.name, values: s.values }))).toEqual([
    { name: '收入', values: [12, 18] },
    { name: '利润', values: [9, 13] },
  ])
})
it('resets an explicit native point color to the series color', async () => {
  const { host, applyAndRead } = await setup()
  tab(host, '配色')
  click(button(host, '数据点颜色'))
  click(button(host, '#7030A0'))
  click(button(host, '重置数据点颜色'))
  const result = await applyAndRead()
  expect(result.chart.series[0]!.pointColors?.[0]).toBeUndefined()
  expect(result.xml).not.toContain('<c:dPt>')
})
