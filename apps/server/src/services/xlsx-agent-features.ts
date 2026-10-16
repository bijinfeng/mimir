import {
  applyCellEditsToXlsx,
  assertOnlyTouchedEntriesChanged,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/gateway/xlsx-gateway.js'
import type { WorkbookOperation } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/workbook-dsl.js'
import { xlsxAttribute } from '../../../../packages/office/src/xlsx-sheet-features.js'
import {
  parseRange,
  parseAddress,
} from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import { readXlsxArchive } from '../../../../packages/office/src/xlsx.js'
import type { XlsxHostResult } from './xlsx-agent-host.js'

export async function applyXlsxFeatureOperation(
  bytes: Uint8Array,
  op: WorkbookOperation,
  version: number,
): Promise<XlsxHostResult> {
  if (op.op !== 'set_hyperlink' && op.op !== 'set_note' && op.op !== 'protect_sheet')
    throw new Error('不支持的工作表工具')
  const zip = await BoundedZip.open(bytes),
    view = await readXlsxArchive(zip)
  const sheet = view.sheets.find((item) => item.id === op.sheetId)
  if (!sheet) throw new Error('工作表ID已失效')
  if (sheet.extras?.protected && op.op !== 'protect_sheet')
    throw new Error('工作表已保护，请先取消保护')
  const xml = (await zip.readText(sheet.entry)) ?? ''
  if ('address' in op) {
    const { row, column } = parseAddress(op.address)
    if (row >= 1_048_576 || column >= 16_384) throw new Error('单元格超出工作表边界')
  }
  if (op.op === 'protect_sheet' && !op.protected && sheet.extras?.passwordProtected)
    throw new Error('含密码的工作表保护暂不能取消')
  const links = [],
    protections = [],
    notes = []
  if (op.op === 'set_hyperlink') {
    if (
      [...xml.matchAll(/<hyperlink\b[^>]*>/g)].some(
        ([tag]) =>
          !tag.endsWith('/>') ||
          !tag.includes('ref="') ||
          (/r:id=/.test(tag) && !tag.includes('r:id="')),
      )
    )
      throw new Error('现有超链接XML形式暂不支持保真修改')
    if (op.target !== null && !/^(?:https?:\/\/|mailto:|#)/i.test(op.target))
      throw new Error('链接仅支持http、https、mailto或#工作表!单元格')
    if (op.target !== null && !op.target.startsWith('#')) {
      try {
        const url = new URL(op.target)
        if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.hostname)
          throw new Error('超链接地址无效')
      } catch {
        throw new Error('超链接地址无效')
      }
    }
    const { row, column } = parseAddress(op.address)
    for (const [tag] of xml.matchAll(/<hyperlink\b[^>]*>/g)) {
      const ref = xlsxAttribute(tag, 'ref')
      if (ref === op.address && (!tag.endsWith('/>') || !tag.includes(`ref="${op.address}"`)))
        throw new Error('现有超链接XML形式暂不支持保真修改')
      if (!ref || !ref.includes(':')) continue
      const b = parseRange(ref)
      if (row >= b.startRow && row <= b.endRow && column >= b.startColumn && column <= b.endColumn)
        throw new Error('现有范围超链接暂不支持按单格修改')
    }
    links.push({ sheetName: sheet.name, edits: [{ row, column, target: op.target }] })
  }
  if (op.op === 'protect_sheet')
    protections.push({ sheetName: sheet.name, protected: op.protected })
  if (op.op === 'set_note') {
    const rels =
      (await zip.readText(sheet.entry.replace(/^(xl\/worksheets\/)([^/]+)$/, '$1_rels/$2.rels'))) ??
      ''
    if (
      [...rels.matchAll(/<Relationship\b[^>]*>/g)].some(
        ([tag]) =>
          /comments|vmlDrawing/.test(tag) && (!tag.includes('Type="') || !tag.includes('Target="')),
      )
    )
      throw new Error('现有批注关系暂不支持保真修改')
    if (sheet.extras?.richNotes || /threadedComment/i.test(rels) || /<extLst\b/.test(xml))
      throw new Error('现有富文本或线程批注暂不支持保真修改')
    const existing = { ...sheet.extras?.notes }
    if (op.text === null) delete existing[op.address]
    else
      existing[op.address] = {
        ...parseAddress(op.address),
        text: op.text,
        author: existing[op.address]?.author ?? 'Mimir',
      }
    notes.push({ sheetName: sheet.name, notes: Object.values(existing) })
  }
  const mutation = await applyCellEditsToXlsx(
    Buffer.from(bytes),
    [],
    [],
    [],
    undefined,
    [],
    links,
    [],
    [],
    protections,
    null,
    [],
    notes,
  )
  assertOnlyTouchedEntriesChanged(mutation)
  return {
    bytes: new Uint8Array(mutation.buffer),
    version: version + 1,
    changedCells: 'address' in op ? [`${sheet.id}:${op.address}`] : [],
    touchedEntries: [...mutation.touchedEntries],
  }
}
