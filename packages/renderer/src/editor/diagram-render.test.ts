// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const safeSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><text>完成</text></svg>'
const unsafeSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10" onload="alert(1)"><script>alert(1)</script><foreignObject><div>HTML</div></foreignObject><image href="https://example.com/pixel"/><a href="https://example.com">link</a><use href="#signal"/><path fill="url(https://example.com/fill)"/></svg>'

let peleImports: number
let mermaidImports: number
let peleImportError: boolean
let mermaidImportError: boolean
type SvgRenderer = (...args: unknown[]) => Promise<{ svg: string }>
let peleRender: ReturnType<typeof vi.fn<SvgRenderer>>
let mermaidRender: ReturnType<typeof vi.fn<SvgRenderer>>
let initialize: ReturnType<typeof vi.fn<(options: unknown) => void>>

beforeEach(() => {
  vi.resetModules()
  peleImports = 0
  mermaidImports = 0
  peleImportError = false
  mermaidImportError = false
  peleRender = vi.fn<SvgRenderer>().mockResolvedValue({ svg: safeSvg })
  mermaidRender = vi.fn<SvgRenderer>().mockResolvedValue({ svg: safeSvg })
  initialize = vi.fn<(options: unknown) => void>()
  vi.doMock('pele/lazy', () => {
    peleImports++
    if (peleImportError) throw new Error('Pele chunk unavailable')
    return { renderAsync: peleRender }
  })
  vi.doMock('mermaid', () => {
    mermaidImports++
    if (mermaidImportError) throw new Error('Mermaid chunk unavailable')
    return { default: { initialize, render: mermaidRender } }
  })
})

afterEach(() => {
  vi.doUnmock('pele/lazy')
  vi.doUnmock('mermaid')
  vi.resetModules()
})

it('loads Pele lazily, disables links and images, and never loads Mermaid on success', async () => {
  const { renderDiagram } = await import('./diagram-render')
  expect(peleImports).toBe(0)
  expect(mermaidImports).toBe(0)
  const source = 'flowchart LR\nA[开始] --> B[完成]'
  expect((await renderDiagram('mermaid', source)).ok).toBe(true)
  expect((await renderDiagram('mermaid', source)).ok).toBe(true)
  expect(peleRender).toHaveBeenCalledWith(source, { links: false, images: false })
  expect(peleImports).toBe(1)
  expect(mermaidImports).toBe(0)
  expect(mermaidRender).not.toHaveBeenCalled()
})

it.each(['import', 'parse', 'render', 'invalid SVG'])(
  'falls back to strict Mermaid after a Pele %s failure',
  async (failure) => {
    if (failure === 'import') peleImportError = true
    else if (failure === 'invalid SVG') peleRender.mockResolvedValue({ svg: '<div>invalid</div>' })
    else peleRender.mockRejectedValue(new Error(`Pele ${failure} failed`))
    const { renderDiagram } = await import('./diagram-render')
    const source = 'flowchart LR\nA --> B'
    const result = await renderDiagram('mermaid', source)
    expect(result.ok).toBe(true)
    expect(mermaidRender).toHaveBeenCalledWith(expect.stringMatching(/^mimir-mermaid-\d+$/), source)
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        securityLevel: 'strict',
        htmlLabels: false,
        suppressErrorRendering: true,
      }),
    )
    expect(mermaidImports).toBe(1)
  },
)

it.each(['Pele', 'Mermaid'])(
  'sanitizes output from %s before returning an isolated SVG',
  async (engine) => {
    if (engine === 'Pele') peleRender.mockResolvedValue({ svg: unsafeSvg })
    else {
      peleRender.mockRejectedValue(new Error('unsupported'))
      mermaidRender.mockResolvedValue({ svg: unsafeSvg })
    }
    const { renderDiagram } = await import('./diagram-render')
    const result = await renderDiagram('mermaid', 'flowchart LR\nA --> B')
    if (!result.ok) throw new Error(result.error)
    expect(result.svg).not.toMatch(/onload|script|foreignObject|<image|<a\b|https:\/\//)
    expect(result.svg).toContain('href="#signal"')
    expect(result.svg).toContain('width="20"')
  },
)

it.each(['render', 'import'])(
  'reports a recoverable error if both engines fail, including Mermaid %s',
  async (failure) => {
    peleRender.mockRejectedValue(new Error('Pele failed'))
    if (failure === 'import') mermaidImportError = true
    else mermaidRender.mockRejectedValue(new Error('Mermaid invalid syntax'))
    const { renderDiagram } = await import('./diagram-render')
    const result = await renderDiagram('mermaid', 'invalid source')
    expect(result).toEqual({
      ok: false,
      error: expect.any(String),
    })
    expect(mermaidImports).toBe(1)
    expect(mermaidRender).toHaveBeenCalledTimes(failure === 'import' ? 0 : 1)
  },
)

it('rejects empty and oversized input before loading either engine', async () => {
  const { renderDiagram } = await import('./diagram-render')
  expect((await renderDiagram('mermaid', ' ')).ok).toBe(false)
  expect((await renderDiagram('mermaid', 'x'.repeat(50_001))).ok).toBe(false)
  expect(peleImports).toBe(0)
  expect(mermaidImports).toBe(0)
})
