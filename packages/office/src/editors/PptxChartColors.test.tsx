/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import { PptxEditor } from './PptxEditor.js'
import { openPptxForEdit } from '../pptx.js'
import {
  elementDurableId,
  openPptx,
  savePptx,
} from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn, type Op } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import type { PptxHostApply } from '../agent/pptx-agent.js'
import { pickSelectOption, selectValueText } from '../shell/antd-test-dom.js'

const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((run) => run())
  vi.restoreAllMocks()
})
const accents = ['102030', '204060', '306090', '4080C0', '50A0F0', '60C020']
async function fixture(kind: 'bar' | 'pie' = 'bar') {
  const zip = await JSZip.loadAsync(
    readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures/title-layout.pptx'),
    ),
  )
  let theme = await zip.file('ppt/theme/theme1.xml')!.async('string')
  accents.forEach((color, index) => {
    theme = theme.replace(
      new RegExp(`<a:accent${index + 1}>[\\s\\S]*?</a:accent${index + 1}>`),
      `<a:accent${index + 1}><a:srgbClr val="${color}"/></a:accent${index + 1}>`,
    )
  })
  zip.file('ppt/theme/theme1.xml', theme)
  const opened = await openPptx(await zip.generateAsync({ type: 'uint8array' }))
  expect(
    runTxn(opened, {
      isolation: 'atomic',
      ops: [
        {
          op: 'addChart',
          target: { slide: 0 },
          kind,
          title: '主题图表',
          categories: ['甲', '乙'],
          series: [
            { name: '收入', values: [12, 18] },
            ...(kind === 'bar' ? [{ name: '成本', values: [3, 5] }] : []),
          ],
          colorScheme: ['#334455', '#556677'],
          offset: { x: 914400, y: 1371600, cx: 5486400, cy: 2743200 },
        },
      ],
    }).applied,
  ).toBe(true)
  const chart = opened.deck.slides[0]!.elements.find((item) => item.type === 'chart')!
  expect(
    runTxn(opened, {
      isolation: 'atomic',
      ops: [
        {
          op: 'setChart',
          target: { slide: 0, el: elementDurableId(chart)! },
          patch: {
            pointColors: {
              0: { 0: '#1A2B3C' },
              ...(kind === 'bar' ? { 1: { 1: '#F0E1D2' } } : {}),
            },
          },
        },
      ],
    }).applied,
  ).toBe(true)
  const session = await openPptxForEdit(await savePptx(opened))
  return session.save()
}
function click(node: Element) {
  act(() => node.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}
function button(host: HTMLElement, label: string) {
  const node = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!node) throw new Error(`Missing ${label}`)
  return node
}
function tab(host: HTMLElement, label: string) {
  click([...host.querySelectorAll('[role="tab"]')].find((item) => item.textContent === label)!)
}
async function settle(done: () => boolean) {
  for (let index = 0; index < 100; index++) {
    if (done()) return
    await act(async () => {
      await new Promise((finish) => setTimeout(finish, 5))
    })
  }
  expect(done()).toBe(true)
}
function custom(host: HTMLElement, label: string, value: string) {
  click(button(host, label))
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}自定义 RGB"]`)!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  click(button(host, `使用${label}自定义颜色`))
}
function text(host: HTMLElement, label: string, value: string) {
  const input = host.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${label}"]`)!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.keys(zip.files)
        .filter((name) => !zip.files[name]!.dir)
        .map(async (name) => [name, await zip.file(name)!.async('uint8array')]),
    ),
  )
}

it('applies actual theme variants and custom series/point RGB once, preserving other overrides and native save/undo/redo bytes', async () => {
  const bytes = await fixture(),
    host = document.createElement('div'),
    root = createRoot(host),
    saved: Uint8Array[] = []
  const nativeHost = vi.fn<PptxHostApply>(async (request) => {
    const source = await openPptx(request.bytes)
    const txn = runTxn(source, { isolation: 'atomic', ops: request.ops as Op[] })
    expect(txn.failures ?? []).toEqual([])
    expect(txn.applied).toBe(true)
    return {
      bytes: await savePptx(source),
      records: txn.records ?? [],
      version: request.expectedVersion + 1,
    }
  })
  document.body.append(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () =>
    root.render(
      <PptxEditor
        documentId="chart-colors"
        io={{
          load: async () => bytes,
          save: async (value) => {
            saved.push(value)
          },
        }}
        hostApply={nativeHost}
      />,
    ),
  )
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await settle(() => !!host.querySelector('.mimir-pptx-slide [data-element-kind="chart"]'))
  click(host.querySelector('.mimir-pptx-slide [data-element-kind="chart"]')!)
  tab(host, '对象')
  click(button(host, '对象与幻灯片操作'))
  click(
    [...host.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === '编辑图表',
    )!,
  )
  tab(host, '配色')
  expect(host.textContent).toContain('当前系列：#334455')
  expect(host.textContent).toContain('当前数据点：#1A2B3C')
  click(button(host, '所选系列颜色'))
  const colorInput = host.querySelector<HTMLInputElement>('[aria-label="所选系列颜色自定义 RGB"]')!
  await act(async () => {
    colorInput.focus()
    colorInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
  })
  expect(host.querySelector('[aria-label="所选系列颜色自定义 RGB"]')).toBeNull()
  expect(host.querySelector('[aria-label="编辑图表面板"]')).not.toBeNull()
  expect(document.activeElement).toBe(button(host, '所选系列颜色'))
  expect(nativeHost).not.toHaveBeenCalled()
  pickSelectOption(host, '图表配色方案', '主题单色 · 强调色 3')
  expect(host.textContent).toContain('当前系列：#24486C')
  custom(host, '所选系列颜色', '#13579b')
  expect(selectValueText(host, '图表配色方案')).toBe('自定义配色')
  expect(host.textContent).toContain('当前系列：#13579B')
  click(button(host, '恢复所选系列颜色'))
  expect(host.textContent).toContain('当前系列：#334455')
  expect(button(host, '恢复所选系列颜色').disabled).toBe(true)
  custom(host, '所选系列颜色', '#13579b')
  pickSelectOption(host, '数据点所属系列', '成本')
  custom(host, '数据点颜色', '#2468ac')
  expect(host.textContent).toContain('当前数据点：#2468AC')
  expect(nativeHost).not.toHaveBeenCalled()
  click(button(host, '应用图表修改'))
  await settle(
    () => nativeHost.mock.calls.length === 1 && !host.querySelector('[aria-busy="true"]'),
  )
  const save = async () => {
    const index = saved.length
    click(button(host, '保存到库'))
    await settle(() => saved.length === index + 1 && button(host, '保存到库').disabled)
    return saved.at(-1)!
  }
  const changed = await save(),
    session = await openPptxForEdit(changed),
    chart = session.slides()[0]!.elements.find((item) => item.type === 'chart')!
  expect(chart.type).toBe('chart')
  if (chart.type !== 'chart') throw new Error('Chart missing')
  expect(chart.chart.series.map((series) => series.color)).toEqual(['#13579B', '#306090'])
  expect(chart.chart.series[0]!.pointColors?.[0]).toBe('#1A2B3C')
  expect(chart.chart.series[1]!.pointColors).toEqual(['#2468AC', '#F0E1D2'])
  expect(chart.chart.series.map((series) => series.values)).toEqual([
    [12, 18],
    [3, 5],
  ])
  const changedEntries = await entries(changed),
    beforeEntries = await entries(bytes)
  const chartPart = Object.keys(changedEntries).find((name) =>
    /^ppt\/charts\/chart\d+\.xml$/.test(name),
  )!
  const xml = new TextDecoder().decode(changedEntries[chartPart])
  expect(xml).toContain('<a:srgbClr val="13579B"')
  expect(xml).toContain('<a:srgbClr val="2468AC"')
  const untouchedNames = Object.keys(beforeEntries).filter((name) => name !== chartPart)
  expect(Object.fromEntries(untouchedNames.map((name) => [name, changedEntries[name]]))).toEqual(
    Object.fromEntries(untouchedNames.map((name) => [name, beforeEntries[name]])),
  )
  expect(await entries(await session.save())).toEqual(changedEntries)
  session.commit()
  expect(await entries(await session.save())).toEqual(changedEntries)
  click(button(host, '撤销'))
  expect(button(host, '撤销').disabled).toBe(true)
  expect(await entries(await save())).toEqual(beforeEntries)
  click(button(host, '重做'))
  expect(button(host, '重做').disabled).toBe(true)
  expect(await entries(await save())).toEqual(changedEntries)
  expect(nativeHost).toHaveBeenCalledTimes(1)
})

it('changes visible pie defaults on every scheme choice, keeps manual point overrides, and restores inheritance across tabs', async () => {
  const bytes = await fixture('pie'),
    host = document.createElement('div'),
    root = createRoot(host),
    saved: Uint8Array[] = []
  const nativeHost = vi.fn<PptxHostApply>(async (request) => {
    const source = await openPptx(request.bytes)
    const txn = runTxn(source, { isolation: 'atomic', ops: request.ops as Op[] })
    expect(txn.failures ?? []).toEqual([])
    expect(txn.applied).toBe(true)
    return {
      bytes: await savePptx(source),
      records: txn.records ?? [],
      version: request.expectedVersion + 1,
    }
  })
  document.body.append(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () =>
    root.render(
      <PptxEditor
        documentId="pie-colors"
        io={{
          load: async () => bytes,
          save: async (value) => {
            saved.push(value)
          },
        }}
        hostApply={nativeHost}
      />,
    ),
  )
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await settle(() => !!host.querySelector('.mimir-pptx-slide [data-element-kind="chart"]'))
  click(host.querySelector('.mimir-pptx-slide [data-element-kind="chart"]')!)
  tab(host, '对象')
  click(button(host, '对象与幻灯片操作'))
  click(
    [...host.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === '编辑图表',
    )!,
  )
  tab(host, '配色')
  expect(host.querySelector('[aria-label="所选系列颜色"]')).toBeNull()
  pickSelectOption(host, '图表配色方案', '主题单色 · 强调色 3')
  pickSelectOption(host, '图表配色方案', '主题多彩 · 变体')
  pickSelectOption(host, '图表配色方案', '保留当前配色')
  expect(button(host, '应用图表修改').disabled).toBe(true)
  pickSelectOption(host, '数据点类别', '乙')
  pickSelectOption(host, '图表配色方案', '主题单色 · 强调色 3')
  expect(host.textContent).toContain('当前数据点：#306090')
  pickSelectOption(host, '图表配色方案', '主题单色 · 强调色 4')
  expect(host.textContent).toContain('当前数据点：#4080C0')
  custom(host, '数据点颜色', '#abcdef')
  pickSelectOption(host, '图表配色方案', '主题单色 · 强调色 1')
  expect(host.textContent).toContain('当前数据点：#ABCDEF')
  click(button(host, '重置数据点颜色'))
  expect(host.textContent).toContain('当前数据点：#102030')
  tab(host, '数据')
  text(host, '类别（每行一项）', '甲\n乙\n丙')
  text(host, '系列 1 数值（每行一项）', '12\n18\n24')
  tab(host, '配色')
  pickSelectOption(host, '数据点类别', '乙')
  expect(host.textContent).toContain('当前数据点：#102030')
  click(button(host, '应用图表修改'))
  await settle(
    () => nativeHost.mock.calls.length === 1 && !host.querySelector('[aria-busy="true"]'),
  )
  click(button(host, '保存到库'))
  await settle(() => saved.length === 1)
  const session = await openPptxForEdit(saved[0]!),
    chart = session.slides()[0]!.elements.find((item) => item.type === 'chart')!
  if (chart.type !== 'chart') throw new Error('Chart missing')
  expect(chart.chart.series[0]!.pointColors).toEqual(['#1A2B3C', '#102030', '#4C5864'])
  expect(host.querySelector('.mimir-pptx-slide')?.innerHTML).toContain('#102030')
  const changedEntries = await entries(saved[0]!)
  expect(await entries(await session.save())).toEqual(changedEntries)
  click(button(host, '撤销'))
  click(button(host, '保存到库'))
  await settle(() => saved.length === 2)
  expect(await entries(saved[1]!)).toEqual(await entries(bytes))
  click(button(host, '重做'))
  click(button(host, '保存到库'))
  await settle(() => saved.length === 3)
  expect(await entries(saved[2]!)).toEqual(changedEntries)
})
