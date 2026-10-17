import {
  columnIndex,
  type RangeBounds,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'

export interface RuleMoveContext {
  sheetName: string
  sourceSheetName: string
  source: RangeBounds
}
interface Endpoint {
  row: number
  column: number
  rowAbsolute: boolean
  columnAbsolute: boolean
}
export interface XlsxRuleStaticReference {
  sheet?: string
  start: Endpoint
  end: Endpoint
}
type Reference = XlsxRuleStaticReference
interface Token {
  kind: 'value' | 'reference' | 'function' | 'operator'
  value: string
}
const unsupported = (): never => {
  throw new Error(
    '范围关联结构无法安全保留：条件格式或验证公式含复杂、动态或无效引用，尚不能证明范围外依赖安全',
  )
}
const STATIC_FUNCTIONS = new Set(
  'ABS ACOS ACOSH AND ASIN ASINH ATAN ATAN2 ATANH AVERAGE AVERAGEA AVERAGEIF AVERAGEIFS CEILING CHAR CHOOSE CLEAN CODE COLUMN COLUMNS CONCAT CONCATENATE COS COSH COUNT COUNTA COUNTBLANK COUNTIF COUNTIFS DATE DATEDIF DATEVALUE DAY DAYS EDATE EOMONTH ERROR.TYPE EVEN EXACT EXP FALSE FIND FIXED FLOOR HOUR IF IFERROR IFNA IFS INT ISBLANK ISERR ISERROR ISEVEN ISLOGICAL ISNA ISNONTEXT ISNUMBER ISODD ISREF ISTEXT LARGE LEFT LEN LN LOG LOG10 LOWER MATCH MAX MAXA MEDIAN MID MIN MINA MINUTE MOD MONTH MROUND N NA NOT NOW ODD OR PI POWER PRODUCT PROPER RANK REPLACE REPT RIGHT ROUND ROUNDDOWN ROUNDUP ROW ROWS SEARCH SECOND SIGN SIN SINH SMALL SQRT STDEV STDEVP SUBSTITUTE SUBTOTAL SUM SUMIF SUMIFS SUMPRODUCT SUMSQ TAN TANH TEXT TIME TIMEVALUE TODAY TRIM TRUE TRUNC TYPE UPPER VALUE WEEKDAY WEEKNUM YEAR'.split(
    ' ',
  ),
)
const ADDRESS = String.raw`\$?[A-Z]{1,3}\$?[1-9][0-9]*`
const REF = new RegExp(
  String.raw`^(?:('(?:[^']|'')+'|[\p{L}_\\][\p{L}\p{N}_.\\]*)!)?(${ADDRESS}(?::${ADDRESS})?|\$?[A-Z]{1,3}:\$?[A-Z]{1,3}|\$?[1-9][0-9]*:\$?[1-9][0-9]*)(?![\p{L}\p{N}_.!])`,
  'iu',
)
function endpoint(value: string): Endpoint {
  const cell = /^(\$?)([A-Z]{1,3})(\$?)([1-9][0-9]*)$/i.exec(value)
  if (!cell) return unsupported()
  const row = Number(cell[4]) - 1,
    column = columnIndex(cell[2]!)
  if (!Number.isSafeInteger(row) || row >= 1_048_576 || column >= 16_384) return unsupported()
  return { row, column, rowAbsolute: !!cell[3], columnAbsolute: !!cell[1] }
}
function reference(token: string): Reference {
  const match = REF.exec(token)
  if (!match || match[0].length !== token.length) return unsupported()
  const qualifier = match[1],
    raw = match[2]!,
    parts = raw.split(':')
  const sheet = qualifier?.startsWith("'")
    ? qualifier.slice(1, -1).replaceAll("''", "'")
    : qualifier
  if (sheet && (/[\\/?*:]/.test(sheet) || sheet.includes('[') || sheet.includes(']')))
    return unsupported()
  let start: Endpoint, end: Endpoint
  if (/^\$?[A-Z]{1,3}:\$?[A-Z]{1,3}$/i.test(raw)) {
    start = {
      row: 0,
      column: columnIndex(parts[0]!.replace('$', '')),
      rowAbsolute: true,
      columnAbsolute: parts[0]!.startsWith('$'),
    }
    end = {
      row: 1_048_575,
      column: columnIndex(parts[1]!.replace('$', '')),
      rowAbsolute: true,
      columnAbsolute: parts[1]!.startsWith('$'),
    }
  } else if (/^\$?[1-9][0-9]*:\$?[1-9][0-9]*$/.test(raw)) {
    start = {
      row: Number(parts[0]!.replace('$', '')) - 1,
      column: 0,
      rowAbsolute: parts[0]!.startsWith('$'),
      columnAbsolute: true,
    }
    end = {
      row: Number(parts[1]!.replace('$', '')) - 1,
      column: 16_383,
      rowAbsolute: parts[1]!.startsWith('$'),
      columnAbsolute: true,
    }
  } else {
    start = endpoint(parts[0]!)
    end = endpoint(parts[1] ?? parts[0]!)
  }
  if (
    [start, end].some(
      (point) =>
        point.row >= 1_048_576 || point.column >= 16_384 || !Number.isSafeInteger(point.row),
    )
  )
    return unsupported()
  return { sheet, start, end }
}
/** Small expression grammar: recognizes static references, never evaluates a formula. */
export function xlsxRuleStaticReferences(formula: string): Reference[] {
  if (formula.length > 32_768) return unsupported()
  const tokens: Token[] = [],
    refs: Reference[] = []
  let text = formula.trim().replace(/^=/, '')
  while (text) {
    const space = /^\s+/.exec(text)
    if (space) {
      text = text.slice(space[0].length)
      continue
    }
    const string = /^"(?:[^"]|"")*"/.exec(text)
    const fn = /^([\p{L}_][\p{L}\p{N}_.]*)\s*(?=\()/u.exec(text)
    const ref = REF.exec(text)
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?/.exec(text)
    const bool = /^(?:TRUE|FALSE)\b/i.exec(text)
    const error = /^#(?:N\/A|VALUE!|DIV\/0!|NUM!|NAME\?|NULL!)/i.exec(text)
    let token: Token
    if (string) token = { kind: 'value', value: string[0] }
    else if (fn) {
      if (!STATIC_FUNCTIONS.has(fn[1]!.toUpperCase())) return unsupported()
      token = { kind: 'function', value: fn[0] }
    } else if (ref) {
      refs.push(reference(ref[0]))
      token = { kind: 'reference', value: ref[0] }
    } else if (number || bool || error)
      token = { kind: 'value', value: (number ?? bool ?? error)![0] }
    else {
      const op = /^(?:<>|<=|>=|[+\-*/^&=<>%(),])/.exec(text)
      if (!op) return unsupported()
      token = { kind: 'operator', value: op[0] }
    }
    tokens.push(token)
    if (tokens.length > 1024 || refs.length > 256) return unsupported()
    text = text.slice(token.value.length)
  }
  let index = 0
  const precedence: Record<string, number> = {
    '=': 1,
    '<>': 1,
    '<': 1,
    '>': 1,
    '<=': 1,
    '>=': 1,
    '&': 2,
    '+': 3,
    '-': 3,
    '*': 4,
    '/': 4,
    '^': 5,
  }
  const expression = (minimum = 0, depth = 0): void => {
    if (depth > 32) return unsupported()
    const token = tokens[index++]
    if (!token) return unsupported()
    if (token.value === '+' || token.value === '-') expression(6, depth + 1)
    else if (token.value === '(') {
      expression(0, depth + 1)
      if (tokens[index++]?.value !== ')') return unsupported()
    } else if (token.kind === 'function') {
      if (tokens[index++]?.value !== '(') return unsupported()
      if (tokens[index]?.value !== ')') {
        expression(0, depth + 1)
        while (tokens[index]?.value === ',') {
          index++
          expression(0, depth + 1)
        }
      }
      if (tokens[index++]?.value !== ')') return unsupported()
    } else if (token.kind !== 'value' && token.kind !== 'reference') return unsupported()
    while (tokens[index]?.value === '%') index++
    while (index < tokens.length) {
      const rank = precedence[tokens[index]!.value]
      if (rank === undefined || rank < minimum) break
      index++
      expression(rank + 1, depth + 1)
    }
  }
  expression()
  if (index !== tokens.length) return unsupported()
  return refs
}
const intersects = (a: RangeBounds, b: RangeBounds) =>
  a.startRow <= b.endRow &&
  b.startRow <= a.endRow &&
  a.startColumn <= b.endColumn &&
  b.startColumn <= a.endColumn
/** Rectangular envelopes over affine endpoint offsets; never enumerate the rule's cells. */
export function assertRuleMoveFootprint(
  formula: string,
  ranges: RangeBounds[],
  context: RuleMoveContext,
  budget: { remaining: number },
): void {
  const refs = xlsxRuleStaticReferences(formula),
    anchor = ranges[0]
  if (!anchor) return unsupported()
  if ((budget.remaining -= Math.max(1, refs.length) * ranges.length) < 0) return unsupported()
  for (const ref of refs) {
    if (
      (ref.sheet ?? context.sheetName).toLocaleLowerCase() !==
      context.sourceSheetName.toLocaleLowerCase()
    )
      continue
    for (const range of ranges) {
      const extent = (axis: 'row' | 'column') => {
        const lower =
          axis === 'row' ? range.startRow - anchor.startRow : range.startColumn - anchor.startColumn
        const upper =
          axis === 'row' ? range.endRow - anchor.startRow : range.endColumn - anchor.startColumn
        const absolute = axis === 'row' ? 'rowAbsolute' : 'columnAbsolute'
        return {
          min: Math.min(
            ...[ref.start, ref.end].map((point) => point[axis] + (point[absolute] ? 0 : lower)),
          ),
          max: Math.max(
            ...[ref.start, ref.end].map((point) => point[axis] + (point[absolute] ? 0 : upper)),
          ),
        }
      }
      const rows = extent('row'),
        columns = extent('column')
      if (rows.min < 0 || rows.max >= 1_048_576 || columns.min < 0 || columns.max >= 16_384)
        return unsupported()
      if (
        intersects(
          {
            startRow: rows.min,
            endRow: rows.max,
            startColumn: columns.min,
            endColumn: columns.max,
          },
          context.source,
        )
      )
        throw new Error(
          '范围关联结构无法安全保留：剪切会改变范围外条件格式或验证公式引用，尚不支持关联迁移',
        )
    }
  }
}
