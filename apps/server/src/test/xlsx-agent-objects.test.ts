import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, it, expect, vi } from 'vitest'
import { applyXlsxOpsOnHost } from '../services/xlsx-agent-host.js'
import { encodePdfPng } from '../services/pdf-image-codec.js'
import { readXlsx } from '../../../../packages/office/src/xlsx.js'
vi.mock('../services/documents.js', () => ({
  getDocument: async () => ({
    id: 'xlsx-1',
    kind: 'file',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileExtension: 'xlsx',
  }),
}))
const fixture = () =>
  new Uint8Array(
    readFileSync(
      new URL(
        '../../../../packages/office/vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
        import.meta.url,
      ),
    ),
  )
const apply = (bytes: Uint8Array, op: Record<string, unknown>, version = 0) =>
  applyXlsxOpsOnHost({ documentId: 'xlsx-1', bytes, ops: [op], expectedVersion: version })
describe('XLSX objects', () => {
  it('creates all nine native chart families with actual renderable caches and preserves unrelated parts over two saves', async () => {
    for (const chartType of [
      'column',
      'bar',
      'line',
      'area',
      'pie',
      'doughnut',
      'scatter',
      'radar',
      'combo',
    ]) {
      const source = fixture(),
        result = await apply(source, {
          op: 'add_chart',
          sheetId: 'sheet-1',
          dataRange: 'A1:C5',
          chartType,
          title: '中文图表',
          anchorCell: 'E2',
        })
      const view = await readXlsx(result.bytes),
        v = view.sheets[0]!.visuals![0]!
      expect(v.kind).toBe('chart')
      expect(v.svg).toContain('<svg')
      expect(v.svg).toContain('中文图表')
      expect(v.anchor.fromColumn).toBe(4)
      const saved = await apply(
        result.bytes,
        { op: 'edit_chart', chartPath: v.chartPath, title: '二次保存', legend: 'bottom' },
        1,
      )
      const after = await readXlsx(saved.bytes)
      expect(after.sheets[0]!.visuals![0]!.name).toBe('二次保存')
      const beforeZip = await JSZip.loadAsync(source),
        afterZip = await JSZip.loadAsync(saved.bytes)
      const unchanged = Object.entries(beforeZip.files).filter(
        ([path, file]) =>
          !file.dir &&
          !result.touchedEntries.includes(path) &&
          !saved.touchedEntries.includes(path),
      )
      for (const [path, file] of unchanged)
        expect(await afterZip.file(path)!.async('uint8array')).toEqual(
          await file.async('uint8array'),
        )
      const removed = await apply(saved.bytes, { op: 'delete_visual', visualId: v.chartPath }, 2)
      expect((await readXlsx(removed.bytes)).sheets[0]!.visuals).toHaveLength(0)
    }
  })
  it('creates and edits persisted shapes, moves their anchors, then deletes them', async () => {
    const first = await apply(fixture(), {
      op: 'add_shape',
      sheetId: 'sheet-1',
      anchorCell: 'D2',
      shapeType: 'roundRect',
      text: '中文说明',
      fillColor: '#FFCC00',
    })
    let visual = (await readXlsx(first.bytes)).sheets[0]!.visuals![0]!
    expect(visual.text).toBe('中文说明')
    expect(visual.fillColor).toBe('FFCC00')
    const second = await apply(
      first.bytes,
      {
        op: 'edit_shape',
        visualId: visual.id,
        text: '<新文字&>',
        fillColor: '#113355',
        anchorCell: 'E3',
      },
      1,
    )
    visual = (await readXlsx(second.bytes)).sheets[0]!.visuals![0]!
    expect(visual.text).toBe('<新文字&>')
    expect(visual.fillColor).toBe('113355')
    expect(visual.anchor.fromRow).toBe(2)
    const removed = await apply(second.bytes, { op: 'delete_visual', visualId: visual.id }, 2)
    expect((await readXlsx(removed.bytes)).sheets[0]!.visuals).toHaveLength(0)
  })
  it('creates native tables with exact headers and converts them to a range preserving cells', async () => {
    const first = await apply(fixture(), {
      op: 'add_table',
      sheetId: 'sheet-1',
      range: 'A2:C5',
      name: 'Sales',
      style: 'TableStyleMedium2',
    })
    const sheet = (await readXlsx(first.bytes)).sheets[0]!
    expect(sheet.tables![0]).toMatchObject({ name: 'Sales', range: 'A2:C5', bandedRows: true })
    const second = await apply(
      first.bytes,
      { op: 'delete_table', sheetId: 'sheet-1', tableName: 'Sales' },
      1,
    )
    const after = (await readXlsx(second.bytes)).sheets[0]!
    expect(after.tables).toHaveLength(0)
    expect(after.rows).toEqual(sheet.rows)
    const zip = await JSZip.loadAsync(second.bytes)
    expect(await zip.file('[Content_Types].xml')!.async('string')).not.toContain(
      '/xl/tables/table1.xml',
    )
  })
  it('inserts and deletes table rows and columns across repeated saves while retaining native table metadata', async () => {
    let bytes = (
      await apply(fixture(), { op: 'add_table', sheetId: 'sheet-1', range: 'A2:C5', name: 'Sales' })
    ).bytes
    for (const op of [
      { op: 'add_table_row', count: 2 },
      { op: 'add_table_column', columnName: '新列', count: 2 },
      { op: 'delete_table_row', row: 2, count: 1 },
      { op: 'delete_table_column', column: 2, count: 1 },
    ]) {
      bytes = (await apply(bytes, { ...op, sheetId: 'sheet-1', tableName: 'Sales' })).bytes
    }
    const sheet = (await readXlsx(bytes)).sheets[0]!
    expect(sheet.tables![0]!.range).toBe('A2:D6')
    expect(sheet.tables![0]!.columns.slice(-2)).toEqual(['新列', '新列2'])
    expect(
      sheet.rows
        .find((r) => r.number === 2)!
        .cells.slice(2, 4)
        .map((c) => c.text),
    ).toEqual(['新列', '新列2'])
    await expect(
      apply(bytes, {
        op: 'delete_table_row',
        sheetId: 'sheet-1',
        tableName: 'Sales',
        row: 1,
        count: 5,
      }),
    ).rejects.toThrow('至少')
  })
  it('rejects local paths, unknown objects and overlapping tables before applying changes', async () => {
    const bytes = fixture()
    await expect(
      apply(bytes, { op: 'add_image', sheetId: 'sheet-1', path: '/etc/passwd', anchorCell: 'A1' }),
    ).rejects.toThrow('公开HTTP')
    await expect(apply(bytes, { op: 'delete_visual', visualId: 'unknown' })).rejects.toThrow(
      '已失效',
    )
    const first = await apply(bytes, { op: 'add_table', sheetId: 'sheet-1', range: 'A2:C5' })
    await expect(
      apply(first.bytes, { op: 'add_table', sheetId: 'sheet-1', range: 'B2:C3' }),
    ).rejects.toThrow('重叠')
  })
  it('retains imported shape run styling and stroke fill while updating its text and fill', async () => {
    const first = await apply(fixture(), {
      op: 'add_shape',
      sheetId: 'sheet-1',
      anchorCell: 'E2',
      shapeType: 'rect',
      text: '原文字',
    })
    const visual = (await readXlsx(first.bytes)).sheets[0]!.visuals![0]!,
      zip = await JSZip.loadAsync(first.bytes)
    const original = await zip.file(visual.drawingPath)!.async('string')
    zip.file(
      visual.drawingPath,
      original
        .replace('<a:r>', '<a:r><a:rPr b="1" sz="1800"/>')
        .replace(
          '</xdr:spPr>',
          '<a:ln w="25400"><a:solidFill><a:srgbClr val="CC0000"/></a:solidFill></a:ln></xdr:spPr>',
        ),
    )
    const result = await apply(await zip.generateAsync({ type: 'uint8array' }), {
      op: 'edit_shape',
      visualId: visual.id,
      text: '新文字',
      fillColor: '#336699',
    })
    const xml = await (
      await JSZip.loadAsync(result.bytes)
    )
      .file(visual.drawingPath)!
      .async('string')
    expect(xml).toContain('b="1" sz="1800"')
    expect(xml).toContain('val="CC0000"')
    expect(xml).toContain('val="336699"')
    expect(xml).toContain('新文字')
  })
  it('rejects object changes on protected sheets, merged tables, and invalid image bytes', async () => {
    const first = await apply(fixture(), {
      op: 'add_shape',
      sheetId: 'sheet-1',
      anchorCell: 'E2',
      shapeType: 'rect',
      text: 'test',
    })
    const visual = (await readXlsx(first.bytes)).sheets[0]!.visuals![0]!
    const protectedBytes = (
      await apply(first.bytes, { op: 'protect_sheet', sheetId: 'sheet-1', protected: true })
    ).bytes
    await expect(
      apply(protectedBytes, { op: 'edit_shape', visualId: visual.id, text: 'changed' }),
    ).rejects.toThrow('已保护')
    await expect(
      apply(protectedBytes, { op: 'delete_visual', visualId: visual.id }),
    ).rejects.toThrow('已保护')
    await expect(
      apply(fixture(), { op: 'add_table', sheetId: 'sheet-1', range: 'A1:C5' }),
    ).rejects.toThrow('合并')
    await expect(
      applyXlsxOpsOnHost({
        documentId: 'xlsx-1',
        bytes: fixture(),
        expectedVersion: 0,
        ops: [{ op: 'add_image', sheetId: 'sheet-1', path: 'upload', anchorCell: 'E2' }],
        image: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' },
      }),
    ).rejects.toThrow('格式')
  })
  it('embeds an explicitly uploaded PNG with persisted media and rejects MIME mismatch and cancellation', async () => {
    const image = encodePdfPng({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 255]),
    })
    const request = {
      documentId: 'xlsx-1',
      bytes: fixture(),
      expectedVersion: 0,
      ops: [{ op: 'add_image', sheetId: 'sheet-1', path: 'upload', anchorCell: 'E2' }],
      image: { bytes: new Uint8Array(image), mimeType: 'image/png' },
    }
    const result = await applyXlsxOpsOnHost(request),
      view = await readXlsx(result.bytes)
    expect(view.sheets[0]!.visuals![0]!.image).toContain('data:image/png;base64,')
    await expect(
      applyXlsxOpsOnHost({ ...request, image: { ...request.image, mimeType: 'image/jpeg' } }),
    ).rejects.toThrow('格式')
    await expect(applyXlsxOpsOnHost({ ...request, signal: AbortSignal.abort() })).rejects.toThrow(
      '取消',
    )
  })
})
