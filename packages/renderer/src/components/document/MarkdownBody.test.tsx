import { StrictMode, act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
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
