import JSZip from 'jszip'
import {
  createBufferEntrySource,
  planCellEditsToXlsx,
  assembleWithJsZip,
  assertOnlyTouchedEntriesChanged,
  type SheetVisualAddition,
  type SheetTableAddition,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-gateway.js'
import { buildChartVisual } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/chart-visual.js'
import {
  expandToPrimitiveOps,
  type WorkbookOperation,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/workbook-dsl.js'
import {
  parseAddress,
  parseRange,
  rangeCellCount,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import {
  workbookChartEditSchema,
  type WorkbookChartEdit,
  type WorkbookVisualEdit,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/shared/edit-schemas.js'
import { readXlsx } from '../../../../packages/office/src/xlsx.js'
import { XLSX_ANCHOR_PATTERN, xlsxRelsPath } from '../../../../packages/office/src/xlsx-visuals.js'
import { decodePdfImage } from './pdf-image-codec.js'
import { fetchDocxImage } from './docx-image-fetch.js'
import type { XlsxHostResult } from './xlsx-agent-host.js'
export const XLSX_OBJECT_OPS = new Set([
  'add_chart',
  'edit_chart',
  'add_shape',
  'edit_shape',
  'add_image',
  'delete_visual',
  'add_table',
  'delete_table',
])
function escaped(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
function checked(value: string) {
  const b = parseRange(value)
  if (b.endRow >= 1048576 || b.endColumn >= 16384 || rangeCellCount(b) > 2000)
    throw new Error('范围超出边界或2000格上限')
  return b
}
export async function applyXlsxObjectOperation(
  bytes: Uint8Array,
  op: WorkbookOperation,
  expectedVersion: number,
  upload?: { bytes: Uint8Array; mimeType: string },
): Promise<XlsxHostResult> {
  expandToPrimitiveOps([op])
  const workbook = await readXlsx(bytes),
    sheet = 'sheetId' in op ? workbook.sheets.find((s) => s.id === op.sheetId) : undefined
  if ('sheetId' in op && !sheet) throw new Error('工作表ID已失效')
  if (sheet?.extras?.protected) throw new Error('工作表已保护，请先取消保护')
  const assertEditable = (visual: { id: string }) => {
    if (workbook.sheets.find((s) => s.visuals?.some((v) => v.id === visual.id))?.extras?.protected)
      throw new Error('工作表已保护，请先取消保护')
  }
  const additions: SheetVisualAddition[] = [],
    tables: SheetTableAddition[] = [],
    chartEdits: WorkbookChartEdit[] = [],
    visualEdits: WorkbookVisualEdit[] = []
  const changes = new Map<string, string>(),
    removed: string[] = []
  const zip = await JSZip.loadAsync(bytes)
  const text = async (path: string) => (await zip.file(path)?.async('string')) ?? ''
  const valueAt = (r: number, c: number) => {
    const cell = sheet?.rows.find((row) => row.number === r + 1)?.cells[c]
    if (cell?.formula && cell.formulaCache !== 'cached')
      throw new Error('数据公式缺少缓存，请先重新计算')
    return cell?.numeric
      ? Number(cell.rawText ?? cell.text)
      : cell?.boolean !== undefined
        ? cell.boolean
        : (cell?.text ?? null)
  }
  if (op.op === 'add_chart') {
    const b = checked(op.dataRange),
      values = Array.from({ length: b.endRow - b.startRow + 1 }, (_row, r) =>
        Array.from({ length: b.endColumn - b.startColumn + 1 }, (_, c) =>
          valueAt(b.startRow + r, b.startColumn + c),
        ),
      )
    const visual = buildChartVisual({ id: 'new-chart', sheetName: sheet!.name, ...op, values })
    if (visual.anchor.toColumn >= 16384 || visual.anchor.toRow >= 1048576)
      throw new Error('图表位置超出边界')
    additions.push({
      sheetName: sheet!.name,
      anchor: visual.anchor,
      chart: {
        title: visual.chart.title,
        chartType: op.chartType,
        dataLabels:
          visual.chart.dataLabels === 'category-value-percent'
            ? 'category-percent'
            : visual.chart.dataLabels,
        series: visual.chart.series.map((s) => ({
          name: s.name,
          categories: s.categories,
          values: s.values,
          valuesRef: s.valuesRef,
          categoriesRef: s.categoriesRef,
          color: s.color,
        })),
      },
    })
  } else if (op.op === 'add_shape' || op.op === 'add_image') {
    const p = parseAddress(op.anchorCell)
    checked(op.anchorCell)
    const anchor = {
      fromRow: p.row,
      fromColumn: p.column,
      fromRowOffset: 0,
      fromColumnOffset: 0,
      toRow: p.row + 8,
      toColumn: p.column + 4,
      toRowOffset: 0,
      toColumnOffset: 0,
    }
    if (anchor.toColumn >= 16384 || anchor.toRow >= 1048576) throw new Error('对象位置超出边界')
    if (op.op === 'add_shape')
      additions.push({
        sheetName: sheet!.name,
        anchor,
        shape: {
          shapeType: op.shapeType === 'textbox' ? 'rect' : op.shapeType,
          isTextBox: op.shapeType === 'textbox',
          text: op.text,
          fillColor: op.fillColor,
        },
      })
    else {
      // Local paths from model input are never opened by the server.
      if (op.path !== 'upload' && !/^https?:\/\//i.test(op.path))
        throw new Error('图片路径须为公开HTTP(S)地址；本地图片请使用上传入口')
      const image = op.path === 'upload' ? checkedUpload(upload) : await fetchDocxImage(op.path)
      if (!new Set(['image/png', 'image/jpeg', 'image/gif']).has(image.mimeType))
        throw new Error('只支持PNG/JPEG/GIF图片')
      additions.push({
        sheetName: sheet!.name,
        anchor,
        image: {
          mediaType: image.mimeType as 'image/png' | 'image/jpeg' | 'image/gif',
          base64: image.dataUrl.split(',')[1]!,
        },
      })
    }
  } else if (op.op === 'edit_chart') {
    const visual = workbook.sheets
      .flatMap((s) => s.visuals ?? [])
      .find((v) => v.chartPath === op.chartPath)
    if (!visual) throw new Error('图表已失效，请重新读取')
    assertEditable(visual)
    const edit = Object.assign({}, op)
    delete (edit as Partial<typeof op>).op
    const { seriesData } = op
    delete edit.seriesData
    if (seriesData) {
      const owning = workbook.sheets.find((s) => s.visuals?.includes(visual))!
      const series = seriesData.map((data) => {
        const source = workbook.sheets.find((s) => s.id === (data.sheetId ?? owning.id))
        if (!source) throw new Error('图表数据工作表已失效')
        const vector = (ref: string, numeric: boolean) => {
          const b = checked(ref)
          if (b.startRow !== b.endRow && b.startColumn !== b.endColumn)
            throw new Error('图表序列须为单行或单列')
          const cells = []
          for (let r = b.startRow; r <= b.endRow; r++)
            for (let c = b.startColumn; c <= b.endColumn; c++) {
              const cell = source.rows.find((x) => x.number === r + 1)?.cells[c]
              if (cell?.formula && cell.formulaCache !== 'cached')
                throw new Error('图表数据缺少公式缓存')
              if (numeric && !cell?.numeric) throw new Error('图表数值范围含非数字')
              cells.push(numeric ? Number(cell?.rawText ?? 0) : (cell?.text ?? ''))
            }
          return cells
        }
        const ref = (range: string) => `'${source.name.replaceAll("'", "''")}'!${range}`
        const result: Record<string, unknown> = { index: data.index, name: data.name }
        if (data.valuesRange)
          Object.assign(result, {
            valuesRef: ref(data.valuesRange),
            values: vector(data.valuesRange, true),
          })
        if (data.categoriesRange)
          Object.assign(result, {
            categoriesRef: ref(data.categoriesRange),
            categories: vector(data.categoriesRange, false),
          })
        return result
      })
      chartEdits.push(workbookChartEditSchema.parse({ ...edit, series }))
    } else chartEdits.push(workbookChartEditSchema.parse(edit))
  } else if (op.op === 'delete_visual' || op.op === 'edit_shape') {
    const visual = workbook.sheets
      .flatMap((s) => s.visuals ?? [])
      .find((v) => v.id === op.visualId || v.chartPath === op.visualId)
    if (!visual) throw new Error('对象已失效，请重新读取')
    assertEditable(visual)
    if (op.op === 'delete_visual')
      visualEdits.push({
        drawingPath: visual.drawingPath,
        drawingIndex: visual.drawingIndex,
        remove: true,
      })
    else {
      if (visual.kind !== 'shape') throw new Error('目标不是形状')
      let xml = await text(visual.drawingPath)
      const anchor = [...xml.matchAll(XLSX_ANCHOR_PATTERN)][visual.drawingIndex]
      if (!anchor) throw new Error('对象锚点已失效')
      let block = anchor[0]
      if (op.text !== undefined) {
        const body = /<(?:\w+:)?txBody\b[^>]*>[\s\S]*?<\/(?:\w+:)?txBody>/.exec(block)?.[0]
        if (!body) throw new Error('该形状不含可编辑文本框')
        let first = true
        let updated = body.replace(/<a:t\b[^>]*>[\s\S]*?<\/a:t>/g, () => {
          const value = first ? escaped(op.text!) : ''
          first = false
          return `<a:t xml:space="preserve">${value}</a:t>`
        })
        if (first)
          updated = body.replace(
            '</a:p>',
            `<a:r><a:t xml:space="preserve">${escaped(op.text)}</a:t></a:r></a:p>`,
          )
        if (updated === body && visual.text !== op.text) throw new Error('该文本框结构尚不支持编辑')
        block = block.replace(body, updated)
      }
      if (op.fillColor !== undefined) {
        const open = /<[^>]*:?spPr\b[^>]*>/.exec(block)?.[0]
        if (!open) throw new Error('形状属性缺失')
        block = block.replace(
          /(<(?:\w+:)?spPr\b[^>]*>)([\s\S]*?)(<\/(?:\w+:)?spPr>)/,
          (_, start: string, inner: string, end: string) =>
            start +
            withoutShapeFill(inner) +
            `<a:solidFill><a:srgbClr val="${op.fillColor!.slice(1)}"/></a:solidFill>` +
            end,
        )
      }
      xml = xml.slice(0, anchor.index) + block + xml.slice(anchor.index + anchor[0].length)
      changes.set(visual.drawingPath, xml)
      if (op.anchorCell) {
        const p = parseAddress(op.anchorCell)
        checked(op.anchorCell)
        const a = visual.anchor
        visualEdits.push({
          drawingPath: visual.drawingPath,
          drawingIndex: visual.drawingIndex,
          anchor: {
            ...a,
            fromRow: p.row,
            fromColumn: p.column,
            toRow: p.row + a.toRow - a.fromRow,
            toColumn: p.column + a.toColumn - a.fromColumn,
          },
        })
      }
    }
  } else if (op.op === 'add_table') {
    const b = checked(op.range)
    if (b.endRow === b.startRow) throw new Error('表格至少需要标题与一行数据')
    if (
      sheet!.tables?.some((t) => {
        const a = parseRange(t.range)
        return (
          a.startRow <= b.endRow &&
          a.endRow >= b.startRow &&
          a.startColumn <= b.endColumn &&
          a.endColumn >= b.startColumn
        )
      })
    )
      throw new Error('与现有结构化表重叠')
    if (
      sheet!.rows.some((row) =>
        row.cells.some((cell) => {
          if (!cell.mergeRef) return false
          const a = parseRange(cell.mergeRef)
          return (
            a.startRow <= b.endRow &&
            a.endRow >= b.startRow &&
            a.startColumn <= b.endColumn &&
            a.endColumn >= b.startColumn
          )
        }),
      )
    )
      throw new Error('结构化表不能包含合并单元格')
    const headers = Array.from({ length: b.endColumn - b.startColumn + 1 }, (_, c) =>
      String(valueAt(b.startRow, b.startColumn + c) ?? ''),
    )
    if (
      headers.some((h) => !h.trim()) ||
      new Set(headers.map((h) => h.toLowerCase())).size !== headers.length
    )
      throw new Error('表格标题必须非空且唯一')
    const names = new Set(
      workbook.sheets.flatMap((s) => s.tables ?? []).map((t) => t.name.toLowerCase()),
    )
    let i = 1
    while (names.has(`table${i}`)) i++
    const name = op.name ?? `Table${i}`
    if (names.has(name.toLowerCase())) throw new Error('表格名称已存在')
    tables.push({
      sheetName: sheet!.name,
      area: b,
      name,
      columnNames: headers,
      style: op.style,
      bandedRows: op.bandedRows ?? true,
    })
  } else if (op.op === 'delete_table') {
    const table = sheet!.tables?.find((t) => t.name.toLowerCase() === op.tableName.toLowerCase())
    if (!table) throw new Error('结构化表已失效')
    if (
      workbook.sheets.some((s) =>
        s.rows.some((r) =>
          r.cells.some((c) =>
            c.formulaText?.toLowerCase().includes(table.name.toLowerCase() + '['),
          ),
        ),
      )
    )
      throw new Error('仍有公式引用此表，请先修改公式')
    const sheetXml = await text(sheet!.entry),
      relPath = xlsxRelsPath(sheet!.entry)
    const escapedId = table.relationshipId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    let patched = sheetXml.replace(new RegExp(`<tablePart\\b[^>]*r:id="${escapedId}"[^>]*/>`), '')
    patched = patched.replace(
      /<tableParts\b([^>]*)>([\s\S]*?)<\/tableParts>/,
      (_, attrs: string, body: string) => {
        const count = [...body.matchAll(/<tablePart\b/g)].length
        return count
          ? `<tableParts${attrs.replace(/\bcount="\d+"/, `count="${count}"`)}>${body}</tableParts>`
          : ''
      },
    )
    changes.set(sheet!.entry, patched)
    changes.set(
      relPath,
      (await text(relPath)).replace(
        new RegExp(`<Relationship\\b(?=[^>]*\\bId="${escapedId}")[^>]*/>`),
        '',
      ),
    )
    changes.set(
      '[Content_Types].xml',
      (await text('[Content_Types].xml')).replace(
        new RegExp(`<Override\\b(?=[^>]*PartName="/${table.path.replaceAll('.', '\\.')}")[^>]*/>`),
        '',
      ),
    )
    removed.push(table.path)
  } else throw new Error('对象操作尚未接入')
  for (const [path, xml] of changes) zip.file(path, xml)
  for (const path of removed) zip.remove(path)
  const staged =
    changes.size || removed.length
      ? await zip.generateAsync({ type: 'nodebuffer' })
      : Buffer.from(bytes)
  const plan = await planCellEditsToXlsx(
    await createBufferEntrySource(staged),
    [],
    [],
    chartEdits,
    undefined,
    [],
    [],
    [],
    [],
    [],
    null,
    additions,
    [],
    [],
    tables,
    [],
    [],
    [],
    visualEdits,
  )
  const result = await assembleWithJsZip(staged, plan)
  assertOnlyTouchedEntriesChanged(result)
  const finalBytes = new Uint8Array(result.buffer)
  await readXlsx(finalBytes)
  return {
    bytes: finalBytes,
    version: expectedVersion + 1,
    changedCells: [],
    touchedEntries: [
      ...new Set([
        ...changes.keys(),
        ...removed,
        ...result.touchedEntries,
        ...result.removedEntries,
      ]),
    ],
  }
}

function withoutShapeFill(xml: string): string {
  let depth = 0,
    removedAt = -1,
    cursor = 0,
    result = ''
  for (const match of xml.matchAll(/<\/?[A-Za-z_][\w.:-]*\b[^>]*>/g)) {
    const tag = match[0],
      close = tag.startsWith('</'),
      self = tag.endsWith('/>')
    if (close) depth--
    if (
      !close &&
      depth === 0 &&
      /^<a:(?:solidFill|gradFill|pattFill|noFill|blipFill|grpFill)\b/.test(tag)
    )
      removedAt = match.index
    if (!close && !self) depth++
    if (removedAt >= 0 && depth === 0) {
      result += xml.slice(cursor, removedAt)
      cursor = match.index + tag.length
      removedAt = -1
    }
  }
  return result + xml.slice(cursor)
}

function checkedUpload(upload?: { bytes: Uint8Array; mimeType: string }) {
  if (!upload || !upload.bytes.length || upload.bytes.length > 8 * 1024 * 1024)
    throw new Error('上传图片须为不超过8MiB的PNG/JPEG')
  const data = Buffer.from(upload.bytes),
    mimeType = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? 'image/png'
      : data.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
        ? 'image/jpeg'
        : undefined
  if (!mimeType || mimeType !== upload.mimeType)
    throw new Error('图片格式与字节内容不匹配；只支持PNG/JPEG')
  decodePdfImage(data)
  return { mimeType, dataUrl: `data:${mimeType};base64,${data.toString('base64')}` }
}
