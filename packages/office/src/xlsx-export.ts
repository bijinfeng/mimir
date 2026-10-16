import JSZip from 'jszip'
import type { XlsxSheet } from './xlsx.js'
import { formatAddress } from '../vendor/packages/xlsx-gateway/src/domain/cell-address.js'
const escape = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
/** GenOffice create_document exports current displayed values, without formulas or formatting. */
export async function exportXlsxDisplayedSheet(
  sheet: XlsxSheet,
  format: 'xlsx' | 'csv',
): Promise<{ bytes: Uint8Array; mimeType: string; fileName: string }> {
  const rows = sheet.rows.reduce((max, r) => Math.max(max, r.number), 1),
    columns = sheet.columns.length
  if (rows * columns > 20000) throw new Error('导出显示值最多20000格，请选择较小的工作表')
  const matrix = Array.from({ length: rows }, (_row, r) =>
    Array.from(
      { length: columns },
      (_, c) => sheet.rows.find((row) => row.number === r + 1)?.cells[c]?.text ?? '',
    ),
  )
  const name = sheet.name.replace(/[\\/:*?"<>|]/g, '_') || '工作表'
  if (format === 'csv') {
    const csv = matrix
      .map((row) =>
        row.map((s) => (/[",\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s)).join(','),
      )
      .join('\r\n')
    return {
      bytes: new TextEncoder().encode('\uFEFF' + csv),
      mimeType: 'text/csv',
      fileName: `${name}.csv`,
    }
  }
  const zip = new JSZip(),
    ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  )
  zip.file(
    '_rels/.rels',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  )
  zip.file(
    'xl/workbook.xml',
    `<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="${escape(sheet.name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  )
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<worksheet xmlns="${ns}"><sheetData>${matrix.map((row, r) => `<row r="${r + 1}">${row.map((s, c) => `<c r="${formatAddress(r, c)}" t="inlineStr"><is><t xml:space="preserve">${escape(s)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`,
  )
  return {
    bytes: await zip.generateAsync({ type: 'uint8array' }),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileName: `${name}.xlsx`,
  }
}
