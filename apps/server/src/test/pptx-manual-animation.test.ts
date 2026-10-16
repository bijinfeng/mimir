import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { applyPptxManualAnimation } from '../services/pptx-manual-animation.js'
import {
  openPptx,
  savePptx,
  getSlideAnimations,
  elementSpid,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import {
  readSlideTransitionXml,
  readSlideAdvanceTimeXml,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/generate.js'
import { runTxn } from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/index.js'
import {
  pptxManualAnimationSchema,
  type PptxManualAnimation,
} from '../../../../packages/shared/src/pptx-animation.js'
import { elementDurableId } from '../../../../packages/office/vendor/packages/pptx-engine/src/identity.js'
import { PPTX_MOTION_PRESETS } from '../../../../packages/office/src/editors/pptx-animation-tools.js'
const original = new Uint8Array(
  readFileSync(
    new URL('../../../../packages/office/tests/fixtures/title-layout.pptx', import.meta.url),
  ),
)
const canonicalPreset = (xml: string | undefined) => xml?.replace(/\bid="\d+"/g, 'id="#"')
const apply = (bytes: Uint8Array, input: PptxManualAnimation, signal?: AbortSignal) =>
  applyPptxManualAnimation({
    documentId: 'animation',
    bytes,
    expectedVersion: 8,
    ops: [input],
    signal,
  })
async function source(paragraphs = 3): Promise<Uint8Array> {
  const opened = await openPptx(original),
    slide = opened.deck.slides[0]!
  const first = slide.elements[0]!,
    second = slide.elements[1]!
  expect(
    runTxn(opened, {
      isolation: 'atomic',
      ops: [
        {
          op: 'setText',
          target: { slide: 0, el: first.id },
          paragraphs: Array.from({ length: paragraphs }, (_, i) => ({
            runs: [{ text: `段落${i + 1} ` + '文字 '.repeat(15) }],
          })),
        },
        { op: 'addAnimation', target: { slide: 0, el: first.id }, effect: 'pulse' },
        { op: 'addAnimation', target: { slide: 0, el: second.id }, effect: 'fade' },
      ],
    }).applied,
  ).toBe(true)
  const bytes = await savePptx(opened),
    zip = await JSZip.loadAsync(bytes)
  const xml = await zip.file(slide.path)!.async('string')
  // Unknown PowerPoint preset on the sibling is preserved verbatim by the native timing parser.
  zip.file(slide.path, xml.replace('presetID="10"', 'presetID="999"'))
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }))
}
async function ids(bytes: Uint8Array) {
  const opened = await openPptx(bytes)
  return {
    opened,
    first: opened.deck.slides[0]!.elements[0]!,
    second: opened.deck.slides[0]!.elements[1]!,
  }
}
describe('manual animation Ribbon semantics', () => {
  it('replaces only selected object, splits 60 real paragraphs in one version, retains sibling preset and saves twice', async () => {
    const bytes = await source(60),
      { opened, first, second } = await ids(bytes),
      before = getSlideAnimations(opened.deck.slides[0]!)
    const sibling = before.find((item) => item.spid === elementSpid(second))!
    expect(sibling.presetXml).toBeTruthy()
    const result = await apply(bytes, {
      kind: 'animation',
      slide: 0,
      elementId: elementDurableId(first)!,
      operation: 'replace',
      effect: 'bounce',
      byParagraph: true,
    })
    expect(result.changed).toBe(true)
    expect(result.version).toBe(9)
    expect(result.records).toHaveLength(1)
    const read = await openPptx(result.bytes),
      items = getSlideAnimations(read.deck.slides[0]!)
    expect(
      items.filter((item) => item.spid === elementSpid(first)).map((item) => item.paragraph),
    ).toEqual(Array.from({ length: 60 }, (_, i) => i))
    expect(
      items
        .filter((item) => item.effect === 'bounce')
        .every((item) => item.durationMs === 2000 && item.trigger === 'onClick'),
    ).toBe(true)
    expect(
      canonicalPreset(items.find((item) => item.spid === elementSpid(second))?.presetXml),
    ).toBe(canonicalPreset(sibling.presetXml))
    const again = await savePptx(read),
      readAgain = await openPptx(again)
    expect(getSlideAnimations(readAgain.deck.slides[0]!)).toEqual(items)
    const beforeZip = await JSZip.loadAsync(bytes),
      afterZip = await JSZip.loadAsync(again)
    for (const path of Object.keys(beforeZip.files).filter(
      (name) => !name.startsWith('ppt/slides/') && !beforeZip.files[name]!.dir,
    ))
      expect(await afterZip.file(path)!.async('uint8array')).toEqual(
        await beforeZip.file(path)!.async('uint8array'),
      )
  })
  it('appends five exact presets and removes all selected animations without touching sibling', async () => {
    let bytes = await source(),
      { first, second, opened } = await ids(bytes)
    const sibling = getSlideAnimations(opened.deck.slides[0]!).find(
      (item) => item.spid === elementSpid(second),
    )!
    for (const preset of PPTX_MOTION_PRESETS)
      bytes = (
        await apply(bytes, {
          kind: 'animation',
          slide: 0,
          elementId: elementDurableId(first)!,
          operation: 'add',
          effect: 'motionPath',
          motionPath: preset.path,
        })
      ).bytes
    let items = getSlideAnimations((await openPptx(bytes)).deck.slides[0]!)
    expect(
      items.filter((item) => item.effect === 'motionPath').map((item) => item.motionPath),
    ).toEqual(PPTX_MOTION_PRESETS.map((preset) => preset.path))
    expect(
      items
        .filter((item) => item.effect === 'motionPath')
        .every((item) => item.durationMs === 2000),
    ).toBe(true)
    bytes = (
      await apply(bytes, {
        kind: 'animation',
        slide: 0,
        elementId: elementDurableId(first)!,
        operation: 'remove',
      })
    ).bytes
    items = getSlideAnimations((await openPptx(bytes)).deck.slides[0]!)
    expect(
      items.map((item) => Object.assign({}, item, { presetXml: canonicalPreset(item.presetXml) })),
    ).toEqual([{ ...sibling, presetXml: canonicalPreset(sibling.presetXml) }])
  })
  it('applies current transition to 55 slides atomically, retaining advance time and all native animations', async () => {
    const opened = await openPptx(original),
      slide = opened.deck.slides[0]!
    const resultSetup = runTxn(opened, {
      isolation: 'atomic',
      ops: [
        ...Array.from({ length: 54 }, () => ({ op: 'duplicateSlide', target: { slide: 0 } })),
        { op: 'setTransition', target: { slide: 0 }, kind: 'wipe' },
      ],
    })
    expect(resultSetup.failures ?? []).toEqual([])
    expect(resultSetup.applied).toBe(true)
    expect(
      runTxn(opened, {
        isolation: 'atomic',
        ops: [{ op: 'setAdvanceTime', target: { slide: 20 }, ms: 9000 }],
      }).applied,
    ).toBe(true)
    const bytes = await savePptx(opened),
      result = await apply(bytes, { kind: 'transition-all', slide: 0 }),
      read = await openPptx(result.bytes)
    expect(read.deck.slides).toHaveLength(55)
    expect(
      read.deck.slides.every((page) => readSlideTransitionXml(page.bodySuffix) === 'wipe'),
    ).toBe(true)
    expect(readSlideAdvanceTimeXml(read.deck.slides[20]!.bodySuffix)).toBe(9000)
    expect(getSlideAnimations(read.deck.slides[0]!)).toEqual(getSlideAnimations(slide))
    const again = await openPptx(await savePptx(read))
    expect(
      again.deck.slides.every((page) => readSlideTransitionXml(page.bodySuffix) === 'wipe'),
    ).toBe(true)
  })
  it('add, replace, reorder and remove preserve transition and advTm through repeated saves', async () => {
    const { opened, first } = await ids(original)
    expect(
      runTxn(opened, {
        isolation: 'atomic',
        ops: [
          { op: 'setTransition', target: { slide: 0 }, kind: 'push' },
          { op: 'setAdvanceTime', target: { slide: 0 }, ms: 8000 },
        ],
      }).applied,
    ).toBe(true)
    let bytes: Uint8Array = await savePptx(opened)
    const elementId = elementDurableId(first)!
    for (const effect of ['fade', 'spin'] as const) {
      bytes = (
        await apply(bytes, { kind: 'animation', slide: 0, elementId, operation: 'add', effect })
      ).bytes
      const slide = (await openPptx(bytes)).deck.slides[0]!
      expect(readSlideAdvanceTimeXml(slide.bodySuffix)).toBe(8000)
      expect(readSlideTransitionXml(slide.bodySuffix)).toBe('push')
    }
    const reordered = await openPptx(bytes)
    expect(
      runTxn(reordered, {
        isolation: 'atomic',
        ops: [{ op: 'reorderAnimation', target: { slide: 0 }, seq: 1, to: 0 }],
      }).applied,
    ).toBe(true)
    bytes = await savePptx(reordered)
    bytes = (
      await apply(bytes, {
        kind: 'animation',
        slide: 0,
        elementId,
        operation: 'replace',
        effect: 'pulse',
      })
    ).bytes
    bytes = (await apply(bytes, { kind: 'animation', slide: 0, elementId, operation: 'remove' }))
      .bytes
    const reopened = await openPptx(bytes),
      again = await openPptx(await savePptx(reopened))
    expect(readSlideAdvanceTimeXml(again.deck.slides[0]!.bodySuffix)).toBe(8000)
    expect(readSlideTransitionXml(again.deck.slides[0]!.bodySuffix)).toBe('push')
    expect(getSlideAnimations(again.deck.slides[0]!)).toEqual([])
  })
  it('returns exact original bytes/version for real ZIP entry no-ops and does not grow history', async () => {
    const { first } = await ids(original)
    const cleared = await apply(original, {
      kind: 'animation',
      slide: 0,
      elementId: elementDurableId(first)!,
      operation: 'remove',
    })
    expect(cleared.changed).toBe(false)
    expect(cleared.version).toBe(8)
    expect(cleared.bytes).toBe(original)
    expect(cleared.records).toEqual([])
    const transition = await apply(original, { kind: 'transition-all', slide: 0 })
    expect(transition.changed).toBe(false)
    expect(transition.version).toBe(8)
    expect(transition.bytes).toBe(original)
  })
  it('rejects stale objects, invalid paragraph/media/XML and cancellation without publishing a partial file', async () => {
    const bytes = await source(),
      { first } = await ids(bytes)
    await expect(
      apply(bytes, {
        kind: 'animation',
        slide: 0,
        elementId: 'gone',
        operation: 'replace',
        effect: 'fade',
      }),
    ).rejects.toThrow('失效')
    await expect(
      apply(bytes, {
        kind: 'animation',
        slide: 0,
        elementId: elementDurableId(first)!,
        operation: 'replace',
        effect: 'fade',
        paragraph: 3,
      }),
    ).rejects.toThrow('段落')
    await expect(
      apply(bytes, {
        kind: 'animation',
        slide: 0,
        elementId: elementDurableId(first)!,
        operation: 'replace',
        effect: 'mediaPlay',
      }),
    ).rejects.toThrow('媒体')
    expect(
      pptxManualAnimationSchema.safeParse({
        kind: 'animation',
        slide: 0,
        elementId: elementDurableId(first)!,
        operation: 'replace',
        effect: 'fade',
        presetXml: '<p:par/>',
      }).success,
    ).toBe(false)
    await expect(
      apply(bytes, {
        kind: 'animation',
        slide: 0,
        elementId: elementDurableId(first)!,
        operation: 'add',
        effect: 'motionPath',
        motionPath: 'M 0 0 C 1',
      }),
    ).rejects.toThrow('运动路径')
    const controller = new AbortController()
    controller.abort()
    await expect(
      apply(bytes, { kind: 'transition-all', slide: 0 }, controller.signal),
    ).rejects.toThrow('取消')
    expect(getSlideAnimations((await openPptx(bytes)).deck.slides[0]!)).toHaveLength(2)
  })
})
