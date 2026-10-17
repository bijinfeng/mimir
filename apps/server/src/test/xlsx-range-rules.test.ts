import { expect, it } from 'vitest'
import {
  intersectXlsxRuleRects,
  subtractXlsxRuleRect,
  normalizeXlsxRuleRects,
  shiftXlsxRuleRect,
  planXlsxRangeRules,
  hasXlsxRangeRulePermit,
} from '../services/xlsx-range-rules.js'
import {
  parseRange,
  type RangeBounds,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import { pivotXmlTree } from '../../../../packages/office/src/xlsx-pivot-editability.js'
import { cf, dv, MAIN, ruleReaders, ruleRequest } from './xlsx-range-rules.test-helper.js'

const cells = (ranges: readonly RangeBounds[]) => {
  const result = new Set<string>()
  for (const range of ranges)
    for (let row = range.startRow; row <= range.endRow; row++)
      for (let col = range.startColumn; col <= range.endColumn; col++) result.add(`${row}:${col}`)
  return [...result].toSorted()
}
it.each([
  ['B2:D4', 'C3', ['B2:D2', 'B4:D4', 'B3', 'D3']],
  ['B2:D4', 'A1:D4', []],
  ['B2:D4', 'E1:E5', ['B2:D4']],
  ['B2:D4', 'C1:D5', ['B2:B4']],
])('subtracts a rectangle without losing uncovered cells: %s minus %s', (base, cut, expected) => {
  const result = subtractXlsxRuleRect(parseRange(base), parseRange(cut))
  expect(cells(result)).toEqual(cells(expected.map(parseRange)))
  expect(result.length).toBeLessThanOrEqual(4)
})
it('subtracts from an entire column with a fixed four-fragment ceiling', () => {
  const column = parseRange('A1:A1048576')
  expect(subtractXlsxRuleRect(column, parseRange('A500:A501'))).toEqual([
    parseRange('A1:A499'),
    parseRange('A502:A1048576'),
  ])
  expect(normalizeXlsxRuleRects([column, parseRange('A3:A900000')])).toEqual([column])
})
it('unions rectangles deterministically without overlaps or holes', () => {
  const samples = ['A1:C3', 'B2:D4', 'D1:D3', 'A4:D4'].map(parseRange)
  const normalized = normalizeXlsxRuleRects(samples)
  expect(cells(normalized)).toEqual(cells(samples))
  expect(normalized).toEqual([parseRange('A1:D4')])
  expect(normalizeXlsxRuleRects(samples.toReversed())).toEqual(normalized)
  expect(normalizeXlsxRuleRects(normalized)).toEqual(normalized)
})
it('checks every small rectangle intersection and difference against set membership', () => {
  const ranges: RangeBounds[] = []
  for (let row = 0; row < 3; row++)
    for (let endRow = row; endRow < 3; endRow++)
      for (let col = 0; col < 3; col++)
        for (let endColumn = col; endColumn < 3; endColumn++)
          ranges.push({ startRow: row, endRow, startColumn: col, endColumn })
  for (const a of ranges)
    for (const b of ranges) {
      const aCells = cells([a]),
        bCells = new Set(cells([b]))
      const intersection = intersectXlsxRuleRects(a, b)
      expect(intersection ? cells([intersection]) : []).toEqual(
        aCells.filter((cell) => bCells.has(cell)),
      )
      expect(cells(subtractXlsxRuleRect(a, b))).toEqual(aCells.filter((cell) => !bCells.has(cell)))
    }
})
it('preserves L-shaped unions and only merges complete shared edges', () => {
  const input = ['A1:A3', 'B1:C1'].map(parseRange)
  expect(normalizeXlsxRuleRects(input)).toEqual([parseRange('A1:A3'), parseRange('B1:C1')])
  expect(cells(normalizeXlsxRuleRects(input))).toEqual(cells(input))
})
it('refuses excessive rectangle work before expanding an entire column', () => {
  expect(() =>
    normalizeXlsxRuleRects(['A1:A1048576', 'B1:B1048576'].map(parseRange), { remaining: 0 }),
  ).toThrow(/预算/)
})
it('bounds translated rectangles against both worksheet edges', () => {
  expect(shiftXlsxRuleRect(parseRange('A1:B2'), 4, 4)).toEqual(parseRange('E5:F6'))
  expect(() => shiftXlsxRuleRect(parseRange('A1'), -1, 0)).toThrow(/边界/)
  expect(() => shiftXlsxRuleRect(parseRange('XFD1048576'), 0, 1)).toThrow(/边界/)
})

it.each([false, true])(
  'copies intersected conditional formatting with stable priorities, cross=%s',
  (cross) => {
    const request = ruleRequest(cf('A1:D4'), '', false, cross)
    const plan = planXlsxRangeRules(request, ruleReaders(request))
    const output = plan.replacements.get(cross ? 'target' : 'source')!
    expect(output).toContain('sqref="E5:G7"')
    expect(output).toContain('<formula>E5&gt;0</formula>')
    expect(output).toContain('stopIfTrue="1"')
    expect(plan.replacements.has('source')).toBe(!cross)
    expect(output).toContain('<pageMargins left="0.5"/>')
    const repeated = {
      ...request,
      sheets: request.sheets.map((sheet) =>
        Object.assign({}, sheet, {
          xml: plan.replacements.get(sheet.entry) ?? sheet.xml,
        }),
      ),
    }
    expect(planXlsxRangeRules(repeated, ruleReaders(repeated)).replacements.size).toBe(0)
  },
)
it('reanchors a partial source with relative, mixed, absolute and string references', () => {
  const request = ruleRequest(cf('A1:D4', '$A1+A$1+$A$1+"A1"'), '', false, true)
  request.source.bounds = parseRange('B2:C3')
  request.target.bounds = parseRange('E5:F6')
  const output = planXlsxRangeRules(request, ruleReaders(request)).replacements.get('target')!
  expect(output).toContain('<formula>$A5+E$1+$A$1+"A1"</formula>')
})
it('translates lowercase A1 tokens while preserving quoted formula strings', () => {
  const request = ruleRequest(cf('A1:C3', '$a1+a$1+$a$1+"a1"'), '', false, true)
  const output = planXlsxRangeRules(request, ruleReaders(request)).replacements.get('target')!
  expect(output).toContain('<formula>$A5+E$1+$A$1+"a1"</formula>')
})
it('copies a multi-rectangle rule as one domain while preserving its original first anchor', () => {
  const request = ruleRequest(cf('C3 A1:B2', 'E5'), '', false, true)
  const output = planXlsxRangeRules(request, ruleReaders(request)).replacements.get('target')!
  expect(output).toContain('sqref="E5:F6 G7"')
  expect(output).toContain('<formula>G7</formula>')
  expect((output.match(/<conditionalFormatting\b/g) ?? []).length).toBe(1)
})
it('retains the domain of statistical conditional formatting across copied disjoint rectangles', () => {
  const source =
    '<conditionalFormatting sqref="A1:B2 C3"><cfRule type="duplicateValues" priority="4"/></conditionalFormatting>'
  const request = ruleRequest(source, '', false, true)
  const output = planXlsxRangeRules(request, ruleReaders(request)).replacements.get('target')!
  expect((output.match(/<cfRule\b/g) ?? []).length).toBe(1)
  expect(output).toContain('sqref="E5:F6 G7"')
})
it('subtracts the target intersection and preserves target rule formulas outside the overwrite', () => {
  const request = ruleRequest(cf('A1:C3'), cf('D4:H8', 'D4&gt;0', 7), false, true)
  const output = planXlsxRangeRules(request, ruleReaders(request)).replacements.get('target')!
  expect(output).toContain('sqref="D4:H4 D5:D7 H5:H7 D8:H8"')
  expect(output).toContain('<formula>D4&gt;0</formula>')
  expect(output).toContain('priority="7"')
  expect(output).toContain('priority="8"')
})
it.each([false, true])(
  'moves frozen source rules once across an overlapping or cross-sheet destination, cross=%s',
  (cross) => {
    const request = ruleRequest(cf('A1:C3', 'A1'), '', true, cross)
    if (!cross) request.target.bounds = parseRange('B2:D4')
    const plan = planXlsxRangeRules(request, ruleReaders(request))
    const output = plan.replacements.get(cross ? 'target' : 'source')!
    expect(output).toContain(`sqref="${cross ? 'E5:G7' : 'B2:D4'}"`)
    expect(output).toContain(cross ? "<formula>'目标'!E5</formula>" : '<formula>B2</formula>')
    expect((output.match(/<conditionalFormatting\b/g) ?? []).length).toBe(1)
  },
)
it('splits an otherwise disjoint relative rule where only some applied cells depend on moved cells', () => {
  const request = ruleRequest(cf('J10:J14', 'A1'), '', true, true)
  const plan = planXlsxRangeRules(request, ruleReaders(request))
  const output = plan.replacements.get('source')!
  expect(output).toContain('sqref="J10:J12"')
  expect(output).toContain("<formula>'目标'!E5</formula>")
  expect(output).toContain('sqref="J13:J14"')
  expect(output).toContain('<formula>A4</formula>')
})
it('retains cross-sheet cut references outside the source and moves inside absolute references', () => {
  const request = ruleRequest(cf('A1:C3', '$A$1+J10'), '', true, true)
  const output = planXlsxRangeRules(request, ruleReaders(request)).replacements.get('target')!
  expect(output).toContain("<formula>'目标'!$E$5+'数据'!J10</formula>")
})
it('qualifies disjoint entire-column references when a rule itself moves across sheets', () => {
  const request = ruleRequest(cf('A1:C3', 'SUM(J:J)'), '', true, true)
  const output = planXlsxRangeRules(request, ruleReaders(request)).replacements.get('target')!
  expect(output).toContain("<formula>SUM('数据'!J:J)</formula>")
})
it('keeps stop and dxf identities and preserves precedence when retained rules must split', () => {
  const first = cf('A1:D4', 'A1', 1).replace('stopIfTrue="1"', 'stopIfTrue="1" dxfId="0"')
  const request = ruleRequest(first + cf('D1:D4', '99', 2), '', true, true)
  request.stylesXml = `<styleSheet xmlns="${MAIN}"><dxfs count="1"><dxf><font><b/></font></dxf></dxfs></styleSheet>`
  const plan = planXlsxRangeRules(request, ruleReaders(request))
  const source = plan.replacements.get('source')!
  expect(source).toContain('dxfId="0"')
  const rules = pivotXmlTree(source)
    .children.filter((node) => node.tag === 'conditionalFormatting')
    .flatMap((group) => group.children)
  const priorities = rules.map((rule) => Number(rule.attrs.priority))
  expect(new Set(priorities).size).toBe(priorities.length)
  const later = rules.find((rule) =>
    rule.children.some((child) => child.children.some((text) => text.attrs.value === '99')),
  )!
  expect(Number(later.attrs.priority)).toBeGreaterThan(
    Math.max(
      ...rules
        .filter((rule) => rule.attrs.dxfId === '0')
        .map((rule) => Number(rule.attrs.priority)),
    ),
  )
})
it('translates formula cfvo values without changing colors or scalar thresholds', () => {
  const source =
    '<conditionalFormatting sqref="A1:C3"><cfRule type="colorScale" priority="1"><colorScale><cfvo type="formula" val="$A1"/><cfvo type="num" val="100"/><color rgb="FF112233"/><color theme="4" tint="0.25"/></colorScale></cfRule></conditionalFormatting>'
  const request = ruleRequest(source, '', false, true)
  const output = planXlsxRangeRules(request, ruleReaders(request)).replacements.get('target')!
  expect(output).toContain('type="formula" val="$A5"')
  expect(output).toContain('<cfvo type="num" val="100"/>')
  expect(output).toContain('<color rgb="FF112233"/><color theme="4" tint="0.25"/>')
})
it('preserves CDATA/entity-looking formula characters exactly once', () => {
  const request = ruleRequest(
    cf('A1:C3', '<![CDATA[A1&"&amp;#49;"]]><!-- valid - -->'),
    '',
    false,
    true,
  )
  const output = planXlsxRangeRules(request, ruleReaders(request)).replacements.get('target')!
  expect(output).toContain('<formula>E5&amp;"&amp;amp;#49;"</formula>')
})
it('retains unchanged rule XML, including CDATA, quoting and comments', () => {
  const unchanged = cf('J10:J11', '<![CDATA["&amp;#49;"]]><!--keep-->', 9).replace(
    'priority="9"',
    "priority = '9'",
  )
  const request = ruleRequest(cf('A1:C3') + unchanged, '', false, true)
  const plan = planXlsxRangeRules(request, ruleReaders(request))
  expect(plan.replacements.has('source')).toBe(false)
  expect(request.sheets[0]!.xml).toContain(unchanged)
})
it.each([false, true])(
  'splits DV overwrite ranges while retaining every display flag and message, move=%s',
  (move) => {
    const extra =
      'allowBlank="1" showInputMessage="true" showErrorMessage="1" errorStyle="warning" promptTitle="提示 &amp; 原文" prompt="输入" errorTitle="错误" error="不符" showDropDown="0" imeMode="noControl"'
    const request = ruleRequest(dv('A1:D4', '0', extra), dv('D4:H8', '0'), move, true)
    const plan = planXlsxRangeRules(request, ruleReaders(request)),
      output = plan.replacements.get('target')!
    expect(output).toContain(extra)
    expect(output).toContain('sqref="D4:H4 D5:D7 H5:H7 D8:H8"')
    expect(output).toContain('count="2"')
    expect(plan.validationAreas.get('target')).toEqual([parseRange('E5:G7')])
    expect(plan.replacements.has('source')).toBe(move)
  },
)
it('updates unchanged-value validation coverage when a new rule is copied', () => {
  const request = ruleRequest(dv('A1:C3', '5'), '', false, true)
  const plan = planXlsxRangeRules(request, ruleReaders(request))
  expect(plan.validationAreas.get('target')).toEqual([parseRange('E5:G7')])
  expect(plan.replacements.get('target')).toContain('count="1"')
})
it('revalidates only external DV pieces with changed dependencies after a move', () => {
  const request = ruleRequest(dv('J10:J14', 'A1'), '', true, true)
  const plan = planXlsxRangeRules(request, ruleReaders(request))
  expect(plan.validationAreas.get('source')).toEqual([parseRange('J10:J12')])
  const output = plan.replacements.get('source')!
  expect(output).toContain('sqref="J13:J14"')
  expect(output).toContain('<formula1>A4</formula1>')
})
it('patches actual rule attributes without replacing attribute-looking text in prompts', () => {
  const source =
    cf('A1:C3').replace('type="expression"', 'type="expression" text="literal priority=\'1\'"') +
    dv('A1:C3', '0', 'prompt="keep sqref=\'A1:C3\'"')
  const request = ruleRequest(source, '', false, true)
  const output = planXlsxRangeRules(request, ruleReaders(request)).replacements.get('target')!
  expect(output).toContain('text="literal priority=\'1\'"')
  expect(output).toContain('prompt="keep sqref=\'A1:C3\'"')
  expect(output).toContain('sqref="E5:G7"')
})
it('uses bounded rectangles for full-column rule subtraction', () => {
  const request = ruleRequest(dv('A1:A1048576', '0'), '', true, true)
  const plan = planXlsxRangeRules(request, ruleReaders(request))
  expect(plan.replacements.get('source')).toContain('sqref="A4:A1048576"')
  expect(plan.replacements.get('target')).toContain('sqref="E5:E7"')
})
it.each([
  cf('A1:C3').replace('stopIfTrue="1"', 'stopIfTrue="maybe"'),
  cf('A1:C3').replace('type="expression"', 'type="unknown"'),
  cf('A1:C3').replace('</cfRule>', '<extLst/></cfRule>'),
  cf('A1:C3').replace('<formula>', '<formula unknown="1">'),
  cf('A1:C3') + cf('J10', '0', 1),
  cf('A1:C3', 'INDIRECT("A1")'),
  dv('A1:C3').replace('operator="greaterThan"', 'operator="unknown"'),
  dv('A1:C3').replace('</dataValidation>', '<unknown/></dataValidation>'),
  dv('A1:C3 A2:B2'),
])('refuses unsupported or ambiguous native rules before producing a candidate: %s', (source) => {
  const request = ruleRequest(source, '', false, true)
  expect(() => planXlsxRangeRules(request, ruleReaders(request))).toThrow(
    /规则|验证|格式|引用|迁移/,
  )
})
it('binds the opaque rule permit to original native XML, entry and operation rectangles', () => {
  const request = ruleRequest(cf('A1:C3'), '', false, true)
  const plan = planXlsxRangeRules(request, ruleReaders(request)),
    source = request.sheets[0]!
  expect(hasXlsxRangeRulePermit(plan.permit, 'source', source.xml, [request.source.bounds])).toBe(
    true,
  )
  expect(hasXlsxRangeRulePermit({}, 'source', source.xml, [request.source.bounds])).toBe(false)
  expect(hasXlsxRangeRulePermit(plan.permit, 'source', source.xml, [])).toBe(false)
  expect(hasXlsxRangeRulePermit(plan.permit, 'other', source.xml, [request.source.bounds])).toBe(
    false,
  )
  expect(
    hasXlsxRangeRulePermit(plan.permit, 'source', source.xml + ' ', [request.source.bounds]),
  ).toBe(false)
  expect(hasXlsxRangeRulePermit(plan.permit, 'source', source.xml, [parseRange('A1:D4')])).toBe(
    false,
  )
})
it('rejects a partial range dependency rather than relocating only one endpoint', () => {
  const request = ruleRequest(cf('J10', '$A$1:$D$4'), '', true, true)
  expect(() => planXlsxRangeRules(request, ruleReaders(request))).toThrow(/部分相交/)
})
it('leaves the exact source and target identity operation unchanged', () => {
  const request = ruleRequest(cf('A1:C3') + dv('A1:C3'))
  request.target.bounds = request.source.bounds
  const plan = planXlsxRangeRules(request, ruleReaders(request))
  expect(plan.replacements.size).toBe(0)
  expect(plan.validationAreas.size).toBe(0)
})
it('refuses rule sqref budgets before trying to enumerate cells', () => {
  const request = ruleRequest(
    cf(Array.from({ length: 513 }, (_, index) => `A${index + 1}`).join(' ')),
    '',
    false,
    true,
  )
  expect(() => planXlsxRangeRules(request, ruleReaders(request))).toThrow(/预算|512/)
})
it.each([
  '<colorScale><cfvo type="min"/><color rgb="FF112233"/></colorScale>',
  '<dataBar><cfvo type="min"/><cfvo type="max"/></dataBar>',
  '<dataBar minLength="101"><cfvo type="min"/><cfvo type="max"/><color rgb="FF112233"/></dataBar>',
  '<iconSet iconSet="unknown"><cfvo type="min"/></iconSet>',
  '<colorScale><cfvo type="percent" val="101"/><cfvo type="max"/><color rgb="FF112233"/><color theme="4"/></colorScale>',
  '<colorScale><cfvo type="min"/><cfvo type="max"/><color rgb="not-a-color"/><color theme="4"/></colorScale>',
])('refuses malformed scalar conditional format metadata without publishing: %s', (child) => {
  const type = /^<([^\s>]+)/.exec(child)![1]!
  const request = ruleRequest(
    `<conditionalFormatting sqref="A1:C3"><cfRule type="${type}" priority="1">${child}</cfRule></conditionalFormatting>`,
    '',
    false,
    true,
  )
  expect(() => planXlsxRangeRules(request, ruleReaders(request))).toThrow(
    /格式|阈值|颜色|数据条|图标|cfvo/,
  )
})
