import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { MimirProvider } from '../../theme/MimirProvider'
import { CitationDemo } from './CitationDemo'

it('opens the cited source and restores the citation focus after close or Escape without API calls', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('Public example must not fetch'))
  const session = vi.spyOn(api.auth, 'session')
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <MimirProvider>
          <CitationDemo />
        </MimirProvider>,
      ),
    )
    const citation = host.querySelector<HTMLButtonElement>('button[aria-controls]')!
    const panel = host.querySelector<HTMLElement>('[role="region"]')!
    expect(panel.hidden).toBe(true)
    expect(citation.getAttribute('aria-controls')).toBe(panel.id)
    citation.focus()
    await act(async () => citation.click())
    expect(citation.getAttribute('aria-expanded')).toBe('true')
    expect(panel.hidden).toBe(false)
    expect(document.activeElement).toBe(panel)
    expect(panel.textContent).toContain('每条结论，都应能回到它的来源')
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="收起原文"]')!.click())
    expect(panel.hidden).toBe(true)
    expect(document.activeElement).toBe(citation)
    await act(async () => citation.click())
    await act(async () =>
      panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    )
    expect(panel.hidden).toBe(true)
    expect(citation.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(citation)
    expect(fetch).not.toHaveBeenCalled()
    expect(session).not.toHaveBeenCalled()
  } finally {
    await act(async () => root.unmount())
    host.remove()
    fetch.mockRestore()
    session.mockRestore()
  }
})
