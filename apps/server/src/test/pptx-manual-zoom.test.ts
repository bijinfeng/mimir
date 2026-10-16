import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { applyPptxManualZoom } from '../services/pptx-manual-zoom.js'
import {
  getSections,
  openPptx,
  savePptx,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import { runTxn } from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/index.js'
import { openPptxForEdit } from '../../../../packages/office/src/pptx.js'
import type { PptxManualZoom } from '../../../../packages/shared/src/pptx-zoom.js'
const fixture = () =>
  new Uint8Array(
    readFileSync(
      new URL('../../../../packages/office/tests/fixtures/title-layout.pptx', import.meta.url),
    ),
  )
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X9WQAAAAASUVORK5CYII='
const info = (bytes: Uint8Array) => {
  if (bytes[0] !== 137 || bytes[1] !== 80 || bytes[12] !== 73) throw new Error('图片无效')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { ext: 'png', width: view.getUint32(16), height: view.getUint32(20) }
}
async function deck() {
  const opened = await openPptx(fixture())
  for (let index = 0; index < 3; index++) {
    const result = runTxn(opened, {
      isolation: 'atomic',
      ops: [{ op: 'duplicateSlide', target: { slide: index } }],
    })
    expect(result.failures ?? []).toEqual([])
    expect(result.applied).toBe(true)
  }
  expect(
    runTxn(opened, {
      isolation: 'atomic',
      ops: [
        {
          op: 'setSections',
          sections: [
            { id: '{11111111-1111-1111-1111-111111111111}', name: '开场', slideIndices: [0, 1] },
            { id: '{22222222-2222-2222-2222-222222222222}', name: '结束', slideIndices: [2, 3] },
          ],
        },
      ],
    }).applied,
  ).toBe(true)
  return savePptx(opened)
}
const apply = (bytes: Uint8Array, input: PptxManualZoom, signal?: AbortSignal) =>
  applyPptxManualZoom(
    {
      documentId: 'zoom',
      bytes,
      expectedVersion: 5,
      ops: [input],
      signal,
    },
    info,
  )
async function native(bytes: Uint8Array, path: string) {
  const zip = await JSZip.loadAsync(bytes)
  const xml = await zip.file(path)!.async('string')
  const rels = await zip.file(path.replace('/slides/', '/slides/_rels/') + '.rels')!.async('string')
  return { zip, xml, rels, pictures: xml.match(/<p:pic\b[\s\S]*?<\/p:pic>/g) ?? [] }
}
function verifyLinks(xml: string, rels: string, count: number) {
  const links = [
    ...xml.matchAll(/<a:hlinkClick\b[^>]*r:id="([^"]+)"[^>]*action="ppaction:\/\/hlinksldjump"/g),
  ]
  expect(links).toHaveLength(count)
  for (const link of links) {
    const rel = new RegExp(`<Relationship\\b[^>]*Id="${link[1]}"[^>]*/>`).exec(rels)?.[0]
    expect(rel).toContain('/slide"')
    expect(rel).not.toContain('External')
    expect(rel).toMatch(/Target="(?:\.\.\/slides\/)?slide\d+\.xml"/)
  }
}
describe('native PPTX zoom snapshot adapter', () => {
  it('lands each selected slide as a PNG picture with native internal jump and preserves unrelated ZIP parts', async () => {
    const bytes = await deck(),
      original = await native(bytes, 'ppt/slides/slide1.xml')
    const result = await apply(bytes, {
      mode: 'slide',
      slide: 0,
      targets: [
        { slide: 3, png },
        { slide: 1, png },
      ],
    })
    expect(result).toMatchObject({ version: 6, changed: true, data: { slideIndex: 0, count: 2 } })
    expect(JSON.stringify(result.records).length).toBeLessThan(10_000)
    expect(result.records.some((record) => 'bytes' in record.op)).toBe(false)
    const landed = await native(result.bytes, 'ppt/slides/slide1.xml')
    expect(landed.pictures).toHaveLength(original.pictures.length + 2)
    expect(landed.pictures.filter((picture) => /name="Slide Zoom/.test(picture))).toHaveLength(2)
    verifyLinks(landed.xml, landed.rels, 2)
    const media = Object.keys(landed.zip.files).filter((path) => /^ppt\/media\/.*\.png$/.test(path))
    expect(media.length).toBeGreaterThan(0)
    const contents = await Promise.all(
      media.map(async (path) =>
        Buffer.from(await landed.zip.file(path)!.async('uint8array')).toString('base64'),
      ),
    )
    expect(contents).toContain(png)
    for (const path of ['ppt/slides/slide2.xml', 'ppt/theme/theme1.xml'])
      expect(await landed.zip.file(path)!.async('string')).toBe(
        await original.zip.file(path)!.async('string'),
      )
    const session = await openPptxForEdit(result.bytes)
    expect([...session.view().links!(0).values()]).toEqual([
      { kind: 'slide', slideIndex: 1 },
      { kind: 'slide', slideIndex: 3 },
    ])
    const first = await session.save()
    session.commit()
    const second = await session.save(),
      reopened = await openPptxForEdit(second)
    expect(reopened.slides()).toHaveLength(4)
    expect([...reopened.view().links!(0).values()]).toEqual([...session.view().links!(0).values()])
    expect((await native(second, 'ppt/slides/slide1.xml')).xml).toBe(
      (await native(first, 'ppt/slides/slide1.xml')).xml,
    )
  })
  it('uses section heads, not arbitrary pages, for section zooms', async () => {
    const bytes = await deck()
    await expect(
      apply(bytes, { mode: 'section', slide: 0, targets: [{ slide: 1, png }] }),
    ).rejects.toThrow(/首页/)
    const result = await apply(bytes, {
      mode: 'section',
      slide: 1,
      targets: [
        { slide: 0, png },
        { slide: 2, png },
      ],
    })
    const session = await openPptxForEdit(result.bytes)
    expect([...session.view().links!(1).values()]).toEqual([
      { kind: 'slide', slideIndex: 0 },
      { kind: 'slide', slideIndex: 2 },
    ])
    expect(getSections(await openPptx(result.bytes)).map((section) => section.name)).toEqual([
      '开场',
      '结束',
    ])
  })
  it.each([0, 1])(
    'inserts a summary before chosen slide %i with grid pictures, shifted links and persistent native sections',
    async (first) => {
      const bytes = await deck()
      const result = await apply(bytes, {
        mode: 'summary',
        slide: 3,
        targets: [
          { slide: first, png },
          { slide: 2, png },
        ],
      })
      const session = await openPptxForEdit(result.bytes)
      expect(session.slides()).toHaveLength(5)
      const path = session.slides()[first]!.path
      const snapshot = await native(result.bytes, path)
      verifyLinks(snapshot.xml, snapshot.rels, 2)
      expect(snapshot.pictures.every((picture) => picture.includes('name="Summary Zoom'))).toBe(
        true,
      )
      expect([...session.view().links!(first).values()]).toEqual([
        { kind: 'slide', slideIndex: first + 1 },
        { kind: 'slide', slideIndex: 3 },
      ])
      const sections = getSections(await openPptx(result.bytes))
      expect(sections.find((section) => section.name === '摘要节')?.slideIndices).toEqual([first])
      expect(sections.find((section) => section.name === '结束')).toMatchObject({
        id: '{22222222-2222-2222-2222-222222222222}',
        slideIndices: [3, 4],
      })
      expect(sections.filter((section) => section.slideIndices.includes(first + 1))).toHaveLength(1)
      const saved = await session.save()
      session.commit()
      const savedAgain = await session.save()
      expect(getSections(await openPptx(savedAgain))).toEqual(sections)
      verifyLinks((await native(savedAgain, path)).xml, (await native(saved, path)).rels, 2)
    },
  )
  it('rejects duplicate/stale targets, malformed/oversized snapshots and cancellation without publishing partial edits', async () => {
    const bytes = await deck(),
      original = bytes.slice()
    await expect(
      apply(bytes, {
        mode: 'slide',
        slide: 0,
        targets: [
          { slide: 1, png },
          { slide: 1, png },
        ],
      }),
    ).rejects.toThrow(/重复/)
    await expect(
      apply(bytes, {
        mode: 'slide',
        slide: 0,
        targets: [
          { slide: 1, png },
          { slide: 20, png },
        ],
      }),
    ).rejects.toThrow(/目标页面/)
    await expect(
      apply(bytes, { mode: 'slide', slide: 0, targets: [{ slide: 1, png: 'A'.repeat(48) }] }),
    ).rejects.toThrow(/图片/)
    const oversized = Buffer.from(png, 'base64')
    oversized.writeUInt32BE(1281, 16)
    await expect(
      apply(bytes, {
        mode: 'slide',
        slide: 0,
        targets: [{ slide: 1, png: oversized.toString('base64') }],
      }),
    ).rejects.toThrow(/1280/)
    const controller = new AbortController()
    await expect(
      applyPptxManualZoom(
        {
          documentId: 'zoom',
          bytes,
          expectedVersion: 0,
          ops: [{ mode: 'summary', slide: 0, targets: [{ slide: 1, png }] }],
          signal: controller.signal,
        },
        (image) => {
          controller.abort()
          return info(image)
        },
      ),
    ).rejects.toThrow(/取消/)
    expect(bytes).toEqual(original)
    const json = { mode: 'slide', slide: 0, targets: [{ slide: 1, png, mediaPath: '/etc/passwd' }] }
    await expect(
      applyPptxManualZoom({ documentId: 'zoom', bytes, expectedVersion: 0, ops: [json] }, info),
    ).rejects.toThrow(/Unrecognized|unrecognized/)
  })
})
