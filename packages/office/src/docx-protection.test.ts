import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { DocxInkExtension } from './editors/docx-ink.js'
import { editorExtensions } from '../vendor/apps/docs/src/renderer/editor/extensions.js'
import { createDocxProtection, readNativeDocxProtection } from './docx-protection.js'
import { openDocx } from './docx.js'
const NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const settings = (node: string, prefix = 'w') =>
  `<${prefix}:settings xmlns:${prefix}="${NS}">${node}</${prefix}:settings>`
const hash = btoa('h'.repeat(64)),
  salt = btoa('s'.repeat(16))
const valid = `w:hash="${hash}" w:salt="${salt}" w:cryptAlgorithmSid="14" w:cryptSpinCount="100000"`
async function fixture(node: string) {
  const zip = await JSZip.loadAsync(
    readFileSync(
      join(
        import.meta.dirname,
        '../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
      ),
    ),
  )
  const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
  if (!rels.includes('/settings"'))
    zip.file(
      'word/_rels/document.xml.rels',
      rels.replace(
        '</Relationships>',
        '<Relationship Id="mimirProtectionSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>',
      ),
    )
  const types = await zip.file('[Content_Types].xml')!.async('string')
  if (!types.includes('/word/settings.xml'))
    zip.file(
      '[Content_Types].xml',
      types.replace(
        '</Types>',
        '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>',
      ),
    )
  zip.file('word/settings.xml', settings(node))
  return zip.generateAsync({ type: 'uint8array' })
}
describe('native DOCX protection policy', () => {
  it.each(['readOnly', 'comments', 'forms', 'trackedChanges'])(
    'honors enforced %s without pretending restricted writes are supported',
    (mode) => {
      const policy = createDocxProtection(
        settings(`<w:documentProtection w:edit="${mode}" w:enforcement="true"/>`),
        { type: 'doc' },
      )
      expect(policy.native).toMatchObject({ mode, enforced: true, credentials: 'none' })
      expect(policy.getAccess().writable).toBe(false)
      expect(() => policy.assertWrite()).toThrow(/原件/)
      expect(() => policy.continueRecommendedEditing()).toThrow(/不允许/)
    },
  )
  it('recognizes alternate prefixes, strict namespace and paired tags', () => {
    for (const ns of [NS, 'http://purl.oclc.org/ooxml/wordprocessingml/main']) {
      const policy = readNativeDocxProtection(
        `<x:settings xmlns:x="${ns}"><x:documentProtection x:edit="forms" x:enforcement="on"></x:documentProtection></x:settings>`,
      )
      expect(policy).toMatchObject({ mode: 'forms', enforced: true })
    }
  })
  it.each([
    '<w:documentProtection w:edit="strange" w:enforcement="1"/>',
    '<w:documentProtection w:enforcement="1"/>',
    '<w:documentProtection w:edit="readOnly" w:enforcement="yes"/>',
    '<w:documentProtection w:edit="readOnly" w:enforcement="1"/><w:documentProtection w:edit="forms" w:enforcement="0"/>',
    '<w:writeProtection w:password="ABCD"/>',
    '<w:writeProtection w:recommended="true" w:password="ABCD"/>',
    '<w:writeProtection w:recommended="yes"/>',
    '<w:writeProtection w:recommended="1" w:enforcement="0" w:edit="readOnly"/>',
    '<w:documentProtection w:edit="readOnly" w:enforcement="0" w:recommended="1"/>',
    '<w:documentProtection xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:edit="readOnly" w:enforcement="1" x:enforcement="0"/>',
    '<w:writeProtection/>',
    '<w:documentProtection w:edit="unknown" w:enforcement="0"/>',
    '<w:documentProtection w:edit="readOnly" w:enforcement="0" w:formatting="yes"/>',
    '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="w"><w:documentProtection w:edit="readOnly" w:enforcement="1"/></mc:Choice></mc:AlternateContent>',
    `<w:documentProtection w:edit="readOnly" w:enforcement="1" w:hash="broken" w:salt="${salt}" w:cryptAlgorithmSid="14"/>`,
    `<w:documentProtection w:edit="readOnly" w:enforcement="1" ${valid.replace('100000', '-1')}/>`,
    `<w:documentProtection w:edit="readOnly" w:enforcement="1" ${valid.replace('100000', '1.5')}/>`,
    `<w:documentProtection w:edit="readOnly" w:enforcement="1" ${valid.replace('100000', '1000001')}/>`,
    `<w:documentProtection w:edit="readOnly" w:enforcement="1" ${valid.replace('Sid="14"', 'Sid="12"')}/>`,
    '<w:writeProtection w:recommended="1"><w:unknown/></w:writeProtection>',
    '<z:documentProtection xmlns:z="urn:unknown" z:edit="readOnly" z:enforcement="1"/>',
  ])('fails closed for unknown/legacy/malformed configuration: %s', (node) => {
    const policy = createDocxProtection(settings(node), { type: 'doc' })
    expect(policy.getAccess().writable).toBe(false)
    expect(policy.native.reason).toBeTruthy()
    expect(policy.getAccess().recommendedChoice).toBe(false)
  })
  it('distinguishes modify password from recommended-only and never exposes credentials', () => {
    const policy = createDocxProtection(
      settings(`<w:writeProtection w:recommended="1" ${valid}/>`),
      { type: 'doc' },
    )
    expect(policy.native).toMatchObject({
      credentials: 'sha512',
      modificationPassword: true,
      recommended: true,
    })
    expect(policy.getAccess().recommendedChoice).toBe(false)
    expect(JSON.stringify(policy.native)).not.toContain(hash)
    expect(JSON.stringify(policy.native)).not.toContain(salt)
    expect(Object.isFrozen(policy)).toBe(true)
    expect(Object.isFrozen(policy.native)).toBe(true)
  })
  it('requires an explicit recommended-only choice; new sessions do not inherit it', () => {
    const xml = settings('<w:writeProtection w:recommended="1"/>')
    const policy = createDocxProtection(xml, { type: 'doc' })
    expect(policy.getAccess()).toMatchObject({ writable: false, recommendedChoice: true, epoch: 0 })
    let notifications = 0
    const unsubscribe = policy.subscribe(() => notifications++)
    policy.continueRecommendedEditing()
    expect(policy.getAccess()).toMatchObject({ writable: true, epoch: 1 })
    expect(notifications).toBe(1)
    expect(createDocxProtection(xml, { type: 'doc' }).getAccess().writable).toBe(false)
    unsubscribe()
  })
  it.each([
    null,
    settings(''),
    settings('<w:documentProtection w:edit="readOnly" w:enforcement="0"/>'),
  ])('preserves existing editing for unprotected/explicitly inactive documents', (xml) => {
    expect(createDocxProtection(xml, { type: 'doc' }).getAccess().writable).toBe(true)
  })
  it.each(['<w:settings', '<!DOCTYPE a [<!ENTITY x "y">]><settings/>', '<settings/>'])(
    'does not interpret unreadable settings as absence of protection',
    (xml) => {
      expect(createDocxProtection(xml, { type: 'doc' }).getAccess().writable).toBe(false)
    },
  )
})
describe('native session final save guard', () => {
  it.each(['readOnly', 'comments', 'forms', 'trackedChanges'])(
    'returns exact original bytes for %s; rejects real PM or save-options mutations',
    async (mode) => {
      const bytes = await fixture(`<w:documentProtection w:edit="${mode}" w:enforcement="1"/>`)
      const expected = bytes.slice()
      const session = await openDocx(bytes)
      const baseline = structuredClone(session.content)
      expect(await session.save(baseline)).toEqual(expected)
      const normalized = getSchema([...editorExtensions, DocxInkExtension])
        .nodeFromJSON(baseline)
        .toJSON()
      expect(await session.save(normalized)).toEqual(bytes)
      // Public parsed/content/bytes cannot make the private policy or source baseline permissive.
      session.footnotes.parsed.protection = null
      const changed = structuredClone(baseline)
      changed.content!.push({ type: 'docParagraph', content: [{ type: 'text', text: 'bypass' }] })
      session.content.content!.push({
        type: 'docParagraph',
        content: [{ type: 'text', text: 'public mutation' }],
      })
      session.originalBytes.fill(0)
      await expect(session.save(changed)).rejects.toThrow(/原件/)
      for (const options of [
        { protection: null },
        { writeProtection: null },
        { partXml: { 'word/settings.xml': '<w:settings/>' } },
        { partBinary: { 'word/settings.xml': '' } },
        ...(mode === 'comments' ? [] : [{ comments: [] }]),
        { titlePg: true },
      ]) {
        await expect(session.save(baseline, options)).rejects.toThrow(/原件|保护/)
      }
      expect(await session.save(baseline)).toEqual(expected)
    },
  )
  it('keeps original native protection XML when explicitly continuing recommended-only editing', async () => {
    const bytes = await fixture('<w:writeProtection w:recommended="1"/>'),
      session = await openDocx(bytes)
    session.protection.continueRecommendedEditing()
    const changed = structuredClone(session.content)
    changed.content!.push({ type: 'docParagraph', content: [{ type: 'text', text: 'permitted' }] })
    const saved = await session.save(changed)
    const before = await JSZip.loadAsync(bytes),
      after = await JSZip.loadAsync(saved)
    expect(await after.file('word/settings.xml')!.async('string')).toBe(
      await before.file('word/settings.xml')!.async('string'),
    )
    expect((await openDocx(saved)).protection.getAccess().writable).toBe(false)
  })
  it('follows alternate settings parts and rejects missing/ambiguous settings relationships', async () => {
    const bytes = await fixture('<w:documentProtection w:edit="readOnly" w:enforcement="1"/>')
    const zip = await JSZip.loadAsync(bytes)
    const original = await zip.file('word/settings.xml')!.async('string')
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
    zip.file('word/settings.xml', settings(''))
    zip.file('word/private-settings.xml', original)
    const alternate = rels.replace(/Target="settings.xml"/, 'Target="private-settings.xml"')
    expect(alternate).not.toBe(rels)
    zip.file('word/_rels/document.xml.rels', alternate)
    const session = await openDocx(await zip.generateAsync({ type: 'uint8array' }))
    expect(session.protection.getAccess().writable).toBe(false)
    await expect(
      session.save(session.content, { partXml: { 'word/private-settings.xml': settings('') } }),
    ).rejects.toThrow(/保护/)
    zip.file(
      'word/_rels/document.xml.rels',
      alternate.replace('private-settings.xml', 'missing.xml'),
    )
    expect(
      (await openDocx(await zip.generateAsync({ type: 'uint8array' }))).protection.native.uncertain,
    ).toBe(true)
    zip.file(
      'word/_rels/document.xml.rels',
      alternate.replace(
        '</Relationships>',
        '<Relationship Id="duplicate" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>',
      ),
    )
    expect(
      (await openDocx(await zip.generateAsync({ type: 'uint8array' }))).protection.native.uncertain,
    ).toBe(true)
  })
  it('does not allow native protection overwrite through normalized paths or package relationships after recommended choice', async () => {
    const session = await openDocx(await fixture('<w:writeProtection w:recommended="1"/>'))
    session.protection.continueRecommendedEditing()
    for (const path of [
      'word/./settings.xml',
      '/word/settings.xml',
      'word/child/../settings.xml',
      'word/_rels/document.xml.rels',
      '[Content_Types].xml',
    ]) {
      await expect(
        session.save(session.content, { partXml: { [path]: settings('') } }),
      ).rejects.toThrow(/保护/)
    }
  })
  it.each([
    [
      'unknown package namespace',
      (xml: string) =>
        xml.replace('http://schemas.openxmlformats.org/package/2006/relationships', 'urn:unknown'),
    ],
    [
      'qualified relationship attributes',
      (xml: string) =>
        xml.replace(
          'Target="private-settings.xml"',
          'xmlns:x="urn:unknown" x:Target="private-settings.xml"',
        ),
    ],
    [
      'unknown relationship type',
      (xml: string) =>
        xml.replace(
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings',
          'urn:unknown/settings',
        ),
    ],
    [
      'nested settings relationship',
      (xml: string) =>
        xml.replace(
          /(<Relationship [^>]*Target="private-settings.xml"[^>]*\/>)/,
          '<Unknown>$1</Unknown>',
        ),
    ],
  ])('does not turn %s into an editable fallback', async (_label, mutate) => {
    const bytes = await fixture('<w:documentProtection w:edit="readOnly" w:enforcement="1"/>')
    const zip = await JSZip.loadAsync(bytes)
    zip.file('word/private-settings.xml', await zip.file('word/settings.xml')!.async('string'))
    zip.file('word/settings.xml', settings(''))
    const rels = (await zip.file('word/_rels/document.xml.rels')!.async('string')).replace(
      'Target="settings.xml"',
      'Target="private-settings.xml"',
    )
    const mutated = mutate(rels)
    expect(mutated).not.toBe(rels)
    zip.file('word/_rels/document.xml.rels', mutated)
    const session = await openDocx(await zip.generateAsync({ type: 'uint8array' }))
    expect(session.protection.getAccess().writable).toBe(false)
    expect(session.protection.native.uncertain).toBe(true)
  })
  it.each([
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings',
    'http://purl.oclc.org/ooxml/officeDocument/relationships/settings',
  ])('accepts legitimate prefixed package relationships and settings type %s', async (type) => {
    const zip = await JSZip.loadAsync(await fixture('<w:writeProtection w:recommended="1"/>'))
    zip.file('word/private-settings.xml', await zip.file('word/settings.xml')!.async('string'))
    zip.file('word/settings.xml', settings(''))
    const rels = (await zip.file('word/_rels/document.xml.rels')!.async('string'))
      .replace('Target="settings.xml"', 'Target="private-settings.xml"')
      .replace('http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings', type)
      .replace('<Relationships xmlns=', '<r:Relationships xmlns:r=')
      .replaceAll('<Relationship ', '<r:Relationship ')
      .replace('</Relationships>', '</r:Relationships>')
    zip.file('word/_rels/document.xml.rels', rels)
    const session = await openDocx(await zip.generateAsync({ type: 'uint8array' }))
    expect(session.protection.native).toMatchObject({ uncertain: false, recommended: true })
    expect(session.protection.getAccess()).toMatchObject({
      writable: false,
      recommendedChoice: true,
    })
  })
  it('describes the unsupported OLE/encryption container before ZIP parse', async () => {
    await expect(
      openDocx(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
    ).rejects.toThrow(/OLE.*可能是加密 DOCX/)
  })
})
