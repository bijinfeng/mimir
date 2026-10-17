import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { PNG } from 'pngjs'
import { beforeAll, expect, it, vi } from 'vitest'
import { pptxManualPictureSchema, pptxManualUploadSchema } from '@mimir/shared'
import {
  openPptx,
  savePptx,
  elementDurableId,
  groupChildDurableId,
  groupChildSlices,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import { runTxn } from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/index.js'
import { openPptxForEdit } from '../../../../packages/office/src/pptx.js'
import { PptxHistory } from '../../../../packages/office/src/pptx-history.js'
import { createPptxAgentHandle } from '../../../../packages/office/src/agent/pptx-agent.js'
import { pptxGroupPictureFixture } from '../../../../packages/office/src/editors/pptx-group-picture-test-fixture.js'
import {
  resolvePptxGroupPicture,
  editPptxGroupPicture,
  replacePptxGroupPicture,
} from '../../../../packages/office/src/pptx-picture-edit.js'

vi.mock('../services/documents.js', () => ({
  getDocument: async (id: string) =>
    id === 'pptx-1'
      ? {
          id,
          kind: 'file',
          mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          fileExtension: 'pptx',
        }
      : null,
}))
import { applyPptxOpsOnHost, applyPptxManualUploadOnHost } from '../services/pptx-agent-host.js'

let bytes: Uint8Array,
  image: Uint8Array,
  target: { slide: number; group: string; elementId: string }
const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(new URL(`../../../../packages/office/tests/fixtures/${name}`, import.meta.url)),
  )
async function entries(source: Uint8Array) {
  const zip = await JSZip.loadAsync(source)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((f) => !f.dir)
        .map(async (f) => [f.name, await f.async('uint8array')]),
    ),
  )
}
const unrelated = (xml: string) => xml.replace(/<p:blipFill\b[\s\S]*?<\/p:blipFill>/, '')
beforeAll(async () => {
  const images = await JSZip.loadAsync(fixture('image-deck.pptx'))
  image = await images.file('ppt/media/image1.png')!.async('uint8array')
  const opened = await openPptx(fixture('title-layout.pptx'))
  const added = runTxn(opened, {
    ops: [
      {
        op: 'addElement',
        target: { slide: 0 },
        kind: 'rect',
        offset: { x: 300000, y: 400000, cx: 1400000, cy: 900000 },
      },
      ...[0, 1].map((i) => ({
        op: 'addPicture',
        target: { slide: 0 },
        bytes: image,
        ext: 'png',
        offset: { x: 2000000 + i * 1700000, y: 600000, cx: 1200000, cy: 800000 },
      })),
    ],
  })
  if (!added.applied) throw new Error('Failed to add native fixture objects')
  const refs = opened.deck.slides[0]!.elements.slice(-3).map((e) => elementDurableId(e)!)
  const grouped = runTxn(opened, {
    ops: [{ op: 'groupElements', target: { slide: 0 }, els: refs.slice(0, 2) }],
  })
  if (!grouped.applied) throw new Error('Failed to group native fixture objects')
  const group = opened.deck.slides[0]!.elements.find((e) => e.type === 'group')!
  if (group.type !== 'group') throw new Error('Missing fixture group')
  const child = group.children.find((e) => e.type === 'picture')!
  target = {
    slide: 0,
    group: elementDurableId(group)!,
    elementId: groupChildDurableId(group, child)!,
  }
  const slice = groupChildSlices(group.anchor.originalXml).find((s) => s.nvId === child.nvId)!
  const pictureXml = slice.xml
    .replace(/<a:blip\b([^>]*?)\/>/, '<a:blip$1><a:alphaModFix amt="37000"/></a:blip>')
    .replace('</p:blipFill>', '<a:srcRect l="10000" t="5000" r="15000" b="20000"/></p:blipFill>')
    .replace(
      '</p:spPr>',
      '<a:ln w="25400"><a:solidFill><a:srgbClr val="987654"/></a:solidFill><a:prstDash val="dash"/></a:ln><a:effectLst><a:outerShdw blurRad="25000" dist="10000" dir="5400000"><a:srgbClr val="000000"><a:alpha val="40000"/></a:srgbClr></a:outerShdw></a:effectLst></p:spPr>',
    )
  const parentXfrm =
    '<a:xfrm rot="2700000" flipH="1"><a:off x="1200000" y="700000"/><a:ext cx="6000000" cy="3000000"/><a:chOff x="200000" y="100000"/><a:chExt cx="4000000" cy="1500000"/></a:xfrm>'
  const groupXml = group.anchor.originalXml
    .replace(slice.xml, pictureXml)
    .replace(/(<p:grpSpPr>)\s*<a:xfrm[\s\S]*?<\/a:xfrm>/, `$1${parentXfrm}`)
  const zip = await JSZip.loadAsync(await savePptx(opened))
  const path = opened.deck.slides[0]!.path
  zip.file(
    path,
    (await zip.file(path)!.async('string')).replace(group.anchor.originalXml, groupXml),
  )
  bytes = await zip.generateAsync({ type: 'uint8array' })
})
const host = (ops: unknown[], source = bytes, signal?: AbortSignal) =>
  applyPptxOpsOnHost({
    documentId: 'pptx-1',
    bytes: source,
    expectedVersion: 4,
    action: 'manual_picture',
    ops,
    signal,
  })
const upload = (source: Uint8Array, keepCrop: boolean, assetBytes = image) =>
  applyPptxManualUploadOnHost({
    documentId: 'pptx-1',
    bytes: source,
    expectedVersion: 4,
    input: { kind: 'picture', ...target, widthPt: 72, keepCrop },
    assetBytes,
    assetName: 'picture.png',
    assetMime: 'image/png',
  })

it('reads real opacity/crop and atomically patches only the unique picture slice, twice saved', async () => {
  const before = resolvePptxGroupPicture((await openPptx(bytes)).deck.slides[0]!, target)
  expect(before.picture.opacity).toBe(0.37)
  expect(before.picture.srcRect).toEqual({ l: 0.1, t: 0.05, r: 0.15, b: 0.2 })
  const crop = { l: 0.2, t: 0.1, r: 0.1, b: 0.15 }
  const response = await host([{ ...target, opacity: 0.62, srcRect: crop }])
  expect(response).toMatchObject({ changed: true, version: 5 })
  expect(response.records).toEqual([
    {
      op: { op: 'manual_picture', ...target, opacity: 0.62, srcRect: crop },
      after: { pictures: 1 },
    },
  ])
  const opened = await openPptx(response.bytes)
  const after = resolvePptxGroupPicture(opened.deck.slides[0]!, target)
  expect(after.picture.opacity).toBe(0.62)
  expect(after.picture.srcRect).toEqual(crop)
  expect(after.parent.transform).toEqual(before.parent.transform)
  expect(after.parent.childOffset).toEqual(before.parent.childOffset)
  expect(after.picture.transform).toEqual(before.picture.transform)
  expect(
    groupChildSlices(after.parent.anchor.originalXml).filter((s) => s.nvId !== after.picture.nvId),
  ).toEqual(
    groupChildSlices(before.parent.anchor.originalXml).filter(
      (s) => s.nvId !== before.picture.nvId,
    ),
  )
  const original = await entries(bytes),
    changed = await entries(response.bytes)
  for (const [name, value] of Object.entries(original).filter(
    ([path]) => path !== opened.deck.slides[0]!.path,
  ))
    expect(changed[name]).toEqual(value)
  expect(await entries(await savePptx(opened))).toEqual(changed)
  expect((await host([{ ...target, opacity: 0.62, srcRect: crop }], response.bytes)).changed).toBe(
    false,
  )
})

it('replacement resets crop; same-size cutout retains it and shared original media', async () => {
  const kept = await upload(bytes, true)
  const keptOpen = await openPptx(kept.bytes)
  const selected = resolvePptxGroupPicture(keptOpen.deck.slides[0]!, target)
  expect(selected.picture.srcRect).toEqual({ l: 0.1, t: 0.05, r: 0.15, b: 0.2 })
  expect(selected.picture.opacity).toBe(0.37)
  expect(kept.data).toMatchObject({ elementId: target.elementId })
  const reset = await upload(kept.bytes, false)
  const resetOpen = await openPptx(reset.bytes)
  const changed = resolvePptxGroupPicture(resetOpen.deck.slides[0]!, target)
  expect(changed.picture.srcRect).toBeUndefined()
  expect(changed.picture.transform).toEqual(selected.picture.transform)
  expect(unrelated(changed.xml)).toBe(unrelated(selected.xml))
  const sibling = resetOpen.deck.slides[0]!.elements.find((e) => e.type === 'picture')!
  if (sibling.type !== 'picture') throw new Error('Missing shared sibling')
  expect(resetOpen.archive.readBytes(sibling.mediaRef)).toEqual(image)
  expect(await entries(await savePptx(resetOpen))).toEqual(await entries(reset.bytes))
  const again = await upload(reset.bytes, false)
  expect(
    Object.keys(await entries(again.bytes)).filter((name) => name.startsWith('ppt/media/')),
  ).toHaveLength(
    Object.keys(await entries(reset.bytes)).filter((name) => name.startsWith('ppt/media/')).length,
  )
})

it('restores full opacity without removing the existing crop or other native effects', async () => {
  const before = resolvePptxGroupPicture((await openPptx(bytes)).deck.slides[0]!, target)
  const response = await host([{ ...target, opacity: 1 }])
  const after = resolvePptxGroupPicture((await openPptx(response.bytes)).deck.slides[0]!, target)
  expect(after.picture.opacity).toBeUndefined()
  expect(after.picture.srcRect).toEqual(before.picture.srcRect)
  expect(after.xml).not.toContain('alphaModFix')
  expect(unrelated(after.xml)).toBe(unrelated(before.xml))
})

it('preserves the original media when only another page still references it after replacement', async () => {
  const deckFixture = await pptxGroupPictureFixture()
  const opened = await openPptx(deckFixture.bytes)
  const slide = opened.deck.slides[0]!
  const sibling = slide.elements.find((element) => element.type === 'picture')!
  const selected = resolvePptxGroupPicture(slide, deckFixture.target)
  const originalMedia = selected.picture.mediaRef
  const zip = await JSZip.loadAsync(deckFixture.bytes)
  // Leave the target as this page's only user of the original media. The second
  // page must independently keep it alive during complete-slide cleanup.
  zip.file(
    slide.path,
    (await zip.file(slide.path)!.async('string')).replace(sibling.anchor.originalXml, ''),
  )
  const source = await zip.generateAsync({ type: 'uint8array' })
  const before = await entries(source)
  const replacement = PNG.sync.read(Buffer.from(deckFixture.image))
  replacement.data[0] = replacement.data[0]! ^ 255
  const replacementBytes = new Uint8Array(PNG.sync.write(replacement))
  const response = await applyPptxManualUploadOnHost({
    documentId: 'pptx-1',
    bytes: source,
    expectedVersion: 4,
    input: { kind: 'picture', ...deckFixture.target, widthPt: 72, keepCrop: false },
    assetBytes: replacementBytes,
    assetName: 'replacement.png',
    assetMime: 'image/png',
  })
  const after = await entries(response.bytes)
  const reopened = await openPptx(response.bytes)
  const second = reopened.deck.slides[1]!
  expect(reopened.archive.readBytes(originalMedia)).toEqual(deckFixture.image)
  const newPicture = resolvePptxGroupPicture(reopened.deck.slides[0]!, deckFixture.target).picture
  expect(reopened.archive.readBytes(newPicture.mediaRef)).toEqual(replacementBytes)
  expect(after[second.path]).toEqual(before[second.path])
  const secondRels = second.path.replace('/slides/', '/slides/_rels/') + '.rels'
  expect(after[secondRels]).toEqual(before[secondRels])
  expect(newPicture.mediaRef).not.toBe(originalMedia)
  const allowed = new Set([
    slide.path,
    slide.path.replace('/slides/', '/slides/_rels/') + '.rels',
    '[Content_Types].xml',
  ])
  for (const [path, value] of Object.entries(before).filter(
    ([entryPath]) => !allowed.has(entryPath),
  ))
    expect(after[path]).toEqual(value)
  expect(await entries(await savePptx(reopened))).toEqual(after)
})

it('drops stale SVG/link resources only inside the target blip and preserves unrelated extensions', async () => {
  const zip = await JSZip.loadAsync(bytes)
  const slide = (await openPptx(bytes)).deck.slides[0]!
  const selected = resolvePptxGroupPicture(slide, target)
  const svg =
    '<a:extLst><a:ext uri="svg"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rIdSvg"/></a:ext></a:extLst>'
  const patched = selected.xml
    .replace(/<a:blip\b/, '<a:blip r:link="rIdLinked"')
    .replace('</a:blip>', `${svg}</a:blip>`)
    .replace('</p:spPr>', '<a:extLst></a:extLst></p:spPr>')
  zip.file(slide.path, (await zip.file(slide.path)!.async('string')).replace(selected.xml, patched))
  const relPath = slide.path.replace('/slides/', '/slides/_rels/') + '.rels'
  zip.file(
    relPath,
    (await zip.file(relPath)!.async('string')).replace(
      '</Relationships>',
      '<Relationship Id="rIdLinked" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.com/image.png" TargetMode="External"/><Relationship Id="rIdSvg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/stale.svg"/></Relationships>',
    ),
  )
  zip.file('ppt/media/stale.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>')
  const response = await upload(await zip.generateAsync({ type: 'uint8array' }), false)
  const reopened = await openPptx(response.bytes)
  const after = resolvePptxGroupPicture(reopened.deck.slides[0]!, target)
  expect(after.xml).not.toContain('svgBlip')
  expect(after.xml).not.toContain('r:link')
  expect(after.xml).toContain('<a:extLst></a:extLst></p:spPr>')
  expect(reopened.archive.readBytes('ppt/media/stale.svg')).toBeNull()
  const output = await JSZip.loadAsync(response.bytes)
  expect(await output.file(relPath)!.async('string')).not.toMatch(/rIdSvg|rIdLinked/)
})

it('validates crop/patch/upload contracts and rejects invalid requests without mutation', async () => {
  for (const patch of [
    {},
    { opacity: NaN },
    { opacity: 1.1 },
    { srcRect: { l: 0.6, r: 0.4, t: 0, b: 0 } },
    { srcRect: { l: -0.1, r: 0, t: 0, b: 0 } },
    { extra: 1, opacity: 0.4 },
  ])
    expect(pptxManualPictureSchema.safeParse({ ...target, ...patch }).success).toBe(false)
  expect(
    pptxManualUploadSchema.safeParse({
      kind: 'picture',
      slide: 0,
      group: target.group,
      widthPt: 72,
    }).success,
  ).toBe(false)
  const baseline = bytes.slice()
  await expect(host([])).rejects.toThrow(/Invalid input/)
  await expect(
    host([
      { ...target, opacity: 0.5 },
      { ...target, opacity: 0.2 },
    ]),
  ).rejects.toThrow(/Invalid input/)
  await expect(host([{ ...target, group: 'missing', opacity: 0.5 }])).rejects.toThrow('父组合')
  await expect(host([{ ...target, elementId: 'missing', opacity: 0.5 }])).rejects.toThrow(
    '普通图片',
  )
  await expect(host([{ ...target, opacity: 0.5 }], bytes, AbortSignal.abort())).rejects.toThrow(
    '取消',
  )
  const different = image.slice()
  new DataView(different.buffer).setUint32(16, 17)
  await expect(upload(bytes, true, different)).rejects.toThrow('尺寸相同')
  expect(bytes).toEqual(baseline)
})

it('publishes one manual round, restores exact native entries with undo/redo', async () => {
  const session = await openPptxForEdit(bytes)
  const history = new PptxHistory(session)
  const handle = createPptxAgentHandle(
    session,
    'pptx-1',
    () => ({ slideIndex: 0, elementId: target.elementId }),
    () => {},
    applyPptxOpsOnHost,
  )
  expect(
    await handle.execute(
      'manual_picture',
      { ...target, opacity: 0.53, srcRect: null },
      { expectedVersion: session.version(), roundId: 'picture' },
    ),
  ).toMatchObject({ ok: true, changed: true })
  history.record()
  const after = await session.save()
  expect(history.undo()).toBe(true)
  expect(await entries(await session.save())).toEqual(await entries(bytes))
  expect(history.redo()).toBe(true)
  expect(await entries(await session.save())).toEqual(await entries(after))
  expect(handle.undoRound('picture')).toBe(false)
  handle.dispose()
})

it.each(['cancel', 'edit', 'dispose'] as const)(
  'rejects a late manual picture result after %s',
  async (mode) => {
    const session = await openPptxForEdit(bytes)
    let release!: () => void
    let arrived!: () => void
    const ready = new Promise<void>((resolve) => {
      arrived = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const handle = createPptxAgentHandle(
      session,
      'pptx-1',
      () => ({ slideIndex: 0, elementId: target.elementId }),
      () => {},
      async (request) => {
        const reply = await applyPptxOpsOnHost(request)
        arrived()
        await gate
        return reply
      },
    )
    const controller = new AbortController()
    const pending = handle.execute(
      'manual_picture',
      { ...target, opacity: 0.11 },
      { expectedVersion: session.version(), signal: controller.signal, roundId: 'late' },
    )
    await ready
    if (mode === 'cancel') controller.abort()
    if (mode === 'dispose') handle.dispose()
    let edited = true
    if (mode === 'edit') {
      const text = session.slides()[0]!.elements.find((element) => element.type === 'text')!
      edited = session.setText(0, text.id, [{ runs: [{ text: 'Manual edit wins' }] }])
    }
    expect(edited).toBe(true)
    const version = session.version()
    const expected = await entries(await session.save())
    release()
    expect(await pending).toMatchObject({ ok: false })
    expect(session.version()).toBe(version)
    expect(await entries(await session.save())).toEqual(expected)
    expect(handle.undoRound('late')).toBe(false)
    handle.dispose()
  },
)

it.each([
  'duplicate-model',
  'duplicate-xml',
  'no-id',
  'media',
  'deep',
  'alternate',
  'no-blip',
  'unclosed-fill',
] as const)('rejects unsupported %s before publishing any bytes', async (mode) => {
  const opened = await openPptx(bytes)
  const slide = opened.deck.slides[0]!
  const resolved = resolvePptxGroupPicture(slide, target)
  if (mode === 'duplicate-model') resolved.parent.children.push(structuredClone(resolved.picture))
  if (mode === 'duplicate-xml')
    resolved.parent.anchor.originalXml = resolved.parent.anchor.originalXml.replace(
      resolved.xml,
      resolved.xml + resolved.xml,
    )
  if (mode === 'no-id') delete resolved.picture.nvId
  if (mode === 'media')
    resolved.picture.media = {
      kind: 'video',
      mediaRef: 'ppt/media/video.mp4',
    } as typeof resolved.picture.media
  if (mode === 'deep')
    resolved.parent.children = [{ ...resolved.parent, children: [resolved.picture] }]
  if (mode === 'alternate')
    resolved.parent.anchor.originalXml = `<mc:AlternateContent>${resolved.parent.anchor.originalXml}</mc:AlternateContent>`
  if (mode === 'no-blip')
    resolved.parent.anchor.originalXml = resolved.parent.anchor.originalXml.replace(
      resolved.xml,
      resolved.xml.replace(/<a:blip\b[\s\S]*?<\/a:blip>/, ''),
    )
  if (mode === 'unclosed-fill')
    resolved.parent.anchor.originalXml = resolved.parent.anchor.originalXml.replace(
      resolved.xml,
      resolved.xml.replace('</p:blipFill>', ''),
    )
  const originalXml = resolved.parent.anchor.originalXml
  const before = new Map(opened.archive.entries)
  expect(() => editPptxGroupPicture(slide, { ...target, opacity: 0.4, srcRect: null })).toThrow(
    /组合|图片/,
  )
  expect(() => replacePptxGroupPicture(opened, slide, target, image, 'png', false)).toThrow(
    /组合|图片/,
  )
  expect(opened.archive.entries).toEqual(before)
  expect(resolved.parent.anchor.originalXml).toBe(originalXml)
})
