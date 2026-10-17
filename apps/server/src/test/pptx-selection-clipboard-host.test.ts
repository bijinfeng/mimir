import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { expect, it, vi } from 'vitest'
import {
  openPptx,
  savePptx,
  elementDurableId,
  groupChildSlices,
  copyElementData,
  pasteElements,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import {
  elementCNvPrId,
  groupChildDurableId,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/identity.js'
import { runTxn } from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/index.js'
import {
  getSlideAnimations,
  setSlideAnimations,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/animation.js'
import { pptxInsertShapeOp } from '../../../../packages/office/src/editors/pptx-shape-presets.js'
import { preparePptxClipboardElements } from '../services/pptx-clipboard-elements.js'
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
import { applyPptxOpsOnHost } from '../services/pptx-agent-host.js'

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
  documentId = 'pptx-1',
) =>
  applyPptxOpsOnHost({
    documentId,
    bytes,
    expectedVersion: version,
    action: 'manual_asset',
    ops: [input],
    signal,
  })
async function fixture() {
  const opened = await openPptx(load())
  const slide = opened.deck.slides[0]!
  const picture = slide.elements.find((item) => item.type === 'picture')!
  expect(
    pasteElements(opened, 0, [copyElementData(opened, slide, picture)], { dx: 0, dy: 0 }),
  ).not.toBeNull()
  const currentSlide = opened.deck.slides[0]!
  for (let i = 0; i < 4; i++)
    expect(
      runTxn(opened, { isolation: 'atomic', ops: [pptxInsertShapeOp('rect', 0, 9144000, 5143500)] })
        .applied,
    ).toBe(true)
  const shapes = currentSlide.elements.slice(-4).map((item) => elementDurableId(item)!)
  for (const refs of [
    [elementDurableId(picture)!, shapes[0]!],
    [shapes[1]!, shapes[2]!],
  ])
    expect(
      runTxn(opened, {
        isolation: 'atomic',
        ops: [{ op: 'groupElements', target: { slide: 0 }, els: refs }],
      }).applied,
    ).toBe(true)
  const zip = await JSZip.loadAsync(await savePptx(opened))
  const xml = await zip.file(slide.path)!.async('string')
  zip.file(
    slide.path,
    xml
      .replace(/(<p:grpSpPr><a:xfrm)([^>]*>)/g, '$1 rot="1800000" flipH="1"$2')
      .replace(/<a:chExt cx="\d+" cy="\d+"\/>/g, '<a:chExt cx="7000000" cy="2000000"/>'),
  )
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  const model = await openPptx(bytes)
  return { bytes, model, slide: model.deck.slides[0]! }
}
const groupTransform = (xml: string) => xml.match(/<p:grpSpPr>[\s\S]*?<\/p:grpSpPr>/)?.[0]

it('copies mixed objects without dirtying, cuts exact members, and pastes parent wrappers with durable new refs through two saves', async () => {
  const { bytes, slide } = await fixture()
  const groups = slide.elements.filter((item) => item.type === 'group')
  const top = slide.elements.find((item) => item.type === 'shape')!
  const targets = [
    { elementId: elementDurableId(top)! },
    ...groups.map((group) => ({
      elementId: groupChildDurableId(group, group.children[0]!)!,
      group: elementDurableId(group)!,
    })),
  ]
  const copy = await apply(bytes, { kind: 'copy_elements', slide: 0, targets })
  expect(copy).toMatchObject({
    bytes,
    changed: false,
    version: 0,
    data: { count: 3, itemCount: 3, groupWrapperCount: 2 },
  })
  expect(copy.bytes).toBe(bytes)
  const cut = await apply(bytes, { kind: 'cut_elements', slide: 0, targets })
  expect(cut).toMatchObject({ changed: true, version: 1 })
  const afterCut = (await openPptx(cut.bytes)).deck.slides[0]!
  for (const group of groups) {
    const retained = afterCut.elements.find(
      (item) => elementDurableId(item) === elementDurableId(group),
    )!
    expect(retained.type === 'group' && retained.children).toHaveLength(1)
    expect(groupTransform(retained.anchor.originalXml)).toBe(
      groupTransform(group.anchor.originalXml),
    )
    const sibling = groupChildSlices(group.anchor.originalXml).find(
      (slice) => slice.nvId === group.children[1]!.nvId,
    )!
    expect(retained.anchor.originalXml).toContain(
      group.anchor.originalXml.slice(sibling.start, sibling.end),
    )
  }
  const pasted = await apply(
    cut.bytes,
    {
      kind: 'paste_elements',
      slide: 0,
      ref: (cut.data as { ref: string }).ref,
      dx: 190500,
      dy: 190500,
    },
    1,
  )
  expect(pasted).toMatchObject({ changed: true, version: 2 })
  const refs = (pasted.data as { elementRefs: string[] }).elementRefs as string[]
  expect(refs).toHaveLength(3)
  const next = await openPptx(pasted.bytes)
  const added = refs.map((ref) =>
    next.deck.slides[0]!.elements.find((item) => elementDurableId(item) === ref)!,
  )
  expect(added.every(Boolean)).toBe(true)
  expect(added.filter((item) => item.type === 'group')).toHaveLength(2)
  for (const [index, group] of added.filter((item) => item.type === 'group').entries()) {
    expect(group.children).toHaveLength(1)
    expect(group.transform).toMatchObject({
      ...groups[index]!.transform,
      offset: {
        ...groups[index]!.transform.offset,
        x: groups[index]!.transform.offset.x + 190500,
        y: groups[index]!.transform.offset.y + 190500,
      },
    })
    expect(group.children[0]!.transform).toEqual(groups[index]!.children[0]!.transform)
  }
  const twice = await savePptx(await openPptx(await savePptx(next)))
  const original = await JSZip.loadAsync(bytes),
    final = await JSZip.loadAsync(twice)
  for (const path of Object.keys(original.files).filter(
    (entryPath) => /ppt\/(media|theme)\//.test(entryPath) && !original.files[entryPath]!.dir,
  ))
    expect(await final.file(path)!.async('uint8array')).toEqual(
      await original.file(path)!.async('uint8array'),
    )
})

it('removes empty parents and target animations while preserving shared picture data and retained animation', async () => {
  const { model, slide } = await fixture()
  const group = slide.elements.find((item) => item.type === 'group')!
  const other = slide.elements.find((item) => item.type === 'shape')!
  for (const element of [group, other])
    expect(
      runTxn(model, {
        isolation: 'atomic',
        ops: [
          {
            op: 'addAnimation',
            target: { slide: 0, el: elementDurableId(element)! },
            effect: 'fadeIn',
            durationMs: 500,
            delayMs: 0,
            trigger: 'onClick',
          },
        ],
      }).applied,
    ).toBe(true)
  const bytes = await savePptx(model)
  const targets = group.children.map((child) => ({
    elementId: groupChildDurableId(group, child)!,
    group: elementDurableId(group)!,
  }))
  const cut = await apply(bytes, { kind: 'cut_elements', slide: 0, targets })
  const after = await openPptx(cut.bytes)
  expect(
    after.deck.slides[0]!.elements.some(
      (item) => elementDurableId(item) === elementDurableId(group),
    ),
  ).toBe(false)
  expect(getSlideAnimations(after.deck.slides[0]!)).toHaveLength(1)
  expect(after.archive.entries.has('ppt/media/image1.png')).toBe(true)
  const pasted = await apply(
    cut.bytes,
    { kind: 'paste_elements', slide: 0, ref: (cut.data as { ref: string }).ref },
    1,
  )
  expect(getSlideAnimations((await openPptx(pasted.bytes)).deck.slides[0]!)).toHaveLength(1)
  expect((await JSZip.loadAsync(pasted.bytes)).file('ppt/media/image1.png')).not.toBeNull()
})

it('prunes selected child timing from its parent XML while retaining its sibling and shared media', async () => {
  const { model, slide } = await fixture()
  const group = slide.elements.find((item) => item.type === 'group')!
  const top = slide.elements.find((item) => item.type === 'shape')!
  for (const element of [group, top])
    expect(
      runTxn(model, {
        isolation: 'atomic',
        ops: [
          {
            op: 'addAnimation',
            target: { slide: 0, el: elementDurableId(element)! },
            effect: 'fadeIn',
            durationMs: 600,
            delayMs: 0,
            trigger: 'onClick',
          },
        ],
      }).applied,
    ).toBe(true)
  const animations = getSlideAnimations(slide)
  animations[0]!.spid = Number(group.children[0]!.nvId)
  setSlideAnimations(slide, animations)
  const bytes = await savePptx(model)
  const targets = [
    { elementId: groupChildDurableId(group, group.children[0]!)!, group: elementDurableId(group)! },
  ]
  const cut = await apply(bytes, { kind: 'cut_elements', slide: 0, targets })
  expect(cut.data).toMatchObject({ animationCount: 1 })
  const after = await openPptx(cut.bytes)
  expect(getSlideAnimations(after.deck.slides[0]!)).toHaveLength(1)
  expect(after.archive.entries.has('ppt/media/image1.png')).toBe(true)
})

it('rejects aliases, wrong parents, overlaps, stale targets and cancellation without modifying input', async () => {
  const { bytes, slide } = await fixture()
  const group = slide.elements.find((item) => item.type === 'group')!
  const top = slide.elements.find((item) => item.type === 'shape')!
  for (const targets of [
    [{ elementId: elementDurableId(top)! }, { elementId: 'gone' }],
    [{ elementId: elementCNvPrId(top)! }, { elementId: elementDurableId(top)! }],
    [
      { elementId: elementDurableId(group)! },
      {
        elementId: groupChildDurableId(group, group.children[0]!)!,
        group: elementDurableId(group)!,
      },
    ],
    [{ elementId: groupChildDurableId(group, group.children[0]!)!, group: elementDurableId(top)! }],
  ])
    await expect(apply(bytes, { kind: 'cut_elements', slide: 0, targets })).rejects.toThrow(
      /失效|重复|组合/,
    )
  const controller = new AbortController()
  controller.abort()
  await expect(
    apply(
      bytes,
      { kind: 'copy_elements', slide: 0, targets: [{ elementId: elementDurableId(top)! }] },
      0,
      controller.signal,
    ),
  ).rejects.toThrow('取消')
  const midway = new AbortController()
  const pending = apply(
    bytes,
    { kind: 'cut_elements', slide: 0, targets: [{ elementId: elementDurableId(top)! }] },
    0,
    midway.signal,
  )
  midway.abort()
  await expect(pending).rejects.toThrow('取消')
  const copy = await apply(
    bytes,
    {
      kind: 'copy_elements',
      slide: 0,
      targets: [{ elementId: elementDurableId(top)! }],
    },
    0,
    undefined,
    'pptx-source',
  )
  source.exists = false
  try {
    await expect(
      apply(bytes, { kind: 'paste_elements', slide: 0, ref: (copy.data as { ref: string }).ref }),
    ).rejects.toThrow('源文件')
  } finally {
    source.exists = true
  }
})

it('rejects attached and inbound connectors, jump references, missing media, external media and oversized bundles', async () => {
  const { bytes, model, slide } = await fixture()
  const group = slide.elements.find((item) => item.type === 'group')!
  const picture = group.children.find((item) => item.type === 'picture')!
  const top = slide.elements.find((item) => item.type === 'shape')!
  const target = [{ elementId: picture.id, group: elementDurableId(group)! }]
  top.anchor.originalXml = top.anchor.originalXml.replace(
    '</p:sp>',
    `<a:stCxn id="${picture.nvId}" idx="0"/></p:sp>`,
  )
  expect(() => preparePptxClipboardElements(model, slide, target, true)).toThrow('未选连接线')
  expect(() =>
    preparePptxClipboardElements(model, slide, [{ elementId: elementDurableId(top)! }], false),
  ).toThrow('附着引用')
  const relPath = 'ppt/slides/_rels/slide1.xml.rels'
  const rels = model.archive.readText(relPath)!
  const imageRid = group.anchor.originalXml.match(/r:embed="([^"]+)"/)![1]!
  for (const [type, mode, message] of [
    ['slide', '', '跳转'],
    ['image', ' TargetMode="External"', '外链媒体'],
  ]) {
    model.archive.entries.set(
      relPath,
      Buffer.from(
        rels.replace(
          new RegExp(`<Relationship[^>]*Id="${imageRid}"[^>]*/>`),
          `<Relationship Id="${imageRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="https://example.com/file"${mode}/>`,
        ),
      ),
    )
    expect(() => preparePptxClipboardElements(model, slide, target, false)).toThrow(message)
  }
  model.archive.entries.set(relPath, Buffer.from(rels))
  model.archive.entries.delete('ppt/media/image1.png')
  expect(() => preparePptxClipboardElements(model, slide, target, false)).toThrow('资源已失效')
  const fresh = await openPptx(bytes)
  fresh.archive.entries.set('ppt/media/image1.png', new Uint8Array(49 * 1024 * 1024))
  const freshGroup = fresh.deck.slides[0]!.elements.find((item) => item.type === 'group')!
  expect(() =>
    preparePptxClipboardElements(
      fresh,
      fresh.deck.slides[0]!,
      [{ elementId: freshGroup.id }],
      false,
    ),
  ).toThrow('64 MiB')
})

it('retains ordinary external hyperlinks without fetching while rejecting nested missing resources', async () => {
  const { model, slide } = await fixture()
  const top = slide.elements.find((item) => item.type === 'shape')!
  top.anchor.originalXml = top.anchor.originalXml.replace(
    '</p:cNvPr>',
    '<a:hlinkClick r:id="rId99"/></p:cNvPr>',
  )
  const relPath = 'ppt/slides/_rels/slide1.xml.rels'
  const previousRels = model.archive.readText(relPath)!
  model.archive.entries.set(
    relPath,
    Buffer.from(
      previousRels.replace(
        '</Relationships>',
        '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/guide" TargetMode="External"/></Relationships>',
      ),
    ),
  )
  const copied = preparePptxClipboardElements(
    model,
    slide,
    [{ elementId: elementDurableId(top)! }],
    false,
  )
  expect(copied.items[0]!.rels).toContainEqual({
    rid: 'rId99',
    type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
    target: 'https://example.com/guide',
    external: true,
  })
  expect(copied.items[0]!.parts).toBeUndefined()
  const group = slide.elements.find((item) => item.type === 'group')!
  model.archive.entries.set(
    'ppt/media/_rels/image1.png.rels',
    Buffer.from(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="missing.png"/></Relationships>',
    ),
  )
  expect(() =>
    preparePptxClipboardElements(model, slide, [{ elementId: elementDurableId(group)! }], false),
  ).toThrow('资源已失效')
})
