/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import { PptxTableControls } from './PptxTableControls.js'
import { pickSelectOption, selectValueText } from '../shell/antd-test-dom.js'
import { openPptxForEdit } from '../pptx.js'
import {
  elementDurableId,
  openPptx,
  savePptx,
} from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn, type Op } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import type { TableElement } from '../../vendor/packages/pptx-engine/src/types.js'

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
  if (!found) throw new Error(`Missing ${label}`)
  return found
}
function tab(host: HTMLElement, label: string) {
  click(
    [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === label,
    )!,
  )
}
function number(host: HTMLElement, label: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}
async function setup(rejected = false, merged = false) {
  const opened = await openPptx(fixture)
  expect(
    runTxn(opened, {
      isolation: 'atomic',
      ops: [
        {
          op: 'addTable',
          target: { slide: 0 },
          rows: 2,
          cols: 2,
          offset: { x: 914400, y: 1371600, cx: 5486400, cy: 1371600 },
        },
      ],
    }).applied,
  ).toBe(true)
  const inserted = opened.deck.slides[0]!.elements.find((item) => item.type === 'table')!
  const target = { slide: 0, el: elementDurableId(inserted)! }
  const mergeResult = merged
    ? runTxn(opened, {
        isolation: 'atomic',
        ops: [{ op: 'tableMerge', target, kind: 'merge-right', row: 0, col: 0 }],
      })
    : undefined
  expect(mergeResult?.applied ?? true).toBe(true)
  let bytes = await savePptx(opened)
  let version = 0
  let table = (await openPptxForEdit(bytes))
    .slides()[0]!
    .elements.find((item): item is TableElement => item.type === 'table')!
  const originalCell = table.anchor.originalXml.match(/<a:tc>.*?<\/a:tc>/s)?.[0]
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const render = () =>
    root.render(
      <ConfigProvider componentSize="small">
        <PptxTableControls
          table={table}
          version={version}
          target={target}
          apply={apply}
          colors={[
            { value: '#FF0000', label: '红', swatch: '#FF0000' },
            { value: '#000000', label: '黑', swatch: '#000000' },
          ]}
          editParagraphRuns={() => null}
        />
      </ConfigProvider>,
    )
  const apply = vi.fn<(op: Record<string, unknown>) => Promise<boolean>>(async (op) => {
    if (rejected) return false
    const source = await openPptx(bytes)
    const result = runTxn(source, { isolation: 'atomic', ops: [op as Op] })
    expect(result.failures ?? []).toEqual([])
    expect(result.applied).toBe(true)
    bytes = await savePptx(source)
    version += 1
    table = (await openPptxForEdit(bytes))
      .slides()[0]!
      .elements.find((item): item is TableElement => item.type === 'table')!
    render()
    return true
  })
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () => render())
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  const readTwice = async () => {
    const once = await openPptxForEdit(bytes),
      first = await once.save()
    once.commit()
    const twice = await openPptxForEdit(first),
      second = await twice.save(),
      zip = await JSZip.loadAsync(second)
    expect(await zip.file('ppt/theme/theme1.xml')!.async('uint8array')).toEqual(
      await (await JSZip.loadAsync(fixture)).file('ppt/theme/theme1.xml')!.async('uint8array'),
    )
    return {
      xml: await zip.file('ppt/slides/slide1.xml')!.async('string'),
      zip,
      table: twice
        .slides()[0]!
        .elements.find((item): item is TableElement => item.type === 'table')!,
    }
  }
  const submit = async () => {
    await act(async () => {
      button(host, '应用表格样式').click()
      await new Promise((finish) => setTimeout(finish, 35))
    })
    for (let i = 0; i < 40 && host.querySelector('[aria-busy="true"]'); i++)
      await act(async () => {
        await new Promise((finish) => setTimeout(finish, 5))
      })
    let result: Awaited<ReturnType<typeof readTwice>> | undefined
    await act(async () => {
      result = await readTwice()
    })
    return result!
  }
  return { host, apply, submit, readTwice, originalCell }
}

it.each([
  ['无样式', '2D5ABB26-0587-4C30-8999-92F81FD0307C', undefined],
  ['浅色网格', '2D5ABB26-0587-4C30-8999-92F81FD0307C', 'BFBFBF'],
  ['蓝色交替行', 'A10FF1CE-0000-4000-9000-000000000001', '4472C4'],
  ['灰色交替行', 'A10FF1CE-0000-4000-9000-000000000002', '595959'],
  ['深蓝标题行', 'A10FF1CE-0000-4000-9000-000000000003', '1F3864'],
  ['橙色标题行', 'A10FF1CE-0000-4000-9000-000000000004', 'ED7D31'],
  ['简洁无边框', 'A10FF1CE-0000-4000-9000-000000000005', 'F2F2F2'],
  ['完整边框', '2D5ABB26-0587-4C30-8999-92F81FD0307C', '000000'],
])(
  'applies native preset %s and retains current selection after two saves',
  async (label, styleId, color) => {
    const { host, submit } = await setup()
    tab(host, '样式')
    expect(host.querySelectorAll('[aria-label="表格样式预设"] button')).toHaveLength(8)
    click(button(host, `表格样式：${label}`))
    expect(button(host, `表格样式：${label}`).getAttribute('aria-pressed')).toBe('true')
    expect(button(host, '应用表格样式').textContent).toBe('应用表格样式')
    const { xml, zip } = await submit()
    expect(xml).toContain(styleId)
    const savedStyles = await zip.file('ppt/tableStyles.xml')!.async('string')
    expect(xml + savedStyles).toContain(color ?? styleId)
    expect(button(host, `表格样式：${label}`).getAttribute('aria-pressed')).toBe('true')
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('样式')
    expect(button(host, '应用表格样式').disabled).toBe(true)
  },
)
it('targets explicit active cell, saves RTL and border color/width, and retains untouched cell XML', async () => {
  const { host, submit, apply, originalCell } = await setup()
  pickSelectOption(host, '行', '第 2 行')
  pickSelectOption(host, '列', '第 2 列')
  tab(host, '样式')
  pickSelectOption(host, '表格方向', '从右到左')
  click(button(host, '表格底纹'))
  click(button(host, '红'))
  click(button(host, '表格边框颜色'))
  click(button(host, '红'))
  number(host, '边框宽度（pt）', '2.5')
  const { xml, table } = await submit()
  expect(apply.mock.calls[0]?.[0]).toMatchObject({
    rtl: true,
    cells: [{ row: 1, col: 1 }],
    shadingColor: '#FF0000',
    borderColor: '#FF0000',
    borderWidthPt: 2.5,
    borderPreset: 'all',
  })
  expect(xml).toContain('rtl="1"')
  expect(xml).toContain('<a:lnL w="31750">')
  expect(xml).toContain(originalCell)
  expect(table.rows[1]?.[1]?.fill).toEqual({ type: 'solid', color: '#FF0000' })
  expect(table.rows[0]?.[0]?.fill).not.toEqual({ type: 'solid', color: '#FF0000' })
  expect(selectValueText(host, '行')).toBe('第 2 行')
  expect(selectValueText(host, '列')).toBe('第 2 列')
  expect(selectValueText(host, '表格方向')).toBe('从右到左')
  expect(table.rows[1]?.[1]?.borders?.l?.width).toBe(31750)
  expect(Number(host.querySelector<HTMLInputElement>('[aria-label="边框宽度（pt）"]')?.value)).toBe(
    2.5,
  )
})
it('whole-table shading, no fill and no borders persist without changing text nodes', async () => {
  const { host, submit, apply } = await setup()
  tab(host, '样式')
  pickSelectOption(host, '样式应用范围', '整个表格')
  click(button(host, '表格底纹'))
  click(button(host, '红'))
  let result = await submit()
  expect(apply.mock.calls[0]?.[0]).not.toHaveProperty('cells')
  expect(
    result.table.rows
      .flat()
      .every((cell) => cell.fill?.type === 'solid' && cell.fill.color === '#FF0000'),
  ).toBe(true)
  click(button(host, '表格底纹'))
  click(button(host, '无底纹'))
  pickSelectOption(host, '表格边框', '无边框')
  result = await submit()
  expect(result.xml.match(/<a:noFill\/>/g)?.length).toBeGreaterThanOrEqual(20)
  expect(result.table.rows.flat().every((cell) => !cell.fill || cell.fill.type === 'none')).toBe(
    true,
  )
  expect(result.xml).toContain('<a:lnL w="0"><a:noFill/></a:lnL>')
})
it('failed style submission retains drafts across categories and tabs support keyboard navigation', async () => {
  const { host, submit, apply } = await setup(true)
  tab(host, '样式')
  pickSelectOption(host, '表格方向', '从右到左')
  const style = host.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')!
  act(() => {
    style.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
  })
  expect(document.activeElement?.textContent).toBe('内容')
  tab(host, '样式')
  await submit()
  expect(apply).toHaveBeenCalledOnce()
  expect(selectValueText(host, '表格方向')).toBe('从右到左')
  expect(button(host, '应用表格样式').disabled).toBe(false)
})
it('a late successful submission preserves a newer style draft after the canvas version advances', async () => {
  const { host, apply } = await setup()
  const originalApply = apply.getMockImplementation()!
  let finish!: () => void
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  apply.mockImplementation(async (op) => {
    const applied = await originalApply(op)
    await pending
    return applied
  })
  tab(host, '样式')
  pickSelectOption(host, '表格方向', '从右到左')
  await act(async () => {
    button(host, '应用表格样式').click()
    await new Promise((resolve) => setTimeout(resolve, 35))
  })
  expect(host.querySelector('[aria-busy="true"]')).not.toBeNull()
  expect(selectValueText(host, '表格方向')).toBe('从右到左')
  pickSelectOption(host, '表格方向', '从左到右')
  await act(async () => {
    finish()
    await pending
  })
  expect(selectValueText(host, '表格方向')).toBe('从左到右')
  expect(button(host, '应用表格样式').disabled).toBe(false)
})
it('merged placeholder blocks editing and structure changes, while whole-table formatting remains usable', async () => {
  const { host, submit } = await setup(false, true)
  tab(host, '布局')
  expect(button(host, '在当前行后插入行').disabled).toBe(true)
  pickSelectOption(host, '列', '第 2 列')
  tab(host, '内容')
  expect(button(host, '应用单元格文字').disabled).toBe(true)
  tab(host, '样式')
  expect(button(host, '表格底纹').disabled).toBe(true)
  pickSelectOption(host, '样式应用范围', '整个表格')
  click(button(host, '表格底纹'))
  click(button(host, '红'))
  const { table } = await submit()
  expect(table.rows[0]?.[0]?.gridSpan).toBe(2)
  expect(table.rows[0]?.[0]?.fill).toEqual({ type: 'solid', color: '#FF0000' })
})
