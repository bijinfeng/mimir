/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Editor } from '@tiptap/core'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import type { DocxAgentHandle } from '../agent/docx-agent.js'
import { DocxEditor } from './DocxEditor.js'
import { designFixture } from './docx-design-test-fixture.js'
import { downloadDocxSnapshot } from './docx-output.js'
import { OFFICE_MIME } from './types.js'

const control = vi.hoisted(() => ({ afterSave: null as (() => Promise<void>) | null }))
vi.mock('../docx.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../docx.js')>()
  return {
    ...actual,
    openDocx: async (bytes: Uint8Array) => {
      const session = await actual.openDocx(bytes),
        save = session.save
      session.save = async (...args) => {
        const result = await save(...args)
        await control.afterSave?.()
        return result
      }
      return session
    },
  }
})
const cleanups: (() => void)[] = []
afterEach(() => {
  control.afterSave = null
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.restoreAllMocks()
})
async function settle(done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i++)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 2)))
  expect(done()).toBe(true)
}
async function click(host: HTMLElement, label: string) {
  const node = host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!
  expect(node).not.toBeNull()
  expect(node.disabled).toBe(false)
  await act(async () => {
    node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    node.click()
  })
}
async function tab(host: HTMLElement, text: string) {
  await act(async () => {
    Array.from(host.querySelectorAll<HTMLElement>('[role="tab"]'))
      .find((el) => el.textContent === text)!
      .click()
  })
}
async function boot() {
  const bytes = await designFixture(),
    saved = vi.fn<() => Promise<void>>(async () => {}),
    downloaded: Blob[] = [],
    names: string[] = []
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    downloaded.push(blob as Blob)
    return 'blob:docx-snapshot'
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download)
  })
  const host = document.createElement('div'),
    root = createRoot(host)
  document.body.append(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const io = { load: async () => bytes, save: saved }
  let handle: DocxAgentHandle | null = null
  const render = (documentId: string) =>
    act(async () =>
      root.render(
        <DocxEditor
          documentId={documentId}
          io={io}
          onAgentHandleChange={(value) => {
            handle = value
          }}
        />,
      ),
    )
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await render('snapshot-a')
  await settle(() => !!handle)
  const editor = (host.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor
  return { host, bytes, saved, downloaded, names, editor, render, handle: () => handle! }
}
async function xml(blob: Blob) {
  const zip = await JSZip.loadAsync(new Uint8Array(await blob.arrayBuffer()))
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((f) => !f.dir)
        .map(async (f) => [f.name, await f.async('string')] as const),
    ),
  )
}
it('exports unsaved text, header and native design while preserving the library baseline and history', async () => {
  const app = await boot(),
    { host, editor } = app
  act(() => {
    editor.commands.setTextSelection(1)
    editor.commands.insertContent('Draft copy ')
  })
  await act(async () => {
    await app.handle().execute('set_header_footer', { kind: 'header', text: 'Unsaved header' })
    await app.handle().execute('add_comment', { blockIndex: 0, comment: 'Unsaved comment' })
    await app.handle().execute('insert_footnote', { blockIndex: 0, text: 'Unsaved footnote' })
    await app.handle().execute('insert_endnote', { blockIndex: 0, text: 'Unsaved endnote' })
  })
  await tab(host, '设计')
  await click(host, '主题与字体')
  await act(async () => {
    Array.from(host.querySelectorAll<HTMLButtonElement>('[aria-label="主题预设"] button'))
      .find((button) => button.textContent === 'AaIon')!
      .click()
  })
  await click(host, '应用设计')
  await tab(host, '视图')
  const version = app.handle().getVersion(),
    before = editor.state.doc.toJSON()
  await click(host, '导出当前 DOCX 副本')
  await settle(() => app.downloaded.length === 1)
  const output = await xml(app.downloaded[0]!)
  expect(app.names).toEqual(['document-copy.docx'])
  expect(app.downloaded[0]!.type).toBe(OFFICE_MIME.docx)
  expect(output['word/document.xml']).toContain('Draft copy ')
  expect(
    Object.entries(output).some(
      ([name, value]) => name.includes('header') && value.includes('Unsaved header'),
    ),
  ).toBe(true)
  expect(output['word/theme/theme1.xml']).toContain('Century Gothic')
  expect(output['word/comments.xml']).toContain('Unsaved comment')
  expect(output['word/footnotes.xml']).toContain('Unsaved footnote')
  expect(output['word/endnotes.xml']).toContain('Unsaved endnote')
  expect(editor.state.doc.toJSON()).toEqual(before)
  expect(app.handle().getVersion()).toBe(version)
  expect(host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')!.disabled).toBe(false)
  expect(app.saved).not.toHaveBeenCalled()
  await click(host, '撤销 (Ctrl+Z)')
  expect(editor.state.doc.toJSON()).not.toEqual(before)
  await click(host, '重做 (Ctrl+Shift+Z)')
  expect(editor.state.doc.toJSON()).toEqual(before)
  act(() => {
    editor.commands.insertContent('Second export ')
  })
  await click(host, '导出当前 DOCX 副本')
  await settle(() => app.downloaded.length === 2)
  expect((await xml(app.downloaded[1]!))['word/document.xml']).toContain('Second export ')
  expect(app.saved).not.toHaveBeenCalled()
})
it('rejects a late export after an intervening edit and permits a fresh retry', async () => {
  const app = await boot()
  let release!: () => void,
    entered = false
  control.afterSave = () => {
    entered = true
    return new Promise<void>((resolve) => {
      release = resolve
    })
  }
  await tab(app.host, '视图')
  await click(app.host, '导出当前 DOCX 副本')
  await settle(() => entered)
  act(() => app.editor.commands.insertContent('Newer edit'))
  await act(async () => release())
  await settle(() =>
    app.host.textContent!.includes('导出失败：文档或保护状态已变化，请重新保存或导出'),
  )
  expect(app.downloaded).toHaveLength(0)
  expect(app.saved).not.toHaveBeenCalled()
  control.afterSave = null
  await click(app.host, '导出当前 DOCX 副本')
  await settle(() => app.downloaded.length === 1)
  expect((await xml(app.downloaded[0]!))['word/document.xml']).toContain('Newer edit')
})
it('prevents same-tick duplicate downloads and ignores old document results', async () => {
  const app = await boot()
  let release!: () => void,
    calls = 0
  control.afterSave = () => {
    calls++
    return new Promise<void>((resolve) => {
      release = resolve
    })
  }
  await tab(app.host, '视图')
  const button = app.host.querySelector<HTMLButtonElement>('[aria-label="导出当前 DOCX 副本"]')!
  await act(async () => {
    button.click()
    button.click()
  })
  await settle(() => calls > 0)
  expect(calls).toBe(1)
  const oldHandle = app.handle()
  await app.render('snapshot-b')
  await settle(() => app.handle() !== oldHandle && !!app.handle())
  await act(async () => release())
  expect(calls).toBe(1)
  expect(app.downloaded).toHaveLength(0)
  expect(app.saved).not.toHaveBeenCalled()
})
it('reports a generation error without changing dirty or history', async () => {
  const app = await boot()
  act(() => app.editor.commands.insertContent('Retain draft'))
  const before = app.editor.state.doc.toJSON(),
    version = app.handle().getVersion()
  control.afterSave = async () => {
    throw new Error('fixture writer failure')
  }
  await tab(app.host, '视图')
  await click(app.host, '导出当前 DOCX 副本')
  await settle(() => app.host.textContent!.includes('导出失败：fixture writer failure'))
  expect(app.downloaded).toHaveLength(0)
  expect(app.saved).not.toHaveBeenCalled()
  expect(app.editor.state.doc.toJSON()).toEqual(before)
  expect(app.handle().getVersion()).toBe(version)
  expect(app.host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')!.disabled).toBe(false)
})
it('requires pending AI drafts to be resolved before and during snapshot generation', async () => {
  const app = await boot(),
    handle = app.handle(),
    version = handle.getVersion()
  await tab(app.host, '视图')
  act(() => {
    handle.beginDraft('before-export')
    handle.appendDraft('before-export', 'Pending text')
  })
  await click(app.host, '导出当前 DOCX 副本')
  expect(app.host.textContent).toContain('请先保留或丢弃 AI 草稿，再导出副本')
  expect(app.downloaded).toHaveLength(0)
  act(() => handle.discardDraft('before-export'))
  let release!: () => void,
    entered = false
  control.afterSave = () => {
    entered = true
    return new Promise<void>((resolve) => {
      release = resolve
    })
  }
  await click(app.host, '导出当前 DOCX 副本')
  await settle(() => entered)
  act(() => handle.beginDraft('during-export'))
  await act(async () => release())
  await settle(() => app.host.textContent!.includes('文档已变化，请重新导出副本'))
  expect(app.downloaded).toHaveLength(0)
  expect(handle.getVersion()).toBe(version)
  act(() => handle.discardDraft('during-export'))
  control.afterSave = null
  await click(app.host, '导出当前 DOCX 副本')
  await settle(() => app.downloaded.length === 1)
  expect(app.saved).not.toHaveBeenCalled()
  expect(app.host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')!.disabled).toBe(true)
})
it('allows the next document to export while an old request finishes, retaining the new busy state', async () => {
  const app = await boot(),
    releases: (() => void)[] = []
  control.afterSave = () =>
    new Promise<void>((resolve) => {
      releases.push(resolve)
    })
  try {
    await tab(app.host, '视图')
    await click(app.host, '导出当前 DOCX 副本')
    await settle(() => releases.length === 1)
    const oldHandle = app.handle()
    await app.render('snapshot-b')
    await settle(() => !!app.handle() && app.handle() !== oldHandle)
    expect(app.handle().documentId).toBe('snapshot-b')
    expect(app.handle().getVersion()).toBe(0)
    await tab(app.host, '视图')
    await click(app.host, '导出当前 DOCX 副本')
    await settle(() => releases.length === 2)
    await act(async () => releases[0]!())
    expect(app.downloaded).toHaveLength(0)
    expect(
      app.host.querySelector<HTMLButtonElement>('[aria-label="导出当前 DOCX 副本"]')!.disabled,
    ).toBe(true)
    await act(async () => releases[1]!())
    await settle(() => app.downloaded.length === 1)
    expect(
      app.host.querySelector<HTMLButtonElement>('[aria-label="导出当前 DOCX 副本"]')!.disabled,
    ).toBe(false)
    expect(app.handle().getVersion()).toBe(0)
    expect(app.saved).not.toHaveBeenCalled()
  } finally {
    await act(async () => releases.forEach((release) => release()))
  }
})
it('releases the generated blob URL even if the download click fails', () => {
  vi.useFakeTimers()
  try {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:failed-export')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('download blocked')
    })
    expect(() => downloadDocxSnapshot(new Uint8Array([1, 2, 3]))).toThrow('download blocked')
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:failed-export')
  } finally {
    vi.useRealTimers()
  }
})
