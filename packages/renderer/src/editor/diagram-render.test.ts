// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const safeSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><text>完成</text></svg>'
const unsafeSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10" onload="alert(1)"><script>alert(1)</script><foreignObject><div>HTML</div></foreignObject><image href="https://example.com/pixel"/><a href="https://example.com">link</a><use href="#signal"/><path fill="url(https://example.com/fill)"/></svg>'

let peleImports: number
let peleImportError: boolean
type SvgRenderer = (...args: unknown[]) => Promise<{ svg: string }>
let peleRender: ReturnType<typeof vi.fn<SvgRenderer>>

beforeEach(() => {
  vi.resetModules()
  peleImports = 0
  peleImportError = false
  peleRender = vi.fn<SvgRenderer>().mockResolvedValue({ svg: safeSvg })
  vi.doMock('pele/lazy', () => {
    peleImports++
    if (peleImportError) throw new Error('Pele chunk unavailable')
    return { renderAsync: peleRender }
  })
})

afterEach(() => {
  vi.doUnmock('pele/lazy')
  vi.resetModules()
})

it('loads Pele lazily, reuses its module and disables links and images', async () => {
  const { renderDiagram } = await import('./diagram-render')
  expect(peleImports).toBe(0)
  const source = 'flowchart LR\nA[开始] --> B[完成]'
  expect((await renderDiagram('mermaid', source)).ok).toBe(true)
  expect((await renderDiagram('mermaid', source)).ok).toBe(true)
  expect(peleRender).toHaveBeenCalledWith(source, { links: false, images: false })
  expect(peleImports).toBe(1)
})

it('returns a recoverable error when the Pele module cannot load', async () => {
  peleImportError = true
  const { renderDiagram } = await import('./diagram-render')
  const result = await renderDiagram('mermaid', 'flowchart LR\nA --> B')
  expect(result).toEqual({ ok: false, error: expect.any(String) })
  expect(peleRender).not.toHaveBeenCalled()
})

it('retries the loader on a later render after a temporary import failure', async () => {
  peleImportError = true
  const { renderDiagram } = await import('./diagram-render')
  expect((await renderDiagram('mermaid', 'flowchart LR\nA --> B')).ok).toBe(false)
  vi.doMock('pele/lazy', () => {
    peleImports++
    return { renderAsync: peleRender }
  })
  expect((await renderDiagram('mermaid', 'flowchart LR\nA --> B')).ok).toBe(true)
  expect(peleImports).toBe(2)
})

it.each(['parse', 'render'])('reports the Pele %s error directly', async (failure) => {
  peleRender.mockRejectedValue(new Error(`Pele ${failure} failed`))
  const { renderDiagram } = await import('./diagram-render')
  const result = await renderDiagram('mermaid', 'invalid source')
  expect(result).toEqual({ ok: false, error: `Pele ${failure} failed` })
})

it('reports invalid SVG as an error', async () => {
  peleRender.mockResolvedValue({ svg: '<div>invalid</div>' })
  const { renderDiagram } = await import('./diagram-render')
  expect(await renderDiagram('mermaid', 'flowchart LR\nA --> B')).toEqual({
    ok: false,
    error: '图形渲染器没有返回有效的 SVG',
  })
})

it('sanitizes Pele output before returning an isolated SVG', async () => {
  peleRender.mockResolvedValue({ svg: unsafeSvg })
  const { renderDiagram } = await import('./diagram-render')
  const result = await renderDiagram('mermaid', 'flowchart LR\nA --> B')
  if (!result.ok) throw new Error(result.error)
  expect(result.svg).not.toMatch(/onload|script|foreignObject|<image|<a\b|https:\/\//)
  expect(result.svg).toContain('href="#signal"')
  expect(result.svg).toContain('width="20"')
})

it('renders again after a failed source is corrected', async () => {
  peleRender.mockRejectedValueOnce(new Error('invalid source'))
  const { renderDiagram } = await import('./diagram-render')
  expect(await renderDiagram('mermaid', 'invalid source')).toEqual({
    ok: false,
    error: 'invalid source',
  })
  expect((await renderDiagram('mermaid', 'flowchart LR\nA --> B')).ok).toBe(true)
  expect(peleImports).toBe(1)
  expect(peleRender).toHaveBeenCalledTimes(2)
})

it('rejects empty and oversized input before loading Pele', async () => {
  const { renderDiagram } = await import('./diagram-render')
  expect((await renderDiagram('mermaid', ' ')).ok).toBe(false)
  expect((await renderDiagram('mermaid', 'x'.repeat(50_001))).ok).toBe(false)
  expect(peleImports).toBe(0)
})
