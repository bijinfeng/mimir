/**
 * @vitest-environment happy-dom
 *
 * xlsx 工具条的**行为契约**。
 *
 * 这些断言守的是这个仓库最在意的一类错：**按钮接了一个不存在的命令**。
 * 那种按钮点了没反应、也不报错，看代码看不出来（链式调用照样返回成功）。
 * 所以这里不测「长什么样」，只测**每个按钮真的落到了内核上**——
 * 逐项走完「点它 → 模型/文件真的变了」：
 *
 * | 按钮 | 断言的落点 |
 * |---|---|
 * | 清空 | 保存出来的 `sheet1.xml` 里那一格变成空的内联字符串格，`sharedStrings.xml` 一字节没动 |
 * | 复制 | `navigator.clipboard.writeText` 收到了那一格的文字 |
 * | 查找上一个 / 下一个 | 选中的格子真的换成了命中 / 前一个命中 |
 * | 公式格跳转 | 选中的格子是夹具里那一格公式（C3） |
 * | 十字高亮 | 渲染出来的行与列真的带上了 `--cross` |
 *
 * 另有一组**控件契约**（`没有绕过点` 那一段）：这个格式的控件现在全走
 * `EditorShell` 的 antd 原语，而没有断言的「已经换好了」会在下一次改动里
 * 静默退回去——多一个裸 `<input>` 就是「同一排两种高度、两种焦点环」的起点。
 *
 * 夹具是 vendored 的 `xlsx-fixture.xlsx`（与 `xlsx-edit.test.ts` 同一份）：
 * A2「姓名」、B2「部门」、C2「工号」、C3 是公式格（缓存值 1001）、
 * B5「市场部 & <测试>」、C5 数字 88.5。
 */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { xlsxManualOperationSchema, XLSX_MANUAL_OPS } from '@mimir/shared'
import { applyXlsxManualOperation } from '../../../../apps/server/src/services/xlsx-manual-ops.js'
import { applyXlsxSpecialPaste } from '../../../../apps/server/src/services/xlsx-special-paste-host.js'
import { XlsxEditor } from './XlsxEditor.js'
import type { EditorIo, SaveTarget } from './types.js'
import {
  applyCellEditsToXlsx,
  readBasicWorkbook,
} from '../../vendor/packages/xlsx-gateway/src/gateway/xlsx-gateway.js'
import {
  parseAddress,
  parseRange,
  formatAddress,
} from '../../vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import type { StructuralOp } from '../../vendor/packages/xlsx-gateway/src/gateway/xlsx-structure.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
import {
  applyXlsxPropertyOperation,
  XLSX_PROPERTY_OPS,
} from '../../../../apps/server/src/services/xlsx-agent-properties.js'
import { applyXlsxFeatureOperation } from '../../../../apps/server/src/services/xlsx-agent-features.js'
import { readXlsx } from '../xlsx.js'
import { applyXlsxRangeOperation } from '../../../../apps/server/src/services/xlsx-agent-range.js'
import {
  applyXlsxObjectOperation,
  XLSX_OBJECT_OPS,
} from '../../../../apps/server/src/services/xlsx-agent-objects.js'
import {
  expandToPrimitiveOps,
  workbookOperationSchema,
} from '../../vendor/packages/xlsx-gateway/src/domain/workbook-dsl.js'
import type { XlsxAgentHandle, XlsxHostApply } from '../agent/xlsx-agent.js'

/**
 * 夹具路径用 `import.meta.dirname` 拼，**不用 `new URL(..., import.meta.url)`**。
 *
 * happy-dom 会替换全局 `URL`，于是 `readFileSync(new URL(…))` 抛
 * 「The URL must be of scheme file」——`.trellis/spec/office/engine/index.md` 记着这条
 * （实测过：解析类测试整片挂掉）。这个文件要 DOM，所以必须绕开那个全局。
 */
const FIXTURE = join(
  import.meta.dirname,
  '../../vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
)

/* ── 挂载工具（与 EditorShell.test.tsx 同一套手法） ────────────── */

const mounted: { unmount: () => void }[] = []

afterEach(() => {
  for (const item of mounted) item.unmount()
  mounted.length = 0
})

function mount(node: Parameters<typeof createRoot>[1] extends never ? never : React.ReactNode) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  act(() => root.render(node))
  let live = true
  const unmount = () => {
    if (!live) return
    live = false
    act(() => root.unmount())
    host.remove()
  }
  mounted.push({ unmount })
  return host
}

/**
 * 等异步的「读字节 → 解析」跑完。
 *
 * 解析是 promise 链（`useSource` 读 → `useParsed` 解析），一次宏任务不够，
 * 所以循环到表格出现或超时——**超时要报错**，不然断言会在一个空白页上通过。
 */
async function waitForTable(host: HTMLElement): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    if (host.querySelector('.mimir-xlsx') !== null) return
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  throw new Error(`表格没渲染出来。界面现在是：${host.textContent ?? ''}`)
}

async function waitForGrid(host: HTMLElement, ready: () => boolean): Promise<void> {
  const deadline = Date.now() + 3_000
  while (Date.now() < deadline) {
    if (ready()) return
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  }
  if (ready()) return
  throw new Error(
    `网格没有更新。状态：${host.querySelector('.mimir-editor__status')?.textContent ?? ''}；工作表：${[
      ...host.querySelectorAll('.mimir-compact-toolbar__sheet-tabs .me-tab'),
    ]
      .map(
        (tab) =>
          `${tab.textContent ?? ''}${tab.getAttribute('aria-selected') === 'true' ? '（当前）' : ''}`,
      )
      .join('、')}`,
  )
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

function selectRibbonTab(host: HTMLElement, label: string) {
  const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (element) => element.textContent?.trim() === label,
  )
  if (!tab) throw new Error(`工具栏没有「${label}」分类`)
  click(tab)
}

/** 敲一个键（回车 / Esc 的语义全在 `keydown` 上） */
function press(element: Element, key: string) {
  act(() => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

/**
 * 往受控输入里真的输入（走原型上的 setter，见 EditorShell.test.tsx 的说明）。
 *
 * 参数是 `Element`（`byLabelPrefix` 返回的就是它）——这里显式判一下它是不是
 * `<input>`，不然一个查错元素的选择器会让测试在一句难懂的报错上停住。
 */
function type(element: Element, value: string) {
  if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) {
    throw new Error(`这不是一个输入框，是 <${element.tagName.toLowerCase()}>`)
  }
  const setter = Object.getOwnPropertyDescriptor(
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype,
    'value',
  )?.set
  setter?.call(element, value)
  act(() => {
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** 按 aria-label 找一个控件（按钮的 label 就是这个仓库的可访问名称） */
function byLabel(host: HTMLElement, label: string): HTMLElement {
  const found = host.querySelector<HTMLElement>(`[aria-label="${label}"]`)
  if (found === null)
    throw new Error(`界面上没有「${label}」。现有控件：${labels(host).join('、')}`)
  return found
}

function labels(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>('[aria-label]')].map(
    (el) => el.getAttribute('aria-label') ?? '',
  )
}

/** 「清空」按钮的 label 里带代价说明（tooltip 即无障碍名称），所以取前缀匹配 */
function byLabelPrefix(host: HTMLElement, prefix: string): HTMLElement {
  const found = [...host.querySelectorAll<HTMLElement>('[aria-label]')].find((el) =>
    (el.getAttribute('aria-label') ?? '').startsWith(prefix),
  )
  if (found === undefined) throw new Error(`界面上没有以「${prefix}」开头的控件`)
  return found
}

/**
 * 第 `rowNumber` 行、第 `col` 列的那个 `<td>`。
 *
 * **不能按下标取**：合并覆盖的格不渲染（夹具的 A1 跨了 3 列，B1/C1 就没有
 * `<td>`），而列号是文件里的列号。所以按 `colSpan` 累加着找。
 */
function cellAt(host: HTMLElement, rowNumber: number, col: number): HTMLTableCellElement {
  const row = [...host.querySelectorAll('tr')].find(
    (tr) => tr.querySelector('th')?.textContent === String(rowNumber),
  )
  if (row === undefined) throw new Error(`表格里没有第 ${rowNumber} 行`)
  let cursor = 0
  for (const td of row.querySelectorAll<HTMLTableCellElement>('td')) {
    if (cursor === col) return td
    cursor += Number(td.getAttribute('colspan') ?? 1)
  }
  throw new Error(`第 ${rowNumber} 行没有第 ${col} 列`)
}

/** 现在选中的那个格（`--on` 是选中态的唯一真相，见 shell.css） */
function selectedCell(host: HTMLElement): HTMLTableCellElement | null {
  return host.querySelector<HTMLTableCellElement>('.mimir-xlsx__cell--on')
}

/** 假的宿主：读夹具，存下来供断言 */
function fakeIo(bytes?: Uint8Array): { io: EditorIo; saved: () => Uint8Array | null } {
  let saved: Uint8Array | null = null
  return {
    io: {
      load: async () => bytes ?? new Uint8Array(readFileSync(FIXTURE)),
      save: async (next: Uint8Array, _target: SaveTarget) => {
        saved = next
      },
    },
    saved: () => saved,
  }
}

/**
 * 给夹具接一张空工作表，做出**多表**的工作簿（第二张叫「第二张」）。
 *
 * 为什么需要它：页签（`.me-tab`）只在 `view.sheets.length > 1` 时渲染，
 * 而原来的夹具只有一张表——于是「多工作表时页签仍是裸 button」这条现状
 * 没有任何断言在守，`SHELL_NON_ANTD` 那条白名单里的 `.me-tab` 也在空转
 * （它声明「排除了 4 类」，实际只验证了「这 4 类都不存在」）。
 *
 * 手工拼这几条 XML 就够了（夹具本身是极简结构）：新条目进 zip、workbook 加
 * 一行 `<sheet>`、rels 加一条关系。**不动 sheet1**，所以其余断言的前提不变。
 */
async function withSecondSheet(empty = false): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(new Uint8Array(readFileSync(FIXTURE)))
  zip.file(
    'xl/worksheets/sheet2.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (empty
        ? '<sheetData/>'
        : '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>第二张</t></is></c></row></sheetData>') +
      '</worksheet>',
  )
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string')
  zip.file(
    'xl/_rels/workbook.xml.rels',
    rels.replace(
      '</Relationships>',
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    ),
  )
  const workbook = await zip.file('xl/workbook.xml')!.async('string')
  zip.file(
    'xl/workbook.xml',
    workbook.replace(
      '</sheets>',
      '<sheet name="第二张" sheetId="2" r:id="rId3" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets>',
    ),
  )
  return zip.generateAsync({ type: 'uint8array' })
}

const fakeHostApply: XlsxHostApply = async ({ bytes, expectedVersion, ops }) => {
  const workbook = await readBasicWorkbook(Buffer.from(bytes))
  const sheets = new Map(workbook.snapshot.sheets.map((sheet) => [sheet.id, sheet]))
  const first = ops[0] as {
    op: string
    sheetId: string
    row?: number
    count?: number
    column?: string
    heightPoints?: number
    widthPx?: number
    source?: string
    target?: string
    range?: string
    name?: string
    hidden?: boolean
    format?: Record<string, unknown>
  }
  if (XLSX_MANUAL_OPS.has(first.op as never))
    return applyXlsxManualOperation(bytes, xlsxManualOperationSchema.parse(first), expectedVersion)
  if (XLSX_PROPERTY_OPS.has(first.op))
    return applyXlsxPropertyOperation(bytes, workbookOperationSchema.parse(first), expectedVersion)
  if (XLSX_OBJECT_OPS.has(first.op))
    return applyXlsxObjectOperation(bytes, workbookOperationSchema.parse(first), expectedVersion)
  if (['set_hyperlink', 'set_note', 'protect_sheet'].includes(first.op))
    return applyXlsxFeatureOperation(bytes, workbookOperationSchema.parse(first), expectedVersion)
  if (['copy_range', 'fill_range', 'convert_to_values'].includes(first.op))
    return applyXlsxRangeOperation(
      bytes,
      workbook,
      workbookOperationSchema.parse(first),
      expectedVersion,
    )
  if (first.op === 'set_sheet_hidden') {
    const sheet = sheets.get(first.sheetId)
    if (!sheet || first.hidden === undefined) throw new Error('工作表隐藏参数无效')
    const result = await applyCellEditsToXlsx(Buffer.from(bytes), [], [], [], {
      renames: [],
      additions: [],
      removals: [],
      order: workbook.snapshot.sheets.map((item) => item.name),
      hiddenChanges: [{ sheetName: sheet.name, hidden: first.hidden }],
    })
    return {
      bytes: new Uint8Array(result.buffer),
      version: expectedVersion + 1,
      changedCells: [],
      touchedEntries: [...result.touchedEntries],
    }
  }
  if (first.op === 'rename_sheet') {
    const sheet = sheets.get(first.sheetId)
    if (!sheet || !first.name) throw new Error('工作表改名参数无效')
    const result = await applyCellEditsToXlsx(Buffer.from(bytes), [], [], [], {
      renames: [{ sheetName: sheet.name, newName: first.name }],
      additions: [],
      removals: [],
      order: workbook.snapshot.sheets.map((item) =>
        item.id === sheet.id ? first.name! : item.name,
      ),
    })
    return {
      bytes: new Uint8Array(result.buffer),
      version: expectedVersion + 1,
      changedCells: [],
      touchedEntries: [...result.touchedEntries],
    }
  }
  if (first.op === 'add_sheet') {
    if (!first.name) throw new Error('缺少新工作表名称')
    const result = await applyCellEditsToXlsx(Buffer.from(bytes), [], [], [], {
      renames: [],
      additions: [{ name: first.name }],
      removals: [],
      order: [...workbook.snapshot.sheets.map((item) => item.name), first.name],
    })
    return {
      bytes: new Uint8Array(result.buffer),
      version: expectedVersion + 1,
      changedCells: [],
      touchedEntries: [...result.touchedEntries],
    }
  }
  if (
    [
      'insert_rows',
      'delete_rows',
      'insert_cols',
      'delete_cols',
      'set_col_width',
      'set_row_height',
      'set_rows_hidden',
      'set_cols_hidden',
      'merge_cells',
      'unmerge_cells',
    ].includes(first.op)
  ) {
    const sheet = sheets.get(first.sheetId)
    if (!sheet) throw new Error('工作表已失效')
    const column = first.column ? parseAddress(`${first.column}1`).column : undefined
    const native: StructuralOp =
      first.op === 'set_row_height'
        ? {
            kind: 'set-row-size',
            start: first.row! - 1,
            end: first.row! + (first.count ?? 1) - 2,
            size: first.heightPoints!,
          }
        : first.op === 'set_rows_hidden'
          ? {
              kind: 'set-rows-hidden',
              start: first.row! - 1,
              end: first.row! + (first.count ?? 1) - 2,
              hidden: first.hidden!,
            }
          : first.op === 'set_cols_hidden'
            ? {
                kind: 'set-cols-hidden',
                start: column!,
                end: column! + (first.count ?? 1) - 1,
                hidden: first.hidden!,
              }
            : first.op === 'merge_cells' || first.op === 'unmerge_cells'
              ? {
                  kind: first.op === 'merge_cells' ? 'merge-cells' : 'unmerge-cells',
                  range: parseRange(first.range!),
                }
              : first.op === 'insert_rows'
                ? { kind: 'insert-rows', index: first.row! - 1, count: first.count! }
                : first.op === 'delete_rows'
                  ? { kind: 'remove-rows', index: first.row! - 1, count: first.count! }
                  : first.op === 'insert_cols'
                    ? { kind: 'insert-cols', index: column!, count: first.count! }
                    : first.op === 'delete_cols'
                      ? { kind: 'remove-cols', index: column!, count: first.count! }
                      : {
                          kind: 'set-col-size',
                          start: column!,
                          end: column!,
                          size: (first.widthPx! - 5) / 7,
                        }
    const result = await applyCellEditsToXlsx(
      Buffer.from(bytes),
      [],
      [
        {
          sheetName: sheet.name,
          ops: [native],
        },
      ],
    )
    return {
      bytes: new Uint8Array(result.buffer),
      version: expectedVersion + 1,
      changedCells: [],
      touchedEntries: [...result.touchedEntries],
    }
  }
  if (first.op === 'format_range') {
    const sheet = sheets.get(first.sheetId)
    if (!sheet) throw new Error('工作表已失效')
    const bounds = parseRange(first.range!)
    const edits = []
    for (let row = bounds.startRow; row <= bounds.endRow; row++) {
      for (let column = bounds.startColumn; column <= bounds.endColumn; column++) {
        edits.push({
          sheetName: sheet.name,
          row,
          column,
          writeValue: false,
          cell: sheet.cells[formatAddress(row, column)] ?? { value: null },
          style: first.format ?? { bold: true },
        })
      }
    }
    const result = await applyCellEditsToXlsx(Buffer.from(bytes), edits)
    return {
      bytes: new Uint8Array(result.buffer),
      version: expectedVersion + 1,
      changedCells: [],
      touchedEntries: [...result.touchedEntries],
    }
  }
  const edits = (
    expandToPrimitiveOps(
      ops.map((op) => workbookOperationSchema.parse(op)),
      (address, id) => sheets.get(id)?.cells[address] ?? { value: null },
    ) as Array<{ op: string; sheetId: string; address: string; value?: string; formula?: string }>
  ).map((op) => {
    const sheet = sheets.get(op.sheetId)
    if (!sheet) throw new Error('工作表已失效')
    const { row, column } = parseAddress(op.address)
    return {
      sheetName: sheet.name,
      row,
      column,
      writeValue: true,
      cell:
        op.op === 'set_formula'
          ? { value: null, formula: op.formula }
          : { value: op.value ?? null },
    }
  })
  const result = await applyCellEditsToXlsx(Buffer.from(bytes), edits)
  return {
    bytes: new Uint8Array(result.buffer),
    version: expectedVersion + 1,
    changedCells: edits.map((edit) => `${edit.sheetName}:${edit.row}:${edit.column}`),
    touchedEntries: [...result.touchedEntries],
  }
}

async function openEditor(hostApply: XlsxHostApply = fakeHostApply) {
  const handle = fakeIo()
  let agentHandle: XlsxAgentHandle | null = null
  const host = mount(
    <XlsxEditor
      documentId="doc-1"
      io={handle.io}
      hostApply={hostApply}
      onAgentHandleChange={(next) => {
        agentHandle = next
      }}
    />,
  )
  await waitForTable(host)
  return {
    host,
    saved: handle.saved,
    agent: () => {
      if (!agentHandle) throw new Error('工作簿句柄未就绪')
      return agentHandle
    },
  }
}

/** 挂一棵多表的工作簿 */
async function openMultiSheetEditor() {
  const handle = fakeIo(await withSecondSheet())
  const host = mount(<XlsxEditor documentId="multi" io={handle.io} hostApply={fakeHostApply} />)
  await waitForTable(host)
  return { host, saved: handle.saved }
}

describe('xlsx 对象面板与历史操作', () => {
  it('剪切保留公式并迁移从属，格式刷与清除格式在保存重开保持，分组可折叠和恢复', async () => {
    const { host, saved } = await openEditor(async (request) => {
      const operation = xlsxManualOperationSchema.safeParse(request.ops[0])
      if (operation.success && operation.data.op === 'paste_range')
        return applyXlsxSpecialPaste(request.bytes, operation.data, request.expectedVersion)
      return fakeHostApply(request)
    })
    expect(
      [...host.querySelectorAll('.mimir-compact-toolbar [data-section-key]')].map((group) =>
        group.getAttribute('data-section-key'),
      ),
    ).toEqual(['formats', 'clipboard', 'sheets', 'cell', 'find'])
    type(byLabel(host, '操作范围（A1 或 A1:B5）'), 'C3')
    click(byLabel(host, '范围剪贴板'))
    click(byLabel(host, '剪切所选范围'))
    await waitForGrid(host, () => !byLabel(host, '剪切所选范围').hasAttribute('disabled'))
    type(byLabel(host, '操作范围（A1 或 A1:B5）'), 'D4')
    click(byLabel(host, '粘贴'))
    await waitForGrid(
      host,
      () =>
        host
          .querySelector('[data-grid-row="4"][data-grid-column="3"]')
          ?.textContent?.includes('1001') === true,
    )
    await save(host, saved)
    expect(
      (await readBasicWorkbook(Buffer.from(saved()!))).snapshot.sheets[0]!.cells.D4!.formula,
    ).toBe('=SUM(1,2)')
    expect(
      (await readBasicWorkbook(Buffer.from(saved()!))).snapshot.sheets[0]!.cells.C3?.formula,
    ).toBeUndefined()
    await waitForGrid(host, () => !host.querySelector('fieldset[aria-busy="true"]'))
    click(byLabel(host, '关闭剪贴板'))
    type(byLabel(host, '操作范围（A1 或 A1:B5）'), 'A2')
    click(byLabel(host, '格式刷与清除格式'))
    click(byLabel(host, '拾取所选范围格式'))
    type(byLabel(host, '操作范围（A1 或 A1:B5）'), 'A3')
    click(byLabel(host, '应用格式刷到所选范围'))
    await waitForGrid(
      host,
      () => host.querySelector('.mimir-xlsx-tools__feedback')?.textContent === '已应用',
    )
    click(byLabel(host, '清除所选范围格式'))
    await waitForGrid(host, () => !host.querySelector('fieldset[aria-busy="true"]'))
    await save(host, saved)
    expect(
      (await readXlsx(saved()!)).sheets[0]!.rows.find((row) => row.number === 3)!.cells[0]!.format
        ?.bold,
    ).toBeFalsy()
    press(byLabel(host, '格式刷与清除格式'), 'Escape')
    selectRibbonTab(host, '布局')
    type(byLabel(host, '操作范围（A1 或 A1:B5）'), 'A3:B4')
    click(byLabel(host, '自动尺寸与分级'))
    click(byLabel(host, '创建分组'))
    await waitForGrid(host, () => host.textContent?.includes('最多1层') ?? false)
    click(byLabel(host, '折叠明细'))
    await waitForGrid(host, () => !host.querySelector('[data-grid-row="3"]'))
    click(byLabel(host, '展开明细'))
    await waitForGrid(host, () => !!host.querySelector('[data-grid-row="3"]'))
    await save(host, saved)
    expect(await entryOf(saved()!, 'xl/worksheets/sheet1.xml')).toContain('outlineLevel="1"')
  })
  it('填充具名菜单以首列填右，实际保存相对公式', async () => {
    const { host, saved } = await openEditor()
    selectRibbonTab(host, '数据')
    type(byLabel(host, '操作范围（A1 或 A1:B5）'), 'C3:D3')
    click(byLabel(host, '填充与闪填'))
    pickSelectOption(host, '填充方式', '向右（首列作源）')
    click(byLabel(host, '应用范围填充'))
    await waitForGrid(
      host,
      () =>
        host
          .querySelector('[data-grid-row="3"][data-grid-column="3"]')
          ?.textContent?.includes('1001') === true,
    )
    await save(host, saved)
    expect(
      (await readBasicWorkbook(Buffer.from(saved()!))).snapshot.sheets[0]!.cells.D3!.formula,
    ).toBe('=SUM(1,2)')
  })

  it('快速填充菜单推断左列示例，自动列宽按字体测量并保存实际尺寸', async () => {
    const zip = await JSZip.loadAsync(new Uint8Array(readFileSync(FIXTURE)))
    zip.file(
      'xl/worksheets/sheet1.xml',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Alice</t></is></c><c r="B1" t="inlineStr"><is><t>Alice!</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Brian</t></is></c></row></sheetData></worksheet>',
    )
    const { io, saved } = fakeIo(await zip.generateAsync({ type: 'uint8array' }))
    const host = mount(<XlsxEditor documentId="flash-auto" io={io} hostApply={fakeHostApply} />)
    await waitForTable(host)
    selectRibbonTab(host, '数据')
    type(byLabel(host, '操作范围（A1 或 A1:B5）'), 'B1:B2')
    click(byLabel(host, '填充与闪填'))
    pickSelectOption(host, '填充方式', '快速填充（左侧列拼接）')
    click(byLabel(host, '应用范围填充'))
    await waitForGrid(
      host,
      () =>
        host.querySelector('[data-grid-row="2"][data-grid-column="1"]')?.textContent === 'Brian!',
    )
    await save(host, saved)
    expect((await readXlsx(saved()!)).sheets[0]!.rows[1]!.cells[1]!.text).toBe('Brian!')
    press(byLabel(host, '填充与闪填'), 'Escape')
    selectRibbonTab(host, '布局')
    click(byLabel(host, '自动尺寸与分级'))
    const context = {
      font: '',
      measureText: (text: string) => ({ width: text.length * 10 }),
    } as CanvasRenderingContext2D
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    click(byLabel(host, '自动适应所选列宽'))
    await waitForGrid(
      host,
      () => host.querySelectorAll('col')[2]?.getAttribute('style')?.includes('72px') ?? false,
    )
    await save(host, saved)
    expect((await readXlsx(saved()!)).sheets[0]!.columns[1]!.width).toBe(72)
    spy.mockRestore()
  })
  it('合并格键盘跳过隐藏行列，拖选遇取消/失焦/外部抬起后不会继续扩选', async () => {
    const zip = await JSZip.loadAsync(new Uint8Array(readFileSync(FIXTURE)))
    const path = 'xl/worksheets/sheet1.xml'
    const xml = await zip.file(path)!.async('string')
    zip.file(
      path,
      xml
        .replace('<sheetData>', '<cols><col min="2" max="2" hidden="1"/></cols><sheetData>')
        .replace(/<row r="2"/, '<row hidden="1" r="2"')
        .replace('ref="A1:C1"', 'ref="A1:C2"'),
    )
    const { io } = fakeIo(await zip.generateAsync({ type: 'uint8array' }))
    const host = mount(<XlsxEditor documentId="grid-gestures" io={io} hostApply={fakeHostApply} />)
    await waitForTable(host)
    const at = (row: number, col: number) =>
      host.querySelector<HTMLElement>(`[data-grid-row="${row}"][data-grid-column="${col}"]`)!
    click(at(1, 0))
    press(at(1, 0), 'ArrowDown')
    expect(selectedCell(host)?.dataset.gridRow).toBe('3')
    expect(selectedCell(host)?.dataset.gridColumn).toBe('0')
    for (const event of ['pointercancel', 'pointerup', 'blur']) {
      act(() =>
        at(3, 0).dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, pointerId: 1 }),
        ),
      )
      act(() =>
        event === 'blur'
          ? window.dispatchEvent(new Event('blur'))
          : document.dispatchEvent(new PointerEvent(event, { pointerId: 1 })),
      )
      act(() =>
        at(5, 2).dispatchEvent(
          new PointerEvent('pointerover', { bubbles: true, buttons: 1, pointerId: 1 }),
        ),
      )
      expect((byLabel(host, '操作范围（A1 或 A1:B5）') as HTMLInputElement).value).toBe('')
    }
  })
  it('图表创建、属性编辑和结构化表样式即时可见，两次保存重开保留，Escape返回可见入口', async () => {
    const { host, saved } = await openEditor()
    type(byLabel(host, '操作范围（A1 或 A1:B5）'), 'A2:C5')
    selectRibbonTab(host, '插入')
    const trigger = byLabel(host, '图表、形状与结构化表')
    expect(trigger.querySelector('svg')).not.toBeNull()
    click(trigger)
    const panel = byLabel(host, '工作表对象与表格')
    expect(panel.querySelectorAll('.me-tabs [role="tab"]')).toHaveLength(6)
    type(byLabel(panel, '左上角单元格'), 'E2')
    type(byLabel(panel, '图表标题（留空自动）'), '销售对比')
    click(byLabel(panel, '插入范围图表'))
    await waitForGrid(host, () => !!host.querySelector('.mimir-xlsx-object__chart svg'))
    expect(host.querySelector('.mimir-xlsx-object__chart')?.textContent).toContain('销售对比')
    selectRibbonTab(panel, '管理')
    pickSelectOption(panel, '当前对象', '销售对比')
    type(byLabel(panel, '图表标题'), '更新图表')
    type(byLabel(panel, '分类轴标题'), '月份')
    type(byLabel(panel, '数值轴标题'), '销售额')
    click(byLabel(panel, '应用图表属性'))
    await waitForGrid(
      host,
      () =>
        host.querySelector('.mimir-xlsx-object__chart')?.textContent?.includes('更新图表') ?? false,
    )
    expect(byLabel(panel, '删除工作表对象').textContent).toBe('删除对象')
    selectRibbonTab(panel, '表格')
    type(byLabel(panel, '表格名称（留空自动）'), 'Sales')
    click(byLabel(panel, '插入结构化表'))
    await waitForGrid(host, () => cellAt(host, 2, 0).style.backgroundColor !== '')
    expect(cellAt(host, 2, 0).style.backgroundColor.toUpperCase()).toMatch(
      /#4472C4|RGB\(68, 114, 196\)/,
    )
    expect(cellAt(host, 2, 0).style.fontWeight).toBe('700')
    expect(cellAt(host, 3, 0).style.backgroundColor).not.toBe('')
    await save(host, saved)
    await waitForGrid(
      host,
      () => panel.querySelector('.mimir-xlsx-tools__feedback')?.textContent === '已应用',
    )
    expect(panel.textContent).not.toContain('保存后写入原件')
    const parsed = await readXlsx(saved()!)
    expect(parsed.sheets[0]!.visuals![0]!.name).toBe('更新图表')
    expect(parsed.sheets[0]!.visuals![0]!.chart?.axisTitles).toEqual({
      category: '月份',
      value: '销售额',
    })
    expect(parsed.sheets[0]!.tables![0]!.name).toBe('Sales')
    press(panel, 'Escape')
    expect(host.querySelector('.mimir-xlsx-inspector')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    click(byLabel(host, '撤销'))
    await waitForGrid(host, () => cellAt(host, 2, 0).style.backgroundColor === '')
    await save(host, saved)
    click(byLabel(host, '重做'))
    await waitForGrid(host, () => cellAt(host, 2, 0).style.backgroundColor !== '')
    await save(host, saved)
    expect((await readXlsx(saved()!)).sheets[0]!.tables![0]!.name).toBe('Sales')
  })
  it('粘贴先预览待应用，写入数字/布尔/公式；撤销和重做准确更新保存基线', async () => {
    const { host, saved } = await openEditor()
    type(byLabel(host, '操作范围（A1 或 A1:B5）'), 'A3')
    click(byLabel(host, '范围剪贴板'))
    type(byLabel(host, '待写入的表格内容'), '12\tTRUE\t=2+3')
    expect(cellAt(host, 3, 0).textContent).toBe('张三')
    click(byLabel(host, '粘贴'))
    await waitForGrid(host, () => cellAt(host, 3, 0).textContent === '12')
    expect(cellAt(host, 3, 1).textContent).toBe('TRUE')
    await save(host, saved)
    await waitForGrid(
      host,
      () =>
        host.querySelector('.mimir-xlsx-clipboard__feedback')?.textContent?.includes('已粘贴') ===
        true,
    )
    expect(host.textContent).not.toContain('保存后写入原件')
    click(byLabel(host, '撤销'))
    await waitForGrid(host, () => cellAt(host, 3, 0).textContent === '张三')
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('未保存')
    click(byLabel(host, '重做'))
    await waitForGrid(host, () => cellAt(host, 3, 0).textContent === '12')
    expect(host.querySelector('.mimir-editor__status')?.textContent).not.toContain('未保存')
    const sheet = (await readXlsx(saved()!)).sheets[0]!
    expect(sheet.rows.find((row) => row.number === 3)!.cells[2]!.formulaText).toBe('=2+3')
  })
})

/** 把存下来的字节里某个条目读成文本 */
async function entryOf(bytes: Uint8Array, name: string): Promise<string | null> {
  const zip = await JSZip.loadAsync(bytes)
  const file = zip.file(name)
  return file === null ? null : file.async('string')
}

/**
 * 点「保存到库」并等它写完。
 *
 * 保存要过两道异步（`session.save()` 打包 zip → `source.save()` 交给宿主），
 * 一次宏任务不够——**等到宿主真的收到字节**或超时，而不是等固定次数：
 * 等固定次数会在慢机器上变成偶发失败，而偶发失败最后总是被当成噪音忽略。
 */
async function save(host: HTMLElement, saved: () => Uint8Array | null): Promise<void> {
  const previous = saved()
  await waitForGrid(host, () => !(byLabel(host, '保存到库') as HTMLButtonElement).disabled)
  click(byLabel(host, '保存到库'))
  await waitForGrid(
    host,
    () =>
      saved() !== null &&
      saved() !== previous &&
      host.querySelector('.mimir-editor__status .me-label')?.textContent === '已保存',
  )
}

it.each(['before', 'after'] as const)(
  'keeps a later edit unsaved when it publishes %s an older workbook save finishes',
  async (order) => {
    const persisted: Uint8Array[] = []
    let handle: XlsxAgentHandle | null = null
    let firstStarted = false
    let finishFirst: () => void = vi.fn<() => void>()
    let editStarted = false
    let finishEdit!: () => void
    let editSignal: AbortSignal | undefined
    const editGate = new Promise<void>((resolve) => {
      finishEdit = resolve
    })
    const delayedHost: XlsxHostApply = async (request) => {
      const result = await fakeHostApply(request)
      if (request.ops.some((op) => (op as { address?: string }).address === 'B2')) {
        editStarted = true
        editSignal = request.signal
        await editGate
      }
      return result
    }
    const io: EditorIo = {
      load: async () => new Uint8Array(readFileSync(FIXTURE)),
      save: async (bytes) => {
        if (persisted.length === 0) {
          firstStarted = true
          await new Promise<void>((resolve) => {
            finishFirst = resolve
          })
        }
        persisted.push(bytes)
      },
    }
    const host = mount(
      <XlsxEditor
        documentId="save-race"
        io={io}
        hostApply={delayedHost}
        onAgentHandleChange={(next) => {
          handle = next
        }}
      />,
    )
    await waitForTable(host)
    click(cellAt(host, 2, 0))
    type(byLabel(host, '单元格 A2'), '先保存')
    press(byLabel(host, '单元格 A2'), 'Enter')
    await waitForGrid(host, () => cellAt(host, 2, 0).textContent === '先保存')
    await waitForGrid(host, () => !(byLabel(host, '保存到库') as HTMLButtonElement).disabled)
    click(byLabel(host, '保存到库'))
    await waitForGrid(host, () => firstStarted)
    expect(handle!.getVersion()).toBe(1)

    click(cellAt(host, 2, 1))
    type(byLabel(host, '单元格 B2'), '保存中又编辑')
    press(byLabel(host, '单元格 B2'), 'Enter')
    await waitForGrid(host, () => editStarted)
    expect(handle!.getVersion()).toBe(1)
    if (order === 'before') {
      await act(async () => finishEdit())
      await waitForGrid(host, () => handle!.getVersion() === 2)
    }
    await act(async () => finishFirst())
    await waitForGrid(host, () => persisted.length === 1)
    await waitForGrid(host, () => host.querySelector('[aria-label="保存到库"]') !== null)
    expect(order === 'before' || editSignal?.aborted === false).toBe(true)
    if (order === 'after') await act(async () => finishEdit())
    await waitForGrid(host, () => handle!.getVersion() === 2)
    expect(handle!.isDirty()).toBe(true)
    const later = (await readBasicWorkbook(Buffer.from(handle!.currentBytes()))).snapshot.sheets[0]!
    expect(later.cells.B2?.value).toBe('保存中又编辑')
    await waitForGrid(host, () => !(byLabel(host, '保存到库') as HTMLButtonElement).disabled)

    click(byLabel(host, '保存到库'))
    await waitForGrid(host, () => persisted.length === 2)
    const first = (await readBasicWorkbook(Buffer.from(persisted[0]!))).snapshot.sheets[0]!
    const second = (await readBasicWorkbook(Buffer.from(persisted[1]!))).snapshot.sheets[0]!
    expect(first.cells.A2?.value).toBe('先保存')
    expect(first.cells.B2?.value).toBe('部门')
    expect(second.cells.B2?.value).toBe('保存中又编辑')
  },
)

function structureMenuItem(host: HTMLElement, label: string): HTMLButtonElement {
  click(byLabel(host, '行列操作'))
  const item = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (element) => element.textContent?.trim() === label,
  )
  if (!item) throw new Error(`行列操作菜单里没有「${label}」`)
  return item
}

function cellMenuItem(host: HTMLElement, label: string): HTMLButtonElement {
  click(byLabel(host, '单元格操作'))
  const item = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (element) => element.textContent?.trim() === label,
  )
  if (!item) throw new Error(`单元格操作菜单里没有「${label}」`)
  return item
}

describe('xlsx 填充和格式菜单：手动操作保存为工作簿原件', () => {
  it('复制当前格到右侧并向下填充', async () => {
    const { host, saved } = await openEditor()
    click(cellAt(host, 2, 0))
    click(cellMenuItem(host, '复制到右侧一格'))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    click(cellMenuItem(host, '向下填充三格'))
    await save(host, saved)
    const sheet = (await readBasicWorkbook(Buffer.from(saved()!))).snapshot.sheets[0]
    expect(sheet?.cells.B2?.value).toBe('姓名')
    expect(sheet?.cells.A3?.value).toBe('姓名')
    expect(sheet?.cells.A4?.value).toBe('姓名')
  })

  it('加粗和列宽在当前网格可见，保存重开后仍可见', async () => {
    const { host, saved } = await openEditor()
    click(cellAt(host, 2, 0))
    click(cellMenuItem(host, '当前格加粗'))
    await waitForGrid(host, () => cellAt(host, 2, 0).classList.contains('mimir-xlsx__cell--bold'))
    expect(cellAt(host, 2, 0).classList.contains('mimir-xlsx__cell--bold')).toBe(true)
    click(structureMenuItem(host, '当前列设为 180 像素宽'))
    await waitForGrid(
      host,
      () =>
        host.querySelectorAll<HTMLTableColElement>('.mimir-xlsx col')[1]?.style.width === '180px',
    )
    const columns = host.querySelectorAll<HTMLTableColElement>('.mimir-xlsx col')
    expect(columns[0]?.style.width).toBe('34px')
    expect(columns[1]?.style.width).toBe('180px')
    expect(host.querySelector<HTMLTableElement>('.mimir-xlsx')?.style.width).toBe('364px')
    await save(host, saved)
    const sheetXml = await entryOf(saved()!, 'xl/worksheets/sheet1.xml')
    const stylesXml = await entryOf(saved()!, 'xl/styles.xml')
    expect(sheetXml).toMatch(/<c\b[^>]*r="A2"[^>]*s="[1-9]/)
    expect(sheetXml).toMatch(/<col\b[^>]*min="1"[^>]*max="1"[^>]*width="25"/)
    expect(stylesXml).toContain('<b')
    const reopenedHandle = fakeIo(saved()!)
    const reopenedHost = mount(
      <XlsxEditor documentId="reopened" io={reopenedHandle.io} hostApply={fakeHostApply} />,
    )
    await waitForTable(reopenedHost)
    expect(cellAt(reopenedHost, 2, 0).classList.contains('mimir-xlsx__cell--bold')).toBe(true)
    expect(
      reopenedHost.querySelectorAll<HTMLTableColElement>('.mimir-xlsx col')[1]?.style.width,
    ).toBe('180px')
    expect(reopenedHost.querySelector<HTMLTableElement>('.mimir-xlsx')?.style.width).toBe('364px')
  })

  it('工具栏按 A1 范围预览并加粗多格，保存重开后保留且不影响范围外格', async () => {
    const { host, saved } = await openEditor()
    const input = byLabel(host, '操作范围（A1 或 A1:B5）')
    let button = byLabel(host, '范围字体与对齐') as HTMLButtonElement
    type(input, 'A2:B10000')
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('title')).toBe('一次最多操作 2000 个格子')
    type(input, 'Z2')
    button = byLabel(host, '范围字体与对齐') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('title')).toBe('当前网格未显示该范围，无法核对结果')

    type(input, 'a2:b2')
    button = byLabel(host, '范围字体与对齐') as HTMLButtonElement
    expect(button.disabled).toBe(false)
    expect(cellAt(host, 2, 0).classList.contains('mimir-xlsx__cell--range')).toBe(true)
    expect(cellAt(host, 2, 1).classList.contains('mimir-xlsx__cell--range')).toBe(true)
    expect(cellAt(host, 2, 2).classList.contains('mimir-xlsx__cell--range')).toBe(false)
    click(button)
    click(
      byLabel(
        host.querySelector<HTMLElement>('[role="menu"][aria-label="范围字体与对齐"]')!,
        '范围加粗',
      ),
    )
    await waitForGrid(host, () =>
      [0, 1].every((col) => cellAt(host, 2, col).classList.contains('mimir-xlsx__cell--bold')),
    )
    expect(cellAt(host, 2, 2).classList.contains('mimir-xlsx__cell--bold')).toBe(false)

    await save(host, saved)
    const sheetXml = await entryOf(saved()!, 'xl/worksheets/sheet1.xml')
    expect(sheetXml).toMatch(/<c\b[^>]*r="A2"[^>]*s="[1-9]/)
    expect(sheetXml).toMatch(/<c\b[^>]*r="B2"[^>]*s="[1-9]/)
    const reopenedIo = fakeIo(saved()!)
    const reopened = mount(
      <XlsxEditor documentId="range-reopened" io={reopenedIo.io} hostApply={fakeHostApply} />,
    )
    await waitForTable(reopened)
    expect(cellAt(reopened, 2, 0).classList.contains('mimir-xlsx__cell--bold')).toBe(true)
    expect(cellAt(reopened, 2, 1).classList.contains('mimir-xlsx__cell--bold')).toBe(true)
    expect(cellAt(reopened, 2, 2).classList.contains('mimir-xlsx__cell--bold')).toBe(false)
  })
})

describe('xlsx 范围合并：手动入口与结构写回', () => {
  it('拒绝隐藏有内容的格子，现有合并只允许按完整范围取消', async () => {
    const { host } = await openEditor()
    const input = byLabel(host, '操作范围（A1 或 A1:B5）')
    type(input, 'A2:B2')
    expect((byLabel(host, '合并范围') as HTMLButtonElement).disabled).toBe(true)
    expect(byLabel(host, '合并范围').getAttribute('title')).toContain('隐藏其他格的内容')
    type(input, 'A1:B1')
    expect((byLabel(host, '取消合并范围') as HTMLButtonElement).disabled).toBe(true)
    type(input, 'A1:C1')
    expect((byLabel(host, '取消合并范围') as HTMLButtonElement).disabled).toBe(false)
  })

  it('合并空目标并取消合并，两个保存循环均能重开读回', async () => {
    const zip = await JSZip.loadAsync(new Uint8Array(readFileSync(FIXTURE)))
    const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    zip.file(
      'xl/worksheets/sheet1.xml',
      xml.replace('<c r="B2" t="s"><v>1</v></c>', '<c r="B2" t="inlineStr"><is><t></t></is></c>'),
    )
    const handle = fakeIo(await zip.generateAsync({ type: 'uint8array' }))
    const host = mount(<XlsxEditor documentId="merge" io={handle.io} hostApply={fakeHostApply} />)
    await waitForTable(host)
    type(byLabel(host, '操作范围（A1 或 A1:B5）'), 'A2:B2')
    expect((byLabel(host, '合并范围') as HTMLButtonElement).disabled).toBe(false)
    click(byLabel(host, '合并范围'))
    await waitForGrid(host, () => cellAt(host, 2, 0).colSpan === 2)
    expect(cellAt(host, 2, 0).textContent).toContain('姓名')
    await save(host, handle.saved)
    expect(await entryOf(handle.saved()!, 'xl/worksheets/sheet1.xml')).toContain(
      '<mergeCell ref="A2:B2"/>',
    )

    const reopenedIo = fakeIo(handle.saved()!)
    const reopened = mount(
      <XlsxEditor documentId="unmerge" io={reopenedIo.io} hostApply={fakeHostApply} />,
    )
    await waitForTable(reopened)
    expect(cellAt(reopened, 2, 0).colSpan).toBe(2)
    type(byLabel(reopened, '操作范围（A1 或 A1:B5）'), 'A2:B2')
    click(byLabel(reopened, '取消合并范围'))
    await waitForGrid(reopened, () => cellAt(reopened, 2, 0).colSpan === 1)
    expect(cellAt(reopened, 2, 1).textContent).toBe('')
    await save(reopened, reopenedIo.saved)
    expect(await entryOf(reopenedIo.saved()!, 'xl/worksheets/sheet1.xml')).not.toContain(
      '<mergeCell ref="A2:B2"/>',
    )

    const secondIo = fakeIo(reopenedIo.saved()!)
    const second = mount(
      <XlsxEditor documentId="unmerged-reopened" io={secondIo.io} hostApply={fakeHostApply} />,
    )
    await waitForTable(second)
    expect(cellAt(second, 2, 0).colSpan).toBe(1)
    expect(cellAt(second, 2, 1).textContent).toBe('')
  })
})

const fakeRecalcHostApply: XlsxHostApply = async (request) => {
  if (request.action !== 'recalculate_formulas') return fakeHostApply(request)
  expect(request.ops).toEqual([])
  const zip = await JSZip.loadAsync(request.bytes)
  const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
  const value = xml.includes('SUM(2,3)') ? '5' : '3'
  zip.file(
    'xl/worksheets/sheet1.xml',
    xml.replace(
      /(<c\b[^>]*r="C3"[^>]*>)([\s\S]*?)(<\/c>)/,
      (_match, open: string, inner: string, close: string) =>
        open + inner.replace(/<v>[\s\S]*?<\/v>/, '') + `<v>${value}</v>` + close,
    ),
  )
  return {
    bytes: await zip.generateAsync({ type: 'uint8array' }),
    version: request.expectedVersion + 1,
    changedCells: ['数据!C3'],
    touchedEntries: ['xl/worksheets/sheet1.xml'],
    recalculation: {
      engine: 'ironcalc-wasm-xlsx',
      engineVersion: '0.9.0',
      formulaCount: 1,
      warnings: [],
    },
  }
}

it('手动重算与Agent共用宿主action，当前画布与两次保存都读到新公式缓存', async () => {
  const handle = fakeIo()

  const host = mount(
    <XlsxEditor documentId="manual-recalc" io={handle.io} hostApply={fakeRecalcHostApply} />,
  )
  await waitForTable(host)
  selectRibbonTab(host, '公式')
  click(byLabel(host, '重新计算公式'))
  await waitForGrid(host, () => cellAt(host, 3, 2).textContent?.startsWith('3') === true)
  expect(cellAt(host, 3, 2).title).toContain('已按当前工作簿重新计算')
  await save(host, handle.saved)
  expect(cellAt(host, 3, 2).title).toContain('已按当前工作簿重新计算')
  expect(host.querySelector('.mimir-editor__status')?.textContent).not.toContain('保存后写入原件')
  expect(await entryOf(handle.saved()!, 'xl/worksheets/sheet1.xml')).toContain('<v>3</v>')
  click(cellAt(host, 3, 2))
  type(byLabelPrefix(host, '单元格 C3'), '=SUM(2,3)')
  click(byLabel(host, '应用'))
  await waitForGrid(host, () => !cellAt(host, 3, 2).title.includes('已按当前工作簿重新计算'))
  expect(cellAt(host, 3, 2).title).not.toContain('已按当前工作簿重新计算')
  click(byLabel(host, '重新计算公式'))
  await waitForGrid(host, () => cellAt(host, 3, 2).textContent?.startsWith('5') === true)
  await save(host, handle.saved)
  expect(await entryOf(handle.saved()!, 'xl/worksheets/sheet1.xml')).toContain('<v>5</v>')
})

it('空字符串公式缓存显示为空值缓存，不标为未计算或无结果', async () => {
  const zip = await JSZip.loadAsync(new Uint8Array(readFileSync(FIXTURE)))
  const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
  zip.file(
    'xl/worksheets/sheet1.xml',
    xml.replace(
      /<c\b[^>]*r="C3"[^>]*>[\s\S]*?<\/c>/,
      '<c r="C3" t="str"><f>&quot;&quot;</f><v></v></c>',
    ),
  )
  const handle = fakeIo(await zip.generateAsync({ type: 'uint8array' }))
  const host = mount(
    <XlsxEditor documentId="empty-formula-cache" io={handle.io} hostApply={fakeRecalcHostApply} />,
  )
  await waitForTable(host)
  expect(cellAt(host, 3, 2).textContent).toBe('缓存')
  expect(cellAt(host, 3, 2).title).toContain('文件中的缓存结果')
})

describe('xlsx 工作表管理：改名与保存', () => {
  it.each([
    { active: '1', hidden: false, expected: '第二张' },
    { active: '0', hidden: true, expected: '第二张' },
    { active: '999', hidden: true, expected: '第二张' },
    { active: 'invalid', hidden: false, expected: '数据' },
  ])(
    '默认打开有效可见activeTab，否则首张可见（$active/$hidden）',
    async ({ active, hidden, expected }) => {
      const zip = await JSZip.loadAsync(await withSecondSheet())
      let xml = await zip.file('xl/workbook.xml')!.async('string')
      xml = xml.replace(
        '<sheets>',
        `<bookViews><workbookView activeTab="${active}"/></bookViews><sheets>`,
      )
      if (hidden) xml = xml.replace('name="数据"', 'name="数据" state="hidden"')
      zip.file('xl/workbook.xml', xml)
      const { io } = fakeIo(await zip.generateAsync({ type: 'uint8array' }))
      const host = mount(
        <XlsxEditor documentId="active-visible-sheet" io={io} hostApply={fakeHostApply} />,
      )
      await waitForTable(host)
      expect(
        host.querySelector('.mimir-compact-toolbar__sheet-tabs [aria-selected="true"]')
          ?.textContent,
      ).toBe(expected)
      const tab = [
        ...host.querySelectorAll<HTMLButtonElement>(
          '.mimir-compact-toolbar__sheet-tabs [role="tab"]',
        ),
      ].find((t) => t.textContent?.startsWith('数据'))!
      expect(tab).toBeDefined()
      click(tab)
      expect(tab.getAttribute('aria-selected')).toBe('true')
      expect(cellAt(host, 2, 0).textContent).toBe('姓名')
    },
  )
  it('最后可见工作表不能隐藏，隐藏后切可见表并保留隐藏表恢复入口', async () => {
    const { host, saved } = await openMultiSheetEditor()
    const menuItem = (label: string) => {
      click(host.querySelector<HTMLButtonElement>('button[aria-label="工作表管理"]')!)
      const item = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
        (element) => element.textContent?.trim() === label,
      )
      if (!item) throw new Error(`工作表管理菜单里没有「${label}」`)
      return item
    }
    click(menuItem('隐藏当前工作表'))
    await waitForGrid(
      host,
      () => (byLabel(host, '工作表名称（最多 31 个字符）') as HTMLInputElement).value === '第二张',
    )
    expect(
      [...host.querySelectorAll('.mimir-compact-toolbar__sheet-tabs .me-tab')].map((tab) =>
        tab.textContent?.trim(),
      ),
    ).toEqual(['数据（隐藏）', '第二张'])
    const hide = menuItem('隐藏当前工作表')
    expect(hide.disabled).toBe(true)
    expect(hide.title).toBe('至少保留一张可见工作表')
    expect((byLabel(host, '删除当前工作表') as HTMLButtonElement).disabled).toBe(true)
    click(host.querySelector<HTMLButtonElement>('button[aria-label="工作表管理"]')!)
    await save(host, saved)
    expect(await entryOf(saved()!, 'xl/workbook.xml')).toContain('state="hidden"')
    click(host.querySelector<HTMLButtonElement>('.mimir-compact-toolbar__sheet-tabs .me-tab')!)
    expect((byLabel(host, '删除当前工作表') as HTMLButtonElement).disabled).toBe(false)
    const restore = menuItem('取消隐藏当前工作表')
    expect(restore.disabled).toBe(false)
    click(restore)
    await waitForGrid(host, () => !host.textContent?.includes('数据（隐藏）'))
    await save(host, saved)
    expect(await entryOf(saved()!, 'xl/workbook.xml')).not.toContain('state="hidden"')
  })

  it('单工作表的隐藏操作有明确禁用原因', async () => {
    const { host } = await openEditor()
    click(host.querySelector<HTMLButtonElement>('button[aria-label="工作表管理"]')!)
    const hide = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (element) => element.textContent?.trim() === '隐藏当前工作表',
    )!
    expect(hide.disabled).toBe(true)
    expect(hide.title).toBe('至少保留一张可见工作表')
  })

  it('显示名称校验原因，改名后页签即时更新并能保存重开', async () => {
    const { host, saved } = await openMultiSheetEditor()
    const input = byLabel(host, '工作表名称（最多 31 个字符）')
    const button = byLabel(host, '重命名当前工作表') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('title')).toBe('工作表名称没有变化')
    type(input, '第二张')
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('title')).toBe('已有同名工作表')
    type(input, '无效/名称')
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('title')).toContain('不能包含')
    type(input, '新数据')
    expect(button.disabled).toBe(false)
    click(button)
    await waitForGrid(host, () =>
      [...host.querySelectorAll('.mimir-compact-toolbar__sheet-tabs .me-tab')].some(
        (tab) => tab.textContent?.trim() === '新数据',
      ),
    )
    expect((byLabel(host, '工作表名称（最多 31 个字符）') as HTMLInputElement).value).toBe('新数据')
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('未保存')
    await save(host, saved)
    expect(await entryOf(saved()!, 'xl/workbook.xml')).toContain('name="新数据"')
    const reopenedIo = fakeIo(saved()!)
    const reopened = mount(
      <XlsxEditor documentId="renamed" io={reopenedIo.io} hostApply={fakeHostApply} />,
    )
    await waitForTable(reopened)
    expect(
      [...reopened.querySelectorAll('.mimir-compact-toolbar__sheet-tabs .me-tab')].map((tab) =>
        tab.textContent?.trim(),
      ),
    ).toEqual(['新数据', '第二张'])
  })

  it('新增工作表后可选中新页签、编辑空 A1，保存重开仍存在', async () => {
    const { host, saved } = await openEditor()
    const input = byLabel(host, '新工作表名称（最多 31 个字符）')
    const button = byLabel(host, '新增工作表') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('title')).toBe('输入新工作表名称')
    type(input, '数据')
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('title')).toBe('已有同名工作表')
    type(input, '计划')
    expect(button.disabled).toBe(false)
    click(button)
    await waitForGrid(host, () =>
      [...host.querySelectorAll('.mimir-compact-toolbar__sheet-tabs .me-tab')].some(
        (tab) => tab.textContent?.trim() === '计划',
      ),
    )
    expect(cellAt(host, 1, 0).textContent).toBe('')
    click(cellAt(host, 1, 0))
    type(byLabel(host, '单元格 A1'), '新表首格')
    click(byLabel(host, '应用'))
    await waitForGrid(host, () => cellAt(host, 1, 0).textContent?.includes('新表首格') === true)
    await save(host, saved)
    const reopenedIo = fakeIo(saved()!)
    const reopened = mount(
      <XlsxEditor documentId="added-sheet" io={reopenedIo.io} hostApply={fakeHostApply} />,
    )
    await waitForTable(reopened)
    expect(
      [...reopened.querySelectorAll('.mimir-compact-toolbar__sheet-tabs .me-tab')].map((tab) =>
        tab.textContent?.trim(),
      ),
    ).toEqual(['数据', '计划'])
    click(reopened.querySelectorAll<HTMLButtonElement>('.me-tab')[1]!)
    expect(cellAt(reopened, 1, 0).textContent).toBe('新表首格')
  })

  it('连续新增两张工作表时选中最后创建的页签', async () => {
    const source = fakeIo()
    const host = mount(
      <XlsxEditor documentId="add-twice" io={source.io} hostApply={fakeHostApply} />,
    )
    await waitForTable(host)
    const input = byLabel(host, '新工作表名称（最多 31 个字符）')
    type(input, '第一张')
    click(byLabel(host, '新增工作表'))
    type(input, '第二张')
    click(byLabel(host, '新增工作表'))
    await waitForGrid(
      host,
      () =>
        host.querySelectorAll('.mimir-compact-toolbar__sheet-tabs .me-tab').length === 3 &&
        host.querySelector('.mimir-compact-toolbar__sheet-tabs [aria-selected="true"]')
          ?.textContent === '第二张',
    )
    await save(host, source.saved)
    const reopened = await readBasicWorkbook(Buffer.from(source.saved()!))
    expect(reopened.snapshot.sheets.map((sheet) => sheet.name)).toEqual([
      '数据',
      '第一张',
      '第二张',
    ])
  })
})

/* ── 断言 ─────────────────────────────────────────────────────── */

describe('xlsx 行列菜单：共用工作簿写入路径', () => {
  it('在当前行上方插入一行，保存读回时 A2 移到 A3', async () => {
    const { host, saved } = await openEditor()
    click(cellAt(host, 2, 0))
    click(structureMenuItem(host, '在上方插入一行'))
    await save(host, saved)
    const reopened = await readBasicWorkbook(Buffer.from(saved()!))
    expect(reopened.snapshot.sheets[0]?.cells.A2?.value).toBeUndefined()
    expect(reopened.snapshot.sheets[0]?.cells.A3?.value).toBe('姓名')
  })

  it('在当前列左侧插入一列，保存读回时 A2 移到 B2', async () => {
    const { host, saved } = await openEditor()
    click(cellAt(host, 2, 0))
    click(structureMenuItem(host, '在左侧插入一列'))
    await save(host, saved)
    const reopened = await readBasicWorkbook(Buffer.from(saved()!))
    expect(reopened.snapshot.sheets[0]?.cells.A2?.value).toBeUndefined()
    expect(reopened.snapshot.sheets[0]?.cells.B2?.value).toBe('姓名')
  })

  it('删除当前行，下一行的公式移到 C2', async () => {
    const { host, saved } = await openEditor()
    click(cellAt(host, 2, 0))
    click(structureMenuItem(host, '删除当前行'))
    await save(host, saved)
    const reopened = await readBasicWorkbook(Buffer.from(saved()!))
    expect(reopened.snapshot.sheets[0]?.cells.C2?.formula).toBeDefined()
    expect(reopened.snapshot.sheets[0]?.cells.A2?.value).not.toBe('姓名')
  })

  it('删除当前列，B2 的部门移到 A2', async () => {
    const { host, saved } = await openEditor()
    click(cellAt(host, 2, 0))
    click(structureMenuItem(host, '删除当前列'))
    await save(host, saved)
    const reopened = await readBasicWorkbook(Buffer.from(saved()!))
    expect(reopened.snapshot.sheets[0]?.cells.A2?.value).toBe('部门')
  })
})

describe('xlsx 空工作表', () => {
  it('页签可选且 A1 能经同一宿主写入并保存', async () => {
    const handle = fakeIo(await withSecondSheet(true))
    const host = mount(
      <XlsxEditor documentId="empty-sheet" io={handle.io} hostApply={fakeHostApply} />,
    )
    await waitForTable(host)
    click(host.querySelectorAll<HTMLButtonElement>('.me-tab')[1]!)
    click(cellAt(host, 1, 0))
    type(byLabel(host, '单元格 A1'), '空表首格')
    click(byLabel(host, '应用'))
    await save(host, handle.saved)
    const reopened = await readBasicWorkbook(Buffer.from(handle.saved()!))
    expect(reopened.snapshot.sheets[1]?.cells.A1?.value).toBe('空表首格')
  })
})

describe('xlsx 工具条：清空这个格', () => {
  it('清空 A2 之后文件里是空的内联字符串格，共享字符串一字节没动', async () => {
    const { host, saved } = await openEditor()
    click(cellAt(host, 2, 0))
    expect(selectedCell(host)?.textContent).toBe('姓名')

    click(byLabelPrefix(host, '清空这个格'))
    await save(host, saved)

    const bytes = saved()
    expect(bytes, '保存按钮点了但宿主没收到字节').not.toBeNull()
    const sheet = await entryOf(bytes!, 'xl/worksheets/sheet1.xml')
    // 这一格被换成空的内联字符串格（`setCell(ref, '')` 的既定语义）
    expect(sheet).toMatch(/<c r="A2" t="inlineStr"><is><t[^>]*><\/t><\/is><\/c>/)
    /*
     * 共享字符串必须原样：改它会让所有引用同一项的格子一起空掉。
     * 夹具里 A1 与 A2 都指向第 0 项（「姓名」）。
     */
    expect(await entryOf(bytes!, 'xl/sharedStrings.xml')).toBe(
      await entryOf(new Uint8Array(readFileSync(FIXTURE)), 'xl/sharedStrings.xml'),
    )
  })

  it('没选中格子时它是 disabled，并给出原因（不是「点了没反应」）', async () => {
    const { host } = await openEditor()
    const button = byLabelPrefix(host, '清空这个格')
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(button.getAttribute('title')).toBe('先点一个格子')
    // 无障碍名称仍是 label，不因为禁用而变成原因
    expect(button.getAttribute('aria-label')).toContain('清空这个格')
  })

  it('格子被清空之后按钮也禁用，原因说的是这个格的实情', async () => {
    const { host, saved } = await openEditor()
    click(cellAt(host, 2, 0))

    // 清空是「这一格写进去就是空串」——界面上它随即变成空
    click(byLabelPrefix(host, '清空这个格'))
    await save(host, saved)

    const button = byLabelPrefix(host, '清空这个格')
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(button.getAttribute('title')).toBe('这个格已经是空的')
  })
})

describe('xlsx 工具条：复制这个格的文字', () => {
  it('复制的是界面上那一格的文字', async () => {
    const { host } = await openEditor()
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    click(cellAt(host, 5, 1))
    click(byLabelPrefix(host, '复制这个格'))

    await act(async () => {
      await Promise.resolve()
    })
    expect(writeText).toHaveBeenCalledWith('市场部 & <测试>')
  })

  it('复制的是**草稿**（界面上显示什么就复制什么），不是模型里的旧值', async () => {
    const { host } = await openEditor()
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    click(cellAt(host, 2, 0))
    type(byLabel(host, '单元格 A2'), '张三丰')
    click(byLabelPrefix(host, '复制这个格'))

    await act(async () => {
      await Promise.resolve()
    })
    expect(writeText).toHaveBeenCalledWith('张三丰')
  })

  it('写剪贴板失败时如实说，不假装成功', async () => {
    const { host } = await openEditor()
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('拒绝访问')
        },
      },
      configurable: true,
    })

    click(cellAt(host, 2, 2))
    click(byLabelPrefix(host, '复制这个格'))
    await act(async () => {
      await Promise.resolve()
    })
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('复制失败：拒绝访问')
  })

  it('没有剪贴板 API（非安全上下文）时按钮禁用并说明原因', async () => {
    const { host } = await openEditor()
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    // 重挂一次：`clipboardAvailable` 在渲染期读全局，换掉之后要重新渲染
    const { host: host2 } = await openEditor()
    click(cellAt(host2, 2, 0))
    const button = byLabelPrefix(host2, '复制这个格')
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(button.getAttribute('title')).toContain('https')

    // 点不进去（事件被禁用态拦住）：状态行不冒出任何「复制失败」——
    // 「做不到」的说明只由 tooltip 承担，复制动作里没有第二个判断
    click(button)
    await act(async () => {
      await Promise.resolve()
    })
    expect(host2.querySelector('.mimir-editor__status')?.textContent).not.toContain('复制失败')
    void host
  })

  /**
   * 非安全上下文的「做不到」由禁用态独自说明——`copyCell` 里不允许再有第二个
   * 剪贴板判断：按钮禁用时点击事件到不了 handler，那里的分支永远走不到，
   * 写了也从不生效。运行时行为与删掉它完全相同、测试观察不出来，所以照
   * `editors.css` 宽度覆写那条的先例做**静态守护**：那条只有死分支才用的
   * 失败措辞不许再出现在源码里（回来一次红一次）。
   */
  it('复制动作里没有第二条剪贴板判断（不可达的失败分支不许回来）', () => {
    const source = readFileSync(join(import.meta.dirname, 'XlsxEditor.tsx'), 'utf8')
    expect(source).not.toContain('没有写进剪贴板')
  })
})

describe('xlsx 工具条：查找上一个 / 下一个', () => {
  it('敲进查找串就跳到第一个命中', async () => {
    const { host } = await openEditor()
    type(byLabelPrefix(host, '查找内容'), '部')
    expect(selectedCell(host)?.textContent).toBe('部门')
  })

  it('「下一个命中」按行主序走，走到底回绕到第一个', async () => {
    const { host } = await openEditor()
    type(byLabelPrefix(host, '查找内容'), '部')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    click(byLabel(host, '下一个命中'))
    expect(selectedCell(host)?.textContent).toBe('技术部')
    click(byLabel(host, '下一个命中'))
    expect(selectedCell(host)?.textContent).toBe('市场部 & <测试>')
    // 回绕
    click(byLabel(host, '下一个命中'))
    expect(selectedCell(host)?.textContent).toBe('部门')
  })

  it('「上一个命中」反着走', async () => {
    const { host } = await openEditor()
    type(byLabelPrefix(host, '查找内容'), '部')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    click(byLabel(host, '上一个命中'))
    // 从第一个往前 = 回绕到最后一个
    expect(selectedCell(host)?.textContent).toBe('市场部 & <测试>')
  })

  it('命中数与查找栏同一套措辞（`1 / 3`、`无匹配`）', async () => {
    const { host } = await openEditor()
    type(byLabelPrefix(host, '查找内容'), '部')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(host.querySelector('.me-find__count')?.textContent).toBe('1 / 3')

    type(byLabelPrefix(host, '查找内容'), '找不到的东西')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(host.querySelector('.me-find__count')?.textContent).toBe('无匹配')
  })

  it('没有查询串 / 没有命中时两个按钮都禁用，并说明原因', async () => {
    const { host } = await openEditor()
    expect((byLabel(host, '下一个命中') as HTMLButtonElement).disabled).toBe(true)
    expect(byLabel(host, '下一个命中').getAttribute('title')).toBe('先输入要查找的内容')

    type(byLabelPrefix(host, '查找内容'), '找不到的东西')
    expect((byLabel(host, '上一个命中') as HTMLButtonElement).disabled).toBe(true)
    expect(byLabel(host, '上一个命中').getAttribute('title')).toBe('这张表里没有匹配的格子')
  })
})

describe('xlsx 工具条：跳到上一个 / 下一个公式格', () => {
  it('无缓存公式直接显示未计算状态，避免空格被误认作空值', async () => {
    const zip = await JSZip.loadAsync(new Uint8Array(readFileSync(FIXTURE)))
    const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    zip.file(
      'xl/worksheets/sheet1.xml',
      xml.replace('<f>SUM(1,2)</f><v>1001</v>', '<f>SUM(1,2)</f>'),
    )
    const handle = fakeIo(await zip.generateAsync({ type: 'uint8array' }))
    const host = mount(
      <XlsxEditor documentId="no-cache" io={handle.io} hostApply={fakeHostApply} />,
    )
    await waitForTable(host)
    const cell = cellAt(host, 3, 2)
    expect(cell.textContent).toContain('未计算')
    expect(cell.querySelector('.mimir-xlsx__formula-tag')?.textContent).toBe('无结果')
    click(cell)
    expect(host.querySelector('.mimir-cell-editor__warn')?.textContent).toContain(
      '没有可显示的缓存结果',
    )
  })

  it('下一个公式格选中夹具里那一格公式（C3）', async () => {
    const { host } = await openEditor()
    selectRibbonTab(host, '公式')
    click(byLabel(host, '跳到下一个公式格'))
    const cell = selectedCell(host)
    expect(cell?.getAttribute('title')).toContain('缓存结果，当前编辑器未重算')
    expect(cell?.querySelector('.mimir-xlsx__formula-tag')?.textContent).toBe('缓存')
    expect(host.querySelector('.mimir-cell-editor__warn')?.textContent).toContain('可能已过期')
    // 单元格编辑行里的引用证明它是 C3
    expect(host.querySelector('.mimir-cell-editor__ref')?.textContent).toBe('C3')
  })

  it('上一个公式格从还没选中时落到最后一个公式（同一个格）', async () => {
    const { host } = await openEditor()
    selectRibbonTab(host, '公式')
    click(byLabel(host, '跳到上一个公式格'))
    expect(host.querySelector('.mimir-cell-editor__ref')?.textContent).toBe('C3')
  })

  it('选中了非公式格时，下一个公式格仍然找得到那一格', async () => {
    const { host } = await openEditor()
    click(cellAt(host, 5, 0))
    expect(host.querySelector('.mimir-cell-editor__ref')?.textContent).toBe('A5')
    selectRibbonTab(host, '公式')
    click(byLabel(host, '跳到下一个公式格'))
    expect(host.querySelector('.mimir-cell-editor__ref')?.textContent).toBe('C3')
  })
})

/**
 * 编辑是就地改模型的，而查找命中与公式格列表是从快照派生的 `useMemo`。
 *
 * 这两条守的是同一种**静默失效**：派生列表 keyed 在一个「编辑后引用不变」
 * 的对象上。`view()` 在改动后换新对象，但如果派生列表依赖的是
 * `view.sheets[active]` 这个**切片**的引用，而引擎改动后没有把切片一起换掉，
 * 依赖判定相等、派生列表就停在编辑前——查找计数说旧数字、公式跳转按钮
 * 在该禁用时仍可点。界面说的必须是真实模型（界面说了假话比报错更糟）。
 */
describe('xlsx 工具条：编辑之后派生列表跟着模型走', () => {
  it('把一个格改成含查找串之后，命中数跟着变（1 / 3 → 1 / 4）', async () => {
    const { host } = await openEditor()
    type(byLabelPrefix(host, '查找内容'), '部')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(host.querySelector('.me-find__count')?.textContent).toBe('1 / 3')

    // 把 A2（「姓名」）改成「姓名部」：模型里含「部」的格子从 3 个变 4 个
    click(cellAt(host, 2, 0))
    type(byLabel(host, '单元格 A2'), '姓名部')
    press(byLabel(host, '单元格 A2'), 'Enter')

    for (
      let i = 0;
      i < 50 && host.querySelector('.me-find__count')?.textContent !== '1 / 4';
      i += 1
    )
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    // A2 是第 2 行第 0 列，行主序里排在最前 → 选中它就是第 1 个命中
    expect(host.querySelector('.me-find__count')?.textContent).toBe('1 / 4')
  })

  it('唯一的公式格被清空之后，公式跳转按钮禁用并说明原因', async () => {
    let started = false
    let release!: () => void
    let signal: AbortSignal | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { host, saved, agent } = await openEditor(async (request) => {
      const result = await fakeHostApply(request)
      started = true
      signal = request.signal
      await gate
      return result
    })
    selectRibbonTab(host, '公式')
    click(byLabel(host, '跳到下一个公式格'))
    expect(host.querySelector('.mimir-cell-editor__ref')?.textContent).toBe('C3')

    // 覆盖的语义是连公式一起清（xlsx-edit.ts 的规矩）：模型里从此没有公式格
    selectRibbonTab(host, '开始')
    click(byLabelPrefix(host, '清空这个格'))
    selectRibbonTab(host, '公式')
    await waitForGrid(host, () => started)
    expect(signal?.aborted).toBe(false)
    expect(agent().getVersion()).toBe(0)
    await act(async () => release())
    await waitForGrid(host, () => agent().getVersion() === 1)
    const cleared = (await readBasicWorkbook(Buffer.from(agent().currentBytes()))).snapshot
      .sheets[0]!.cells.C3
    expect(cleared?.formula).toBeUndefined()
    expect(cleared?.value).toBe('')
    expect(agent().history()).toEqual({ undo: 1, redo: 0 })

    for (const label of ['跳到上一个公式格', '跳到下一个公式格']) {
      const button = byLabel(host, label) as HTMLButtonElement
      expect(button.disabled, `${label} 该禁用了`).toBe(true)
      expect(button.getAttribute('title')).toBe('这张表里没有公式格')
    }
    await save(host, saved)
    expect((await readBasicWorkbook(Buffer.from(saved()!))).snapshot.sheets[0]!.cells.C3).toEqual(
      cleared,
    )
  })
})

describe('xlsx 工具条：十字高亮', () => {
  it('打开之后选中格所在的行与列都带上 cross 类，关掉就没了', async () => {
    const { host } = await openEditor()
    click(cellAt(host, 5, 1))

    // 关着的时候一个都没有
    expect(host.querySelectorAll('.mimir-xlsx__cell--cross').length).toBe(0)

    selectRibbonTab(host, '视图')
    const toggle = byLabel(host, '十字高亮：选中格所在的行与列')
    click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')

    /** 这一行：A5、B5、C5（表宽 3 列——夹具的 A1:C1 合并定了表宽） */
    for (const col of [0, 1, 2]) {
      expect(
        cellAt(host, 5, col).classList.contains('mimir-xlsx__cell--cross'),
        `第 5 行第 ${col} 列没有高亮`,
      ).toBe(true)
    }
    /** 这一列：B2、B3 也亮（B1 被合并覆盖，不渲染） */
    expect(cellAt(host, 2, 1).classList.contains('mimir-xlsx__cell--cross')).toBe(true)
    expect(cellAt(host, 3, 1).classList.contains('mimir-xlsx__cell--cross')).toBe(true)
    /** 行号格一起亮——不然看不出亮的是哪一行（行号会跳号，所以按行号找而不是数第几个） */
    const row5 = [...host.querySelectorAll('tr')].find(
      (tr) => tr.querySelector('th')?.textContent === '5',
    )
    expect(row5?.querySelector('th')?.classList.contains('mimir-xlsx__gutter--cross')).toBe(true)
    /** 别的行不受影响 */
    expect(cellAt(host, 3, 0).classList.contains('mimir-xlsx__cell--cross')).toBe(false)

    click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(host.querySelectorAll('.mimir-xlsx__cell--cross').length).toBe(0)
  })
})

describe('xlsx 工具条：交互表达操作意图', () => {
  it('开始分类直接呈现单元格和行列命令，空白状态不放操作教程', async () => {
    const { host } = await openEditor()
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('开始')
    expect(byLabelPrefix(host, '清空这个格')).toBeTruthy()
    expect(byLabel(host, '单元格操作')).toBeTruthy()
    expect(byLabel(host, '行列操作')).toBeTruthy()
    expect(host.querySelector('.mimir-editor__footer')?.textContent ?? '').toBe('')
    expect(host.querySelector('.mimir-editor__status')?.textContent).not.toContain('公式不重算')
    expect(host.querySelector('.mimir-editor__status')?.textContent).not.toContain('尚未开放')
    click(cellAt(host, 2, 0))
    expect(byLabelPrefix(host, '清空这个格').getAttribute('title')).toContain('保留原有格式')
  })

  it('公式格被选中后才显示覆盖风险，切换分类不丢失选中格', async () => {
    const { host } = await openEditor()
    click(cellAt(host, 3, 2))
    expect(host.querySelector('.mimir-cell-editor__warn')?.textContent).toContain('覆盖')
    selectRibbonTab(host, '公式')
    expect(host.querySelector('.mimir-cell-editor__ref')?.textContent).toBe('C3')
  })

  it('在公式分类按 Ctrl+F 会显示查找框并聚焦，选中格仍保留', async () => {
    const { host } = await openEditor()
    click(cellAt(host, 3, 2))
    selectRibbonTab(host, '公式')
    expect(host.querySelector('[data-find-input]')).toBeNull()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('开始')
    expect(document.activeElement).toBe(byLabelPrefix(host, '查找内容'))
    expect(host.querySelector('.mimir-cell-editor__ref')?.textContent).toBe('C3')
  })
})

describe('xlsx 的列字母行', () => {
  /**
   * 附属面板与状态行用的是 **Excel 记法**（`C3`），而网格里原来只有一竖列
   * 行号——那个引用在屏幕上找不到落点，用户只能用蓝色选中框反推列号。这一组
   * 守「列头真的在，而且与格子对齐」。
   */
  it('表头有一行列字母，与行号栏同一套 chrome', async () => {
    const { host } = await openEditor()
    const head = host.querySelector('table.mimir-xlsx thead')
    expect(head, '网格没有列字母行').not.toBeNull()

    const letters = [...head!.querySelectorAll<HTMLTableCellElement>('.mimir-xlsx__colhead')]
    expect(letters.length).toBeGreaterThan(0)
    // 夹具是 A/B/C…：第一格是 A，且都是大写字母
    expect(letters.map((cell) => cell.textContent)).toEqual(
      letters.map((_, index) => String.fromCharCode(65 + index)),
    )
    for (const cell of letters) {
      expect(cell.tagName).toBe('TH')
      // 列头是表头（读屏按「第 C 列」念），不是普通格子
      expect(cell.getAttribute('scope')).toBe('col')
    }

    // 左上角交角格：两个 sticky 的交叉点，不给它会压住第一个列字母
    expect(head!.querySelector('.mimir-xlsx__gutter.mimir-xlsx__corner')).not.toBeNull()
  })

  it('列头数 = 行里的数据格数（列头不许多、也不许少）', async () => {
    const { host } = await openEditor()
    const firstRow = [...host.querySelectorAll('tr')].find((tr) => tr.querySelector('td') !== null)
    if (firstRow === undefined) throw new Error('表里没有数据行')
    // 行号格 + 数据格（合并覆盖的不渲染，所以用 colSpan 累加）
    let span = 0
    for (const td of firstRow.querySelectorAll<HTMLTableCellElement>('td')) {
      span += Number(td.getAttribute('colspan') ?? 1)
    }
    const letters = host.querySelectorAll('.mimir-xlsx__colhead')
    expect(letters.length).toBe(span)
  })

  it('附属面板上的引用真的能对到列头（C3 的 C 在列头上）', async () => {
    const { host } = await openEditor()
    // 夹具的公式格在 C3（见文件头那张表）
    click(cellAt(host, 3, 2))
    expect(host.querySelector('.mimir-cell-editor__ref')?.textContent).toBe('C3')

    const letters = [...host.querySelectorAll<HTMLTableCellElement>('.mimir-xlsx__colhead')].map(
      (cell) => cell.textContent,
    )
    expect(letters).toContain('C')
  })
})

/* ── 控件契约：这个格式的控件全走外壳的 antd 原语 ───────────────── */

/**
 * 允许**不经 antd** 的控件：白名单，逐条给理由。
 *
 * 这几样是外壳里有意保留的手写控件（`EditorShell.tsx` 头注释那张表）。它们
 * 与本次迁移无关，但会出现在这棵子树里——不排除的话，这个扫法在「有多个
 * 工作表」的文档上会因为 `.me-tab` 变红，而红的理由与绕过原语无关（假阳性
 * 会让人把断言删掉，那才是真的损失）。
 */
const SHELL_NON_ANTD = [
  '.mimir-compact-toolbar__tab', // Ribbon 分类由共享工具栏实现键盘切换与焦点管理
  '.me-tab', // ToolbarTabs：antd 的 Tabs 把页签渲染成 div，还多一个隐藏的 nav-more
  '.me-btn', // ToolbarMenu / ToolbarColorPicker 的就地弹层触发器（要 aria-haspopup/expanded）
  '.me-menu__item', // 弹层面板里的菜单项
  '.me-color__cell', // 颜色面板里的色块
] as const

/**
 * 允许「**可点但不是控件**」的元素：白名单，xlsx 只有这一处。
 *
 * 表格网格本身。它不该换成 `ToolbarButton`（理由写在 `XlsxEditor.tsx` 那个
 * `<td>` 的注释里），但它确实是「交互元素不走原语」——所以在这里**显式列出**：
 * 不列的话它要么被下一个人误改，要么成为「每处 `onClick` 挂 div」的先例。
 */
const CANVAS_CLICKABLE = '.mimir-xlsx__cell'

describe('xlsx 的控件契约', () => {
  it('没有绕过点：每个原生控件都来自 antd', async () => {
    const { host } = await openEditor()
    const all = [
      ...host.querySelectorAll<HTMLElement>(
        '.mimir-editor button, .mimir-editor input, .mimir-editor select, .mimir-editor textarea',
      ),
    ]
    // 非空前提：一棵空树上「零个绕过点」是句废话
    expect(all.length).toBeGreaterThan(6)
    const bypass = all
      .filter(
        (element) =>
          ![...element.classList].some((name) => name.startsWith('ant-')) &&
          !SHELL_NON_ANTD.some((selector) => element.closest(selector) !== null),
      )
      .map((element) => `<${element.tagName.toLowerCase()} class="${element.className}">`)
    expect(bypass, `这些控件绕过了外壳的原语：${JSON.stringify(bypass)}`).toEqual([])
  })

  it('没有「可点但不是控件」的第二处：画布是 <td>，且没有手写的 role="button"', async () => {
    const { host } = await openEditor()
    const canvas = [...host.querySelectorAll<HTMLElement>(CANVAS_CLICKABLE)]
    expect(canvas.length).toBeGreaterThan(5)
    for (const cell of canvas) expect(cell.tagName).toBe('TD')
    /*
     * 反过来说：子树里不该有第二个「假装是按钮」的元素。antd 的按钮是**真
     * `<button>`**，所以这里为 0；将来谁把一个 div 写成可点的（`role="button"`
     * 是那种写法最常见的补丁），这一条会红。
     */
    expect(host.querySelectorAll('.mimir-editor [role="button"]').length).toBe(0)
  })

  it('禁用的按钮必须说明原因（灰着不说为什么等于让人猜）', async () => {
    const { host } = await openEditor()
    const quickAccess = host.querySelector('.mimir-compact-toolbar__quick-access')
    expect(quickAccess?.querySelectorAll('button')).toHaveLength(3)
    expect(quickAccess?.querySelector('button[aria-label="保存到库"]')).toBe(
      byLabel(host, '保存到库'),
    )
    expect(host.querySelector('.mimir-editor__status button[aria-label="保存到库"]')).toBeNull()
    expect((byLabel(host, '撤销') as HTMLButtonElement).getAttribute('title')).toBe(
      '没有可撤销的编辑',
    )
    expect((byLabel(host, '重做') as HTMLButtonElement).getAttribute('title')).toBe(
      '没有可重做的编辑',
    )
    /*
     * 「保存到库」（没改动 / 正在保存）与 footer 的「应用」（格里的字还没被改过）
     * 都有一段灰着的时间，而那正是最需要解释的一档——不给原因时 `title` 落回
     * 按钮名字，用户只能猜。其余五种格式都有这条断言，只有 xlsx 原来没有。
     */
    click(cellAt(host, 2, 0))
    let disabledCount = 0
    for (const button of host.querySelectorAll<HTMLButtonElement>('button')) {
      if (!button.disabled) continue
      disabledCount += 1
      const title = button.getAttribute('title') ?? ''
      const label = button.getAttribute('aria-label') ?? button.textContent?.trim() ?? ''
      expect(title, `禁用的按钮没有说明原因：${label}`).not.toBe('')
      expect(title, `禁用的按钮把原因与名字混成一件事：${label}`).not.toBe(label)
    }
    // 选中一个格之后「应用」是禁用的（还没打字）、「保存到库」也是——不该是空循环
    expect((byLabel(host, '保存到库') as HTMLButtonElement).disabled).toBe(true)
    expect((byLabel(host, '应用') as HTMLButtonElement).disabled).toBe(true)
    expect(disabledCount).toBeGreaterThan(1)
  })

  it('尺寸统一在 small 档（`EditorShell` 那层 ConfigProvider 盖到了每个控件）', async () => {
    const { host } = await openEditor()
    /*
     * 判据是 **antd 自己的尺寸档类**，不是计算高度：happy-dom 下
     * `Input` / `Select` / `InputNumber` / `Segmented` 的 `getComputedStyle().height`
     * 返回空串（同「跨元素自定义属性/边框不解析」那一类限制），所以
     * 「一行同高」只能靠高度的来源（small 档）来判——真正的同高要在浏览器里量。
     */
    const buttons: HTMLButtonElement[] = []
    for (const tab of ['开始', '公式', '视图']) {
      selectRibbonTab(host, tab)
      buttons.push(...host.querySelectorAll<HTMLButtonElement>('.mimir-editor button.ant-btn'))
    }
    expect(buttons.length).toBeGreaterThan(5)
    const wrong = buttons.filter((button) => !button.classList.contains('ant-btn-sm'))
    expect(
      wrong.map((button) => button.getAttribute('aria-label')),
      '这些按钮不在 small 档',
    ).toEqual([])

    // 格内容编辑框（footer 里那条）也在 small 档
    click(cellAt(host, 2, 0))
    const field = byLabel(host, '单元格 A2')
    expect(field.classList.contains('ant-input-sm')).toBe(true)

    /*
     * `.me-btn` 不许挂在 antd 的按钮上（它的 `height` 与 antd 的
     * `:where(…).ant-btn-sm` 特异性相同而在 head 里更靠后，会把 small 档拉回去）。
     * 上面那条 small 档断言正是它在盯着——挂上就红。
     */
    expect(host.querySelectorAll('.ant-btn.me-btn').length).toBe(0)
  })

  it('格内容编辑框走原语：回车应用、Esc 丢弃草稿（界面显示的回到模型值）', async () => {
    const { host, saved } = await openEditor()
    click(cellAt(host, 2, 0))
    const field = byLabel(host, '单元格 A2')
    // 它是 antd 的 Input（原语），不是我们手写外观的裸 input
    expect(field.classList.contains('ant-input')).toBe(true)

    type(field, '张三丰')
    expect((field as HTMLInputElement).value).toBe('张三丰')

    // Esc = 放弃这次输入：草稿丢掉、回到模型里的值，模型一个字节都没动
    press(field, 'Escape')
    expect((field as HTMLInputElement).value).toBe('姓名')
    expect((byLabel(host, '保存到库') as HTMLButtonElement).disabled).toBe(true)

    // 再输入、这次按回车：落进模型，保存按钮随之可用
    type(field, '张三丰')
    press(field, 'Enter')
    expect(cellAt(host, 2, 0).textContent).toBe('张三丰')
    await save(host, saved)
    expect(await entryOf(saved()!, 'xl/worksheets/sheet1.xml')).toContain('张三丰')
  })

  /**
   * 宽度覆写必须留在 `editors.css` 里。
   *
   * 这是**当初绕过原语的唯一理由**（原语硬编码 180px + `flex: none`，而这条
   * 编辑行要占满内容区宽度）。走 `ToolbarTextField` 之后这个覆写就是整个迁移
   * 里唯一的配套 CSS——删掉它，输入框立刻缩回 180px，而**界面不报错、测试也
   * 不红**（`test.css` 是关的，样式在 vitest 里根本不注入；见 D-064 记的
   * 「计算样式断言在这套配置下做不到」）。所以只能读 CSS 文本做静态守护。
   */
  it('宽度覆写还在 editors.css 里（删了就缩回 180px，且没有任何测试会红）', () => {
    const css = readFileSync(join(import.meta.dirname, 'editors.css'), 'utf8')
    expect(css).toContain('.mimir-cell-editor .me-input--text')
    // 那一条必须同时压掉原语的 `width: 180px` 与 `flex: none`
    const rule = css.slice(css.indexOf('.mimir-cell-editor .me-input--text'))
    const body = rule.slice(rule.indexOf('{') + 1, rule.indexOf('}'))
    expect(body).toMatch(/flex:\s*1/)
    expect(body).toMatch(/width:\s*auto/)
  })

  /**
   * 白名单**真的被验证过**：多表工作簿里页签在，且它仍是裸 `<button>`。
   *
   * 单表夹具下 `.me-tab` 根本不渲染——`SHELL_NON_ANTD` 声明「排除了 4 类」，
   * 实际只验证了「这 4 类恰好都不存在」，白名单的每一条理由都没被检验。
   * 这一条用第二张表把 `.me-tab` 逼出来：它证明①多表时页签确实渲染、
   * ②它确实是绕过 antd 的那一类（所以白名单该留它）、③上面的扫法在它存在
   * 时仍然全绿（白名单真的在起作用，而不是靠「碰巧没有」）。
   */
  it('多表工作簿：页签是裸 button（白名单里那一类的现状被真的守住）', async () => {
    const { host } = await openMultiSheetEditor()
    const tabs = [...host.querySelectorAll<HTMLButtonElement>('.me-tab')]
    expect(tabs.length, '第二张表没渲染出页签（这条断言会失去意义）').toBe(2)
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(['数据', '第二张'])
    // 它不在 antd 的档里——这正是它在白名单里的原因（ToolbarTabs 不迁，见 D-064）
    for (const tab of tabs) {
      expect(tab.classList.contains('ant-btn')).toBe(false)
      expect(tab.tagName).toBe('BUTTON')
    }
    // 切到第二张：表体换成新表的内容（页签不是装饰）
    click(tabs[1]!)
    expect(host.querySelector('.mimir-xlsx')?.textContent).toContain('第二张')

    // 扫法在页签存在时仍然全绿：白名单真的在过滤，而不是「碰巧没有」
    const all = [
      ...host.querySelectorAll<HTMLElement>(
        '.mimir-editor button, .mimir-editor input, .mimir-editor select, .mimir-editor textarea',
      ),
    ]
    const bypass = all
      .filter(
        (element) =>
          ![...element.classList].some((name) => name.startsWith('ant-')) &&
          !SHELL_NON_ANTD.some((selector) => element.closest(selector) !== null),
      )
      .map((element) => `<${element.tagName.toLowerCase()} class="${element.className}">`)
    expect(bypass, `这些控件绕过了外壳的原语：${JSON.stringify(bypass)}`).toEqual([])
  })
})

describe('xlsx 当前格式控件和可见样式', () => {
  it('按范围显示字体字号并切换斜体，保存和重开保持一致', async () => {
    const { host, saved } = await openEditor()
    click(cellAt(host, 2, 0))
    type(byLabel(host, '操作范围（A1 或 A1:B5）'), 'A2:B2')
    click(byLabel(host, '范围字体与对齐'))
    const panel = host.querySelector<HTMLElement>('[role="menu"][aria-label="范围字体与对齐"]')!
    expect(panel).not.toBeNull()
    type(byLabel(panel, '范围字体'), 'Arial')
    click(byLabel(panel, '应用范围字体'))
    await waitForGrid(host, () => cellAt(host, 2, 0).style.fontFamily === 'Arial')
    type(byLabel(panel, '范围字号（1–409 磅）'), '18')
    click(byLabel(panel, '应用范围字号'))
    await waitForGrid(host, () => cellAt(host, 2, 1).style.fontSize === '18pt')
    click(byLabel(panel, '范围斜体'))
    await waitForGrid(host, () => cellAt(host, 2, 0).style.fontStyle === 'italic')
    expect(byLabel(panel, '范围斜体').getAttribute('aria-pressed')).toBe('true')
    click(byLabel(panel, '范围斜体'))
    await waitForGrid(host, () => cellAt(host, 2, 0).style.fontStyle !== 'italic')
    expect(cellAt(host, 2, 2).style.fontFamily).not.toBe('Arial')
    await save(host, saved)
    const reopened = mount(
      <XlsxEditor
        documentId="formats-reopened"
        io={fakeIo(saved()!).io}
        hostApply={fakeHostApply}
      />,
    )
    await waitForTable(reopened)
    expect(cellAt(reopened, 2, 0).style.fontFamily).toBe('Arial')
    expect(cellAt(reopened, 2, 1).style.fontSize).toBe('18pt')
    expect(cellAt(reopened, 2, 0).style.fontStyle).not.toBe('italic')
  })
})

describe('xlsx 可配置范围工具：画布与两次保存', () => {
  it('批量写入保留类型，复制整个矩形后仍保留第一次内容与范围外公式', async () => {
    const { host, saved } = await openEditor()
    type(byLabel(host, '操作范围（A1 或 A1:B5）'), 'A2:B3')
    selectRibbonTab(host, '数据')
    click(byLabel(host, '范围写入与复制'))
    type(byLabel(host, '批量单元格内容（Tab分列，换行分行）'), '12\tTRUE\n=SUM(1,2)\t文字')
    click(byLabel(host, '写入范围内容'))
    await waitForGrid(
      host,
      () => cellAt(host, 2, 0).textContent === '12' && cellAt(host, 2, 1).textContent === 'TRUE',
    )
    await save(host, saved)
    await waitForGrid(host, () => !host.querySelector('fieldset[disabled]'))
    const first = (await readBasicWorkbook(Buffer.from(saved()!))).snapshot.sheets[0]!
    expect(first.cells.A2?.value).toBe(12)
    expect(first.cells.B2?.value).toBe(true)
    expect(first.cells.A3?.formula).toBe('=SUM(1,2)')
    selectRibbonTab(host, '复制')
    type(byLabel(host, '复制与填充源范围'), 'A2:B3')
    type(byLabel(host, '复制与填充目标范围'), 'D2')
    click(byLabel(host, '复制范围并保留格式'))
    await waitForGrid(
      host,
      () =>
        host.querySelectorAll('.mimir-xlsx col').length >= 6 &&
        cellAt(host, 2, 3).textContent === '12',
    )
    await save(host, saved)
    const second = (await readBasicWorkbook(Buffer.from(saved()!))).snapshot.sheets[0]!
    expect(second.cells.D2?.value).toBe(12)
    expect(second.cells.E2?.value).toBe(true)
    expect(second.cells.D3?.formula).toBe('=SUM(1,2)')
    expect(second.cells.C3?.formula).toBe('=SUM(1,2)')
    expect(await entryOf(saved()!, 'xl/worksheets/sheet1.xml')).toMatch(
      /<c[^>]*r="C3"[^>]*><f>SUM\(1,2\)<\/f><v>1001<\/v>/,
    )
    const reopened = mount(
      <XlsxEditor documentId="range-reopen" io={fakeIo(saved()!).io} hostApply={fakeHostApply} />,
    )
    await waitForTable(reopened)
    expect(cellAt(reopened, 2, 3).textContent).toBe('12')
  })
  it('公式转值消除当前画布公式标记，无缓存拒绝条件由宿主明确返回', async () => {
    const { host, saved } = await openEditor()
    click(cellAt(host, 3, 2))
    selectRibbonTab(host, '数据')
    click(byLabel(host, '范围写入与复制'))
    selectRibbonTab(host, '公式转值')
    click(byLabel(host, '公式转为缓存值'))
    await waitForGrid(host, () => !cellAt(host, 3, 2).querySelector('.mimir-xlsx__formula-tag'))
    expect(cellAt(host, 3, 2).textContent).toBe('1001')
    await save(host, saved)
    await waitForGrid(
      host,
      () => host.querySelector('.mimir-xlsx-tools__feedback')?.textContent === '已应用',
    )
    expect(host.textContent).not.toContain('保存后写入原件')
    const cell = (await readBasicWorkbook(Buffer.from(saved()!))).snapshot.sheets[0]!.cells.C3!
    expect(cell.formula).toBeUndefined()
    expect(cell.value).toBe(1001)
  })
  it('行高和行列显隐立即影响网格，隐藏后可通过保留范围恢复并保存两次', async () => {
    const { host, saved } = await openEditor()
    type(byLabel(host, '操作范围（A1 或 A1:B5）'), 'A3:B3')
    selectRibbonTab(host, '布局')
    click(byLabel(host, '行列尺寸与显示'))
    type(byLabel(host, '行高（磅）'), '36')
    press(byLabel(host, '行高（磅）'), 'Enter')
    click(byLabel(host, '应用范围行高'))
    await waitForGrid(host, () => cellAt(host, 3, 0).closest('tr')?.style.height === '48px')
    click(byLabel(host, '隐藏范围行'))
    await waitForGrid(
      host,
      () =>
        ![...host.querySelectorAll('tr')].some(
          (row) => row.querySelector('th')?.textContent === '3',
        ),
    )
    expect(byLabel(host, '行列尺寸与显示').getAttribute('aria-expanded')).toBe('true')
    await save(host, saved)
    expect(await entryOf(saved()!, 'xl/worksheets/sheet1.xml')).toMatch(
      /<row[^>]*r="3"[^>]*hidden="1"/,
    )
    await waitForGrid(host, () => !host.querySelector('fieldset[disabled]'))
    click(byLabel(host, '显示范围行'))
    await waitForGrid(host, () =>
      [...host.querySelectorAll('tr')].some(
        (row) => row.querySelector('th')?.textContent === '3' && row.style.height === '48px',
      ),
    )
    selectRibbonTab(host, '列')
    click(byLabel(host, '隐藏范围列'))
    await waitForGrid(host, () => host.querySelectorAll('.mimir-xlsx col').length === 2)
    click(byLabel(host, '显示范围列'))
    await waitForGrid(host, () => host.querySelectorAll('.mimir-xlsx col').length === 4)
    await save(host, saved)
    expect(await entryOf(saved()!, 'xl/worksheets/sheet1.xml')).toMatch(
      /<row[^>]*r="3"[^>]*ht="36"/,
    )
  })
})

describe('xlsx 链接、批注与保护的实际保存', () => {
  it('按分类编辑链接和批注，保护可见且可撤销，保存两次重开保留', async () => {
    const { host, saved } = await openEditor()
    click(cellAt(host, 2, 0))
    selectRibbonTab(host, '审阅')
    click(byLabel(host, '单元格链接批注与保护'))
    type(byLabel(host, '单元格超链接地址'), 'https://example.com/中文?a=1&b=2')
    expect(host.textContent).toContain('待应用')
    click(byLabel(host, '应用单元格超链接'))
    await waitForGrid(host, () => cellAt(host, 2, 0).style.textDecoration === 'underline')
    selectRibbonTab(host, '批注')
    type(byLabel(host, '单元格批注正文'), '这是批注 & <详情>')
    click(byLabel(host, '保存单元格批注'))
    await waitForGrid(host, () => cellAt(host, 2, 0).title.includes('这是批注'))
    await save(host, saved)
    await waitForGrid(
      host,
      () => host.querySelector('.mimir-xlsx-tools__feedback')?.textContent === '已应用',
    )
    expect(host.textContent).not.toContain('保存后写入原件')
    const first = await readXlsx(saved()!)
    expect(first.sheets[0]!.extras?.notes.A2?.text).toBe('这是批注 & <详情>')
    expect(first.sheets[0]!.extras?.hyperlinks.A2).toBe('https://example.com/中文?a=1&b=2')
    await waitForGrid(host, () => !host.querySelector('fieldset[aria-busy="true"]'))
    selectRibbonTab(host, '保护')
    click(byLabel(host, '保护工作表'))
    await waitForGrid(host, () => !!host.querySelector('[aria-label="取消工作表保护"]'))
    expect((byLabel(host, '应用') as HTMLButtonElement).disabled).toBe(true)
    click(byLabel(host, '取消工作表保护'))
    await waitForGrid(host, () => !host.querySelector('.mimir-xlsx-cell-input[disabled]'))
    selectRibbonTab(host, '批注')
    type(byLabel(host, '单元格批注正文'), '第二次更新')
    click(byLabel(host, '保存单元格批注'))
    await waitForGrid(host, () => cellAt(host, 2, 0).title.includes('第二次更新'))
    await save(host, saved)
    const reopened = mount(
      <XlsxEditor
        documentId="features-reopen"
        io={fakeIo(saved()!).io}
        hostApply={fakeHostApply}
      />,
    )
    await waitForTable(reopened)
    expect(cellAt(reopened, 2, 0).title).toContain('第二次更新')
    expect(cellAt(reopened, 2, 0).style.textDecoration).toBe('underline')
    const last = await readXlsx(saved()!)
    expect(last.sheets[0]!.extras?.protected).toBe(false)
  })
})

describe('xlsx 数据规则、打印、名称和冻结', () => {
  it('打印面板只提交改动字段，单独编辑页眉保留原页脚，成功后清除已应用的页面草稿', async () => {
    const initial = await applyXlsxPropertyOperation(
      new Uint8Array(readFileSync(FIXTURE)),
      workbookOperationSchema.parse({
        op: 'set_page_setup',
        sheetId: 'sheet-1',
        header: { left: '原页眉' },
        footer: { right: '原页脚 &P' },
        scale: 85,
      }),
      0,
    )
    const { io, saved } = fakeIo(initial.bytes)
    const host = mount(<XlsxEditor documentId="print-patch" io={io} hostApply={fakeHostApply} />)
    await waitForTable(host)
    selectRibbonTab(host, '布局')
    click(byLabel(host, '打印设置'))
    pickSelectOption(host, '纸张方向', '横向')
    selectRibbonTab(host, '页眉页脚')
    expect((byLabel(host, '应用打印页眉页脚') as HTMLButtonElement).disabled).toBe(true)
    type(byLabel(host, '页眉居中文字'), '新页眉')
    click(byLabel(host, '应用打印页眉页脚'))
    await waitForGrid(host, () => host.textContent?.includes('新页眉') ?? false)
    await waitForGrid(host, () => !host.querySelector('fieldset[aria-busy="true"]'))
    expect((byLabel(host, '应用打印页眉页脚') as HTMLButtonElement).disabled).toBe(true)
    await save(host, saved)
    let xml = (await entryOf(saved()!, 'xl/worksheets/sheet1.xml'))!
    expect(xml).toContain('<oddFooter>&amp;R原页脚 &amp;P</oddFooter>')
    expect(xml).toContain('<oddHeader>&amp;C新页眉</oddHeader>')
    expect(xml).toContain('scale="85"')
    selectRibbonTab(host, '页面')
    click(byLabel(host, '应用打印页面设置'))
    await waitForGrid(host, () => (byLabel(host, '应用打印页面设置') as HTMLButtonElement).disabled)
    await save(host, saved)
    xml = (await entryOf(saved()!, 'xl/worksheets/sheet1.xml'))!
    expect(xml).toContain('orientation="landscape"')
    expect(xml).toContain('scale="85"')
    expect(xml).toContain('<oddFooter>&amp;R原页脚 &amp;P</oddFooter>')
  })
  it('分类面板管理规则、名称和打印，冻结实际作用网格，保存两次重开保持', async () => {
    const { host, saved } = await openEditor()
    type(byLabel(host, '操作范围（A1 或 A1:B5）'), 'A2:B3')
    selectRibbonTab(host, '数据')
    click(byLabel(host, '数据规则与迷你图'))
    type(byLabel(host, '下拉选项（每行一项）'), '甲\n乙')
    click(byLabel(host, '应用范围数据验证'))
    await waitForGrid(host, () => host.textContent?.includes('当前工作表有1项验证') ?? false)
    selectRibbonTab(host, '条件格式')
    type(byLabel(host, '比较数值'), '5')
    click(byLabel(host, '添加范围条件格式'))
    await waitForGrid(host, () => host.textContent?.includes('当前1条规则') ?? false)
    selectRibbonTab(host, '迷你图')
    type(byLabel(host, '迷你图目标起点（留空为范围右侧）'), 'C2')
    click(byLabel(host, '插入范围迷你图'))
    await waitForGrid(host, () => host.querySelectorAll('.mimir-xlsx-sparkline').length === 2)
    press(byLabel(host, '数据规则与迷你图'), 'Escape')
    selectRibbonTab(host, '公式')
    click(byLabel(host, '命名范围管理'))
    type(byLabel(host, '名称'), '销售区域')
    type(byLabel(host, '引用或公式'), "'数据'!$A$2:$B$3")
    click(byLabel(host, '新增工作簿命名范围'))
    await waitForGrid(host, () => host.textContent?.includes('已应用') ?? false)
    pickSelectOption(host, '工作簿命名范围', '销售区域')
    expect(host.textContent).toContain("'数据'!$A$2:$B$3")
    press(byLabel(host, '命名范围管理'), 'Escape')
    selectRibbonTab(host, '布局')
    click(byLabel(host, '打印设置'))
    pickSelectOption(host, '纸张方向', '横向')
    click(byLabel(host, '应用打印页面设置'))
    await waitForGrid(host, () => host.textContent?.includes('已应用') ?? false)
    await save(host, saved)
    expect(await entryOf(saved()!, 'xl/worksheets/sheet1.xml')).toContain('orientation="landscape"')
    await waitForGrid(
      host,
      () => host.querySelector('.mimir-xlsx-tools__feedback')?.textContent === '已应用',
    )
    expect(host.textContent).not.toContain('保存后写入原件')
    await waitForGrid(host, () => !host.querySelector('fieldset[aria-busy="true"]'))
    press(byLabel(host, '打印设置'), 'Escape')
    selectRibbonTab(host, '视图')
    click(byLabel(host, '冻结窗格设置'))
    expect((byLabel(host, '应用冻结窗格') as HTMLButtonElement).disabled).toBe(true)
    expect(byLabel(host, '应用冻结窗格').getAttribute('title')).toBe('冻结行列数没有变化')
    expect((byLabel(host, '取消冻结窗格') as HTMLButtonElement).disabled).toBe(true)
    expect(byLabel(host, '取消冻结窗格').getAttribute('title')).toBe('当前没有冻结窗格')
    type(byLabel(host, '冻结顶部行数'), '2')
    press(byLabel(host, '冻结顶部行数'), 'Enter')
    type(byLabel(host, '冻结左侧列数'), '1')
    press(byLabel(host, '冻结左侧列数'), 'Enter')
    expect((byLabel(host, '应用冻结窗格') as HTMLButtonElement).disabled).toBe(false)
    click(byLabel(host, '应用冻结窗格'))
    await waitForGrid(host, () => cellAt(host, 2, 0).style.position === 'sticky')
    expect((byLabel(host, '应用冻结窗格') as HTMLButtonElement).disabled).toBe(true)
    expect((byLabel(host, '取消冻结窗格') as HTMLButtonElement).disabled).toBe(false)
    expect(cellAt(host, 2, 0).style.left).toBe('34px')
    expect(cellAt(host, 3, 1).style.position).not.toBe('sticky')
    await save(host, saved)
    const parsed = await readXlsx(saved()!)
    expect(parsed.definedNames?.find((n) => n.name === '销售区域')?.ref).toBe("'数据'!$A$2:$B$3")
    expect(parsed.sheets[0]!.extras).toMatchObject({
      frozenRows: 2,
      frozenColumns: 1,
      pageSetup: { orientation: 'landscape' },
    })
    expect(parsed.sheets[0]!.extras?.validations).toHaveLength(1)
    expect(parsed.sheets[0]!.extras?.conditionalFormats).toHaveLength(1)
    expect(parsed.sheets[0]!.extras?.sparklines).toHaveLength(2)
    const reopened = mount(
      <XlsxEditor
        documentId="property-reopen"
        io={fakeIo(saved()!).io}
        hostApply={fakeHostApply}
      />,
    )
    await waitForTable(reopened)
    expect(cellAt(reopened, 2, 0).style.position).toBe('sticky')
    selectRibbonTab(reopened, '视图')
    click(byLabel(reopened, '冻结窗格设置'))
    click(byLabel(reopened, '取消冻结窗格'))
    await waitForGrid(reopened, () => cellAt(reopened, 2, 0).style.position !== 'sticky')
    expect((byLabel(reopened, '冻结顶部行数') as HTMLInputElement).value).toBe('0')
    expect((byLabel(reopened, '冻结左侧列数') as HTMLInputElement).value).toBe('0')
    expect((byLabel(reopened, '应用冻结窗格') as HTMLButtonElement).disabled).toBe(true)
    expect((byLabel(reopened, '取消冻结窗格') as HTMLButtonElement).disabled).toBe(true)
  })
})

it('无选区与非法范围也可打开数据、布局分类及各面板，不读取空range边界', async () => {
  const { host } = await openEditor()
  for (const invalid of ['', '不是范围', 'XFE1', 'A0']) {
    type(byLabel(host, '操作范围（A1 或 A1:B5）'), invalid)
    selectRibbonTab(host, '数据')
    click(byLabel(host, '范围写入与复制'))
    expect(host.querySelector('[role="menu"][aria-label="范围写入与复制"]')).not.toBeNull()
    type(byLabel(host, '批量单元格内容（Tab分列，换行分行）'), '内容')
    expect((byLabel(host, '写入范围内容') as HTMLButtonElement).disabled).toBe(true)
    for (const mode of ['复制', '筛选复制', '公式转值']) selectRibbonTab(host, mode)
    expect((byLabel(host, '公式转为缓存值') as HTMLButtonElement).disabled).toBe(true)
    press(byLabel(host, '范围写入与复制'), 'Escape')
    selectRibbonTab(host, '布局')
    click(byLabel(host, '行列尺寸与显示'))
    expect((byLabel(host, '应用范围行高') as HTMLButtonElement).disabled).toBe(true)
    selectRibbonTab(host, '列')
    expect((byLabel(host, '应用范围列宽') as HTMLButtonElement).disabled).toBe(true)
    press(byLabel(host, '行列尺寸与显示'), 'Escape')
  }
})
