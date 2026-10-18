import type { DocumentDetail } from '@mimir/shared'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { MimirProvider } from '../../theme/MimirProvider'
import { DocumentFooter } from './DocumentFooter'

const doc = { url: null, links: { sources: [], backlinks: [] } } as unknown as DocumentDetail

function render(value: DocumentDetail) {
  return renderToStaticMarkup(<DocumentFooter doc={value} onOpenDocument={() => {}} />)
}

it('原网页与内部来源分别呈现；空链接不留占位，拒绝非网页协议', () => {
  expect(render(doc)).not.toContain('文档关联')
  expect(render({ ...doc, url: 'javascript:alert(1)' })).not.toContain('查看原网页')
  const html = render({ ...doc, url: 'https://example.com/article' })
  expect(html).toContain('查看原网页')
  expect(html).toContain('href="https://example.com/article"')
  expect(html).toContain('target="_blank"')
  expect(html).toContain('noopener noreferrer')
  expect(html).not.toContain('被引用')
})

it('来源与反链保留各自目标 ID，供宿主统一处理未保存保护', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const open = vi.fn<(id: string) => void>()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  try {
    await act(async () =>
      root.render(
        <MimirProvider>
          <DocumentFooter
            doc={{
              ...doc,
              links: {
                sources: [{ id: 'source', title: '来源资料', kind: 'note' }],
                backlinks: [{ id: 'backlink', title: '引用笔记', kind: 'note' }],
              },
            }}
            onOpenDocument={open}
          />
        </MimirProvider>,
      ),
    )
    const links = host.querySelectorAll('button')
    await act(async () => links[0]!.click())
    await act(async () => links[1]!.click())
    expect(open.mock.calls).toEqual([['source'], ['backlink']])
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
