import JSZip from 'jszip'
import { openDocx } from './docx.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as privacy from './docx-privacy.js'
import {
  finalizeDocxPrivacy,
  nativeDocxPrivacyEnabled,
  readNativeDocxPrivacyEnabled,
} from './docx-privacy.js'
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const WS = 'http://purl.oclc.org/ooxml/wordprocessingml/main'
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const O = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
const CORE = 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties'
const DC = 'http://purl.org/dc/elements/1.1/'
const APP = 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties'
const PEOPLE = 'http://schemas.microsoft.com/office/word/2012/wordml'
const relation = (type: string, target: string, id = type.split('/').at(-1)!) =>
  `<r:Relationship Id="${id}" Type="${type}" Target="${target}"/>`
const rels = (body: string) => `<r:Relationships xmlns:r="${REL}">${body}</r:Relationships>`
const settings = (body = '<w:removePersonalInformation/>') =>
  `<w:settings xmlns:w="${W}" xmlns:x="urn:opaque">${body}<x:keep x:author="Secret"/></w:settings>`
async function fixture(flag = '<w:removePersonalInformation/>') {
  const zip = new JSZip()
  zip.file(
    '_rels/.rels',
    rels(
      relation(O + 'officeDocument', 'word/document.xml') +
        relation(REL + '/metadata/core-properties', 'properties/person.xml') +
        relation(O + 'extended-properties', 'properties/application.xml'),
    ),
  )
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
  )
  zip.file(
    'word/document.xml',
    `<w:document xmlns:w="${W}" xmlns:x="urn:opaque"><w:body><w:p w:author = 'Alice' w:initials="AA" x:author="External" author="Unqualified"><w:r><w:t>Alice remains in body</w:t></w:r><x:inner xmlns:w="urn:rebound" w:author="Rebound"/><w:ins w:author="Bob" w:date="2026-10-17T00:00:00Z"><w:r><w:t>text</w:t></w:r></w:ins></w:p><!-- <w:p w:author="Comment"/> --></w:body></w:document>`,
  )
  zip.file(
    'word/_rels/document.xml.rels',
    rels(
      relation(O + 'settings', 'config/privacy.xml') +
        ['header', 'footer', 'footnotes', 'endnotes', 'comments', 'glossaryDocument']
          .map((type, i) => relation(O + type, `../stories/${type}.xml`, String(i)))
          .join('') +
        relation(
          'http://schemas.microsoft.com/office/2011/relationships/people',
          '../properties/people-custom.xml',
        ) +
        relation(O + 'customXml', '../customXml/data.xml'),
    ),
  )
  zip.file('word/config/privacy.xml', settings(flag))
  for (const [type, root] of Object.entries({
    header: 'hdr',
    footer: 'ftr',
    footnotes: 'footnotes',
    endnotes: 'endnotes',
    comments: 'comments',
    glossaryDocument: 'glossaryDocument',
  }))
    zip.file(
      `stories/${type}.xml`,
      `<q:${root} xmlns:q="${WS}" xmlns:x="urn:opaque"><q:p q:author="Story Author" q:initials="SA" x:author="Other"><q:r><q:t><![CDATA[<q:p q:author="CDATA"/>]]></q:t></q:r></q:p></q:${root}>`,
    )
  zip.file(
    'properties/person.xml',
    `<p:coreProperties xmlns:p="${CORE}" xmlns:d="${DC}" xmlns:x="urn:opaque"><d:creator x:keep="yes"><![CDATA[Alice]]></d:creator><p:lastModifiedBy>Bob &amp; Co</p:lastModifiedBy><x:creator>Keep</x:creator><x:scope xmlns:d="urn:rebound"><d:creator>Rebound</d:creator></x:scope><p:created>2026-10-17</p:created></p:coreProperties>`,
  )
  zip.file(
    'properties/application.xml',
    `<Properties xmlns="${APP}" xmlns:x="urn:opaque"><Manager x:keep="yes">Manager</Manager><Company>Company</Company><Application>Word</Application><x:Company>Keep Company</x:Company></Properties>`,
  )
  zip.file(
    'properties/people-custom.xml',
    `<p:people xmlns:p="${PEOPLE}" xmlns:x="urn:opaque"><p:person p:author="Alice"><p:presenceInfo providerId="AD" userId="Alice"/></p:person><x:person x:author="Keep"/><!-- <p:person/> --></p:people>`,
  )
  zip.file('customXml/data.xml', `<w:custom xmlns:w="${W}" w:author="Custom"/>`)
  zip.file('docProps/custom.xml', `<w:custom xmlns:w="${W}" w:author="CustomProps"/>`)
  zip.file('word/unrelated.xml', `<w:ignored xmlns:w="${W}" w:author="Not a story"/>`)
  zip.file('media/opaque.bin', new Uint8Array([0, 255, 1, 2, 3]))
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
async function text(bytes: Uint8Array, path: string) {
  return (await JSZip.loadAsync(bytes)).file(path)!.async('string')
}
async function change(bytes: Uint8Array, path: string, value: string | null) {
  const zip = await JSZip.loadAsync(bytes)
  if (value === null) zip.remove(path)
  else zip.file(path, value)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
async function exactExcept(before: Uint8Array, after: Uint8Array, except: string[]) {
  const a = await JSZip.loadAsync(before),
    b = await JSZip.loadAsync(after)
  expect(
    Object.keys(a.files)
      .filter((n) => !a.files[n]!.dir)
      .toSorted(),
  ).toEqual(
    Object.keys(b.files)
      .filter((n) => !b.files[n]!.dir)
      .toSorted(),
  )
  for (const [name, file] of Object.entries(a.files).filter(
    ([entryName, entryFile]) => !entryFile.dir && !except.includes(entryName),
  ))
    expect(await b.file(name)!.async('uint8array')).toEqual(await file.async('uint8array'))
}
afterEach(() => vi.restoreAllMocks())
describe('native DOCX final privacy scrub', () => {
  it('scrubs actual related native parts and scoped Word attrs while preserving body/date/opaque payloads', async () => {
    const before = await fixture(),
      after = await finalizeDocxPrivacy(before)
    const doc = await text(after, 'word/document.xml')
    expect(doc).toContain('w:author = \'Author\' w:initials="A"')
    expect(doc).toContain('Alice remains in body')
    expect(doc).toContain('w:date="2026-10-17T00:00:00Z"')
    expect(doc).toContain('x:author="External" author="Unqualified"')
    expect(doc).toContain('xmlns:w="urn:rebound" w:author="Rebound"')
    expect(doc).toContain('<!-- <w:p w:author="Comment"/> -->')
    for (const type of [
      'header',
      'footer',
      'footnotes',
      'endnotes',
      'comments',
      'glossaryDocument',
    ]) {
      const story = await text(after, `stories/${type}.xml`)
      expect(story).toContain('q:author="Author" q:initials="A" x:author="Other"')
      expect(story).toContain('<![CDATA[<q:p q:author="CDATA"/>]]>')
    }
    expect(await text(after, 'properties/person.xml')).toBe(
      (await text(before, 'properties/person.xml'))
        .replace('<![CDATA[Alice]]>', '')
        .replace('Bob &amp; Co', ''),
    )
    expect(await text(after, 'properties/application.xml')).toBe(
      (await text(before, 'properties/application.xml'))
        .replace('>Manager</Manager>', '></Manager>')
        .replace('>Company</Company>', '></Company>'),
    )
    expect(await text(after, 'properties/people-custom.xml')).toBe(
      (await text(before, 'properties/people-custom.xml')).replace(
        '<p:person p:author="Alice"><p:presenceInfo providerId="AD" userId="Alice"/></p:person>',
        '',
      ),
    )
    await exactExcept(before, after, [
      'word/document.xml',
      ...['header', 'footer', 'footnotes', 'endnotes', 'comments', 'glossaryDocument'].map(
        (t) => `stories/${t}.xml`,
      ),
      'properties/person.xml',
      'properties/application.xml',
      'properties/people-custom.xml',
    ])
    expect(await finalizeDocxPrivacy(after)).toBe(after)
  })
  it.each(['0', 'false', 'off'])(
    'native qualified explicit %s means no scrub and no recompression',
    async (value) => {
      const before = await fixture(`<w:removePersonalInformation w:val="${value}"/>`)
      expect(await finalizeDocxPrivacy(before)).toBe(before)
      const enabled = await finalizeDocxPrivacy(before, true)
      expect(await text(enabled, 'word/config/privacy.xml')).toContain('w:val="1"')
      expect(await text(enabled, 'word/document.xml')).toContain("w:author = 'Author'")
    },
  )
  it.each(['1', 'true', 'on'])('native qualified %s activates scrub', async (value) => {
    const before = await fixture(`<w:removePersonalInformation w:val="${value}"/>`)
    expect(await text(await finalizeDocxPrivacy(before), 'word/document.xml')).toContain(
      "w:author = 'Author'",
    )
  })
  it('an absent/foreign/nested flag does not activate privacy', async () => {
    for (const flag of [
      '',
      '<x:removePersonalInformation/>',
      '<x:scope><w:removePersonalInformation/></x:scope>',
    ]) {
      const before = await fixture(flag)
      expect(await finalizeDocxPrivacy(before)).toBe(before)
    }
  })
  it('explicit disable changes only the real flag and retains metadata and opaque flag lookalikes', async () => {
    const before = await fixture('<x:removePersonalInformation/><w:removePersonalInformation/>')
    const after = await finalizeDocxPrivacy(before, false)
    expect(await text(after, 'word/config/privacy.xml')).toBe(
      settings('<x:removePersonalInformation/>'),
    )
    await exactExcept(before, after, ['word/config/privacy.xml'])
  })
  it('adds a flag to self-closing prefixed or default namespace settings without rebinding extension prefixes', async () => {
    for (const shell of [
      `<w:settings xmlns:w="${W}" xmlns:mimirW="urn:other"/>`,
      `<settings xmlns="${WS}"/>`,
    ]) {
      const before = await change(await fixture(), 'word/config/privacy.xml', shell)
      const after = await finalizeDocxPrivacy(before, true)
      expect(await text(after, 'word/config/privacy.xml')).toContain('removePersonalInformation/>')
      expect(await finalizeDocxPrivacy(after)).toBe(after)
    }
  })
  it('creates missing settings/relationship/type atomically without touching existing unreferenced settings', async () => {
    let before = await fixture()
    const originalRels = await text(before, 'word/_rels/document.xml.rels')
    before = await change(
      before,
      'word/_rels/document.xml.rels',
      originalRels.replace(relation(O + 'settings', 'config/privacy.xml'), ''),
    )
    const after = await finalizeDocxPrivacy(before, true)
    expect(await text(after, 'word/config/privacy.xml')).toBe(
      await text(before, 'word/config/privacy.xml'),
    )
    expect(await text(after, 'word/mimir-privacy-settings.xml')).toContain(
      '<w:removePersonalInformation/>',
    )
    expect(await text(after, 'word/_rels/document.xml.rels')).toContain(
      'Target="mimir-privacy-settings.xml"',
    )
    expect(await text(after, '[Content_Types].xml')).toContain(
      'PartName="/word/mimir-privacy-settings.xml"',
    )
    expect(await finalizeDocxPrivacy(after)).toBe(after)
  })
  it('follows root main-document and recursive glossary/header relationships at noncanonical locations', async () => {
    const zip = await JSZip.loadAsync(await fixture())
    zip.file('_rels/.rels', rels(relation(O + 'officeDocument', 'custom/main.xml')))
    zip.file('custom/main.xml', await zip.file('word/document.xml')!.async('string'))
    zip.file(
      'custom/_rels/main.xml.rels',
      rels(
        relation(O + 'settings', '../word/config/privacy.xml') +
          relation(O + 'glossaryDocument', '../stories/glossaryDocument.xml'),
      ),
    )
    zip.file('stories/_rels/glossaryDocument.xml.rels', rels(relation(O + 'header', 'header.xml')))
    const before = await zip.generateAsync({ type: 'uint8array' }),
      after = await finalizeDocxPrivacy(before)
    expect(await text(after, 'custom/main.xml')).toContain("w:author = 'Author'")
    expect(await text(after, 'stories/header.xml')).toContain('q:author="Author"')
    await exactExcept(before, after, [
      'custom/main.xml',
      'stories/glossaryDocument.xml',
      'stories/header.xml',
    ])
  })
  it.each([
    ['word/config/privacy.xml', settings('<w:removePersonalInformation w:val="invalid"/>')],
    [
      'word/config/privacy.xml',
      settings('<w:removePersonalInformation/><w:removePersonalInformation/>'),
    ],
    [
      'word/config/privacy.xml',
      `<w:settings xmlns:w="${W}" xmlns:q="${W}"><w:removePersonalInformation w:val="1" q:val="0"/></w:settings>`,
    ],
    [
      'properties/person.xml',
      `<!DOCTYPE x [<!ENTITY leak "Secret">]><p:coreProperties xmlns:p="${CORE}"/>`,
    ],
    [
      'properties/application.xml',
      `<Properties xmlns="${APP}"><Company><opaque>Keep</opaque></Company></Properties>`,
    ],
    ['stories/header.xml', `<w:hdr xmlns:w="${W}"><w:p></w:hdr>`],
    ['stories/header.xml', `<w:hdr xmlns:w="${W}" unknown:author="Secret"/>`],
    [
      'word/_rels/document.xml.rels',
      rels(
        relation(O + 'settings', 'config/privacy.xml') +
          `<r:Relationship Id="remote" Type="${O}header" Target="https://example.com/h.xml" TargetMode="External"/>`,
      ),
    ],
    [
      'word/_rels/document.xml.rels',
      rels(
        relation(O + 'settings', 'config/privacy.xml') +
          relation(O + 'header', '../../outside.xml'),
      ),
    ],
    [
      'word/_rels/document.xml.rels',
      rels(
        relation(O + 'settings', 'config/privacy.xml') +
          relation(O + 'header', '../stories/missing.xml'),
      ),
    ],
  ])('refuses ambiguous/malformed/unsafe metadata atomically: %s', async (path, value) => {
    const before = await change(await fixture(), path, value)
    const copy = before.slice()
    await expect(finalizeDocxPrivacy(before)).rejects.toThrow('原件保持不变')
    expect(before).toEqual(copy)
  })
  it('reads private source flags by direct expanded namespace, independent of caller parsed state', () => {
    expect(nativeDocxPrivacyEnabled(null)).toBe(false)
    expect(nativeDocxPrivacyEnabled(settings())).toBe(true)
    expect(nativeDocxPrivacyEnabled(settings('<w:removePersonalInformation w:val="off"/>'))).toBe(
      false,
    )
    expect(nativeDocxPrivacyEnabled(settings('<x:removePersonalInformation/>'))).toBe(false)
    expect(
      nativeDocxPrivacyEnabled(settings('<x:scope><w:removePersonalInformation/></x:scope>')),
    ).toBe(false)
    expect(
      nativeDocxPrivacyEnabled(
        `<q:settings xmlns:q="${WS}"><q:removePersonalInformation q:val="on"/></q:settings>`,
      ),
    ).toBe(true)
    expect(
      nativeDocxPrivacyEnabled(
        `<settings xmlns="${W}"><removePersonalInformation val="off"/></settings>`,
      ),
    ).toBe(true)
  })
  it('does not mask malformed explicit intents or duplicate property relationships', async () => {
    const before = await fixture()
    await expect(finalizeDocxPrivacy(before, 'false' as never)).rejects.toThrow('原件保持不变')
    const duplicate = await change(
      before,
      '_rels/.rels',
      (await text(before, '_rels/.rels')).replace(
        '</r:Relationships>',
        relation(O + 'extended-properties', 'properties/application.xml', 'duplicate') +
          '</r:Relationships>',
      ),
    )
    await expect(finalizeDocxPrivacy(duplicate)).rejects.toThrow('原件保持不变')
  })
  it('preserves foreign people in rebound scopes, and rejects spoofed real roots', async () => {
    const before = await change(
      await fixture(),
      'properties/people-custom.xml',
      `<p:people xmlns:p="${PEOPLE}"><p:person/><x:scope xmlns:x="urn:opaque" xmlns:p="urn:rebound"><p:person p:author="Keep"/></x:scope></p:people>`,
    )
    expect(await text(await finalizeDocxPrivacy(before), 'properties/people-custom.xml')).toBe(
      (await text(before, 'properties/people-custom.xml')).replace('<p:person/>', ''),
    )
    const wrong = await change(
      before,
      'properties/person.xml',
      `<coreProperties xmlns="urn:opaque"><creator>Keep</creator></coreProperties>`,
    )
    await expect(finalizeDocxPrivacy(wrong)).rejects.toThrow('原件保持不变')
  })
  it('enforces actual node count and cumulative XML budgets', async () => {
    const count = await change(
      await fixture(),
      'stories/header.xml',
      `<w:hdr xmlns:w="${W}">${'<w:p/>'.repeat(100_001)}</w:hdr>`,
    )
    await expect(finalizeDocxPrivacy(count)).rejects.toThrow('原件保持不变')
    const zip = await JSZip.loadAsync(await fixture())
    zip.file(
      'word/_rels/document.xml.rels',
      rels(
        relation(O + 'settings', 'config/privacy.xml') +
          Array.from({ length: 9 }, (_, i) =>
            relation(O + 'header', `../stories/budget-${i}.xml`, `budget-${i}`),
          ).join(''),
      ),
    )
    for (let i = 0; i < 9; i++)
      zip.file(`stories/budget-${i}.xml`, `<w:hdr xmlns:w="${W}">${'x'.repeat(1_900_000)}</w:hdr>`)
    await expect(
      finalizeDocxPrivacy(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })),
    ).rejects.toThrow('原件保持不变')
  })
  it('session save suppresses upstream prefix regex and scrubs a native-enabled unchanged document', async () => {
    const before = await fixture(),
      session = await openDocx(before)
    const saved = await session.save(session.content)
    expect(await text(saved, 'word/document.xml')).toContain(
      'xmlns:w="urn:rebound" w:author="Rebound"',
    )
    expect(await text(saved, 'word/document.xml')).toContain("w:author = 'Author'")
    expect(await text(saved, 'properties/person.xml')).toContain(
      '<d:creator x:keep="yes"></d:creator>',
    )
    const reopened = await openDocx(saved)
    expect(await reopened.save(reopened.content)).toEqual(saved)
  })
  it('session options follow explicit flag intent and ignore forged public parsed state', async () => {
    const before = await fixture(''),
      session = await openDocx(before)
    session.footnotes.parsed.removePersonalInfo = true
    expect(await session.save(session.content)).toEqual(before)
    const saved = await session.save(session.content, { removePersonalInfo: true })
    expect(await text(saved, 'word/config/privacy.xml')).toContain('<w:removePersonalInformation/>')
    expect(await text(saved, 'word/document.xml')).toContain("w:author = 'Author'")
    const enabled = await openDocx(await fixture())
    enabled.footnotes.parsed.removePersonalInfo = false
    const disabled = await enabled.save(enabled.content, { removePersonalInfo: false })
    expect(await text(disabled, 'word/document.xml')).toContain("w:author = 'Alice'")
    expect(await text(disabled, 'word/config/privacy.xml')).not.toContain(
      'removePersonalInformation',
    )
    await exactExcept(await fixture(), disabled, ['word/config/privacy.xml'])
  })
  it.each(['readOnly', 'forms', 'comments', 'trackedChanges'])(
    'session protection %s refuses actual metadata writes yet accepts already-clean exact no-op',
    async (mode) => {
      const raw = await fixture(),
        clean = await finalizeDocxPrivacy(raw)
      const protectionNode = `<w:documentProtection w:edit="${mode}" w:enforcement="1"/>`
      const dirtyProtected = await change(
        raw,
        'word/config/privacy.xml',
        settings(protectionNode + '<w:removePersonalInformation/>'),
      )
      const locked = await openDocx(dirtyProtected)
      await expect(locked.save(locked.content)).rejects.toThrow('原件编辑限制不允许清理个人信息')
      const cleanProtected = await change(
        clean,
        'word/config/privacy.xml',
        settings(protectionNode + '<w:removePersonalInformation/>'),
      )
      const unchanged = await openDocx(cleanProtected)
      expect(await unchanged.save(unchanged.content)).toEqual(cleanProtected)
      expect(await unchanged.save(unchanged.content, { removePersonalInfo: true })).toEqual(
        cleanProtected,
      )
    },
  )
  it('retains a UTF8 BOM and target metadata shell when patching', async () => {
    const before = await change(
      await fixture(),
      'properties/person.xml',
      '\uFEFF' + (await text(await fixture(), 'properties/person.xml')),
    )
    const after = await finalizeDocxPrivacy(before)
    const data = await (
      await JSZip.loadAsync(after)
    )
      .file('properties/person.xml')!
      .async('uint8array')
    expect(data.slice(0, 3)).toEqual(new Uint8Array([239, 187, 191]))
    expect(await text(after, 'properties/person.xml')).toContain(
      '<d:creator x:keep="yes"></d:creator>',
    )
  })
  it('session rechecks the protection epoch after the async privacy pass, even if access becomes writable', async () => {
    const before = await fixture(
      '<w:writeProtection w:recommended="1"/><w:removePersonalInformation/>',
    )
    const session = await openDocx(before),
      actual = privacy.finalizeDocxPrivacy
    vi.spyOn(privacy, 'finalizeDocxPrivacy').mockImplementationOnce(async (...args) => {
      const result = await actual(...args)
      session.protection.continueRecommendedEditing()
      return result
    })
    await expect(session.save(session.content)).rejects.toThrow('文档保护状态已变化')
    expect(session.protection.getAccess().writable).toBe(true)
  })
  it('session privacy source follows custom main/settings, ignoring unrelated canonical settings', async () => {
    const zip = await JSZip.loadAsync(await fixture(''))
    zip.file(
      '_rels/.rels',
      rels(
        relation(O + 'officeDocument', 'custom/main.xml') +
          relation(REL + '/metadata/core-properties', 'properties/person.xml'),
      ),
    )
    zip.file('custom/main.xml', await zip.file('word/document.xml')!.async('string'))
    zip.file('custom/_rels/main.xml.rels', rels(relation(O + 'settings', 'settings/custom.xml')))
    zip.file('custom/settings/custom.xml', settings())
    const before = await zip.generateAsync({ type: 'uint8array' }),
      session = await openDocx(before)
    expect(await readNativeDocxPrivacyEnabled(before)).toBe(true)
    const after = await session.save(session.content)
    expect(await text(after, 'custom/main.xml')).toContain("w:author = 'Author'")
    expect(await text(after, 'properties/person.xml')).toContain(
      '<d:creator x:keep="yes"></d:creator>',
    )
    expect(await text(after, 'word/document.xml')).toBe(await text(before, 'word/document.xml'))
    expect(await text(after, 'word/config/privacy.xml')).toBe(
      await text(before, 'word/config/privacy.xml'),
    )
  })
  it('legacy absent root with no privacy stays compatible, but enabled orphan/malformed actual relationship refuses', async () => {
    const zip = await JSZip.loadAsync(await fixture(''))
    zip.remove('_rels/.rels')
    const legacy = await zip.generateAsync({ type: 'uint8array' })
    expect(await readNativeDocxPrivacyEnabled(legacy)).toBe(false)
    const session = await openDocx(legacy)
    expect(await session.save(session.content)).toEqual(legacy)
    zip.file('word/settings.xml', settings())
    await expect(
      readNativeDocxPrivacyEnabled(await zip.generateAsync({ type: 'uint8array' })),
    ).rejects.toThrow('原件保持不变')
    const malformed = await change(
      await fixture(),
      '_rels/.rels',
      rels(
        relation(O + 'officeDocument', 'word/document.xml') +
          relation(O + 'officeDocument', 'other.xml', 'duplicate'),
      ),
    )
    await expect(readNativeDocxPrivacyEnabled(malformed)).rejects.toThrow('原件保持不变')
  })
  it.each([
    `<w:hdr xmlns:w="${W}" xmlns:xml="${W}" xml:author="Secret"/>`,
    `<w:hdr xmlns:w="${W}" xmlns:q="http://www.w3.org/XML/1998/namespace" q:author="Secret"/>`,
    `<w:hdr xmlns:w="${W}" xmlns:q=""/>`,
    `<w:hdr xmlns:w="${W}" xmlns:xmlns="urn:bad"/>`,
  ])('refuses reserved or undeclared namespace bindings atomically', async (xmlValue) => {
    const before = await change(await fixture(), 'stories/header.xml', xmlValue)
    await expect(finalizeDocxPrivacy(before)).rejects.toThrow('原件保持不变')
  })
  it('enforces real depth across fake closings in comments/CDATA and a part byte budget', async () => {
    for (const payload of [
      `<w:hdr xmlns:w="${W}">${'<w:p><!-- </w:p> --><![CDATA[</w:p>]]>'.repeat(65)}${'</w:p>'.repeat(65)}</w:hdr>`,
      `<w:hdr xmlns:w="${W}">${'x'.repeat(2_000_001)}</w:hdr>`,
    ]) {
      const before = await change(await fixture(), 'stories/header.xml', payload)
      await expect(finalizeDocxPrivacy(before)).rejects.toThrow('原件保持不变')
    }
  })
  it.each([
    ['undeclared text entity', `<w:hdr xmlns:w="${W}"><w:p>&privacyLeak;</w:p></w:hdr>`],
    ['zero character reference', `<w:hdr xmlns:w="${W}"><w:p>&#0;</w:p></w:hdr>`],
    ['surrogate character reference', `<w:hdr xmlns:w="${W}"><w:p>&#xD800;</w:p></w:hdr>`],
    ['unbound inherited prefix', `<w:hdr xmlns:w="${W}" toString:author="Secret"/>`],
  ])('refuses malformed XML that the upstream validator accepts: %s', async (_kind, xmlValue) => {
    const before = await change(await fixture(), 'stories/header.xml', xmlValue)
    const copy = before.slice()
    await expect(finalizeDocxPrivacy(before)).rejects.toThrow('原件保持不变')
    expect(before).toEqual(copy)
  })
  it('accepts explicitly bound prototype-named prefixes without confusing namespace scope', async () => {
    const before = await change(
      await fixture(),
      'stories/header.xml',
      `<__proto__:hdr xmlns:__proto__="${W}" __proto__:author="Alice"/>`,
    )
    expect(await text(await finalizeDocxPrivacy(before), 'stories/header.xml')).toBe(
      `<__proto__:hdr xmlns:__proto__="${W}" __proto__:author="Author"/>`,
    )
  })
  it.each(['&private;', '&', '&#;', '&#x;', '&#-1;', '&#x110000;', '&#65534;', '&#xFFFF;'])(
    'rejects invalid entity/reference in an opaque attribute: %s',
    async (value) => {
      const before = await change(
        await fixture(),
        'stories/header.xml',
        `<w:hdr xmlns:w="${W}" xmlns:x="urn:opaque" x:keep="${value}"><w:p w:author="Alice"/></w:hdr>`,
      )
      await expect(finalizeDocxPrivacy(before)).rejects.toThrow('原件保持不变')
    },
  )
  it.each([0, 1, 0xfffe])(
    'rejects literal XML-forbidden character %i even in a comment',
    async (code) => {
      const before = await change(
        await fixture(),
        'stories/header.xml',
        `<w:hdr xmlns:w="${W}"><!-- ${String.fromCodePoint(code)} --><w:p w:author="Alice"/></w:hdr>`,
      )
      await expect(finalizeDocxPrivacy(before)).rejects.toThrow('原件保持不变')
    },
  )
  it('accepts predefined/numeric references and literal ampersands inside CDATA/comments/PI without recursive decoding', async () => {
    const value = `<w:hdr xmlns:w="${W}" xmlns:x="urn:opaque"><!-- &private; &#0; --><?private &private; &#0;?><w:p w:author="Alice &amp; Bob &#x1F642;" x:keep="&amp;#0;"><w:r><w:t>&lt;&gt;&amp;&quot;&apos;&#9;&#10;&#13;&#x1F642;</w:t></w:r><w:r><w:t><![CDATA[&private; &#0; <x>]]></w:t></w:r></w:p></w:hdr>`
    const before = await change(await fixture(), 'stories/header.xml', value)
    expect(await text(await finalizeDocxPrivacy(before), 'stories/header.xml')).toBe(
      value.replace('Alice &amp; Bob &#x1F642;', 'Author'),
    )
  })
  it.each(['true', 'on'])(
    'private enabled %s flag keeps exact native spelling across clean no-op session saves',
    async (value) => {
      const clean = await finalizeDocxPrivacy(
        await fixture(`<w:removePersonalInformation w:val='${value}'/>`),
      )
      const session = await openDocx(clean)
      const saved = await session.save(session.content)
      expect(saved).toEqual(clean)
      expect(await text(saved, 'word/config/privacy.xml')).toContain(`w:val='${value}'`)
      saved.fill(0)
      expect(await session.save(session.content)).toEqual(clean)
    },
  )
  it('public parsed byte replacement cannot enable privacy implicitly on a source with flag off', async () => {
    const before = await fixture(`<w:removePersonalInformation w:val='off'/>`),
      session = await openDocx(before)
    session.footnotes.parsed.internal.originalBytes = await fixture()
    const saved = await session.save(session.content)
    expect(saved).toEqual(before)
    expect(await text(saved, 'word/document.xml')).toContain("w:author = 'Alice'")
  })
  it('session native privacy policy cannot be disabled through public parsed original bytes', async () => {
    const before = await fixture(),
      session = await openDocx(before)
    session.footnotes.parsed.internal.originalBytes = await change(
      before,
      'word/config/privacy.xml',
      settings('<w:removePersonalInformation w:val="off"/>'),
    )
    const saved = await session.save(session.content)
    expect(await text(saved, 'word/document.xml')).toContain("w:author = 'Author'")
    expect(await text(saved, 'properties/person.xml')).toContain(
      '<d:creator x:keep="yes"></d:creator>',
    )
  })
  it.each([
    ['raw CDATA terminator', `<w:hdr xmlns:w="${W}"><w:p>bad ]]&gt; ]]> tail</w:p></w:hdr>`],
    ['raw attribute opening bracket', `<w:hdr xmlns:w="${W}" w:author="A<B"/>`],
    [
      'expanded aliases',
      `<w:hdr xmlns:w="${W}" xmlns:q="${W.replace('main', 'ma&#105;n')}" w:author="Alice" q:author="Bob"/>`,
    ],
  ])('independently refuses invalid lexical/expanded XML: %s', async (_kind, value) => {
    const before = await change(await fixture(), 'stories/header.xml', value),
      snapshot = before.slice()
    await expect(finalizeDocxPrivacy(before)).rejects.toThrow('原件保持不变')
    expect(before).toEqual(snapshot)
  })
  it('retains every legal numeric XML boundary and only decodes a metadata value once', async () => {
    const value = `<w:hdr xmlns:w="${W}"><w:p w:author="&#65;uthor" w:initials="&#x41;"><w:r><w:t>&#9;&#10;&#13;&#32;&#xD7FF;&#xE000;&#xFFFD;&#x10000;&#x10FFFF;&amp;private;</w:t></w:r></w:p></w:hdr>`
    const source = await change(await fixture(), 'stories/header.xml', value),
      clean = await finalizeDocxPrivacy(source)
    expect(await text(clean, 'stories/header.xml')).toBe(value)
    expect(await finalizeDocxPrivacy(clean)).toBe(clean)
  })
  it('resolves entity-escaped namespace bindings and preserves nested prototype-prefix rebinding', async () => {
    const value = `<__proto__:hdr xmlns:__proto__="${W.replace('main', 'ma&#105;n')}" xmlns:x="urn:opaque"><__proto__:p __proto__:author="Alice"/><x:scope xmlns:__proto__="urn:opaque"><__proto__:p __proto__:author="Keep"/></x:scope><__proto__:p __proto__:author="Bob"/></__proto__:hdr>`
    const source = await change(await fixture(), 'stories/header.xml', value)
    expect(await text(await finalizeDocxPrivacy(source), 'stories/header.xml')).toBe(
      value.replace('author="Alice"', 'author="Author"').replace('author="Bob"', 'author="Author"'),
    )
  })
  it('private native source survives in-place mutation of both public byte surfaces', async () => {
    const source = await fixture(),
      snapshot = source.slice(),
      session = await openDocx(source)
    session.originalBytes.fill(0)
    session.footnotes.parsed.internal.originalBytes.fill(0)
    const saved = await session.save(session.content),
      expected = await finalizeDocxPrivacy(snapshot)
    await exactExcept(expected, saved, [])
    expect(await text(saved, 'word/document.xml')).toContain("w:author = 'Author'")
  })
})

describe('session privacy persistence acknowledgements', () => {
  it('only its own successfully persisted candidate advances the scrub floor; false preserves native off spelling', async () => {
    const source = await fixture('<w:removePersonalInformation w:val="off"/>'),
      session = await openDocx(source)
    const intent = (value: boolean) => ({
      ...session.content,
      attrs: { ...session.content.attrs, mimirPrivacy: value },
    })
    expect(await session.readPrivacyState()).toEqual({
      original: false,
      persisted: false,
      cleaned: false,
    })
    const stale = await session.save(intent(false)),
      clean = await session.save(intent(true))
    expect(await session.readPrivacyState()).toEqual({
      original: false,
      persisted: false,
      cleaned: false,
    })
    const unacknowledged = await session.save(intent(false))
    expect(await text(unacknowledged, 'properties/person.xml')).toContain('<![CDATA[Alice]]>')
    const foreign = await openDocx(source)
    expect(() => foreign.acknowledgeSaved(clean)).toThrow('保存基线已变化')
    expect(() => session.acknowledgeSaved(clean.slice())).toThrow('保存基线已变化')
    const notify = vi.fn<() => void>(),
      unsubscribe = session.subscribePrivacy(notify)
    session.acknowledgeSaved(clean)
    expect(notify).toHaveBeenCalledOnce()
    expect(await session.readPrivacyState()).toEqual({
      original: false,
      persisted: true,
      cleaned: true,
    })
    expect(() => session.assertSaveCandidate(stale)).toThrow('保存基线已变化')
    const disabled = await session.save(intent(false))
    expect(await text(disabled, 'word/config/privacy.xml')).toBe(
      await text(source, 'word/config/privacy.xml'),
    )
    expect(await text(disabled, 'properties/person.xml')).toContain(
      '<d:creator x:keep="yes"></d:creator>',
    )
    expect(await text(disabled, 'word/document.xml')).toContain("w:author = 'Author'")
    await exactExcept(source, disabled, [
      'word/document.xml',
      'properties/person.xml',
      'properties/application.xml',
      'properties/people-custom.xml',
      'stories/header.xml',
      'stories/footer.xml',
      'stories/footnotes.xml',
      'stories/endnotes.xml',
      'stories/comments.xml',
      'stories/glossaryDocument.xml',
      'stories/nested-header.xml',
    ])
    session.acknowledgeSaved(disabled)
    expect(await session.readPrivacyState()).toEqual({
      original: false,
      persisted: false,
      cleaned: true,
    })
    unsubscribe()
    expect(() => session.acknowledgeSaved(disabled)).toThrow('保存基线已变化')
  })
  it('refuses a false candidate still finalizing when a successful true cleanup advances the floor', async () => {
    const session = await openDocx(await fixture('')),
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
    const pending = session.save(session.content, { removePersonalInfo: false })
    await waiting
    session.acknowledgeSaved(await session.save(session.content, { removePersonalInfo: true }))
    release()
    await expect(pending).rejects.toThrow('保存基线已变化')
  })
  it('validates only the exact bounded root intent and does not ignore malformed values or unknown body attributes', async () => {
    const session = await openDocx(await fixture(''))
    for (const mimirPrivacy of ['true', 1, {}, []])
      await expect(session.save({ ...session.content, attrs: { mimirPrivacy } })).rejects.toThrow(
        '个人信息设置无效',
      )
    await expect(
      session.save(
        { ...session.content, attrs: { mimirPrivacy: true } },
        { removePersonalInfo: false },
      ),
    ).rejects.toThrow('设置发生冲突')
    const lockedBytes = await change(
        await fixture(''),
        'word/config/privacy.xml',
        settings('<w:documentProtection w:edit="readOnly" w:enforcement="1"/>'),
      ),
      locked = await openDocx(lockedBytes)
    await expect(
      locked.save({ ...locked.content, attrs: { ...locked.content.attrs, mimirPrivacy: true } }),
    ).rejects.toThrow('原件编辑限制不允许清理个人信息')
    await expect(
      locked.save({
        ...locked.content,
        attrs: { ...locked.content.attrs, mimirPrivacy: false, unknownPrivacy: true },
      }),
    ).rejects.toThrow('原件')
    expect(
      await locked.save({
        ...locked.content,
        attrs: { ...locked.content.attrs, mimirPrivacy: false },
      }),
    ).toEqual(lockedBytes)
  })
})

it.each(['readOnly', 'forms', 'comments', 'trackedChanges'])(
  'the legal root privacy boolean does not exempt a nested body attribute under %s',
  async (mode) => {
    const source = await change(
        await fixture(''),
        'word/config/privacy.xml',
        settings(`<w:documentProtection w:edit="${mode}" w:enforcement="1"/>`),
      ),
      session = await openDocx(source),
      altered = structuredClone(session.content)
    altered.attrs = { ...altered.attrs, mimirPrivacy: false }
    altered.content![0]!.attrs = { ...altered.content![0]!.attrs, mimirPrivacy: true }
    await expect(session.save(altered)).rejects.toThrow(
      mode === 'trackedChanges' ? '强制修订' : '原件',
    )
    expect(
      await session.save({
        ...session.content,
        attrs: { ...session.content.attrs, mimirPrivacy: false },
      }),
    ).toEqual(source)
    for (const value of ['false', 0, { value: false }])
      await expect(
        session.save({
          ...session.content,
          attrs: { ...session.content.attrs, mimirPrivacy: value },
        }),
      ).rejects.toThrow('个人信息设置无效')
    expect(await session.readPrivacyState()).toEqual({
      original: false,
      persisted: false,
      cleaned: false,
    })
  },
)

it('a reopened disabled native flag retains the successfully scrubbed bytes without a session floor', async () => {
  const session = await openDocx(await fixture('<w:removePersonalInformation w:val="off"/>')),
    enabled = await session.save(session.content, { removePersonalInfo: true })
  session.acknowledgeSaved(enabled)
  const disabled = await session.save(session.content, { removePersonalInfo: false })
  session.acknowledgeSaved(disabled)
  const reopened = await openDocx(disabled)
  expect(await reopened.readPrivacyState()).toEqual({
    original: false,
    persisted: false,
    cleaned: false,
  })
  expect(await text(disabled, 'properties/person.xml')).toContain(
    '<d:creator x:keep="yes"></d:creator>',
  )
  expect(await reopened.save(reopened.content)).toEqual(disabled)
  await exactExcept(
    disabled,
    await reopened.save(reopened.content, { removePersonalInfo: false }),
    [],
  )
})
