import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { openPptxForEdit } from '../pptx.js'
import { createPptxAgentHandle } from '../agent/pptx-agent.js'
import { pptxManualFillSchema } from '@mimir/shared'
import { PptxArchive, relsPathFor, resolveTarget } from '../pptx-archive.js'
vi.mock('../../../../apps/server/src/services/documents.js', () => ({
  getDocument: async (id: string) =>
    id === 'complex-bg'
      ? {
          id,
          kind: 'file',
          fileExtension: 'pptx',
          mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        }
      : null,
}))
vi.mock('../../../../apps/server/src/services/pptx-agent-services.js', () => ({
  applyPptxService: () => {
    throw new Error('Unexpected model service')
  },
}))
import { applyPptxOpsOnHost } from '../../../../apps/server/src/services/pptx-agent-host.js'

const bgPattern = /<p:bg\b[^>]*(?:\/>|>[\s\S]*?<\/p:bg>)/
const complex =
  '<p:bg><p:bgPr shadeToTitle="1"><a:gradFill rotWithShape="0"><a:gsLst><a:gs pos="0"><a:srgbClr val="123456"><a:alpha val="32000"/></a:srgbClr></a:gs><a:gs pos="33000"><a:srgbClr val="CC2244"><a:alpha val="72000"/></a:srgbClr></a:gs><a:gs pos="71000"><a:srgbClr val="22CC44"/></a:gs><a:gs pos="100000"><a:srgbClr val="456789"/></a:gs></a:gsLst><a:path path="rect"><a:fillToRect l="12000" t="21000" r="31000" b="42000"/></a:path><a:tileRect l="-5000" t="6000" r="7000" b="8000"/></a:gradFill><a:effectLst><a:softEdge rad="12700"/></a:effectLst><a:extLst><a:ext uri="mimir-native-proof"><x:proof xmlns:x="urn:mimir-background-test" value="untouched"/></a:ext></a:extLst></p:bgPr></p:bg>'
const apply = (bytes: Uint8Array, version = 0, slide = 0, signal?: AbortSignal) =>
  applyPptxOpsOnHost({
    documentId: 'complex-bg',
    bytes,
    expectedVersion: version,
    action: 'manual_fill',
    ops: [{ kind: 'copy-current-background', slide, allSlides: true }],
    signal,
  })
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
const putBg = (xml: string, bg: string) =>
  bgPattern.test(xml)
    ? xml.replace(bgPattern, () => bg)
    : xml.replace(/<p:cSld\b[^>]*>/, (tag) => tag + bg)
async function fixture() {
  const session = await openPptxForEdit(
    new Uint8Array(
      readFileSync(new URL('../../tests/fixtures/title-layout.pptx', import.meta.url)),
    ),
  )
  session.duplicate(0)
  const zip = await JSZip.loadAsync(await session.save())
  const archive = await PptxArchive.open(await zip.generateAsync({ type: 'uint8array' }))
  const [first, second] = archive.readPresentation().slidePaths as [string, string]
  return { zip, first, second, archive }
}
async function bytesOf(zip: JSZip) {
  return zip.generateAsync({ type: 'uint8array' })
}
async function verifyUntouched(before: Uint8Array, after: Uint8Array, allowed: string[]) {
  const a = await PptxArchive.open(before),
    b = await PptxArchive.open(after)
  for (const [path, bytes] of [...a.entries].filter(([entryPath]) => !allowed.includes(entryPath)))
    expect(b.entries.get(path)).toEqual(bytes)
  for (const [, bytes] of [...b.entries].filter(
    ([path]) => path.endsWith('.xml') || path.endsWith('.rels'),
  ))
    expect(XMLValidator.validate(decode(bytes))).toBe(true)
}
function nativeBg(archive: PptxArchive, path: string) {
  return bgPattern.exec(archive.readText(path) ?? '')?.[0]
}
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'a:gs',
})
const bgPr = (xml: string) =>
  (parser.parse(xml) as Record<string, Record<string, unknown>>)['p:bg']!['p:bgPr']
describe('current native PPTX background copying', () => {
  it('retains all stops, alpha, custom path, focal/tile rectangles/effects/extensions; only target slide bytes change and two saves stay identical', async () => {
    const f = await fixture()
    f.zip.file(f.first, putBg(await f.zip.file(f.first)!.async('string'), complex))
    const before = await bytesOf(f.zip),
      result = await apply(before)
    expect(result).toMatchObject({ changed: true, version: 1 })
    const archive = await PptxArchive.open(result.bytes)
    expect(bgPr(nativeBg(archive, f.second)!)).toEqual(bgPr(complex))
    expect(nativeBg(archive, f.first)).toBe(complex)
    await verifyUntouched(before, result.bytes, [f.second])
    const session = await openPptxForEdit(result.bytes)
    expect(session.slides()[1]!.background).toEqual(session.slides()[0]!.background)
    const saved = await session.save()
    session.commit()
    const second = await session.save()
    await verifyUntouched(result.bytes, saved, [])
    await verifyUntouched(saved, second, [])
    expect(await apply(result.bytes, 1)).toMatchObject({ changed: false, version: 1 })
  })
  it.each([
    [
      'linear scaled=false',
      complex.replace(/<a:path[\s\S]*?<\/a:path>/, '<a:lin ang="3300000" scaled="0"/>'),
    ],
    [
      'pattern foreground/background',
      '<p:bg><p:bgPr><a:pattFill prst="diagCross"><a:fgClr><a:schemeClr val="accent2"><a:alpha val="50000"/></a:schemeClr></a:fgClr><a:bgClr><a:srgbClr val="ABCDEF"/></a:bgClr></a:pattFill><a:effectLst/></p:bgPr></p:bg>',
    ],
    ['noFill', '<p:bg><p:bgPr><a:noFill/><a:effectLst/></p:bgPr></p:bg>'],
  ])('copies %s unchanged', async (_name, fill) => {
    const f = await fixture()
    f.zip.file(f.first, putBg(await f.zip.file(f.first)!.async('string'), fill))
    const before = await bytesOf(f.zip),
      result = await apply(before)
    const archive = await PptxArchive.open(result.bytes)
    expect(bgPr(nativeBg(archive, f.second)!)).toEqual(bgPr(fill))
    await verifyUntouched(before, result.bytes, [f.second])
  })
  it('keeps source-root extension namespaces and markup compatibility context local to the copied background', async () => {
    const f = await fixture()
    const xml = (await f.zip.file(f.first)!.async('string')).replace(
      '<p:sld ',
      '<p:sld xmlns:x="urn:mimir-background-test" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="x" ',
    )
    f.zip.file(f.first, putBg(xml, complex.replace(' xmlns:x="urn:mimir-background-test"', '')))
    const result = await apply(await bytesOf(f.zip))
    const archive = await PptxArchive.open(result.bytes),
      copied = nativeBg(archive, f.second)!
    expect(copied).toContain('xmlns:x="urn:mimir-background-test"')
    expect(copied).toContain('mc:Ignorable="x"')
    expect(bgPr(copied)).toEqual(bgPr(complex.replace(' xmlns:x="urn:mimir-background-test"', '')))
  })
  it('materializes the source layout background and source color mapping, preserving master/layout/theme bytes and each target graphics toggle', async () => {
    const f = await fixture(),
      chain = f.archive.resolveSlideChain(f.first)
    f.zip.file(
      f.first,
      (await f.zip.file(f.first)!.async('string'))
        .replace(bgPattern, '')
        .replace(
          '</p:sld>',
          '<p:clrMapOvr><a:overrideClrMapping accent1="accent2"/></p:clrMapOvr></p:sld>',
        ),
    )
    const scheme = complex
      .replace('<a:srgbClr val="123456">', '<a:schemeClr val="accent1">')
      .replace('</a:srgbClr>', '</a:schemeClr>')
    f.zip.file(
      chain.layoutPath!,
      putBg(await f.zip.file(chain.layoutPath!)!.async('string'), scheme),
    )
    f.zip.file(
      f.second,
      putBg(
        (await f.zip.file(f.second)!.async('string')).replace(
          '<p:sld ',
          '<p:sld showMasterSp="0" ',
        ),
        '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:bgPr></p:bg>',
      ),
    )
    const before = await bytesOf(f.zip),
      sourceSession = await openPptxForEdit(before),
      result = await apply(before)
    const after = await PptxArchive.open(result.bytes),
      reopened = await openPptxForEdit(result.bytes)
    expect(reopened.slides().map((s) => s.background)).toEqual([
      sourceSession.slides()[0]!.background,
      sourceSession.slides()[0]!.background,
    ])
    expect(reopened.slides()[1]!.masterSpHidden).toBe(true)
    expect(reopened.slides()[0]!.bgOwn).toBe(true)
    expect(nativeBg(after, f.second)).toContain('<a:srgbClr val=')
    expect(nativeBg(after, f.second)).toContain('<a:alpha val="32000"/>')
    await verifyUntouched(before, result.bytes, [f.first, f.second])
  })
  it('expands inherited theme bgRef with placeholder color transforms without changing theme or flattening path', async () => {
    const f = await fixture(),
      chain = f.archive.resolveSlideChain(f.first)
    f.zip.file(f.first, (await f.zip.file(f.first)!.async('string')).replace(bgPattern, ''))
    f.zip.file(
      chain.layoutPath!,
      putBg(
        await f.zip.file(chain.layoutPath!)!.async('string'),
        '<p:bg><p:bgRef idx="1001"><a:schemeClr val="accent3"><a:alpha val="60000"/></a:schemeClr></p:bgRef></p:bg>',
      ),
    )
    const template =
      '<a:gradFill><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="25000"/></a:schemeClr></a:gs><a:gs pos="45000"><a:srgbClr val="224466"/></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"/></a:gs></a:gsLst><a:path path="shape"><a:fillToRect l="10000" t="20000" r="30000" b="40000"/></a:path></a:gradFill>'
    f.zip.file(
      chain.themePath!,
      (await f.zip.file(chain.themePath!)!.async('string')).replace(
        /<a:bgFillStyleLst>[\s\S]*?<\/a:bgFillStyleLst>/,
        `<a:bgFillStyleLst>${template}</a:bgFillStyleLst>`,
      ),
    )
    const before = await bytesOf(f.zip),
      expected = (await openPptxForEdit(before)).slides()[0]!.background
    const result = await apply(before),
      archive = await PptxArchive.open(result.bytes)
    const current = nativeBg(archive, f.second)!
    expect(current).not.toContain('phClr')
    expect(current).not.toContain('bgRef')
    expect(current).toContain('<a:alpha val="60000"/><a:tint val="25000"/>')
    expect(current).toContain('<a:path path="shape">')
    // Vendor's bgRef model drops placeholder alpha; native materialization must keep it.
    expect(expected?.type).toBe('gradient')
    const nativeExpected =
      expected?.type === 'gradient'
        ? {
            ...expected,
            stops: expected.stops.map((stop, index) =>
              index === 1 ? stop : { ...stop, color: `${stop.color}99` },
            ),
          }
        : expected
    expect((await openPptxForEdit(result.bytes)).slides().map((s) => s.background)).toEqual([
      nativeExpected,
      nativeExpected,
    ])
    await verifyUntouched(before, result.bytes, [f.first, f.second])
  })
  it('copies image crop/alpha/tile offsets and rels from the owning master, reusing native media bytes', async () => {
    const f = await fixture(),
      chain = f.archive.resolveSlideChain(f.first)
    f.zip.file(f.first, (await f.zip.file(f.first)!.async('string')).replace(bgPattern, ''))
    f.zip.file(
      chain.layoutPath!,
      (await f.zip.file(chain.layoutPath!)!.async('string')).replace(bgPattern, ''),
    )
    const image =
      '<p:bg><p:bgPr><a:blipFill dpi="144" rotWithShape="0"><a:blip r:embed="rIdBg"><a:alphaModFix amt="42000"/></a:blip><a:srcRect l="1000" t="2000" r="3000" b="4000"/><a:tile tx="111" ty="222" sx="50000" sy="75000" flip="xy" algn="ctr"/></a:blipFill><a:effectLst/></p:bgPr></p:bg>'
    const media = 'ppt/media/native-bg.png',
      data = new Uint8Array(
        readFileSync(
          new URL(
            '../../vendor/apps/slides/src/renderer/assets/textures/paper.png',
            import.meta.url,
          ),
        ),
      )
    f.zip.file(media, data)
    const types = await f.zip.file('[Content_Types].xml')!.async('string')
    f.zip.file(
      '[Content_Types].xml',
      types.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>'),
    )
    f.zip.file(
      chain.masterPath!,
      putBg(await f.zip.file(chain.masterPath!)!.async('string'), image),
    )
    const masterRels = relsPathFor(chain.masterPath!)
    f.zip.file(
      masterRels,
      (await f.zip.file(masterRels)!.async('string')).replace(
        '</Relationships>',
        '<Relationship Id="rIdBg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/native-bg.png"/></Relationships>',
      ),
    )
    const before = await bytesOf(f.zip),
      result = await apply(before),
      archive = await PptxArchive.open(result.bytes)
    for (const path of [f.first, f.second]) {
      const bg = nativeBg(archive, path)!,
        rid = /r:embed="([^"]+)"/.exec(bg)![1]!
      const rel = archive.readRels(path).get(rid)!
      expect(resolveTarget(path, rel.target)).toBe(media)
      expect(bg).toContain('<a:srcRect l="1000" t="2000" r="3000" b="4000"/>')
      expect(bg).toContain('<a:alphaModFix amt="42000"/>')
      expect(bg).toContain('flip="xy" algn="ctr"')
    }
    expect(archive.readBytes(media)).toEqual(data)
    await verifyUntouched(before, result.bytes, [
      f.first,
      f.second,
      relsPathFor(f.first),
      relsPathFor(f.second),
    ])
  })
  it('runs as one live version/history action and restores exact source bytes on undo; rejects stale/aborted writes and caller XML', async () => {
    const f = await fixture()
    f.zip.file(f.first, putBg(await f.zip.file(f.first)!.async('string'), complex))
    const before = await bytesOf(f.zip),
      session = await openPptxForEdit(before)
    const handle = createPptxAgentHandle(
      session,
      'complex-bg',
      () => ({ slideIndex: 0, elementId: null }),
      () => {},
      applyPptxOpsOnHost,
    )
    const args = { kind: 'copy-current-background', slide: 0, allSlides: true }
    expect(
      await handle.execute('manual_fill', args, { expectedVersion: 0, roundId: 'copy' }),
    ).toMatchObject({ ok: true, changed: true, version: 1 })
    const copied = await session.save()
    expect(bgPr(nativeBg(await PptxArchive.open(copied), f.second)!)).toEqual(bgPr(complex))
    expect(await handle.execute('manual_fill', args, { expectedVersion: 0 })).toMatchObject({
      ok: false,
    })
    expect(handle.undoRound('copy')).toBe(true)
    const undo = await session.save()
    session.commit()
    await verifyUntouched(before, undo, [])
    expect(
      await handle.execute('manual_fill', args, {
        expectedVersion: session.version(),
        roundId: 'redo',
      }),
    ).toMatchObject({ ok: true, changed: true })
    const redo = await session.save()
    session.commit()
    await verifyUntouched(copied, redo, [])
    handle.dispose()
    expect(pptxManualFillSchema.safeParse({ ...args, xml: complex }).success).toBe(false)
    await expect(apply(before, 0, 0, AbortSignal.abort())).rejects.toThrow('已取消')
    await expect(apply(before, 0, 99)).rejects.toThrow('页面已失效')
  })
  it('refuses invalid source image relations atomically and does not accept client relationships or media paths', async () => {
    const f = await fixture()
    const invalid =
      '<p:bg><p:bgPr><a:blipFill><a:blip r:embed="missing"/><a:stretch><a:fillRect/></a:stretch></a:blipFill></p:bgPr></p:bg>'
    f.zip.file(f.first, putBg(await f.zip.file(f.first)!.async('string'), invalid))
    const before = await bytesOf(f.zip),
      unchanged = before.slice()
    await expect(apply(before)).rejects.toThrow('背景图片关系无效')
    expect(before).toEqual(unchanged)
    expect(
      pptxManualFillSchema.safeParse({
        kind: 'copy-current-background',
        slide: 0,
        allSlides: true,
        mediaPath: '/etc/passwd',
      }).success,
    ).toBe(false)
    expect(
      pptxManualFillSchema.safeParse({
        kind: 'copy-current-background',
        slide: 0,
        allSlides: true,
        relationships: [],
      }).success,
    ).toBe(false)
  })
})
