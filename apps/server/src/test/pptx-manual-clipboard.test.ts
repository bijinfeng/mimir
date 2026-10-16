import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import {
  openPptx,
  elementDurableId,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
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
import { getSlideAnimations } from '../../../../packages/office/vendor/packages/pptx-engine/src/animation.js'
import { applyPptxOpsOnHost } from '../services/pptx-agent-host.js'

const load = (name = 'title-layout.pptx') =>
  new Uint8Array(
    readFileSync(new URL(`../../../../packages/office/tests/fixtures/${name}`, import.meta.url)),
  )
const apply = (bytes: Uint8Array, expectedVersion: number, input: unknown) =>
  applyPptxOpsOnHost({
    documentId: 'pptx-1',
    bytes,
    expectedVersion,
    action: 'manual_asset',
    ops: [input],
  })
describe('PPTX native manual clipboard', () => {
  it('changes a real animation effect and direction while preserving timeline order and timing across saves', async () => {
    const bytes = load(),
      original = await openPptx(bytes),
      el = elementDurableId(original.deck.slides[0]!.elements[0]!)!
    const added = await applyPptxOpsOnHost({
      documentId: 'pptx-1',
      bytes,
      expectedVersion: 0,
      ops: [
        {
          op: 'addAnimation',
          target: { slide: 0, el },
          effect: 'fadeIn',
          trigger: 'onClick',
          durationMs: 850,
          delayMs: 120,
        },
        {
          op: 'addAnimation',
          target: { slide: 0, el },
          effect: 'fadeOut',
          trigger: 'afterPrev',
          durationMs: 400,
          delayMs: 0,
        },
      ],
    })
    const changed = await apply(added.bytes, 1, {
      kind: 'animation_style',
      slide: 0,
      seq: 0,
      effect: 'flyIn',
      direction: 'left',
      paragraph: 0,
    })
    const timeline = getSlideAnimations((await openPptx(changed.bytes)).deck.slides[0]!)
    expect(timeline).toHaveLength(2)
    expect(timeline[0]).toMatchObject({
      effect: 'flyIn',
      direction: 'left',
      paragraph: 0,
      durationMs: 850,
      delayMs: 120,
      trigger: 'onClick',
    })
    expect(timeline[1]).toMatchObject({ effect: 'fadeOut', durationMs: 400 })
    const path = await apply(changed.bytes, 2, {
      kind: 'animation_style',
      slide: 0,
      seq: 0,
      effect: 'motionPath',
      motionPath: 'M 0 0 L 0.5 0',
      paragraph: null,
    })
    expect(getSlideAnimations((await openPptx(path.bytes)).deck.slides[0]!)[0]).toMatchObject({
      effect: 'motionPath',
      motionPath: 'M 0 0 L 0.5 0',
    })
    await expect(
      apply(path.bytes, 3, { kind: 'animation_style', slide: 0, seq: 0, paragraph: 999 }),
    ).rejects.toThrow('段落')
  })
  it('lists actual master previews without dirtying and patches only the chosen master part across saves', async () => {
    const bytes = load(),
      listed = await apply(bytes, 0, { kind: 'master_parts' })
    expect(listed.version).toBe(0)
    expect(listed.changed).toBe(false)
    const parts = (listed.data as { parts: unknown }).parts as {
      partPath: string
      svg: string
      elements: { id: string }[]
    }[]
    const part = parts.find((item) => item.elements.length)!
    expect(part.svg).toContain('<svg')
    const first = await apply(bytes, 0, {
      kind: 'master_edit',
      part: part.partPath,
      elementId: part.elements[0]!.id,
      operation: { action: 'fill', color: '#DC2626' },
    })
    const before = await JSZip.loadAsync(bytes),
      after = await JSZip.loadAsync(first.bytes)
    expect(await after.file(part.partPath)!.async('string')).toContain('DC2626')
    expect(await after.file('ppt/slides/slide1.xml')!.async('uint8array')).toEqual(
      await before.file('ppt/slides/slide1.xml')!.async('uint8array'),
    )
    const borderless = await apply(first.bytes, 1, {
      kind: 'master_edit',
      part: part.partPath,
      elementId: part.elements[0]!.id,
      operation: { action: 'stroke', color: '#000000', widthPt: 0 },
    })
    expect(
      await (await JSZip.loadAsync(borderless.bytes)).file(part.partPath)!.async('string'),
    ).toContain('<a:noFill/>')
    const next = await apply(borderless.bytes, 2, { kind: 'master_parts' })
    expect(
      ((next.data as { parts: unknown }).parts as { svg: string }[]).some((item) =>
        item.svg.includes('#DC2626'),
      ),
    ).toBe(true)
    await expect(
      apply(first.bytes, 1, {
        kind: 'master_edit',
        part: 'ppt/slides/slide1.xml',
        elementId: part.elements[0]!.id,
        operation: { action: 'delete' },
      }),
    ).rejects.toThrow(/Invalid string|Invalid input|Invalid|regex|pattern/)
  })
  it('copies current unsaved text without changing version, pastes native object and preserves theme through two saves', async () => {
    const bytes = load()
    const opened = await openPptx(bytes)
    const element = opened.deck.slides[0]!.elements.find((item) => item.type === 'text')!
    const edited = await applyPptxOpsOnHost({
      documentId: 'pptx-1',
      bytes,
      expectedVersion: 0,
      ops: [
        {
          op: 'setText',
          target: { slide: 0, el: elementDurableId(element)! },
          paragraphs: [{ runs: [{ text: '尚未保存的复制内容' }] }],
        },
      ],
    })
    const copied = await apply(edited.bytes, 1, {
      kind: 'copy_elements',
      slide: 0,
      elementIds: [elementDurableId(element)!],
    })
    expect(copied).toMatchObject({
      changed: false,
      version: 1,
      data: { kind: 'elements', count: 1 },
    })
    expect(copied.bytes).toBe(edited.bytes)
    const ref = (copied.data as { ref: string }).ref
    const pasted = await apply(edited.bytes, 1, { kind: 'paste_elements', slide: 0, ref })
    expect(pasted).toMatchObject({ changed: true, version: 2 })
    const first = await openPptx(pasted.bytes)
    expect(first.deck.slides[0]!.elements.length).toBe(opened.deck.slides[0]!.elements.length + 1)
    const zip = await JSZip.loadAsync(pasted.bytes)
    expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain('尚未保存的复制内容')
    const again = await apply(pasted.bytes, 2, {
      kind: 'paste_elements',
      slide: 0,
      ref,
      dx: 381000,
      dy: 381000,
    })
    expect((await openPptx(again.bytes)).deck.slides[0]!.elements.length).toBe(
      opened.deck.slides[0]!.elements.length + 2,
    )
    const original = await JSZip.loadAsync(bytes),
      saved = await JSZip.loadAsync(again.bytes)
    for (const path of Object.keys(original.files).filter((entry) =>
      entry.startsWith('ppt/theme/'),
    ))
      expect(await saved.file(path)!.async('uint8array')).toEqual(
        await original.file(path)!.async('uint8array'),
      )
  })
  it('cuts a native picture, pastes its relationship and media back, then copies a full slide with source resources', async () => {
    const bytes = load('image-deck.pptx'),
      opened = await openPptx(bytes)
    const picture = opened.deck.slides[0]!.elements.find((item) => item.type === 'picture')!
    const cut = await apply(bytes, 0, {
      kind: 'cut_elements',
      slide: 0,
      elementIds: [elementDurableId(picture)!],
    })
    expect(
      (await openPptx(cut.bytes)).deck.slides[0]!.elements.some((item) => item.type === 'picture'),
    ).toBe(false)
    const pasted = await apply(cut.bytes, 1, {
      kind: 'paste_elements',
      slide: 0,
      ref: (cut.data as { ref: string }).ref,
    })
    expect(
      (await openPptx(pasted.bytes)).deck.slides[0]!.elements.some(
        (item) => item.type === 'picture',
      ),
    ).toBe(true)
    const original = await JSZip.loadAsync(bytes),
      current = await JSZip.loadAsync(pasted.bytes)
    expect(await current.file('ppt/media/image1.png')!.async('uint8array')).toEqual(
      await original.file('ppt/media/image1.png')!.async('uint8array'),
    )
    const slide = await apply(pasted.bytes, 2, { kind: 'copy_slide', slide: 0 })
    const inserted = await apply(pasted.bytes, 2, {
      kind: 'paste_slide',
      afterIndex: 0,
      ref: (slide.data as { ref: string }).ref,
      keepSourceFormatting: true,
    })
    const final = await openPptx(inserted.bytes)
    expect(final.deck.slides).toHaveLength(opened.deck.slides.length + 1)
    expect(final.deck.slides[1]!.elements.some((item) => item.type === 'picture')).toBe(true)
    expect(inserted.data).toMatchObject({ slideIndex: 1 })
  })
  it('rejects raw XML, invalid or expired refs, mixed types, duplicate elements and cutting the last slide', async () => {
    const bytes = load('image-deck.pptx'),
      opened = await openPptx(bytes),
      el = elementDurableId(opened.deck.slides[0]!.elements[0]!)!
    await expect(
      apply(bytes, 0, {
        kind: 'paste_elements',
        slide: 0,
        ref: randomUUID(),
        items: [{ xml: '<p:sp/>' }],
      }),
    ).rejects.toThrow(/Unrecognized key/)
    await expect(
      apply(bytes, 0, { kind: 'paste_elements', slide: 0, ref: randomUUID() }),
    ).rejects.toThrow('过期')
    await expect(
      apply(bytes, 0, { kind: 'copy_elements', slide: 0, elementIds: [el, el] }),
    ).rejects.toThrow('重复')
    await expect(apply(bytes, 0, { kind: 'cut_slide', slide: 0 })).rejects.toThrow('至少保留')
    const copied = await apply(bytes, 0, { kind: 'copy_slide', slide: 0 }),
      ref = (copied.data as { ref: string }).ref
    await expect(apply(bytes, 0, { kind: 'paste_elements', slide: 0, ref })).rejects.toThrow(
      '复制的是幻灯片',
    )
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 16 * 60 * 1000)
    try {
      await expect(apply(bytes, 0, { kind: 'paste_slide', afterIndex: 0, ref })).rejects.toThrow(
        '过期',
      )
    } finally {
      vi.restoreAllMocks()
    }
  })
})
