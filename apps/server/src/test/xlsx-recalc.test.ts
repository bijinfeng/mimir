import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import init, { Model } from '@ironcalc/wasm-xlsx'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { recalculateXlsx, runXlsxRecalcWorker } from '../services/xlsx-recalc.js'
import { applyXlsxOpsOnHost } from '../services/xlsx-agent-host.js'

vi.mock('../services/documents.js', () => ({
  getDocument: async () => ({
    id: 'xlsx-1',
    kind: 'file',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileExtension: 'xlsx',
  }),
}))
const require = createRequire(import.meta.url)
beforeAll(async () => {
  await init({
    module_or_path: readFileSync(
      join(dirname(require.resolve('@ironcalc/wasm-xlsx')), 'wasm_bg.wasm'),
    ),
  })
})

async function fixture(extraFormula?: string) {
  const model = new Model('Recalc', 'en', 'UTC', 'en')
  try {
    for (const [index, input] of [
      '23',
      '=A1*3+1',
      '=A1>20',
      '="hello"',
      '=1/0',
      '="#N/A"',
      '=FALSE()',
      '=""',
      '=SUM(A1:B1)',
      ...(extraFormula ? [extraFormula] : []),
    ].entries())
      model.setUserInput(0, 1, index + 1, input)
    model.evaluate()
    const zip = await JSZip.loadAsync(model.toXlsx())
    zip.file('customXml/untouched.xml', '<payload>opaque unchanged</payload>')
    // A valid cached result deliberately disagrees with the formula, proving
    // the worker evaluates rather than echoing the input workbook's caches.
    const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    zip.file('xl/worksheets/sheet1.xml', xml.replace('<v>70</v>', '<v>999</v>'))
    return zip.generateAsync({ type: 'uint8array' })
  } finally {
    model.free()
  }
}
async function xmlOf(bytes: Uint8Array) {
  return (await JSZip.loadAsync(bytes)).file('xl/worksheets/sheet1.xml')!.async('string')
}

describe('isolated XLSX formula recalculation', () => {
  it('keeps self-closing empty cells separate from the following formula cell', async () => {
    const zip = await JSZip.loadAsync(await fixture())
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    zip.file(
      'xl/worksheets/sheet1.xml',
      sheet.replace(
        '</sheetData>',
        '<row r="2"><c r="A2" s="0"/><c r="B2"><f>A1*3+1</f><v>999</v></c></row></sheetData>',
      ),
    )
    const result = await recalculateXlsx(await zip.generateAsync({ type: 'uint8array' }))
    expect(result.changedCells.some((address) => address.endsWith('!A2'))).toBe(false)
    expect(result.recalculation.formulaCount).toBe(9)
    expect(await xmlOf(result.bytes)).toContain('<c r="A2" s="0"/>')
    expect(await xmlOf(result.bytes)).toMatch(/<c r="B2"\s*><f>A1\*3\+1<\/f><v>70<\/v><\/c>/)
  })

  it('recalculates numeric dependencies, typed booleans/text/errors/empty strings and preserves every unmodified ZIP part', async () => {
    const bytes = await fixture()
    const result = await recalculateXlsx(bytes)
    expect(result.recalculation).toMatchObject({ engineVersion: '0.9.0', formulaCount: 8 })
    const xml = await xmlOf(result.bytes)
    expect(xml).toMatch(/<c\b[^>]*r="B1"[^>]*><f>A1\*3\+1<\/f><v>70<\/v>/)
    expect(xml).toMatch(/<c\b[^>]*r="C1"[^>]*t="b"[^>]*>[\s\S]*?<v>1<\/v>/)
    expect(xml).toMatch(/<c\b[^>]*r="E1"[^>]*t="e"[^>]*>[\s\S]*?<v>#DIV\/0!<\/v>/)
    expect(xml).toMatch(/<c\b[^>]*r="F1"[^>]*t="str"[^>]*>[\s\S]*?<v>#N\/A<\/v>/)
    expect(xml).toMatch(/<c\b[^>]*r="G1"[^>]*t="b"[^>]*>[\s\S]*?<v>0<\/v>/)
    expect(xml).toMatch(/<c\b[^>]*r="H1"[^>]*t="str"[^>]*>[\s\S]*?<v><\/v>/)
    const source = await JSZip.loadAsync(bytes),
      saved = await JSZip.loadAsync(result.bytes)
    for (const [name, entry] of Object.entries(source.files).filter(
      ([path, part]) => !part.dir && !result.touchedEntries.includes(path),
    )) {
      expect(await saved.file(name)!.async('uint8array')).toEqual(await entry.async('uint8array'))
    }
    expect(result.touchedEntries).not.toContain('customXml/untouched.xml')
  })

  it('shares host revision semantics and recalculates after a second saved edit without reverting earlier bytes', async () => {
    const first = await applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes: await fixture(),
      expectedVersion: 0,
      ops: [],
      action: 'recalculate_formulas',
    })
    const edited = await applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes: first.bytes,
      expectedVersion: first.version,
      ops: [{ op: 'set_cell', sheetId: 'sheet-1', address: 'A1', value: 50 }],
    })
    const second = await applyXlsxOpsOnHost({
      documentId: 'xlsx-1',
      bytes: edited.bytes,
      expectedVersion: edited.version,
      ops: [],
      action: 'recalculate_formulas',
    })
    expect(second.version).toBe(3)
    expect(await xmlOf(first.bytes)).toContain('<v>70</v>')
    expect(await xmlOf(second.bytes)).toContain('<v>151</v>')
    expect(await xmlOf(second.bytes)).toContain('<v>201</v>')
    expect(await xmlOf(second.bytes)).toContain('<v>50</v>')
  })

  it('rejects the unsupported 1904 epoch and shared/array formulas, preserving original bytes', async () => {
    const bytes = await fixture(),
      original = bytes.slice()
    const zip = await JSZip.loadAsync(bytes)
    const workbook = await zip.file('xl/workbook.xml')!.async('string')
    zip.file('xl/workbook.xml', workbook.replace('<sheets>', '<workbookPr date1904="1"/><sheets>'))
    await expect(recalculateXlsx(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(
      '1904',
    )
    zip.file('xl/workbook.xml', workbook)
    zip.file(
      'xl/worksheets/sheet1.xml',
      (await xmlOf(bytes)).replace('<f>A1*3+1</f>', '<f t="shared" si="0">A1*3+1</f>'),
    )
    await expect(recalculateXlsx(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(
      '共享或数组',
    )
    expect(bytes).toEqual(original)
  })

  it('refuses unsupported formulas and input budgets instead of keeping old caches as success', async () => {
    await expect(recalculateXlsx(await fixture('=NO_SUCH_FUNCTION(A1)'))).rejects.toThrow(
      /数组|未支持/,
    )
    await expect(recalculateXlsx(new Uint8Array(2 * 1024 * 1024 + 1))).rejects.toThrow('超过')
  })

  it('terminates timed-out/aborted workers and releases the single-worker slot', async () => {
    const bytes = await fixture()
    await expect(runXlsxRecalcWorker(bytes, [], undefined, 1)).rejects.toThrow('超时')
    const aborted = new AbortController()
    aborted.abort()
    await expect(runXlsxRecalcWorker(bytes, [], aborted.signal)).rejects.toThrow('取消')
    const controller = new AbortController()
    const running = runXlsxRecalcWorker(bytes, [], controller.signal)
    await expect(runXlsxRecalcWorker(bytes, [])).rejects.toThrow('另一份工作簿')
    controller.abort()
    await expect(running).rejects.toThrow('取消')
    await expect(recalculateXlsx(bytes)).resolves.toHaveProperty('recalculation.formulaCount', 8)
  })
})
