import { expect, it } from 'vitest'
import { readXlsxRangeXmlTree, readXlsxFormulaCharacterData } from './xlsx-native-xml.js'
import { readXlsxNativeValidations } from './xlsx-sheet-features.js'
import { readXlsxCfRules, evaluateXlsxCellInput, xlsxCellEffects } from './xlsx-cell-effects.js'
import { evaluateXlsxPredicate } from './xlsx-formula-predicate.js'
import { resolveXlsxValidationList } from './xlsx-validation-list.js'
import { xlsxValidationFixture } from './editors/xlsx-validation-test-fixture.js'
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

it('uses one QName-aware character-data reader for prefixed DV and CF', () => {
  const xml = `<worksheet xmlns="${MAIN}" xmlns:s="${MAIN}"><sheetData/><s:conditionalFormatting sqref="A1"><s:cfRule type="expression" priority="1"><s:formula><![CDATA[A1>0&"&amp;#49;"]]><!--keep--></s:formula></s:cfRule></s:conditionalFormatting><s:dataValidations count="1"><s:dataValidation type="list" sqref="A1" prompt="&amp;#49;" showErrorMessage="1"><s:formula1><![CDATA["&amp;#49;,x"]]><!--keep--></s:formula1></s:dataValidation></s:dataValidations></worksheet>`
  expect(readXlsxNativeValidations(xml)[0]).toMatchObject({
    formula1: '"&amp;#49;,x"',
    prompt: '&#49;',
    showErrorMessage: true,
  })
  expect(readXlsxCfRules(xml, '')[0]!.formula).toEqual(['A1>0&"&amp;#49;"'])
  expect(readXlsxRangeXmlTree(xml).children[1]!.local).toBe('conditionalFormatting')
})
it('decodes ordinary entities once and never decodes CDATA as entities', () => {
  expect(readXlsxFormulaCharacterData('A1&amp;"&amp;#49;"<![CDATA[&"&amp;#50;"]]>')).toBe(
    'A1&"&#49;"&"&amp;#50;"',
  )
  expect(() => readXlsxFormulaCharacterData('<unknown/>')).toThrow(/未知|XML/)
  expect(() => readXlsxFormulaCharacterData('<!--bad--->')).toThrow(/注释/)
})
it('resolves mixed and absolute relative-list anchors on hidden source sheets', async () => {
  const { sheet, workbook } = await xlsxValidationFixture()
  const context = { address: 'A2', range: 'A1:A2' }
  expect(resolveXlsxValidationList("'隐藏来源'!$F2:$F3", sheet, workbook, context)).toEqual([
    '线下',
    '线上',
  ])
  expect(resolveXlsxValidationList("'隐藏来源'!$F$2:$F$3", sheet, workbook, context)).toEqual([
    '线上',
    '线下',
  ])
  expect(() =>
    resolveXlsxValidationList('A1:A2', sheet, workbook, { address: 'A1', range: 'B2' }),
  ).toThrow(/边界/)
})
it('reads simple sheet-qualified formulas with original casing and escaped sheet names', () => {
  const reads: unknown[] = []
  const result = evaluateXlsxPredicate(
    "'数''据'!$A1+'目标'!B$2",
    () => 0,
    2,
    3,
    (sheet, row, column) => {
      reads.push([sheet, row, column])
      return 4
    },
  )
  expect(result).toBe(8)
  expect(reads).toEqual([
    ["数'据", 2, 0],
    ['目标', 1, 4],
  ])
  expect(() => evaluateXlsxPredicate("'目标'!A1", () => 0)).toThrow(/工作表/)
})
it('validates qualified candidate values and rejects missing caches on dependency sheets', async () => {
  const { sheet, workbook } = await xlsxValidationFixture()
  sheet.extras!.validations = [
    {
      range: 'A1',
      type: 'whole',
      operator: 'greaterThan',
      formula1: "'隐藏来源'!$D$2",
      formula2: '',
      allowBlank: false,
      error: '',
      showErrorMessage: true,
    },
  ]
  expect(evaluateXlsxCellInput(sheet, workbook, 'A1', 11).valid).toBe(true)
  expect(evaluateXlsxCellInput(sheet, workbook, 'A1', 5).valid).toBe(false)
  workbook.sheets.find((item) => item.name === '隐藏来源')!.rows[1]!.cells[3]!.formulaCache =
    'missing'
  expect(evaluateXlsxCellInput(sheet, workbook, 'A1', 11).issues[0]!.message).toContain('未缓存')
})
it('renders relocated prefixed expression rules through the same qualified predicate', async () => {
  const { sheet, workbook } = await xlsxValidationFixture()
  const xml = `<worksheet xmlns="${MAIN}" xmlns:q="${MAIN}"><sheetData/><q:conditionalFormatting sqref="A1"><q:cfRule type="expression" priority="1" dxfId="0"><q:formula>'隐藏来源'!$D$2&gt;5</q:formula></q:cfRule></q:conditionalFormatting></worksheet>`
  sheet.extras!.cfRules = readXlsxCfRules(
    xml,
    `<s:styleSheet xmlns:s="${MAIN}"><s:dxfs><s:dxf><s:font><s:b/></s:font></s:dxf></s:dxfs></s:styleSheet>`,
  )
  expect(xlsxCellEffects(sheet, workbook).get('1:0')!.format!.bold).toBe(true)
})
