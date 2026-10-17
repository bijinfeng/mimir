import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { readXlsx } from '../xlsx.js'
export async function xlsxPivotFixture() {
  const zip = await JSZip.loadAsync(
    readFileSync(
      join(import.meta.dirname, '../../vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx'),
    ),
  )
  const data = [
    ['区域', '部门', '日期', '金额', '成本', '渠道'],
    ['华东', '销售', '2025-01-03', 10, 3, '线上'],
    ['华东', '研发', '2025-04-05', 20, 8, '线下'],
    ['华南', '销售', '2026-01-09', 30, 10, '线上'],
    ['华南', '研发', '2026-05-10', 40, 12, '线下'],
    ['华北', '销售', '2026-09-10', 50, 20, '线上'],
  ]
  const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
  const rows = data
    .map(
      (row, r) =>
        `<row r="${r + 1}">${row.map((value, c) => `<c r="${String.fromCharCode(65 + c)}${r + 1}"${typeof value === 'number' ? '' : ' t="inlineStr"'}>${typeof value === 'number' ? `<v>${value}</v>` : `<is><t>${value}</t></is>`}</c>`).join('')}${r === 0 ? '<c r="Z1" s="0" t="inlineStr"><is><t>保留原件属性</t></is></c>' : r === 1 ? '<c r="Z2"><f>1+2</f><v>3</v></c>' : ''}</row>`,
    )
    .join('')
  zip.file(
    'xl/worksheets/sheet1.xml',
    xml
      .replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${rows}</sheetData>`)
      .replace(/<mergeCells\b[\s\S]*?<\/mergeCells>/, '')
      .replace(/<dimension[^>]*\/>/, '<dimension ref="A1:Z6"/>'),
  )
  zip.file('customXml/mimir-pivot-preservation.xml', '<mimir value="keep-untouched"/>')
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  const workbook = await readXlsx(bytes)
  return { bytes, sheet: workbook.sheets[0]!, workbook }
}

export const XLSX_PIVOT_SOURCE_NAME = "源 数据'2026 中文季度销售明细与部门汇总"
export async function xlsxCrossSheetPivotFixture() {
  const original = await xlsxPivotFixture()
  const zip = await JSZip.loadAsync(original.bytes)
  const workbookPath = 'xl/workbook.xml'
  zip.file(
    workbookPath,
    (await zip.file(workbookPath)!.async('string'))
      .replace('<sheets>', '<bookViews><workbookView activeTab="1"/></bookViews><sheets>')
      .replace('name="数据"', `name="${XLSX_PIVOT_SOURCE_NAME.replace(/'/g, '&apos;')}"`)
      .replace(
        '</sheets>',
        '<sheet name="汇总" sheetId="2" r:id="rId3" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><sheet name="保留第三表" sheetId="3" r:id="rId4" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><sheet name="隐藏来源" state="hidden" sheetId="4" r:id="rId5" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><sheet name="受保护来源" sheetId="5" r:id="rId6" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets>',
      ),
  )
  const rels = 'xl/_rels/workbook.xml.rels'
  zip.file(
    rels,
    (await zip.file(rels)!.async('string')).replace(
      '</Relationships>',
      [2, 3, 4, 5]
        .map(
          (id) =>
            `<Relationship Id="rId${id + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${id}.xml"/>`,
        )
        .join('') + '</Relationships>',
    ),
  )
  const types = '[Content_Types].xml'
  zip.file(
    types,
    (await zip.file(types)!.async('string')).replace(
      '</Types>',
      [2, 3, 4, 5]
        .map(
          (id) =>
            `<Override PartName="/xl/worksheets/sheet${id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('') + '</Types>',
    ),
  )
  const shared = await zip.file('xl/sharedStrings.xml')!.async('string')
  const sharedIndex = [...shared.matchAll(/<si(?:\s|>)/g)].length
  zip.file('xl/sharedStrings.xml', shared.replace('</sst>', '<si><t>部门</t></si></sst>'))
  const source = (await zip.file(original.sheet.entry)!.async('string'))
    .replace(
      '<c r="B1" t="inlineStr"><is><t>部门</t></is></c>',
      `<c r="B1" t="s"><v>${sharedIndex}</v></c>`,
    )
    .replace('<c r="D2"><v>10</v></c>', '<c r="D2" s="0"><f>5+5</f><v>10</v></c>')
  zip.file(original.sheet.entry, source)
  zip.file(
    'xl/worksheets/sheet2.xml',
    '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:Z2"/><sheetData><row r="1"><c r="Z1" t="inlineStr"><is><t>汇总说明保留</t></is></c></row></sheetData></worksheet>',
  )
  zip.file('xl/worksheets/sheet3.xml', source.replace('华东', '不应修改'))
  zip.file(
    'xl/worksheets/sheet4.xml',
    source.replaceAll('区域', '隐藏区域').replaceAll('金额', '隐藏金额'),
  )
  zip.file(
    'xl/worksheets/sheet5.xml',
    source.replace('</sheetData>', '</sheetData><sheetProtection sheet="1"/>'),
  )
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  const workbook = await readXlsx(bytes)
  return { bytes, workbook, source: workbook.sheets[0]!, sheet: workbook.sheets[1]! }
}
