import {
  parseAddress,
  parseRange,
} from '../vendor/packages/xlsx-gateway/src/domain/cell-address.js'
export type PredicateScalar = string | number | boolean | null
export type PredicateValue = PredicateScalar | PredicateScalar[]
const scalar = (v: PredicateValue): PredicateScalar => {
  if (Array.isArray(v)) throw new Error('条件公式需要单值')
  return v
}
function shiftedReference(s: string, deltaRow: number, deltaColumn: number) {
  const m = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(s)!
  const p = parseAddress(m[2]! + m[4]!)
  return { row: p.row + (m[3] ? 0 : deltaRow), column: p.column + (m[1] ? 0 : deltaColumn) }
}
/** Bounded Excel predicate interpreter. Never executes workbook text as JavaScript. */
export function evaluateXlsxPredicate(
  formula: string,
  cell: (row: number, column: number) => PredicateScalar,
  deltaRow = 0,
  deltaColumn = 0,
  qualifiedCell?: (sheet: string, row: number, column: number) => PredicateScalar,
): PredicateScalar {
  const source = formula.replace(/^=/, ''),
    tokens: string[] = []
  const lexer =
    /\s*("(?:[^"]|"")*"|(?:(?:'(?:[^']|'')+'|[\p{L}_][\p{L}\p{N}_.]*)!)?\$?[A-Z]{1,3}\$?[1-9]\d{0,6}(?::\$?[A-Z]{1,3}\$?[1-9]\d{0,6})?|(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?|[A-Z_][A-Z0-9_.]*|<>|<=|>=|[+\-*/^&=<>(),;%])/iuy
  let at = 0
  while (at < source.length) {
    lexer.lastIndex = at
    const m = lexer.exec(source)
    if (!m) {
      if (source.slice(at).trim() === '') break
      throw new Error('当前网格暂不支持此条件公式')
    }
    tokens.push(m[1]!)
    at = lexer.lastIndex
    if (tokens.length > 512) throw new Error('条件公式过长')
  }
  let index = 0,
    steps = 0
  const numeric = (v: PredicateValue) => {
    const n = Number(scalar(v) ?? 0)
    if (!Number.isFinite(n)) throw new Error('条件公式不是有效数字')
    return n
  }
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
  const reference = (token: string): PredicateValue => {
    const qualifier = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(token)
    const read = qualifier
      ? (row: number, column: number) => {
          if (!qualifiedCell) throw new Error('条件公式工作表引用无法可靠读取')
          return qualifiedCell(qualifier[1]?.replaceAll("''", "'") ?? qualifier[2]!, row, column)
        }
      : cell
    const [a, b] = (qualifier?.[3] ?? token).toUpperCase().split(':'),
      start = shiftedReference(a!, deltaRow, deltaColumn),
      end = shiftedReference(b ?? a!, deltaRow, deltaColumn)
    if (Math.min(start.row, start.column) < 0 || end.row >= 1048576 || end.column >= 16384)
      throw new Error('条件公式引用越界')
    if (!b) return read(start.row, start.column)
    if ((end.row - start.row + 1) * (end.column - start.column + 1) > 2000)
      throw new Error('条件公式引用超过2000格')
    const values = []
    for (let r = start.row; r <= end.row; r++)
      for (let c = start.column; c <= end.column; c++) values.push(read(r, c))
    return values
  }
  const call = (name: string, args: PredicateValue[]): PredicateScalar => {
    const flat = args.flat(),
      nums = flat.filter((v): v is number => typeof v === 'number')
    if (name === 'AND') return flat.every(Boolean)
    if (name === 'OR') return flat.some(Boolean)
    if (name === 'NOT') return !scalar(args[0] ?? null)
    if (name === 'IF') return scalar(args[scalar(args[0] ?? null) ? 1 : 2] ?? null)
    if (name === 'ISBLANK')
      return scalar(args[0] ?? null) === null || scalar(args[0] ?? null) === ''
    if (name === 'ISNUMBER') return typeof scalar(args[0] ?? null) === 'number'
    if (name === 'ISTEXT') return typeof scalar(args[0] ?? null) === 'string'
    if (name === 'LEN') return String(scalar(args[0] ?? '')).length
    if (name === 'MOD') return numeric(args[0] ?? 0) % numeric(args[1] ?? 1)
    if (name === 'ABS') return Math.abs(numeric(args[0] ?? 0))
    if (name === 'SUM') return nums.reduce((a, b) => a + b, 0)
    if (name === 'MIN') return Math.min(...nums)
    if (name === 'MAX') return Math.max(...nums)
    if (name === 'AVERAGE') return nums.reduce((a, b) => a + b, 0) / nums.length
    if (name === 'COUNT') return nums.length
    if (name === 'COUNTA') return flat.filter((v) => v !== null && v !== '').length
    if (name === 'LOWER') return String(scalar(args[0] ?? '')).toLowerCase()
    if (name === 'UPPER') return String(scalar(args[0] ?? '')).toUpperCase()
    if (name === 'TRIM')
      return String(scalar(args[0] ?? ''))
        .trim()
        .replace(/ +/g, ' ')
    if (name === 'SEARCH' || name === 'FIND') {
      const needle = String(scalar(args[0] ?? '')),
        hay = String(scalar(args[1] ?? ''))
      const pos =
        name === 'SEARCH' ? hay.toLowerCase().indexOf(needle.toLowerCase()) : hay.indexOf(needle)
      if (pos < 0) throw new Error('条件公式未找到文字')
      return pos + 1
    }
    if (name === 'COUNTIF') {
      const criteria = scalar(args[1] ?? null)
      return (Array.isArray(args[0]) ? args[0] : [args[0]]).filter(
        (v) => String(v ?? '').toLowerCase() === String(criteria ?? '').toLowerCase(),
      ).length
    }
    throw new Error(`当前网格暂不支持条件函数 ${name}`)
  }
  const expression = (min = 0): PredicateValue => {
    if (++steps > 1024) throw new Error('条件公式超出计算预算')
    const token = tokens[index++]
    if (!token) throw new Error('条件公式不完整')
    let left: PredicateValue
    if (token === '+' || token === '-') left = numeric(expression(5)) * (token === '-' ? -1 : 1)
    else if (token === '(') {
      left = expression()
      if (tokens[index++] !== ')') throw new Error('条件公式括号不匹配')
    } else if (token.startsWith('"')) left = token.slice(1, -1).replaceAll('""', '"')
    else if (/^\d|^\./.test(token)) left = Number(token)
    else if (/^(?:(?:'(?:[^']|'')+'|[\p{L}_][\p{L}\p{N}_.]*)!)?\$?[A-Z]{1,3}\$?\d/iu.test(token))
      left = reference(token)
    else if (token.toUpperCase() === 'TRUE' || token.toUpperCase() === 'FALSE')
      left = token.toUpperCase() === 'TRUE'
    else {
      if (tokens[index++] !== '(') throw new Error('条件公式名称未解析')
      const args: PredicateValue[] = []
      if (tokens[index] !== ')')
        do {
          args.push(expression())
        } while ([',', ';'].includes(tokens[index] ?? '') && index++)
      if (tokens[index++] !== ')') throw new Error('条件公式函数参数无效')
      left = call(token.toUpperCase(), args)
    }
    if (tokens[index] === '%') {
      index++
      left = numeric(left) / 100
    }
    while (index < tokens.length && (precedence[tokens[index]!] ?? -1) >= min) {
      const op = tokens[index++]!,
        right = expression(precedence[op]! + (op === '^' ? 0 : 1)),
        a = scalar(left),
        b = scalar(right)
      if (op === '&') left = String(a ?? '') + String(b ?? '')
      else if (['=', '<>', '<', '>', '<=', '>='].includes(op)) {
        const x = typeof a === 'string' ? a.toLowerCase() : (a ?? 0),
          y = typeof b === 'string' ? b.toLowerCase() : (b ?? 0)
        const comparison =
          typeof x === 'number' && typeof y === 'number'
            ? x - y
            : String(x).localeCompare(String(y))
        left =
          op === '='
            ? comparison === 0
            : op === '<>'
              ? comparison !== 0
              : op === '<'
                ? comparison < 0
                : op === '>'
                  ? comparison > 0
                  : op === '<='
                    ? comparison <= 0
                    : comparison >= 0
      } else {
        const x = numeric(left),
          y = numeric(right)
        left =
          op === '+' ? x + y : op === '-' ? x - y : op === '*' ? x * y : op === '/' ? x / y : x ** y
        if (!Number.isFinite(left)) throw new Error('条件公式计算错误')
      }
    }
    return left
  }
  const result = scalar(expression())
  if (index !== tokens.length) throw new Error('条件公式含未解析内容')
  return result
}
export function xlsxRangeContains(ref: string, row: number, column: number) {
  return ref.split(/\s+/).some((part) => {
    try {
      const b = parseRange(part.replaceAll('$', ''))
      return (
        row >= b.startRow && row <= b.endRow && column >= b.startColumn && column <= b.endColumn
      )
    } catch {
      return false
    }
  })
}
