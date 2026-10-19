/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { afterEach, expect, it, vi } from 'vitest'
import {
  PptxEquationControls,
  PptxDiagramControls,
  PptxWordArtControls,
  PptxFieldControls,
} from './PptxInsertControls.js'
import type { PptxApply } from './PptxControlPanel.js'
import type { PptxUpload } from './PptxAssetControls.js'
import { PptxImportControls } from './PptxAssetControls.js'
import { PptxFreeformControls } from './PptxObjectControls.js'
import { ChartEditControls } from './PptxAdvancedControls.js'
import { PptxViewControls, defaultPptxView } from './PptxViewControls.js'
import { openPptxForEdit } from '../pptx.js'
import {
  openPptx,
  savePptx,
  elementDurableId,
} from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import {
  pickSelectOption,
  pressMouseDown,
  selectRoot,
  selectValueText,
} from '../shell/antd-test-dom.js'

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
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
async function mount(content: ReactNode) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () =>
    root.render(<ConfigProvider componentSize="small">{content}</ConfigProvider>),
  )
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return host
}
function button(host: HTMLElement, label: string) {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!found) throw new Error(`Missing ${label}`)
  return found
}
function click(host: HTMLElement, label: string) {
  act(() => button(host, label).click())
}
function blockedSelect(host: HTMLElement, label: string) {
  const root = selectRoot(host, label)
  const input = root.querySelector<HTMLInputElement>('[role="combobox"]')!
  expect(input.disabled).toBe(true)
  // The composite trigger is not a native select: exercise its actual pointer and keyboard paths.
  pressMouseDown(root.querySelector('.ant-select-content') ?? root)
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
  expect(input.getAttribute('aria-expanded')).not.toBe('true')
}
async function waitUntil(done: () => boolean) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(done()).toBe(true)
  })
}

it.each([
  { kind: 'equation', action: '插入公式', label: '公式模板', option: '分式', op: 'insertEquation' },
  { kind: 'diagram', action: '插入图示', label: '图示类型', option: '循环', op: 'addSmartArt' },
  { kind: 'wordart', action: '插入艺术字', label: '艺术字样式', option: '金色', op: 'addElement' },
  { kind: 'field', action: '插入动态字段', label: '字段类型', option: '日期', op: 'addElement' },
])(
  'locks $kind selects during one deferred write and unlocks unchanged drafts after refusal',
  async ({ kind, action, label, option, op }) => {
    const pending = deferred<boolean>()
    const apply = vi.fn<PptxApply>(() => pending.promise)
    const props = { slide: 2, width: 9144000, height: 6858000, apply }
    const content =
      kind === 'equation' ? (
        <PptxEquationControls {...props} target={null} />
      ) : kind === 'diagram' ? (
        <PptxDiagramControls {...props} />
      ) : kind === 'wordart' ? (
        <PptxWordArtControls {...props} />
      ) : (
        <PptxFieldControls {...props} />
      )
    const host = await mount(content)
    pickSelectOption(host, label, option)
    const draft = selectValueText(host, label)
    // Two invocations before a render still submit only one native request.
    act(() => {
      button(host, action).click()
      button(host, action).click()
    })
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply.mock.calls[0]).toEqual([expect.objectContaining({ op, target: { slide: 2 } })])
    blockedSelect(host, label)
    if (kind === 'equation') blockedSelect(host, '插入位置')
    expect(Boolean(host.querySelector('[role="status"]'))).toBe(
      kind === 'equation' || kind === 'diagram',
    )
    await act(async () => {
      pending.resolve(false)
      await pending.promise
    })
    expect(host.querySelector('[aria-busy="true"]')).toBeNull()
    expect(selectValueText(host, label)).toBe(draft)
    pickSelectOption(host, label, option)
    expect(host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!.disabled).toBe(false)
  },
)

it('locks import format while reading the actual source and during one upload, then preserves a refused draft for retry', async () => {
  const pendingRead = deferred<ArrayBuffer>()
  const pendingUpload = deferred<boolean>()
  const upload = vi.fn<PptxUpload>(() => pendingUpload.promise)
  const host = await mount(<PptxImportControls afterIndex={1} upload={upload} />)
  const file = new File([], 'source.pptx')
  Object.defineProperties(file, {
    size: { value: fixture.byteLength },
    arrayBuffer: { value: () => pendingRead.promise },
  })
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  act(() => input.dispatchEvent(new Event('change', { bubbles: true })))
  blockedSelect(host, '导入格式')
  pendingRead.resolve(fixture.slice().buffer)
  await waitUntil(
    () => !button(host, '导入幻灯片').disabled && !host.querySelector('[aria-busy="true"]'),
  )
  pickSelectOption(host, '导入格式', '保留源格式')
  act(() => {
    button(host, '导入幻灯片').click()
    button(host, '导入幻灯片').click()
  })
  expect(upload).toHaveBeenCalledTimes(1)
  expect(upload).toHaveBeenCalledWith(
    { kind: 'import_slides', afterIndex: 1, slideIndices: [0], keepSourceFormatting: true },
    file,
  )
  blockedSelect(host, '导入格式')
  await act(async () => {
    pendingUpload.resolve(false)
    await pendingUpload.promise
  })
  expect(host.querySelector('[aria-busy="true"]')).toBeNull()
  expect(selectValueText(host, '导入格式')).toBe('保留源格式')
  expect(button(host, '导入幻灯片').disabled).toBe(false)
})

it('locks the outside-fieldset path mode throughout the nested curve write, then restores it', async () => {
  const session = await openPptxForEdit(fixture)
  const element = session.slides()[0]!.elements.find((item) => item.type === 'text')!
  if (element.type !== 'text') throw new Error('Expected fixture text')
  const pending = deferred<boolean>()
  const apply = vi.fn<PptxApply>(() => pending.promise)
  const host = await mount(
    <PptxFreeformControls
      element={element}
      target={{ slide: 0, el: elementDurableId(element)! }}
      apply={apply}
    />,
  )
  pickSelectOption(host, '路径编辑方式', '曲线与开放路径')
  click(host, '添加路径节点')
  click(host, '应用曲线路径')
  blockedSelect(host, '路径编辑方式')
  blockedSelect(host, '路径闭合')
  blockedSelect(host, '当前节点')
  blockedSelect(host, '新节点类型')
  expect(apply).toHaveBeenCalledTimes(1)
  await act(async () => {
    pending.resolve(true)
    await pending.promise
  })
  pickSelectOption(host, '路径编辑方式', '多边形顶点')
  expect(host.querySelector('[aria-label="形状顶点（每行x,y）"]')).not.toBeNull()
})

it.each(['style', 'colors', 'data'] as const)(
  'locks actual chart %s selects while saving and unlocks after completion',
  async (section) => {
    const source = await openPptx(fixture)
    expect(
      runTxn(source, {
        isolation: 'atomic',
        ops: [
          {
            op: 'addChart',
            target: { slide: 0 },
            kind: 'bar',
            title: '季度数据',
            categories: ['Q1', 'Q2'],
            series: [{ name: '收入', values: [12, 18] }],
            offset: { x: 914400, y: 1371600, cx: 5486400, cy: 2743200 },
          },
        ],
      }).applied,
    ).toBe(true)
    const session = await openPptxForEdit(await savePptx(source))
    const chart = session.slides()[0]!.elements.find((item) => item.type === 'chart')!
    if (chart.type !== 'chart') throw new Error('Expected chart')
    const pending = deferred<boolean>()
    const apply = vi.fn<PptxApply>(() => pending.promise)
    const host = await mount(
      <ChartEditControls
        chart={chart}
        target={{ slide: 0, el: elementDurableId(chart)! }}
        apply={apply}
      />,
    )
    pickSelectOption(host, '图表样式预设', '详细')
    if (section !== 'style')
      act(() =>
        [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
          .find((tab) => tab.textContent === (section === 'colors' ? '配色' : '数据'))!
          .click(),
      )
    click(host, '应用图表修改')
    expect(apply).toHaveBeenCalledTimes(1)
    const labels =
      section === 'style'
        ? ['更改图表类型', '图例位置', '数据标签', '图表样式预设', '图表网格线', '柱形方向']
        : section === 'colors'
          ? ['图表配色方案', '要配色的系列', '数据点所属系列', '数据点类别']
          : ['要编辑的系列']
    for (const label of labels) blockedSelect(host, label)
    await act(async () => {
      pending.resolve(true)
      await pending.promise
    })
    expect(host.querySelector('[aria-busy="true"]')).toBeNull()
    expect(host.querySelector<HTMLInputElement>(`[aria-label="${labels[0]}"]`)!.disabled).toBe(
      false,
    )
  },
)

it('keeps read-only canvas zoom usable while a separate document write is pending', async () => {
  const pending = deferred<boolean>()
  const apply = vi.fn<PptxApply>(() => pending.promise)
  const change = vi.fn<(value: typeof defaultPptxView) => void>()
  const host = await mount(
    <>
      <PptxEquationControls
        slide={0}
        width={9144000}
        height={6858000}
        target={null}
        apply={apply}
      />
      <PptxViewControls value={defaultPptxView} change={change} />
    </>,
  )
  click(host, '插入公式')
  blockedSelect(host, '公式模板')
  pickSelectOption(host, '幻灯片缩放', '150%')
  expect(change).toHaveBeenCalledWith({ ...defaultPptxView, zoom: '150' })
  await act(async () => {
    pending.resolve(true)
    await pending.promise
  })
})
