/** @vitest-environment happy-dom */
import JSZip from 'jszip'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openDocx } from './docx.js'
import * as referenceSave from './docx-reference-save.js'
import { createDocxProtection, readNativeDocxProtection } from './docx-protection.js'
import {
  passwordAttrs,
  passwordDocxFixture,
  passwordSettings,
} from './docx-protection-password-fixture.test-helper.js'
import {
  PASSWORD_VECTORS,
  RealDocxPasswordWorker,
  PASSWORD_VECTOR_SALT,
} from './docx-protection-password-test-helper.js'

beforeEach(() => {
  vi.stubGlobal('Worker', RealDocxPasswordWorker)
  RealDocxPasswordWorker.instances.length = 0
})
afterEach(() => {
  RealDocxPasswordWorker.instances.forEach((worker) => worker.terminate())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
it('refuses native serialized edits when the modification session ends during save', async () => {
  const session = await openDocx(await passwordDocxFixture())
  await session.protection.verifyModificationPassword('editor')
  const edited = structuredClone(session.content)
  edited.content!.push({ type: 'docParagraph', content: [{ type: 'text', text: 'stale save' }] })
  let release!: () => void, entered!: () => void
  const gate = new Promise<void>((resolve) => {
      release = resolve
    }),
    started = new Promise<void>((resolve) => {
      entered = resolve
    })
  const original = referenceSave.docxReferenceSaveOptions
  vi.spyOn(referenceSave, 'docxReferenceSaveOptions').mockImplementationOnce(async (...args) => {
    entered()
    await gate
    return original(...args)
  })
  const pending = session.save(edited)
  await started
  session.protection.endModificationSession()
  await session.protection.verifyModificationPassword('editor')
  expect(session.protection.getAccess().writable).toBe(true)
  release()
  await expect(pending).rejects.toThrow('保护状态已变化')
})
it('keeps credentials private and unlocks only after real worker verification, preserving exact no-op bytes', async () => {
  const bytes = await passwordDocxFixture(),
    session = await openDocx(bytes),
    controller = session.protection
  const before = controller.getAccess(),
    changed = vi.fn<() => void>()
  controller.subscribe(changed)
  expect(before).toMatchObject({ writable: false, modificationPasswordRequired: true, epoch: 0 })
  expect(JSON.stringify(controller)).not.toContain(PASSWORD_VECTOR_SALT)
  expect(JSON.stringify(controller)).not.toContain(PASSWORD_VECTORS[0].hash)
  await expect(controller.verifyModificationPassword('wrong')).rejects.toThrow('密码不正确')
  expect(controller.getAccess()).toBe(before)
  expect(changed).not.toHaveBeenCalled()
  await controller.verifyModificationPassword('editor')
  expect(controller.getAccess()).toMatchObject({
    writable: true,
    modificationUnlocked: true,
    modificationPasswordRequired: false,
    epoch: 1,
  })
  expect(changed).toHaveBeenCalledTimes(1)
  expect(await session.save(session.content)).toEqual(bytes)
  const reopened = await openDocx(await session.save(session.content))
  expect(reopened.protection.getAccess().writable).toBe(false)
  controller.endModificationSession()
  expect(controller.getAccess()).toMatchObject({ writable: false, epoch: 2 })
})
it('honors absent native spin as 100000 using an independent vector', async () => {
  const session = await openDocx(
    await passwordDocxFixture({ vector: PASSWORD_VECTORS[3], missingSpin: true }),
  )
  await session.protection.verifyModificationPassword('default')
  expect(session.protection.getAccess().writable).toBe(true)
})
it('verifies only writeProtection credentials when documentProtection has a different native password', async () => {
  const zip = await JSZip.loadAsync(await passwordDocxFixture({ mode: 'comments' }))
  zip.file(
    'word/settings.xml',
    (await zip.file('word/settings.xml')!.async('string')).replace(
      'w:enforcement="1"/>',
      `w:enforcement="1" ${passwordAttrs(PASSWORD_VECTORS[2])}/>`,
    ),
  )
  const bytes = await zip.generateAsync({ type: 'uint8array' }),
    session = await openDocx(bytes),
    before = session.protection.getAccess()
  await expect(
    session.protection.verifyModificationPassword(PASSWORD_VECTORS[2].password),
  ).rejects.toThrow('密码不正确')
  expect(session.protection.getAccess()).toBe(before)
  await session.protection.verifyModificationPassword('editor')
  expect(session.protection.getAccess()).toMatchObject({
    modificationUnlocked: true,
    commentsOnly: true,
    writable: false,
  })
  expect(await session.save(session.content)).toEqual(bytes)
})
it.each(['readOnly', 'trackedChanges', 'comments', 'forms'])(
  'preserves combined %s restriction after modification unlock',
  async (mode) => {
    const bytes = await passwordDocxFixture({ mode }),
      session = await openDocx(bytes),
      controller = session.protection
    expect(controller.getAccess()).toMatchObject({
      writable: false,
      commentsOnly: false,
      formsOnly: false,
    })
    await controller.verifyModificationPassword('editor')
    expect(controller.getAccess()).toMatchObject({
      writable: mode === 'trackedChanges',
      mandatoryTracking: mode === 'trackedChanges',
      commentsOnly: mode === 'comments',
      formsOnly: mode === 'forms',
    })
    const failure = (() => {
      try {
        controller.assertWrite()
        return ''
      } catch (cause) {
        return String(cause)
      }
    })()
    expect(failure).toMatch(mode === 'trackedChanges' ? /^$/ : /原件|正文|表单|取消|批注/)
    const edited = structuredClone(session.content)
    edited.content!.push({ type: 'docParagraph', content: [{ type: 'text', text: 'forbidden' }] })
    await expect(session.save(edited)).rejects.toThrow(/原件|正文|表单|取消|批注|强制修订/)
    expect(await session.save(session.content)).toEqual(bytes)
  },
)
it.each([
  '<w:documentProtection w:edit="readOnly" w:enforcement="1" w:password="ABCD"/>',
  `<w:documentProtection w:edit="comments" w:enforcement="1" ${passwordAttrs().replace('cryptAlgorithmSid="14"', 'cryptAlgorithmSid="12"')}/>`,
])('mixed unsupported document credentials cannot be unlocked', async (node) => {
  const controller = createDocxProtection(
    passwordSettings(`${node}<w:writeProtection ${passwordAttrs()}/>`),
    { type: 'doc' },
  )
  expect(controller.getAccess().modificationPasswordRequired).toBe(false)
  await expect(controller.verifyModificationPassword('editor')).rejects.toThrow('不支持')
  expect(RealDocxPasswordWorker.instances).toHaveLength(0)
})
it.each(['-1', '1.5', '1000001', 'oops'])(
  'rejects malformed native spin %s without defaulting',
  async (spin) => {
    const native = readNativeDocxProtection(
      passwordSettings(
        `<w:writeProtection ${passwordAttrs().replace('cryptSpinCount="0"', `cryptSpinCount="${spin}"`)}/>`,
      ),
    )
    expect(native.credentials).toBe('unsupported')
  },
)
it('binds pending verification to session lifetime and refuses duplicate requests and late replies', async () => {
  const session = await openDocx(await passwordDocxFixture()),
    controller = session.protection,
    before = controller.getAccess()
  const pending = controller.verifyModificationPassword('editor')
  await expect(controller.verifyModificationPassword('editor')).rejects.toThrow('正在进行')
  controller.endModificationSession()
  await expect(pending).rejects.toThrow(/原件|正文|表单|取消|批注|强制修订/)
  RealDocxPasswordWorker.instances[0]!.emit('message', { data: { matches: true } } as MessageEvent)
  expect(controller.getAccess()).toBe(before)
  expect(RealDocxPasswordWorker.instances[0]!.terminated).toBe(true)
  await controller.verifyModificationPassword('editor')
  expect(controller.getAccess().writable).toBe(true)
})
it('preserves native settings and every non-document ZIP entry after actual authorized body edit', async () => {
  const bytes = await passwordDocxFixture(),
    session = await openDocx(bytes)
  const edited = structuredClone(session.content)
  const change = (node: typeof edited): boolean => {
    if (node.type === 'text' && node.text) {
      node.text = `edited ${node.text}`
      return true
    }
    return node.content?.some(change) ?? false
  }
  expect(change(edited)).toBe(true)
  await expect(session.save(edited)).rejects.toThrow(/原件|正文|表单|取消|批注|强制修订/)
  await session.protection.verifyModificationPassword('editor')
  const output = await session.save(edited),
    originalZip = await JSZip.loadAsync(bytes),
    outputZip = await JSZip.loadAsync(output)
  expect(await outputZip.file('word/document.xml')!.async('string')).toContain('edited ')
  expect(Object.keys(outputZip.files).toSorted()).toEqual(Object.keys(originalZip.files).toSorted())
  for (const [path, entry] of Object.entries(originalZip.files).filter(
    ([partPath, part]) => !part.dir && partPath !== 'word/document.xml',
  )) {
    expect(await outputZip.file(path)!.async('uint8array')).toEqual(await entry.async('uint8array'))
  }
  for (const options of [
    { protection: {} },
    { writeProtection: {} },
    { partXml: { 'word/settings.xml': '<forged/>' } },
  ]) {
    await expect(session.save(edited, options as never)).rejects.toThrow('保护设置')
  }
  const reopened = await openDocx(output)
  expect(reopened.protection.getAccess().writable).toBe(false)
})
