import JSZip from 'jszip'
import { xlsxCrossSheetPivotFixture, XLSX_PIVOT_SOURCE_NAME } from './xlsx-pivot-test-fixture.js'
import { readXlsx } from '../xlsx.js'
const escape = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
export async function xlsxValidationFixture() {
  const base = await xlsxCrossSheetPivotFixture(),
    zip = await JSZip.loadAsync(base.bytes)
  const quoted = `'${XLSX_PIVOT_SOURCE_NAME.replaceAll("'", "''")}'`
  const nativeRule = (range: string, type: string, formula: string, flags = '') =>
    `<dataValidation type="${type}" sqref="${range}" allowBlank="1" showErrorMessage="1" showInputMessage="1" promptTitle="填写提示" prompt="请选择或填写当前格。Enter应用，Escape取消。" errorTitle="输入检查" error="请输入符合规则的值" ${flags}><formula1>${escape(formula)}</formula1>${type === 'whole' ? '<formula2>5</formula2>' : ''}</dataValidation>`
  const rules = [
    nativeRule('A1', 'list', '"001,=A1,中文,含""引号"""'),
    nativeRule('A2', 'list', `${quoted}!$F$2:$F$3`),
    nativeRule('A3', 'list', 'GlobalList'),
    nativeRule('A4', 'list', 'ScopedList'),
    nativeRule('A5', 'list', '"不显示,保留"', 'showDropDown="1"'),
    nativeRule('B1', 'whole', '1', 'operator="between" errorStyle="stop"'),
    nativeRule('B2', 'whole', '1', 'operator="between" errorStyle="warning"'),
    nativeRule('B3', 'whole', '1', 'operator="between" errorStyle="information"'),
    nativeRule('B4', 'whole', '1', 'operator="between" errorStyle="warning"').replace(
      'showErrorMessage="1"',
      'showErrorMessage="0"',
    ),
    nativeRule('B5', 'custom', 'UNSUPPORTED(A1)'),
    '<dataValidation type="list" sqref="A6"><formula1>&quot;默认,不开错误&quot;</formula1></dataValidation>',
  ]
  const rows = Array.from(
    { length: 8 },
    (_, row) =>
      `<row r="${row + 1}">${['A', 'B', 'C'].map((col) => `<c r="${col}${row + 1}" t="inlineStr"><is><t>原值</t></is></c>`).join('')}</row>`,
  ).join('')
  zip.file(
    base.sheet.entry,
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:C8"/><sheetData>${rows}</sheetData><dataValidations count="${rules.length}">${rules.join('')}</dataValidations></worksheet>`,
  )
  zip.file(
    'xl/workbook.xml',
    (await zip.file('xl/workbook.xml')!.async('string')).replace(
      '</workbook>',
      `<definedNames><definedName name="GlobalList">${escape(quoted)}!$F$2:$F$3</definedName><definedName name="ScopedList">${escape(quoted)}!$A$2:$A$3</definedName><definedName name="ScopedList" localSheetId="1">${escape(quoted)}!$F$3:$F$4</definedName></definedNames></workbook>`,
    ),
  )
  const bytes = await zip.generateAsync({ type: 'uint8array' }),
    workbook = await readXlsx(bytes)
  return { bytes, workbook, sheet: workbook.sheets[1]!, rules }
}
