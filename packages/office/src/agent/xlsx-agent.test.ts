import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import * as xlsxEdit from '../xlsx-edit.js'
import { createXlsxAgentHandle } from './xlsx-agent.js'
import { openXlsxForEdit } from '../xlsx-edit.js'
import { findXlsxCells } from '../xlsx-find.js'
import JSZip from 'jszip'

const fixture = new URL(
  '../../vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
  import.meta.url,
)
const load = () => new Uint8Array(readFileSync(fixture))

describe('XLSX current-canvas find_cells', () => {
  it.each(['abort', 'dispose'] as const)(
    'rejects %s while reparsing a host result',
    async (action) => {
      const bytes = load()
      const initial = await openXlsxForEdit(bytes)
      const changed = vi.fn<() => void>()
      const handle = createXlsxAgentHandle(
        'xlsx-1',
        bytes,
        initial,
        () => null,
        changed,
        async ({ expectedVersion }) => ({
          bytes,
          version: expectedVersion + 1,
          changedCells: [],
          touchedEntries: [],
        }),
      )
      let release!: () => void
      let entered!: () => void
      const parsing = new Promise<void>((resolve) => {
        entered = resolve
      })
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const parser = vi.spyOn(xlsxEdit, 'openXlsxForEdit').mockImplementationOnce(async () => {
        entered()
        await gate
        return initial
      })
      const controller = new AbortController()
      try {
        const pending = handle.execute(
          'propose_operations',
          { operations: [{}] },
          { signal: controller.signal },
        )
        const rejected = pending.catch((error: unknown) => error)
        await parsing
        if (action === 'abort') controller.abort()
        else handle.dispose()
        release()
        const error = await rejected
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toContain('取消')
        expect(changed).not.toHaveBeenCalled()
        expect(handle.getVersion()).toBe(0)
        expect(handle.isDirty()).toBe(false)
      } finally {
        release()
        parser.mockRestore()
        handle.dispose()
      }
    },
  )

  it('recalculates through the shared host action, reads refreshed cache and undoes the round', async () => {
    const bytes = load()
    const handle = createXlsxAgentHandle(
      'xlsx-1',
      bytes,
      await openXlsxForEdit(bytes),
      () => null,
      () => undefined,
      async (request) => {
        expect(request.action).toBe('recalculate_formulas')
        expect(request.ops).toEqual([])
        const zip = await JSZip.loadAsync(request.bytes)
        const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
        zip.file('xl/worksheets/sheet1.xml', xml.replace('<v>1001</v>', '<v>3</v>'))
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
      },
    )
    await expect(
      handle.execute('propose_operations', { operations: [{}], recalculate: true }, {}),
    ).rejects.toThrow('重算须单独')
    const result = await handle.execute(
      'propose_operations',
      { operations: [], recalculate: true },
      { roundId: 'recalc' },
    )
    expect(result).toMatchObject({ data: { recalculation: { formulaCount: 1 } } })
    expect(handle.getVersion()).toBe(1)
    expect(handle.isDirty()).toBe(true)
    expect(
      handle
        .currentSession()
        .view()
        .sheets[0]?.rows.find((row) => row.number === 3)?.cells[2]?.text,
    ).toBe('3')
    expect(await handle.undoRound('recalc')).toBe(true)
    expect(handle.currentBytes()).toEqual(bytes)
    expect(handle.isDirty()).toBe(false)
    handle.dispose()
  })

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

  it('does not publish an undo result after the canvas is disposed during reparse', async () => {
    const bytes = load()
    const initial = await openXlsxForEdit(bytes)
    const changed = vi.fn<() => void>()
    const handle = createXlsxAgentHandle(
      'xlsx-1',
      bytes,
      initial,
      () => null,
      changed,
      async ({ expectedVersion }) => ({
        bytes,
        version: expectedVersion + 1,
        changedCells: [],
        touchedEntries: [],
      }),
    )
    await handle.execute('propose_operations', { operations: [{}] }, { roundId: 'undo' })
    changed.mockClear()
    let release!: () => void
    let entered!: () => void
    const parsing = new Promise<void>((resolve) => {
      entered = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const parser = vi.spyOn(xlsxEdit, 'openXlsxForEdit').mockImplementationOnce(async () => {
      entered()
      await gate
      return initial
    })
    try {
      const pending = handle.undoRound('undo')
      await parsing
      handle.dispose()
      release()
      expect(await pending).toBe(false)
      expect(changed).not.toHaveBeenCalled()
      expect(handle.getVersion()).toBe(1)
    } finally {
      release()
      parser.mockRestore()
      handle.dispose()
    }
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

describe('XLSX inspection tools over the active unsaved canvas', () => {
  it('reads styles, aggregates raw numeric values and returns real filter/merge feature state', async () => {
    const bytes = load()
    const handle = createXlsxAgentHandle(
      'xlsx-1',
      bytes,
      await openXlsxForEdit(bytes),
      () => null,
      () => undefined,
      async () => {
        throw new Error('只读工具不应写入')
      },
    )
    const formats = await handle.execute('read_formats', { range: 'A2:C3' }, {})
    expect(formats).toMatchObject({
      ok: true,
      changed: false,
      data: { sheetId: 'sheet-1', cells: expect.any(Array) },
    })
    const result = await handle.execute('aggregate_range', { range: 'C3:C5', topValues: 2 }, {})
    expect(result).toMatchObject({
      data: { cells: 3, nonEmpty: 2, numericCount: 2, topValues: expect.any(Array) },
    })
    const features = await handle.execute('read_sheet_features', {}, {})
    expect(features).toMatchObject({ data: { sheetId: 'sheet-1', features: expect.any(Object) } })
    const guide = await handle.execute('load_guide', { guides: ['data', 'formulas'] }, {})
    expect(guide).toMatchObject({ data: { guides: [{ name: 'data' }, { name: 'formulas' }] } })
    await expect(handle.execute('read_formats', { range: 'A1:Z100' }, {})).rejects.toThrow('200格')
    expect(handle.getVersion()).toBe(0)
    expect(handle.isDirty()).toBe(false)
    handle.dispose()
  })

  it('traces static cross-sheet references and updates the real range selection callback', async () => {
    const zip = await JSZip.loadAsync(load())
    zip.file(
      'xl/worksheets/sheet1.xml',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>3</v></c><c r="B1"><f>SUM(A1:A2)+$A$1</f><v>7</v></c><c r="C1"><f>INDIRECT("A1")</f><v>3</v></c></row><row r="2"><c r="A2"><v>1</v></c></row></sheetData></worksheet>',
    )
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    let selected: unknown = null
    const handle = createXlsxAgentHandle(
      'xlsx-1',
      bytes,
      await openXlsxForEdit(bytes),
      () => null,
      () => undefined,
      async () => {
        throw new Error('只读工具不应写入')
      },
      (next) => {
        selected = next
      },
    )
    const precedents = await handle.execute('trace_precedents', { address: 'B1' }, {})
    expect(precedents).toMatchObject({
      data: {
        precedents: [
          { range: 'A1:A2', cells: [{ address: 'A1' }, { address: 'A2' }] },
          { range: '$A$1' },
        ],
      },
    })
    const dependents = await handle.execute('trace_dependents', { address: 'A1' }, {})
    expect(dependents).toMatchObject({
      data: { dependents: [{ address: 'B1' }], unresolvedFormulas: 1 },
    })
    await handle.execute('select_range', { range: 'A1:B2' }, {})
    expect(selected).toEqual({ sheet: 0, row: 1, col: 0, range: 'A1:B2' })
    expect(handle.isDirty()).toBe(false)
    handle.dispose()
  })
})
