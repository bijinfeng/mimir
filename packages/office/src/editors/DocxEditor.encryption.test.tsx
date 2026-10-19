/** @vitest-environment happy-dom */
import { readFileSync, writeFileSync } from 'node:fs'
import { URL as NativeURL } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import type { Editor } from '@tiptap/core'
import type { DocxAgentHandle } from '../agent/docx-agent.js'
import { decryptDocxInWorker } from '../docx-encryption-core.js'
import { DocxEncryptionController } from '../docx-encryption.js'
import { DOCX_ENCRYPTION_ATTR } from '../docx-encryption-state.js'
import { nativeEncryptionWorker } from './docx-encryption-worker.test-helper.js'
import { DocxEditor } from './DocxEditor.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
import { DocxOpening } from './use-docx-opening.js'
import { designFixture } from './docx-design-test-fixture.js'
const cleanup: (() => void)[] = []
let Bridge: ReturnType<typeof nativeEncryptionWorker>
beforeAll(() => {
  Bridge = nativeEncryptionWorker()
})
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  Bridge.instances.forEach((worker) => worker.terminate())
  Bridge.instances = []
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(new NativeURL(`../../tests/fixtures/docx-encryption/${name}`, import.meta.url)),
  )
async function settle(done: () => boolean) {
  for (let i = 0; i < 1200 && !done(); i++)
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
async function tab(host: HTMLElement, label: string) {
  await act(async () =>
    [...host.querySelectorAll<HTMLElement>('[role="tab"]')]
      .find((node) => node.textContent === label)!
      .click(),
  )
}
async function fill(host: HTMLElement, label: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!
  expect(input).toBeTruthy()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function boot(bytes: Uint8Array, documentId = 'encryption-a', wait = true) {
  vi.stubGlobal('Worker', Bridge)
  const host = document.createElement('div'),
    root = createRoot(host),
    saved = vi.fn<(bytes: Uint8Array) => Promise<void>>().mockResolvedValue(undefined),
    dirty = vi.fn<(value: boolean) => void>(),
    downloaded: Blob[] = []
  document.body.append(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    downloaded.push(blob as Blob)
    return 'blob:encrypted-copy'
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  let handle: DocxAgentHandle | null = null
  const render = async (id = documentId, next = bytes) => {
    await act(async () =>
      root.render(
        <DocxEditor
          documentId={id}
          io={{ load: async () => next, save: saved }}
          onDirtyChange={dirty}
          onAgentHandleChange={(value) => {
            handle = value
          }}
        />,
      ),
    )
  }
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await render()
  if (wait) await settle(() => !!host.querySelector('.ProseMirror') && !!handle)
  const editor = () =>
    (host.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor
  return { host, saved, dirty, downloaded, editor, handle: () => handle!, render }
}
async function open(app: Awaited<ReturnType<typeof boot>>, password: string) {
  await settle(() => !!app.host.querySelector('input[aria-label="打开密码"]'))
  expect(app.host.querySelector('[aria-label="取消本地打开"]')?.textContent).toBe('取消')
  const input = app.host.querySelector<HTMLInputElement>('input[aria-label="打开密码"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, password)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await click(app.host, '打开文档')
}
async function applyPassword(app: Awaited<ReturnType<typeof boot>>, password: string) {
  await tab(app.host, '审阅')
  if (!app.host.querySelector('.mimir-docx-encryption')) await click(app.host, '打开密码')
  await fill(app.host, '新的打开密码', password)
  await fill(app.host, '再次输入打开密码', password)
  await click(app.host, '应用打开密码')
}
async function saveAndWait(app: Awaited<ReturnType<typeof boot>>, count: number) {
  await click(app.host, '保存到库')
  await settle(
    () =>
      app.saved.mock.calls.length === count && app.host.textContent?.includes('已保存') === true,
  )
  return app.saved.mock.calls[count - 1]![0]
}
for (const format of ['standard', 'agile'])
  it(`real Editor opens external ${format} through actual worker; wrong password/cancel are zero history`, async () => {
    const app = await boot(fixture(`office-${format}-password.docx`), 'external', false)
    await open(app, 'wrong synthetic password')
    await settle(() => app.host.textContent?.includes('打开密码不正确') === true)
    expect(app.host.querySelector<HTMLInputElement>('input[aria-label="打开密码"]')!.value).toBe('')
    expect(app.saved).not.toHaveBeenCalled()
    expect(app.dirty).not.toHaveBeenCalledWith(true)
    await open(app, 'Password1234_')
    await click(app.host, '取消本地打开')
    expect(Bridge.instances.at(-1)?.terminated).toBe(true)
    expect(app.host.querySelector('.ProseMirror')).toBeNull()
    await open(app, 'Password1234_')
    await settle(() => !!app.host.querySelector('.ProseMirror'))
    expect(app.editor().getText()).toContain('ipsum')
    expect(JSON.stringify(app.editor().getJSON())).not.toContain('Password1234_')
    await tab(app.host, '视图')
    await click(app.host, '导出当前 DOCX 副本')
    await settle(() => app.downloaded.length === 1)
    expect(new Uint8Array(await app.downloaded[0]!.arrayBuffer())).toEqual(
      fixture(`office-${format}-password.docx`),
    )
    expect(app.saved).not.toHaveBeenCalled()
    expect(app.dirty).not.toHaveBeenCalledWith(true)
  })
for (const format of ['standard', 'agile'])
  it(`external ${format} body replacement saves through the actual encryption worker`, async () => {
    const app = await boot(fixture(`office-${format}-password.docx`), 'external-edited', false)
    await open(app, 'Password1234_')
    await act(async () => Bridge.instances.at(-1)!.response)
    await settle(() => !!app.host.querySelector('.ProseMirror'))
    await act(async () => {
      app.editor().commands.selectAll()
      app.editor().commands.insertContent('lorem ipsum 浏览器加密保存验收')
    })
    const cipher = await saveAndWait(app, 1)
    const plain = (await decryptDocxInWorker(cipher, 'Password1234_')).bytes
    writeFileSync(`/tmp/mimir-docx-e1u-external-${format}-edited-20261017.docx`, cipher)
    writeFileSync(`/tmp/mimir-docx-e1u-external-${format}-plain-20261017.docx`, plain)
    const zip = await import('jszip').then((module) => module.default.loadAsync(plain))
    expect(await zip.file('word/document.xml')!.async('string')).toContain('浏览器加密保存验收')
    expect(app.dirty.mock.calls.at(-1)).toEqual([false])
  })
it('real Editor password settings are one opaque PM history step; save/export use actual encrypted bytes and retain history', async () => {
  const bytes = await designFixture(),
    app = await boot(bytes)
  const initial = app.editor().getJSON()
  await applyPassword(app, 'Synthetic local new password')
  expect(app.host.querySelector<HTMLInputElement>('[aria-label="新的打开密码"]')!.value).toBe('')
  const applied = app.editor().getJSON(),
    token = applied.attrs![DOCX_ENCRYPTION_ATTR]
  expect(token).toMatch(/^enc:/)
  expect(JSON.stringify(app.handle().getContext())).not.toContain('Synthetic local new password')
  await click(app.host, '撤销 (Ctrl+Z)')
  expect(app.editor().getJSON()).toEqual(initial)
  await click(app.host, '重做 (Ctrl+Shift+Z)')
  expect(app.editor().getJSON()).toEqual(applied)
  const cipher = await saveAndWait(app, 1)
  expect((await decryptDocxInWorker(cipher, 'Synthetic local new password')).bytes).toEqual(bytes)
  await tab(app.host, '视图')
  await click(app.host, '导出当前 DOCX 副本')
  await settle(() => app.downloaded.length === 1)
  expect(new Uint8Array(await app.downloaded[0]!.arrayBuffer())).toEqual(cipher)
  await click(app.host, '撤销 (Ctrl+Z)')
  expect(await saveAndWait(app, 2)).toEqual(bytes)
  await click(app.host, '重做 (Ctrl+Shift+Z)')
  const again = await saveAndWait(app, 3)
  expect((await decryptDocxInWorker(again, 'Synthetic local new password')).bytes).toEqual(bytes)
})
it('old successful IO ACKs old key while new intent stays dirty; failed IO/export cannot ACK a new key', async () => {
  const app = await boot(await designFixture())
  await applyPassword(app, 'Synthetic key one')
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  app.saved.mockImplementationOnce(async () => gate)
  await click(app.host, '保存到库')
  await settle(() => app.saved.mock.calls.length === 1)
  const first = app.saved.mock.calls[0]![0]
  await applyPassword(app, 'Synthetic key two')
  await act(async () => release())
  await settle(() => !app.host.textContent?.includes('保存中…'))
  expect(app.host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')!.disabled).toBe(false)
  const second = await saveAndWait(app, 2)
  expect((await decryptDocxInWorker(first, 'Synthetic key one')).bytes).toEqual(
    (await decryptDocxInWorker(second, 'Synthetic key two')).bytes,
  )
  await applyPassword(app, 'Synthetic key three')
  app.saved.mockRejectedValueOnce(new Error('synthetic IO failure'))
  await click(app.host, '保存到库')
  await settle(() => app.host.textContent?.includes('synthetic IO failure') === true)
  await tab(app.host, '视图')
  await click(app.host, '导出当前 DOCX 副本')
  await settle(() => app.downloaded.length === 1)
  const exported = new Uint8Array(await app.downloaded[0]!.arrayBuffer())
  await decryptDocxInWorker(exported, 'Synthetic key three')
  await click(app.host, '撤销 (Ctrl+Z)')
  // Undo returns to last persisted key two: export must reuse its exact cipher, proving failed/export did not ACK key three.
  await click(app.host, '导出当前 DOCX 副本')
  await settle(() => app.downloaded.length === 2)
  expect(new Uint8Array(await app.downloaded[1]!.arrayBuffer())).toEqual(second)
})
it('source A→B→A and unmount terminate old opening workers, never publish a stale session', async () => {
  const bytes = fixture('office-agile-password.docx'),
    app = await boot(bytes, 'a', false)
  await open(app, 'Password1234_')
  const first = Bridge.instances.at(-1)!
  await app.render('b', bytes)
  await settle(() => first.terminated)
  await app.render('a', bytes)
  await settle(() => !!app.host.querySelector('input[aria-label="打开密码"]'))
  expect(app.host.querySelector('.ProseMirror')).toBeNull()
  expect(app.saved).not.toHaveBeenCalled()
  await open(app, 'Password1234_')
  await settle(() => !!app.host.querySelector('.ProseMirror'))
  expect(app.handle().documentId).toBe('a')
})
it('opening controller validates real envelope and loses all publication rights after dispose', async () => {
  vi.stubGlobal('Worker', Bridge)
  const sourceBytes = fixture('office-agile-password.docx'),
    opening = new DocxOpening(sourceBytes)
  sourceBytes.fill(0)
  await opening.start()
  expect(opening.getSnapshot().prompt).toBe(true)
  const promise = opening.open('Password1234_')
  opening.dispose()
  await promise
  expect(opening.getSnapshot().value).toBeNull()
  expect(Bridge.instances.at(-1)?.terminated).toBe(true)
})

it('actual save worker can stop, retry, and be terminated by a new source without any late IO', async () => {
  const bytes = await designFixture(),
    app = await boot(bytes)
  await applyPassword(app, 'Synthetic cancellable key')
  let before = Bridge.instances.length
  await click(app.host, '保存到库')
  await settle(() => Bridge.instances.length > before)
  const stopped = Bridge.instances.at(-1)!
  await click(app.host, '停止生成副本')
  await settle(
    () => app.host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')?.disabled === false,
  )
  expect(stopped.terminated).toBe(true)
  expect(app.saved).not.toHaveBeenCalled()
  await saveAndWait(app, 1)
  await applyPassword(app, 'Synthetic superseded source key')
  before = Bridge.instances.length
  await click(app.host, '保存到库')
  await settle(() => Bridge.instances.length > before)
  const old = Bridge.instances.at(-1)!
  await app.render('new-source', bytes)
  await settle(() => app.handle()?.documentId === 'new-source' && old.terminated)
  expect(app.saved).toHaveBeenCalledOnce()
  expect(app.editor().getJSON().attrs?.[DOCX_ENCRYPTION_ATTR]).toBeNull()
})
it('an options-only live version change during actual encryption refuses IO and preserves the current edit', async () => {
  const app = await boot(await designFixture())
  await applyPassword(app, 'Synthetic options-race key')
  const before = Bridge.instances.length,
    doc = app.editor().state.doc
  await click(app.host, '保存到库')
  await settle(() => Bridge.instances.length > before)
  await act(async () => {
    await app.handle().execute('set_watermark', { text: 'New live watermark' })
  })
  expect(app.editor().state.doc).toBe(doc)
  await settle(() => app.host.textContent?.includes('文档已变化，请重新保存') === true)
  expect(app.saved).not.toHaveBeenCalled()
  expect(app.host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')!.disabled).toBe(false)
  const cipher = await saveAndWait(app, 1),
    plain = (await decryptDocxInWorker(cipher, 'Synthetic options-race key')).bytes
  const zip = await import('jszip').then((module) => module.default.loadAsync(plain))
  expect(
    (
      await Promise.all(
        Object.values(zip.files)
          .filter((part) => !part.dir && part.name.endsWith('.xml'))
          .map((part) => part.async('string')),
      )
    ).join('\n'),
  ).toContain('New live watermark')
})
it('visible remove action is explicit and undoable; native body edits remain encrypted across two successful saves', async () => {
  const app = await boot(await designFixture())
  await applyPassword(app, 'Synthetic body key')
  await act(async () => {
    app.editor().commands.setTextSelection(1)
    app.editor().commands.insertContent('First protected draft ')
  })
  const first = await saveAndWait(app, 1)
  await act(async () => {
    app.editor().commands.setTextSelection(1)
    app.editor().commands.insertContent('Second protected draft ')
  })
  const second = await saveAndWait(app, 2)
  const firstZip = await import('jszip').then((module) =>
      module.default.loadAsync(
        decryptDocxInWorker(first, 'Synthetic body key').then((result) => result.bytes),
      ),
    ),
    secondPlain = (await decryptDocxInWorker(second, 'Synthetic body key')).bytes,
    secondZip = await import('jszip').then((module) => module.default.loadAsync(secondPlain))
  writeFileSync('/tmp/mimir-docx-e1u-editor-20261017.docx', second)
  writeFileSync('/tmp/mimir-docx-e1u-editor-plain-20261017.docx', secondPlain)
  expect(await firstZip.file('word/document.xml')!.async('string')).toContain(
    'First protected draft ',
  )
  expect(await secondZip.file('word/document.xml')!.async('string')).toContain(
    'Second protected draft First protected draft ',
  )
  await tab(app.host, '审阅')
  if (!app.host.querySelector('.mimir-docx-encryption')) await click(app.host, '打开密码')
  pickSelectOption(app.host, '打开密码操作', '移除打开密码')
  expect(app.host.querySelector('[aria-label="新的打开密码"]')).toBeNull()
  await click(app.host, '应用移除密码')
  expect((await saveAndWait(app, 3)).slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]))
  await click(app.host, '撤销 (Ctrl+Z)')
  const restored = await saveAndWait(app, 4)
  const restoredZip = await import('jszip').then((module) =>
    module.default.loadAsync(
      decryptDocxInWorker(restored, 'Synthetic body key').then((result) => result.bytes),
    ),
  )
  expect(await restoredZip.file('word/document.xml')!.async('string')).toBe(
    await secondZip.file('word/document.xml')!.async('string'),
  )
})
it('actual encrypted old IO preserves the privacy scrub floor when the new key and false flag arrive meanwhile', async () => {
  const fixtureZip = await import('jszip').then((module) =>
    module.default.loadAsync(fixture('office-agile-plain.docx')),
  )
  const settings = await fixtureZip.file('word/settings.xml')!.async('string')
  fixtureZip.file(
    'word/settings.xml',
    settings.replace(/<w:removePersonalInformation\b[^>]*\/>/g, ''),
  )
  fixtureZip.file(
    'docProps/core.xml',
    (await fixtureZip.file('docProps/core.xml')!.async('string')).replace(
      '<dc:creator></dc:creator>',
      '<dc:creator>Synthetic private author</dc:creator>',
    ),
  )
  const app = await boot(await fixtureZip.generateAsync({ type: 'uint8array' }))
  await applyPassword(app, 'Synthetic privacy old key')
  const privacy = async (enabled: boolean) => {
    await tab(app.host, '审阅')
    if (!app.host.querySelector('.mimir-docx-privacy')) await click(app.host, '个人信息')
    await settle(
      () => app.host.querySelector<HTMLButtonElement>('[role="switch"]')?.disabled === false,
    )
    const toggle = app.host.querySelector<HTMLButtonElement>('[role="switch"]')!
    if ((toggle.getAttribute('aria-checked') === 'true') !== enabled)
      await act(async () => toggle.click())
    await click(app.host, '应用设置')
  }
  await privacy(true)
  let finish!: () => void
  app.saved.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  await click(app.host, '保存到库')
  await settle(() => app.saved.mock.calls.length === 1)
  await applyPassword(app, 'Synthetic privacy new key')
  await privacy(false)
  await act(async () => finish())
  await settle(() => app.host.textContent?.includes('后续保存会保留这些清理') === true)
  expect(app.dirty.mock.calls.at(-1)).toEqual([true])
  const second = await saveAndWait(app, 2),
    plain = (await decryptDocxInWorker(second, 'Synthetic privacy new key')).bytes
  const zip = await import('jszip').then((module) => module.default.loadAsync(plain))
  expect(await zip.file('docProps/core.xml')!.async('string')).toContain(
    '<dc:creator></dc:creator>',
  )
  expect(app.editor().getJSON().attrs?.mimirPrivacy).toBe(false)
})

it('independent: a new password intent before production worker publication prevents all old IO and concurrent export', async () => {
  const app = await boot(await designFixture())
  await applyPassword(app, 'Synthetic independently superseded key')
  const encrypt = DocxEncryptionController.prototype.encrypt
  let waiting = false,
    release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  cleanup.push(() => release())
  const intercepted = vi
    .spyOn(DocxEncryptionController.prototype, 'encrypt')
    .mockImplementation(async function (this: DocxEncryptionController, ...args) {
      const result = await encrypt.apply(this, args)
      waiting = true
      await gate
      return result
    })
  await click(app.host, '保存到库')
  await settle(() => waiting)
  const workerCount = Bridge.instances.length
  await tab(app.host, '视图')
  const exportButton = app.host.querySelector<HTMLButtonElement>(
    '[aria-label="导出当前 DOCX 副本"]',
  )!
  expect(exportButton.disabled).toBe(true)
  await act(async () => exportButton.click())
  expect(Bridge.instances).toHaveLength(workerCount)
  expect(app.downloaded).toHaveLength(0)
  await applyPassword(app, 'Synthetic independently current key')
  await act(async () => release())
  await settle(
    () => app.host.querySelector<HTMLButtonElement>('[aria-label="保存到库"]')?.disabled === false,
  )
  expect(app.host.textContent).toMatch(/文档.*变化.*重新保存/)
  expect(app.saved).not.toHaveBeenCalled()
  expect(app.dirty.mock.calls.at(-1)).toEqual([true])
  intercepted.mockRestore()
  const current = await saveAndWait(app, 1)
  await decryptDocxInWorker(current, 'Synthetic independently current key')
  await expect(
    decryptDocxInWorker(current, 'Synthetic independently superseded key'),
  ).rejects.toThrow('打开密码不正确')
})
