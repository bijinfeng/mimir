// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import type { Editor } from '@tiptap/core'
import { afterEach, expect, it } from 'vitest'
import JSZip from 'jszip'
import { DocxEditor } from './DocxEditor.js'
import { openDocx } from '../docx.js'
import { openSelect, selectRoot } from '../shell/antd-test-dom.js'

const FIXTURE = join(
  import.meta.dirname,
  '../../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
)
const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))
async function settle(done: () => boolean) {
  for (let i = 0; i < 100 && !done(); i++)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 2)))
  expect(done()).toBe(true)
}
async function press(host: HTMLElement, label: string) {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
  expect(button).not.toBeNull()
  expect(button.disabled).toBe(false)
  act(() => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })))
  await act(async () => button.click())
}
function type(host: HTMLElement, label: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  act(() => {
    field.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function pick(host: HTMLElement, label: string, text: string) {
  selectRoot(host, label)
  openSelect(host, label)
  const option = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find(
    (item) => item.textContent === text,
  )!
  expect(option).toBeTruthy()
  act(() => {
    option.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    option.click()
  })
}
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((entry) => !entry.dir)
        .map(async (entry) => [entry.name, await entry.async('uint8array')]),
    ),
  )
}
async function boot() {
  const bytes = new Uint8Array(readFileSync(FIXTURE))
  const saves: Uint8Array[] = []
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await act(async () =>
    root.render(
      <ConfigProvider componentSize="small">
        <DocxEditor
          documentId="table-design-controls"
          io={{
            load: async () => bytes,
            save: async (saved) => {
              saves.push(saved.slice())
            },
          }}
        />
      </ConfigProvider>,
    ),
  )
  await settle(
    () =>
      host.querySelector('button[aria-label="保存到库"]')?.getAttribute('title') ===
      '没有未保存的改动',
  )
  const editor = (host.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor
  let tablePos = -1
  editor.state.doc.forEach((node, pos) => {
    if (node.type.name === 'docTable' && tablePos < 0) tablePos = pos
  })
  expect(tablePos).toBeGreaterThanOrEqual(0)
  const tab = () =>
    act(() =>
      [...host.querySelectorAll<HTMLElement>('[role=tab]')]
        .find((item) => item.textContent === '表格')!
        .click(),
    )
  tab()
  expect(host.querySelector<HTMLButtonElement>('[aria-label="表格设计与属性"]')!.disabled).toBe(
    true,
  )
  act(() => editor.commands.setTextSelection(tablePos + 4))
  await press(host, '表格设计与属性')
  return { host, bytes, editor, tablePos, saves }
}

it('real Inspector shows current values; drafts apply once, save twice and preserve undo/redo after saves', async () => {
  const { host, editor, bytes, tablePos, saves } = await boot()
  const original = editor.state.doc
  const margin = Number(editor.state.doc.nodeAt(tablePos)!.attrs.cellMar?.right ?? 108) / 20
  expect(host.querySelector<HTMLInputElement>('[aria-label="右边距（磅）"]')!.value).toBe(
    String(margin),
  )
  expect(host.querySelector('[aria-label="应用表格设计"]')!.textContent).toBe('应用表格设计')
  expect(host.querySelector<HTMLButtonElement>('[aria-label="应用表格设计"]')!.disabled).toBe(true)
  expect(
    host.querySelector('.mimir-docx-table-design__look-grid')!.querySelectorAll('button'),
  ).toHaveLength(6)
  type(host, '右边距（磅）', '12.5')
  await press(host, '表格汇总行')
  expect(editor.state.doc).toBe(original)
  await press(host, '应用表格设计')
  expect(editor.state.doc.nodeAt(tablePos)!.attrs.cellMar.right).toBe(250)
  expect(editor.state.doc.nodeAt(tablePos)!.attrs.tblLook.lastRow).toBe(true)
  const save = async (n: number) => {
    await press(host, '保存到库')
    await settle(() => saves.length === n)
    await settle(
      () => host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')?.disabled === true,
    )
  }
  await save(1)
  const opened = await openDocx(saves[0]!)
  expect(opened.blocks.find((block) => block.type === 'table')!.table!.cellMarTwips!.right).toBe(
    250,
  )
  await press(host, '撤销 (Ctrl+Z)')
  await save(2)
  expect(await entries(saves[1]!)).toEqual(await entries(bytes))
  await press(host, '重做 (Ctrl+Shift+Z)')
  await save(3)
  expect(await entries(saves[2]!)).toEqual(await entries(saves[0]!))
})
it('preset and border controls are real drafts; last color/width edits affect chosen lines', async () => {
  const { host, editor, tablePos, saves } = await boot()
  const original = editor.state.doc
  pick(host, '快速表格预设', '浅蓝表头')
  expect(host.querySelector('table[aria-label="浅蓝表头效果预览"]')).not.toBeNull()
  expect(editor.state.doc).toBe(original)
  pick(host, '边框应用范围', '整张表格')
  await press(host, '暂存外侧框线')
  type(host, '边框颜色', '008800')
  type(host, '边框线宽（磅）', '1.5')
  await press(host, '应用表格设计')
  const cell = editor.state.doc.nodeAt(tablePos)!.firstChild!.firstChild!
  expect(cell.attrs.fill).toBe('D9EAF7')
  expect(cell.attrs.borders.top).toEqual({ style: 'single', szEighths: 12, color: '008800' })
  await press(host, '保存到库')
  await settle(() => saves.length === 1)
  expect(
    (await openDocx(saves[0]!)).blocks.find((block) => block.type === 'table')!.table!.rows[0]![0]!
      .borders!.top!.color,
  ).toBe('008800')
})
it('Escape discards the draft and returns focus; changed document blocks stale application', async () => {
  const { host, editor } = await boot()
  const original = editor.state.doc
  await press(host, '表格汇总行')
  const inspector = host.querySelector<HTMLElement>('.mimir-docx-inspector')!
  act(() => inspector.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(host.querySelector('.mimir-docx-inspector')).toBeNull()
  expect(document.activeElement).toBe(host.querySelector('[aria-label="表格设计与属性"]'))
  expect(editor.state.doc).toBe(original)
  await press(host, '表格设计与属性')
  await press(host, '表格汇总行')
  await act(async () => editor.commands.insertContent('人工修改'))
  const current = editor.state.doc
  expect(host.querySelector<HTMLButtonElement>('[aria-label="应用表格设计"]')!.disabled).toBe(true)
  expect(host.textContent).toContain('文档已变化，请重新选择表格')
  for (const label of [
    '文档表格样式',
    '快速表格预设',
    '边框应用范围',
    '边框线型',
    '表格水平对齐',
    '表格自动调整',
  ]) {
    const select = selectRoot(host, label)
    expect(select.classList.contains('ant-select-disabled')).toBe(true)
    act(() => select.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
    expect(select.querySelector('[aria-expanded="true"]')).toBeNull()
  }
  expect(editor.state.doc).toBe(current)
})

it('floating position fields are drafts, keep a fixed primary and apply signed coordinates and asymmetric distances together', async () => {
  const { host, editor, tablePos, saves } = await boot()
  const before = editor.state.doc
  pick(host, '表格文字环绕', '文字在右侧（表格靠左）')
  type(host, '表格水平位置（厘米）', '-0.4')
  type(host, '表格垂直位置（厘米）', '-0.8')
  type(host, '右距正文（厘米）', '0.7')
  expect(editor.state.doc).toBe(before)
  const panel = host.querySelector('.mimir-docx-table-design')!
  expect(panel.querySelector('.mimir-docx-table-design__actions')!.parentElement).toBe(panel)
  expect(panel.querySelectorAll('.ant-btn-primary')).toHaveLength(1)
  await press(host, '应用表格设计')
  const attrs = editor.state.doc.nodeAt(tablePos)!.attrs
  expect(attrs).toMatchObject({
    tblFloat: 'left',
    tblFloatSource: 'left',
    tblFloatXTwips: -227,
    tblFloatYTwips: -454,
    tblFloatXSpec: null,
    tblFloatHorzAnchor: 'margin',
    tblFloatVertAnchor: 'margin',
    tblFloatDistance: { right: 397 },
  })
  expect(host.querySelector('table.doc-table-float-left')).not.toBeNull()
  await press(host, '保存到库')
  await settle(() => saves.length === 1)
  const xml = await (await JSZip.loadAsync(saves[0]!)).file('word/document.xml')!.async('string')
  expect(xml).toContain('w:tblpX="-227"')
  expect(xml).toContain('w:tblpY="-454"')
  expect(xml).toContain('w:rightFromText="397"')
  await press(host, '撤销 (Ctrl+Z)')
  expect(editor.state.doc.eq(before)).toBe(true)
})

it('position selection Escape discards the full draft and restores the existing live entry', async () => {
  const { host, editor } = await boot()
  const before = editor.state.doc
  pick(host, '表格文字环绕', '文字在左侧（表格靠右）')
  const inspector = host.querySelector<HTMLElement>('.mimir-docx-inspector')!
  act(() => inspector.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(editor.state.doc).toBe(before)
  expect(host.querySelector('.mimir-docx-inspector')).toBeNull()
  expect(document.activeElement).toBe(host.querySelector('[aria-label="表格设计与属性"]'))
})
