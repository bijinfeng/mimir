import type { XlsxManualOperation } from '@mimir/shared'
import {
  xlsxFillOperation,
  xlsxFlashFillRange,
  xlsxFormatPaintRange,
} from '../../../../packages/office/src/xlsx-manual.js'
import { readXlsx, type XlsxSheet } from '../../../../packages/office/src/xlsx.js'
import { decodeXlsxXml } from '../../../../packages/office/src/xlsx-format.js'
import { xlsxAttribute as attr } from '../../../../packages/office/src/xlsx-sheet-features.js'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import {
  parseRange,
  parseAddress,
  formatAddress,
  rangeCellCount,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import {
  applyCellEditsToXlsx,
  createBufferEntrySource,
  planCellEditsToXlsx,
  assembleWithJsZip,
  assertOnlyTouchedEntriesChanged,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-gateway.js'
import {
  applyStructuralOps,
  FORMULA_REFERENCE_PATTERN,
  translateSharedFormula,
  type StructuralOp,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-structure.js'
import {
  cellMap,
  replaceCells,
  assertOrdinaryFormulas,
  assertCopyFeatures,
} from './xlsx-agent-range.js'
import type { XlsxHostResult } from './xlsx-agent-host.js'

type Area = ReturnType<typeof parseRange>
const escape = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const inside = (a: Area, row: number, column: number) =>
  row >= a.startRow && row <= a.endRow && column >= a.startColumn && column <= a.endColumn
const intersects = (a: Area, b: Area) =>
  a.startRow <= b.endRow &&
  b.startRow <= a.endRow &&
  a.startColumn <= b.endColumn &&
  b.startColumn <= a.endColumn
const bounds = (s: string) => {
  const area = parseRange(s)
  if (area.endRow >= 1048576 || area.endColumn >= 16384 || rangeCellCount(area) > 2000)
    throw new Error('范围超出2000格或工作表边界')
  return area
}
const positions = (a: Area) =>
  Array.from({ length: rangeCellCount(a) }, (_, n) => {
    const width = a.endColumn - a.startColumn + 1
    return { row: a.startRow + Math.floor(n / width), column: a.startColumn + (n % width) }
  })
const attribute = (xml: string, key: string, value: string) =>
  xml
    .replace(new RegExp(`\\s${key}="[^"]*"`), '')
    .replace(/\/?>(?![\s\S])/, (end) => ` ${key}="${value}"${end}`)

/** Move references, including absolute references, rather than translating formulas as copy does. */
export function moveXlsxFormula(
  formula: string,
  context: string,
  sourceSheet: string,
  targetSheet: string,
  source: Area,
  rowDelta: number,
  colDelta: number,
): string {
  const reference =
    /(^|[^\p{L}\p{N}_.\]!:])(?:(('(?:[^']|'')+'|[\p{L}_][\p{L}\p{N}_.]*)!)?)(\$?[A-Z]{1,3}\$?[1-9][0-9]*(?::\$?[A-Z]{1,3}\$?[1-9][0-9]*)?)(?![\p{L}\p{N}_(])/giu
  return formula
    .split('"')
    .map((segment, index) =>
      index % 2
        ? segment
        : segment.replace(
            reference,
            (
              full,
              lead: string,
              qualified: string | undefined,
              qualifier: string | undefined,
              token: string,
            ) => {
              const sheet = qualifier
                ? qualifier.startsWith("'")
                  ? qualifier.slice(1, -1).replaceAll("''", "'")
                  : qualifier
                : context
              if (sheet.toLocaleLowerCase() !== sourceSheet.toLocaleLowerCase()) return full
              const area = parseRange(token.replaceAll('$', '').toUpperCase())
              if (!intersects(area, source)) return full
              if (
                !inside(source, area.startRow, area.startColumn) ||
                !inside(source, area.endRow, area.endColumn)
              )
                throw new Error(
                  `引用 ${token} 与剪切范围部分相交，尚不能拆分此范围引用；文档未修改`,
                )
              const moved = token
                .toUpperCase()
                .split(':')
                .map((part) => {
                  const m = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(part)!
                  const p = parseAddress(part.replaceAll('$', ''))
                  const address = formatAddress(p.row + rowDelta, p.column + colDelta)
                  return address.replace(
                    /^([A-Z]+)(\d+)$/,
                    (_match, letters: string, digits: string) =>
                      `${m[1]}${letters}${m[3]}${digits}`,
                  )
                })
                .join(':')
              const prefix =
                targetSheet === context && !qualified
                  ? ''
                  : `'${targetSheet.replaceAll("'", "''")}'!`
              return lead + prefix + moved
            },
          ),
    )
    .join('"')
}

/** Preserve references outside the moved rectangle when a formula crosses sheets. */
function qualifyMovedFormula(formula: string, sourceSheet: string): string {
  const reference =
    /(^|[^\p{L}\p{N}_.\]!:])(?:((?:'(?:[^']|'')+'|[\p{L}_][\p{L}\p{N}_.]*)!))?(\$?[A-Z]{1,3}\$?[1-9][0-9]*(?::\$?[A-Z]{1,3}\$?[1-9][0-9]*)?)(?![\p{L}\p{N}_(])/giu
  return formula
    .split('"')
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(
            reference,
            (full, lead: string, qualifier: string | undefined, token: string) =>
              qualifier ? full : `${lead}'${sourceSheet.replaceAll("'", "''")}'!${token}`,
          ),
    )
    .join('"')
}

/** A CF formula is relative to the first sqref cell, even for disjoint ranges. */
function translateConditionalFormula(formula: string, rowDelta: number, colDelta: number): string {
  if (!rowDelta && !colDelta) return formula
  const reference = new RegExp(FORMULA_REFERENCE_PATTERN.source, 'giu')
  return formula
    .split('"')
    .map((segment, index) =>
      index % 2
        ? segment
        : segment.replace(
            reference,
            (_full, lead: string, qualifier: string | undefined, token: string) => {
              const moved = translateSharedFormula(token.toUpperCase(), rowDelta, colDelta)
              if (moved === null) throw new Error('条件格式相对引用超出工作表边界，文档未修改')
              return `${lead}${qualifier === undefined ? '' : `${qualifier}!`}${moved}`
            },
          ),
    )
    .join('"')
}

export async function applyXlsxManualOperation(
  bytes: Uint8Array,
  op: XlsxManualOperation,
  version: number,
): Promise<XlsxHostResult> {
  const zip = await BoundedZip.open(bytes),
    view = await readXlsx(bytes)
  const sheet = view.sheets.find((s) => s.id === op.sheetId)
  if (!sheet) throw new Error('工作表ID已失效')
  if (sheet.extras?.protected) throw new Error('工作表已保护，请先取消保护')
  const xml = (await zip.readText(sheet.entry))!
  const edits = new Map<string, string>(),
    changedCells: string[] = []
  let updated = xml
  if (op.op === 'flash_fill') {
    const area = bounds(xlsxFlashFillRange(sheet, op.range))
    const plan = xlsxFillOperation(sheet, op.range, 'flash') as {
      values: (string | number | boolean)[][]
    }
    const cells = cellMap(xml)
    for (const { row, column } of positions(area)) {
      const original = sheet.rows.find((r) => r.number === row + 1)?.cells[column]
      if (
        original?.text ||
        original?.formula ||
        original?.numeric ||
        original?.boolean !== undefined
      )
        continue
      const text = String(plan.values[row - area.startRow]![0] ?? '')
      if (text.length > 32767) throw new Error('快速填充结果超过单元格32767字符上限')
      const address = formatAddress(row, column),
        style = attr(cells.get(address) ?? '', 's')
      edits.set(
        address,
        `<c r="${address}"${style === undefined ? '' : ` s="${style}"`} t="inlineStr"><is><t xml:space="preserve">${escape(text)}</t></is></c>`,
      )
      changedCells.push(`${sheet.id}:${address}`)
    }
    return assemble(
      bytes,
      new Map([[sheet.entry, replaceCells(xml, edits)]]),
      changedCells,
      version,
    )
  }
  if (op.op === 'auto_size') {
    const operations: StructuralOp[] = op.sizes.map((size) => {
      if (size.index >= (op.axis === 'rows' ? 1048576 : 16384))
        throw new Error('尺寸索引超出工作表边界')
      return {
        kind: op.axis === 'rows' ? 'set-row-size' : 'set-col-size',
        start: size.index,
        end: size.index,
        size:
          op.axis === 'rows'
            ? Math.min(409.5, size.pixels * 0.75)
            : Math.min(255, Math.max(0, (size.pixels - 5) / 7)),
      }
    })
    const result = await applyCellEditsToXlsx(
      Buffer.from(bytes),
      [],
      [{ sheetName: sheet.name, ops: operations }],
    )
    assertOnlyTouchedEntriesChanged(result)
    return {
      bytes: new Uint8Array(result.buffer),
      version: version + 1,
      touchedEntries: [...result.touchedEntries],
      changedCells,
    }
  }
  if (op.op === 'set_outline') {
    const area = bounds(op.range),
      rows = op.axis === 'rows'
    const start = rows ? area.startRow : area.startColumn,
      end = rows ? area.endRow : area.endColumn
    const elements = [...xml.matchAll(rows ? /<row\b[^>]*>/g : /<col\b[^>]*>/g)].map(([tag]) => ({
      start: Number(attr(tag, rows ? 'r' : 'min')) - 1,
      end: Number(attr(tag, rows ? 'r' : 'max')) - 1,
      level: Number(attr(tag, 'outlineLevel') ?? 0),
    }))
    const operations: StructuralOp[] = []
    for (let i = start; i <= end; i++) {
      const level = elements.find((e) => i >= e.start && i <= e.end)?.level ?? 0
      if (op.action === 'group' && level >= 7) throw new Error('分级最多7层')
      if ((op.action === 'collapse' || op.action === 'expand') && level === 0)
        throw new Error('先对所选行列创建分组')
      operations.push(
        op.action === 'group' || op.action === 'ungroup'
          ? {
              kind: rows ? 'set-rows-outline' : 'set-cols-outline',
              start: i,
              end: i,
              level: op.action === 'group' ? level + 1 : Math.max(0, level - 1),
              collapsed: false,
            }
          : {
              kind: rows ? 'set-rows-hidden' : 'set-cols-hidden',
              start: i,
              end: i,
              hidden: op.action === 'collapse',
            },
      )
      if (op.action === 'ungroup')
        operations.push({
          kind: rows ? 'set-rows-hidden' : 'set-cols-hidden',
          start: i,
          end: i,
          hidden: false,
        })
    }
    const summary = end + 1
    if (summary < (rows ? 1048576 : 16384))
      operations.push({
        kind: rows ? 'set-rows-outline' : 'set-cols-outline',
        start: summary,
        end: summary,
        level: elements.find((e) => summary >= e.start && summary <= e.end)?.level ?? 0,
        collapsed: op.action === 'collapse',
      })
    updated = applyStructuralOps(xml, operations, sheet.name)
  } else if (op.op === 'copy_format' || op.op === 'clear_format') {
    const area = bounds(
        op.op === 'copy_format' ? xlsxFormatPaintRange(op.source, op.range) : op.range,
      ),
      cells = cellMap(xml)
    const sourceSheet =
      op.op === 'copy_format' ? view.sheets.find((s) => s.id === op.sourceSheetId) : sheet
    if (!sourceSheet) throw new Error('格式源工作表已失效')
    const sourceXml = (await zip.readText(sourceSheet.entry))!,
      sourceCells = cellMap(sourceXml)
    const source = op.op === 'copy_format' ? bounds(op.source) : area
    if (op.op === 'copy_format') {
      const intersectsMerge = (sheetXml: string, selection: Area) =>
        [...sheetXml.matchAll(/<mergeCell\b[^>]*>/g)].some(([tag]) => {
          const ref = attr(tag, 'ref')
          return !!ref && intersects(parseRange(ref), selection)
        })
      if (intersectsMerge(xml, area) || intersectsMerge(sourceXml, source))
        throw new Error('格式刷暂不支持相交的合并单元格，文档未修改')
    }
    const shared = [
      ...((await zip.readText('xl/sharedStrings.xml')) ?? '').matchAll(
        /<si\b[^>]*>([\s\S]*?)<\/si>/g,
      ),
    ].map((m) => m[1]!)
    const styleAt = (row: number, column: number) => {
      const explicit = attr(sourceCells.get(formatAddress(row, column)) ?? '', 's')
      if (explicit !== undefined) return explicit
      const rowTag =
        [...sourceXml.matchAll(/<row\b[^>]*>/g)].find(
          ([tag]) => Number(attr(tag, 'r')) === row + 1,
        )?.[0] ?? ''
      if (attr(rowTag, 's') !== undefined) return attr(rowTag, 's')!
      const col =
        [...sourceXml.matchAll(/<col\b[^>]*>/g)].find(
          ([tag]) =>
            column + 1 >= Number(attr(tag, 'min')) && column + 1 <= Number(attr(tag, 'max')),
        )?.[0] ?? ''
      return attr(col, 'style') ?? '0'
    }
    for (const { row, column } of positions(area)) {
      const address = formatAddress(row, column),
        raw = cells.get(address) ?? `<c r="${address}"/>`
      const style =
        op.op === 'clear_format'
          ? '0'
          : styleAt(
              source.startRow + ((row - area.startRow) % (source.endRow - source.startRow + 1)),
              source.startColumn +
                ((column - area.startColumn) % (source.endColumn - source.startColumn + 1)),
            )
      let cell = raw.replace(/^<c\b[^>]*>/, (tag) => attribute(tag, 's', style))
      // Rich-run overrides would otherwise keep their old character formatting.
      if (attr(raw, 't') === 's') {
        const index = Number(/<v>(\d+)<\/v>/.exec(raw)?.[1]),
          body = shared[index]
        if (body === undefined) throw new Error('共享字符串索引无效')
        cell = cell.replace(/\bt="s"/, 't="inlineStr"').replace(/<v>\d+<\/v>/, `<is>${body}</is>`)
      }
      cell = cell.replace(/<rPr\b[^>]*\/>|<rPr\b[^>]*>[\s\S]*?<\/rPr>/g, '')
      edits.set(address, cell)
      changedCells.push(`${sheet.id}:${address}`)
    }
    updated = replaceCells(xml, edits)
    if (op.op === 'clear_format') {
      // Keep conditional rules for the portion outside the selection.
      updated = updated.replace(
        /<conditionalFormatting\b([^>]*)>[\s\S]*?<\/conditionalFormatting>/g,
        (full, attrs: string) => {
          const original = (attr(attrs, 'sqref') ?? '').split(/\s+/).filter(Boolean)
          const ranges = original.flatMap((ref) => subtractRange(parseRange(ref), area))
          if (!ranges.length) return ''
          const before = parseRange(original[0]!),
            after = parseRange(ranges[0]!),
            dr = after.startRow - before.startRow,
            dc = after.startColumn - before.startColumn
          return full
            .replace(/\bsqref="[^"]*"/, `sqref="${ranges.join(' ')}"`)
            .replace(/(<formula\b[^>]*>)([\s\S]*?)(<\/formula>)/g, (_match, open, body, close) =>
              dr || dc
                ? open + escape(translateConditionalFormula(decodeXlsxXml(body), dr, dc)) + close
                : _match,
            )
        },
      )
      if (/<\w+:conditionalFormatting\b/.test(updated))
        throw new Error('扩展条件格式尚不能保真局部清除')
    }
  } else {
    const sourceSheet = view.sheets.find((s) => s.id === op.sourceSheetId)
    if (!sourceSheet) throw new Error('剪切源工作表已失效')
    if (sourceSheet.extras?.protected) throw new Error('剪切源工作表已保护')
    const source = bounds(op.source),
      targetPoint = parseAddress(op.target)
    const dr = targetPoint.row - source.startRow,
      dc = targetPoint.column - source.startColumn
    const target = bounds(
      `${op.target}:${formatAddress(source.endRow + dr, source.endColumn + dc)}`,
    )
    if (sheet.id === sourceSheet.id && dr === 0 && dc === 0) throw new Error('目标与剪切源相同')
    const sourceXml = (await zip.readText(sourceSheet.entry))!,
      sourceCells = cellMap(sourceXml)
    const checkParts = (candidateSheet: XlsxSheet, area: Area) => {
      if (
        candidateSheet.tables?.some((table) => intersects(parseRange(table.range), area)) ||
        candidateSheet.pivots?.some((pivot) =>
          intersects(parseRange(pivot.definition.outputRef), area),
        )
      )
        throw new Error('剪切范围与结构化表或透视输出相交，尚不支持此结构移动')
      if (
        candidateSheet.extras?.sparklines?.some((spark) => {
          const p = parseAddress(spark.cell)
          return inside(area, p.row, p.column)
        })
      )
        throw new Error('剪切迷你图目标尚不支持关联移动')
      if (
        Object.keys(candidateSheet.extras?.notes ?? {}).some((address) => {
          const p = parseAddress(address)
          return inside(area, p.row, p.column)
        })
      )
        throw new Error('剪切批注单元格尚未接入，请先移除批注')
    }
    checkParts(sourceSheet, source)
    checkParts(sheet, target)
    assertCopyFeatures(sourceXml, source, true)
    assertCopyFeatures(xml, target, true)
    assertOrdinaryFormulas(sourceXml)
    assertOrdinaryFormulas(xml)
    const sourceWrites = new Map<string, string>()
    for (const { row, column } of positions(source))
      sourceWrites.set(formatAddress(row, column), '')
    for (const { row, column } of positions(source)) {
      const from = formatAddress(row, column),
        to = formatAddress(row + dr, column + dc)
      let raw = sourceCells.get(from) ?? ''
      if (raw) {
        raw = raw.replace(/\br="[^"]*"/, `r="${to}"`)
        if (sourceSheet.id !== sheet.id)
          raw = raw.replace(
            /(<f\b[^>]*>)([\s\S]*?)(<\/f>)/g,
            (_a, open: string, body: string, close: string) =>
              open + escape(qualifyMovedFormula(decodeXlsxXml(body), sourceSheet.name)) + close,
          )
      }
      edits.set(to, raw)
      changedCells.push(`${sheet.id}:${to}`, `${sourceSheet.id}:${from}`)
    }
    if (sourceSheet.id === sheet.id) {
      for (const entry of edits) sourceWrites.set(...entry)
      updated = replaceCells(xml, sourceWrites)
    } else {
      updated = replaceCells(xml, edits)
      edits.clear()
      edits.set(sourceSheet.entry, replaceCells(sourceXml, sourceWrites))
    }
    const replacements = new Map<string, string>([[sheet.entry, updated]])
    if (sourceSheet.id !== sheet.id)
      replacements.set(sourceSheet.entry, edits.get(sourceSheet.entry)!)
    for (const s of view.sheets) {
      const text = replacements.get(s.entry) ?? (await zip.readText(s.entry))!
      const rewritten = text.replace(
        /(<(?:f|formula|formula1|formula2)\b[^>]*>)([\s\S]*?)(<\/(?:f|formula|formula1|formula2)>)/g,
        (_a, open: string, body: string, close: string) =>
          open +
          escape(
            moveXlsxFormula(
              decodeXlsxXml(body),
              s.name,
              sourceSheet.name,
              sheet.name,
              source,
              dr,
              dc,
            ),
          ) +
          close,
      )
      if (rewritten !== text && s.extras?.protected) throw new Error('引用剪切范围的工作表已保护')
      if (rewritten !== text) {
        assertOrdinaryFormulas(text)
        replacements.set(s.entry, rewritten)
      }
    }
    for (const path of zip
      .list()
      .filter((p) => p === 'xl/workbook.xml' || /^xl\/charts\/.*\.xml$/.test(p))) {
      const original = (await zip.readText(path))!
      const rewritten = original.replace(
        /(<(?:definedName|c:f|f)\b[^>]*>)([\s\S]*?)(<\/(?:definedName|c:f|f)>)/g,
        (_a, open: string, body: string, close: string) => {
          const local = attr(open, 'localSheetId'),
            context = local === undefined ? '' : (view.sheets[Number(local)]?.name ?? '')
          return (
            open +
            escape(
              moveXlsxFormula(
                decodeXlsxXml(body),
                context,
                sourceSheet.name,
                sheet.name,
                source,
                dr,
                dc,
              ),
            ) +
            close
          )
        },
      )
      if (rewritten !== original) replacements.set(path, rewritten)
    }
    return assemble(bytes, replacements, changedCells, version)
  }
  return assemble(bytes, new Map([[sheet.entry, updated]]), changedCells, version)
}

const areaRef = (r1: number, c1: number, r2: number, c2: number) =>
  `${formatAddress(r1, c1)}:${formatAddress(r2, c2)}`
function subtractRange(a: Area, cut: Area): string[] {
  if (!intersects(a, cut)) return [areaRef(a.startRow, a.startColumn, a.endRow, a.endColumn)]
  const r1 = Math.max(a.startRow, cut.startRow),
    r2 = Math.min(a.endRow, cut.endRow),
    c1 = Math.max(a.startColumn, cut.startColumn),
    c2 = Math.min(a.endColumn, cut.endColumn)
  return [
    a.startRow < r1 ? areaRef(a.startRow, a.startColumn, r1 - 1, a.endColumn) : '',
    r2 < a.endRow ? areaRef(r2 + 1, a.startColumn, a.endRow, a.endColumn) : '',
    a.startColumn < c1 ? areaRef(r1, a.startColumn, r2, c1 - 1) : '',
    c2 < a.endColumn ? areaRef(r1, c2 + 1, r2, a.endColumn) : '',
  ].filter(Boolean)
}
async function assemble(
  bytes: Uint8Array,
  replacements: Map<string, string>,
  changedCells: string[],
  version: number,
): Promise<XlsxHostResult> {
  const first = await assembleWithJsZip(Buffer.from(bytes), {
    replaced: replacements,
    added: new Map(),
    addedBinary: new Map(),
    removedEntries: [],
    addedEntries: [],
    touchedEntries: [...replacements.keys()],
  })
  // The gateway invalidates calcChain for worksheet edits and requests recalc;
  // planning through the patched source preserves that package invariant.
  const patched = await createBufferEntrySource(first.buffer)
  const view = await readXlsx(new Uint8Array(first.buffer))
  const plan = await planCellEditsToXlsx(
    patched,
    [],
    [{ sheetName: view.sheets[0]!.name, ops: [] }],
  )
  const replaced = new Map(replacements)
  for (const [path, content] of plan.replaced) replaced.set(path, content)
  const result = await assembleWithJsZip(Buffer.from(bytes), {
    ...plan,
    replaced,
    touchedEntries: [...new Set([...replacements.keys(), ...plan.touchedEntries])],
  })
  assertOnlyTouchedEntriesChanged(result)
  return {
    bytes: new Uint8Array(result.buffer),
    version: version + 1,
    changedCells,
    touchedEntries: [...result.touchedEntries],
  }
}
