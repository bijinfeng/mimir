// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PdfOcrOverlay, pdfOcrSelectionText } from './PdfOcrOverlay.js'
import type { ProjectedPdfOcrPage } from './pdf-ocr.js'

let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  window.getSelection()?.removeAllRanges()
})
async function setup() {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const source = 'Mimir Office\n中文🙂 测试\n'
  const parts = [
    { text: 'Mi', start: 0, end: 2 },
    { text: 'mir', start: 2, end: 5 },
    { text: 'Office', start: 6, end: 12 },
    { text: '中文🙂', start: 13, end: 17 },
    { text: '测试', start: 18, end: 20 },
  ]
  const tokens = parts.map((part) => ({ ...part, confidence: 95, corners: [] }))
  const page: ProjectedPdfOcrPage = {
    provenance: 'local-ocr',
    bytes: new Uint8Array([1]),
    sourceIndex: 0,
    page: 0,
    confidence: 95,
    text: source,
    tokens,
    viewport: { width: 400, height: 600 },
    boxes: tokens.map((token) => ({
      token,
      rect: { x: 0, y: 0, width: 0.1, height: 0.1 },
      points: [
        [0, 0],
        [40, 0],
        [40, 20],
        [0, 20],
      ],
    })),
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(<PdfOcrOverlay page={page} onExit={() => {}} />))
  cleanup = () => {
    act(() => root.unmount())
    host.remove()
  }
  return {
    host,
    source,
    overlay: host.querySelector<SVGSVGElement>('svg')!,
    glyphs: host.querySelectorAll('text'),
    selection: window.getSelection()!,
  }
}

describe('OCR paper selection copy', () => {
  it('copies a partial multi-character symbol across glyph nodes without SVG visual line breaks', async () => {
    const { source, overlay, glyphs, selection } = await setup()
    selection.setBaseAndExtent(glyphs[0]!.firstChild!, 1, glyphs[2]!.firstChild!, 3)
    const write = vi.fn<(type: string, value: string) => void>()
    const event = new Event('copy', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { setData: write } })
    overlay.dispatchEvent(event)
    expect(write).toHaveBeenCalledExactlyOnceWith('text/plain', 'imir Off')
    expect(event.defaultPrevented).toBe(true)
    expect(pdfOcrSelectionText(overlay, selection, source)).toBe('imir Off')
  })
  it('keeps actual line boundaries and spaces for both forward and backward selections', async () => {
    const { source, overlay, glyphs, selection } = await setup()
    selection.setBaseAndExtent(glyphs[1]!.firstChild!, 2, glyphs[4]!.firstChild!, 1)
    expect(pdfOcrSelectionText(overlay, selection, source)).toBe('r Office\n中文🙂 测')
    selection.setBaseAndExtent(glyphs[4]!.firstChild!, 1, glyphs[1]!.firstChild!, 2)
    expect(pdfOcrSelectionText(overlay, selection, source)).toBe('r Office\n中文🙂 测')
  })
  it('maps element boundaries and separate whitespace nodes; outside selections stay native', async () => {
    const { host, source, overlay, glyphs, selection } = await setup()
    selection.setBaseAndExtent(glyphs[1]!.lastChild!, 1, glyphs[3]!, 1)
    expect(pdfOcrSelectionText(overlay, selection, source)).toBe('Office\n中文🙂')
    selection.setBaseAndExtent(overlay, 0, overlay, overlay.childNodes.length)
    expect(pdfOcrSelectionText(overlay, selection, source)).toBe(source)
    const outside = document.createTextNode('outside')
    host.append(outside)
    selection.setBaseAndExtent(glyphs[0]!.firstChild!, 0, outside, 2)
    expect(pdfOcrSelectionText(overlay, selection, source)).toBe(null)
  })
})
