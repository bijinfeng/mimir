import JSZip from 'jszip'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
export const SHAPE_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
export const SHAPE_X = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'
export const SHAPE_THEME = `<a:theme xmlns:a="${SHAPE_A}" name="Mimir fixture"><a:themeElements><a:clrScheme name="Fixture"><a:dk1><a:srgbClr val="102030"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:accent1><a:srgbClr val="186A7A"/></a:accent1><a:accent2><a:srgbClr val="E4A24A"/></a:accent2></a:clrScheme><a:fontScheme name="Fixture"><a:majorFont><a:latin typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface="Microsoft YaHei"/></a:minorFont></a:fontScheme><a:fmtScheme name="Fixture"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="28575"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="dashDot"/></a:ln></a:lnStyleLst><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements></a:theme>`
const marker = (name: string, col: number, r: number) =>
  `<xdr:${name}><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:${name}>`
export function shapeAnchor(
  index: number,
  properties: string,
  text = '',
  extras = '',
  kind = 'twoCellAnchor',
) {
  const row = index * 10,
    position =
      kind === 'absoluteAnchor'
        ? `<xdr:pos x="609600" y="${row * 190500}"/>`
        : marker('from', 1, row),
    extent =
      kind === 'twoCellAnchor' ? marker('to', 5, row + 7) : '<xdr:ext cx="2438400" cy="1333500"/>'
  return `<xdr:${kind}>${position}${extent}<xdr:sp><xdr:nvSpPr><xdr:cNvPr id="${index + 1}" name="${['渐变旋转圆角', '原生自定义路径', '透明轮廓', '主题样式', '未知自定义几何', '90度原生框'][index] ?? `形状${index}`}"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr>${properties}</xdr:spPr>${extras}${text ? `<xdr:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/>${text}</xdr:txBody>` : ''}</xdr:sp><xdr:clientData/></xdr:${kind}>`
}
export const SHAPE_XFRM =
  '<a:xfrm rot="2220000" flipH="1"><a:off x="0" y="0"/><a:ext cx="1905000" cy="952500"/></a:xfrm>'
export const SHAPE_CUSTOM =
  '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="100" h="100" stroke="0"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="100" y="0"/></a:lnTo><a:lnTo><a:pt x="50" y="100"/></a:lnTo><a:close/></a:path><a:path w="100" h="100" fill="none"><a:moveTo><a:pt x="0" y="50"/></a:moveTo><a:lnTo><a:pt x="100" y="50"/></a:lnTo></a:path></a:pathLst></a:custGeom>'
const gradient =
  '<a:gradFill><a:gsLst><a:gs pos="0"><a:schemeClr val="accent1"/></a:gs><a:gs pos="100000"><a:schemeClr val="accent2"><a:alpha val="60000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="2700000" scaled="1"/></a:gradFill>'
const line =
  '<a:ln w="28575" cap="rnd"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:prstDash val="dashDot"/><a:round/></a:ln>'
export const SHAPE_DRAWING = `<xdr:wsDr xmlns:xdr="${SHAPE_X}" xmlns:a="${SHAPE_A}">${[
  shapeAnchor(
    0,
    SHAPE_XFRM +
      '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 40000"/></a:avLst></a:prstGeom>' +
      gradient +
      line,
    '<a:p><a:pPr algn="ctr"/><a:r><a:rPr b="1" sz="1800"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>旋转</a:t></a:r><a:r><a:rPr i="1" u="sng" sz="1200"/><a:t>渐变</a:t></a:r></a:p><a:p><a:pPr algn="r"/><a:r><a:rPr sz="1100"/><a:t>第二段</a:t></a:r></a:p>',
  ),
  shapeAnchor(
    1,
    SHAPE_XFRM.replace('rot="2220000" flipH="1"', 'flipV="1"') +
      SHAPE_CUSTOM +
      '<a:solidFill><a:schemeClr val="accent2"/></a:solidFill>' +
      line,
    '',
    '',
    'oneCellAnchor',
  ),
  shapeAnchor(
    2,
    '<a:prstGeom prst="ellipse"/><a:noFill/>' + line,
    '<a:p><a:r><a:t>透明填充</a:t></a:r></a:p>',
    '',
    'absoluteAnchor',
  ),
  shapeAnchor(
    3,
    '<a:prstGeom prst="hexagon"/>',
    '<a:p><a:r><a:t>主题样式</a:t></a:r></a:p>',
    '<xdr:style><a:lnRef idx="1"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent2"/></a:fillRef><a:fontRef idx="minor"><a:schemeClr val="dk1"/></a:fontRef></xdr:style>',
  ),
  shapeAnchor(
    4,
    '<a:custGeom><a:pathLst><a:path w="100" h="100"><a:unknownCommand/></a:path></a:pathLst></a:custGeom>',
    '<a:p><a:r><a:t>保留原件</a:t></a:r></a:p>',
  ),
  shapeAnchor(
    5,
    SHAPE_XFRM.replace('2220000', '5400000') +
      '<a:prstGeom prst="triangle"><a:avLst><a:gd name="adj" fmla="val 20000"/></a:avLst></a:prstGeom><a:solidFill><a:schemeClr val="accent1"/></a:solidFill>' +
      line,
  ),
].join('')}</xdr:wsDr>`
export async function xlsxShapePreviewFixture() {
  const bytes = new Uint8Array(
      readFileSync(
        join(import.meta.dirname, '../vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx'),
      ),
    ),
    zip = await JSZip.loadAsync(bytes)
  const sheetPath = 'xl/worksheets/sheet1.xml',
    drawingPath = 'xl/drawings/drawing-preview.xml'
  const rows = Array.from(
    { length: 65 },
    (_, i) =>
      `<row r="${i + 1}" ht="20" customHeight="1"${i === 8 ? ' hidden="1"' : ''}><c r="A${i + 1}" t="inlineStr"><is><t>${i === 0 ? 'XLSX 导入形状预览' : i + 1}</t></is></c><c r="H${i + 1}"/></row>`,
  ).join('')
  zip.file(
    sheetPath,
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:H65"/><sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="1" topLeftCell="B2" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="8" width="11" customWidth="1"/></cols><sheetData>${rows}</sheetData><drawing r:id="preview"/></worksheet>`,
  )
  zip.file(
    'xl/worksheets/_rels/sheet1.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="preview" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing-preview.xml"/></Relationships>',
  )
  zip.file(drawingPath, SHAPE_DRAWING)
  zip.file('xl/theme/shape-theme.xml', SHAPE_THEME)
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string')
  zip.file(
    'xl/_rels/workbook.xml.rels',
    rels
      .replace(/<Relationship\b[^>]*Type="[^"]*\/theme"[^>]*\/>/g, '')
      .replace(
        '</Relationships>',
        '<Relationship Id="shapeTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/shape-theme.xml"/></Relationships>',
      ),
  )
  const ct = await zip.file('[Content_Types].xml')!.async('string')
  zip.file(
    '[Content_Types].xml',
    ct.replace(
      '</Types>',
      '<Override PartName="/xl/drawings/drawing-preview.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/theme/shape-theme.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>',
    ),
  )
  zip.file(
    'customXml/preview-opaque.xml',
    '<opaque xmlns="urn:mimir:shape-fixture" preserve="yes">Not a drawing</opaque>',
  )
  return { bytes: await zip.generateAsync({ type: 'uint8array' }), drawingPath }
}
