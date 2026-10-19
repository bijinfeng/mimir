/** @vitest-environment happy-dom */
import * as privacy from '../docx-privacy.js'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Editor } from '@tiptap/core'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import type { DocxAgentHandle } from '../agent/docx-agent.js'
import { DocxEditor } from './DocxEditor.js'
import { designFixture } from './docx-design-test-fixture.js'
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const CORE = 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties'
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})
async function settle(done: () => boolean) {
  for (let i = 0; i < 400 && !done(); i++)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 3)))
  expect(done()).toBe(true)
}
async function click(host: HTMLElement, label: string) {
  const button = host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!
  expect(button).toBeTruthy()
  expect(button.disabled).toBe(false)
  await act(async () => {
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    button.click()
  })
}
async function tab(host: HTMLElement, text: string) {
  await act(async () =>
    [...host.querySelectorAll<HTMLElement>('[role="tab"]')]
      .find((node) => node.textContent === text)!
      .click(),
  )
}
async function bytesFixture(enabled = true, protection?: string) {
  const zip = await JSZip.loadAsync(await designFixture())
  const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
  zip.file(
    'word/_rels/document.xml.rels',
    rels
      .replace(/<Relationship\b[^>]*Type="[^"]*\/settings"[^>]*\/>/g, '')
      .replace(
        '</Relationships>',
        `<Relationship Id="privacy" Type="${R}/settings" Target="privacy-settings.xml"/></Relationships>`,
      ),
  )
  zip.file(
    'word/privacy-settings.xml',
    `<w:settings xmlns:w="${W}"><w:removePersonalInformation w:val="${enabled ? 'on' : 'off'}"/>${protection ? `<w:documentProtection w:edit="${protection}" w:enforcement="1"/>` : ''}</w:settings>`,
  )
  const roots = await zip.file('_rels/.rels')!.async('string')
  zip.file(
    '_rels/.rels',
    roots
      .replace(/<Relationship\b[^>]*Type="[^"]*\/metadata\/core-properties"[^>]*\/>/g, '')
      .replace(
        '</Relationships>',
        `<Relationship Id="privacyCore" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="properties/privacy-core.xml"/></Relationships>`,
      ),
  )
  zip.file(
    'properties/privacy-core.xml',
    `<p:coreProperties xmlns:p="${CORE}" xmlns:d="http://purl.org/dc/elements/1.1/" xmlns:x="urn:opaque"><d:creator>Alice</d:creator><p:lastModifiedBy>Bob</p:lastModifiedBy><x:creator>Keep</x:creator><p:revision>42</p:revision></p:coreProperties>`,
  )
  zip.file('customXml/privacy-opaque.xml', `<w:custom xmlns:w="${W}" w:author="Custom Keep"/>`)
  return zip.generateAsync({ type: 'uint8array' })
}
async function xml(bytes: Uint8Array, path: string) {
  return (await JSZip.loadAsync(bytes)).file(path)!.async('string')
}
async function boot(enabled = true, protection?: string) {
  const bytes = await bytesFixture(enabled, protection),
    saved = vi.fn<(bytes: Uint8Array) => Promise<void>>().mockResolvedValue(undefined),
    dirty = vi.fn<(value: boolean) => void>(),
    downloaded: Blob[] = []
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    downloaded.push(blob as Blob)
    return 'blob:privacy-copy'
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const host = document.createElement('div'),
    root = createRoot(host)
  document.body.append(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  let handle: DocxAgentHandle | null = null
  const render = async (documentId = 'privacy-a', sourceBytes = bytes) => {
    await act(async () =>
      root.render(
        <DocxEditor
          documentId={documentId}
          io={{ load: async () => sourceBytes, save: saved }}
          onDirtyChange={dirty}
          onAgentHandleChange={(value) => {
            handle = value
          }}
        />,
      ),
    )
    await settle(() => handle?.documentId === documentId && !!host.querySelector('.ProseMirror'))
  }
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await render()
  const editor = (host.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor
  return { host, bytes, saved, dirty, downloaded, editor, render, handle: () => handle! }
}
it('actual Editor export and library save share the native scrub, preserve dirty/history, and reopen scrubbed metadata', async () => {
  const app = await boot(),
    { host, editor } = app
  expect(host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')!.disabled).toBe(true)
  expect(app.dirty).not.toHaveBeenCalledWith(true)
  const initial = editor.getJSON(),
    version = app.handle().getVersion()
  await tab(host, '视图')
  await click(host, '导出当前 DOCX 副本')
  await settle(() => app.downloaded.length === 1)
  const exported = new Uint8Array(await app.downloaded[0]!.arrayBuffer())
  expect(await xml(exported, 'properties/privacy-core.xml')).toContain(
    '<d:creator></d:creator><p:lastModifiedBy></p:lastModifiedBy>',
  )
  expect(await xml(exported, 'properties/privacy-core.xml')).toContain(
    '<x:creator>Keep</x:creator><p:revision>42</p:revision>',
  )
  expect(await xml(exported, 'customXml/privacy-opaque.xml')).toBe(
    await xml(app.bytes, 'customXml/privacy-opaque.xml'),
  )
  expect(editor.getJSON()).toEqual(initial)
  expect(app.handle().getVersion()).toBe(version)
  expect(app.saved).not.toHaveBeenCalled()
  expect(host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')!.disabled).toBe(true)
  act(() => {
    editor.commands.setTextSelection(1)
    editor.commands.insertContent('Privacy draft ')
  })
  await click(host, '保存到库')
  await settle(() => app.saved.mock.calls.length === 1)
  const saved = app.saved.mock.calls[0]![0]
  expect(await xml(saved, 'word/document.xml')).toContain('Privacy draft ')
  expect(await xml(saved, 'properties/privacy-core.xml')).toContain('<d:creator></d:creator>')
  await click(host, '撤销 (Ctrl+Z)')
  expect(editor.getJSON()).toEqual(initial)
  await click(host, '重做 (Ctrl+Shift+Z)')
  expect(editor.getText()).toContain('Privacy draft ')
  await click(host, '保存到库')
  await settle(() => app.saved.mock.calls.length === 2)
  const again = app.saved.mock.calls[1]![0]
  expect(await xml(again, 'properties/privacy-core.xml')).toBe(
    await xml(saved, 'properties/privacy-core.xml'),
  )
})

async function privacyPanel(app: Awaited<ReturnType<typeof boot>>) {
  if (!app.host.querySelector('.mimir-docx-privacy')) {
    await tab(app.host, '审阅')
    await click(app.host, '个人信息')
  }
  await settle(
    () => !!app.host.querySelector('[role="switch"]') && !app.host.textContent?.includes('读取中…'),
  )
  if (app.host.querySelector('[aria-label="重新读取设置"]')) await click(app.host, '重新读取设置')
}
async function setPrivacy(app: Awaited<ReturnType<typeof boot>>, value: boolean) {
  await privacyPanel(app)
  const control = app.host.querySelector<HTMLButtonElement>('[role="switch"]')!
  expect(control.disabled).toBe(false)
  if ((control.getAttribute('aria-checked') === 'true') !== value)
    await act(async () => control.click())
  await click(app.host, '应用设置')
}
async function saveAndWait(app: Awaited<ReturnType<typeof boot>>, count: number) {
  await click(app.host, '保存到库')
  await settle(
    () =>
      app.saved.mock.calls.length === count &&
      app.host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')!.disabled,
  )
}
it('visible native false intent is draft-only until apply, one history step, and successful scrub never restores names', async () => {
  const app = await boot(false),
    initial = app.editor.getJSON(),
    version = app.handle().getVersion()
  await privacyPanel(app)
  const control = app.host.querySelector<HTMLButtonElement>('[role="switch"]')!
  expect(control.getAttribute('aria-checked')).toBe('false')
  expect(app.host.querySelector<HTMLButtonElement>('[aria-label="应用设置"]')!.disabled).toBe(true)
  await act(async () => control.click())
  expect(app.editor.getJSON()).toEqual(initial)
  expect(app.handle().getVersion()).toBe(version)
  expect(app.dirty).not.toHaveBeenCalledWith(true)
  await click(app.host, '应用设置')
  expect(app.handle().getVersion()).toBe(version + 1)
  expect(app.editor.getJSON().attrs?.mimirPrivacy).toBe(true)
  expect(app.host.querySelector<HTMLButtonElement>('[aria-label="应用设置"]')!.disabled).toBe(true)
  await saveAndWait(app, 1)
  expect(await xml(app.saved.mock.calls[0]![0], 'properties/privacy-core.xml')).toContain(
    '<d:creator></d:creator>',
  )
  await click(app.host, '撤销 (Ctrl+Z)')
  expect(app.editor.getJSON()).toEqual(initial)
  await saveAndWait(app, 2)
  const undone = app.saved.mock.calls[1]![0]
  expect(await xml(undone, 'word/privacy-settings.xml')).toContain('w:val="off"')
  expect(await xml(undone, 'properties/privacy-core.xml')).toContain('<d:creator></d:creator>')
  expect(await xml(undone, 'customXml/privacy-opaque.xml')).toBe(
    await xml(app.bytes, 'customXml/privacy-opaque.xml'),
  )
  await click(app.host, '重做 (Ctrl+Shift+Z)')
  expect(app.editor.getJSON().attrs?.mimirPrivacy).toBe(true)
  await saveAndWait(app, 3)
  expect(await xml(app.saved.mock.calls[2]![0], 'word/privacy-settings.xml')).toContain('w:val="1"')
})
it('native true may be disabled before any successful cleanup without removing original names', async () => {
  const app = await boot(true)
  await privacyPanel(app)
  expect(app.host.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('true')
  await setPrivacy(app, false)
  await saveAndWait(app, 1)
  expect(await xml(app.saved.mock.calls[0]![0], 'properties/privacy-core.xml')).toContain(
    '<d:creator>Alice</d:creator>',
  )
  expect(await xml(app.saved.mock.calls[0]![0], 'word/privacy-settings.xml')).not.toContain(
    'removePersonalInformation',
  )
})
it('export cleanup and failed library IO do not acknowledge a persisted cleanup floor', async () => {
  const app = await boot(false)
  await setPrivacy(app, true)
  await tab(app.host, '视图')
  await click(app.host, '导出当前 DOCX 副本')
  await settle(() => app.downloaded.length === 1)
  expect(
    await xml(
      new Uint8Array(await app.downloaded[0]!.arrayBuffer()),
      'properties/privacy-core.xml',
    ),
  ).toContain('<d:creator></d:creator>')
  app.saved.mockRejectedValueOnce(new Error('privacy failed IO'))
  await click(app.host, '保存到库')
  await settle(() => app.host.textContent?.includes('privacy failed IO') === true)
  await click(app.host, '撤销 (Ctrl+Z)')
  await saveAndWait(app, 2)
  expect(await xml(app.saved.mock.calls[1]![0], 'properties/privacy-core.xml')).toContain(
    '<d:creator>Alice</d:creator>',
  )
})
it('pending true library save retains a later false intent and dirty state, then false save preserves cleanup', async () => {
  const app = await boot(false)
  let complete!: () => void
  app.saved.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve
      }),
  )
  await setPrivacy(app, true)
  await click(app.host, '保存到库')
  await settle(() => app.saved.mock.calls.length === 1)
  await setPrivacy(app, false)
  const laterVersion = app.handle().getVersion()
  await act(async () => complete())
  await settle(() => app.host.textContent?.includes('后续保存会保留这些清理') === true)
  expect(app.handle().getVersion()).toBe(laterVersion)
  expect(app.editor.getJSON().attrs?.mimirPrivacy).toBe(false)
  expect(app.host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')!.disabled).toBe(false)
  expect(app.dirty.mock.calls.at(-1)).toEqual([true])
  await saveAndWait(app, 2)
  expect(await xml(app.saved.mock.calls[1]![0], 'word/privacy-settings.xml')).toContain(
    'w:val="off"',
  )
  expect(await xml(app.saved.mock.calls[1]![0], 'properties/privacy-core.xml')).toContain(
    '<d:creator></d:creator>',
  )
})
it('body changes invalidate the panel draft and changing source cannot apply it to another document', async () => {
  const app = await boot(false)
  await privacyPanel(app)
  await act(async () => app.host.querySelector<HTMLButtonElement>('[role="switch"]')!.click())
  act(() => {
    app.editor.commands.setTextSelection(1)
    app.editor.commands.insertContent('new body')
  })
  expect(app.host.querySelector<HTMLButtonElement>('[aria-label="应用设置"]')!.disabled).toBe(true)
  expect(app.host.textContent).toContain('文档已变化，请重新读取设置')
  expect(app.host.querySelector('[aria-label="重新读取设置"]')?.textContent).toBe('重新读取设置')
  await click(app.host, '重新读取设置')
  expect(app.host.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('false')
  await app.render('privacy-b')
  await privacyPanel(app)
  expect(app.host.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('false')
  expect(app.host.querySelector<HTMLButtonElement>('[aria-label="应用设置"]')!.disabled).toBe(true)
})

it.each(['readOnly', 'forms', 'comments', 'trackedChanges'])(
  'privacy is discoverable but cannot change under %s protection',
  async (mode) => {
    const app = await boot(false, mode)
    await privacyPanel(app)
    expect(app.host.querySelector<HTMLButtonElement>('[role="switch"]')!.disabled).toBe(true)
    expect(app.host.querySelector<HTMLButtonElement>('[aria-label="应用设置"]')!.disabled).toBe(
      true,
    )
    const before = app.editor.getJSON(),
      version = app.handle().getVersion()
    act(() => app.editor.view.dispatch(app.editor.state.tr.setDocAttribute('mimirPrivacy', true)))
    expect(app.editor.getJSON()).toEqual(before)
    expect(app.handle().getVersion()).toBe(version)
    expect(app.dirty).not.toHaveBeenCalledWith(true)
  },
)
it('late native privacy read from a previous source cannot replace the next source setting', async () => {
  const actual = privacy.readNativeDocxPrivacyEnabled
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  vi.spyOn(privacy, 'readNativeDocxPrivacyEnabled').mockImplementationOnce(async (bytes) => {
    await gate
    return actual(bytes)
  })
  const app = await boot(false)
  await tab(app.host, '审阅')
  await click(app.host, '个人信息')
  expect(app.host.querySelector<HTMLButtonElement>('[role="switch"]')!.disabled).toBe(true)
  await app.render('privacy-new-source', await bytesFixture(true))
  await privacyPanel(app)
  expect(app.host.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('true')
  await act(async () => release())
  expect(app.host.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('true')
  expect(app.host.querySelector<HTMLButtonElement>('[aria-label="应用设置"]')!.disabled).toBe(true)
  expect(app.dirty).not.toHaveBeenCalledWith(true)
})
it('serializes generation and refuses a stale pre-IO document while retaining the newer privacy intent', async () => {
  const app = await boot(false),
    actual = privacy.finalizeDocxPrivacy
  let release!: () => void,
    entered = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const finalizer = vi
    .spyOn(privacy, 'finalizeDocxPrivacy')
    .mockImplementationOnce(async (...args) => {
      entered = true
      await gate
      return actual(...args)
    })
  await setPrivacy(app, true)
  await click(app.host, '保存到库')
  await settle(() => entered)
  await setPrivacy(app, false)
  expect(app.host.querySelector<HTMLButtonElement>('[aria-label="保存中…"]')!.disabled).toBe(true)
  expect(finalizer).toHaveBeenCalledOnce()
  expect(app.saved).not.toHaveBeenCalled()
  await act(async () => release())
  await settle(() => app.host.textContent?.includes('文档或保护状态已变化') === true)
  expect(app.saved).not.toHaveBeenCalled()
  expect(app.editor.getJSON().attrs?.mimirPrivacy).toBe(false)
  expect(app.dirty.mock.calls.at(-1)).toEqual([true])
  expect(app.host.textContent).not.toContain('后续保存会保留这些清理')
  await saveAndWait(app, 1)
  // No true candidate reached successful IO: no monotonic scrub floor was acknowledged.
  expect(await xml(app.saved.mock.calls[0]![0], 'properties/privacy-core.xml')).toContain(
    '<d:creator>Alice</d:creator>',
  )
  expect(await xml(app.saved.mock.calls[0]![0], 'customXml/privacy-opaque.xml')).toBe(
    await xml(app.bytes, 'customXml/privacy-opaque.xml'),
  )
})
it('library generation and IO exclude export; a later false export retains the successful true scrub without ACK', async () => {
  const app = await boot(false)
  let complete!: () => void
  app.saved.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve
      }),
  )
  await setPrivacy(app, true)
  await click(app.host, '保存到库')
  await settle(() => app.saved.mock.calls.length === 1)
  await setPrivacy(app, false)
  const finalizer = vi.spyOn(privacy, 'finalizeDocxPrivacy')
  await tab(app.host, '视图')
  const exportButton = app.host.querySelector<HTMLButtonElement>(
    '[aria-label="导出当前 DOCX 副本"]',
  )!
  expect(exportButton.disabled).toBe(true)
  await act(async () => exportButton.click())
  expect(finalizer).not.toHaveBeenCalled()
  expect(app.downloaded).toHaveLength(0)
  await act(async () => complete())
  await settle(() => app.host.textContent?.includes('后续保存会保留这些清理') === true)
  expect(app.dirty.mock.calls.at(-1)).toEqual([true])
  await click(app.host, '导出当前 DOCX 副本')
  await settle(() => app.downloaded.length === 1)
  expect(
    await xml(
      new Uint8Array(await app.downloaded[0]!.arrayBuffer()),
      'properties/privacy-core.xml',
    ),
  ).toContain('<d:creator></d:creator>')
  expect(
    await xml(
      new Uint8Array(await app.downloaded[0]!.arrayBuffer()),
      'customXml/privacy-opaque.xml',
    ),
  ).toBe(await xml(app.bytes, 'customXml/privacy-opaque.xml'))
  expect(app.saved).toHaveBeenCalledOnce()
  expect(app.editor.getJSON().attrs?.mimirPrivacy).toBe(false)
  expect(app.dirty.mock.calls.at(-1)).toEqual([true])
})
it('a save-options-only version change invalidates a pending privacy draft', async () => {
  const app = await boot(false)
  await privacyPanel(app)
  await act(async () => app.host.querySelector<HTMLButtonElement>('[role="switch"]')!.click())
  const before = app.editor.state.doc
  await act(async () => {
    await app.handle().execute('set_watermark', { text: 'Privacy test' })
  })
  expect(app.editor.state.doc).toBe(before)
  expect(app.host.querySelector<HTMLButtonElement>('[aria-label="应用设置"]')!.disabled).toBe(true)
  expect(app.host.textContent).toContain('文档已变化，请重新读取设置')
  await click(app.host, '重新读取设置')
  expect(app.host.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('false')
})
it('native privacy read failure explains the failure and keeps draft/history untouched', async () => {
  vi.spyOn(privacy, 'readNativeDocxPrivacyEnabled').mockRejectedValueOnce(
    new Error('无法安全读取个人信息设置，原件保持不变'),
  )
  const app = await boot(false),
    before = app.editor.getJSON(),
    version = app.handle().getVersion()
  await privacyPanel(app)
  expect(app.host.textContent).toContain('读取失败')
  expect(app.host.textContent).toContain('无法安全读取个人信息设置，原件保持不变')
  expect(app.host.querySelector<HTMLButtonElement>('[role="switch"]')!.disabled).toBe(true)
  expect(app.host.querySelector<HTMLButtonElement>('[aria-label="应用设置"]')!.disabled).toBe(true)
  expect(app.editor.getJSON()).toEqual(before)
  expect(app.handle().getVersion()).toBe(version)
  expect(app.dirty).not.toHaveBeenCalledWith(true)
})

it('isolates privacy application from adjacent typing in both undo directions', async () => {
  const app = await boot(false)
  act(() => {
    app.editor.commands.setTextSelection(1)
    app.editor.commands.insertContent('Before privacy ')
  })
  const beforePrivacy = app.editor.getJSON()
  await setPrivacy(app, true)
  const afterPrivacy = app.editor.getJSON()
  act(() => app.editor.commands.insertContent('After privacy '))
  await click(app.host, '撤销 (Ctrl+Z)')
  expect(app.editor.getJSON()).toEqual(afterPrivacy)
  await click(app.host, '撤销 (Ctrl+Z)')
  expect(app.editor.getJSON()).toEqual(beforePrivacy)
  await click(app.host, '重做 (Ctrl+Shift+Z)')
  expect(app.editor.getJSON()).toEqual(afterPrivacy)
  await click(app.host, '重做 (Ctrl+Shift+Z)')
  expect(app.editor.getText()).toContain('After privacy ')
  expect(app.editor.getJSON().attrs?.mimirPrivacy).toBe(true)
})

it('a true candidate finishing after a source change never reaches library IO or the next privacy state', async () => {
  const app = await boot(false),
    actual = privacy.finalizeDocxPrivacy
  let release!: () => void, entered!: () => void
  const waiting = new Promise<void>((resolve) => {
      entered = resolve
    }),
    gate = new Promise<void>((resolve) => {
      release = resolve
    })
  vi.spyOn(privacy, 'finalizeDocxPrivacy').mockImplementationOnce(async (...args) => {
    const result = await actual(...args)
    entered()
    await gate
    return result
  })
  await setPrivacy(app, true)
  await click(app.host, '保存到库')
  await waiting
  await app.render('privacy-check-generation-b', await bytesFixture(false))
  await privacyPanel(app)
  const nextEditor = (app.host.querySelector('.ProseMirror') as HTMLElement & { editor: Editor })
      .editor,
    nextDoc = nextEditor.getJSON(),
    nextVersion = app.handle().getVersion()
  await act(async () => release())
  expect(app.saved).not.toHaveBeenCalled()
  expect(nextEditor.getJSON()).toEqual(nextDoc)
  expect(app.handle().getVersion()).toBe(nextVersion)
  expect(app.host.textContent).not.toContain('后续保存会保留这些清理')
  act(() => {
    nextEditor.commands.setTextSelection(1)
    nextEditor.commands.insertContent('Source B ')
  })
  await saveAndWait(app, 1)
  expect(await xml(app.saved.mock.calls[0]![0], 'properties/privacy-core.xml')).toContain(
    '<d:creator>Alice</d:creator>',
  )
})

it('successful old-source library IO cannot acknowledge cleanup in the newly opened source', async () => {
  const app = await boot(false)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  app.saved.mockImplementationOnce(() => gate)
  await setPrivacy(app, true)
  await click(app.host, '保存到库')
  await settle(() => app.saved.mock.calls.length === 1)
  await app.render('privacy-check-io-b', await bytesFixture(false))
  await privacyPanel(app)
  const nextEditor = (app.host.querySelector('.ProseMirror') as HTMLElement & { editor: Editor })
    .editor
  act(() => {
    nextEditor.commands.setTextSelection(1)
    nextEditor.commands.insertContent('New source edit ')
  })
  const nextVersion = app.handle().getVersion(),
    nextDoc = nextEditor.getJSON()
  await act(async () => release())
  await settle(() => !app.host.querySelector('[aria-label="保存中…"]'))
  expect(nextEditor.getJSON()).toEqual(nextDoc)
  expect(app.handle().getVersion()).toBe(nextVersion)
  expect(app.dirty.mock.calls.at(-1)).toEqual([true])
  expect(app.host.textContent).not.toContain('后续保存会保留这些清理')
  await saveAndWait(app, 2)
  expect(await xml(app.saved.mock.calls[1]![0], 'properties/privacy-core.xml')).toContain(
    '<d:creator>Alice</d:creator>',
  )
  await privacyPanel(app)
  expect(app.host.textContent).not.toContain('后续保存会保留这些清理')
})
