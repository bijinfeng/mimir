// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Editor } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { editorExtensions } from '../../vendor/apps/docs/src/renderer/editor/extensions.js'
import { openDocx } from '../docx.js'
import { createDocxAgentHandle } from '../agent/docx-agent.js'
import {
  applyDocxImageDraft,
  assertDocxImageTarget,
  decodeDocxImage,
  docxImageDraft,
  processDocxImage,
  resizeDocxImage,
  selectedDocxImage,
} from './docx-image.js'

const FIXTURE = join(
  import.meta.dirname,
  '../../vendor/apps/docs/tests/pagination-corpus/docx/kitchen-sink.docx',
)
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNioAAAAASUVORK5CYII='
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
})
async function setup(bytes: Uint8Array = new Uint8Array(readFileSync(FIXTURE))) {
  const session = await openDocx(bytes)
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: session.content as never,
  })
  let imagePos = -1
  editor.state.doc.forEach((node, pos) => {
    if (imagePos < 0 && node.attrs.blockType === 'image') imagePos = pos
  })
  expect(imagePos).toBeGreaterThanOrEqual(0)
  editor.commands.setNodeSelection(imagePos)
  cleanup.push(() => editor.destroy())
  return { session, editor, bytes, target: selectedDocxImage(editor)! }
}
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.keys(zip.files).map(async (name) => [
        name,
        await zip.files[name]!.async('uint8array'),
      ]),
    ),
  )
}
function image(session: Awaited<ReturnType<typeof openDocx>>) {
  return session.blocks.find((block) => block.type === 'image')!
}

describe('DOCX manual native image adapter', () => {
  it('requires a real image NodeSelection, rejects stale/deleted/closed targets without mutation', async () => {
    const { editor, target } = await setup()
    expect(target.node.attrs.blockType).toBe('image')
    editor.commands.setTextSelection(1)
    expect(selectedDocxImage(editor)).toBeNull()
    expect(() => assertDocxImageTarget(editor, target)).not.toThrow()
    editor.commands.insertContent('new edit')
    const afterEdit = editor.getJSON()
    expect(() =>
      applyDocxImageDraft(editor, target, { ...docxImageDraft(target), rotation: 90 }),
    ).toThrow('文档已变化')
    expect(editor.getJSON()).toEqual(afterEdit)
    editor.setEditable(false)
    expect(() => assertDocxImageTarget(editor, target)).toThrow('保护状态')
    editor.destroy()
    expect(() => assertDocxImageTarget(editor, target)).toThrow('文档已关闭')
  })

  it('resizes proportionally or independently and rejects invalid dimensions atomically', async () => {
    const { editor, target } = await setup()
    const draft = docxImageDraft(target)
    expect(resizeDocxImage(draft, 'width', draft.width * 2, true).height).toBe(draft.height * 2)
    expect(resizeDocxImage(draft, 'height', draft.height / 2, true).width).toBe(draft.width / 2)
    expect(resizeDocxImage(draft, 'width', 300, false).height).toBe(draft.height)
    for (const patch of [
      { width: 0 },
      { height: Number.NaN },
      { width: 4097 },
      { rotation: Infinity },
      { wrap: 'fake-wrap' },
      { replacement: 'data:image/webp;base64,AAAA' },
    ]) {
      expect(() => applyDocxImageDraft(editor, target, { ...draft, ...patch })).toThrow(/./)
      expect(editor.state.doc).toBe(target.doc)
    }
    expect(applyDocxImageDraft(editor, target, draft)).toBe(target)
  })

  it('saves dimensions/rotation/flips twice; undo/redo after save preserves all ZIP entries', async () => {
    const { editor, target, session, bytes } = await setup()
    const handle = createDocxAgentHandle(editor, 'native-picture', {
      session,
      saveOptions: { current: {} },
      isDirty: () => false,
      onDirtyChange: () => {},
    })
    cleanup.push(() => handle.dispose())
    const version = handle.getVersion()
    const next = applyDocxImageDraft(editor, target, {
      ...docxImageDraft(target),
      width: 123,
      height: 87,
      rotation: -90,
      flipH: true,
      flipV: true,
    })
    expect(handle.getVersion()).toBeGreaterThan(version)
    const first = await session.save(editor.getJSON() as never)
    const reopened = await openDocx(first)
    expect(image(reopened)).toMatchObject({
      imageWidthPx: 123,
      imageHeightPx: 87,
      imageRotDeg: 270,
      imageFlipH: true,
      imageFlipV: true,
    })
    const before = await entries(bytes)
    const saved = await entries(first)
    for (const name of Object.keys(before).filter((entry) => entry !== 'word/document.xml'))
      expect(saved[name]).toEqual(before[name])
    const xml = await (await JSZip.loadAsync(first)).file('word/document.xml')!.async('string')
    for (const sibling of session.blocks.filter(
      (block) => block.type !== 'image' && block.originalXml,
    ))
      expect(xml).toContain(sibling.originalXml)
    const secondTarget = applyDocxImageDraft(editor, next, {
      ...docxImageDraft(next),
      rotation: 0,
      flipH: false,
      width: 150,
    })
    const second = await session.save(editor.getJSON() as never)
    const secondImage = image(await openDocx(second))
    expect(secondImage).toMatchObject({ imageWidthPx: 150, imageHeightPx: 87, imageFlipV: true })
    expect(secondImage.imageRotDeg ?? 0).toBe(0)
    expect(!!secondImage.imageFlipH).toBe(false)
    expect(editor.commands.undo()).toBe(true)
    expect(await entries(await session.save(editor.getJSON() as never))).toEqual(saved)
    expect(editor.commands.redo()).toBe(true)
    expect(await entries(await session.save(editor.getJSON() as never))).toEqual(
      await entries(second),
    )
    expect(editor.state.doc.nodeAt(secondTarget.pos)?.attrs.imageRotDeg).toBeNull()
  })

  it('replacement preserves original drawing identity, clears old crop, and persists new native payload', async () => {
    const { editor, target, session, bytes } = await setup()
    const original = target.node.attrs
    const next = applyDocxImageDraft(editor, target, {
      ...docxImageDraft(target),
      replacement: PNG,
      width: 120,
      height: 120,
      rotation: 90,
    })
    expect(next.node.attrs).toMatchObject({
      docxIndex: original.docxIndex,
      imageCrop: null,
      imageFillRect: null,
      imageReplace: { mime: 'image/png' },
    })
    const first = await session.save(editor.getJSON() as never)
    const reopened = await openDocx(first)
    expect(image(reopened)).toMatchObject({
      imageWidthPx: 120,
      imageHeightPx: 120,
      imageRotDeg: 90,
    })
    const preview = (reopened.content.content as Array<{ attrs?: Record<string, unknown> }>).find(
      (item) => item.attrs?.blockType === 'image',
    )!.attrs!.imageDataUrl
    expect(preview).toBe(PNG)
    const originalEntries = await entries(bytes)
    const replaced = await entries(first)
    const originalZip = await JSZip.loadAsync(bytes)
    const rid = /r:embed="([^"]+)"/.exec(
      session.blocks.find((block) => block.docxIndex === original.docxIndex)!.originalXml!,
    )![1]
    const relXml = await originalZip.file('word/_rels/document.xml.rels')!.async('string')
    const rel = relXml
      .match(/<Relationship\b[^>]*\/>/g)!
      .find((item) => item.includes(`Id="${rid}"`))!
    const originalMedia = `word/${/Target="([^"]+)"/.exec(rel)![1]}`
    expect(Object.keys(originalEntries)).toContain(originalMedia)
    for (const name of Object.keys(originalEntries)) {
      if (
        [
          'word/document.xml',
          'word/_rels/document.xml.rels',
          '[Content_Types].xml',
          originalMedia,
        ].includes(name)
      )
        continue
      expect(replaced[name]).toEqual(originalEntries[name])
    }
    applyDocxImageDraft(editor, next, { ...docxImageDraft(next), flipV: true })
    const second = await session.save(editor.getJSON() as never)
    expect(image(await openDocx(second))).toMatchObject({ imageRotDeg: 90, imageFlipV: true })
    expect((await openDocx(second)).content.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ attrs: expect.objectContaining({ imageDataUrl: PNG }) }),
      ]),
    )
    editor.commands.undo()
    expect(await entries(await session.save(editor.getJSON() as never))).toEqual(replaced)
  })

  it('a protection filter rejecting the image transaction returns an error and does not create history or a fake target', async () => {
    const { editor, target, session, bytes } = await setup()
    const rejectImage = new Plugin({ filterTransaction: (tr) => !tr.docChanged })
    editor.registerPlugin(rejectImage)
    expect(() =>
      applyDocxImageDraft(editor, target, { ...docxImageDraft(target), rotation: 90 }),
    ).toThrow('未被编辑器接受')
    expect(editor.state.doc).toBe(target.doc)
    expect(editor.commands.undo()).toBe(false)
    expect(await session.save(editor.getJSON() as never)).toEqual(bytes)
  })

  it.each(['inline', 'front'])(
    'native %s crop replacement preserves transform and every unrelated ZIP payload through save/undo/redo',
    async (wrap) => {
      const zip = await JSZip.loadAsync(new Uint8Array(readFileSync(FIXTURE)))
      let xml = await zip.file('word/document.xml')!.async('string')
      xml = xml.replace(
        '</pic:blipFill>',
        '<a:srcRect l="10000" t="5000" r="15000" b="20000"/></pic:blipFill>',
      )
      xml = xml.replace(
        '</pic:pic>',
        '<pic:spPr><a:xfrm rot="1800000" flipH="1" data-crop-qa="keep"><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm></pic:spPr></pic:pic>',
      )
      if (wrap === 'front')
        xml = xml
          .replace(
            '<wp:inline>',
            '<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251658240" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="margin"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>',
          )
          .replace('</wp:inline>', '<wp:wrapNone/></wp:anchor>')
      zip.file('word/document.xml', xml)
      zip.file('customXml/crop-sentinel.xml', '<sentinel keep="true">中文</sentinel>')
      const source = await zip.generateAsync({ type: 'uint8array' })
      const { editor, target, session } = await setup(source)
      expect(target.node.attrs).toMatchObject({
        imageCrop: { l: 0.1, t: 0.05, r: 0.15, b: 0.2 },
        imageRotDeg: 30,
        imageFlipH: true,
      })
      const originalWrap = target.node.attrs.imageWrap
      const next = applyDocxImageDraft(editor, target, {
        ...docxImageDraft(target),
        replacement: PNG,
        height: 64,
      })
      expect(next.node.attrs).toMatchObject({
        imageCrop: null,
        imageFillRect: null,
        imageRotDeg: 30,
        imageFlipH: true,
        imageWrap: originalWrap,
      })
      const first = await session.save(editor.getJSON() as never)
      const reopened = await openDocx(first)
      expect(image(reopened)).toMatchObject({
        imageWidthPx: 96,
        imageHeightPx: 64,
        imageRotDeg: 30,
        imageFlipH: true,
      })
      expect(image(reopened).imageCrop).toBeUndefined()
      const firstEntries = await entries(first)
      const sourceEntries = await entries(source)
      for (const name of Object.keys(sourceEntries)) {
        if (
          [
            'word/document.xml',
            'word/_rels/document.xml.rels',
            '[Content_Types].xml',
            'word/media/image1.png',
          ].includes(name)
        )
          continue
        expect(firstEntries[name]).toEqual(sourceEntries[name])
      }
      expect(new TextDecoder().decode(firstEntries['word/document.xml'])).toContain(
        'data-crop-qa="keep"',
      )
      expect(await entries(await session.save(editor.getJSON() as never))).toEqual(firstEntries)
      editor.commands.undo()
      expect(await session.save(editor.getJSON() as never)).toEqual(source)
      editor.commands.redo()
      expect(await entries(await session.save(editor.getJSON() as never))).toEqual(firstEntries)
    },
  )

  it('new unsaved pictures update genImage and retain flip/rotation on reopen', async () => {
    const { editor, session } = await setup()
    const pos = editor.state.doc.content.size
    editor.commands.insertContentAt(pos, {
      type: 'docProtected',
      attrs: {
        blockType: 'image',
        imageDataUrl: PNG,
        imageWidthPx: 90,
        imageHeightPx: 90,
        genImage: { mime: 'image/png', base64: PNG.split(',')[1], widthPx: 90, heightPx: 90 },
      },
    })
    editor.commands.setNodeSelection(pos)
    const target = selectedDocxImage(editor)!
    const next = applyDocxImageDraft(editor, target, {
      ...docxImageDraft(target),
      width: 80,
      height: 50,
      replacement: PNG,
      rotation: 37,
      flipH: true,
    })
    expect(next.node.attrs.genImage).toMatchObject({ widthPx: 80, heightPx: 50 })
    const result = await openDocx(await session.save(editor.getJSON() as never))
    expect(result.blocks.findLast((block) => block.type === 'image')).toMatchObject({
      imageWidthPx: 80,
      imageHeightPx: 50,
      imageRotDeg: 37,
      imageFlipH: true,
    })
  })

  it('replacing one image keeps a shared original media resource and untouched sibling drawing', async () => {
    const originalBytes = new Uint8Array(readFileSync(FIXTURE))
    const originalSession = await openDocx(originalBytes)
    const originalBlock = originalSession.blocks.find((block) => block.type === 'image')!
    const zip = await JSZip.loadAsync(originalBytes)
    const xml = await zip.file('word/document.xml')!.async('string')
    zip.file(
      'word/document.xml',
      xml.replace(
        originalBlock.originalXml!,
        `${originalBlock.originalXml}${originalBlock.originalXml}`,
      ),
    )
    const { editor, target, session, bytes } = await setup(
      await zip.generateAsync({ type: 'uint8array' }),
    )
    const pictures = session.blocks.filter((block) => block.type === 'image')
    expect(pictures).toHaveLength(2)
    const originalPreview = target.node.attrs.imageDataUrl
    applyDocxImageDraft(editor, target, {
      ...docxImageDraft(target),
      replacement: PNG,
      rotation: 90,
    })
    const savedBytes = await session.save(editor.getJSON() as never)
    const reopened = await openDocx(savedBytes)
    const reopenedPictures = reopened.content.content!.filter(
      (node) => (node.attrs as Record<string, unknown>)?.blockType === 'image',
    )
    expect((reopenedPictures[0]!.attrs as Record<string, unknown>).imageDataUrl).toBe(PNG)
    expect((reopenedPictures[1]!.attrs as Record<string, unknown>).imageDataUrl).toBe(
      originalPreview,
    )
    const savedXml = await (
      await JSZip.loadAsync(savedBytes)
    )
      .file('word/document.xml')!
      .async('string')
    expect(savedXml).toContain(pictures[1]!.originalXml)
    const before = await entries(bytes)
    const after = await entries(savedBytes)
    for (const name of Object.keys(before).filter(
      (entry) =>
        !['word/document.xml', 'word/_rels/document.xml.rels', '[Content_Types].xml'].includes(
          entry,
        ),
    ))
      expect(after[name]).toEqual(before[name])
    editor.commands.undo()
    expect(await session.save(editor.getJSON() as never)).toEqual(bytes)
  })
})

function canvasStub() {
  const context = {
    drawImage: vi.fn<(...args: unknown[]) => void>(),
    getImageData: vi.fn<() => { data: Uint8ClampedArray; width: number; height: number }>(() => ({
      data: new Uint8ClampedArray([
        255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      ]),
      width: 2,
      height: 2,
    })),
    createImageData: vi.fn<
      (width: number, height: number) => { data: Uint8ClampedArray; width: number; height: number }
    >((width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height })),
    putImageData: vi.fn<(pixels: { data: Uint8ClampedArray }, x: number, y: number) => void>(),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(PNG)
  return context
}
function decodePending(width = 2, height = 2) {
  let pending: HTMLImageElement | null = null
  vi.spyOn(globalThis, 'Image').mockImplementation(function () {
    pending = document.createElement('img')
    Object.defineProperties(pending, {
      naturalWidth: { value: width },
      naturalHeight: { value: height },
      src: { value: '', writable: true },
    })
    return pending
  } as never)
  return () => pending!
}
describe('DOCX image pixel preview cancellation and output', () => {
  it('crop uses real source pixels and cutout changes alpha with upstream flood fill', async () => {
    const ctx = canvasStub()
    const pending = decodePending()
    const crop = processDocxImage(
      PNG,
      { kind: 'crop', insets: { left: 50, top: 0, right: 0, bottom: 0 } },
      new AbortController().signal,
    )
    pending().dispatchEvent(new Event('load'))
    expect(await crop).toEqual({ dataUrl: PNG, width: 1, height: 2 })
    expect(ctx.drawImage).toHaveBeenLastCalledWith(pending(), 1, 0, 1, 2, 0, 0, 1, 2)
    const cutout = processDocxImage(
      PNG,
      { kind: 'cutout', tolerance: 0 },
      new AbortController().signal,
    )
    pending().dispatchEvent(new Event('load'))
    await cutout
    expect(ctx.putImageData).toHaveBeenCalled()
    expect(ctx.putImageData.mock.calls[0]![0].data[3]).toBe(0)
  })
  it.each(['image/png', 'image/jpeg', 'image/gif'])(
    'full-resolution %s cropping selects exact lower-right pixels and retains PNG encoding contract',
    async (mime) => {
      const ctx = canvasStub()
      const pending = decodePending(240, 160)
      const crop = processDocxImage(
        PNG.replace('image/png', mime),
        { kind: 'crop', insets: { left: 50, top: 50, right: 0, bottom: 0 } },
        new AbortController().signal,
      )
      pending().dispatchEvent(new Event('load'))
      expect(await crop).toEqual({ dataUrl: PNG, width: 120, height: 80 })
      expect(ctx.drawImage).toHaveBeenLastCalledWith(pending(), 120, 80, 120, 80, 0, 0, 120, 80)
      expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/png')
    },
  )
  it('decode cancellation, invalid crop, malformed input and decode failure do not create output', async () => {
    const ctx = canvasStub()
    const pending = decodePending()
    const controller = new AbortController()
    const loading = decodeDocxImage(PNG, controller.signal)
    controller.abort()
    await expect(loading).rejects.toThrow('取消')
    const invalid = processDocxImage(
      PNG,
      { kind: 'crop', insets: { left: 90, right: 20, top: 0, bottom: 0 } },
      new AbortController().signal,
    )
    pending().dispatchEvent(new Event('load'))
    await expect(invalid).rejects.toThrow('保留')
    await expect(
      processDocxImage(
        'file:///secret',
        { kind: 'cutout', tolerance: 30 },
        new AbortController().signal,
      ),
    ).rejects.toThrow('只支持')
    const failed = decodeDocxImage(PNG, new AbortController().signal)
    pending().dispatchEvent(new Event('error'))
    await expect(failed).rejects.toThrow('无法解码')
    expect(ctx.drawImage).not.toHaveBeenCalled()
  })
})
