import { describe, expect, it } from 'vitest'
import {
  planXlsxPasteColumnWidths,
  planXlsxPasteGeometry,
  projectXlsxPasteCell,
  createXlsxPasteBorderStyles,
  writeXlsxPasteColumnWidths,
  xlsxPasteAddresses,
  type XlsxPasteCellRequest,
  type XlsxPasteMode,
} from '../services/xlsx-special-paste.js'
import { translateSharedFormula } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-structure.js'

const rich =
  '<is><r><rPr><b/><color theme="4"/></rPr><t xml:space="preserve"> 甲 &amp; </t></r><r><t><![CDATA[乙&literal;]]></t></r></is>'
const deps = {
  sharedString: (index: number) =>
    index === 0 ? rich.replaceAll('<is>', '<si>').replaceAll('</is>', '</si>') : undefined,
  translateFormula: (formula: string, row: number, column: number) => {
    const translated = translateSharedFormula(formula, row, column)
    if (translated === null) throw new Error('公式无法安全平移')
    return translated
  },
  mergeBorder: (source: string, target: string) => (source === target ? source : '17'),
}
const base: XlsxPasteCellRequest = {
  sourceXml: '<c r="A1"><f>A2+$B$1+C$2+$D3</f><v>42</v></c>',
  targetXml: '<c r="C4" s="9"><v>98</v></c>',
  sourceStyle: '4',
  targetStyle: '9',
  targetAddress: 'C4',
  rowDelta: 3,
  columnDelta: 2,
  mode: 'value',
}
const cell = (overrides: Partial<XlsxPasteCellRequest>) =>
  projectXlsxPasteCell({ ...base, ...overrides }, deps)

describe('native special paste preparation', () => {
  it('expands a single anchor and plans all four tiles from the frozen source', () => {
    expect(planXlsxPasteGeometry('A1:B2', 'C4', 'copy', 'all').target).toEqual({
      startRow: 3,
      endRow: 4,
      startColumn: 2,
      endColumn: 3,
    })
    const result = planXlsxPasteGeometry('A1:B2', 'B2:E5', 'copy', 'formula')
    expect(result.tiles).toHaveLength(4)
    const positions = xlsxPasteAddresses(result)
    expect(positions).toHaveLength(16)
    expect(new Set(positions.map((position) => position.target)).size).toBe(16)
    expect(positions.find((position) => position.target === 'E5')).toEqual({
      source: 'B2',
      target: 'E5',
      rowDelta: 3,
      columnDelta: 3,
    })
  })
  it.each(['value', 'formula', 'format', 'column-width', 'besides-border'] as XlsxPasteMode[])(
    'rejects destructive special CUT %s before planning',
    (mode) => {
      expect(() => planXlsxPasteGeometry('A1:B2', 'C4', 'cut', mode)).toThrow('请先复制')
    },
  )
  it('retains ordinary CUT geometry but does not tile a move', () => {
    expect(planXlsxPasteGeometry('A1:B2', 'B2', 'cut', 'all').tiles).toHaveLength(1)
    expect(() => planXlsxPasteGeometry('A1:B2', 'B2:E5', 'cut', 'all')).toThrow('剪切目标')
  })
  it.each([
    ['A1:B2', 'D4:F7'],
    ['A1:B2', 'XFD1048576'],
    ['A1:AX41', 'B2'],
    ['A0:B1', 'C1'],
  ])('rejects invalid geometry %s -> %s', (source, target) => {
    expect(() => planXlsxPasteGeometry(source, target, 'copy', 'all')).toThrow('选择性粘贴')
  })
  it('preserves real numeric cache and destination style while removing formula', () => {
    expect(cell({})).toBe('<c r="C4" s="9"><v>42</v></c>')
    expect(cell({ mode: 'formula' })).toBe('<c r="C4" s="9"><f>C5+$B$1+E$2+$D6</f></c>')
    expect(() => cell({ sourceXml: '<c r="A1"><f>A2</f></c>' })).toThrow('没有缓存')
  })
  it.each([
    ['b', '0'],
    ['b', '1'],
    ['e', '#DIV/0!'],
    ['str', ' 003 &amp; true '],
    ['n', '1.25E-4'],
  ])('keeps cached type %s instead of converting formatted display text', (type, value) => {
    expect(cell({ sourceXml: `<c r="A1" t="${type}"><f>A2</f><v>${value}</v></c>` })).toBe(
      `<c r="C4" s="9" t="${type}"><v>${value}</v></c>`,
    )
  })
  it.each(['value', 'formula'] as const)('keeps constants and blanks in %s mode', (mode) => {
    expect(cell({ sourceXml: '<c r="A1" t="b"><v>0</v></c>', mode })).toContain('t="b"><v>0</v>')
    expect(cell({ sourceXml: '', mode })).toBe('<c r="C4" s="9"/>')
  })
  it('preserves inline runs for values replacing a nonformula target, per sheets-ui value hook', () => {
    expect(cell({ sourceXml: `<c r="A1" t="inlineStr">${rich}</c>` })).toBe(
      `<c r="C4" s="9" t="inlineStr">${rich}</c>`,
    )
  })
  it('flattens rich runs only where the official later formula-ui hook does', () => {
    const plain = '<is><t xml:space="preserve"> 甲 &amp; 乙&amp;literal;</t></is>'
    for (const sourceXml of [
      `<c r="A1" t="inlineStr">${rich}</c>`,
      '<c r="A1" t="s"><v>0</v></c>',
    ]) {
      expect(cell({ sourceXml, mode: 'formula' })).toBe(
        `<c r="C4" s="9" t="inlineStr">${plain}</c>`,
      )
      expect(cell({ sourceXml, targetXml: '<c r="C4"><f>A1</f><v>1</v></c>' })).toBe(
        `<c r="C4" s="9" t="inlineStr">${plain}</c>`,
      )
    }
  })
  it('format mode changes only the target base style and retains native formula/body bytes', () => {
    const targetXml = '<c r="C4" t="str" s="9"><f><![CDATA[IF(A1="&",1,2)]]></f><v>cached</v></c>'
    expect(cell({ mode: 'format', targetXml })).toBe(targetXml.replace('s="9"', 's="4"'))
  })
  it('besides-border uses the merged native style and retains source values/runs', () => {
    expect(cell({ mode: 'besides-border', sourceXml: `<c r="A1" t="inlineStr">${rich}</c>` })).toBe(
      `<c r="C4" s="17" t="inlineStr">${rich}</c>`,
    )
    expect(cell({ mode: 'all' })).toBe('<c r="C4" s="4"><f>C5+$B$1+E$2+$D6</f><v>42</v></c>')
  })
  it.each([
    '<c r="A1" cm="1"><v>1</v></c>',
    '<c r="A1"><f t="array" ref="A1:A2">A2</f><v>2</v></c>',
    '<c r="A1"><v>1</v><v>2</v></c>',
    '<c r="A1" t="inlineStr"><v>2</v></c>',
    '<c r="A1"><extLst/></c>',
  ])('rejects opaque or inconsistent native content: %s', (sourceXml) => {
    expect(() => cell({ sourceXml })).toThrow('选择性粘贴')
  })
  it('does not assign source default widths or reveal hidden destination columns', () => {
    const geometry = planXlsxPasteGeometry('A1:C1', 'D3:I3', 'copy', 'column-width')
    expect([
      ...planXlsxPasteColumnWidths([80, 120, 160], geometry.target, 80, (column) => column !== 5),
    ]).toEqual([
      [4, 120],
      [7, 120],
      [8, 160],
    ])
  })
})

const styles =
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><name val="Theme font"/></font></fonts><borders count="3"><border/><border><left style="thin"><color theme="4"/></left></border><border><bottom style="double"><color rgb="FF123456"/></bottom></border></borders><cellStyleXfs count="1"><xf borderId="2"/></cellStyleXfs><cellXfs count="3"><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="0" fillId="2" borderId="1" xfId="0"><alignment wrapText="1"/></xf><xf fontId="0" borderId="0" xfId="0" applyBorder="0"/></cellXfs><extLst><ext uri="keep-style"/></extLst></styleSheet>'

it('composes the target effective inherited border while preserving source alignment/fill/theme and old styles', () => {
  const resolver = createXlsxPasteBorderStyles(styles)
  expect(resolver.mergeBorder('1', '2')).toBe('3')
  expect(resolver.mergeBorder('1', '2')).toBe('3')
  expect(resolver.mergeBorder('1', '1')).toBe('1')
  const result = resolver.result()
  expect(result).toContain('<cellXfs count="4">')
  expect(result).toContain(
    '<xf fontId="0" fillId="2" borderId="2" xfId="0" applyBorder="1"><alignment wrapText="1"/></xf>',
  )
  expect(
    result
      .replace('<cellXfs count="4">', '<cellXfs count="3">')
      .replace(
        '<xf fontId="0" fillId="2" borderId="2" xfId="0" applyBorder="1"><alignment wrapText="1"/></xf>',
        '',
      ),
  ).toBe(styles)
})
it('native border no-op returns exact stylesheet and invalid target style rejects', () => {
  const resolver = createXlsxPasteBorderStyles(styles)
  expect(resolver.mergeBorder('0', '0')).toBe('0')
  expect(resolver.result()).toBe(styles)
  expect(() => resolver.mergeBorder('0', '8')).toThrow('样式索引不存在')
})
it('splits wide native column spans without changing style, hidden, outline or unrelated bytes', () => {
  const before =
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetFormatPr defaultColWidth="10"/><cols><!--keep--><col min="1" max="16384" width="10" style="2" hidden="0" outlineLevel="1"/></cols><sheetData><row r="1"><c r="A1"><v>42</v></c></row></sheetData><extLst><ext uri="untouched"/></extLst></worksheet>'
  const result = writeXlsxPasteColumnWidths(
    before,
    new Map([
      [3, 22],
      [5, 24],
    ]),
  )
  expect(result).toContain(
    '<!--keep--><col min="1" max="3" width="10" style="2" hidden="0" outlineLevel="1"/><col min="4" max="4" width="22" style="2" hidden="0" outlineLevel="1" customWidth="1"/><col min="5" max="5" width="10" style="2" hidden="0" outlineLevel="1"/><col min="6" max="6" width="24" style="2" hidden="0" outlineLevel="1" customWidth="1"/><col min="7" max="16384" width="10" style="2" hidden="0" outlineLevel="1"/>',
  )
  expect(result.slice(result.indexOf('</cols>'))).toBe(before.slice(before.indexOf('</cols>')))
  expect(writeXlsxPasteColumnWidths(before, new Map())).toBe(before)
})
it('inserts previously undefined native column widths before sheetData, preserving default and rows', () => {
  const before =
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetFormatPr defaultColWidth="10"/><sheetData/></worksheet>'
  expect(writeXlsxPasteColumnWidths(before, new Map([[2, 22]]))).toBe(
    before.replace(
      '<sheetData/>',
      '<cols><col min="3" max="3" width="22" customWidth="1"/></cols><sheetData/>',
    ),
  )
})

it('width no-op and native hidden destinations preserve the complete original worksheet', () => {
  const before =
    '<worksheet><sheetFormatPr defaultColWidth="10"/><cols><col min="2" max="2" hidden="1" width="15"/></cols><sheetData/></worksheet>'
  expect(
    writeXlsxPasteColumnWidths(
      before,
      new Map([
        [0, 10],
        [1, 22],
      ]),
    ),
  ).toBe(before)
})

it.each(['<v/>', '<v>not-a-number</v>', '<v>NaN</v>'])(
  'rejects unusable numeric formula cache %s',
  (cache) => {
    expect(() => cell({ sourceXml: `<c r="A1"><f>A2</f>${cache}</c>` })).toThrow('缓存')
  },
)

it('skips an explicit zero source width, matching the fixed upstream truthy-width guard', () => {
  const geometry = planXlsxPasteGeometry('A1:C1', 'D3:I3', 'copy', 'column-width')
  expect([...planXlsxPasteColumnWidths([0, 80, 120], geometry.target, 80, () => true)]).toEqual([
    [5, 120],
    [8, 120],
  ])
})
