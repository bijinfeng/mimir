/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import { XlsxEditor } from './XlsxEditor.js'
import { readXlsx } from '../xlsx.js'
import type { XlsxAgentHandle, XlsxHostApply } from '../agent/xlsx-agent.js'
import { applyXlsxObjectOperation } from '../../../../apps/server/src/services/xlsx-agent-objects.js'
import { workbookOperationSchema } from '../../vendor/packages/xlsx-gateway/src/domain/workbook-dsl.js'

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()))
async function tick() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)))
}
async function wait(done: () => boolean) {
  for (let i = 0; i < 100 && !done(); i++) await tick()
  expect(done()).toBe(true)
}
function click(host: HTMLElement, name: string) {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!
  expect(button).not.toBeNull()
  expect(button.disabled).toBe(false)
  act(() => button.click())
}
function tab(host: HTMLElement, name: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (node) => node.textContent?.trim() === name,
  )!
  expect(button).toBeDefined()
  act(() => button.click())
}
function type(host: HTMLElement, name: string, value: string) {
  const input = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[aria-label="${name}"]`,
  )!
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const realApply: XlsxHostApply = ({ bytes, ops, expectedVersion }) =>
  applyXlsxObjectOperation(bytes, workbookOperationSchema.parse(ops[0]), expectedVersion)
async function fixture() {
  const zip = await JSZip.loadAsync(
    readFileSync(
      join(import.meta.dirname, '../../vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx'),
    ),
  )
  zip.file(
    'xl/worksheets/sheet2.xml',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>第二张原文</t></is></c></row></sheetData></worksheet>',
  )
  for (const [path, close, addition] of [
    [
      'xl/workbook.xml',
      '</sheets>',
      '<sheet name="第二张" sheetId="2" r:id="rIdShapeCheck" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>',
    ],
    [
      'xl/_rels/workbook.xml.rels',
      '</Relationships>',
      '<Relationship Id="rIdShapeCheck" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>',
    ],
    [
      '[Content_Types].xml',
      '</Types>',
      '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
    ],
  ])
    zip.file(path!, (await zip.file(path!)!.async('string')).replace(close!, addition! + close!))
  return zip.generateAsync({ type: 'uint8array' })
}
async function mount(execute: XlsxHostApply, bytes = fixture()) {
  const source = await bytes,
    host = document.createElement('div'),
    root = createRoot(host)
  let handle: XlsxAgentHandle | null = null
  document.body.append(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const render = (documentId = 'shape-check') =>
    act(() =>
      root.render(
        <XlsxEditor
          documentId={documentId}
          io={{ load: async () => source, save: async () => {} }}
          hostApply={execute}
          onAgentHandleChange={(next) => {
            handle = next
          }}
        />,
      ),
    )
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  render()
  await wait(() => !!handle && !!host.querySelector('.mimir-xlsx'))
  tab(host, '插入')
  click(host, '图表、形状与结构化表')
  tab(host, '形状')
  return { host, source, render, handle: () => handle! }
}

it.each(['document', 'sheet'])(
  'discards real native shape bytes after the pending %s context changes',
  async (mode) => {
    let finish: (() => void) | undefined
    const execute = vi.fn<XlsxHostApply>(async (request) => {
      const result = await realApply(request)
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      return result
    })
    const ui = await mount(execute),
      oldHandle = ui.handle()
    click(ui.host, '心形')
    type(ui.host, '左上角单元格', 'F2')
    click(ui.host, '插入形状')
    await wait(() => !!finish)
    if (mode === 'document') {
      ui.render('new-shape-document')
      await wait(() => ui.handle()?.documentId === 'new-shape-document')
    } else {
      tab(ui.host, '开始')
      tab(ui.host, '第二张')
    }
    expect(
      mode === 'document'
        ? ui.handle().documentId
        : ui.host.querySelector('.mimir-xlsx')?.textContent,
    ).toContain(mode === 'document' ? 'new-shape-document' : '第二张原文')
    expect(execute.mock.calls[0]![0].signal?.aborted).toBe(true)
    await act(async () => finish!())
    await tick()
    expect(oldHandle.getVersion()).toBe(0)
    expect(ui.handle().getVersion()).toBe(0)
    expect(ui.handle().history().undo).toBe(0)
    expect(ui.handle().currentBytes()).toEqual(ui.source)
    expect(ui.handle().isDirty()).toBe(false)
  },
)

it('rejects an incorrect host version without losing the shape draft and accepts a clean retry once', async () => {
  let wrongVersion = true
  const execute = vi.fn<XlsxHostApply>(async (request) => {
    const result = await realApply(request)
    return wrongVersion ? { ...result, version: result.version + 1 } : result
  })
  const ui = await mount(execute)
  click(ui.host, '心形')
  type(ui.host, '左上角单元格', 'G4')
  type(ui.host, '形状文字', '失败后保留')
  click(ui.host, '插入形状')
  await wait(() => !!ui.host.querySelector('.mimir-xlsx-shapes__footer [role="alert"]'))
  expect(ui.host.textContent).toContain('错误的画布版本')
  expect(ui.handle().currentBytes()).toEqual(ui.source)
  expect(ui.handle().history().undo).toBe(0)
  expect(ui.host.querySelector<HTMLTextAreaElement>('[aria-label="形状文字"]')?.value).toBe(
    '失败后保留',
  )
  expect(ui.host.querySelector('[aria-label="心形"]')?.getAttribute('aria-checked')).toBe('true')
  wrongVersion = false
  click(ui.host, '插入形状')
  await wait(() => ui.handle().getVersion() === 1)
  expect(execute).toHaveBeenCalledTimes(2)
  expect(execute.mock.calls[1]![0]).toMatchObject({ expectedVersion: 0 })
  expect(ui.handle().history().undo).toBe(1)
  expect((await readXlsx(ui.handle().currentBytes())).sheets[0]!.visuals?.[0]).toMatchObject({
    shapeType: 'heart',
    text: '失败后保留',
    anchor: { fromColumn: 6, fromRow: 3 },
  })
})

it('retains a complex native shape XML exactly when inserting another shape and shows the preview limitation', async () => {
  const baseline = await fixture(),
    workbook = await readXlsx(baseline),
    sheetId = workbook.sheets[0]!.id
  const first = await realApply({
    documentId: 'shape-check',
    bytes: baseline,
    expectedVersion: 0,
    ops: [
      {
        op: 'add_shape',
        sheetId,
        shapeType: 'heart',
        anchorCell: 'F2',
        text: '复杂原件',
        fillColor: '#4472C4',
      },
    ],
  })
  const zip = await JSZip.loadAsync(first.bytes),
    drawingPath = (await readXlsx(first.bytes)).sheets[0]!.visuals![0]!.drawingPath
  let drawing = await zip.file(drawingPath)!.async('string')
  drawing = drawing
    .replace(/<a:xfrm(?=[\s>])/, '<a:xfrm rot="1800000" flipH="1"')
    .replace('<a:avLst/>', '<a:avLst><a:gd name="adj" fmla="val 37500"/></a:avLst>')
  zip.file(drawingPath, drawing)
  const originalShape = drawing.match(/<xdr:sp(?=[\s>])[\s\S]*?<\/xdr:sp>/)![0]
  expect(originalShape).toContain('rot="1800000"')
  expect(originalShape).toContain('val 37500')
  const ui = await mount(realApply, zip.generateAsync({ type: 'uint8array' }))
  tab(ui.host, '管理')
  act(() => ui.host.querySelector<HTMLButtonElement>('.mimir-xlsx-object')!.click())
  expect(ui.host.textContent).toContain('预设轮廓')
  expect(ui.host.textContent).toContain('预览有限')
  tab(ui.host, '形状')
  click(ui.host, '云形标注')
  type(ui.host, '左上角单元格', 'L3')
  click(ui.host, '插入形状')
  await wait(() => ui.handle().getVersion() === 1)
  const saved = await JSZip.loadAsync(ui.handle().currentBytes()),
    after = await saved.file(drawingPath)!.async('string')
  expect(after).toContain(originalShape)
  expect((await readXlsx(ui.handle().currentBytes())).sheets[0]!.visuals).toHaveLength(2)
})
