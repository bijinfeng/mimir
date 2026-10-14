import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createXlsxAgentHandle } from './xlsx-agent.js'
import { openXlsxForEdit } from '../xlsx-edit.js'
import { findXlsxCells } from '../xlsx-find.js'

const fixture = new URL(
  '../../vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
  import.meta.url,
)
const load = () => new Uint8Array(readFileSync(fixture))

describe('XLSX current-canvas find_cells', () => {
  it('reports the send-time selection in workbook context after the user moves', async () => {
    const bytes = load()
    let selection = { sheet: 0, row: 2, col: 0 }
    const handle = createXlsxAgentHandle(
      'xlsx-1',
      bytes,
      await openXlsxForEdit(bytes),
      () => selection,
      () => undefined,
      async () => {
        throw new Error('只读上下文不应调用宿主写入')
      },
    )
    handle.freezeSelection('r1')
    selection = { sheet: 0, row: 8, col: 2 }
    const context = await handle.execute('get_workbook_context', {}, { roundId: 'r1' })
    expect(context).toMatchObject({ data: { selection: { sheetId: 'sheet-1', address: 'A2' } } })
    handle.dispose()
  })

  it('uses the same search projection as manual Find after an unsaved edit', async () => {
    const original = load()
    const handle = createXlsxAgentHandle(
      'xlsx-1',
      original,
      await openXlsxForEdit(original),
      () => null,
      () => undefined,
      async ({ bytes, expectedVersion }) => {
        const session = await openXlsxForEdit(bytes)
        session.setCell({ sheet: 0, row: 5, col: 1 }, '未保存的检索目标')
        return {
          bytes: await session.save(),
          version: expectedVersion + 1,
          changedCells: ['sheet-1:B5'],
          touchedEntries: ['xl/worksheets/sheet1.xml'],
        }
      },
    )
    const before = await handle.execute('find_cells', { query: '未保存的检索目标' }, {})
    expect(before).toMatchObject({ data: { matches: [] }, version: 0 })
    await handle.execute(
      'propose_operations',
      { operations: [{ op: 'set_cell' }] },
      { roundId: 'r1' },
    )
    const found = (await handle.execute(
      'find_cells',
      { query: '未保存的检索目标' },
      {
        expectedVersion: 1,
      },
    )) as { data: { matches: { sheetId: string; address: string }[] }; version: number }
    expect(found.data.matches).toMatchObject([{ sheetId: 'sheet-1', address: 'B5' }])
    expect(
      findXlsxCells(handle.currentSession().view(), { query: '未保存的检索目标' }).matches,
    ).toMatchObject(found.data.matches)
    expect(handle.isDirty()).toBe(true)
    await expect(
      handle.execute(
        'find_cells',
        { query: '未保存的检索目标' },
        {
          expectedVersion: 0,
        },
      ),
    ).rejects.toThrow('版本已变化')
    expect(handle.getVersion()).toBe(1)
    expect(handle.currentBytes()).not.toEqual(original)
    handle.dispose()
  })

  it('rejects invalid search arguments without changing the canvas', async () => {
    const bytes = load()
    const handle = createXlsxAgentHandle(
      'xlsx-1',
      bytes,
      await openXlsxForEdit(bytes),
      () => null,
      () => undefined,
      async () => {
        throw new Error('只读查找不应调用宿主写入')
      },
    )
    await expect(handle.execute('find_cells', { query: '' }, {})).rejects.toThrow('query')
    await expect(handle.execute('find_cells', { query: '[', regex: true }, {})).rejects.toThrow(
      'Invalid regular expression',
    )
    await expect(
      handle.execute('find_cells', { query: '姓名', sheetId: 'missing' }, {}),
    ).rejects.toThrow('工作表 ID')
    expect(handle.getVersion()).toBe(0)
    expect(handle.currentBytes()).toEqual(bytes)
    handle.dispose()
  })
})
