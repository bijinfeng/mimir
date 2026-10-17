import { expect, it } from 'vitest'
import {
  formatAddress,
  parseRange,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import { assertRuleMoveFootprint } from '../services/xlsx-rule-footprint.js'
const guard = (
  formula: string,
  source: string,
  sqref = 'J1:K2',
  sheetName = '数据',
  sourceSheetName = '数据',
) =>
  assertRuleMoveFootprint(
    formula,
    sqref.split(' ').map(parseRange),
    { sheetName, sourceSheetName, source: parseRange(source) },
    { remaining: 200_000 },
  )
it.each([
  ['A1', 'B2', 'J1:K2'],
  ['SUM(A1:B2)', 'C3', 'J1:K2'],
  ['$A1', 'A2', 'J1:K2'],
  ['A$1', 'B1', 'J1:K2'],
  ['$A$1', 'A1', 'J1:K2'],
  ['A1', 'E6', 'J1:K2 M5:N6'],
  ["'数据'!A1", 'B2', 'J1:K2'],
  ['IF(A1>0,SUM($C$3:D4),0)', 'E5', 'J1:K2'],
  ['A:A', 'B100', 'J1:K2'],
  ['1:1', 'Z2', 'J1:K2'],
  ['A1', 'A1', 'B2:XFD1048576'],
])('rejects the actual footprint of %s reaching %s over %s', (formula, source, sqref) => {
  expect(() => guard(formula, source, sqref)).toThrow('范围外条件格式或验证公式引用')
})
it.each([
  ['$A1', 'B2', 'J1:K2'],
  ['A$1', 'B2', 'J1:K2'],
  ['$A$1', 'B2', 'J1:K2'],
  ['A1', 'F6', 'J1:K2 M5:N6'],
  ['IF(A1>0,SUM($C$3:D4),0)', 'F6', 'J1:K2'],
  ['LEN("A1")+LOG10(100)', 'A1', 'J1:K2'],
  ['"A1"="A1"', 'A1', 'J1:K2'],
  ['TRUE()', 'A1', 'J1:K2'],
  ['$A$1', 'B1', 'B2:XFD1048576'],
  ['A1', 'XFD1048576', 'B2:XFD1048576'],
])('allows proven disjoint footprint %s from %s over %s', (formula, source, sqref) => {
  expect(() => guard(formula, source, sqref)).not.toThrow()
})
it('qualifies plain refs in the owning sheet, respects sheet case and escaped apostrophes', () => {
  expect(() => guard('A1', 'B2', 'J1:K2', '其他', '数据')).not.toThrow()
  expect(() => guard("'DATA'!A1", 'B2', 'J1:K2', '其他', 'data')).toThrow(
    '范围外条件格式或验证公式引用',
  )
  expect(() => guard("'A''B'!A1", 'B2', 'J1:K2', '其他', "A'B")).toThrow(
    '范围外条件格式或验证公式引用',
  )
})
it.each([
  'INDIRECT("A1")',
  'OFFSET(J1,-9,0)',
  'INDEX(J1:K2,1,1)',
  'SomeName',
  'Table1[Column]',
  '[external.xlsx]数据!A1',
  "'[external.xlsx]数据'!A1",
  "'Bad:Sheet'!A1",
  'Sheet1:Sheet3!A1',
  'A1+',
  'A1 B2',
  'SUM(A1,)',
  '"unfinished',
  'A0',
  'XFE1',
  'A1048577',
  '#REF!',
  'A1:',
  'IF((A1,0)',
  'A1)&B1',
])('rejects unsupported or malformed formula %s before proof', (formula) => {
  expect(() => guard(formula, 'Z1')).toThrow('复杂、动态或无效引用')
})
it('rejects relative coordinates crossing worksheet bounds instead of clamping them', () => {
  expect(() => guard('A1', 'Z1', 'J10:K11 A1:B2')).toThrow('复杂、动态或无效引用')
})
it('accounts bounded rectangle products, without expanding whole-sheet cells', () => {
  const budget = { remaining: 2 }
  expect(() =>
    assertRuleMoveFootprint(
      '$A$1',
      [parseRange('B2:XFD1048576')],
      { sheetName: '数据', sourceSheetName: '数据', source: parseRange('B1') },
      budget,
    ),
  ).not.toThrow()
  expect(budget.remaining).toBe(1)
  expect(() =>
    assertRuleMoveFootprint(
      'SUM($A$1,$C$1)',
      [parseRange('J1'), parseRange('M1')],
      { sheetName: '数据', sourceSheetName: '数据', source: parseRange('B1') },
      budget,
    ),
  ).toThrow('复杂、动态或无效引用')
})

it('matches explicit per-cell dependency unions for every mixed-axis endpoint combination', () => {
  const ranges = [parseRange('J10:K12'), parseRange('M14:N15')]
  for (let mask = 0; mask < 16; mask++) {
    const colA = !!(mask & 1),
      rowA = !!(mask & 2),
      colB = !!(mask & 4),
      rowB = !!(mask & 8)
    const formula = `${colA ? '$' : ''}C${rowA ? '$' : ''}4:${colB ? '$' : ''}F${rowB ? '$' : ''}7`
    const dependencies = new Set<string>()
    for (const range of ranges)
      for (let r = range.startRow; r <= range.endRow; r++)
        for (let c = range.startColumn; c <= range.endColumn; c++) {
          const dr = r - 9,
            dc = c - 9
          const rows = [3 + (rowA ? 0 : dr), 6 + (rowB ? 0 : dr)]
          const columns = [2 + (colA ? 0 : dc), 5 + (colB ? 0 : dc)]
          for (let row = Math.min(...rows); row <= Math.max(...rows); row++)
            for (let column = Math.min(...columns); column <= Math.max(...columns); column++)
              dependencies.add(formatAddress(row, column))
        }
    for (let row = 0; row < 14; row++)
      for (let column = 0; column < 12; column++) {
        const address = formatAddress(row, column)
        const outcome = (() => {
          try {
            guard(formula, address, 'J10:K12 M14:N15')
            return null
          } catch (error) {
            return error instanceof Error ? error.message : String(error)
          }
        })()
        expect(outcome, `${formula} -> ${address}`).toBe(
          dependencies.has(address)
            ? '范围关联结构无法安全保留：剪切会改变范围外条件格式或验证公式引用，尚不支持关联迁移'
            : null,
        )
      }
  }
})

it.each([
  '('.repeat(34) + 'A1' + ')'.repeat(34),
  'SUM(' + Array.from({ length: 257 }, () => 'A1').join(',') + ')',
  '1+'.repeat(513) + '1',
  '"' + 'a'.repeat(32_768) + '"',
])('bounds formula analysis before dependency proof', (formula) => {
  expect(() => guard(formula, 'Z1')).toThrow('复杂、动态或无效引用')
})
