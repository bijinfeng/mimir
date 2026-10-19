/** @vitest-environment happy-dom */
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { xlsxPivotFixture } from './xlsx-pivot-test-fixture.js'
import { XlsxObjectControls } from './XlsxObjectControls.js'
import { XlsxFormatControls } from './XlsxFormatControls.js'
import { XlsxManualControls } from './XlsxManualControls.js'
import { XlsxPropertyControls } from './XlsxPropertyControls.js'
import { XlsxRangeControls } from './XlsxRangeControls.js'
import { XlsxVisualProperties } from './XlsxVisualProperties.js'
import { selectRoot, pressMouseDown, pickSelectOption } from '../shell/antd-test-dom.js'
import type { XlsxVisual } from '../xlsx-visuals.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))
function mount(node: (busy: boolean) => ReactNode) {
  const host = document.createElement('div'),
    root = createRoot(host)
  document.body.append(host)
  const render = (busy = false) =>
    act(() =>
      root.render(
        <div className="mimir-editor">
          <div className="mimir-editor__body" />
          {node(busy)}
        </div>,
      ),
    )
  render()
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return { host, render }
}
async function click(host: ParentNode, label: string) {
  const target = host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!
  expect(target).not.toBeNull()
  await act(async () => {
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    target.click()
  })
}
function tab(host: ParentNode, text: string) {
  const target = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (item) => item.textContent === text,
  )!
  expect(target).not.toBeUndefined()
  act(() => target.click())
}
function type(host: ParentNode, label: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  expect(input).not.toBeNull()
  act(() => {
    input.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function cannotOpen(host: HTMLElement, labels: string[]) {
  for (const label of labels) {
    const select = selectRoot(host, label)
    expect(select.querySelector<HTMLInputElement>('input')!.disabled).toBe(true)
    pressMouseDown(select.querySelector('.ant-select-content') ?? select)
    expect(select.querySelector('[role="combobox"]')?.getAttribute('aria-expanded')).toBe('false')
  }
}

async function chooseLocalImage(
  panel: HTMLElement,
  image: (file: File, anchor: string) => Promise<boolean>,
) {
  expect(panel.querySelector('[aria-label="从设备选择图片"]')?.textContent).toBe('从设备选择图片')
  const input = panel.querySelector<HTMLInputElement>('input[type="file"]')!
  const file = new File(['PNG data'], 'local.png', { type: 'image/png' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  await vi.waitFor(() => expect(image).toHaveBeenCalledWith(file, 'H2'))
}

it.each(['chart', 'image', 'table'] as const)(
  'keeps %s footer parameters, visible file entry and busy actions after moving out of the fieldset',
  async (mode) => {
    const fixture = await xlsxPivotFixture(),
      operation = vi.fn<(op: Record<string, unknown>) => Promise<boolean>>(async () => true),
      image = vi.fn<(file: File, anchor: string) => Promise<boolean>>(async () => true)
    const app = mount((busy) => (
      <XlsxObjectControls
        sheet={fixture.sheet}
        sourceKey={fixture.workbook}
        contextKey="polish"
        range="A1:B6"
        busy={busy}
        selectedId=""
        onSelect={() => {}}
        onOperation={operation}
        onImage={image}
        onPivotOperation={async () => true}
      />
    ))
    await click(app.host, '图表、形状与结构化表')
    expect(app.host.querySelectorAll('[aria-label="插入对象类型"] [role="tab"]')).toHaveLength(6)
    if (mode !== 'chart') tab(app.host, mode === 'image' ? '图片' : '表格')
    const panel = app.host.querySelector<HTMLElement>('aside')!
    const label =
      mode === 'chart' ? '插入范围图表' : mode === 'table' ? '插入结构化表' : '插入工作表图片'
    if (mode === 'chart') {
      pickSelectOption(app.host, '图表类型', '折线图')
      type(panel, '左上角单元格', 'g4')
      type(panel, '图表标题（留空自动）', '首击图表')
    } else if (mode === 'table') {
      pickSelectOption(app.host, '表格样式', '中等 5')
      pickSelectOption(app.host, '表格隔行底色', '隐藏')
      type(panel, '表格名称（留空自动）', 'PolishedTable')
    } else {
      type(panel, '左上角单元格', 'h2')
      await chooseLocalImage(panel, image)
      type(panel, '公开图片网址（PNG/JPEG/GIF）', 'https://example.com/image.png')
    }
    const submit = panel.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!
    expect(submit.closest('fieldset')).toBeNull()
    // Separate the native draft blur and click as the browser does.
    act(() =>
      submit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })),
    )
    await act(async () => submit.click())
    expect(operation).toHaveBeenCalledTimes(1)
    expect(operation).toHaveBeenCalledWith(
      mode === 'chart'
        ? {
            op: 'add_chart',
            dataRange: 'A1:B6',
            chartType: 'line',
            title: '首击图表',
            anchorCell: 'G4',
          }
        : mode === 'table'
          ? {
              op: 'add_table',
              range: 'A1:B6',
              style: 'TableStyleMedium5',
              bandedRows: false,
              name: 'PolishedTable',
            }
          : { op: 'add_image', path: 'https://example.com/image.png', anchorCell: 'H2' },
    )
    app.render(true)
    expect(submit.disabled).toBe(true)
    if (mode !== 'image')
      cannotOpen(app.host, mode === 'chart' ? ['图表类型'] : ['表格样式', '表格隔行底色'])
    await click(app.host, '关闭工作表对象面板')
    expect(app.host.querySelector('aside')).toBeNull()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('图表、形状与结构化表')
  },
)

it.each([
  'format',
  'fill',
  'group',
  'rules',
  'conditional',
  'sparkline',
  'names',
  'print',
  'range',
  'visual',
  'series',
] as const)('%s cannot open any existing Select while its owner is busy', async (kind) => {
  const fixture = await xlsxPivotFixture(),
    operation = vi.fn<(op: Record<string, unknown>) => Promise<boolean>>(async () => true)
  fixture.workbook.definedNames = [{ name: 'SourceData', ref: '数据!$A$1:$B$6' }]
  const props = {
    sheet: fixture.sheet,
    workbook: fixture.workbook,
    range: 'A1:B6',
    onOperation: operation,
  }
  const visual: XlsxVisual = {
    id: 'chart1',
    kind: 'chart',
    name: '销售',
    drawingPath: 'xl/drawings/drawing1.xml',
    drawingIndex: 0,
    anchor: {
      fromRow: 0,
      fromColumn: 4,
      fromRowOffset: 0,
      fromColumnOffset: 0,
      toRow: 10,
      toColumn: 10,
      toRowOffset: 0,
      toColumnOffset: 0,
    },
    chart: {
      type: 'column',
      legend: 'right',
      dataLabels: 'none',
      grouping: 'clustered',
      series: ['销售'],
    },
  }
  const app = mount((busy) =>
    kind === 'format' ? (
      <XlsxFormatControls
        cells={fixture.sheet.rows.flatMap((row) => row.cells)}
        range="A1:B6"
        busy={busy}
        onFormat={operation}
      />
    ) : ['fill', 'group'].includes(kind) ? (
      <XlsxManualControls {...props} busy={busy} group={kind === 'fill' ? 'data' : 'layout'} />
    ) : ['rules', 'conditional', 'sparkline', 'names', 'print'].includes(kind) ? (
      <XlsxPropertyControls
        {...props}
        busy={busy}
        group={kind === 'names' ? 'names' : kind === 'print' ? 'print' : 'rules'}
      />
    ) : kind === 'range' ? (
      <XlsxRangeControls {...props} busy={busy} sheets={fixture.workbook.sheets} group="data" />
    ) : (
      <XlsxVisualProperties visual={visual} busy={busy} onApply={operation} />
    ),
  )
  const menu =
    kind === 'format'
      ? '范围字体与对齐'
      : kind === 'fill'
        ? '填充与闪填'
        : kind === 'group'
          ? '自动尺寸与分级'
          : ['rules', 'conditional', 'sparkline'].includes(kind)
            ? '数据规则与迷你图'
            : kind === 'names'
              ? '命名范围管理'
              : kind === 'print'
                ? '打印设置'
                : kind === 'range'
                  ? '范围写入与复制'
                  : null
  if (menu) await click(app.host, menu)
  if (kind === 'conditional') tab(app.host, '条件格式')
  if (kind === 'sparkline') tab(app.host, '迷你图')
  if (kind === 'range') tab(app.host, '复制')
  if (kind === 'series') tab(app.host, '系列数据')
  const labels =
    kind === 'format'
      ? ['范围水平对齐', '范围垂直对齐', '范围数字格式预设']
      : kind === 'fill'
        ? ['填充方式']
        : kind === 'group'
          ? ['分组方向']
          : kind === 'rules'
            ? ['验证类型']
            : kind === 'conditional'
              ? ['条件类型', '比较方式']
              : kind === 'sparkline'
                ? ['迷你图类型']
                : kind === 'names'
                  ? ['工作簿命名范围']
                  : kind === 'print'
                    ? ['纸张方向', '纸张大小', '页边距']
                    : kind === 'range'
                      ? ['复制源工作表']
                      : kind === 'series'
                        ? ['数据系列']
                        : ['图表类型', '图例位置', '数据标签', '系列排列']
  app.render(true)
  cannotOpen(app.host, labels)
  expect(operation).not.toHaveBeenCalled()
})

it('preserves sheet protection for property/range Selects while workbook names remain available', async () => {
  const fixture = await xlsxPivotFixture(),
    operation = vi.fn<(op: Record<string, unknown>) => Promise<boolean>>(async () => true)
  const sheet = {
    ...fixture.sheet,
    extras: {
      passwordProtected: false,
      hyperlinks: {},
      notes: {},
      richNotes: false,
      ...fixture.sheet.extras,
      protected: true,
    },
  }
  fixture.workbook.definedNames = [{ name: 'SourceData', ref: '数据!$A$1:$B$6' }]
  const names = mount((busy) => (
    <XlsxPropertyControls
      sheet={sheet}
      workbook={fixture.workbook}
      range="A1:B6"
      group="names"
      busy={busy}
      onOperation={operation}
    />
  ))
  await click(names.host, '命名范围管理')
  const selector = selectRoot(names.host, '工作簿命名范围')
  expect(selector.querySelector<HTMLInputElement>('input')!.disabled).toBe(false)
  pressMouseDown(selector.querySelector('.ant-select-content') ?? selector)
  expect(selector.querySelector('[role="combobox"]')?.getAttribute('aria-expanded')).toBe('true')
  const rules = mount((busy) => (
    <XlsxPropertyControls
      sheet={sheet}
      workbook={fixture.workbook}
      range="A1:B6"
      group="rules"
      busy={busy}
      onOperation={operation}
    />
  ))
  await click(rules.host, '数据规则与迷你图')
  cannotOpen(rules.host, ['验证类型'])
  const range = mount((busy) => (
    <XlsxRangeControls
      sheet={sheet}
      sheets={fixture.workbook.sheets}
      range="A1:B6"
      group="data"
      busy={busy}
      onOperation={operation}
    />
  ))
  await click(range.host, '范围写入与复制')
  tab(range.host, '复制')
  cannotOpen(range.host, ['复制源工作表'])
  expect(operation).not.toHaveBeenCalled()
})
