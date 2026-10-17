import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { expect, it, vi } from 'vitest'
import { createXlsxAgentHandle } from '../../../../packages/office/src/agent/xlsx-agent.js'
import { openXlsxForEdit } from '../../../../packages/office/src/xlsx-edit.js'
import { applyXlsxOpsOnHost } from '../services/xlsx-agent-host.js'
import {
  parseRange,
  formatAddress,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import {
  readXlsxRangeXmlTree,
  readXlsxFormulaCharacterData,
} from '../../../../packages/office/src/xlsx-native-xml.js'
import { planXlsxRangeRules } from '../services/xlsx-range-rules.js'
import { MAIN, cf, dv, ruleReaders, ruleRequest } from './xlsx-range-rules.test-helper.js'

interface Point {
  row: number
  column: number
}
interface Ref extends Point {
  sheet: string
  rowAbsolute: boolean
  columnAbsolute: boolean
}
const inside = (point: Point, bounds: ReturnType<typeof parseRange>) =>
  point.row >= bounds.startRow &&
  point.row <= bounds.endRow &&
  point.column >= bounds.startColumn &&
  point.column <= bounds.endColumn
function cells(range: string): Point[] {
  return range.split(/\s+/).flatMap((part) => {
    const bounds = parseRange(part),
      output: Point[] = []
    for (let row = bounds.startRow; row <= bounds.endRow; row++)
      for (let column = bounds.startColumn; column <= bounds.endColumn; column++)
        output.push({ row, column })
    return output
  })
}
function resolve(formula: string, context: string, current: Point, anchor: Point): Ref {
  const match = /^(?:'([^']+)'!)?(\$?)([A-Z]+)(\$?)([1-9]\d*)$/.exec(formula)!
  const column = [...match[3]!].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0) - 1
  return {
    sheet: match[1] ?? context,
    row: Number(match[5]) - 1 + (match[4] ? 0 : current.row - anchor.row),
    column: column + (match[2] ? 0 : current.column - anchor.column),
    rowAbsolute: !!match[4],
    columnAbsolute: !!match[2],
  }
}
const key = (sheet: string, p: Point) => `${sheet}!${formatAddress(p.row, p.column)}`

for (const move of [false, true])
  for (const cross of [false, true])
    it(`independent per-cell reference oracle for overlapping and split native CF: move=${move}, cross=${cross}`, () => {
      for (const domain of ['A1:D4', 'J10:L14', 'C3 A1:B2'])
        for (const formula of domain.startsWith('C3')
          ? ['E5', '$E5', 'E$5', '$E$5']
          : ['E5', '$E5', 'E$5', '$E$5', 'A1', '$A1', 'A$1', '$A$1']) {
          const request = ruleRequest(cf(domain, formula), '', move, cross)
          if (!cross) request.target.bounds = parseRange('B2:D4')
          const sourceName = '数据',
            targetName = cross ? '目标' : sourceName
          const dr = request.target.bounds.startRow - request.source.bounds.startRow,
            dc = request.target.bounds.startColumn - request.source.bounds.startColumn
          const applied = cells(domain),
            anchor = applied[0]!,
            expected = new Map<string, Ref>()
          const movedReference = (ref: Ref): Ref =>
            move && ref.sheet === sourceName && inside(ref, request.source.bounds)
              ? { ...ref, sheet: targetName, row: ref.row + dr, column: ref.column + dc }
              : ref
          for (const point of applied) {
            if (
              (move && inside(point, request.source.bounds)) ||
              (!cross && inside(point, request.target.bounds))
            )
              continue
            expected.set(
              key(sourceName, point),
              movedReference(resolve(formula, sourceName, point, anchor)),
            )
          }
          for (const point of applied.filter((p) => inside(p, request.source.bounds))) {
            const destination = { row: point.row + dr, column: point.column + dc }
            const ref = resolve(formula, sourceName, point, anchor)
            expected.set(
              key(targetName, destination),
              move
                ? movedReference(ref)
                : {
                    ...ref,
                    sheet: targetName,
                    row: ref.row + (ref.rowAbsolute ? 0 : dr),
                    column: ref.column + (ref.columnAbsolute ? 0 : dc),
                  },
            )
          }
          const plan = planXlsxRangeRules(request, ruleReaders(request)),
            actual = new Map<string, Ref>()
          for (const sheet of request.sheets) {
            const xml = plan.replacements.get(sheet.entry) ?? sheet.xml
            for (const group of readXlsxRangeXmlTree(xml).children.filter(
              (node) => node.local === 'conditionalFormatting',
            )) {
              const positions = cells(group.attrs.get('sqref')!),
                rule = group.children[0]!,
                f = rule.children[0]!
              const value = readXlsxFormulaCharacterData(xml.slice(f.openEnd, f.closeStart))
              for (const point of positions) {
                const id = key(sheet.name, point)
                expect(actual.has(id), `duplicate rule ${id}: ${domain} ${formula}`).toBe(false)
                actual.set(id, resolve(value, sheet.name, point, positions[0]!))
              }
            }
          }
          expect(actual, `${domain} ${formula}`).toEqual(expected)
        }
    })

vi.mock('../services/documents.js', () => ({
  getDocument: async () => ({
    id: 'xlsx-1',
    kind: 'file',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileExtension: 'xlsx',
  }),
}))
async function nativeFixture(valid: boolean) {
  const zip = await JSZip.loadAsync(
    readFileSync(
      new URL(
        '../../../../packages/office/vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
        import.meta.url,
      ),
    ),
  )
  const original = await zip.file('xl/workbook.xml')!.async('string')
  zip.file(
    'xl/workbook.xml',
    original.replace(
      '</sheets>',
      '<sheet name="目标" sheetId="2" r:id="independent-target"/></sheets>',
    ),
  )
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string')
  zip.file(
    'xl/_rels/workbook.xml.rels',
    rels.replace(
      '</Relationships>',
      '<Relationship Id="independent-target" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    ),
  )
  const types = await zip.file('[Content_Types].xml')!.async('string')
  zip.file(
    '[Content_Types].xml',
    types.replace(
      '</Types>',
      '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ),
  )
  const rules = cf('A1:B2') + dv('A1:B2', valid ? '0' : '99', 'showErrorMessage="1"')
  const native = `<mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>${rules}<hyperlinks><hyperlink ref="A2" location="'数据'!A1"/></hyperlinks>`
  const cellsXml =
    '<row r="1"><c r="A1"><v>5</v></c><c r="B1"><v>6</v></c></row><row r="2"><c r="A2"><v>7</v></c><c r="B2"><v>8</v></c></row>'
  for (const n of [1, 2])
    zip.file(
      `xl/worksheets/sheet${n}.xml`,
      `<worksheet xmlns="${MAIN}"><sheetData>${n === 1 ? cellsXml : ''}</sheetData>${n === 1 ? native : ''}</worksheet>`,
    )
  return zip.generateAsync({ type: 'uint8array' })
}
const operation = (move: boolean) => ({
  op: move ? 'move_range' : 'copy_range',
  sheetId: 'sheet-2',
  sourceSheetId: 'sheet-1',
  source: 'A1:B2',
  target: 'E5',
})
for (const move of [false, true])
  it(`independent real candidate DV failure publishes no merge, links, rule, bytes or history: move=${move}`, async () => {
    const bytes = await nativeFixture(false),
      changed = vi.fn<() => void>()
    const handle = createXlsxAgentHandle(
      'xlsx-1',
      bytes,
      await openXlsxForEdit(bytes),
      () => null,
      changed,
      applyXlsxOpsOnHost,
    )
    try {
      await expect(
        handle.execute('propose_operations', { operations: [operation(move)] }, {}),
      ).rejects.toThrow(/验证|规则|不符/)
      expect(handle.currentBytes()).toEqual(bytes)
      expect(handle.getVersion()).toBe(0)
      expect(handle.history()).toEqual({ undo: 0, redo: 0 })
      expect(handle.isDirty()).toBe(false)
      expect(changed).not.toHaveBeenCalled()
    } finally {
      handle.dispose()
    }
  })
for (const move of [false, true])
  it(`independent real completed rule candidate is discarded after cancellation: move=${move}`, async () => {
    const bytes = await nativeFixture(true),
      changed = vi.fn<() => void>()
    let release!: () => void, signalReady!: () => void
    const ready = new Promise<void>((complete) => {
      signalReady = complete
    })
    const gate = new Promise<void>((complete) => {
      release = complete
    })
    const host: typeof applyXlsxOpsOnHost = async (request) => {
      const result = await applyXlsxOpsOnHost(request)
      const xml = await (
        await JSZip.loadAsync(result.bytes)
      )
        .file('xl/worksheets/sheet2.xml')!
        .async('string')
      expect(xml).toContain('sqref="E5:F6"')
      signalReady()
      await gate
      return result
    }
    const handle = createXlsxAgentHandle(
      'xlsx-1',
      bytes,
      await openXlsxForEdit(bytes),
      () => null,
      changed,
      host,
    )
    const controller = new AbortController()
    const pending = handle.execute(
      'propose_operations',
      { operations: [operation(move)] },
      { signal: controller.signal },
    )
    await ready
    controller.abort()
    release()
    try {
      await expect(pending).rejects.toThrow(/取消/)
      expect(handle.currentBytes()).toEqual(bytes)
      expect(handle.getVersion()).toBe(0)
      expect(handle.history()).toEqual({ undo: 0, redo: 0 })
      expect(handle.isDirty()).toBe(false)
      expect(changed).not.toHaveBeenCalled()
    } finally {
      handle.dispose()
    }
  })
