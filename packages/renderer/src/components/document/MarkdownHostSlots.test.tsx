import { MarkdownEditor } from '@mimir/office'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { createExtensions } from '../../editor/extensions'

it('keeps host footer after the live body inside the same reader scroller, outside saved Markdown', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <MarkdownEditor
          documentId="slot-note"
          initialContent="正文内容"
          extensions={createExtensions()}
          onSave={vi.fn<() => Promise<void>>().mockResolvedValue(undefined)}
          contentHeader={<h1>文档标题</h1>}
          contentFooter={<nav data-host-footer>来源与被引用</nav>}
        />,
      ),
    )
    const body = host.querySelector('.ProseMirror')!,
      footer = host.querySelector('[data-host-footer]')!
    expect(body).not.toBeNull()
    expect(footer.closest('.me-scroll')).toBe(body.closest('.me-scroll'))
    expect(body.contains(footer)).toBe(false)
    expect(body.textContent).toBe('正文内容')
    expect(body.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
