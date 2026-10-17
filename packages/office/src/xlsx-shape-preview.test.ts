import JSZip from 'jszip'
import { expect, it } from 'vitest'
import {
  readXlsxShapePreviews,
  readXlsxShapeTheme,
  readXlsxShapeThemeTarget,
} from './xlsx-shape-preview.js'
import { readXlsx } from './xlsx.js'
import { openXlsxForEdit } from './xlsx-edit.js'
import {
  SHAPE_A,
  SHAPE_X,
  SHAPE_DRAWING,
  SHAPE_THEME,
  SHAPE_CUSTOM,
  shapeAnchor,
  xlsxShapePreviewFixture,
} from './xlsx-shape-preview-fixture.test-helper.js'
import { applyXlsxObjectOperation } from '../../../apps/server/src/services/xlsx-agent-objects.js'

it('reads native transforms, ext-sized frame, adjustments, theme linear paint, separate line/noFill, custom channels and rich paragraphs', async () => {
  const fixture = await xlsxShapePreviewFixture(),
    sheet = (await readXlsx(fixture.bytes)).sheets[0]!,
    visuals = sheet.visuals!
  expect(visuals).toHaveLength(6)
  const first = visuals[0]!.shapePreview!.element!
  expect(first.transform).toMatchObject({
    rot: 2220000,
    flipH: true,
    offset: { cx: 1905000, cy: 952500 },
  })
  expect(first.adjust).toEqual({ adj: 40000 })
  expect(first.fill).toMatchObject({
    type: 'gradient',
    angle: 2700000,
    scaled: true,
    stops: [
      { pos: 0, color: '#186A7A' },
      { pos: 1, color: '#E4A24A99' },
    ],
  })
  expect(first.stroke).toMatchObject({
    width: 28575,
    dash: 'dashDot',
    cap: 'round',
    join: 'round',
    fill: { type: 'solid', color: '#186A7A' },
  })
  expect(first.text!.paragraphs[0]!.runs[0]).toMatchObject({
    text: '旋转',
    bold: true,
    fontSize: 18,
    color: '#FFFFFF',
  })
  expect(first.text!.paragraphs[0]!.runs[1]).toMatchObject({
    text: '渐变',
    italic: true,
    underline: true,
    fontSize: 12,
  })
  expect(visuals[0]!.text).toBe('旋转渐变\n第二段')
  expect(visuals[1]!.shapePreview!.element!.customGeometry).toMatchObject({
    fillPath: expect.stringContaining('M 0 0'),
    strokePath: expect.stringContaining('M 0 0.5'),
  })
  expect(visuals[1]!.shapePreview!.element!.transform.flipV).toBe(true)
  expect(visuals[2]!.shapePreview!.element!.fill).toEqual({ type: 'none' })
  expect(visuals[3]!.shapePreview!.element!.fill).toEqual({ type: 'solid', color: '#E4A24A' })
  expect(visuals[3]!.shapePreview!.element!.stroke!.fill).toEqual({
    type: 'solid',
    color: '#186A7A',
  })
  expect(visuals[4]!.shapePreview).toEqual({ unsupported: true })
  expect(visuals[5]!.shapePreview!.element!.transform.rot).toBe(5400000)
  expect(first.anchor.originalXml).toBe('')
})
const wrap = (inner: string) =>
  `<xdr:wsDr xmlns:xdr="${SHAPE_X}" xmlns:a="${SHAPE_A}">${shapeAnchor(0, inner)}</xdr:wsDr>`
it('expands arbitrary/default/strict namespaces and rejects foreign spoofed geometry, duplicate attrs and external entities', () => {
  const first = [
    ...readXlsxShapePreviews(SHAPE_DRAWING, readXlsxShapeTheme(SHAPE_THEME)).values(),
  ][0]!
  for (const xml of [
    SHAPE_DRAWING.replaceAll('xdr:', 'q:')
      .replaceAll('xmlns:xdr=', 'xmlns:q=')
      .replaceAll('a:', 'd:')
      .replaceAll('xmlns:a=', 'xmlns:d='),
    SHAPE_DRAWING.replaceAll('xdr:', '').replace('xmlns:xdr=', 'xmlns='),
    SHAPE_DRAWING.replaceAll(SHAPE_A, 'http://purl.oclc.org/ooxml/drawingml/main').replaceAll(
      SHAPE_X,
      'http://purl.oclc.org/ooxml/drawingml/spreadsheetDrawing',
    ),
  ]) {
    const actual = [...readXlsxShapePreviews(xml, readXlsxShapeTheme(SHAPE_THEME)).values()][0]!
    expect(actual.element?.transform).toEqual(first.element!.transform)
    expect(actual.element?.fill).toEqual(first.element!.fill)
  }

  expect(
    [
      ...readXlsxShapePreviews(
        wrap(SHAPE_CUSTOM.replace('<a:lnTo>', '<a:lnTo xmlns:a="urn:foreign">')),
      ).values(),
    ][0],
  ).toEqual({ unsupported: true })
  expect(readXlsxShapePreviews(wrap('<a:prstGeom prst="rect" prst="ellipse"/>')).size).toBe(0)
  expect(
    readXlsxShapePreviews('<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + SHAPE_DRAWING)
      .size,
  ).toBe(0)
  expect(readXlsxShapePreviews(SHAPE_DRAWING.replace(SHAPE_X, 'urn:unknown')).size).toBe(0)
})
const wrapWithSibling = (inner: string) =>
  `<xdr:wsDr xmlns:xdr="${SHAPE_X}" xmlns:a="${SHAPE_A}">${shapeAnchor(0, inner)}${shapeAnchor(1, '<a:prstGeom prst="rect"/>')}</xdr:wsDr>`
it('bounds geometry formulas, commands, depth, native frames and bad numeric coordinates without rejecting sibling shapes', () => {
  for (const bad of [
    '<a:prstGeom/>',
    SHAPE_CUSTOM.replace('x="100"', 'x="NaN"'),
    SHAPE_CUSTOM.replace('x="100"', 'x="1e1000"'),
    SHAPE_CUSTOM.replace('w="100"', 'w="0"'),
    SHAPE_CUSTOM.replace('w="100"', 'w="w"'),
    SHAPE_CUSTOM.replace(
      '<a:avLst/>',
      '<a:avLst><a:gd name="bad" fmla="val missingGuide"/></a:avLst>',
    ),
    SHAPE_CUSTOM.replace('<a:lnTo>', '<a:unknown>').replace('</a:lnTo>', '</a:unknown>'),
    SHAPE_CUSTOM.replace(
      '<a:gdLst/>',
      '<a:gdLst>' +
        Array.from({ length: 257 }, (_, i) => `<a:gd name="g${i}" fmla="val 0"/>`).join('') +
        '</a:gdLst>',
    ),
    '<a:xfrm><a:ext cx="9999999999999999" cy="10"/></a:xfrm><a:prstGeom prst="rect"/>',
  ]) {
    const result = [...readXlsxShapePreviews(wrapWithSibling(bad)).values()]
    expect(result[0]).toEqual({ unsupported: true })
    expect(result[1]?.element?.presetGeometry).toBe('rect')
  }
  expect(
    readXlsxShapePreviews(wrapWithSibling('<a:avLst>'.repeat(50) + '</a:avLst>'.repeat(50))).size,
  ).toBe(0)
  expect(readXlsxShapePreviews(' '.repeat(4_000_001)).size).toBe(0)
})
const custom = (guides: string, arc: string) =>
  `<a:custGeom><a:avLst/><a:gdLst>${guides}</a:gdLst><a:pathLst><a:path w="100" h="100"><a:moveTo><a:pt x="0" y="0"/></a:moveTo>${arc}</a:path></a:pathLst></a:custGeom>`
it('rejects resolved guide overflows and oversized arc sweeps before native expansion', () => {
  const arc = '<a:arcTo wR="50" hR="50" stAng="0" swAng="sweep"/>'
  for (const bad of [
    custom('<a:gd name="sweep" fmla="val 21600001"/>', arc),
    custom(
      '<a:gd name="large" fmla="*/ 10000000000 10000000000 1"/><a:gd name="sweep" fmla="*/ large large 1"/>',
      arc,
    ),
    custom('', '<a:arcTo wR="50" hR="50" stAng="0"/>'),
  ]) {
    const result = [...readXlsxShapePreviews(wrapWithSibling(bad)).values()]
    expect(result[0]).toEqual({ unsupported: true })
    expect(result[1]?.element?.presetGeometry).toBe('rect')
  }
  const valid = [
    ...readXlsxShapePreviews(wrap(custom('<a:gd name="sweep" fmla="val 5400000"/>', arc))).values(),
  ]
  expect(valid[0]?.element?.customGeometry?.path).toContain('C')
})
const noCalc = (xml: string) => xml.replace(/<calcPr\b[^>]*\/>/g, '')
it('preview is byte/dirty neutral; a real native fill edit preserves geometry, rich text, line, transforms and every non-target entry on reopen', async () => {
  const fixture = await xlsxShapePreviewFixture(),
    originalBytes = fixture.bytes.slice(),
    session = await openXlsxForEdit(fixture.bytes)
  expect(session.isDirty()).toBe(false)
  expect(fixture.bytes).toEqual(originalBytes)
  const unchanged = await JSZip.loadAsync(await session.save()),
    source = await JSZip.loadAsync(fixture.bytes)
  for (const [path, entry] of Object.entries(source.files)) {
    if (entry.dir) continue
    expect(await unchanged.file(path)!.async('uint8array')).toEqual(await entry.async('uint8array'))
  }
  const visual = session.view().sheets[0]!.visuals![0]!,
    before = visual.shapePreview!.element!,
    original = await JSZip.loadAsync(fixture.bytes)
  const result = await applyXlsxObjectOperation(
    fixture.bytes,
    { op: 'edit_shape', visualId: visual.id, fillColor: '#CA3152' },
    0,
  )
  const zip = await JSZip.loadAsync(result.bytes),
    after = (await readXlsx(result.bytes)).sheets[0]!.visuals![0]!.shapePreview!.element!
  expect(after.fill).toEqual({ type: 'solid', color: '#CA3152' })
  expect(after.transform).toEqual(before.transform)
  expect(after.adjust).toEqual(before.adjust)
  expect(after.stroke).toEqual(before.stroke)
  expect(after.text).toEqual(before.text)
  for (const [path, entry] of Object.entries(original.files)) {
    if (entry.dir || path === fixture.drawingPath || path === 'xl/workbook.xml') continue
    expect(await zip.file(path)!.async('uint8array')).toEqual(await entry.async('uint8array'))
  }
  expect(noCalc(await zip.file('xl/workbook.xml')!.async('string'))).toBe(
    noCalc(await original.file('xl/workbook.xml')!.async('string')),
  )
  const beforeXml = await original.file(fixture.drawingPath)!.async('string'),
    afterXml = await zip.file(fixture.drawingPath)!.async('string')
  expect(afterXml.slice(afterXml.indexOf('<xdr:oneCellAnchor>'))).toBe(
    beforeXml.slice(beforeXml.indexOf('<xdr:oneCellAnchor>')),
  )
})

it('resolves exactly one namespace-correct workbook theme relationship, never foreign or external rows', () => {
  const ns = 'http://schemas.openxmlformats.org/package/2006/relationships',
    type = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
    row = `<q:Relationship Id="theme" Type="${type}" Target="theme/shape-theme.xml"/>`,
    relationships = (rows: string) => `<q:Relationships xmlns:q="${ns}">${rows}</q:Relationships>`
  expect(readXlsxShapeThemeTarget(relationships(row))).toBe('theme/shape-theme.xml')
  expect(
    readXlsxShapeThemeTarget(
      relationships(row.replace('Id="theme"', 'xmlns:q="urn:foreign" Id="theme"')),
    ),
  ).toBeUndefined()
  expect(
    readXlsxShapeThemeTarget(
      relationships(row.replace('Id="theme"', 'TargetMode="External" Id="theme"')),
    ),
  ).toBeUndefined()
  expect(readXlsxShapeThemeTarget(relationships(row + row))).toBeUndefined()
  expect(readXlsxShapeThemeTarget(relationships(`<q:wrapper>${row}</q:wrapper>`))).toBeUndefined()
  expect(readXlsxShapeTheme(SHAPE_THEME.replace(SHAPE_A, 'urn:foreign'))).toBeUndefined()
})

it('keeps unresolved native and theme image paints explicitly unsupported instead of dropping them', () => {
  const image = '<a:blipFill><a:blip/><a:stretch><a:fillRect/></a:stretch></a:blipFill>',
    direct = [
      ...readXlsxShapePreviews(wrapWithSibling('<a:prstGeom prst="rect"/>' + image)).values(),
    ]
  expect(direct[0]).toEqual({ unsupported: true })
  expect(direct[1]?.element?.presetGeometry).toBe('rect')
  const theme = readXlsxShapeTheme(
      SHAPE_THEME.replace(
        '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>',
        `<a:fillStyleLst>${image}</a:fillStyleLst>`,
      ),
    ),
    themed = [...readXlsxShapePreviews(SHAPE_DRAWING, theme).values()]
  expect(themed[3]).toEqual({ unsupported: true })
  expect(themed[0]?.element?.fill?.type).toBe('gradient')
})
