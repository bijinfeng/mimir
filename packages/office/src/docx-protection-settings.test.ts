/** @vitest-environment happy-dom */
import JSZip from 'jszip'
import { Editor } from '@tiptap/core'
import { undoDepth } from '@tiptap/pm/history'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { canonicalFormDoc, readNativeDocxProtection } from './docx-protection.js'
import * as referenceSave from './docx-reference-save.js'
import type { SaveOptions } from '../vendor/packages/docx-engine/src/patch.js'
import { openDocx, type PmDocJson, type DocxSession } from './docx.js'
import { editorExtensions } from '../vendor/apps/docs/src/renderer/editor/extensions.js'
import { protectedFormsFixture } from './docx-protected-forms-fixture.test-helper.js'
import { toggleProtectedForm } from './editors/docx-form-controls.js'
import { DocxInkExtension } from './editors/docx-ink.js'
import { DocxProtectionExtension } from './editors/docx-protection.js'
import {
  passwordAttrs,
  passwordDocxFixture,
  passwordSettings,
} from './docx-protection-password-fixture.test-helper.js'
import { PASSWORD_VECTORS, RealDocxPasswordWorker } from './docx-protection-password-test-helper.js'
import {
  patchDocxProtectionSettings,
  type DocxProtectionSettingsInput,
} from './docx-protection-settings.js'
const clean: (() => void)[] = []
beforeEach(() => {
  vi.stubGlobal('Worker', RealDocxPasswordWorker)
  RealDocxPasswordWorker.instances.length = 0
})
afterEach(() => {
  clean.splice(0).forEach((fn) => fn())
  RealDocxPasswordWorker.instances.forEach((w) => w.terminate())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
async function fixture(nodes = '') {
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
async function boot(bytes?: Uint8Array) {
  const session = await openDocx(bytes ?? (await fixture())),
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        ...editorExtensions,
        DocxInkExtension,
        DocxProtectionExtension.configure({ controller: session.protection }),
      ],
      content: session.content,
    })
  clean.push(() => editor.destroy())
  return { session, editor }
}
const input = (
  session: DocxSession,
  override: Partial<DocxProtectionSettingsInput> = {},
): DocxProtectionSettingsInput => ({
  enabled: session.protection.native.enforced,
  mode: (session.protection.native.mode ?? 'readOnly') as 'readOnly',
  restrictionPassword: { action: 'preserve' },
  modificationPassword: { action: 'preserve' },
  recommended: session.protection.native.recommended,
  ...override,
})
async function apply(
  app: Awaited<ReturnType<typeof boot>>,
  override: Partial<DocxProtectionSettingsInput> = {},
  signal = new AbortController().signal,
  options: SaveOptions = {},
) {
  const { session, editor } = app
  return session.protection.applySettings(
    input(session, override),
    editor.getJSON(),
    options,
    (token) => {
      editor.view.dispatch(editor.state.tr.setDocAttribute('mimirProtectionState', token))
      return editor.state.doc.attrs.mimirProtectionState === token
    },
    signal,
  )
}
const settings = async (bytes: Uint8Array, path = 'word/settings.xml') =>
  (await JSZip.loadAsync(bytes)).file(path)!.async('string')
async function unchanged(before: Uint8Array, after: Uint8Array, except: string[]) {
  const a = await JSZip.loadAsync(before),
    b = await JSZip.loadAsync(after)
  for (const name of Object.keys(a.files).filter(
    (entry) => !a.files[entry]!.dir && !except.includes(entry),
  ))
    expect(await b.file(name)!.async('uint8array')).toEqual(await a.file(name)!.async('uint8array'))
}
it.each(['readOnly', 'comments', 'forms', 'trackedChanges'] as const)(
  'publishes one real PM history step and saves/reopens native %s settings',
  async (mode) => {
    const bytes = await fixture(),
      app = await boot(bytes),
      before = undoDepth(app.editor.state)
    expect(await apply(app, { enabled: true, mode })).toBe(true)
    expect(undoDepth(app.editor.state)).toBe(before + 1)
    expect(app.session.protection.native).toMatchObject({ enforced: true, mode })
    expect(app.session.protection.getAccess().writable).toBe(mode === 'trackedChanges')
    const saved = await app.session.save(app.editor.getJSON()),
      reopened = await openDocx(saved)
    expect(reopened.protection.native).toMatchObject({ enforced: true, mode })
    await unchanged(bytes, saved, ['word/settings.xml'])
    expect(app.editor.commands.undo()).toBe(true)
    expect(app.session.protection.native.enforced).toBe(false)
    expect(await app.session.save(app.editor.getJSON())).toEqual(bytes)
    expect(app.editor.commands.redo()).toBe(true)
    expect(
      (await openDocx(await app.session.save(app.editor.getJSON()))).protection.native.mode,
    ).toBe(mode)
  },
)
it('does not publish a no-op, blank replacement, unsupported setting, or body-forged stop', async () => {
  const app = await boot(),
    publish = vi.fn<() => boolean>(() => true),
    before = app.session.protection.getAccess()
  expect(await apply(app)).toBe(false)
  await expect(
    app.session.protection.applySettings(
      input(app.session, { modificationPassword: { action: 'replace', password: '' } }),
      app.editor.getJSON(),
      {},
      publish,
      new AbortController().signal,
    ),
  ).rejects.toThrow('新密码不能为空')
  expect(publish).not.toHaveBeenCalled()
  expect(app.session.protection.getAccess()).toBe(before)
  const locked = await boot(
    await fixture('<w:documentProtection w:edit="readOnly" w:enforcement="1"/>'),
  )
  const forged: PmDocJson = structuredClone(locked.editor.getJSON())
  forged.content!.push({ type: 'docParagraph', content: [{ type: 'text', text: 'forged body' }] })
  await expect(
    locked.session.protection.applySettings(
      input(locked.session, { enabled: false }),
      forged,
      {},
      publish,
      new AbortController().signal,
    ),
  ).rejects.toThrow('只读')
  expect(publish).not.toHaveBeenCalled()
  const unknown = await boot(
    await fixture('<w:documentProtection w:edit="readOnly" w:enforcement="1" w:password="ABCD"/>'),
  )
  await expect(apply(unknown, { enabled: false })).rejects.toThrow('无法安全修改')
})
it('requires documentProtection password independently from the verified modification password', async () => {
  const bytes = await fixture(
      `<w:documentProtection w:edit="readOnly" w:enforcement="1" ${passwordAttrs(PASSWORD_VECTORS[2])}/><w:writeProtection ${passwordAttrs()}/>`,
    ),
    app = await boot(bytes)
  await expect(apply(app, { enabled: false })).rejects.toThrow('先验证当前修改密码')
  await app.session.protection.verifyModificationPassword('editor')
  const access = app.session.protection.getAccess(),
    history = undoDepth(app.editor.state)
  await expect(
    apply(app, { enabled: false, currentRestrictionPassword: 'editor' }),
  ).rejects.toThrow('编辑限制密码不正确')
  expect(app.session.protection.getAccess()).toBe(access)
  expect(undoDepth(app.editor.state)).toBe(history)
  expect(
    await apply(app, { enabled: false, currentRestrictionPassword: PASSWORD_VECTORS[2].password }),
  ).toBe(true)
  const saved = await app.session.save(app.editor.getJSON()),
    xml = await settings(saved)
  expect(xml).not.toContain('documentProtection')
  expect(xml).toContain(passwordAttrs())
  expect((await openDocx(saved)).protection.native.modificationPassword).toBe(true)
  await unchanged(bytes, saved, ['word/settings.xml'])
})
// Seven sequential real-worker KDF operations retain their own 30s production deadlines.
// Give the complete create/verify/preserve/clear lifecycle its own bounded CPU budget.
it('creates random salted 100000-spin native passwords, preserves them explicitly, then clears only by intent', async () => {
  const app = await boot(),
    secret = '新密码😀',
    before = app.editor.getJSON()
  expect(
    await apply(app, {
      enabled: true,
      mode: 'readOnly',
      restrictionPassword: { action: 'replace', password: secret },
      modificationPassword: { action: 'replace', password: secret },
    }),
  ).toBe(true)
  expect(JSON.stringify(app.editor.getJSON())).not.toContain(secret)
  expect(JSON.stringify(app.session.protection)).not.toContain(secret)
  const saved = await app.session.save(app.editor.getJSON()),
    xml = await settings(saved)
  expect(xml.match(/cryptSpinCount="100000"/g)).toHaveLength(2)
  const salts = [...xml.matchAll(/w:salt="([^"]+)"/g)].map((m) => m[1])
  expect(salts[0]).not.toBe(salts[1])
  expect(atob(salts[0]!).length).toBe(16)
  const reopened = await boot(saved)
  await expect(reopened.session.protection.verifyModificationPassword('wrong')).rejects.toThrow(
    '密码不正确',
  )
  await reopened.session.protection.verifyModificationPassword(secret)
  expect(reopened.session.protection.getAccess().writable).toBe(false)
  expect(await apply(reopened, { recommended: true, currentRestrictionPassword: secret })).toBe(
    true,
  )
  const preserved = await settings(await reopened.session.save(reopened.editor.getJSON()))
  for (const salt of salts) expect(preserved).toContain(salt)
  // Reopening requires verification again and clearing both gates is explicit.
  const clear = await boot(await reopened.session.save(reopened.editor.getJSON()))
  await clear.session.protection.verifyModificationPassword(secret)
  await apply(clear, {
    enabled: false,
    modificationPassword: { action: 'clear' },
    recommended: false,
    currentRestrictionPassword: secret,
  })
  const unprotected = await openDocx(await clear.session.save(clear.editor.getJSON()))
  expect(unprotected.protection.native).toMatchObject({
    enforced: false,
    modificationPassword: false,
    recommended: false,
  })
  expect(unprotected.protection.getAccess().writable).toBe(true)
  expect(before.attrs?.mimirProtectionState).toBeNull()
}, 120_000)
it('cancels hashing, rejects a late session result and leaves PM/history/bytes exact', async () => {
  const app = await boot(),
    controller = new AbortController(),
    baseline = app.editor.getJSON(),
    access = app.session.protection.getAccess()
  const pending = apply(
    app,
    { modificationPassword: { action: 'replace', password: 'never publish' } },
    controller.signal,
  )
  controller.abort()
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  expect(app.editor.getJSON()).toEqual(baseline)
  expect(app.session.protection.getAccess()).toBe(access)
  expect(undoDepth(app.editor.state)).toBe(0)
  const stale = apply(app, { modificationPassword: { action: 'replace', password: 'late' } })
  await new Promise((resolve) => setTimeout(resolve, 5))
  app.session.protection.endModificationSession()
  await expect(stale).rejects.toMatchObject({ name: 'AbortError' })
  expect(app.editor.getJSON()).toEqual(baseline)
  expect(RealDocxPasswordWorker.instances.every((w) => w.terminated)).toBe(true)
})
it('follows an aliased strict settings relationship and preserves opaque spans and every other entry', async () => {
  const zip = await JSZip.loadAsync(await fixture()),
    old = await zip.file('word/_rels/document.xml.rels')!.async('string')
  zip.file(
    'word/_rels/document.xml.rels',
    old.replace(/Target="settings.xml"/, 'Target="config/private-settings.xml"'),
  )
  const types = await zip.file('[Content_Types].xml')!.async('string')
  zip.file(
    '[Content_Types].xml',
    types.replace('/word/settings.xml', '/word/config/private-settings.xml'),
  )
  const xml = `<?xml version='1.0'?><q:settings xmlns:q='http://purl.oclc.org/ooxml/wordprocessingml/main' xmlns:x='urn:opaque'><!--keep--><x:opaque a='keep'><![CDATA[<x/>]]></x:opaque><q:zoom q:percent = '91'/></q:settings>`
  zip.remove('word/settings.xml')
  zip.file('word/config/private-settings.xml', xml)
  const bytes = await zip.generateAsync({ type: 'uint8array' }),
    app = await boot(bytes)
  await apply(app, { recommended: true })
  const saved = await app.session.save(app.editor.getJSON()),
    out = await settings(saved, 'word/config/private-settings.xml')
  expect(out).toContain(
    "<!--keep--><x:opaque a='keep'><![CDATA[<x/>]]></x:opaque><q:zoom q:percent = '91'/>",
  )
  expect(out).toContain('<q:writeProtection q:recommended="1"/>')
  await unchanged(bytes, saved, ['word/config/private-settings.xml'])
})
it('creates missing settings part, relationship, content type atomically and rejects conflicting content types before publish', async () => {
  const zip = await JSZip.loadAsync(await fixture())
  zip.remove('word/settings.xml')
  const rel = await zip.file('word/_rels/document.xml.rels')!.async('string')
  zip.file(
    'word/_rels/document.xml.rels',
    rel.replace(/<Relationship[^>]+Type="[^"]+\/settings"[^>]*\/>/, ''),
  )
  const ct = await zip.file('[Content_Types].xml')!.async('string')
  zip.file(
    '[Content_Types].xml',
    ct.replace(/<Override[^>]+PartName="\/word\/settings.xml"[^>]*\/>/, ''),
  )
  const bytes = await zip.generateAsync({ type: 'uint8array' }),
    app = await boot(bytes)
  await apply(app, { enabled: true, recommended: true })
  const saved = await app.session.save(app.editor.getJSON()),
    native = await openDocx(saved)
  expect(native.protection.native).toMatchObject({
    enforced: true,
    mode: 'readOnly',
    recommended: true,
    uncertain: false,
  })
  const out = await JSZip.loadAsync(saved)
  expect(await out.file('word/_rels/document.xml.rels')!.async('string')).toContain('/settings')
  expect(await out.file('[Content_Types].xml')!.async('string')).toContain('/word/settings.xml')
  await unchanged(bytes, saved, ['word/_rels/document.xml.rels', '[Content_Types].xml'])
  zip.file(
    '[Content_Types].xml',
    ct.replace(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml',
      'application/x-conflict',
    ),
  )
  const invalid = await boot(await zip.generateAsync({ type: 'uint8array' })),
    before = invalid.editor.getJSON()
  await expect(apply(invalid, { recommended: true })).rejects.toThrow('无法安全修改')
  expect(invalid.editor.getJSON()).toEqual(before)
  expect(undoDepth(invalid.editor.state)).toBe(0)
})
it('refuses unknown history tokens and direct public options overrides', async () => {
  const app = await boot(),
    before = app.editor.getJSON()
  app.editor.view.dispatch(
    app.editor.state.tr.setDocAttribute('mimirProtectionState', 'protection-forged'),
  )
  expect(app.editor.getJSON()).toEqual(before)
  await expect(
    app.session.save(app.editor.getJSON(), { protection: { edit: 'none' } } as never),
  ).rejects.toThrow('保护设置')
})
it('retains native credential spelling and unrelated settings during a recommended-only patch', () => {
  const xml = `<q:settings xmlns:q="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w="urn:other"><!--opaque--><w:writeProtection w:recommended='opaque'/><q:writeProtection q:recommended = '1' ${passwordAttrs().replaceAll('w:', 'q:')}/><q:compat><w:opaque/></q:compat></q:settings>`
  const output = patchDocxProtectionSettings(xml, {
    enabled: false,
    mode: 'readOnly',
    recommended: false,
    restrictionPassword: 'preserve',
    modificationPassword: 'preserve',
  })
  expect(output).toBe(xml.replace("q:recommended = '1'", 'q:recommended="0"'))
})

it('accepts schema-normalized marks and ink attributes without granting body mutation', async () => {
  const app = await boot(
    await fixture('<w:documentProtection w:edit="readOnly" w:enforcement="1"/>'),
  )
  expect(canonicalFormDoc(app.editor.getJSON())).toEqual(canonicalFormDoc(app.session.content))
})

it('saves accepted native checkbox changes when protection is stopped in the same copy', async () => {
  const bytes = await protectedFormsFixture(),
    app = await boot(bytes)
  toggleProtectedForm(app.editor.view, app.session.protection, 'form-2')
  const selected = app.session.protection.readFormControls(app.editor.getJSON())[1]!.checked
  expect(selected).toBe(true)
  const nativeBeforeStop = await app.session.save(app.editor.getJSON())
  await apply(app, { enabled: false })
  const saved = await app.session.save(app.editor.getJSON()),
    reopened = await openDocx(saved)
  expect(reopened.protection.native.enforced).toBe(false)
  expect(reopened.protection.readFormControls(reopened.content)[1]!.checked).toBe(true)
  const before = await JSZip.loadAsync(nativeBeforeStop),
    after = await JSZip.loadAsync(saved)
  expect(await after.file('word/document.xml')!.async('string')).toBe(
    await before.file('word/document.xml')!.async('string'),
  )
  await unchanged(bytes, saved, ['word/document.xml', 'word/settings.xml', '[Content_Types].xml'])
})

it('retains accepted native comments when stopping restriction instead of regenerating discussion metadata', async () => {
  const bytes = await fixture('<w:documentProtection w:edit="comments" w:enforcement="1"/>'),
    app = await boot(bytes)
  const comments = app.session.protection.readComments()!
  comments[0]!.text = '停止保护前已编辑的讨论'
  const options = { comments },
    nativeBeforeStop = await app.session.save(app.editor.getJSON(), options)
  await apply(app, { enabled: false }, new AbortController().signal, options)
  const output = await app.session.save(app.editor.getJSON(), options)
  expect((await openDocx(output)).protection.native.enforced).toBe(false)
  await unchanged(nativeBeforeStop, output, ['word/settings.xml'])
})
it('rejects the result of a native content save if settings change during an awaited writer', async () => {
  const app = await boot()
  app.editor.commands.insertContent('保存期间设置保护')
  let entered!: () => void, release!: () => void
  const start = new Promise<void>((resolve) => {
      entered = resolve
    }),
    gate = new Promise<void>((resolve) => {
      release = resolve
    })
  const original = referenceSave.docxReferenceSaveOptions
  vi.spyOn(referenceSave, 'docxReferenceSaveOptions').mockImplementationOnce(async (...args) => {
    entered()
    await gate
    return original(...args)
  })
  const saving = app.session.save(app.editor.getJSON())
  await start
  await apply(app, { enabled: true, mode: 'readOnly' })
  release()
  await expect(saving).rejects.toThrow('保护状态已变化')
})

it('removes the private candidate when publishing throws, so its captured ID cannot be replayed', async () => {
  const app = await boot(),
    before = app.editor.getJSON(),
    access = app.session.protection.getAccess()
  let captured = ''
  await expect(
    app.session.protection.applySettings(
      input(app.session, { enabled: true }),
      before,
      {},
      (token) => {
        captured = token
        throw new Error('publisher rejected')
      },
      new AbortController().signal,
    ),
  ).rejects.toThrow('publisher rejected')
  app.editor.view.dispatch(app.editor.state.tr.setDocAttribute('mimirProtectionState', captured))
  expect(app.editor.getJSON()).toEqual(before)
  expect(app.session.protection.getAccess()).toBe(access)
  expect(undoDepth(app.editor.state)).toBe(0)
})

it('binds a newly restricted edited copy to its approved content and explains the reopen boundary', async () => {
  const app = await boot()
  app.editor.commands.insertContent('先修改正文，再限制为表单')
  await apply(app, { enabled: true, mode: 'forms' })
  expect(app.session.protection.getAccess()).toMatchObject({ writable: false, formsOnly: false })
  expect(app.session.protection.getAccess().reason).toContain('保存并重新打开')
  const saved = await app.session.save(app.editor.getJSON()),
    reopened = await openDocx(saved)
  expect(JSON.stringify(reopened.content)).toContain('先修改正文，再限制为表单')
  expect(reopened.protection.native).toMatchObject({ enforced: true, mode: 'forms' })
  const forged: PmDocJson = structuredClone(app.editor.getJSON())
  forged.content!.push({ type: 'docParagraph', content: [] })
  await expect(app.session.save(forged)).rejects.toThrow('新编辑限制')
})

it.each(['forms', 'comments'] as const)(
  'requires save/reopen for newly enabled %s when auxiliary edits predate the restriction',
  async (mode) => {
    const zip = await JSZip.loadAsync(
      await protectedFormsFixture('<w:p><w:r><w:t>原始正文</w:t></w:r></w:p>'),
    )
    zip.file('word/settings.xml', passwordSettings(''))
    const app = await boot(await zip.generateAsync({ type: 'uint8array' })),
      options = { pageColor: 'ABCDEF' }
    await apply(app, { enabled: true, mode }, new AbortController().signal, options)
    expect(app.session.protection.getAccess()).toMatchObject({
      writable: false,
      formsOnly: false,
      commentsOnly: false,
    })
    expect(app.session.protection.getAccess().reason).toContain('保存并重新打开')
    const saved = await app.session.save(app.editor.getJSON(), options),
      reopened = await openDocx(saved)
    expect(reopened.protection.native).toMatchObject({ enforced: true, mode })
    const savedZip = await JSZip.loadAsync(saved)
    expect(await savedZip.file('word/document.xml')!.async('string')).toContain('ABCDEF')
  },
)
it.each(['', " x:recommended = '0'", ' x:recommended="false"', " x:recommended='off'"])(
  'preserves untouched native recommended spelling %s during a mode-only change',
  (recommended) => {
    const original = `<x:settings xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><x:documentProtection x:edit="readOnly" x:enforcement="1"/><x:writeProtection${recommended}/></x:settings>`
    const changed = patchDocxProtectionSettings(original, {
      enabled: true,
      mode: 'comments',
      recommended: false,
      restrictionPassword: 'preserve',
      modificationPassword: 'preserve',
    })
    expect(changed).toBe(original.replace('x:edit="readOnly"', 'x:edit="comments"'))
    const on = patchDocxProtectionSettings(changed, {
      enabled: true,
      mode: 'comments',
      recommended: true,
      restrictionPassword: 'preserve',
      modificationPassword: 'preserve',
    })
    expect(on).toContain('x:recommended="1"')
    const off = patchDocxProtectionSettings(on, {
      enabled: true,
      mode: 'comments',
      recommended: false,
      restrictionPassword: 'preserve',
      modificationPassword: 'preserve',
    })
    expect(off).not.toContain('x:recommended="1"')
    expect(readNativeDocxProtection(off).recommended).toBe(false)
  },
)
it('keeps existing modification credentials and absent recommended byte exact when changing only the restriction mode', () => {
  const original = passwordSettings(
    `<w:documentProtection w:edit="readOnly" w:enforcement="1"/><w:writeProtection ${passwordAttrs()}/>`,
  )
  expect(
    patchDocxProtectionSettings(original, {
      enabled: true,
      mode: 'comments',
      recommended: false,
      restrictionPassword: 'preserve',
      modificationPassword: 'preserve',
    }),
  ).toBe(original.replace('w:edit="readOnly"', 'w:edit="comments"'))
})
