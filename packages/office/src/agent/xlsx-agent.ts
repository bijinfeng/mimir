import { exportXlsxDisplayedSheet } from '../xlsx-export.js'
import { openXlsxForEdit, type XlsxEditSession } from '../xlsx-edit.js'
import { inspectXlsx } from './xlsx-inspect.js'
import { findXlsxCells } from '../xlsx-find.js'
import type { XlsxCell, XlsxSheet, XlsxWorkbook } from '../xlsx.js'
import type { XlsxHostAction, XlsxRecalculation } from '@mimir/shared'

export interface XlsxHostApply {
  (request: {
    documentId: string
    bytes: Uint8Array
    expectedVersion: number
    ops: unknown[]
    imageFile?: File
    action?: XlsxHostAction
    signal?: AbortSignal
  }): Promise<{
    bytes: Uint8Array
    version: number
    changedCells: string[]
    touchedEntries: string[]
    recalculation?: XlsxRecalculation
  }>
}

export interface XlsxAgentHandle {
  format: 'xlsx'
  documentId: string
  getVersion(): number
  getContext(): Record<string, unknown>
  freezeSelection(roundId?: string): Record<string, unknown>
  execute(
    tool: string,
    args: unknown,
    options: { expectedVersion?: number; roundId?: string; signal?: AbortSignal; imageFile?: File },
  ): Promise<unknown>
  undoRound(roundId: string): Promise<boolean>
  history(): { undo: number; redo: number }
  undo(): Promise<boolean>
  redo(): Promise<boolean>
  exportSheet(format: 'xlsx' | 'csv', sheetId?: string): ReturnType<typeof exportXlsxDisplayedSheet>
  currentBytes(): Uint8Array
  flush(): Promise<Uint8Array>
  currentSession(): XlsxEditSession
  isDirty(): boolean
  markSaved(): void
  dispose(): void
}

type Selection = { sheet: number; row: number; col: number; range?: string } | null
type Snapshot = {
  bytes: Uint8Array
  version: number
  dirty: boolean
  lastVersion: number
  recalculation?: XlsxRecalculation
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('XLSX 工具参数必须是对象')
  return value as Record<string, unknown>
}

function string(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new Error(`${name} 必须是字符串`)
  return value
}

function columnIndex(letters: string): number {
  return [...letters].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0) - 1
}

function range(value: unknown): {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
} {
  const text = string(value, 'range')
  const match = /^([A-Z]{1,3})([1-9]\d{0,6})(?::([A-Z]{1,3})([1-9]\d{0,6}))?$/.exec(text)
  if (!match) throw new Error('range 必须是 A1 或 A1:B5')
  const startRow = Number(match[2])
  const endRow = Number(match[4] ?? match[2])
  const startCol = columnIndex(match[1]!)
  const endCol = columnIndex(match[3] ?? match[1]!)
  if (startRow > endRow || startCol > endCol || endRow > 1_048_576 || endCol > 16_383)
    throw new Error('range 超出工作表边界')
  if ((endRow - startRow + 1) * (endCol - startCol + 1) > 2_000)
    throw new Error('单次最多读取 2000 个格子')
  return { startRow, startCol, endRow, endCol }
}

function columnLetters(col: number): string {
  let n = col + 1
  let out = ''
  while (n > 0) {
    n -= 1
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26)
  }
  return out
}

function cellAt(sheet: XlsxSheet, row: number, col: number): XlsxCell | null {
  return sheet.rows.find((item) => item.number === row)?.cells[col] ?? null
}

function sheetOf(workbook: XlsxWorkbook, id: unknown, fallback: number): XlsxSheet {
  const sheet =
    typeof id === 'string'
      ? workbook.sheets.find((item) => item.id === id)
      : workbook.sheets[fallback]
  if (!sheet) throw new Error('工作表 ID 已失效，请重新读取工作簿')
  return sheet
}

export function createXlsxAgentHandle(
  documentId: string,
  initialBytes: Uint8Array,
  initialSession: XlsxEditSession,
  selection: () => Selection,
  onChange: (session: XlsxEditSession, dirty: boolean, recalculation?: XlsxRecalculation) => void,
  hostApply: XlsxHostApply,
  onSelect?: (selection: { sheet: number; row: number; col: number; range: string }) => void,
  onBusyChange?: (busy: boolean) => void,
): XlsxAgentHandle {
  let bytes: Uint8Array = initialBytes.slice()
  let session = initialSession
  let version = 0
  let dirty = false
  let recalculation: XlsxRecalculation | undefined
  let disposed = false
  let savedBytes = initialBytes.slice()
  const undoStack: Snapshot[] = [],
    redoStack: Snapshot[] = []
  const capture = (): Snapshot => ({
    bytes: bytes.slice(),
    version,
    dirty,
    lastVersion: version,
    recalculation,
  })
  const remember = (stack: Snapshot[], snapshot: Snapshot) => {
    stack.push(snapshot)
    while (
      stack.length > 50 ||
      stack.reduce((n, item) => n + item.bytes.length, 0) > 64 * 1024 * 1024
    )
      stack.shift()
  }
  const replay = (from: Snapshot[], to: Snapshot[]) => {
    const task = pending.then(async () => {
      if (disposed || !from.length) return false
      onBusyChange?.(true)
      try {
        const snapshot = from.at(-1)!
        const restored = await openXlsxForEdit(snapshot.bytes)
        if (disposed) return false
        remember(to, capture())
        from.pop()
        bytes = snapshot.bytes.slice()
        session = restored
        version++
        recalculation = snapshot.recalculation
        dirty =
          bytes.length !== savedBytes.length ||
          bytes.some((byte, index) => byte !== savedBytes[index])
        rounds.clear()
        frozen.clear()
        onChange(session, dirty, recalculation)
        return true
      } finally {
        onBusyChange?.(false)
      }
    })
    pending = task.catch(() => undefined)
    return task
  }
  const rounds = new Map<string, Snapshot>()
  const frozen = new Map<string, Selection>()
  let pending: Promise<unknown> = Promise.resolve()

  const currentSelection = (roundId?: string): Selection =>
    roundId && frozen.has(roundId) ? frozen.get(roundId)! : selection()

  const context = (selected = selection()) => {
    const workbook = session.view()
    return {
      version,
      sheets: workbook.sheets.map((sheet) => ({
        id: sheet.id,
        name: sheet.name,
        hidden: sheet.hidden === true,
        usedRows: sheet.empty
          ? 0
          : sheet.rows.reduce((maximum, row) => Math.max(maximum, row.number), 0),
        usedColumns: sheet.empty ? 0 : sheet.columns.length,
        charts: (sheet.visuals ?? [])
          .filter((v) => v.kind === 'chart')
          .map((v) => ({ chartPath: v.chartPath, title: v.name })),
        tables: (sheet.tables ?? []).map((t) => ({ name: t.name, range: t.range })),
        pivots: (sheet.pivots ?? []).map((p) => ({ name: p.name, range: p.definition.outputRef })),
      })),
      selection: selected
        ? {
            sheetId: workbook.sheets[selected.sheet]?.id,
            address: `${columnLetters(selected.col)}${selected.row}`,
            range: selected.range,
          }
        : null,
      dirty,
      recalculation,
      limitations: [
        '普通写入不自动重算；可单独调用propose_operations并传operations:[]和recalculate:true。图表数据和透视刷新使用当前缓存；修改源数据后需显式刷新图表数据或透视表',
      ],
    }
  }

  const run = async (
    tool: string,
    args: unknown,
    options: { expectedVersion?: number; roundId?: string; signal?: AbortSignal; imageFile?: File },
  ): Promise<unknown> => {
    if (disposed) throw new Error('XLSX 画布已关闭')
    if (options.expectedVersion !== undefined && options.expectedVersion !== version)
      throw new Error('XLSX 画布版本已变化，请重新读取')
    if (options.signal?.aborted) throw new Error('XLSX 操作已取消')
    const input = object(args)
    const selected = currentSelection(options.roundId)
    const workbook = session.view()
    if (tool === 'get_workbook_context')
      return { ok: true, changed: false, version, data: context(selected) }
    const inspection = await inspectXlsx(tool, input, workbook, bytes, selected?.sheet ?? 0)
    if (inspection !== undefined) return { ok: true, changed: false, version, data: inspection }
    if (tool === 'find_cells') {
      const query = typeof input.query === 'string' ? input.query.trim() : ''
      const errorsOnly = input.errors_only === true
      if (!errorsOnly && !query) throw new Error('query 必须是非空字符串，或设置 errors_only=true')
      if (input.regex !== undefined && typeof input.regex !== 'boolean')
        throw new Error('regex 必须是布尔值')
      if (
        input.look_in !== undefined &&
        input.look_in !== 'values' &&
        input.look_in !== 'formulas' &&
        input.look_in !== 'both'
      )
        throw new Error('look_in 必须是 values、formulas 或 both')
      if (input.sheetId !== undefined && typeof input.sheetId !== 'string')
        throw new Error('sheetId 必须是字符串')
      if (
        input.max_results !== undefined &&
        (typeof input.max_results !== 'number' || !Number.isFinite(input.max_results))
      )
        throw new Error('max_results 必须是数字')
      const maxResults =
        typeof input.max_results === 'number' && input.max_results >= 1
          ? Math.min(Math.floor(input.max_results), 200)
          : 50
      const { matches, truncated } = findXlsxCells(workbook, {
        query,
        regex: input.regex === true,
        lookIn: input.look_in ?? 'both',
        errorsOnly,
        sheetId: typeof input.sheetId === 'string' ? input.sheetId.trim() || undefined : undefined,
        maxResults,
      })
      return {
        ok: true,
        changed: false,
        version,
        data: {
          matches,
          truncated,
          incompleteSheets: [],
          note: '公式格的text取当前缓存；普通写入不自动重算，可读取上下文中的recalculation状态',
        },
      }
    }
    if (tool === 'read_range' || tool === 'read_cells') {
      const sheet = sheetOf(workbook, input.sheetId, selected?.sheet ?? 0)
      const coordinates =
        tool === 'read_range'
          ? (() => {
              const bounds = range(input.range)
              const refs: Array<{ row: number; col: number }> = []
              for (let row = bounds.startRow; row <= bounds.endRow; row++)
                for (let col = bounds.startCol; col <= bounds.endCol; col++) refs.push({ row, col })
              return refs
            })()
          : (() => {
              if (!Array.isArray(input.addresses) || input.addresses.length > 100)
                throw new Error('addresses 必须是至多 100 个单元格地址')
              return input.addresses.map((address) => {
                const bounds = range(address)
                if (bounds.startRow !== bounds.endRow || bounds.startCol !== bounds.endCol)
                  throw new Error('read_cells 只能读取单元格地址')
                return { row: bounds.startRow, col: bounds.startCol }
              })
            })()
      return {
        ok: true,
        changed: false,
        version,
        data: {
          sheetId: sheet.id,
          cells: coordinates.map(({ row, col }) => {
            const cell = cellAt(sheet, row, col)
            return {
              address: `${columnLetters(col)}${row}`,
              text: cell?.text ?? '',
              formula: cell?.formulaText ?? (cell?.formula ? '[共享公式，当前预览无法展开]' : null),
              covered: cell?.covered === true,
            }
          }),
        },
      }
    }
    if (tool === 'select_range') {
      const sheet = sheetOf(workbook, input.sheetId, selected?.sheet ?? 0)
      const bounds = range(input.range)
      onSelect?.({
        sheet: workbook.sheets.indexOf(sheet),
        row: bounds.startRow,
        col: bounds.startCol,
        range: String(input.range),
      })
      return {
        ok: true,
        changed: false,
        version,
        data: {
          sheetId: sheet.id,
          range: input.range,
          cells: (bounds.endRow - bounds.startRow + 1) * (bounds.endCol - bounds.startCol + 1),
        },
      }
    }
    if (tool !== 'propose_operations') throw new Error(`XLSX 工具 ${tool} 尚未接入`)
    if (input.recalculate !== undefined && typeof input.recalculate !== 'boolean')
      throw new Error('recalculate必须是布尔值')
    if (
      !Array.isArray(input.operations) ||
      (input.recalculate === true ? input.operations.length !== 0 : input.operations.length < 1) ||
      input.operations.length > 50
    )
      throw new Error('operations 必须包含 1–50 项；重算须单独提交空operations和recalculate=true')
    const prior = { bytes: bytes.slice(), version, dirty, lastVersion: version + 1, recalculation }
    const result = await hostApply({
      documentId,
      bytes: bytes.slice(),
      expectedVersion: version,
      ops: input.operations,
      action: input.recalculate === true ? 'recalculate_formulas' : 'apply_ops',
      signal: options.signal,
      imageFile: options.imageFile,
    })
    if (disposed || options.signal?.aborted) throw new Error('XLSX 操作已取消')
    if (result.version !== version + 1) throw new Error('XLSX 宿主返回了错误的画布版本')
    const nextSession = await openXlsxForEdit(result.bytes)
    if (disposed || options.signal?.aborted) throw new Error('XLSX 操作已取消')
    if (options.roundId) {
      const first = rounds.get(options.roundId)
      rounds.set(options.roundId, first ? { ...first, lastVersion: result.version } : prior)
    }
    remember(undoStack, prior)
    redoStack.length = 0
    bytes = result.bytes.slice()
    session = nextSession
    version = result.version
    dirty = true
    recalculation = result.recalculation
    onChange(session, dirty, recalculation)
    return {
      ok: true,
      changed: true,
      version,
      summary:
        result.changedCells.length > 0
          ? `已修改 ${result.changedCells.length} 个格子`
          : `已执行 ${input.operations.length} 项工作簿操作`,
      data: {
        changedCells: result.changedCells,
        touchedEntries: result.touchedEntries,
        recalculation: result.recalculation,
      },
    }
  }

  return {
    format: 'xlsx',
    documentId,
    getVersion: () => version,
    getContext: context,
    freezeSelection(roundId) {
      const value = selection()
      if (roundId) frozen.set(roundId, value)
      return context(value)
    },
    execute(tool, args, options) {
      const task = pending.then(async () => {
        onBusyChange?.(true)
        try {
          return await run(tool, args, options)
        } finally {
          onBusyChange?.(false)
        }
      })
      pending = task.catch(() => undefined)
      return task
    },
    history: () => ({ undo: undoStack.length, redo: redoStack.length }),
    undo: () => replay(undoStack, redoStack),
    redo: () => replay(redoStack, undoStack),
    async undoRound(roundId) {
      await pending
      const snapshot = rounds.get(roundId)
      if (!snapshot || disposed || snapshot.lastVersion !== version) return false
      const restored = await openXlsxForEdit(snapshot.bytes)
      if (disposed || snapshot.lastVersion !== version) return false
      bytes = snapshot.bytes
      session = restored
      version += 1
      dirty = snapshot.dirty
      recalculation = snapshot.recalculation
      undoStack.length = 0
      redoStack.length = 0
      rounds.delete(roundId)
      frozen.delete(roundId)
      onChange(session, dirty, recalculation)
      return true
    },
    async exportSheet(format, sheetId) {
      await pending
      if (disposed) throw new Error('XLSX画布已关闭')
      return exportXlsxDisplayedSheet(
        sheetOf(session.view(), sheetId, selection()?.sheet ?? 0),
        format,
      )
    },
    currentBytes: () => bytes.slice(),
    async flush() {
      await pending
      return bytes.slice()
    },
    currentSession: () => session,
    isDirty: () => dirty,
    markSaved: () => {
      dirty = false
      savedBytes = bytes.slice()
      rounds.clear()
    },
    dispose() {
      disposed = true
      undoStack.length = 0
      redoStack.length = 0
      rounds.clear()
      frozen.clear()
    },
  }
}
