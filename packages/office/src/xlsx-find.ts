import type { XlsxWorkbook } from './xlsx.js'

export interface XlsxFindOptions {
  query: string
  regex?: boolean
  lookIn?: 'values' | 'formulas' | 'both'
  errorsOnly?: boolean
  sheetId?: string
  maxResults?: number
}

export interface XlsxFindMatch {
  sheetId: string
  sheetName: string
  address: string
  /** Displayed cached value; formula results are not recalculated here. */
  text: string
  formula?: string
}

const FORMULA_ERRORS = new Set(['#REF!', '#DIV/0!', '#VALUE!', '#NAME?', '#N/A', '#NUM!', '#NULL!'])

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

/** Manual Find and Agent search read the same current grid projection. */
export function findXlsxCells(
  workbook: XlsxWorkbook,
  options: XlsxFindOptions,
): { matches: XlsxFindMatch[]; truncated: boolean } {
  const { query, regex = false, lookIn = 'values', errorsOnly = false, sheetId } = options
  if (!errorsOnly && query === '') throw new Error('query 必须是非空字符串')
  const maxResults = options.maxResults ?? Number.POSITIVE_INFINITY
  const expression = regex ? new RegExp(query, 'i') : null
  const needle = query.toLowerCase()
  const sheets = sheetId ? workbook.sheets.filter((sheet) => sheet.id === sheetId) : workbook.sheets
  if (sheetId && sheets.length === 0) throw new Error('工作表 ID 已失效，请重新读取工作簿')
  const matches: XlsxFindMatch[] = []
  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      for (const cell of row.cells) {
        if (cell.covered === true) continue
        const formula = cell.formulaText
        const error = cell.formula === true && FORMULA_ERRORS.has(cell.text.toUpperCase())
        if (errorsOnly && !error) continue
        const contents =
          lookIn === 'values'
            ? [cell.text]
            : lookIn === 'formulas'
              ? [formula]
              : [cell.text, formula]
        if (
          !errorsOnly &&
          !contents.some(
            (text) =>
              text !== undefined &&
              (expression ? expression.test(text) : text.toLowerCase().includes(needle)),
          )
        )
          continue
        matches.push({
          sheetId: sheet.id,
          sheetName: sheet.name,
          address: `${columnLetters(cell.col)}${row.number}`,
          text: cell.text,
          ...(formula === undefined ? {} : { formula }),
        })
        if (matches.length > maxResults)
          return { matches: matches.slice(0, maxResults), truncated: true }
      }
    }
  }
  return { matches, truncated: false }
}
