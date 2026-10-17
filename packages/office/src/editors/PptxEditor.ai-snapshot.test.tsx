/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { PptxEditor } from './PptxEditor.js'
import * as output from '../pptx-output.js'
import type { PptxAiSnapshotDraft } from './pptx-ai-snapshot.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.restoreAllMocks()
})
const bytes = new Uint8Array(
  readFileSync(
    resolvePath(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures/title-layout.pptx'),
  ),
)
function png(width: number, height: number) {
  const result = new Uint8Array(58)
  result.set([137, 80, 78, 71, 13, 10, 26, 10])
  const view = new DataView(result.buffer)
  view.setUint32(8, 13)
  result.set(new TextEncoder().encode('IHDR'), 12)
  view.setUint32(16, width)
  view.setUint32(20, height)
  view.setUint32(33, 1)
  result.set(new TextEncoder().encode('IDAT'), 37)
  result.set(new TextEncoder().encode('IEND'), 50)
  return result
}
async function waitFor(condition: () => boolean) {
  const end = Date.now() + 5000
  while (!condition()) {
    if (Date.now() > end) throw new Error('截图编辑器状态未就绪')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
}
async function setup() {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const drafts: PptxAiSnapshotDraft[] = []
  const dirty = vi.fn<(changed: boolean) => void>()
  const save = vi.fn<(next: Uint8Array) => Promise<void>>(async () => {})
  const io = { load: async () => bytes, save }
  const props = {
    documentId: 'doc-1',
    io,
    onDirtyChange: dirty,
    onAiSnapshotDraft: (draft: PptxAiSnapshotDraft) => drafts.push(draft),
  }
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () => root.render(<PptxEditor {...props} />))
  cleanups.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  await waitFor(() => Boolean(host.querySelector('.mimir-pptx-slide svg')))
  const click = async (label: string) => {
    const button = host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)
    if (!button) throw new Error(`Missing ${label}`)
    await act(async () => button.click())
  }
  return {
    host,
    drafts,
    dirty,
    save,
    click,
    changeDocument: async () =>
      act(async () => root.render(<PptxEditor {...props} documentId="doc-2" />)),
  }
}
it('prepares an actual renderer PNG without saving or changing dirty state and invalidates its source on replacement', async () => {
  const rasterize = vi
    .spyOn(output, 'rasterizePptxSvg')
    .mockImplementation(async (svg, width, height) => {
      expect(svg).toContain('<svg')
      return png(Math.round(width), Math.round(height))
    })
  const editor = await setup()
  await editor.click('美化本页')
  await waitFor(() => editor.drafts.length === 1)
  expect(rasterize).toHaveBeenCalledOnce()
  expect(editor.drafts[0]!.target).toMatchObject({ documentId: 'doc-1', slideIndex: 0, version: 0 })
  expect(editor.drafts[0]!.sourceIsCurrent()).toBe(true)
  expect(editor.save).not.toHaveBeenCalled()
  expect(editor.dirty.mock.calls.flat()).not.toContain(true)
  await editor.changeDocument()
  expect(editor.drafts[0]!.sourceIsCurrent()).toBe(false)
})
it.each(['Escape', 'button'])(
  'cancels pending capture by %s and ignores late output',
  async (cancel) => {
    let finish: (() => void) | undefined
    vi.spyOn(output, 'rasterizePptxSvg').mockImplementation(
      (_svg, width, height) =>
        new Promise((resolve) => {
          finish = () => resolve(png(Math.round(width), Math.round(height)))
        }),
    )
    const editor = await setup()
    await editor.click('美化本页')
    expect(editor.host.querySelector('[aria-label="取消准备美化草稿"]')).not.toBeNull()
    if (cancel === 'button') await editor.click('取消准备美化草稿')
    else
      await act(async () =>
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        ),
      )
    await waitFor(() => !editor.host.querySelector('[aria-label="取消准备美化草稿"]'))
    await act(async () => finish?.())
    expect(editor.drafts).toHaveLength(0)
    expect(editor.save).not.toHaveBeenCalled()
  },
)
