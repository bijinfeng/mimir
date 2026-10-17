import { mkdirSync, writeFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { pptxManualPictureSchema } from '@mimir/shared'
import { openPptx, savePptx, groupChildSlices } from '../vendor/packages/pptx-engine/src/index.js'
import { editPptxGroupPicture, resolvePptxGroupPicture } from './pptx-picture-edit.js'
import { pptxGroupCropFixture } from './editors/pptx-group-crop-fixture.test-helper.js'
import { pictureCropCommit, pptxPictureCropGeometry } from './editors/pptx-picture-crop.js'
import { openPptx as openMimirPptx } from './pptx.js'
import { renderSlide } from './pptx-render.js'
import { pptxGroupPictureCropReason } from './pptx-group-picture-crop-guard.js'

const vp = { width: 960, height: 720, slideWidth: 9144000, slideHeight: 6858000 }
const entries = async (source: Uint8Array) => {
  const zip = await JSZip.loadAsync(source)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((file) => !file.dir)
        .map(async (file) => [file.name, await file.async('uint8array')]),
    ),
  )
}

const stripChange = (xml: string) =>
  xml
    .replace(/<a:srcRect\b[^>]*\/>/g, '')
    .replace(/(<a:off\b[^>]*\bx=")[^"]*("[^>]*\by=")[^"]*(")/g, '$1x$2y$3')
    .replace(/(<a:ext\b[^>]*\bcx=")[^"]*("[^>]*\bcy=")[^"]*(")/g, '$1cx$2cy$3')

describe('direct group canvas crop native bytes', () => {
  it.each(['anisotropic37', 'quarter90', 'identity', 'flat-camera'] as const)(
    'patches only target crop/off/ext for %s, reopens twice and exports SVG raster fixture',
    async (kind) => {
      const fixture = await pptxGroupCropFixture(kind)
      const opened = await openPptx(fixture.bytes),
        slide = opened.deck.slides[0]!
      const before = resolvePptxGroupPicture(slide, fixture.target)
      const beforeGroup = before.parent.anchor.originalXml,
        originalTarget = before.xml
      const oldTransform = structuredClone(before.picture.transform)
      const oldPicture = structuredClone(before.picture)
      const g = pptxPictureCropGeometry(before.picture, vp, before.parent)!
      const value = pictureCropCommit(g, {
        x: g.frame.w * 0.2,
        y: g.frame.h * 0.2,
        w: g.frame.w * 0.6,
        h: g.frame.h * 0.6,
      })
      const input = pptxManualPictureSchema.parse({ ...fixture.target, ...value })
      expect(editPptxGroupPicture(slide, input)).toBe(true)
      const saved = await savePptx(opened),
        reopened = await openPptx(saved)
      const after = resolvePptxGroupPicture(reopened.deck.slides[0]!, fixture.target)
      expect(after.picture.transform).toEqual({ ...oldTransform, offset: value.box })
      expect(after.picture.srcRect).toEqual(value.srcRect)
      expect(stripChange(after.xml)).toBe(stripChange(originalTarget))
      expect(after.xml).toContain('c1:keep="yes"')
      expect(after.parent.anchor.originalXml.replace(after.xml, 'TARGET')).toBe(
        beforeGroup.replace(originalTarget, 'TARGET'),
      )
      const oldEntries = await entries(fixture.bytes),
        newEntries = await entries(saved)
      const changed = Object.keys(oldEntries).filter((path) =>
        Buffer.compare(oldEntries[path]!, newEntries[path]!),
      )
      expect(changed).toEqual([slide.path])
      expect(await entries(await savePptx(reopened))).toEqual(newEntries)
      expect(editPptxGroupPicture(reopened.deck.slides[0]!, input)).toBe(false)
      const output = process.env.MIMIR_PPTX_GROUP_CROP_FIXTURE_DIR
      if (output) {
        mkdirSync(output, { recursive: true })
        const deck = await openMimirPptx(fixture.bytes),
          rendered = renderSlide(deck, 0, { fitWidthPx: 960 })!
        const afterDeck = await openMimirPptx(saved),
          afterRendered = renderSlide(afterDeck, 0, { fitWidthPx: 960 })!
        writeFileSync(`${output}/${kind}.pptx`, fixture.bytes)
        writeFileSync(`${output}/${kind}-cropped.pptx`, saved)
        writeFileSync(`${output}/${kind}.svg`, rendered.svg)
        writeFileSync(`${output}/${kind}-cropped.svg`, afterRendered.svg)
        writeFileSync(
          `${output}/${kind}.json`,
          JSON.stringify(
            {
              parent: before.parent.transform,
              childOffset: before.parent.childOffset,
              picture: oldPicture,
              viewport: vp,
              geometry: g,
              value,
              parentId: before.parent.id,
              pictureId: before.picture.id,
            },
            null,
            2,
          ),
        )
        writeFileSync(`${output}/source-grid.png`, fixture.image)
      }
    },
  )

  it.each(['compact', 'spaced', 'leading-zero'] as const)(
    'preserves exact native no-op and refuses %s attached targets without changing model',
    async (attributeSpacing) => {
      const fixture = await pptxGroupCropFixture(),
        opened = await openPptx(fixture.bytes),
        slide = opened.deck.slides[0]!
      const { parent, picture } = resolvePptxGroupPicture(slide, fixture.target)
      expect(
        editPptxGroupPicture(slide, {
          ...fixture.target,
          srcRect: picture.srcRect!,
          box: { ...picture.transform.offset },
        }),
      ).toBe(false)
      const slices = groupChildSlices(parent.anchor.originalXml)
      const sibling = slices.find((slice) => slice.nvId !== picture.nvId)!
      parent.anchor.originalXml = parent.anchor.originalXml.replace(
        sibling.xml,
        sibling.xml.replace(
          '<p:cNvSpPr/>',
          `<p:cNvSpPr><a:stCxn id${attributeSpacing === 'spaced' ? ' = ' : '='}"${attributeSpacing === 'leading-zero' ? '000' : ''}${picture.nvId}" idx="0"/></p:cNvSpPr>`,
        ),
      )
      const before = JSON.stringify(slide)
      expect(pptxGroupPictureCropReason(slide, parent, picture)).toContain('连接线')
      expect(() =>
        editPptxGroupPicture(slide, {
          ...fixture.target,
          srcRect: null,
          box: { ...picture.transform.offset, x: picture.transform.offset.x + 100 },
        }),
      ).toThrow('连接线')
      expect(JSON.stringify(slide)).toBe(before)
    },
  )

  it.each([
    'duplicate-offset',
    'missing-position-attribute',
    'duplicate-position-attribute',
    'invalid-position-attribute',
  ] as const)('refuses %s without publishing a partial crop or frame', async (kind) => {
    const fixture = await pptxGroupCropFixture(),
      opened = await openPptx(fixture.bytes)
    const slide = opened.deck.slides[0]!,
      resolved = resolvePptxGroupPicture(slide, fixture.target)
    const offset = resolved.xml.match(/<a:off\b[^>]*\/>/)![0]
    const broken = resolved.xml.replace(
      offset,
      kind === 'duplicate-offset'
        ? offset + offset
        : kind === 'duplicate-position-attribute'
          ? offset.replace('<a:off', '<a:off x="10"')
          : kind === 'invalid-position-attribute'
            ? offset.replace(/\sx="[^"]*"/, ' x="1.5"')
            : offset.replace(/\sx="[^"]*"/, ''),
    )
    resolved.parent.anchor.originalXml = resolved.parent.anchor.originalXml.replace(
      resolved.xml,
      broken,
    )
    const before = JSON.stringify(slide)
    expect(() =>
      editPptxGroupPicture(slide, {
        ...fixture.target,
        srcRect: null,
        box: {
          ...resolved.picture.transform.offset,
          x: resolved.picture.transform.offset.x + 100,
        },
      }),
    ).toThrow(kind === 'duplicate-offset' ? '原生定位结构不明确' : '原生定位属性不完整')
    expect(JSON.stringify(slide)).toBe(before)
  })

  it('strictly rejects box-only, over-budget, unsafe, nonpositive, and extra frame parameters', () => {
    const target = { slide: 0, group: 'e_1', elementId: 'gc_1_2' }
    const box = { x: 1, y: 2, cx: 3, cy: 4 }
    expect(pptxManualPictureSchema.safeParse({ ...target, box }).success).toBe(false)
    for (const value of [NaN, Infinity, 2 ** 53, 2147483648, 1.2])
      expect(
        pptxManualPictureSchema.safeParse({ ...target, srcRect: null, box: { ...box, x: value } })
          .success,
      ).toBe(false)
    expect(
      pptxManualPictureSchema.safeParse({ ...target, srcRect: null, box: { ...box, cx: 0 } })
        .success,
    ).toBe(false)
    expect(
      pptxManualPictureSchema.safeParse({ ...target, srcRect: null, box: { ...box, rot: 0 } })
        .success,
    ).toBe(false)
    expect(pptxManualPictureSchema.safeParse({ ...target, srcRect: null, box }).success).toBe(true)
  })
})
