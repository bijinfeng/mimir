import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { openDocx, type PmDocJson } from './docx.js'
import { docxChartSaveOptions } from './docx-chart-save.js'

const fixture = join(
  import.meta.dirname,
  '../vendor/apps/docs/tests/pagination-corpus/docx/01-simple-english.docx',
)
async function chartDocument() {
  const session = await openDocx(new Uint8Array(readFileSync(fixture)))
  const spec = {
    kind: 'bar',
    title: '初始图表',
    categories: ['甲', '乙'],
    series: [
      { name: '收入', values: [10, 20] },
      { name: '目标', values: [15, 30] },
    ],
  }
  const content = structuredClone(session.content)
  content.content!.push({
    type: 'docProtected',
    attrs: {
      docxIndex: null,
      blockType: 'chart',
      label: 'Chart',
      genChart: spec,
      chartDisplay: { ...spec, partPath: '' },
    },
  })
  return session.save(content)
}
function change(content: PmDocJson, name: string, value: number) {
  const next = structuredClone(content)
  const chart = next.content!.find(
    (node) => (node.attrs as Record<string, unknown> | undefined)?.chartDisplay,
  )!
  const attrs = chart.attrs as {
    chartDisplay: {
      title: string
      categories: string[]
      series: { name: string; values: number[] }[]
    }
  }
  attrs.chartDisplay.title = name
  attrs.chartDisplay.categories[1] = '乙 & 丙'
  attrs.chartDisplay.series[0]!.name = '销售'
  attrs.chartDisplay.series[0]!.values[1] = value
  return next
}
async function parts(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  const chartPath = Object.keys(zip.files).find((name) =>
    /^word\/charts\/chart\d+\.xml$/.test(name),
  )!
  const workbookPath = Object.keys(zip.files).find((name) => name.endsWith('.xlsx'))!
  const workbook = await JSZip.loadAsync(await zip.file(workbookPath)!.async('uint8array'))
  return {
    zip,
    chartPath,
    workbookPath,
    workbook,
    chart: await zip.file(chartPath)!.async('string'),
    sheet: await workbook.file('xl/worksheets/sheet1.xml')!.async('string'),
  }
}
describe('DOCX native chart save and embedded workbook', () => {
  it('adds a title to an originally untitled native chart after reopen', async () => {
    const original = await chartDocument()
    const source = await parts(original)
    source.zip.file(
      source.chartPath,
      source.chart.replace(/<c:title\b[^>]*>[\s\S]*?<\/c:title>/, ''),
    )
    const session = await openDocx(await source.zip.generateAsync({ type: 'uint8array' }))
    const saved = await session.save(change(session.content, '新增标题', 84))
    expect((await parts(saved)).chart).toContain('新增标题')
    const reopened = await openDocx(saved)
    const chart = reopened.content.content!.find(
      (node) => (node.attrs as { chartDisplay?: unknown })?.chartDisplay,
    )!
    expect((chart.attrs as { chartDisplay: { title: string } }).chartDisplay.title).toBe('新增标题')
  })
  it('edits after a real reopen, preserving body and other parts across two independent saves', async () => {
    const original = await chartDocument()
    const firstSession = await openDocx(original)
    const first = await firstSession.save(change(firstSession.content, '第一轮', 84))
    const p = await parts(first)
    expect(p.chart).toContain('第一轮')
    expect(p.chart).toContain('<c:v>84</c:v>')
    expect(p.sheet).toMatch(/<c r="B3"[^>]*><v>84<\/v>/)
    expect(p.sheet).toContain('乙 &amp; 丙')
    expect(p.sheet).toContain('销售')
    const before = await parts(original)
    for (const entryPath of Object.keys(before.zip.files).filter(
      (path) => !before.zip.files[path]!.dir && path !== p.chartPath && path !== p.workbookPath,
    )) {
      expect(await p.zip.file(entryPath)!.async('uint8array')).toEqual(
        await before.zip.file(entryPath)!.async('uint8array'),
      )
    }
    const secondSession = await openDocx(first)
    const second = await secondSession.save(change(secondSession.content, '第二轮', 126))
    const secondParts = await parts(second)
    expect(secondParts.chart).toContain('第二轮')
    expect(secondParts.sheet).toMatch(/<c r="B3"[^>]*><v>126<\/v>/)
    expect(secondParts.sheet).toMatch(/<c r="C3"[^>]*><v>30<\/v>/)
    const final = await openDocx(second)
    expect((await parts(await final.save(final.content))).sheet).toBe(secondParts.sheet)
  })
  it('follows arbitrary quoted-sheet horizontal refs and preserves style, extra cells and workbook parts', async () => {
    const input = await chartDocument()
    const p = await parts(input)
    const chart = p.chart
      .replaceAll('Sheet1!$A$2:$A$3', "'数据 O''Brien'!$D$5:$E$5")
      .replaceAll('Sheet1!$B$1', "'数据 O''Brien'!$G$4")
      .replaceAll('Sheet1!$B$2:$B$3', "'数据 O''Brien'!$H$8:$I$8")
    const wbXml = await p.workbook.file('xl/workbook.xml')!.async('string')
    p.workbook.file('xl/workbook.xml', wbXml.replace('name="Sheet1"', 'name="数据 O&apos;Brien"'))
    p.workbook.file(
      'xl/worksheets/sheet1.xml',
      p.sheet.replace(
        '</sheetData>',
        '<row r="8" customHeight="1"><c r="H8" s="3"><v>10</v></c><c r="I8" s="4"><v>20</v></c><c r="Z8"><f>SUM(H8:I8)</f><v>30</v></c></row></sheetData>',
      ),
    )
    p.workbook.file('custom/preserved.xml', '<unchanged/>')
    p.zip.file(p.chartPath, chart)
    p.zip.file(p.workbookPath, await p.workbook.generateAsync({ type: 'uint8array' }))
    const bytes = await p.zip.generateAsync({ type: 'uint8array' })
    const options = await docxChartSaveOptions(
      bytes,
      [
        {
          partPath: p.chartPath,
          patch: { categories: ['新甲', '新乙'], series: [{ name: '新系列', values: [42, 84] }] },
        },
      ],
      {},
    )
    const workbook = await JSZip.loadAsync(options.partBinary![p.workbookPath]!, { base64: true })
    const sheet = await workbook.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(sheet).toContain('<c r="H8" s="3"><v>42</v></c>')
    expect(sheet).toContain('<c r="I8" s="4"><v>84</v></c>')
    expect(sheet).toContain('<c r="Z8"><f>SUM(H8:I8)</f><v>30</v></c>')
    expect(sheet).toContain('r="D5"')
    expect(sheet).toContain('r="E5"')
    expect(sheet).toContain('新系列')
    expect(await workbook.file('custom/preserved.xml')!.async('string')).toBe('<unchanged/>')
  })
  it('rejects malformed or external workbook sources before returning a saved document', async () => {
    const input = await chartDocument()
    const p = await parts(input)
    p.zip.file(p.chartPath, p.chart.replaceAll('Sheet1!$B$2:$B$3', '[remote.xlsx]Sheet1!$B$2:$B$3'))
    await expect(
      docxChartSaveOptions(
        await p.zip.generateAsync({ type: 'uint8array' }),
        [{ partPath: p.chartPath, patch: { series: [{ values: [1, 2] }] } }],
        {},
      ),
    ).rejects.toThrow('数据引用')
  })
})
