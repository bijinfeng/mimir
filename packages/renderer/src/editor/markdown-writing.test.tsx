import { Editor, Extension } from '@tiptap/core'
import { MarkdownEditor, type MarkdownAgentHandle } from '@mimir/office'
import type { MarkdownAgentServices } from '../../../office/src/agent/markdown-agent.js'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { createExtensions } from './extensions.js'
const cleanups: Array<() => void> = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))
async function boot(writeDocument: MarkdownAgentServices['writeDocument']) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let handle!: MarkdownAgentHandle
  let editor!: Editor
  const save = vi.fn<(markdown: string) => Promise<void>>(async () => {})
  const capture = Extension.create({
    name: 'captureWriter',
    onCreate() {
      editor = this.editor
    },
  })
  const services: MarkdownAgentServices = {
    fetchImage: async () => {
      throw new Error('unused')
    },
    generateImage: async () => {
      throw new Error('unused')
    },
    uploadImage: async () => {
      throw new Error('unused')
    },
    readFrontmatter: async () => '',
    writeFrontmatter: async (value) => value,
    writeDocument,
  }
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () =>
    root.render(
      <MarkdownEditor
        documentId="writer-note"
        extensions={[...createExtensions(), capture]}
        initialContent="原始正文"
        onSave={save}
        agentServices={services}
        onAgentHandleChange={(next) => {
          if (next) handle = next
        }}
      />,
    ),
  )
  await vi.waitFor(() => expect(editor).toBeDefined())
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  const click = (label: string) =>
    act(() => {
      host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click()
    })
  return { host, handle, editor, save, click }
}
it('shows incremental output outside the document, commits the full result and supports round undo', async () => {
  let finish!: (value: string) => void
  const app = await boot(async (_input, _signal, onDelta) => {
    onDelta?.('# 新草稿\n\n第一段')
    return new Promise<string>((resolve) => {
      finish = resolve
    })
  })
  let pending!: ReturnType<MarkdownAgentHandle['execute']>
  await act(async () => {
    pending = app.handle.execute(
      'write_document',
      { plan: '写指南', replaceDocument: true },
      { roundId: 'writing' },
    )
  })
  expect(app.host.querySelector('[aria-label="正在生成的 Markdown 内容"]')?.textContent).toContain(
    '第一段',
  )
  expect(app.editor.getMarkdown()).toBe('原始正文')
  expect(app.save).not.toHaveBeenCalled()
  await act(async () => {
    finish('# 新草稿\n\n完整正文')
    expect(await pending).toMatchObject({ ok: true, changed: true, data: { complete: true } })
  })
  expect(app.editor.getMarkdown()).toContain('完整正文')
  expect(app.host.querySelector('[aria-label="Markdown 写作草稿"]')).toBeNull()
  await act(async () => {
    expect(await app.handle.undoRound('writing')).toBe(true)
  })
  expect(app.editor.getMarkdown()).toBe('原始正文')
})
it.each([true, false])(
  'lets the user keep or discard interrupted output (keep=%s)',
  async (keep) => {
    const app = await boot((_input, signal, onDelta) => {
      onDelta?.('部分正文')
      return new Promise((_, reject) =>
        signal!.addEventListener('abort', () => reject(new Error('stopped')), { once: true }),
      )
    })
    let pending!: ReturnType<MarkdownAgentHandle['execute']>
    await act(async () => {
      pending = app.handle.execute('write_document', { plan: '写指南', replaceDocument: true })
    })
    app.host.querySelector<HTMLButtonElement>('button[aria-label="停止笔记写作"]')!.focus()
    app.click('停止笔记写作')
    await act(async () => {})
    expect(app.editor.getMarkdown()).toBe('原始正文')
    app.click(keep ? '保留部分内容' : '丢弃笔记草稿')
    await act(async () => {
      expect(await pending).toMatchObject(
        keep
          ? { ok: true, changed: true, data: { complete: false } }
          : { ok: false, changed: false },
      )
    })
    expect(app.editor.getMarkdown()).toBe(keep ? '部分正文' : '原始正文')
    await vi.waitFor(() => expect(document.activeElement).toBe(app.editor.view.dom))
  },
)
it('disables partial apply after a manual edit and rejects a late full result', async () => {
  let finish!: (value: string) => void
  const app = await boot(async (_input, _signal, onDelta) => {
    onDelta?.('旧版本草稿')
    return new Promise<string>((resolve) => {
      finish = resolve
    })
  })
  let pending!: ReturnType<MarkdownAgentHandle['execute']>
  await act(async () => {
    pending = app.handle.execute('write_document', { plan: '写指南', replaceDocument: true })
  })
  act(() => app.editor.commands.setContent('人工修改'))
  await act(async () => {
    finish('旧版本完整结果')
    expect(await pending).toMatchObject({ ok: false, changed: false })
  })
  expect(app.editor.getMarkdown()).toBe('人工修改')
})
it('cancels pending partial choice when the agent round is stopped', async () => {
  const controller = new AbortController()
  const app = await boot(async (_input, _signal, onDelta) => {
    onDelta?.('部分')
    throw new Error('断流')
  })
  let pending!: ReturnType<MarkdownAgentHandle['execute']>
  await act(async () => {
    pending = app.handle.execute(
      'write_document',
      { plan: '写指南', replaceDocument: true },
      { signal: controller.signal },
    )
  })
  expect(app.host.querySelector('button[aria-label="保留部分内容"]')).not.toBeNull()
  await act(async () => {
    controller.abort()
    expect(await pending).toMatchObject({ ok: false, changed: false })
  })
  expect(app.host.querySelector('[aria-label="Markdown 写作草稿"]')).toBeNull()
  expect(app.editor.getMarkdown()).toBe('原始正文')
})
