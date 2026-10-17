import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { afterEach, expect, it, vi } from 'vitest'
import {
  openPptx,
  savePptx,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import { resolveTarget } from '../../../../packages/office/vendor/packages/pptx-engine/src/zip.js'
import { runTxn } from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/index.js'
const source = vi.hoisted(() => ({ exists: true }))
vi.mock('../services/documents.js', () => ({
  getDocument: async (id: string) =>
    id !== 'pptx-source' || source.exists
      ? {
          id,
          kind: 'file',
          mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          fileExtension: 'pptx',
        }
      : null,
}))
import { applyPptxOpsOnHost, applyPptxManualUploadOnHost } from '../services/pptx-agent-host.js'
afterEach(() => {
  source.exists = true
})
const load = () =>
  new Uint8Array(
    readFileSync(
      new URL('../../../../packages/office/tests/fixtures/image-deck.pptx', import.meta.url),
    ),
  )
const apply = (
  bytes: Uint8Array,
  input: unknown,
  version = 0,
  signal?: AbortSignal,
  documentId = 'pptx-slides',
) =>
  applyPptxOpsOnHost({
    documentId,
    bytes,
    expectedVersion: version,
    action: 'manual_asset',
    ops: [input],
    signal,
  })
const ref = (result: Awaited<ReturnType<typeof apply>>) => (result.data as { ref: string }).ref
async function fixture() {
  const opened = await openPptx(load())
  for (const op of [
    { op: 'duplicateSlide' as const, target: { slide: 0 } },
    { op: 'duplicateSlide' as const, target: { slide: 1 } },
    { op: 'setNotes' as const, target: { slide: 0 }, text: '第一张备注 · 保留原件' },
    { op: 'setNotes' as const, target: { slide: 1 }, text: '第二张备注' },
  ]) {
    const result = runTxn(opened, { isolation: 'atomic', ops: [op] })
    expect(result).toMatchObject({ applied: true })
  }
  const zip = await JSZip.loadAsync(await savePptx(opened))
  for (const index of [0, 1]) {
    const slide = opened.deck.slides[index]!,
      target = opened.deck.slides[1 - index]!
    const path = slide.path.replace('/slides/', '/slides/_rels/') + '.rels'
    zip.file(
      path,
      (await zip.file(path)!.async('string')).replace(
        '</Relationships>',
        `<Relationship Id="rIdBatchJump" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="${target.path.split('/').at(-1)}"/></Relationships>`,
      ),
    )
    const xml = await zip.file(slide.path)!.async('string')
    zip.file(
      slide.path,
      xml.replace(
        /<p:cNvPr\b([^>]*?)\/>/,
        '<p:cNvPr$1><a:hlinkClick r:id="rIdBatchJump" action="ppaction://hlinksldjump"/></p:cNvPr>',
      ),
    )
  }
  return zip.generateAsync({ type: 'uint8array' })
}
async function notes(opened: Awaited<ReturnType<typeof openPptx>>, index: number) {
  const slide = opened.deck.slides[index]!
  const rel = [...opened.archive.readRels(slide.path).values()].find((item) =>
    item.type.endsWith('/notesSlide'),
  )!
  expect(rel).toBeDefined()
  const notesPath = resolveTarget(slide.path, rel.target)
  const back = [...opened.archive.readRels(notesPath).values()].find((item) =>
    item.type.endsWith('/slide'),
  )!
  expect(resolveTarget(notesPath, back.target)).toBe(slide.path)
  return opened.archive.readText(notesPath)!
}

it('copies ordered slides with media, notes and remapped batch hyperlinks across documents through two saves', async () => {
  const bytes = await fixture(),
    copy = await apply(bytes, { kind: 'copy_slides', slides: [1, 0] })
  expect(copy).toMatchObject({ changed: false, version: 0, data: { kind: 'slides', count: 2 } })
  expect(copy.bytes).toBe(bytes)
  const pasted = await apply(load(), {
    kind: 'paste_slides',
    afterIndex: 0,
    ref: ref(copy),
    keepSourceFormatting: true,
  })
  expect(pasted).toMatchObject({
    changed: true,
    version: 1,
    data: { slideIndices: [1, 2], count: 2 },
  })
  const model = await openPptx(
    await savePptx(await openPptx(await savePptx(await openPptx(pasted.bytes)))),
  )
  expect(model.deck.slides).toHaveLength(3)
  expect(await notes(model, 1)).toContain('第一张备注')
  expect(await notes(model, 2)).toContain('第二张备注')
  for (const index of [1, 2]) {
    const slide = model.deck.slides[index]!
    const link = model.archive.readRels(slide.path).get('rIdBatchJump')!
    expect(resolveTarget(slide.path, link.target)).toBe(
      model.deck.slides[index === 1 ? 2 : 1]!.path,
    )
    expect(slide.originalXml).toContain('rIdBatchJump')
    const picture = slide.elements.find((element) => element.type === 'picture')!
    expect(picture.type === 'picture' && model.archive.readBytes(picture.mediaRef!)).toEqual(
      (await openPptx(bytes)).archive.readBytes('ppt/media/image1.png'),
    )
    const chain = model.archive.resolveSlideChain(slide.path)
    expect(chain.layoutPath && chain.masterPath && chain.themePath).toBeTruthy()
  }
  const original = await JSZip.loadAsync(load()),
    final = await JSZip.loadAsync(pasted.bytes)
  for (const entryPath of Object.keys(original.files).filter(
    (path) => /ppt\/(theme|slideMaster|slideLayout)/.test(path) && !original.files[path]!.dir,
  ))
    expect(await final.file(entryPath)!.async('uint8array')).toEqual(
      await original.file(entryPath)!.async('uint8array'),
    )
})

it('cuts the entire prepared batch once, retains shared media and accepts repeat paste', async () => {
  const bytes = await fixture()
  const cut = await apply(bytes, { kind: 'cut_slides', slides: [0, 1] }, 7)
  expect(cut).toMatchObject({ changed: true, version: 8, data: { count: 2 } })
  const retained = await openPptx(cut.bytes)
  expect(retained.deck.slides).toHaveLength(1)
  expect(retained.archive.has('ppt/media/image1.png')).toBe(true)
  const pasted = await apply(cut.bytes, { kind: 'paste_slides', afterIndex: 0, ref: ref(cut) }, 8)
  expect(pasted.version).toBe(9)
  expect(await notes(await openPptx(pasted.bytes), 1)).toContain('第一张备注')
  const repeated = await apply(
    pasted.bytes,
    { kind: 'paste_slides', afterIndex: 2, ref: ref(cut) },
    9,
  )
  const model = await openPptx(repeated.bytes)
  expect(model.deck.slides).toHaveLength(5)
  expect(await notes(model, 3)).toContain('第一张备注')
  expect(await notes(model, 1)).toContain('第一张备注')
})

it('rejects invalid batches, links outside selection, incoming cut links, last-page cuts and cancellation atomically', async () => {
  const bytes = await fixture()
  for (const input of [
    { kind: 'copy_slides', slides: [0, 0] },
    { kind: 'copy_slides', slides: [0, 99] },
    { kind: 'copy_slides', slides: [0] },
    { kind: 'cut_slides', slides: [0] },
    { kind: 'cut_slides', slides: [0, 1, 2] },
  ])
    await expect(apply(bytes, input)).rejects.toThrow(/.+/)
  await expect(
    apply(bytes, { kind: 'copy_slides', slides: [0, 1] }, 0, AbortSignal.abort()),
  ).rejects.toThrow(/取消/)
  expect((await openPptx(bytes)).deck.slides).toHaveLength(3)
  const copied = await apply(
    bytes,
    { kind: 'copy_slides', slides: [0, 1] },
    0,
    undefined,
    'pptx-source',
  )
  source.exists = false
  await expect(
    apply(load(), { kind: 'paste_slides', afterIndex: 0, ref: ref(copied) }),
  ).rejects.toThrow(/不可用/)
  source.exists = true
})

it('rejects comments and presentation membership rather than dropping associated structure', async () => {
  const bytes = await fixture(),
    zip = await JSZip.loadAsync(bytes)
  const path = 'ppt/slides/_rels/slide1.xml.rels'
  zip.file(
    path,
    (await zip.file(path)!.async('string')).replace(
      '</Relationships>',
      '<Relationship Id="rIdComment" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments/comment1.xml"/></Relationships>',
    ),
  )
  zip.file('ppt/comments/comment1.xml', '<p:cmLst/>')
  await expect(
    apply(await zip.generateAsync({ type: 'uint8array' }), { kind: 'copy_slides', slides: [0, 1] }),
  ).rejects.toThrow(/批注/)
  const another = await JSZip.loadAsync(bytes)
  another.file(
    'ppt/presentation.xml',
    (await another.file('ppt/presentation.xml')!.async('string')).replace(
      '</p:presentation>',
      '<p:custShowLst/></p:presentation>',
    ),
  )
  await expect(
    apply(await another.generateAsync({ type: 'uint8array' }), {
      kind: 'copy_slides',
      slides: [0, 1],
    }),
  ).rejects.toThrow(/自定义放映/)
})

it('inserts actual PNG bytes at the normalized drop point with aspect fit and a durable new picture ref', async () => {
  const bytes = load(),
    sourceModel = await openPptx(bytes),
    image = sourceModel.archive.readBytes('ppt/media/image1.png')!
  const result = await applyPptxManualUploadOnHost({
    documentId: 'pptx-image',
    bytes,
    expectedVersion: 3,
    input: {
      kind: 'picture',
      slide: 0,
      widthPt: 72,
      keepCrop: false,
      naturalSize: true,
      center: { x: 0.25, y: 0.75 },
    },
    assetBytes: image,
    assetName: 'clipboard.png',
    assetMime: 'image/png',
  })
  expect(result.version).toBe(4)
  expect(result.data).toMatchObject({ slideIndex: 0, elementId: expect.any(String) })
  const model = await openPptx(result.bytes),
    picture = model.deck.slides[0]!.elements.at(-1)!
  expect(picture.type).toBe('picture')
  const box = picture.transform.offset
  expect((box.x + box.cx / 2) / model.deck.size.cx).toBeCloseTo(0.25, 3)
  expect((box.y + box.cy / 2) / model.deck.size.cy).toBeCloseTo(0.75, 3)
})

async function withNotesMaster(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes),
    model = await openPptx(bytes)
  const master = 'ppt/notesMasters/notesMaster1.xml'
  zip.file(
    master,
    '<p:notesMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Source notes"><p:cSld><p:spTree/></p:cSld></p:notesMaster>',
  )
  zip.file(
    'ppt/notesMasters/_rels/notesMaster1.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>',
  )
  for (const slide of model.deck.slides.slice(0, 2)) {
    const rel = [...model.archive.readRels(slide.path).values()].find((item) =>
      item.type.endsWith('/notesSlide'),
    )!
    const path =
      resolveTarget(slide.path, rel.target).replace('/notesSlides/', '/notesSlides/_rels/') +
      '.rels'
    zip.file(
      path,
      (await zip.file(path)!.async('string')).replace(
        '</Relationships>',
        '<Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/></Relationships>',
      ),
    )
  }
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    (await zip.file('ppt/_rels/presentation.xml.rels')!.async('string')).replace(
      '</Relationships>',
      '<Relationship Id="rIdNotesMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="notesMasters/notesMaster1.xml"/></Relationships>',
    ),
  )
  zip.file(
    'ppt/presentation.xml',
    (await zip.file('ppt/presentation.xml')!.async('string')).replace(
      '<p:sldIdLst>',
      '<p:notesMasterIdLst><p:notesMasterId r:id="rIdNotesMaster"/></p:notesMasterIdLst><p:sldIdLst>',
    ),
  )
  zip.file(
    '[Content_Types].xml',
    (await zip.file('[Content_Types].xml')!.async('string')).replace(
      '</Types>',
      '<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/></Types>',
    ),
  )
  return zip.generateAsync({ type: 'uint8array' })
}

it('imports one shared native notes master/theme graph, remaps its names and supports repeated paste without sharing note back-links', async () => {
  const bytes = await withNotesMaster(await fixture()),
    copy = await apply(bytes, { kind: 'copy_slides', slides: [0, 1] })
  const target = await JSZip.loadAsync(load())
  target.file(
    'ppt/theme/theme1.xml',
    (await target.file('ppt/theme/theme1.xml')!.async('string')).replace('name="', 'name="Target '),
  )
  const paste = await apply(await target.generateAsync({ type: 'uint8array' }), {
    kind: 'paste_slides',
    afterIndex: 0,
    ref: ref(copy),
    keepSourceFormatting: true,
  })
  const again = await apply(
    paste.bytes,
    { kind: 'paste_slides', afterIndex: 2, ref: ref(copy), keepSourceFormatting: true },
    1,
  )
  const model = await openPptx(await savePptx(await openPptx(again.bytes)))
  const master = [...model.archive.readRels('ppt/presentation.xml').values()].filter((rel) =>
    rel.type.endsWith('/notesMaster'),
  )
  expect(master).toHaveLength(1)
  const masterPath = resolveTarget('ppt/presentation.xml', master[0]!.target)
  const masterTheme = [...model.archive.readRels(masterPath).values()].find((rel) =>
    rel.type.endsWith('/theme'),
  )!
  expect(model.archive.readBytes(resolveTarget(masterPath, masterTheme.target))).toEqual(
    (await openPptx(bytes)).archive.readBytes('ppt/theme/theme1.xml'),
  )
  const notePaths = []
  for (let index = 1; index <= 4; index++) {
    expect(await notes(model, index)).toContain(index % 2 ? '第一张备注' : '第二张备注')
    const slide = model.deck.slides[index]!,
      rel = [...model.archive.readRels(slide.path).values()].find((item) =>
        item.type.endsWith('/notesSlide'),
      )!
    const path = resolveTarget(slide.path, rel.target)
    notePaths.push(path)
    const relMaster = [...model.archive.readRels(path).values()].find((item) =>
      item.type.endsWith('/notesMaster'),
    )!
    expect(resolveTarget(path, relMaster.target)).toBe(masterPath)
  }
  expect(new Set(notePaths).size).toBe(4)
  const conflicting = await JSZip.loadAsync(paste.bytes)
  conflicting.file(
    masterPath,
    model.archive.readText(masterPath)!.replace('Source notes', 'Different notes'),
  )
  await expect(
    apply(await conflicting.generateAsync({ type: 'uint8array' }), {
      kind: 'paste_slides',
      afterIndex: 0,
      ref: ref(copy),
    }),
  ).rejects.toThrow(/备注母版/)
})
