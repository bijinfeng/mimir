/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import type { Editor } from '@tiptap/core'
import { undoDepth } from '@tiptap/pm/history'
import JSZip from 'jszip'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DocxEditor } from './DocxEditor.js'
import type { DocxAgentHandle } from '../agent/docx-agent.js'
import { openDocx } from '../docx.js'
import { pickSelectOption } from '../shell/antd-test-dom.js'
import {
  passwordSettings,
  passwordAttrs,
  passwordDocxFixture,
} from '../docx-protection-password-fixture.test-helper.js'
import {
  PASSWORD_VECTORS,
  RealDocxPasswordWorker,
} from '../docx-protection-password-test-helper.js'
const cleanup: (() => void)[] = []
beforeEach(() => {
  vi.stubGlobal('Worker', RealDocxPasswordWorker)
  RealDocxPasswordWorker.instances.length = 0
})
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  RealDocxPasswordWorker.instances.forEach((worker) => worker.terminate())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
async function settle(done: () => boolean) {
  for (let i = 0; i < 1200 && !done(); i++)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 3)))
  expect(done()).toBe(true)
}
async function click(host: HTMLElement, label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button[aria-label]')].find(
    (node) => node.getAttribute('aria-label') === label && !node.closest('[hidden]'),
  )!
  expect(button).toBeTruthy()
  expect(button.disabled).toBe(false)
  await act(async () => {
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    button.click()
  })
  return button
}
async function protection(host: HTMLElement) {
  await act(async () =>
    [...host.querySelectorAll<HTMLElement>('[role="tab"]')]
      .find((node) => node.textContent === '审阅')!
      .click(),
  )
  if (!host.querySelector('[aria-label="文档保护面板"]')) await click(host, '文档保护')
}
async function input(host: HTMLElement, value: string) {
  const field = host.querySelector<HTMLInputElement>('input[type="password"]')!
  expect(field).toBeTruthy()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
  return field
}
async function boot(suppliedBytes?: Uint8Array) {
  const bytes = suppliedBytes ?? (await settingsFixture())
  const host = document.createElement('div'),
    root = createRoot(host),
    dirty = vi.fn<(value: boolean) => void>(),
    saved = vi.fn<(bytes: Uint8Array) => Promise<void>>().mockResolvedValue(undefined)
  document.body.append(host)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  let handle: DocxAgentHandle | null = null
  const render = async (documentId = 'password-A') => {
    await act(async () =>
      root.render(
        <ConfigProvider componentSize="small">
          <DocxEditor
            documentId={documentId}
            io={{ load: async () => bytes, save: saved }}
            onDirtyChange={dirty}
            onAgentHandleChange={(next) => {
              handle = next
            }}
          />
        </ConfigProvider>,
      ),
    )
    await settle(() => handle?.documentId === documentId && !!host.querySelector('.ProseMirror'))
  }
  await render()
  cleanup.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  return {
    host,
    dirty,
    saved,
    bytes,
    render,
    handle: () => handle!,
    editor: () => (host.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor,
  }
}

async function settingsFixture(nodes = '') {
  const zip = await JSZip.loadAsync(await passwordDocxFixture())
  zip.file('word/settings.xml', passwordSettings(nodes))
  const types = await zip.file('[Content_Types].xml')!.async('string')
  if (!types.includes('/word/settings.xml'))
    zip.file(
      '[Content_Types].xml',
      types.replace(
        '</Types>',
        '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>',
      ),
    )
  return zip.generateAsync({ type: 'uint8array' })
}
async function setPassword(host: HTMLElement, label: string, value: string) {
  const forId = [...host.querySelectorAll('label')].find((el) => el.textContent === label)?.htmlFor
  expect(forId).toBeTruthy()
  const field = document.getElementById(forId!) as HTMLInputElement
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
  return field
}
it('applies native restriction in one PM undo step, saves, then undoes/redoes through the actual protected toolbar', async () => {
  const app = await boot(),
    editor = app.editor(),
    history = undoDepth(editor.state),
    version = app.handle().getVersion()
  await protection(app.host)
  await click(app.host, '更改保护设置')
  pickSelectOption(app.host, '启用编辑限制', '启用编辑限制')
  pickSelectOption(app.host, '限制模式', '仅填写表单')
  expect(
    [...app.host.querySelectorAll('.me-property-group__title')].map((el) => el.textContent),
  ).toEqual(['编辑限制', '修改密码', '只读建议'])
  const fieldLabels = [...app.host.querySelectorAll('.me-property-field__label')].map(
    (el) => el.textContent,
  )
  expect(fieldLabels).toEqual(
    expect.arrayContaining(['编辑限制密码操作', '修改密码操作', '限制模式']),
  )
  expect(undoDepth(editor.state)).toBe(history)
  expect(app.dirty).not.toHaveBeenCalledWith(true)
  await click(app.host, '应用保护设置')
  await settle(() => app.host.textContent?.includes('保护设置已应用') === true)
  expect(app.host.textContent).not.toContain('保存到库后写入原件')
  expect(undoDepth(editor.state)).toBe(history + 1)
  expect(editor.isEditable).toBe(false)
  expect(app.handle().getVersion()).toBeGreaterThan(version)
  expect(app.dirty).toHaveBeenCalledWith(true)
  await click(app.host, '保存到库')
  await settle(() => app.saved.mock.calls.length === 1)
  expect((await openDocx(app.saved.mock.calls[0]![0])).protection.native).toMatchObject({
    enforced: true,
    mode: 'forms',
  })
  await click(app.host, '返回保护状态')
  await click(app.host, '关闭文档属性面板')
  await act(async () =>
    [...app.host.querySelectorAll<HTMLElement>('[role="tab"]')]
      .find((n) => n.textContent === '开始')!
      .click(),
  )
  await click(app.host, '撤销 (Ctrl+Z)')
  expect(editor.isEditable).toBe(true)
  expect(app.dirty).toHaveBeenLastCalledWith(true)
  await click(app.host, '保存到库')
  await settle(() => app.saved.mock.calls.length === 2)
  expect((await openDocx(app.saved.mock.calls[1]![0])).protection.native.enforced).toBe(false)
  await click(app.host, '重做 (Ctrl+Shift+Z)')
  expect(editor.isEditable).toBe(false)
  await click(app.host, '保存到库')
  await settle(() => app.saved.mock.calls.length === 3)
  expect((await openDocx(app.saved.mock.calls[2]![0])).protection.native.mode).toBe('forms')
})
it('keeps separate restriction verification errors, then stops protection without exposing native credentials', async () => {
  const app = await boot(
    await settingsFixture(
      `<w:documentProtection w:edit="readOnly" w:enforcement="1" ${passwordAttrs(PASSWORD_VECTORS[2])}/><w:writeProtection ${passwordAttrs()}/>`,
    ),
  )
  await protection(app.host)
  await input(app.host, 'editor')
  await click(app.host, '验证并继续编辑')
  await settle(() => app.host.textContent?.includes('本次会话已验证') === true)
  expect(app.editor().isEditable).toBe(false)
  await click(app.host, '更改保护设置')
  pickSelectOption(app.host, '启用编辑限制', '不限制编辑')
  await setPassword(app.host, '当前编辑限制密码', 'editor')
  await click(app.host, '应用保护设置')
  await settle(() => app.host.textContent?.includes('编辑限制密码不正确') === true)
  expect(undoDepth(app.editor().state)).toBe(0)
  expect(app.dirty).not.toHaveBeenCalledWith(true)
  await setPassword(app.host, '当前编辑限制密码', PASSWORD_VECTORS[2].password)
  expect(app.host.querySelector('[role="alert"]')).toBeNull()
  await click(app.host, '应用保护设置')
  await settle(() => app.host.textContent?.includes('保护设置已应用') === true)
  await click(app.host, '保存到库')
  await settle(() => app.saved.mock.calls.length === 1)
  const reopened = await openDocx(app.saved.mock.calls[0]![0])
  expect(reopened.protection.native.enforced).toBe(false)
  expect(reopened.protection.native.modificationPassword).toBe(true)
  expect(app.editor().getJSON().attrs).not.toHaveProperty('password')
})
it('creates an actual native password from the panel and clears draft fields; a subsequent source switch cancels pending hashing', async () => {
  const app = await boot(),
    secret = 'local panel 密码😀'
  await protection(app.host)
  await click(app.host, '更改保护设置')
  pickSelectOption(app.host, '修改密码操作', '设置新密码')
  await setPassword(app.host, '新的修改密码', secret)
  await setPassword(app.host, '确认修改密码', secret)
  expect(app.dirty).not.toHaveBeenCalledWith(true)
  // SHA-512 performs 100,000 real worker digests. Await its response rather
  // than requiring that CPU work to finish within the UI polling window.
  const emit = RealDocxPasswordWorker.prototype.emit
  const hashed = new Promise<void>((resolve, reject) => {
    vi.spyOn(RealDocxPasswordWorker.prototype, 'emit').mockImplementation(function (
      this: RealDocxPasswordWorker,
      type,
      event,
    ) {
      emit.call(this, type, event)
      if (type === 'message') resolve()
      else reject(new Error('Real password worker failed'))
    })
  })
  await click(app.host, '应用保护设置')
  await act(async () => hashed)
  await settle(() => app.host.textContent?.includes('保护设置已应用') === true)
  expect(
    [...app.host.querySelectorAll<HTMLInputElement>('input[type="password"]')].every(
      (n) => !n.value,
    ),
  ).toBe(true)
  expect(JSON.stringify(app.editor().getJSON())).not.toContain(secret)
  await click(app.host, '保存到库')
  await settle(() => app.saved.mock.calls.length === 1)
  const reopened = await openDocx(app.saved.mock.calls[0]![0])
  await reopened.protection.verifyModificationPassword(secret)
  expect(reopened.protection.getAccess().writable).toBe(true)
  await app.render('other-document')
  await settle(
    () => app.editor().getJSON().attrs?.mimirProtectionState === null && app.editor().isEditable,
  )
  await protection(app.host)
  await click(app.host, '更改保护设置')
  pickSelectOption(app.host, '修改密码操作', '设置新密码')
  await setPassword(app.host, '新的修改密码', 'cancelled secret')
  await setPassword(app.host, '确认修改密码', 'cancelled secret')
  await click(app.host, '应用保护设置')
  expect(RealDocxPasswordWorker.instances.at(-1)?.terminated).toBe(false)
  await app.render('third-document')
  await settle(() => RealDocxPasswordWorker.instances.every((w) => w.terminated))
  expect(undoDepth(app.editor().state)).toBe(0)
  expect(app.editor().getJSON().attrs?.mimirProtectionState).toBeNull()
  expect(app.saved).toHaveBeenCalledTimes(1)
})
it('actual forced-tracking editor keeps revision navigation, refuses stop/accept/reject, saves native edits and resets safely on source switch', async () => {
  const { forcedTrackingFixture } = await import('../docx-forced-tracking-fixture.test-helper.js')
  const app = await boot(await forcedTrackingFixture())
  expect(app.editor().isEditable).toBe(true)
  await act(async () => app.editor().view.dispatch(app.editor().state.tr.insertText('真实编辑', 1)))
  expect(app.editor().storage.trackChanges.enabled).toBe(true)
  await protection(app.host)
  await click(app.host, '修订')
  const menu = (label: string) =>
    [...app.host.querySelectorAll<HTMLElement>('[role="menuitem"], button')].find(
      (el) => el.textContent?.trim() === label,
    )
  for (const label of ['关闭修订', '接受这一处', '拒绝这一处', '接受全部', '拒绝全部']) {
    expect(menu(label)).toBeTruthy()
    expect(
      menu(label)!.getAttribute('aria-disabled') === 'true' ||
        (menu(label) as HTMLButtonElement).disabled,
    ).toBe(true)
  }
  expect(menu('下一处')!.getAttribute('aria-disabled')).not.toBe('true')
  await act(async () => menu('下一处')!.click())
  await click(app.host, '保存到库')
  await settle(() => app.saved.mock.calls.length === 1)
  const zip = await JSZip.loadAsync(app.saved.mock.calls[0]![0])
  expect(await zip.file('word/document.xml')!.async('string')).toContain('真实编辑')
  expect(
    (await openDocx(app.saved.mock.calls[0]![0])).protection.getAccess().mandatoryTracking,
  ).toBe(true)
  const old = app.handle()
  await app.render('tracked-source-B')
  expect(app.handle()).not.toBe(old)
  expect(app.editor().storage.trackChanges.enabled).toBe(true)
  expect(app.editor().state.doc.textContent).not.toContain('真实编辑')
  await expect(old.execute('insert_content', { html: 'late' })).rejects.toThrow(/关闭/)
})
