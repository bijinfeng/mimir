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
import * as docx from '../docx.js'
import { passwordDocxFixture } from '../docx-protection-password-fixture.test-helper.js'
import {
  PASSWORD_VECTORS,
  RealDocxPasswordWorker,
  PASSWORD_VECTOR_SALT,
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
  for (let i = 0; i < 300 && !done(); i++)
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
  const bytes = suppliedBytes ?? (await passwordDocxFixture())
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
it('verifies through the real panel without dirty/history changes, invalidates stale Agent version, then saves actual manual and Agent edits', async () => {
  const app = await boot(),
    editor = app.editor(),
    handle = app.handle(),
    baseline = editor.getJSON(),
    version = handle.getVersion(),
    history = undoDepth(editor.state)
  await act(async () => {
    editor.commands.insertContent('blocked')
    editor.view.dispatch(editor.state.tr.insertText('raw bypass', 1).setMeta('TRACK_IGNORE', true))
  })
  expect(editor.getJSON()).toEqual(baseline)
  await expect(handle.execute('insert_content', { html: '<p>blocked</p>' })).rejects.toThrow(
    '修改密码',
  )
  await protection(app.host)
  await input(app.host, 'wrong')
  await click(app.host, '验证并继续编辑')
  await settle(() => !!app.host.querySelector('[role="alert"]'))
  expect(app.host.textContent).toContain('密码不正确')
  expect(handle.getVersion()).toBe(version)
  const field = await input(app.host, 'editor')
  expect(app.host.querySelector('[role="alert"]')).toBeNull()
  await act(async () =>
    field.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    ),
  )
  await settle(() => editor.isEditable)
  expect(app.host.textContent).toContain('本次会话已验证')
  expect(app.host.querySelector('input[type="password"]')).toBeNull()
  expect(editor.getJSON()).toEqual(baseline)
  expect(undoDepth(editor.state)).toBe(history)
  expect(app.dirty.mock.calls.some(([value]) => value === true)).toBe(false)
  expect(app.handle()).toBe(handle)
  expect(handle.getVersion()).toBeGreaterThan(version)
  expect(JSON.stringify(handle.getContext())).not.toContain(PASSWORD_VECTOR_SALT)
  expect(JSON.stringify(handle.getContext())).not.toContain(PASSWORD_VECTORS[0].hash)
  await expect(
    handle.execute('insert_content', { html: '<p>stale</p>' }, { expectedVersion: version }),
  ).rejects.toThrow('版本')
  await act(async () => editor.commands.insertContent('manual authorized '))
  await act(async () => {
    await handle.execute(
      'insert_content',
      { html: '<p>Agent authorized</p>' },
      { roundId: 'password-edit' },
    )
  })
  expect(editor.state.doc.textContent).toContain('manual authorized')
  expect(editor.state.doc.textContent).toContain('Agent authorized')
  expect(app.dirty).toHaveBeenCalledWith(true)
  await click(app.host, '保存到库')
  await settle(() => app.saved.mock.calls.length > 0)
  const output = app.saved.mock.calls[0]![0],
    reopened = await openDocx(output)
  expect(JSON.stringify(reopened.content)).toContain('Agent authorized')
  expect(reopened.protection.getAccess().writable).toBe(false)
  const originalZip = await JSZip.loadAsync(app.bytes),
    savedZip = await JSZip.loadAsync(output)
  expect(await savedZip.file('word/settings.xml')!.async('string')).toBe(
    await originalZip.file('word/settings.xml')!.async('string'),
  )
})
it('clears plaintext on Escape with trigger focus, and cancels pending real worker on panel close', async () => {
  const app = await boot(await passwordDocxFixture({ vector: PASSWORD_VECTORS[3] }))
  await protection(app.host)
  const field = await input(app.host, 'secret draft')
  await act(async () =>
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  )
  expect(app.host.querySelector('[aria-label="文档保护面板"]')).toBeNull()
  expect(document.activeElement?.getAttribute('aria-label')).toBe('文档保护')
  await click(app.host, '文档保护')
  expect(app.host.querySelector<HTMLInputElement>('input[type="password"]')!.value).toBe('')
  await input(app.host, 'default')
  await click(app.host, '验证并继续编辑')
  expect(app.host.textContent).toContain('正在本地验证')
  expect(app.host.querySelector('button[aria-label="取消验证"]')!.textContent).toContain('取消')
  await act(async () =>
    app.host.querySelector<HTMLButtonElement>('button[aria-label="取消验证"]')!.focus(),
  )
  await click(app.host, '取消验证')
  expect(document.activeElement).toBe(app.host.querySelector('input[type="password"]'))
  await settle(() => RealDocxPasswordWorker.instances[0]!.terminated)
  expect(app.host.querySelector<HTMLInputElement>('input[type="password"]')!.value).toBe('')
  expect(app.editor().isEditable).toBe(false)
  await input(app.host, 'default')
  await click(app.host, '验证并继续编辑')
  await click(app.host, '关闭文档属性面板')
  await settle(() => RealDocxPasswordWorker.instances[1]!.terminated)
  expect(app.editor().isEditable).toBe(false)
  expect(app.dirty.mock.calls.some(([value]) => value === true)).toBe(false)
})
it('source A to B to A requires verification again and clears pending password drafts', async () => {
  const app = await boot()
  await protection(app.host)
  await input(app.host, 'editor')
  await click(app.host, '验证并继续编辑')
  await settle(() => app.editor().isEditable)
  await app.render('password-B')
  await settle(() => !app.editor().isEditable)
  await app.render('password-A')
  await settle(() => !app.editor().isEditable)
  await protection(app.host)
  expect(app.host.querySelector<HTMLInputElement>('input[type="password"]')!.value).toBe('')
})
it('does not write a late authorized save after source A to B to A has relocked the session', async () => {
  let release!: () => void,
    started = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const original = docx.openDocx
  vi.spyOn(docx, 'openDocx').mockImplementationOnce(async (...args) => {
    const session = await original(...args),
      save = session.save
    session.save = async (...saveArgs) => {
      const result = await save(...saveArgs)
      started = true
      await gate
      return result
    }
    return session
  })
  const app = await boot()
  await protection(app.host)
  await input(app.host, 'editor')
  await click(app.host, '验证并继续编辑')
  await settle(() => app.editor().isEditable)
  await act(async () => app.editor().commands.insertContent('old authorized save'))
  await click(app.host, '保存到库')
  await settle(() => started)
  await app.render('password-B')
  await app.render('password-A')
  await settle(() => !app.editor().isEditable)
  await act(async () => {
    release()
    await gate
  })
  expect(app.saved).not.toHaveBeenCalled()
  expect(app.editor().state.doc.textContent).not.toContain('old authorized save')
})
it.each(['comments', 'forms'])(
  'allows actual supported %s operations after verification while raw body and Agent body writes remain blocked',
  async (mode) => {
    const app = await boot(await passwordDocxFixture({ mode })),
      editor = app.editor(),
      before = editor.getJSON()
    await protection(app.host)
    await input(app.host, 'editor')
    await click(app.host, '验证并继续编辑')
    await settle(() => app.host.textContent?.includes('本次会话已验证') === true)
    expect(editor.isEditable).toBe(false)
    await act(async () => editor.view.dispatch(editor.state.tr.insertText('illegal body', 1)))
    expect(editor.getJSON()).toEqual(before)
    await expect(
      app.handle().execute('insert_content', { html: '<p>illegal Agent body</p>' }),
    ).rejects.toThrow(/原件|正文/)
    if (mode === 'forms') {
      await click(app.host, '勾选此复选框')
    } else {
      await act(async () => {
        await app
          .handle()
          .execute(
            'reply_comment',
            { parentId: '0', text: 'authorized protected reply' },
            { roundId: 'protected-reply' },
          )
      })
    }
    expect(app.dirty).toHaveBeenCalledWith(true)
    await click(app.host, '保存到库')
    await settle(() => app.saved.mock.calls.length > 0)
    const output = app.saved.mock.calls[0]![0],
      reopened = await openDocx(output)
    expect(reopened.protection.getAccess().modificationPasswordRequired).toBe(true)
    await reopened.protection.verifyModificationPassword('editor')
    const originalZip = await JSZip.loadAsync(app.bytes),
      outputZip = await JSZip.loadAsync(output)
    expect(await outputZip.file('word/settings.xml')!.async('string')).toBe(
      await originalZip.file('word/settings.xml')!.async('string'),
    )
    const result =
      mode === 'forms'
        ? reopened.protection.readFormControls(reopened.content)[0]?.checked
        : reopened.protection
            .readComments()
            ?.some((comment) => comment.text === 'authorized protected reply')
    expect(result).toBe(true)
    expect(reopened.protection.getAccess().writable).toBe(false)
  },
)

it('keyboard activation of cancel returns to the current password field and keeps the session locked', async () => {
  const app = await boot(await passwordDocxFixture({ vector: PASSWORD_VECTORS[3] }))
  await protection(app.host)
  await input(app.host, 'default')
  await click(app.host, '验证并继续编辑')
  const cancel = app.host.querySelector<HTMLButtonElement>('button[aria-label="取消验证"]')!
  await act(async () => {
    cancel.focus()
    cancel.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }))
  })
  expect(document.activeElement).toBe(app.host.querySelector('input[type="password"]'))
  expect(app.editor().isEditable).toBe(false)
  expect(app.dirty).not.toHaveBeenCalledWith(true)
  await settle(() => RealDocxPasswordWorker.instances[0]!.terminated)
})

it('mouse cancel restores the input after disabling it has moved browser focus to BODY', async () => {
  const app = await boot(await passwordDocxFixture({ vector: PASSWORD_VECTORS[3] }))
  await protection(app.host)
  const field = await input(app.host, 'default')
  await act(async () => field.focus())
  await click(app.host, '验证并继续编辑')
  // Chromium blurs a newly disabled focused input; happy-dom needs that native step explicitly.
  await act(async () => field.blur())
  expect(document.activeElement).toBe(document.body)
  await click(app.host, '取消验证')
  expect(document.activeElement).toBe(field)
  expect(field.value).toBe('')
  expect(app.editor().isEditable).toBe(false)
  expect(app.dirty).not.toHaveBeenCalledWith(true)
  await settle(() => RealDocxPasswordWorker.instances[0]!.terminated)
})

it('cancel does not focus the password when ToolbarButton blurs a live external input', async () => {
  const app = await boot(await passwordDocxFixture({ vector: PASSWORD_VECTORS[3] }))
  await protection(app.host)
  await input(app.host, 'default')
  await click(app.host, '验证并继续编辑')
  const external = document.createElement('input')
  document.body.append(external)
  cleanup.push(() => external.remove())
  await act(async () => external.focus())
  await click(app.host, '取消验证')
  expect(document.activeElement).toBe(document.body)
  expect(document.activeElement).not.toBe(app.host.querySelector('input[type="password"]'))
  expect(app.editor().isEditable).toBe(false)
  await settle(() => RealDocxPasswordWorker.instances[0]!.terminated)
})
