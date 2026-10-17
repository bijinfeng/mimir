import JSZip from 'jszip'
import { xlsxPivotFixture } from './xlsx-pivot-test-fixture.js'
import { readXlsx } from '../xlsx.js'
export const FILL_BASE_XF =
  '<xf numFmtId="4" fontId="1" fillId="0" borderId="1" xfId="0" applyFill="0" applyFont="0" applyNumberFormat="1" applyBorder="0" applyAlignment="0" applyProtection="1" quotePrefix="1" pivotButton="1" xmlns:m="urn:mimir" m:keep="yes"><alignment horizontal="right" vertical="top" wrapText="1" shrinkToFit="1" readingOrder="2"/><protection locked="0" hidden="1"/><extLst><ext uri="mimir"><m:keep value="untouched"/></ext></extLst></xf>'
export async function xlsxFillFixture() {
  const base = await xlsxPivotFixture(),
    zip = await JSZip.loadAsync(base.bytes)
  zip.file(
    'xl/styles.xml',
    `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font/><font><name val="Calibri"/><sz val="12"/><b/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor theme="4" tint="0.4"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FF123456"/></left></border></borders><cellStyleXfs count="1"><xf fontId="0" fillId="2" borderId="0" numFmtId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFill="1"/>${FILL_BASE_XF}</cellXfs><dxfs count="1"><dxf><fill><patternFill patternType="solid"><fgColor rgb="FF00FF00"/></patternFill></fill></dxf></dxfs><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`,
  )
  const xml = await zip.file(base.sheet.entry)!.async('string')
  zip.file(
    base.sheet.entry,
    xml
      .replace('<c r="A1"', '<c r="A1" s="1"')
      .replace('<c r="B1"', '<c r="B1" s="1"')
      .replace(
        '</worksheet>',
        '<conditionalFormatting sqref="A2:A3"><cfRule type="cellIs" dxfId="0" priority="1" operator="greaterThan"><formula>0</formula></cfRule></conditionalFormatting></worksheet>',
      ),
  )
  const bytes = await zip.generateAsync({ type: 'uint8array' }),
    workbook = await readXlsx(bytes)
  return { bytes, workbook, sheet: workbook.sheets[0]! }
}
