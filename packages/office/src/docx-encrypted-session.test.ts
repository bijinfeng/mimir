import { readFileSync, writeFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { openDocx, type DocxSession, type PmDocJson } from './docx.js'
import { DocxEncryptionController } from './docx-encryption.js'
import { decryptDocxInWorker, encryptDocxInWorker } from './docx-encryption-core.js'
import {
  bindDocxEncryptionDocument,
  createDocxEncryptionIntent,
  disposeDocxEncryptionSession,
  encryptedDocxSession,
  isEncryptedDocx,
  readDocxEncryptionState,
} from './docx-encrypted-session.js'
import { DOCX_ENCRYPTION_ATTR, projectDocxEncryption } from './docx-encryption-state.js'
const sessions: DocxSession[] = []
afterEach(() => {
  sessions.splice(0).forEach(disposeDocxEncryptionSession)
  vi.restoreAllMocks()
})
const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(new URL(`../tests/fixtures/docx-encryption/${name}`, import.meta.url)),
  )
async function boot(format: 'agile' | 'standard' | 'plain' = 'agile') {
  const source = {},
    controller = new DocxEncryptionController(source)
  vi.spyOn(controller, 'encrypt').mockImplementation(async (bytes, password) =>
    encryptDocxInWorker(bytes, password),
  )
  const encrypted = format !== 'plain',
    bytes = fixture(
      `office-${encrypted ? format : 'agile'}-${encrypted ? 'password' : 'plain'}.docx`,
    ),
    plain = encrypted ? (await decryptDocxInWorker(bytes, 'Password1234_')).bytes : bytes,
    native = await openDocx(plain),
    session = encryptedDocxSession(
      native,
      bytes,
      encrypted ? 'Password1234_' : null,
      controller,
      source,
    )
  sessions.push(session)
  return { session, native, controller, bytes, plain }
}
function intent(session: DocxSession, doc: PmDocJson, password: string | null) {
  return {
    ...structuredClone(doc),
    attrs: { ...doc.attrs, [DOCX_ENCRYPTION_ATTR]: createDocxEncryptionIntent(session, password) },
  }
}
for (const format of ['standard', 'agile'] as const)
  it(`actual external ${format} no-op returns exact cipher, twice and after ACK`, async () => {
    const { session, bytes, controller } = await boot(format)
    expect(isEncryptedDocx(bytes)).toBe(true)
    const one = await session.save(session.content)
    expect(one).toEqual(bytes)
    session.assertSaveCandidate(one)
    session.acknowledgeSaved(one)
    expect(await session.save(session.content)).toEqual(bytes)
    expect(controller.encrypt).not.toHaveBeenCalled()
  })
it('new/change/remove intent selects actual encryption, ACKs only own candidate, and has no secret in JSON/options', async () => {
  const { session, plain } = await boot('plain')
  const first = intent(session, session.content, 'First synthetic secret'),
    firstCipher = await session.save(first),
    changed = intent(session, first, 'Second synthetic secret'),
    changedCipher = await session.save(changed)
  expect(readDocxEncryptionState(session, changed)).toEqual({ encrypted: true, persisted: false })
  expect((await decryptDocxInWorker(firstCipher, 'First synthetic secret')).bytes).toEqual(plain)
  expect((await decryptDocxInWorker(changedCipher, 'Second synthetic secret')).bytes).toEqual(plain)
  expect(JSON.stringify(first)).not.toContain('First synthetic secret')
  expect(JSON.stringify(session)).not.toContain('First synthetic secret')
  expect(() => session.acknowledgeSaved(changedCipher.slice())).toThrow('失效')
  session.acknowledgeSaved(firstCipher)
  expect(readDocxEncryptionState(session, changed)).toEqual({ encrypted: true, persisted: true })
  const next = await session.save(changed)
  session.acknowledgeSaved(next)
  expect(await session.save(changed)).toEqual(next)
  const removed = intent(session, changed, null),
    unencrypted = await session.save(removed)
  expect(unencrypted).toEqual(plain)
  expect(readDocxEncryptionState(session, removed)).toEqual({ encrypted: false, persisted: true })
  session.acknowledgeSaved(unencrypted)
  expect(readDocxEncryptionState(session, removed).persisted).toBe(false)
  // Explicit history restoration uses the old opaque token, retaining the original key.
  expect(
    (await decryptDocxInWorker(await session.save(first), 'First synthetic secret')).bytes,
  ).toEqual(plain)
  expect(await session.save(session.content)).toEqual(plain)
})
it('native paragraph edits precede cipher; untouched native entries retain exact bytes and fixture is independently inspectable', async () => {
  const { session, plain } = await boot()
  const edited = structuredClone(session.content)
  let modified = false
  const visit = (node: PmDocJson) => {
    if (!modified && node.type === 'text') {
      node.text = `Encrypted local edit ${node.text}`
      modified = true
    }
    node.content?.forEach(visit)
  }
  visit(edited)
  expect(modified).toBe(true)
  const cipher = await session.save(edited),
    result = (await decryptDocxInWorker(cipher, 'Password1234_')).bytes,
    before = await JSZip.loadAsync(plain),
    after = await JSZip.loadAsync(result)
  expect(await after.file('word/document.xml')!.async('string')).toContain('Encrypted local edit ')
  const untouched = Object.entries(before.files).filter(
    ([path, file]) => !file.dir && path !== 'word/document.xml' && path !== 'docProps/core.xml',
  )
  for (const [path, file] of untouched)
    expect(await after.file(path)!.async('uint8array')).toEqual(await file.async('uint8array'))
  const nativeCore = (await before.file('docProps/core.xml')!.async('string'))
    .replace(/(<dcterms:modified[^>]*>)[^<]*(<\/dcterms:modified>)/, '$1DATE$2')
    .replace(/(<cp:revision>)\d+(<\/cp:revision>)/, '$1REV$2')
  expect(
    (await after.file('docProps/core.xml')!.async('string'))
      .replace(/(<dcterms:modified[^>]*>)[^<]*(<\/dcterms:modified>)/, '$1DATE$2')
      .replace(/(<cp:revision>)\d+(<\/cp:revision>)/, '$1REV$2'),
  ).toBe(nativeCore)
  session.acknowledgeSaved(cipher)
  expect(await session.save(edited)).toEqual(cipher)
  writeFileSync('/tmp/mimir-docx-e1u-edited-20261017.docx', cipher)
  writeFileSync('/tmp/mimir-docx-e1u-edited-plain-20261017.docx', result)
})
it('guards all awaited generation and publication against live doc/intent, source disposal and protection changes', async () => {
  const { session, native } = await boot()
  let current = {}
  bindDocxEncryptionDocument(session, () => current)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
      release = resolve
    }),
    originalSave = native.save
  vi.spyOn(native, 'save').mockImplementation(async (...args) => {
    await gate
    return originalSave(...args)
  })
  const generation = session.save(session.content)
  await expect(session.save(session.content)).rejects.toThrow('正在生成')
  current = {}
  release()
  await expect(generation).rejects.toThrow('已变化')
  const candidate = await session.save(session.content)
  current = {}
  expect(() => session.assertSaveCandidate(candidate)).toThrow('已变化')
  // Successful old IO still ACKs, retaining its true persisted key despite the newer document.
  session.acknowledgeSaved(candidate)
  const disposePending = session.save(session.content)
  disposeDocxEncryptionSession(session)
  await expect(disposePending).rejects.toMatchObject({ name: 'AbortError' })
  expect(() => readDocxEncryptionState(session, session.content)).toThrow('已关闭')
})
it('refuses malformed/forged/history tokens and keeps a bounded session secret map', async () => {
  const { session } = await boot('plain')
  await expect(
    session.save({ ...session.content, attrs: { [DOCX_ENCRYPTION_ATTR]: 'password' } }),
  ).rejects.toThrow('设置无效')
  await expect(
    session.save({
      ...session.content,
      attrs: { [DOCX_ENCRYPTION_ATTR]: `enc:${crypto.randomUUID()}` },
    }),
  ).rejects.toThrow('历史已失效')
  expect(
    projectDocxEncryption({ ...session.content, attrs: { other: 7, [DOCX_ENCRYPTION_ATTR]: null } })
      .attrs,
  ).toEqual({ other: 7 })
  for (let i = 0; i < 63; i++) createDocxEncryptionIntent(session, `synthetic${i}`)
  expect(() => createDocxEncryptionIntent(session, 'overflow')).toThrow('63 次')
})
it('damaged and unsupported real containers are classified before requesting a password', () => {
  const damaged = fixture('office-agile-password.docx').slice(0, 600)
  expect(() => isEncryptedDocx(damaged)).toThrow('加密文件结构')
  expect(isEncryptedDocx(fixture('office-agile-plain.docx'))).toBe(false)
})

it('encrypted successful IO carries privacy scrub floor across a newer false/remove intent; export and failed IO never advance it', async () => {
  const { plain, controller } = await boot('plain')
  const zip = await JSZip.loadAsync(plain)
  zip.file(
    'docProps/core.xml',
    '<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Synthetic Author</dc:creator></cp:coreProperties>',
  )
  const bytes = await zip.generateAsync({ type: 'uint8array' }),
    source = {},
    ownController = new DocxEncryptionController(source)
  vi.spyOn(ownController, 'encrypt').mockImplementation(async (data, password) =>
    encryptDocxInWorker(data, password),
  )
  const native = await openDocx(bytes),
    session = encryptedDocxSession(native, bytes, null, ownController, source)
  sessions.push(session)
  const clean = intent(
      session,
      { ...session.content, attrs: { mimirPrivacy: true } },
      'Synthetic privacy key',
    ),
    dirty = intent(session, { ...session.content, attrs: { mimirPrivacy: false } }, null)
  const exported = await session.save(clean)
  await expect(
    (await JSZip.loadAsync((await decryptDocxInWorker(exported, 'Synthetic privacy key')).bytes))
      .file('docProps/core.xml')!
      .async('string'),
  ).resolves.toContain('<dc:creator></dc:creator>')
  expect((await session.readPrivacyState()).cleaned).toBe(false)
  const original = await session.save(dirty)
  expect(
    await (await JSZip.loadAsync(original)).file('docProps/core.xml')!.async('string'),
  ).toContain('Synthetic Author')
  // Simulate successful old library IO after the false intent becomes current.
  const persisted = await session.save(clean)
  session.acknowledgeSaved(persisted)
  expect((await session.readPrivacyState()).cleaned).toBe(true)
  const cleanedFalse = await session.save(dirty)
  expect(
    await (await JSZip.loadAsync(cleanedFalse)).file('docProps/core.xml')!.async('string'),
  ).toContain('<dc:creator></dc:creator>')
  expect(
    await (await JSZip.loadAsync(cleanedFalse)).file('word/settings.xml')!.async('string'),
  ).not.toContain('<w:removePersonalInformation/>')
  expect(readDocxEncryptionState(session, dirty)).toEqual({ encrypted: false, persisted: true })
  expect(controller.encrypt).not.toHaveBeenCalled()
})
it('refuses opening-password intents on real native readonly/forced-tracking sources while retaining unchanged encrypted bytes', async () => {
  const { plain } = await boot('plain')
  for (const mode of ['readOnly', 'trackedChanges']) {
    const zip = await JSZip.loadAsync(plain)
    const path = 'word/settings.xml',
      original = await zip.file(path)!.async('string')
    zip.file(
      path,
      original.replace(
        '</w:settings>',
        `<w:documentProtection w:edit="${mode}" w:enforcement="1"/></w:settings>`,
      ),
    )
    const source = {},
      controller = new DocxEncryptionController(source),
      bytes = await zip.generateAsync({ type: 'uint8array' }),
      native = await openDocx(bytes),
      cipher = (await encryptDocxInWorker(bytes, 'Password1234_')).bytes,
      session = encryptedDocxSession(native, cipher, 'Password1234_', controller, source)
    sessions.push(session)
    expect(() => createDocxEncryptionIntent(session, null)).toThrow(/保护|限制|修订/)
    expect(await session.save(session.content)).toEqual(cipher)
  }
})

it.each(['assertSaveCandidate', 'acknowledgeSaved'] as const)(
  'independent: %s rejects caller-mutated ciphertext',
  async (action) => {
    const { session } = await boot('plain')
    const doc = intent(session, session.content, 'Synthetic candidate integrity key')
    const candidate = await session.save(doc)
    candidate[0] = candidate[0]! ^ 0xff
    expect(() => session[action](candidate)).toThrow(/失效|变化|修改/)
    expect(readDocxEncryptionState(session, doc).persisted).toBe(false)
  },
)

it.each(['plain', 'generated', 'persisted'] as const)(
  'candidate integrity checks interior and final bytes of %s output without poisoning private caches',
  async (path) => {
    const { session } = await boot('plain')
    const doc =
      path === 'plain'
        ? session.content
        : intent(session, session.content, 'Synthetic complete candidate key')
    const original = await session.save(doc)
    if (path === 'persisted') session.acknowledgeSaved(original)
    const candidate = await session.save(doc)
    const expected = candidate.slice()
    // A view over the same buffer must not escape validation after ownership was established.
    const callerView = new Uint8Array(candidate.buffer, candidate.byteOffset, candidate.byteLength)
    for (const index of [Math.floor(candidate.length / 2), candidate.length - 1]) {
      callerView[index] = callerView[index]! ^ 0xff
      expect(() => session.assertSaveCandidate(candidate)).toThrow('已被修改')
      expect(() => session.acknowledgeSaved(candidate)).toThrow('已被修改')
      expect(readDocxEncryptionState(session, doc).persisted).toBe(path === 'persisted')
      expect(await session.save(doc)).toEqual(expected)
      callerView[index] = expected[index]!
    }
    session.assertSaveCandidate(candidate)
    session.acknowledgeSaved(candidate)
    expect(await session.save(doc)).toEqual(expected)
  },
)

it('independent: generated and persisted caches never bypass the final native save guard', async () => {
  const { session, native, controller } = await boot('plain')
  const doc = intent(session, session.content, 'Synthetic cache guard key')
  const first = await session.save(doc)
  expect(await session.save(doc)).toEqual(first)
  expect(controller.encrypt).toHaveBeenCalledOnce()
  const guard = vi.spyOn(native, 'save').mockRejectedValue(new Error('Synthetic final guard'))
  await expect(session.save(doc)).rejects.toThrow('Synthetic final guard')
  guard.mockRestore()
  session.acknowledgeSaved(first)
  vi.spyOn(native, 'save').mockRejectedValue(new Error('Synthetic persisted guard'))
  await expect(session.save(doc)).rejects.toThrow('Synthetic persisted guard')
  expect(controller.encrypt).toHaveBeenCalledOnce()
})

it('independent: candidates and intent identities cannot cross sessions or be ACKed twice', async () => {
  const a = await boot('plain'),
    b = await boot('plain')
  const doc = intent(a.session, a.session.content, 'Synthetic owner key')
  const candidate = await a.session.save(doc)
  await expect(b.session.save(doc)).rejects.toThrow('历史已失效')
  expect(() => b.session.assertSaveCandidate(candidate)).toThrow('失效')
  expect(() => b.session.acknowledgeSaved(candidate)).toThrow('失效')
  expect(readDocxEncryptionState(b.session, b.session.content).persisted).toBe(false)
  a.session.acknowledgeSaved(candidate)
  expect(() => a.session.acknowledgeSaved(candidate)).toThrow('失效')
})

it('independent: encryption projection removes only the exact root token and preserves nested attributes', async () => {
  const { session } = await boot('plain')
  const doc: PmDocJson = intent(session, session.content, 'Synthetic exact projection key')
  doc.attrs = { ...doc.attrs, extraRoot: 'preserve' }
  doc.content![0]!.attrs = {
    ...doc.content![0]!.attrs,
    [DOCX_ENCRYPTION_ATTR]: 'nested ordinary data',
  }
  const projected = projectDocxEncryption(doc)
  expect(projected.attrs).toEqual({ ...session.content.attrs, extraRoot: 'preserve' })
  expect(projected.content![0]!.attrs![DOCX_ENCRYPTION_ATTR]).toBe('nested ordinary data')
  expect(doc.attrs![DOCX_ENCRYPTION_ATTR]).toMatch(/^enc:/)
})
