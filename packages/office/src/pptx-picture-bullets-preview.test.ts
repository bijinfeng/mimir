import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import type {
  GlyphRun,
  RenderNode,
  ShapeRenderNode,
} from '../vendor/packages/pptx-render/src/render-tree.js'
import { openPptx, openPptxForEdit } from './pptx.js'
import { renderSlide } from './pptx-render.js'
import { renderSlideToSvg } from './pptx-svg.js'

const picture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../tests/fixtures/pptx-images/${name}`, import.meta.url)))
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' })
const imageAttrs = (svg: string): Record<string, string>[] =>
  [...svg.matchAll(/<image\b[^>]*\/>/g)].map((match) => parser.parse(match[0]).image)
function nestedImages(value: unknown): Record<string, string>[] {
  if (Array.isArray(value)) return value.flatMap(nestedImages)
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) =>
    key === 'image'
      ? ((Array.isArray(child) ? child : [child]) as Record<string, string>[])
      : nestedImages(child),
  )
}

const paragraph = (rid: string, label: string, size: string, long = false) =>
  `<a:p><a:pPr marL="400000" indent="-200000">${size}<a:buBlip><a:blip r:embed="${rid}"/></a:buBlip></a:pPr><a:r><a:rPr lang="en-US" sz="2400"/><a:t>${label}${long ? ' wraps across multiple lines with several words to test first line bullets' : ''}</a:t></a:r></a:p>`

const shape = (id: number, rid: string, x: number, y: number) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="2000000" cy="1600000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr lIns="0" tIns="0" rIns="0" bIns="0" wrap="square"/><a:lstStyle/>${paragraph(rid, `Text${id}`, '<a:buSzPct val="125000"/>', true)}${paragraph(rid, `Fixed${id}`, '<a:buSzPts val="1200"/>')}</p:txBody></p:sp>`

/** Native DrawingML with two top-level PNG text shapes and two direct JPEG group members. */
async function fixture(jpeg = picture('picture.jpg')) {
  const zip = await JSZip.loadAsync(
    readFileSync(new URL('../tests/fixtures/title-layout.pptx', import.meta.url)),
  )
  const group = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="4" name="Direct group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm rot="900000"><a:off x="1000000" y="3000000"/><a:ext cx="5000000" cy="2000000"/><a:chOff x="0" y="0"/><a:chExt cx="5000000" cy="2000000"/></a:xfrm></p:grpSpPr>${shape(5, 'rIdBulletJpg', 0, 0)}${shape(6, 'rIdBulletJpg', 2500000, 0)}</p:grpSp>`
  const path = 'ppt/slides/slide1.xml'
  const xml = await zip.file(path)!.async('string')
  zip.file(
    path,
    xml.replace(
      /<p:spTree>[\s\S]*?<\/p:spTree>/,
      `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shape(2, 'rIdBulletPng', 1000000, 500000)}${shape(3, 'rIdBulletPng', 3500000, 500000)}${group}</p:spTree>`,
    ),
  )
  const relPath = 'ppt/slides/_rels/slide1.xml.rels'
  const rels = await zip.file(relPath)!.async('string')
  zip.file(
    relPath,
    rels.replace(
      '</Relationships>',
      '<Relationship Id="rIdBulletPng" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/bullet.png"/><Relationship Id="rIdBulletJpg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/bullet.jpg"/></Relationships>',
    ),
  )
  zip.file('ppt/media/bullet.png', picture('picture.png'))
  zip.file('ppt/media/bullet.jpg', jpeg)
  const types = await zip.file('[Content_Types].xml')!.async('string')
  zip.file(
    '[Content_Types].xml',
    types.replace(
      '</Types>',
      '<Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/></Types>',
    ),
  )
  zip.file('customXml/picture-bullet-sentinel.xml', '<keep>exact native source</keep>')
  return zip.generateAsync({ type: 'uint8array' })
}
function textNodes(nodes: readonly RenderNode[]): ShapeRenderNode[] {
  return nodes.flatMap((node) =>
    node.type === 'group'
      ? textNodes(node.children)
      : node.type === 'text' || node.type === 'shape'
        ? [node]
        : [],
  )
}
async function nativeParts(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.entries(zip.files)
        .filter(([, file]) => !file.dir)
        .map(async ([path, file]) => [path, await file.async('uint8array')]),
    ),
  )
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('PPTX picture bullet SVG preview', () => {
  it('draws empty-text image runs and breaks text merging while still skipping ordinary empty runs', () => {
    const url = `data:image/png;base64,${Buffer.from(picture('picture.png')).toString('base64')}`
    const glyph: GlyphRun = {
      text: 'first',
      x: 0,
      baselineY: 20,
      widthPx: 25,
      fontSizePx: 16,
      fontFamily: 'Arial',
      color: '#000000',
      bold: false,
      italic: false,
      underline: false,
    }
    const node: ShapeRenderNode = {
      id: 'text',
      sourceId: 'text',
      type: 'text',
      fill: { kind: 'none' },
      box: {
        x: 0,
        y: 0,
        w: 100,
        h: 60,
        centerX: 50,
        centerY: 30,
        rotationDeg: 0,
        flipH: false,
        flipV: false,
      },
      text: {
        insets: { l: 0, t: 0, r: 0, b: 0 },
        anchor: 'top',
        fontScale: 1,
        contentHeight: 24,
        wrap: true,
        lines: [
          {
            top: 0,
            height: 24,
            runs: [
              { ...glyph, text: '', widthPx: 0 },
              glyph,
              { ...glyph, text: '', image: url, isBullet: true, x: 25, widthPx: 18, ascentPx: 12 },
              { ...glyph, text: 'second', x: 43 },
            ],
          },
        ],
      },
    }
    const svg = renderSlideToSvg({
      widthPx: 100,
      heightPx: 60,
      scale: 1,
      background: { kind: 'none' },
      nodes: [node],
    })
    expect(XMLValidator.validate(svg)).toBe(true)
    expect(imageAttrs(svg)).toEqual([
      { href: url, x: '25', y: '8', width: '18', height: '12', preserveAspectRatio: 'none' },
    ])
    expect(svg).toMatch(/>first<\/text><image\b[^>]*\/><text\b[^>]*>second<\/text>/)
    expect(svg.match(/<text\b/g)).toHaveLength(2)
  })

  it.each([420, 960])(
    'renders real native PNG/JPEG bullets at %s px with first-line size, indent and group placement',
    async (fitWidthPx) => {
      const deck = await openPptx(await fixture())
      const rendered = renderSlide(deck, 0, { fitWidthPx })!
      expect(XMLValidator.validate(rendered.svg)).toBe(true)
      const text = textNodes(rendered.tree.nodes)
      expect(text).toHaveLength(4)
      const images = imageAttrs(rendered.svg)
      expect(images).toHaveLength(8)
      expect(images.filter((image) => image.href!.startsWith('data:image/png;'))).toHaveLength(4)
      expect(images.filter((image) => image.href!.startsWith('data:image/jpeg;'))).toHaveLength(4)
      let imageIndex = 0
      for (const node of text) {
        const lines = node.text!.lines
        const firstLines = lines.filter((line) => line.paraStart !== false)
        expect(firstLines).toHaveLength(2)
        expect(lines.length).toBeGreaterThan(2)
        expect(
          lines
            .filter((line) => line.paraStart === false)
            .every((line) => !line.runs.some((run) => run.isBullet)),
        ).toBe(true)
        for (const [paragraphIndex, line] of firstLines.entries()) {
          const run = line.runs.find((item) => item.isBullet)!
          const body = line.runs.find((item) => !item.isBullet)!
          expect(run.text).toBe('')
          expect(run.image).toBeDefined()
          const first = body.fontSizePx
          const expectedHeight = paragraphIndex === 0 ? first * 1.25 * 0.75 : first * 0.5 * 0.75
          expect(run.ascentPx).toBeCloseTo(expectedHeight, 6)
          // Both source images are 12×8; width retains native aspect, not a square glyph.
          expect(run.widthPx).toBeCloseTo(expectedHeight * 1.5, 6)
          expect(run.x).toBeCloseTo((200000 * fitWidthPx) / deck.size.cx, 6)
          expect(body.x).toBeGreaterThanOrEqual(run.x + run.widthPx - 0.001)
          const image = images[imageIndex++]!
          expect(image.href).toBe(run.image)
          for (const [key, value] of Object.entries({
            x: run.x,
            y: run.baselineY - run.ascentPx!,
            width: run.widthPx,
            height: run.ascentPx!,
          }))
            expect(Math.abs(Number(image[key]) - value)).toBeLessThanOrEqual(0.005001)
        }
      }
      expect(rendered.svg).toContain('data-element-kind="group" transform="matrix(')
      expect(rendered.svg.match(/data-pptx-paragraph=/g)).toHaveLength(8)
      // Independent structural check: JPEG glyphs must inherit the actual parent matrix,
      // not merely exist elsewhere in the SVG alongside a correctly transformed group.
      const elements = parser.parse(rendered.svg).svg.g as Record<string, unknown>[]
      const group = elements.find((node) => node['data-element-kind'] === 'group')!
      expect(
        elements.filter((node) => node['data-element-kind'] === 'shape').map(nestedImages),
      ).toEqual([images.slice(0, 2), images.slice(2, 4)])
      const children = group.g as Record<string, unknown>[]
      expect(children.map(nestedImages)).toEqual([images.slice(4, 6), images.slice(6, 8)])
      expect(nestedImages(group).every((image) => image.href!.startsWith('data:image/jpeg;'))).toBe(
        true,
      )
      const matrix = String(group.transform)
        .match(/^matrix\(([^)]+)\)$/)![1]!
        .split(' ')
        .map(Number)
      const angle = Math.PI / 12
      const scale = fitWidthPx / deck.size.cx
      const expected = [
        Math.cos(angle),
        Math.sin(angle),
        -Math.sin(angle),
        Math.cos(angle),
        (3500000 - Math.cos(angle) * 2500000 + Math.sin(angle) * 1000000) * scale,
        (4000000 - Math.sin(angle) * 2500000 - Math.cos(angle) * 1000000) * scale,
      ]
      for (const [index, coordinate] of expected.entries())
        expect(Math.abs(matrix[index]! - coordinate)).toBeLessThanOrEqual(0.005001)
      expect(children[0]!.transform).toBe('translate(0 0)')
      const childX = Number(String(children[1]!.transform).match(/^translate\(([^ ]+) 0\)$/)![1])
      expect(Math.abs(childX - 2500000 * scale)).toBeLessThanOrEqual(0.005001)
    },
  )

  it('retains the native dot fallback for an unresolved blip without inventing an image', async () => {
    const deck = await openPptx(await fixture())
    const rendered = renderSlide({ ...deck, media: new Map() }, 0, { fitWidthPx: 960 })!
    expect(imageAttrs(rendered.svg)).toHaveLength(0)
    const runs = textNodes(rendered.tree.nodes)
      .flatMap((node) => node.text!.lines.flatMap((line) => line.runs))
      .filter((run) => run.isBullet)
    expect(runs).toHaveLength(8)
    expect(runs.every((run) => run.text === '•' && !run.image)).toBe(true)
    expect(rendered.svg.match(/>•<\/text>/g)).toHaveLength(8)
  })

  it('reuses prepared data URLs without decoding or owning resources on every render, and leaves native bytes clean', async () => {
    const bytes = await fixture()
    const session = await openPptxForEdit(bytes)
    const view = session.view()
    const media = session.media
    const image = vi.fn<() => never>(() => {
      throw new Error('Unexpected per-render image decode')
    })
    const bitmap = vi.fn<() => never>(() => {
      throw new Error('Unexpected per-render bitmap')
    })
    const element = vi.fn<() => never>(() => {
      throw new Error('Unexpected per-render DOM resource')
    })
    vi.stubGlobal('Image', image)
    vi.stubGlobal('createImageBitmap', bitmap)
    vi.stubGlobal('document', { createElement: element })
    const createUrl = vi.spyOn(URL, 'createObjectURL')
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL')
    const fetch = vi.spyOn(globalThis, 'fetch')
    for (let i = 0; i < 12; i++) {
      const rendered = renderSlide(session, 0, { fitWidthPx: i % 2 ? 960 : 420 })!
      expect(imageAttrs(rendered.svg)).toHaveLength(8)
      expect(
        imageAttrs(rendered.svg).every((item) => [...media.values()].includes(item.href!)),
      ).toBe(true)
    }
    for (const spy of [image, bitmap, element, createUrl, revokeUrl, fetch])
      expect(spy).not.toHaveBeenCalled()
    expect(session.view()).toBe(view)
    expect(session.media).toBe(media)
    expect(session.version()).toBe(0)
    expect(session.hasChanges()).toBe(false)
    expect(await nativeParts(await session.save())).toEqual(await nativeParts(bytes))
  })

  it('follows the current media after A→B→A native source replacement instead of caching by reused path', async () => {
    const bytes = await fixture()
    const changed = await fixture(picture('orientation-6.jpg'))
    const session = await openPptxForEdit(bytes)
    const originalUrl = session.media.get('ppt/media/bullet.jpg')!
    const first = renderSlide(session, 0, { fitWidthPx: 960 })!
    expect(imageAttrs(first.svg).filter((image) => image.href === originalUrl)).toHaveLength(4)
    await session.replaceFromHost(changed, session.version())
    const changedUrl = session.media.get('ppt/media/bullet.jpg')!
    expect(changedUrl).not.toBe(originalUrl)
    const second = renderSlide(session, 0, { fitWidthPx: 960 })!
    expect(imageAttrs(second.svg).filter((image) => image.href === changedUrl)).toHaveLength(4)
    expect(second.svg).not.toContain(originalUrl)
    await session.replaceFromHost(bytes, session.version())
    const third = renderSlide(session, 0, { fitWidthPx: 960 })!
    expect(imageAttrs(third.svg).filter((image) => image.href === originalUrl)).toHaveLength(4)
    expect(third.svg).not.toContain(changedUrl)
    expect(imageAttrs(first.svg)).toEqual(imageAttrs(third.svg))
  })
})
