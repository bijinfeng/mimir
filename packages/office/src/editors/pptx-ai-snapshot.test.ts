import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import { openPptxForEdit, editableElements } from '../pptx.js'
import { preparePptxAiSnapshot } from './pptx-ai-snapshot.js'

function png(width: number, height: number) {
  const bytes = new Uint8Array(58)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13)
  bytes.set(new TextEncoder().encode('IHDR'), 12)
  view.setUint32(16, width)
  view.setUint32(20, height)
  view.setUint32(33, 1)
  bytes.set(new TextEncoder().encode('IDAT'), 37)
  bytes.set(new TextEncoder().encode('IEND'), 50)
  return bytes
}
async function setup() {
  const session = await openPptxForEdit(
    new Uint8Array(
      readFileSync(new URL('../../tests/fixtures/title-layout.pptx', import.meta.url)),
    ),
  )
  const target = {
    documentId: 'doc',
    slidePath: session.slides()[0]!.path,
    slideIndex: 0,
    version: session.version(),
  }
  return { session, target }
}
it('captures the actual unsaved render tree as a bounded PNG without changing the deck', async () => {
  const { session, target } = await setup()
  const element = editableElements(session.slides()[0]!)[0]!
  session.setText(0, element.id, [{ srcPara: 0, runs: [{ srcRun: 0, text: '未保存的截图文字' }] }])
  target.version = session.version()
  const rasterize = vi.fn<
    (svg: string, width: number, height: number) => Promise<Uint8Array<ArrayBuffer>>
  >(async (svg, width, height) => {
    expect(svg).toContain('未保存的截图文字')
    expect(width).toBe(1280)
    return png(Math.round(width), Math.round(height))
  })
  const draft = await preparePptxAiSnapshot(
    session,
    target,
    new AbortController().signal,
    () => true,
    rasterize,
  )
  expect(draft.target).toEqual(target)
  expect(draft.image.dataUrl).toMatch(/^data:image\/png;base64,iVBOR/)
  expect(draft.image.name).toMatch(/^第1页截图-.+\.png$/)
  expect(draft.text).toContain('已附准备指令时本页的静态截图')
  expect(session.version()).toBe(target.version)
  expect(rasterize).toHaveBeenCalledOnce()
})
it('rejects late output when the user changes page/version while PNG rendering is pending', async () => {
  const { session, target } = await setup()
  let current = true
  await expect(
    preparePptxAiSnapshot(
      session,
      target,
      new AbortController().signal,
      () => current,
      async (_svg, width, height) => {
        current = false
        return png(Math.round(width), Math.round(height))
      },
    ),
  ).rejects.toThrow('幻灯片已变化')
})
it('aborts a pending renderer and rejects an incorrectly sized PNG', async () => {
  const { session, target } = await setup()
  const abort = new AbortController()
  const pending = preparePptxAiSnapshot(
    session,
    target,
    abort.signal,
    () => true,
    () => new Promise(() => {}),
  )
  abort.abort()
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  await expect(
    preparePptxAiSnapshot(
      session,
      target,
      new AbortController().signal,
      () => true,
      async () => png(1, 1),
    ),
  ).rejects.toThrow('尺寸无效')
})
