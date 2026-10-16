import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { readXlsx } from './xlsx.js'
import { exportXlsxDisplayedSheet } from './xlsx-export.js'
import { openXlsxForEdit } from './xlsx-edit.js'
import { createXlsxAgentHandle } from './agent/xlsx-agent.js'
const load = () =>
  new Uint8Array(
    readFileSync(
      new URL('../vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx', import.meta.url),
    ),
  )
describe('XLSX displayed-value export and whole-workbook history', () => {
  it('exports the current unsaved sheet as formatted values only, with correct CSV quotes and Chinese', async () => {
    const sheet = (await readXlsx(load())).sheets[0]!
    sheet.rows[0]!.cells[0]!.text = '中文,"标题"\n第二行'
    const csv = await exportXlsxDisplayedSheet(sheet, 'csv')
    expect(csv.bytes.slice(0, 3)).toEqual(new Uint8Array([239, 187, 191]))
    expect(new TextDecoder().decode(csv.bytes)).toContain('"中文,""标题""\n第二行"')
    const xlsx = await exportXlsxDisplayedSheet(sheet, 'xlsx'),
      reopened = (await readXlsx(xlsx.bytes)).sheets
    expect(reopened).toHaveLength(1)
    expect(reopened[0]!.rows[0]!.cells[0]!.text).toBe('中文,"标题"\n第二行')
    expect(reopened[0]!.rows.flatMap((r) => r.cells).some((c) => c.formula)).toBe(false)
    const zip = await JSZip.loadAsync(xlsx.bytes)
    expect(zip.file('xl/styles.xml')).toBeNull()
  })
  it('keeps sparse row positions, enforces export bounds and handles empty sheets', async () => {
    const sheet = (await readXlsx(load())).sheets[0]!
    sheet.rows = [sheet.rows.at(-1)!]
    const result = await exportXlsxDisplayedSheet(sheet, 'xlsx')
    expect(
      (await readXlsx(result.bytes)).sheets[0]!.rows.find((r) => r.number === 5)!.cells[2]!.text,
    ).toBe('88.5')
    sheet.rows[0]!.number = 20001
    await expect(exportXlsxDisplayedSheet(sheet, 'csv')).rejects.toThrow('20000')
    sheet.rows = []
    expect(
      (await readXlsx((await exportXlsxDisplayedSheet(sheet, 'xlsx')).bytes)).sheets,
    ).toHaveLength(1)
  })
  it('restores full bytes with undo/redo, tracks the saved baseline and invalidates stale round undo', async () => {
    const bytes = load(),
      initial = await openXlsxForEdit(bytes)
    const handle = createXlsxAgentHandle(
      'xlsx-1',
      bytes,
      initial,
      () => null,
      () => undefined,
      async (request) => {
        const session = await openXlsxForEdit(request.bytes)
        session.setCell(
          { sheet: 0, row: 2, col: 0 },
          String((request.ops[0] as { value: string }).value),
        )
        return {
          bytes: await session.save(),
          version: request.expectedVersion + 1,
          changedCells: ['A2'],
          touchedEntries: ['xl/worksheets/sheet1.xml'],
        }
      },
    )
    await handle.execute(
      'propose_operations',
      { operations: [{ value: '修改一' }] },
      { roundId: 'r1' },
    )
    handle.markSaved()
    expect(handle.history()).toEqual({ undo: 1, redo: 0 })
    await handle.undo()
    expect(handle.currentBytes()).toEqual(bytes)
    expect(handle.isDirty()).toBe(true)
    expect(await handle.undoRound('r1')).toBe(false)
    await handle.redo()
    expect(
      handle
        .currentSession()
        .view()
        .sheets[0]!.rows.find((r) => r.number === 2)!.cells[0]!.text,
    ).toBe('修改一')
    expect(handle.isDirty()).toBe(false)
    await handle.undo()
    await handle.execute('propose_operations', { operations: [{ value: '修改二' }] }, {})
    expect(handle.history().redo).toBe(0)
    const exported = await handle.exportSheet('xlsx', 'sheet-1')
    expect(
      (await readXlsx(exported.bytes)).sheets[0]!.rows.find((r) => r.number === 2)!.cells[0]!.text,
    ).toBe('修改二')
    handle.dispose()
    await expect(handle.exportSheet('csv')).rejects.toThrow('关闭')
    expect(await handle.undo()).toBe(false)
  })
})
