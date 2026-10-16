import { describe, expect, it } from 'vitest'
import { parseXlsxDelimited } from './xlsx-delimited.js'

describe('spreadsheet clipboard and CSV input', () => {
  it('reads BOM, CRLF, escaped quotes, quoted delimiters and multiline cells without losing a final empty quoted row', () => {
    expect(parseXlsxDelimited('\uFEFF"中文,标题",值\r\n"甲""乙\n第二行",12.5\r\n""', ',')).toEqual([
      ['中文,标题', '值'],
      ['甲"乙\n第二行', 12.5],
      ['', ''],
    ])
  })
  it('preserves typed values, formulas, explicit text, blank fields and ragged rows', () => {
    expect(parseXlsxDelimited("TRUE\tfalse\t'001\t=SUM(A1:B1)\n0\t\t-2\n")).toEqual([
      [true, false, '001', '=SUM(A1:B1)'],
      [0, '', -2, ''],
    ])
  })
  it('rejects malformed quotes and independent byte, row, column and rectangular-cell budgets', () => {
    expect(() => parseXlsxDelimited('"missing')).toThrow('引号没有闭合')
    expect(() => parseXlsxDelimited('"closed"extra')).toThrow('引号结束后')
    expect(() => parseXlsxDelimited('中'.repeat(400000))).toThrow('1MiB')
    expect(() => parseXlsxDelimited(Array.from({ length: 501 }, () => '1').join('\n'))).toThrow(
      '500行',
    )
    expect(() => parseXlsxDelimited(Array.from({ length: 101 }, () => '1').join('\t'))).toThrow(
      '100列',
    )
    expect(() =>
      parseXlsxDelimited(
        Array.from({ length: 21 }, () => Array.from({ length: 100 }, () => '1').join('\t')).join(
          '\n',
        ),
      ),
    ).toThrow('2000格')
  })
})
