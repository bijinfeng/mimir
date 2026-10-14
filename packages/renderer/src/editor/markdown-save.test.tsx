/** @vitest-environment happy-dom */
import { Extension, type Editor } from '@tiptap/core'
import { MarkdownEditor, type MarkdownAgentHandle } from '@mimir/office'
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useUnsaved, UnsavedProvider } from '../lib/unsaved.js'
import { createExtensions } from './extensions.js'

type Unsaved = ReturnType<typeof useUnsaved>

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const mounted: Array<() => void> = []

afterEach(() => {
  for (const unmount of mounted) unmount()
  mounted.length = 0
})

async function mount(
  onSave: (body: string) => Promise<void>,
  onOpenInternalNote?: (id: string) => void,
  onAgentHandleChange?: (handle: MarkdownAgentHandle | null) => void,
) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let editor!: Editor
  let unsaved!: Unsaved
  const capture = Extension.create({
    name: 'captureSaveTestEditor',
    onCreate() {
      editor = this.editor
    },
  })

  function Harness() {
    const value = useUnsaved()
    useEffect(() => {
      unsaved = value
    }, [value])
    return (
      <MarkdownEditor
        documentId="save-test"
        extensions={[...createExtensions(), capture]}
        initialContent="初始正文"
        onSave={onSave}
        onOpenInternalNote={onOpenInternalNote}
        onAgentHandleChange={onAgentHandleChange}
        onDirtyChange={value.setDirty}
        onSaveHandle={(save) => value.setSave(save, 'auto')}
      />
    )
  }

  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () =>
    root.render(
      <UnsavedProvider>
        <Harness />
      </UnsavedProvider>,
    ),
  )
  await vi.waitFor(() => expect(editor).toBeDefined())
  mounted.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return {
    host,
    editor,
    get unsaved() {
      return unsaved
    },
  }
}

function replaceBody(editor: Editor, body: string) {
  act(() => editor.commands.setContent(body))
}

describe('自动保存与离开守卫', () => {
  it('手动查找替换使用同一正文与保存链路', async () => {
    const writes: string[] = []
    const view = await mount(async (body) => {
      writes.push(body)
    })
    const click = (label: string) => {
      const button = view.host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
      expect(button).not.toBeNull()
      act(() => button!.click())
    }
    const type = (label: string, value: string) => {
      const input = view.host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
      expect(input).not.toBeNull()
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        setter?.call(input, value)
        input!.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
    const reviewTab = [...view.host.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].find(
      (button) => button.textContent === '审阅',
    )
    expect(reviewTab).toBeDefined()
    act(() => reviewTab!.click())
    click('查找和替换 (Ctrl+F)')
    type('查找内容', '初始')
    type('替换为', '更新')
    click('全部替换')
    expect(view.editor.getMarkdown()).toBe('更新正文')
    expect(view.unsaved.isDirty).toBe(true)
    act(() => view.unsaved.runGuarded(() => {}))
    await act(async () => view.unsaved.resolve('save'))
    expect(writes).toContain('更新正文')
  })

  it('Agent 修改走与手动编辑相同的 dirty 和立即保存路径', async () => {
    const writes: string[] = []
    let agent: MarkdownAgentHandle | null = null
    const view = await mount(
      async (body) => {
        writes.push(body)
      },
      undefined,
      (handle) => {
        agent = handle
      },
    )
    expect(agent).not.toBeNull()
    const active = agent as MarkdownAgentHandle | null
    if (!active) throw new Error('Markdown Agent handle not mounted')
    const result = await act(async () =>
      active.execute(
        'apply_ops',
        {
          ops: [
            { op: 'replaceText', target: { start: 0 }, find: '初始正文', replace: 'Agent 正文' },
          ],
        },
        { expectedVersion: active.getVersion() },
      ),
    )
    expect(result).toMatchObject({ ok: true, changed: true })
    expect(view.unsaved.isDirty).toBe(true)
    act(() => view.unsaved.runGuarded(() => {}))
    await act(async () => view.unsaved.resolve('save'))
    expect(writes).toContain('Agent 正文')
    expect(view.unsaved.isDirty).toBe(false)
  })
  it('写入中继续编辑时串行保存最新正文，第二次写入完成前不离开', async () => {
    const first = deferred<void>()
    const second = deferred<void>()
    const writes: string[] = []
    const leave = vi.fn<() => void>()
    const view = await mount((body) => {
      writes.push(body)
      return writes.length === 1 ? first.promise : second.promise
    })

    replaceBody(view.editor, '第一版')
    act(() => view.unsaved.runGuarded(leave))
    act(() => view.unsaved.resolve('discard'))
    expect(view.unsaved.pending).not.toBeNull()
    expect(leave).not.toHaveBeenCalled()
    act(() => view.unsaved.resolve('save'))
    expect(writes).toEqual(['第一版'])
    expect(view.unsaved.saving).toBe(true)

    replaceBody(view.editor, '最终版')
    await act(async () => first.resolve())
    expect(writes).toEqual(['第一版', '最终版'])
    expect(view.unsaved.isDirty).toBe(true)
    expect(leave).not.toHaveBeenCalled()

    await act(async () => second.resolve())
    expect(view.unsaved.isDirty).toBe(false)
    expect(view.unsaved.pending).toBeNull()
    expect(leave).toHaveBeenCalledOnce()
  })

  it('写入失败时停留在编辑页，重试成功后才离开', async () => {
    const first = deferred<void>()
    const writes: string[] = []
    const leave = vi.fn<() => void>()
    const view = await mount((body) => {
      writes.push(body)
      return writes.length === 1 ? first.promise : Promise.resolve()
    })

    replaceBody(view.editor, '必须保留的正文')
    act(() => view.unsaved.runGuarded(leave))
    act(() => view.unsaved.resolve('save'))
    await act(async () => first.reject(new Error('磁盘写入失败')))
    expect(view.unsaved.isDirty).toBe(true)
    expect(view.unsaved.pending).not.toBeNull()
    expect(view.unsaved.saveError).toBeTruthy()
    expect(leave).not.toHaveBeenCalled()

    await act(async () => view.unsaved.resolve('save'))
    expect(writes).toEqual(['必须保留的正文', '必须保留的正文'])
    expect(view.unsaved.isDirty).toBe(false)
    expect(leave).toHaveBeenCalledOnce()
  })
})

it('切换拼写检查后，正文内链仍经应用导航打开', async () => {
  const open = vi.fn<(id: string) => void>()
  const view = await mount(async () => {}, open)
  replaceBody(view.editor, '<p><a href="/doc/stable-id">目标笔记</a></p>')
  const link = view.host.querySelector<HTMLAnchorElement>('a[href="/doc/stable-id"]')
  expect(link).not.toBeNull()

  const clickLink = () => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    Object.defineProperty(event, 'target', { value: link })
    act(() => view.editor.options.editorProps?.handleClick?.(view.editor.view, 1, event))
  }
  clickLink()
  expect(open).toHaveBeenCalledWith('stable-id')

  const reviewTab = [...view.host.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].find(
    (button) => button.textContent === '审阅',
  )
  expect(reviewTab).toBeDefined()
  act(() => reviewTab!.click())
  const spellCheck = view.host.querySelector<HTMLButtonElement>('button[aria-label="关闭拼写检查"]')
  expect(spellCheck).not.toBeNull()
  act(() => spellCheck!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))

  clickLink()
  expect(open).toHaveBeenCalledTimes(2)
})
