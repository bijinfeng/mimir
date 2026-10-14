/** @vitest-environment happy-dom */
import { Extension, type Editor } from '@tiptap/core'
import { MarkdownEditor } from '@mimir/office'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExtensions } from './extensions.js'

const mounted: Array<() => void> = []
afterEach(() => {
  for (const unmount of mounted) unmount()
  mounted.length = 0
})

async function mount(onUploadImage?: (file: File) => Promise<{ url: string; name: string }>) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let editor!: Editor
  const capture = Extension.create({
    name: 'captureSlashImageEditor',
    onCreate() {
      editor = this.editor
    },
  })
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () => {
    root.render(
      <MarkdownEditor
        documentId="slash-image"
        extensions={[...createExtensions(), capture]}
        initialContent=""
        onSave={async () => {}}
        onUploadImage={onUploadImage}
      />,
    )
  })
  await vi.waitFor(() => expect(editor).toBeDefined())
  mounted.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return { host, editor }
}

async function typeSlash(host: HTMLElement, editor: Editor, hasImage = true) {
  act(() => editor.commands.insertContent('/image'))
  await act(async () => {
    await new Promise((tick) => setTimeout(tick, 0))
  })
  await vi.waitFor(() => {
    const menu = host.querySelector('.mimir-markdown-slash')
    expect(menu).not.toBeNull()
    expect(menu?.textContent).toContain(hasImage ? '图片' : '没有匹配的命令')
  })
}

function picker(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('body > input[type=file]')
  if (!input) throw new Error('slash image picker did not open')
  return input
}

async function chooseFile(name: string) {
  const input = picker()
  Object.defineProperty(input, 'files', {
    value: [new File(['x'], name, { type: 'image/png' })],
    configurable: true,
  })
  await act(async () => {
    input.dispatchEvent(new Event('change'))
    await new Promise((tick) => setTimeout(tick, 0))
  })
}

describe('Markdown /image with the host dialect', () => {
  it('opens from Enter, uploads, and writes an image into the live Markdown document', async () => {
    const uploaded: string[] = []
    const { host, editor } = await mount(async (file) => {
      uploaded.push(file.name)
      return { url: '/api/documents/img-1/file', name: file.name }
    })
    await typeSlash(host, editor)

    act(() => {
      editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    picker()
    expect(editor.getMarkdown()).toBe('/image')
    await chooseFile('图表.png')

    expect(uploaded).toEqual(['图表.png'])
    expect(editor.getMarkdown()).toContain('![图表.png](/api/documents/img-1/file)')
    expect(
      host.querySelector<HTMLImageElement>('.mimir-markdown-body img')?.getAttribute('src'),
    ).toBe('/api/documents/img-1/file')
    expect(document.querySelector('body > input[type=file]')).toBeNull()
  })

  it('cancel leaves /image untouched and returns focus to the editor', async () => {
    const { host, editor } = await mount(async (file) => ({ url: '/unused', name: file.name }))
    await typeSlash(host, editor)
    const item = [...host.querySelectorAll<HTMLElement>('[role=menuitem]')].find((candidate) =>
      candidate.textContent?.includes('图片'),
    )
    expect(item).toBeDefined()
    act(() => item!.click())
    act(() => picker().dispatchEvent(new Event('cancel')))

    expect(editor.getMarkdown()).toBe('/image')
    expect(document.querySelector('body > input[type=file]')).toBeNull()
    await vi.waitFor(() => expect(editor.isFocused).toBe(true))
  })

  it('hides the image command without an upload service', async () => {
    const { host, editor } = await mount()
    await typeSlash(host, editor, false)
    expect(host.querySelector('.mimir-markdown-slash')?.textContent).toContain('没有匹配的命令')
  })

  it('keeps /image when the upload fails', async () => {
    const { host, editor } = await mount(async () => {
      throw new Error('文件太大')
    })
    await typeSlash(host, editor)
    act(() => {
      editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await chooseFile('大图.png')

    expect(editor.getMarkdown()).toBe('/image')
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('文件太大')
  })

  it('does not insert at stale offsets if the note changes during upload', async () => {
    let finishUpload!: (value: { url: string; name: string }) => void
    const { host, editor } = await mount(
      () =>
        new Promise((resolve) => {
          finishUpload = resolve
        }),
    )
    await typeSlash(host, editor)
    act(() => {
      editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await chooseFile('延迟.png')
    act(() => editor.commands.insertContent('后来写的字'))
    await act(async () => finishUpload({ url: '/api/documents/late/file', name: '延迟.png' }))

    expect(editor.getMarkdown()).toContain('后来写的字')
    expect(editor.getMarkdown()).not.toContain('![')
    expect(host.querySelector('.mimir-editor__status')?.textContent).toContain('笔记内容已变化')
  })
})
