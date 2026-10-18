import type { DocumentDetail } from '@mimir/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import { MimirProvider } from '../theme/MimirProvider'
import { DocumentPanel } from './DocumentPanel'

vi.mock('./NoteEditor', () => ({
  NoteEditor: ({
    document: doc,
    contentHeader,
  }: {
    document: DocumentDetail
    contentHeader: ReactNode
  }) => (
    <div>
      {contentHeader}
      <textarea aria-label="正文草稿" defaultValue={doc.body} />
    </div>
  ),
}))
vi.mock('./document/FilePreview', () => ({ FilePreview: () => null }))
vi.mock('./document/DocChatSidebar', () => ({ DocChatSidebar: () => null }))
vi.mock('./document/DocumentFooter', () => ({ DocumentFooter: () => null }))
vi.mock('../lib/app-shell-context', () => ({
  useAppShell: () => ({
    clearHighlight: () => {},
    newNoteFocusId: null,
    requestNewNoteFocus: () => {},
  }),
}))
vi.mock('../lib/unsaved', () => ({
  useUnsaved: () => ({ runGuarded: (action: () => void) => action() }),
}))

it('metadata refresh failure retains the mounted editor and command draft; retry reads without another write', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const doc = {
    id: 'note-a',
    kind: 'note',
    title: '原标题',
    folder: null,
    body: '已保存正文',
    tags: [],
    sourceKey: null,
    status: 'ready',
    updatedAt: '2026-10-18T01:00:00Z',
  } as unknown as DocumentDetail
  const get = vi.spyOn(api.documents, 'get').mockRejectedValue(new Error('离线'))
  const update = vi.spyOn(api.documents, 'update').mockResolvedValue({ ...doc, title: '新标题' })
  vi.spyOn(api.folders, 'list').mockResolvedValue({ items: [] })
  vi.spyOn(api.documents, 'suggestedTags').mockResolvedValue({ items: [] })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['document', doc.id], doc)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <MimirProvider>
            <ConfigProvider theme={{ token: { motion: false } }}>
              <DocumentPanel documentId={doc.id} onOpenDocument={() => {}} />
            </ConfigProvider>
          </MimirProvider>
        </QueryClientProvider>,
      ),
    )
    const editor = host.querySelector<HTMLTextAreaElement>('[aria-label="正文草稿"]')!
    editor.value = '尚未保存的本地正文'
    await act(async () =>
      window.dispatchEvent(
        new CustomEvent('mimir:document-command', {
          detail: { command: 'rename', documentId: doc.id },
        }),
      ),
    )
    const input = document.querySelector<HTMLInputElement>('#document-command-input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        '新标题',
      )
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>('.ant-modal button')]
        .find((b) => b.textContent?.replace(/\s/g, '') === '保存')!
        .click(),
    )
    await act(async () => {
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain('标题已保存，但暂时无法读取最新内容'),
      )
    })
    expect(host.querySelector('[aria-label="正文草稿"]')).toBe(editor)
    expect(editor.value).toBe('尚未保存的本地正文')
    expect(input.value).toBe('新标题')
    expect(host.textContent).toContain('暂时无法刷新文档，已保留当前内容')
    get.mockResolvedValue({ ...doc, title: '新标题' })
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>('.ant-modal button')]
        .find((b) => b.textContent?.replace(/\s/g, '') === '重试刷新')!
        .click(),
    )
    await act(async () => {
      await vi.waitFor(() => expect(host.textContent).toContain('新标题'))
    })
    expect(update).toHaveBeenCalledExactlyOnceWith(doc.id, { title: '新标题' })
    expect(host.querySelector('[aria-label="正文草稿"]')).toBe(editor)
    expect(editor.value).toBe('尚未保存的本地正文')
  } finally {
    await act(async () => root.unmount())
    client.clear()
    host.remove()
    vi.restoreAllMocks()
  }
})
