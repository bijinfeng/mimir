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

it('excludes fenced heading samples from DOM anchors and makes internal links usable', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const open = vi.fn<(id: string) => void>()
  const body = '# Start\n\n```md\n# Code sample\n```\n\n## End\n\n[内部笔记](/doc/note-b)'
  try {
    act(() =>
      root.render(
        <MarkdownBody body={body} headings={extractHeadings(body)} onOpenInternalNote={open} />,
      ),
    )
    expect([...host.querySelectorAll('h1,h2,h3')].map((n) => n.id)).toEqual(['h-0', 'h-1'])
    act(() => host.querySelector<HTMLAnchorElement>('a')!.click())
    expect(open).toHaveBeenCalledExactlyOnceWith('note-b')
  } finally {
    act(() => root.unmount())
    host.remove()
  }
})

it('distinguishes an empty read-only body from a loading document', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    act(() => root.render(<MarkdownBody body="" headings={[]} />))
    expect(host.textContent).toContain('还没有可检索的正文')
    expect(host.querySelector('.ProseMirror')).toBeNull()
  } finally {
    act(() => root.unmount())
    host.remove()
  }
})
