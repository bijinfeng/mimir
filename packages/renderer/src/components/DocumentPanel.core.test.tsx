import type { Citation, DocumentDetail } from '@mimir/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { MenuProps } from 'antd'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import { MimirProvider } from '../theme/MimirProvider'
import { DocumentPanel } from './DocumentPanel'

const guards = vi.hoisted(() => ({ run: vi.fn<(action: () => void) => void>() }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn<() => void>() }))
vi.mock('../lib/unsaved', () => ({ useUnsaved: () => ({ runGuarded: guards.run }) }))
vi.mock('../lib/app-shell-context', () => ({
  useAppShell: () => ({
    clearHighlight: () => {},
    newNoteFocusId: null,
    requestNewNoteFocus: () => {},
  }),
}))
vi.mock('./NoteEditor', () => ({
  NoteEditor: ({
    document: doc,
    contentHeader,
    bodySide,
  }: {
    document: DocumentDetail
    contentHeader: ReactNode
    bodySide?: ReactNode
  }) => (
    <div>
      {bodySide}
      <div data-note-content-header>{contentHeader}</div>
      <textarea aria-label="正文草稿" defaultValue={doc.body} />
      <div className="ProseMirror">
        <h2>正文标题</h2>
        <h2>另一个标题</h2>
      </div>
    </div>
  ),
}))
vi.mock('./document/DocumentFooter', () => ({ DocumentFooter: () => null }))
vi.mock('./document/FilePreview', () => ({ FilePreview: () => null }))
vi.mock('./document/DocChatSidebar', () => ({
  DocChatSidebar: ({
    onOpenCitation,
  }: {
    onOpenCitation: (id: string, citation: Citation) => void
  }) => (
    <button onClick={() => onOpenCitation('other', { documentId: 'other' } as Citation)}>
      跨篇引用
    </button>
  ),
}))
const buttons = (items: MenuProps['items']): ReactNode =>
  items?.map((item) =>
    item && 'children' in item ? (
      <div key={item.key}>{buttons(item.children)}</div>
    ) : item && 'onClick' in item ? (
      <button
        key={item.key}
        data-action={item.key}
        disabled={'disabled' in item && item.disabled}
        onClick={() => item.onClick?.({} as never)}
      >
        {String(item.key)}
      </button>
    ) : null,
  )

vi.mock('./document/DocumentHeader', () => {
  return {
    DocumentHeader: ({ menu, onAskAi }: { menu: MenuProps['items']; onAskAi: () => void }) => (
      <div>
        {buttons(menu)}
        <button onClick={onAskAi}>问AI</button>
      </div>
    ),
  }
})

const doc = (id = 'note-a') =>
  ({
    id,
    kind: 'note',
    title: '测试笔记',
    body: '服务端旧正文',
    tags: [],
    sourceKey: null,
    status: 'ready',
    folder: null,
    updatedAt: '2026-10-18T01:00:00Z',
  }) as unknown as DocumentDetail
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  vi.restoreAllMocks()
  guards.run.mockReset()
})
async function mount() {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.spyOn(api.documents, 'get').mockRejectedValue(new Error('读取失败'))
  vi.spyOn(api.documents, 'suggestedTags').mockResolvedValue({ items: ['建议标签'] })
  vi.spyOn(api.folders, 'list').mockResolvedValue({ items: [] })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['document', 'note-a'], doc())
  client.setQueryData(['document', 'note-b'], doc('note-b'))
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const open = vi.fn<(id: string) => void>()
  const render = async (id = 'note-a') =>
    act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <MimirProvider>
            <DocumentPanel documentId={id} onOpenDocument={open} />
          </MimirProvider>
        </QueryClientProvider>,
      ),
    )
  await render()
  const click = async (key: string) =>
    act(async () =>
      (host.querySelector<HTMLButtonElement>(`[data-action="${key}"]`) ??
        [...host.querySelectorAll<HTMLButtonElement>('button')].find(
          (b) => b.textContent === key,
        ))!.click(),
    )
  cleanups.push(async () => {
    await act(async () => root.unmount())
    client.clear()
    host.remove()
  })
  return { client, host, click, render, open }
}

it('tag metadata never applies its body snapshot; failed refresh keeps editor and retries only GET', async () => {
  let resolve!: (value: DocumentDetail) => void
  const update = vi.spyOn(api.documents, 'update').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const t = await mount()
  const editor = t.host.querySelector<HTMLTextAreaElement>('textarea')!
  editor.value = '本地未保存正文'
  await t.click('tag-add:建议标签')
  await t.click('tag-add:建议标签')
  expect(update).toHaveBeenCalledTimes(1)
  await act(async () => {
    t.client.setQueryData(['document', 'note-a'], { ...doc(), body: '最新缓存正文' })
    resolve({ ...doc(), tags: ['建议标签'] })
  })
  expect(t.client.getQueryData<DocumentDetail>(['document', 'note-a'])?.body).toBe('最新缓存正文')
  expect(t.host.querySelector('textarea')).toBe(editor)
  expect(editor.value).toBe('本地未保存正文')
  expect(t.host.textContent).toContain('标签已保存')
  vi.mocked(api.documents.get).mockResolvedValue({ ...doc(), tags: ['建议标签'] })
  await act(async () =>
    [...t.host.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.includes('重试刷新'))!
      .click(),
  )
  expect(update).toHaveBeenCalledTimes(1)
})

it('retains AI candidates after write failure and shows completion only after successful adoption', async () => {
  vi.spyOn(api.documents, 'suggestedTagsAi').mockResolvedValue({
    tags: ['候选'],
    usedModel: true,
    model: 'test',
  })
  const update = vi
    .spyOn(api.documents, 'update')
    .mockRejectedValueOnce(new Error('添加失败'))
    .mockResolvedValue({ ...doc(), tags: ['候选'] })
  const t = await mount()
  await t.click('ai-tags')
  await t.click('＋ 候选')
  expect(t.host.textContent).toContain('添加失败')
  expect(t.host.textContent).toContain('＋ 候选')
  vi.mocked(api.documents.get).mockResolvedValue({ ...doc(), tags: ['候选'] })
  await t.click('＋ 候选')
  expect(update).toHaveBeenCalledTimes(2)
  expect(t.host.textContent).toContain('都加上了')
})

it('isolates pending AI by document and rejects an old result even after returning to the same ID', async () => {
  let resolve!: (value: { text: string; model: string; usedModel: boolean }) => void
  vi.spyOn(api.documents, 'summary')
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    .mockResolvedValue({ text: '新文档摘要', model: 'test', usedModel: true })
  const t = await mount()
  await t.click('ai-summary')
  await t.render('note-b')
  expect(t.host.querySelector<HTMLButtonElement>('[data-action="ai-summary"]')?.disabled).toBe(
    false,
  )
  await t.click('ai-summary')
  expect(t.host.textContent).toContain('新文档摘要')
  expect(t.host.querySelector('[data-note-content-header]')?.textContent).toContain('新文档摘要')
  await t.render('note-a')
  await act(async () => resolve({ text: '过期摘要', model: 'test', usedModel: true }))
  expect(t.host.textContent).not.toContain('过期摘要')
  expect(t.host.textContent).not.toContain('新文档摘要')
})

it('cross-document assistant citations invoke the leave guard before navigation', async () => {
  const t = await mount()
  await t.click('问AI')
  await t.click('跨篇引用')
  expect(guards.run).toHaveBeenCalledTimes(1)
  expect(t.open).not.toHaveBeenCalled()
  guards.run.mock.calls[0]![0]()
  expect(t.open).toHaveBeenCalledWith('other')
})

it('folder writes retain live body and recover a successful write by reading without moving twice', async () => {
  const update = vi
    .spyOn(api.documents, 'update')
    .mockResolvedValue({ ...doc(), folder: '资料库', body: '过时元数据快照' })
  const t = await mount()
  await act(async () => {
    t.client.setQueryData(['folders'], {
      items: [{ path: '资料库', name: '资料库', children: [] }],
    })
  })
  await act(async () =>
    vi.waitFor(() => expect(t.host.querySelector('[data-action="folder:资料库"]')).not.toBeNull()),
  )
  const editor = t.host.querySelector<HTMLTextAreaElement>('textarea')!
  editor.value = '本地正文'
  await t.click('folder:资料库')
  expect(t.host.textContent).toContain('移动已完成，但暂时无法读取最新内容')
  expect(t.client.getQueryData<DocumentDetail>(['document', 'note-a'])?.body).toBe('服务端旧正文')
  expect(t.host.querySelector('textarea')).toBe(editor)
  expect(editor.value).toBe('本地正文')
  vi.mocked(api.documents.get).mockResolvedValue({ ...doc(), folder: '资料库' })
  await act(async () =>
    [...t.host.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.includes('重试刷新'))!
      .click(),
  )
  expect(update).toHaveBeenCalledExactlyOnceWith('note-a', { folder: '资料库' })
})

it('an old move toast cannot undo a later move, and successful undo read retry never writes twice', async () => {
  const t = await mount()
  vi.mocked(api.documents.get).mockImplementation(async () =>
    t.client.getQueryData<DocumentDetail>(['document', 'note-a'])!,
  )
  const update = vi.spyOn(api.documents, 'update').mockImplementation(async (_id, patch) => ({
    ...doc(),
    folder: patch.folder || null,
  }))
  const folders = {
    items: ['B', 'C'].map((name) => ({
      path: name,
      name,
      children: [],
      count: 0,
      description: '',
      icon: null,
      code: name,
    })),
  }
  vi.mocked(api.folders.list).mockResolvedValue(folders)
  await act(async () => t.client.setQueryData(['folders'], folders))
  await act(async () =>
    vi.waitFor(() => expect(t.host.querySelector('[data-action="folder:B"]')).not.toBeNull()),
  )
  await t.click('folder:B')
  const firstUndo = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === '撤销',
  )!
  await t.click('folder:C')
  await act(async () => firstUndo.click())
  expect(update).toHaveBeenCalledTimes(2)
  expect(document.body.textContent).toContain('此次撤销已失效')
  const currentUndo = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === '撤销',
  )!
  vi.mocked(api.documents.get).mockRejectedValue(new Error('离线'))
  await act(async () => currentUndo.click())
  expect(update).toHaveBeenCalledTimes(3)
  expect(document.body.textContent).toContain('撤销已保存')
  vi.mocked(api.documents.get).mockResolvedValue({ ...doc(), folder: 'B' })
  await act(async () => currentUndo.click())
  expect(update).toHaveBeenCalledTimes(3)
})

it('a missing outline target preserves reading position and explains the unavailable jump', async () => {
  const t = await mount()
  const heading = [...t.host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === '正文标题',
  )!
  expect(heading).toBeDefined()
  await act(async () => {
    t.host.querySelector('.ProseMirror')!.remove()
    heading.click()
  })
  expect(t.host.textContent).toContain('没有找到对应大纲目标，当前阅读位置保留')
})
