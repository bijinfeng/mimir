// @vitest-environment jsdom
import { StrictMode, act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { MarkdownBody } from './MarkdownBody'
import { extractHeadings } from './headings'

it('keeps one read-only editor and restores heading anchors through StrictMode and body updates', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  const render = (body: string) => {
    act(() => {
      root.render(
        <StrictMode>
          <MarkdownBody body={body} headings={extractHeadings(body)} />
        </StrictMode>,
      )
    })
  }

  try {
    render('# First')
    expect(host.querySelectorAll('.ProseMirror')).toHaveLength(1)
    expect(host.querySelector('h1, h2')?.id).toBe('h-0')

    render('# Second\n\n## Next')
    expect(host.querySelectorAll('.ProseMirror')).toHaveLength(1)
    expect([...host.querySelectorAll('h1, h2')].map((heading) => heading.id)).toEqual([
      'h-0',
      'h-1',
    ])
  } finally {
    act(() => root.unmount())
    host.remove()
  }
})

it('renders a saved math fence in the read-only body without an editing control', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  try {
    act(() => root.render(<MarkdownBody body={'$$\nE = mc^2\n$$'} headings={[]} />))
    expect(host.querySelector('.mimir-math-block .katex')).not.toBeNull()
    expect(host.querySelector('.mimir-math-block textarea')).toBeNull()
  } finally {
    act(() => root.unmount())
    host.remove()
  }
})

it('renders saved WaveDrom fences read-only and preserves source on a drawing error', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const render = (body: string) =>
    act(() => root.render(<MarkdownBody body={body} headings={[]} />))
  try {
    render("```wavedrom\n{signal: [{name: 'clock', wave: 'p...'}]}\n```")
    await vi.waitFor(() => expect(host.querySelector('img[alt="WaveDrom 时序图"]')).not.toBeNull())
    expect((host.querySelector('.mimir-diagram pre') as HTMLElement).hidden).toBe(true)
    expect(host.querySelector('textarea')).toBeNull()
    render('```wavedrom\n{signal: []}\n```')
    await vi.waitFor(() =>
      expect(host.querySelector('.mimir-diagram__error')?.textContent).toContain('非空'),
    )
    expect((host.querySelector('.mimir-diagram pre') as HTMLElement).hidden).toBe(false)
    expect(host.querySelector('code')?.textContent).toBe('{signal: []}')
  } finally {
    act(() => root.unmount())
    host.remove()
  }
})
