import type { DocumentDetail } from '@mimir/shared'
import { ConfigProvider } from 'antd'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MimirProvider } from '../../theme/MimirProvider'
import { DocumentCommandModal, DocumentCommandRefreshError } from './DocumentCommandModal'

const note = {
  id: 'note-a',
  kind: 'note',
  title: '研究笔记',
  folder: '资料/原目录',
} as DocumentDetail
let host: HTMLDivElement
let root: Root
const rename = vi.fn<(id: string, title: string) => Promise<void>>()
const move = vi.fn<(doc: DocumentDetail, folder: string) => Promise<void>>()
const find = vi.fn<(id: string, query: string) => boolean>()
const restoreFocus = vi.fn<(id: string, trigger: HTMLElement | null) => void>()
const refresh = vi.fn<(id: string) => Promise<void>>()
const retryFolders = vi.fn<() => void>()

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  rename.mockResolvedValue(undefined)
  move.mockResolvedValue(undefined)
  find.mockReturnValue(false)
  refresh.mockResolvedValue(undefined)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.resetAllMocks()
})

async function render(doc = note, folderState: 'ready' | 'loading' | 'error' = 'ready') {
  await act(async () =>
    root.render(
      <MimirProvider>
        <ConfigProvider theme={{ token: { motion: false } }}>
          <DocumentCommandModal
            key={doc.id}
            document={doc}
            folders={[
              {
                path: '资料/原目录',
                name: '原目录',
                count: 0,
                description: null,
                icon: null,
                code: null,
                children: [],
              },
            ]}
            foldersLoading={folderState === 'loading'}
            foldersError={folderState === 'error'}
            retryFolders={retryFolders}
            rename={rename}
            move={move}
            find={find}
            refresh={refresh}
            restoreFocus={restoreFocus}
          />
        </ConfigProvider>
      </MimirProvider>,
    ),
  )
}
async function command(name: 'rename' | 'move' | 'search', documentId = note.id) {
  await act(async () => {
    window.dispatchEvent(
      new CustomEvent('mimir:document-command', { detail: { command: name, documentId } }),
    )
  })
}
function button(text: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('.ant-modal button')].find(
    (item) => item.textContent?.replace(/\s/g, '') === text,
  )!
}
function input() {
  return document.querySelector<HTMLInputElement>('#document-command-input')!
}
async function fill(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), value)
    input().dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function click(text: string) {
  await act(async () => button(text).click())
}
async function key(name: string, extra: KeyboardEventInit = {}) {
  await act(async () =>
    input().dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, ...extra })),
  )
}
function deferred() {
  let resolve!: () => void
  let reject!: (cause: Error) => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

describe('document-bound command hosts', () => {
  it('contains the palette shortcut from fields and footer, including while a command is pending', async () => {
    const globalShortcut = vi.fn<(event: KeyboardEvent) => void>()
    const pending = deferred()
    rename.mockReturnValueOnce(pending.promise)
    window.addEventListener('keydown', globalShortcut)
    try {
      await render()
      await command('rename')
      await key('k', { ctrlKey: true })
      expect(globalShortcut).not.toHaveBeenCalled()
      const composingShortcut = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        isComposing: true,
        bubbles: true,
        cancelable: true,
      })
      await act(async () => input().dispatchEvent(composingShortcut))
      expect(composingShortcut.defaultPrevented).toBe(false)
      expect(globalShortcut).not.toHaveBeenCalled()
      await fill('新标题')
      await click('重命名')
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      })
      await act(async () => button('取消').dispatchEvent(event))
      expect(event.defaultPrevented).toBe(true)
      expect(globalShortcut).not.toHaveBeenCalled()
      expect(rename).toHaveBeenCalledOnce()
      await act(async () => pending.resolve())
      await act(async () => {
        await vi.waitFor(() => expect(restoreFocus).toHaveBeenCalled())
      })
      await act(async () =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })),
      )
      expect(globalShortcut).toHaveBeenCalledOnce()
    } finally {
      window.removeEventListener('keydown', globalShortcut)
      pending.resolve()
    }
  })

  it('prefills the title, rejects blank, closes unchanged without a request', async () => {
    await render()
    await command('rename')
    expect(input().value).toBe(note.title)
    expect(input().maxLength).toBe(200)
    await fill('  ')
    await click('重命名')
    expect(document.body.textContent).toContain('请输入笔记标题')
    expect(rename).not.toHaveBeenCalled()
    await fill(note.title)
    await click('重命名')
    expect(rename).not.toHaveBeenCalled()
    await act(async () => {
      await vi.waitFor(() => expect(restoreFocus).toHaveBeenCalledWith(note.id, expect.anything()))
    })
  })

  it('protects IME Enter/Escape, locks every dismissal while pending, retains a failed draft for retry', async () => {
    const pending = deferred()
    rename.mockReturnValueOnce(pending.promise)
    await render()
    await command('rename')
    await fill('中文新标题')
    await act(async () => input().dispatchEvent(new Event('compositionstart', { bubbles: true })))
    await key('Enter', { isComposing: true })
    await key('Escape', { isComposing: true })
    expect(rename).not.toHaveBeenCalled()
    expect(input().value).toBe('中文新标题')
    await act(async () => input().dispatchEvent(new Event('compositionend', { bubbles: true })))
    await key('Enter')
    await key('Enter')
    expect(rename).toHaveBeenCalledExactlyOnceWith(note.id, '中文新标题')
    expect(button('取消').disabled).toBe(true)
    expect(input().disabled).toBe(true)
    await key('Escape')
    await act(async () => document.querySelector<HTMLElement>('.ant-modal-wrap')!.click())
    expect(document.querySelector('.ant-modal')).not.toBeNull()
    expect(restoreFocus).not.toHaveBeenCalled()
    await act(async () => pending.reject(new Error('网络断开，请重试')))
    expect(document.body.textContent).toContain('网络断开，请重试')
    expect(input().value).toBe('中文新标题')
    expect(input().disabled).toBe(false)
    await click('重命名')
    expect(rename).toHaveBeenCalledTimes(2)
    await act(async () => {
      await vi.waitFor(() => expect(restoreFocus).toHaveBeenCalled())
    })
  })

  it('ignores a command for a different document and late completion cannot close its new host', async () => {
    const pending = deferred()
    rename.mockReturnValueOnce(pending.promise)
    await render()
    await command('rename', 'wrong-note')
    expect(input()).toBeNull()
    await command('rename')
    await fill('A 的新名称')
    await click('重命名')
    const other = { ...note, id: 'note-b', title: 'B 笔记' }
    await render(other)
    await command('rename', other.id)
    await fill('B 的草稿')
    await act(async () => pending.resolve())
    expect(input().value).toBe('B 的草稿')
    expect(rename).toHaveBeenCalledExactlyOnceWith(note.id, 'A 的新名称')
    expect(restoreFocus).not.toHaveBeenCalled()
    await click('重命名')
    expect(rename).toHaveBeenLastCalledWith(other.id, 'B 的草稿')
  })

  it('shows real folder loading/error/retry and preserves the selected path when move fails', async () => {
    await render(note, 'loading')
    await command('move')
    expect(document.body.textContent).toContain('正在读取目录')
    expect(button('移动').disabled).toBe(true)
    await render(note, 'error')
    expect(document.body.textContent).toContain('目录暂时无法读取')
    await click('重试')
    expect(retryFolders).toHaveBeenCalledOnce()
    await render(note)
    // A background document refresh can change the persisted folder while the
    // open command retains its selected destination.
    await render({ ...note, folder: '资料/其他目录' })
    const pending = deferred()
    move.mockReturnValueOnce(pending.promise)
    await click('移动')
    await click('移动')
    expect(move).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: note.id }),
      '资料/原目录',
    )
    expect(button('取消').disabled).toBe(true)
    await act(async () => pending.reject(new Error('移动失败，请重试')))
    expect(document.body.textContent).toContain('移动失败，请重试')
    expect(document.body.textContent).toContain('目标：资料/原目录')
    await click('移动')
    expect(move).toHaveBeenCalledTimes(2)
  })

  it('closes an unchanged move without writing; supports the old command event shape', async () => {
    await render()
    await act(async () =>
      window.dispatchEvent(new CustomEvent('mimir:document-command', { detail: 'move' })),
    )
    await click('移动')
    expect(move).not.toHaveBeenCalled()
  })

  it('makes the find threshold explicit, protects composition, retains not-found query, and binds successful locate', async () => {
    await render()
    await command('search')
    await fill(' 中 ')
    await key('Enter')
    expect(find).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('至少输入 2 个字符')
    await fill('  中文  ')
    await key('Enter', { isComposing: true })
    expect(find).not.toHaveBeenCalled()
    await key('Enter')
    expect(find).toHaveBeenCalledExactlyOnceWith(note.id, '中文')
    expect(input().value).toBe('  中文  ')
    expect(document.body.textContent).toContain('当前笔记没有匹配内容')
    find.mockReturnValue(true)
    await click('查找')
    await act(async () => {
      await vi.waitFor(() => expect(restoreFocus).toHaveBeenCalled())
    })
  })

  it('retries only the read when metadata was saved but the current document could not refresh', async () => {
    rename.mockRejectedValueOnce(new DocumentCommandRefreshError('标题已保存，但读取失败'))
    await render()
    await command('rename')
    await fill('已写入的新标题')
    await click('重命名')
    expect(input().value).toBe('已写入的新标题')
    expect(button('重试刷新')).toBeDefined()
    await click('重试刷新')
    expect(refresh).toHaveBeenCalledExactlyOnceWith(note.id)
    expect(rename).toHaveBeenCalledOnce()
  })

  it('does not invent note-only commands for a file', async () => {
    await render({ ...note, kind: 'file' })
    await command('rename')
    expect(input()).toBeNull()
    await command('search')
    expect(input()).toBeNull()
    await command('move')
    expect(button('移动')).toBeDefined()
  })
})
