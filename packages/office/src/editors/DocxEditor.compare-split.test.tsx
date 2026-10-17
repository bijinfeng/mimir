/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { Editor } from '@tiptap/core'
import { undoDepth, redoDepth } from '@tiptap/pm/history'
import JSZip from 'jszip'
import { DocxEditor } from './DocxEditor.js'
import { DocxSplitView } from './DocxSplitView.js'
import { applyDocxList, docxListDefinitions, docxListTarget } from './docx-lists.js'
import { designFixture } from './docx-design-test-fixture.js'
import type { DocxAgentHandle } from '../agent/docx-agent.js'
import type { PmDocJson } from '../docx.js'
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})
async function settle(done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i++)
    await act(async () => new Promise((r) => setTimeout(r, 2)))
  expect(done()).toBe(true)
}
async function click(host: HTMLElement, label: string) {
  const node = [...host.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`)].find(
    (el) => !el.closest('[hidden]'),
  )!
  expect(node).toBeDefined()
  expect(node.disabled).toBe(false)
  await act(async () => {
    node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    node.click()
  })
}
async function tab(host: HTMLElement, label: string) {
  await act(async () => {
    ;[...host.querySelectorAll<HTMLElement>('[role="tab"]')]
      .find((el) => el.textContent === label)!
      .click()
  })
}
async function boot(fixture?: Uint8Array) {
  const bytes = fixture ?? (await designFixture()),
    saved = vi.fn<(bytes: Uint8Array) => Promise<void>>(),
    dirty = vi.fn<(dirty: boolean) => void>(),
    host = document.createElement('div'),
    root = createRoot(host)
  document.body.append(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  let handle: DocxAgentHandle | null = null
  const render = (documentId: string) =>
    act(async () =>
      root.render(
        <DocxEditor
          documentId={documentId}
          io={{ load: async () => bytes, save: saved }}
          onDirtyChange={dirty}
          onAgentHandleChange={(value) => {
            handle = value
          }}
        />,
      ),
    )
  await render('compare-split')
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await settle(() => !!handle)
  const editor = (host.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor
  return { host, editor, bytes, saved, dirty, render, handle: () => handle! }
}
async function choose(host: HTMLElement, bytes: Uint8Array, wait?: Promise<ArrayBuffer>) {
  const input = host.querySelector<HTMLInputElement>('[aria-label="选择对比 DOCX"]')!
  const file = new File([new Uint8Array(bytes)], 'reference.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  Object.defineProperty(file, 'arrayBuffer', {
    configurable: true,
    value: () => wait ?? Promise.resolve(new Uint8Array(bytes).buffer),
  })
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
}
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((f) => !f.dir)
        .map(async (f) => [f.name, await f.async('uint8array')]),
    ),
  )
}
it('keeps one editor/scroll/selection/history/version and exact ZIP when opening readonly split and local comparison', async () => {
  const app = await boot(),
    { host, editor } = app,
    handle = app.handle(),
    pm = editor.view.dom,
    scroll = host.querySelector('.mimir-docx-scroll'),
    before = editor.getJSON(),
    selection = editor.state.selection.toJSON(),
    version = handle.getVersion(),
    history = [undoDepth(editor.state), redoDepth(editor.state)]
  await tab(host, '视图')
  await click(host, '拆分视图')
  expect(host.querySelector('[aria-label="拆分只读副本"]')?.textContent).toContain('First section')
  expect(
    host.querySelector('[aria-label="只读副本正文"]')?.getAttribute('contenteditable'),
  ).toBeNull()
  await click(host, 'Web 布局')
  await click(host, '阅读模式')
  expect(host.querySelector('[aria-label="拆分只读副本"]')).not.toBeNull()
  await click(host, '退出阅读模式')
  await click(host, '关闭拆分视图')
  expect(editor.view.dom).toBe(pm)
  expect(host.querySelector('.mimir-docx-scroll')).toBe(scroll)
  expect(host.querySelectorAll('.ProseMirror')).toHaveLength(1)
  await tab(host, '审阅')
  await click(host, '对比文档')
  await choose(host, app.bytes)
  await click(host, '比较文档')
  await settle(() => !!host.querySelector('[aria-label="文档差异"]'))
  expect(host.textContent).toContain('比较范围内没有文字差异')
  await act(async () =>
    host
      .querySelector('[aria-label="对比文档面板"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  )
  expect(host.querySelector('[aria-label="对比文档面板"]')).toBeNull()
  expect(document.activeElement?.getAttribute('aria-label')).toBe('对比文档')
  expect(editor.getJSON()).toEqual(before)
  expect(editor.state.selection.toJSON()).toEqual(selection)
  expect(handle.getVersion()).toBe(version)
  expect([undoDepth(editor.state), redoDepth(editor.state)]).toEqual(history)
  expect(app.dirty).not.toHaveBeenCalledWith(true)
  expect(app.saved).not.toHaveBeenCalled()
  const original = await entries(app.bytes),
    session = (await import('../docx.js')).openDocx
  expect(await entries(await (await session(app.bytes)).save(editor.getJSON()))).toEqual(original)
})
it('compares unsaved live text and permanently invalidates results through edit→undo, then synchronizes split without another history entry', async () => {
  const { host, editor, bytes, handle } = await boot()
  await act(async () => {
    editor.commands.insertContent('Unsaved ')
  })
  await tab(host, '审阅')
  await click(host, '对比文档')
  await choose(host, bytes)
  await click(host, '比较文档')
  await settle(() => !!host.querySelector('[aria-label="文档差异"]'))
  expect(host.querySelector('[aria-label="文档差异"]')?.textContent).toContain('Unsaved')
  const resultVersion = handle().getVersion()
  await act(async () => {
    editor.commands.insertContent('later')
    editor.commands.undo()
  })
  expect(handle().getVersion()).toBeGreaterThan(resultVersion)
  expect(host.querySelector('[aria-label="文档差异"]')).toBeNull()
  expect(host.textContent).toContain('原结果已失效')
  await tab(host, '视图')
  await click(host, '拆分视图')
  const history = undoDepth(editor.state)
  expect(host.querySelector('[aria-label="只读副本正文"]')?.textContent).toBe(
    editor.state.doc.textContent,
  )
  expect(undoDepth(editor.state)).toBe(history)
})
it('drops late parse results after edits/undo and closing without changing the draft', async () => {
  const { host, editor, bytes } = await boot()
  await tab(host, '审阅')
  await click(host, '对比文档')
  let resolve!: (bytes: ArrayBuffer) => void
  const pending = new Promise<ArrayBuffer>((r) => {
    resolve = r
  })
  await choose(host, bytes, pending)
  await click(host, '比较文档')
  await act(async () => {
    editor.commands.insertContent('new')
    editor.commands.undo()
  })
  const before = editor.getJSON()
  await click(host, '关闭文档属性面板')
  await act(async () => {
    resolve(new Uint8Array(bytes).buffer)
    await new Promise((r) => setTimeout(r, 30))
  })
  expect(host.querySelector('[aria-label="文档差异"]')).toBeNull()
  expect(editor.getJSON()).toEqual(before)
})
it('keeps the selected file after a read failure and ignores an older request after reselection', async () => {
  const { host, editor, bytes, handle } = await boot()
  await tab(host, '审阅')
  await click(host, '对比文档')
  await choose(host, bytes)
  const input = host.querySelector<HTMLInputElement>('[aria-label="选择对比 DOCX"]')!,
    file = input.files![0]!,
    read = vi
      .fn<() => Promise<ArrayBuffer>>()
      .mockRejectedValueOnce(new Error('read failed'))
      .mockResolvedValue(new Uint8Array(bytes).buffer),
    before = editor.getJSON(),
    version = handle().getVersion(),
    history = [undoDepth(editor.state), redoDepth(editor.state)]
  Object.defineProperty(file, 'arrayBuffer', { value: read, configurable: true })
  await click(host, '比较文档')
  await settle(() => !!host.querySelector('[role="alert"]'))
  expect(host.textContent).toContain('reference.docx')
  await click(host, '比较文档')
  await settle(() => !!host.querySelector('[aria-label="文档差异"]'))
  expect(read).toHaveBeenCalledTimes(2)
  expect(host.textContent).toContain('比较范围内没有文字差异')

  const changed = await JSZip.loadAsync(bytes),
    xml = await changed.file('word/document.xml')!.async('string')
  changed.file('word/document.xml', xml.replace('First section', 'Obsolete reference'))
  const oldBytes = await changed.generateAsync({ type: 'uint8array' })
  let resolve!: (bytes: ArrayBuffer) => void
  await choose(
    host,
    oldBytes,
    new Promise<ArrayBuffer>((r) => {
      resolve = r
    }),
  )
  await click(host, '比较文档')
  await choose(host, bytes)
  await click(host, '比较文档')
  await settle(() => !!host.querySelector('[aria-label="文档差异"]'))
  await act(async () => {
    resolve(new Uint8Array(oldBytes).buffer)
    await new Promise((r) => setTimeout(r, 30))
  })
  expect(host.textContent).toContain('比较范围内没有文字差异')
  expect(host.textContent).not.toContain('Obsolete reference')
  expect(editor.getJSON()).toEqual(before)
  expect(handle().getVersion()).toBe(version)
  expect([undoDepth(editor.state), redoDepth(editor.state)]).toEqual(history)
})
it('renders an explicit resource-free text/table whitelist, independent of untrusted attrs/marks/HTML previews', async () => {
  const host = document.createElement('div'),
    root = createRoot(host)
  document.body.append(host)
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  const p: PmDocJson = {
    type: 'docParagraph',
    attrs: { id: 'dup', contenteditable: true, onclick: 'evil()' },
    content: [
      {
        type: 'text',
        text: '<script>safe text</script>',
        marks: [{ type: 'link', attrs: { href: 'https://foreign.invalid' } }],
      },
      { type: 'hardBreak' },
      { type: 'text', text: 'next' },
    ],
  }
  await act(async () =>
    root.render(
      <DocxSplitView
        doc={{
          type: 'doc',
          content: [
            p,
            { type: 'docBlock', attrs: { preview: '<iframe src="https://foreign.invalid" />' } },
            {
              type: 'docTable',
              content: [{ type: 'docTableRow', content: [{ type: 'docTableCell', content: [p] }] }],
            },
          ],
        }}
        onClose={() => {}}
      />,
    ),
  )
  expect(
    host.querySelectorAll('a,img,iframe,script,form,input,[id],[contenteditable],[onclick]'),
  ).toHaveLength(0)
  expect(host.textContent).toContain('<script>safe text</script>')
  expect(host.querySelector('table td')?.textContent).toContain('next')
  expect(host.textContent).toContain('复杂对象或引用未显示')
})

it('compares the live unsaved table cell against parsed DOCX text rather than the original table preview', async () => {
  const zip = await JSZip.loadAsync(await designFixture())
  const xml = await zip.file('word/document.xml')!.async('string')
  const table =
    '<w:tbl><w:tblPr><w:tblW w:w="3000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Original cell</w:t></w:r></w:p><w:p/></w:tc></w:tr></w:tbl>'
  zip.file('word/document.xml', xml.replace('<w:body>', '<w:body>' + table))
  const app = await boot(await zip.generateAsync({ type: 'uint8array' })),
    { host, editor } = app
  let position = -1
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === 'Original cell') position = pos
  })
  expect(position).toBeGreaterThan(0)
  await act(async () => {
    editor.view.dispatch(
      editor.state.tr.insertText('Live cell', position, position + 'Original cell'.length),
    )
  })
  const before = editor.getJSON(),
    history = undoDepth(editor.state),
    version = app.handle().getVersion()
  await tab(host, '审阅')
  await click(host, '对比文档')
  await choose(host, app.bytes)
  await click(host, '比较文档')
  await settle(() => !!host.querySelector('[aria-label="文档差异"]'))
  const list = host.querySelector('[aria-label="文档差异"]')!
  expect(list.textContent).toContain('Live cell')
  expect(list.textContent).toContain('Original cell')
  expect(list.textContent).toContain('（空段落）')
  expect(editor.getJSON()).toEqual(before)
  expect(undoDepth(editor.state)).toBe(history)
  expect(app.handle().getVersion()).toBe(version)
})
it('cannot revive a pending result or the split after source identity A→B→A', async () => {
  const app = await boot(),
    { host } = app
  await tab(host, '视图')
  await click(host, '拆分视图')
  await tab(host, '审阅')
  await click(host, '对比文档')
  let resolve!: (bytes: ArrayBuffer) => void
  await choose(
    host,
    app.bytes,
    new Promise<ArrayBuffer>((r) => {
      resolve = r
    }),
  )
  await click(host, '比较文档')
  await app.render('other')
  await settle(() => !!app.handle() && !!host.querySelector('.ProseMirror'))
  await app.render('compare-split')
  await settle(() => !!app.handle() && !!host.querySelector('.ProseMirror'))
  await act(async () => {
    resolve(new Uint8Array(app.bytes).buffer)
    await new Promise((r) => setTimeout(r, 30))
  })
  expect(host.querySelector('[aria-label="对比文档面板"]')).toBeNull()
  expect(host.querySelector('[aria-label="文档差异"]')).toBeNull()
  expect(host.querySelector('[aria-label="拆分只读副本"]')).toBeNull()
})
it('mirrors real live bold/italic/heading formatting and scrolls independently, with Escape returning to the mounted source control', async () => {
  const { host, editor, handle } = await boot()
  await act(async () => {
    editor.commands.setTextSelection({ from: 1, to: 6 })
    editor.commands.toggleMark('bold')
    editor.commands.toggleMark('italic')
    editor.commands.setNode('docHeading', { level: 2, align: 'center' })
  })
  const before = editor.getJSON(),
    version = handle().getVersion(),
    history = undoDepth(editor.state),
    selection = editor.state.selection.toJSON()
  await tab(host, '视图')
  await click(host, '拆分视图')
  const copy = host.querySelector<HTMLElement>('[aria-label="只读副本正文"]')!,
    main = host.querySelector<HTMLElement>('.mimir-docx-scroll')!
  expect(copy.querySelector('h2 strong em')).not.toBeNull()
  expect((copy.querySelector('h2') as HTMLElement).style.textAlign).toBe('center')
  await act(async () => {
    main.scrollTop = 35
    copy.scrollTop = 12
    copy.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  expect(main.scrollTop).toBe(35)
  expect(editor.getJSON()).toEqual(before)
  expect(editor.state.selection.toJSON()).toEqual(selection)
  expect(handle().getVersion()).toBe(version)
  expect(undoDepth(editor.state)).toBe(history)
  await act(async () => {
    copy.focus()
    copy.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
  })
  expect(host.querySelector('[aria-label="拆分只读副本"]')).toBeNull()
  expect(document.activeElement?.getAttribute('aria-label')).toBe('拆分视图')
})
it('renders heading levels above six with their logical level and keeps safe inline and cell presentation', async () => {
  const host = document.createElement('div'),
    root = createRoot(host)
  document.body.append(host)
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  const text = {
    type: 'text',
    text: 'Nine',
    marks: [
      { type: 'bold' },
      {
        type: 'docTextStyle',
        attrs: { sizeHalfPoints: 28, color: '123456', font: '等线', vertAlign: 'subscript' },
      },
    ],
  }
  await act(async () =>
    root.render(
      <DocxSplitView
        doc={{
          type: 'doc',
          content: [{ type: 'docHeading', attrs: { level: 9, align: 'right' }, content: [text] }],
        }}
        onClose={() => {}}
      />,
    ),
  )
  const heading = host.querySelector<HTMLElement>('[role="heading"][aria-level="9"]')!
  expect(heading.textContent).toBe('Nine')
  expect(heading.style.textAlign).toBe('right')
  expect(heading.querySelector('strong sub span')?.getAttribute('style')).toContain(
    'font-size: 14pt',
  )
})

it('mirrors native restarted and multilevel numbering without rewriting the document or history', async () => {
  const zip = await JSZip.loadAsync(await designFixture()),
    xml = await zip.file('word/document.xml')!.async('string'),
    items = [0, 1, 0]
      .map(
        (level, index) =>
          `<w:p><w:pPr><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="17"/></w:numPr></w:pPr><w:r><w:t>Item ${index}</w:t></w:r></w:p>`,
      )
      .join('')
  zip.file('word/document.xml', xml.replace('<w:body>', `<w:body>${items}`))
  zip.file(
    'word/numbering.xml',
    '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="7"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="2"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2)"/></w:lvl></w:abstractNum><w:num w:numId="17"><w:abstractNumId w:val="7"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="5"/></w:lvlOverride></w:num></w:numbering>',
  )
  const app = await boot(await zip.generateAsync({ type: 'uint8array' })),
    { host, editor } = app,
    before = editor.getJSON(),
    version = app.handle().getVersion(),
    history = [undoDepth(editor.state), redoDepth(editor.state)]
  expect(
    [...host.querySelectorAll('.ProseMirror [data-marker]')].map((item) =>
      item.getAttribute('data-marker'),
    ),
  ).toEqual(['5.', 'b)', '6.'])
  await tab(host, '视图')
  await click(host, '拆分视图')
  const markers = () =>
    [...host.querySelectorAll('.mimir-docx-split__marker')].map((item) => item.textContent)
  expect(markers()).toEqual(['5.', 'b)', '6.'])
  expect(host.querySelector('.mimir-docx-split__list')?.hasAttribute('start')).toBe(false)
  expect(host.querySelector('[aria-label="只读副本正文"]')?.textContent).not.toContain('暂未显示')
  expect(editor.getJSON()).toEqual(before)
  expect(app.handle().getVersion()).toBe(version)
  expect([undoDepth(editor.state), redoDepth(editor.state)]).toEqual(history)
  expect(app.dirty).not.toHaveBeenCalledWith(true)
  await act(async () => {
    editor.commands.setTextSelection(1)
    const def = docxListDefinitions(editor).get('17')!
    applyDocxList(editor, docxListTarget(editor), {
      kind: 'definition',
      baseNumId: '17',
      level: 0,
      levels: Array.from({ length: 9 }, (_, level) => ({
        ...(def.levels[level] ?? def.levels[0]!),
      })),
      patches: { 0: { start: 9 } },
    })
  })
  expect(markers()).toEqual(['9.', 'b)', '6.'])
  await act(async () => {
    editor.commands.undo()
  })
  expect(markers()).toEqual(['5.', 'b)', '6.'])
  await act(async () => {
    editor.commands.setTextSelection(1)
    editor.commands.insertContent('New live text ')
  })
  expect(markers()).toEqual(['5.', 'b)', '6.'])
  await act(async () => {
    editor.commands.undo()
  })
  expect(markers()).toEqual(['5.', 'b)', '6.'])
  expect(
    await entries(
      await (
        await import('../docx.js')
      )
        .openDocx(app.bytes)
        .then((session) => session.save(editor.getJSON())),
    ),
  ).toEqual(await entries(app.bytes))
})
