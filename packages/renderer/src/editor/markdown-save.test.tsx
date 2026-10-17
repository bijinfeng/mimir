/** @vitest-environment happy-dom */
import { Editor, Extension } from '@tiptap/core'
import { MarkdownEditor, type MarkdownAgentHandle } from '@mimir/office'
import { act, useEffect, type ReactNode } from 'react'
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
  manual: {
    onExportMarkdown?: (markdown: string) => Promise<void>
    onAiPreset?: (instruction: string) => void
    contentHeader?: ReactNode
    onSaveStateChange?: (state: 'idle' | 'pending' | 'saving' | 'saved' | 'error') => void
  } = {},
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
        {...manual}
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
  it('标题位于正文外，保存状态区分待保存、实际写入与失败重试', async () => {
    const first = deferred<void>()
    const retry = deferred<void>()
    const states: string[] = []
    const writes: string[] = []
    const view = await mount(
      (body) => {
        writes.push(body)
        return writes.length === 1 ? first.promise : retry.promise
      },
      undefined,
      undefined,
      {
        contentHeader: <h1>文档元数据标题</h1>,
        onSaveStateChange: (state) => states.push(state),
      },
    )
    const heading = view.host.querySelector('h1')!
    expect(heading.closest('.ProseMirror')).toBeNull()
    expect(view.editor.getMarkdown()).toBe('初始正文')
    expect(states.at(-1)).toBe('idle')
    replaceBody(view.editor, '需要写入的正文')
    expect(states.at(-1)).toBe('pending')
    expect(writes).toEqual([])
    const clickSave = (label: string) => {
      const button = view.host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
      expect(button.disabled).toBe(false)
      act(() => button.click())
    }
    clickSave('立即保存')
    expect(states.at(-1)).toBe('saving')
    expect(writes).toEqual(['需要写入的正文'])
    await act(async () => first.reject(new Error('磁盘写入失败')))
    expect(states.at(-1)).toBe('error')
    expect(view.unsaved.isDirty).toBe(true)
    clickSave('重试保存')
    expect(states.at(-1)).toBe('saving')
    await act(async () => retry.resolve())
    expect(states.at(-1)).toBe('saved')
    expect(view.unsaved.isDirty).toBe(false)
    expect(writes).toEqual(['需要写入的正文', '需要写入的正文'])
  })

  it('导出读取当前未保存正文，下载完成后仍保留编辑和 dirty', async () => {
    const completed = deferred<void>()
    const exported: string[] = []
    const view = await mount(async () => {}, undefined, undefined, {
      onExportMarkdown: (body) => {
        exported.push(body)
        return completed.promise
      },
    })
    replaceBody(view.editor, '未保存的正文')
    const tab = [...view.host.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].find(
      (button) => button.textContent === '笔记',
    )!
    act(() => tab.click())
    const button = view.host.querySelector<HTMLButtonElement>('button[aria-label="导出 Markdown"]')!
    act(() => button.click())
    expect(exported).toEqual(['未保存的正文'])
    expect(
      view.host.querySelector('button[aria-label="正在导出 Markdown…"]')?.hasAttribute('disabled'),
    ).toBe(true)
    replaceBody(view.editor, '导出期间继续修改')
    await act(async () => completed.resolve())
    expect(view.editor.getMarkdown()).toBe('导出期间继续修改')
    expect(view.unsaved.isDirty).toBe(true)
  })

  it('三个 AI 预设只预填真实侧栏，保留正文并按当前选区选择指令', async () => {
    const instructions: string[] = []
    const view = await mount(async () => {}, undefined, undefined, {
      onAiPreset: (instruction) => {
        instructions.push(instruction)
      },
    })
    const tab = [...view.host.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].find(
      (button) => button.textContent === '审阅',
    )!
    act(() => tab.click())
    const click = (label: string) => {
      const button = view.host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
      expect(button.disabled).toBe(false)
      act(() => button.click())
    }
    click('问 AI：总结全文')
    click('问 AI：润色')
    expect(instructions[0]).toContain('这篇文档')
    expect(instructions[1]).toContain('全文')
    act(() => view.editor.commands.setTextSelection({ from: 1, to: 3 }))
    click('问 AI：润色')
    click('问 AI：整理排版')
    expect(instructions[2]).toContain('当前选中的内容')
    expect(instructions[3]).toContain('当前选中内容')
    expect(view.editor.getMarkdown()).toBe('初始正文')
    expect(view.unsaved.isDirty).toBe(false)
  })

  it.each([
    ['插入 Mermaid 图表', 'mermaid', 'flowchart LR'],
    ['插入 WaveDrom 时序图', 'wavedrom', "name: 'clk'"],
  ])('工具栏%s与 Agent 交替编辑后保存并重开同一图形代码块', async (label, language, source) => {
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
    const insertTab = [...view.host.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].find(
      (button) => button.textContent === '插入',
    )!
    act(() => insertTab.click())
    const insert = view.host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
    expect(insert).not.toBeNull()
    act(() => insert.click())
    expect(view.editor.getMarkdown()).toContain(`\`\`\`${language}\n`)
    const handle = agent as MarkdownAgentHandle | null
    if (!handle) throw new Error('Agent handle missing')
    const output = await act(async () =>
      handle.execute(
        'apply_ops',
        {
          ops: [
            {
              op: 'replaceText',
              target: { start: 1 },
              find: source,
              replace: language === 'mermaid' ? 'flowchart TB' : "name: 'clock'",
            },
          ],
        },
        { expectedVersion: handle.getVersion() },
      ),
    )
    expect(output).toMatchObject({ ok: true, changed: true })
    expect(view.unsaved.isDirty).toBe(true)
    act(() => view.unsaved.runGuarded(() => {}))
    await act(async () => view.unsaved.resolve('save'))
    expect(view.unsaved.isDirty).toBe(false)
    const reopened = new Editor({
      element: document.createElement('div'),
      extensions: createExtensions(),
      content: writes.at(-1),
      contentType: 'markdown',
    })
    try {
      expect(reopened.state.doc.child(1).type.name).toBe('codeBlock')
      expect(reopened.state.doc.child(1).attrs.language).toBe(language)
      expect(reopened.getMarkdown()).toBe(writes.at(-1))
      expect(reopened.state.doc.child(1).textContent).toContain(
        language === 'mermaid' ? 'flowchart TB' : "name: 'clock'",
      )
    } finally {
      reopened.destroy()
    }
  })

  it('工具栏插入公式后标脏、保存，并在重开时仍渲染数学节点', async () => {
    const writes: string[] = []
    const view = await mount(async (body) => {
      writes.push(body)
    })
    const insertTab = [...view.host.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].find(
      (button) => button.textContent === '插入',
    )
    expect(insertTab).toBeDefined()
    act(() => insertTab!.click())
    const insert = view.host.querySelector<HTMLButtonElement>('button[aria-label="数学公式"]')
    expect(insert).not.toBeNull()
    act(() => insert!.click())
    expect(
      view.editor.state.doc
        .toJSON()
        .content?.some((node: { type: string }) => node.type === 'mathBlock'),
    ).toBe(true)
    expect(view.unsaved.isDirty).toBe(true)
    act(() => view.unsaved.runGuarded(() => {}))
    await act(async () => view.unsaved.resolve('save'))
    expect(writes.at(-1)).toContain('$$\nx^2 + y^2 = z^2\n$$')
    const reopened = new Editor({
      element: document.createElement('div'),
      extensions: createExtensions(),
      content: writes.at(-1),
      contentType: 'markdown',
    })
    try {
      expect(
        reopened.state.doc
          .toJSON()
          .content?.some((node: { type: string }) => node.type === 'mathBlock'),
      ).toBe(true)
      expect(reopened.view.dom.querySelector('.katex')).not.toBeNull()
    } finally {
      reopened.destroy()
    }
  })

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
