import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { PDFDocument, PDFName } from 'pdf-lib'
import { openPptxForEdit } from './pptx.js'
import { buildPptxOutput, pptxOutputIndices, pptxPrintDocument } from './pptx-output.js'
import { renderDeck } from './pptx-render.js'

const load = () =>
  new Uint8Array(readFileSync(new URL('../tests/fixtures/title-layout.pptx', import.meta.url)))
const png = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X9WQAAAAASUVORK5CYII=',
    'base64',
  ),
)
describe('PPTX output from current unsaved canvas', () => {
  it('exports actual edited text as standalone SVG and multi-page ZIP', async () => {
    const session = await openPptxForEdit(load())
    const text = session.slides()[0]!.elements.find((el) => el.type === 'text')!
    session.setText(0, text.id, [{ runs: [{ text: '未保存的导出文字' }] }])
    const single = await buildPptxOutput(session.view(), {
      format: 'svg',
      indices: [0],
      width: 1280,
    })
    expect(new TextDecoder().decode(single.bytes)).toContain('未保存的导出文字')
    expect(single.mime).toBe('image/svg+xml')
    session.duplicate(0)
    const multi = await buildPptxOutput(session.view(), {
      format: 'svg',
      indices: [0, 1],
      width: 1280,
    })
    const zip = await JSZip.loadAsync(multi.bytes)
    expect(Object.keys(zip.files)).toEqual(['slide-001.svg', 'slide-002.svg'])
    expect(await zip.file('slide-002.svg')!.async('string')).toContain('未保存的导出文字')
  })
  it('embeds rendered PNGs in a real PDF at original physical page dimensions', async () => {
    const session = await openPptxForEdit(load())
    const result = await buildPptxOutput(
      session.view(),
      { format: 'pdf', indices: [0], width: 1920 },
      async (svg, width, height) => {
        expect(svg).toContain('<svg')
        expect(width).toBe(1920)
        expect(height).toBeGreaterThan(0)
        return png
      },
    )
    const pdf = await PDFDocument.load(result.bytes)
    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getPage(0).getSize()).toEqual({
      width: session.size.cx / 12700,
      height: session.size.cy / 12700,
    })
    expect(pdf.getPage(0).node.Resources()?.has(PDFName.of('XObject'))).toBe(true)
    const image = await buildPptxOutput(
      session.view(),
      { format: 'png', indices: [0], width: 1280 },
      async () => png,
    )
    expect(image.bytes).toEqual(png)
    expect(image.name).toBe('slide-1.png')
  })
  it('prepares distinct SVG resources for each print page and rejects invalid ranges', async () => {
    const session = await openPptxForEdit(load())
    session.duplicate(0)
    const pages = renderDeck(session.view(), { fitWidthPx: 1280, svgIdPrefix: 'print-test' })
    const html = pptxPrintDocument(pages, 720, 540)
    expect(html).toContain('@page{size:720pt 540pt;margin:0}')
    expect(html.match(/class="page"/g)).toHaveLength(2)
    expect(pptxOutputIndices('1-2,2，1', 2)).toEqual([0, 1])
    expect(() => pptxOutputIndices('0', 2)).toThrow('页码')
    expect(() => pptxOutputIndices('3-1', 2)).toThrow('页码')
    await expect(
      buildPptxOutput(session.view(), { format: 'png', indices: [], width: 1280 }),
    ).rejects.toThrow('请选择')
  })
})
