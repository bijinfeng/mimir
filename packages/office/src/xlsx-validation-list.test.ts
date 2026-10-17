import { describe, expect, it } from 'vitest'
import { xlsxValidationFixture } from './editors/xlsx-validation-test-fixture.js'
import { resolveXlsxValidationList } from './xlsx-validation-list.js'
import { evaluateXlsxCellInput } from './xlsx-cell-effects.js'
import JSZip from 'jszip'
import { readXlsx } from './xlsx.js'

describe('native validation flags, lists and behavior', () => {
  it('accepts eight name indirections and rejects a ninth', async () => {
    const { sheet, workbook } = await xlsxValidationFixture()
    workbook.definedNames = Array.from({ length: 8 }, (_, index) => ({
      name: `Level${index + 1}`,
      ref: index === 7 ? 'A1' : `Level${index + 2}`,
    }))
    expect(resolveXlsxValidationList('Level1', sheet, workbook)).toEqual(
      resolveXlsxValidationList('A1', sheet, workbook),
    )
    workbook.definedNames.push({ name: 'Level0', ref: 'Level1' })
    expect(() => resolveXlsxValidationList('Level0', sheet, workbook)).toThrow('过深')
  })
  it('validates hidden source values, formulas, merged anchors and bounded text', async () => {
    const { sheet, workbook } = await xlsxValidationFixture()
    expect(resolveXlsxValidationList("'隐藏来源'!F2:F3", sheet, workbook)).toEqual(['线上', '线下'])
    const source = workbook.sheets[0]!,
      cell = source.rows[1]!.cells[3]!
    const ref = `'${source.name.replaceAll("'", "''")}'!D2`
    expect(resolveXlsxValidationList(ref, sheet, workbook)).toEqual([10])
    cell.formulaCache = 'missing'
    expect(() => resolveXlsxValidationList(ref, sheet, workbook)).toThrow('未缓存')
    const target = sheet.rows[0]!.cells[0]!
    target.mergeRef = 'A1:A2'
    expect(() => resolveXlsxValidationList('A1', sheet, workbook)).toThrow('合并格')
    target.mergeRef = undefined
    target.text = 'x'.repeat(32769)
    expect(() => resolveXlsxValidationList('A1', sheet, workbook)).toThrow('32K')
  })
  it('reads legal whitespace and quoted greater-than attributes without mistaking nested text for flags', async () => {
    const f = await xlsxValidationFixture(),
      zip = await JSZip.loadAsync(f.bytes)
    zip.file(
      f.sheet.entry,
      (await zip.file(f.sheet.entry)!.async('string')).replace(
        f.rules[0]!,
        '<dataValidation type="list" sqref="A1" allowBlank="1" custom="x showErrorMessage=\'1\' > keep" showErrorMessage = "false" errorTitle="A > B"><formula1>&quot;yes,no&quot;</formula1></dataValidation>',
      ),
    )
    const rule = (await readXlsx(await zip.generateAsync({ type: 'uint8array' }))).sheets[1]!
      .extras!.validations![0]!
    expect(rule).toMatchObject({
      showErrorMessage: false,
      errorTitle: 'A > B',
      formula1: '"yes,no"',
    })
    zip.file(
      f.sheet.entry,
      (await zip.file(f.sheet.entry)!.async('string')).replace(
        'showErrorMessage = "false"',
        'showErrorMessage = "maybe"',
      ),
    )
    const unknown = (await readXlsx(await zip.generateAsync({ type: 'uint8array' }))).sheets[1]!
    expect(evaluateXlsxCellInput(unknown, f.workbook, 'A1', 'invalid').issues[0]!.kind).toBe(
      'unsupported',
    )
  })
  it('reads native defaults and inversion without changing bytes', async () => {
    const f = await xlsxValidationFixture()
    expect(f.sheet.extras!.validations![0]).toMatchObject({
      showInputMessage: true,
      promptTitle: '填写提示',
      errorTitle: '输入检查',
      showErrorMessage: true,
      errorStyle: 'stop',
      showDropDown: false,
      xml: f.rules[0],
    })
    expect(f.sheet.extras!.validations!.at(-1)).toMatchObject({
      showInputMessage: false,
      showErrorMessage: false,
      showDropDown: false,
    })
    expect(f.sheet.extras!.validations![4]!.showDropDown).toBe(true)
  })
  it('resolves literal strings, quoted sheets and scoped names in order', async () => {
    const { sheet, workbook } = await xlsxValidationFixture()
    const resolve = (formula: string) => resolveXlsxValidationList(formula, sheet, workbook)
    expect(resolve('"001,=A1,中文,含""引号"""')).toEqual(['001', '=A1', '中文', '含"引号"'])
    expect(resolve(sheet.extras!.validations![1]!.formula1)).toEqual(['线上', '线下'])
    expect(resolve('globallist')).toEqual(['线上', '线下'])
    expect(resolve('ScopedList')).toEqual(['线下', '线上'])
    expect(resolve('"a,,b"')).toEqual(['a', '', 'b'])
    expect(() => resolve('A1:B3')).toThrow('单行或单列')
    expect(() => resolve('A1:A2001')).toThrow('2000')
    expect(() => resolve('XFE1')).toThrow('边界')
    expect(() => resolve('[external.xlsx]Sheet1!A1')).toThrow('列表暂仅支持')
    workbook.definedNames!.push({ name: 'Cycle', ref: 'Cycle' })
    expect(() => resolve('Cycle')).toThrow('循环')
    workbook.definedNames!.push({ name: 'Secret', ref: 'A1', hidden: true })
    expect(() => resolve('Secret')).toThrow('不可见')
    expect(() => resolve('UNSUPPORTED(A1)')).toThrow('列表暂仅支持')
  })
  it('separates stop, explicit confirmation, disabled error and unsupported computation', async () => {
    const { sheet, workbook } = await xlsxValidationFixture()
    expect(evaluateXlsxCellInput(sheet, workbook, 'B1', 9).issues[0]!.kind).toBe('stop')
    expect(evaluateXlsxCellInput(sheet, workbook, 'B2', 9).issues[0]).toMatchObject({
      kind: 'confirmation',
      style: 'warning',
    })
    expect(evaluateXlsxCellInput(sheet, workbook, 'B3', 9).issues[0]).toMatchObject({
      kind: 'confirmation',
      style: 'information',
    })
    expect(evaluateXlsxCellInput(sheet, workbook, 'B4', 9).valid).toBe(true)
    expect(evaluateXlsxCellInput(sheet, workbook, 'B5', 9).issues[0]!.kind).toBe('unsupported')
    expect(evaluateXlsxCellInput(sheet, workbook, 'B1', 3).valid).toBe(true)
    sheet.extras!.validations!.push({ ...sheet.extras!.validations![5]!, range: 'B2' })
    expect(
      evaluateXlsxCellInput(sheet, workbook, 'B2', 9).issues.map((issue) => issue.kind),
    ).toEqual(['confirmation', 'stop'])
  })
})
