import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { Hono } from 'hono'
import { conversationsRoute } from '../routes/conversations.js'
import { describe, expect, it, vi } from 'vitest'
vi.mock('../services/documents.js', () => ({
  getDocument: async (id: string) =>
    id === 'ink-doc'
      ? {
          id,
          kind: 'file',
          mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          fileExtension: 'pptx',
        }
      : null,
}))
import { applyPptxOpsOnHost } from '../services/pptx-agent-host.js'
import { openPptxForEdit } from '../../../../packages/office/src/pptx.js'
import { createPptxAgentHandle } from '../../../../packages/office/src/agent/pptx-agent.js'
import { renderSlide } from '../../../../packages/office/src/pptx-render.js'
import {
  decodeInkPayload,
  inkNodesOf,
  INK_NAME_PREFIX,
} from '../../../../packages/office/src/pptx-ink.js'
import type { PptxManualInk } from '@mimir/shared'
const load = () =>
  new Uint8Array(
    readFileSync(
      new URL('../../../../packages/office/tests/fixtures/image-deck.pptx', import.meta.url),
    ),
  )
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X9WQAAAAASUVORK5CYII='
const stroke = {
  tool: 'highlighter' as const,
  color: 'FFFF00',
  width: 10,
  points: [
    { x: 100, y: 100 },
    { x: 160, y: 125 },
    { x: 180, y: 110 },
  ],
}
const add: PptxManualInk = { kind: 'add', slide: 0, fitWidthPx: 960, stroke, png }
const apply = (bytes: Uint8Array, version: number, input: PptxManualInk, signal?: AbortSignal) =>
  applyPptxOpsOnHost({
    documentId: 'ink-doc',
    bytes,
    expectedVersion: version,
    action: 'manual_ink',
    ops: [input],
    signal,
  })
async function nativePictures(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes),
    xml = await zip.file('ppt/slides/slide1.xml')!.async('string')
  return { zip, xml, pics: xml.match(/<p:pic\b[\s\S]*?<\/p:pic>/g) ?? [] }
}
describe('PPTX ink native adapter', () => {
  it('writes native picture media/relative vector metadata and preserves it through two saves and reopen', async () => {
    const input = load(),
      original = await nativePictures(input)
    const output = await apply(input, 0, add)
    expect(output).toMatchObject({ changed: true, version: 1 })
    const native = await nativePictures(output.bytes)
    expect(native.pics).toHaveLength(original.pics.length + 1)
    const own = native.pics.find((p) => p.includes(`name="${INK_NAME_PREFIX}`))!
    const descr = /descr="([^"]*)"/
      .exec(own)![1]!
      .replaceAll('&quot;', '"')
      .replaceAll('&amp;', '&')
    expect(JSON.parse(descr)).toEqual({
      v: 1,
      tool: 'highlighter',
      color: 'FFFF00',
      width: 10,
      points: [
        [6, 6],
        [66, 31],
        [86, 16],
      ],
    })
    expect(own).toContain(
      `x="${Math.round(94 * (Number(/<p:sldSz[^>]*cx="(\d+)"/.exec(await original.zip.file('ppt/presentation.xml')!.async('string'))![1]) / 960))}"`,
    )
    expect(own).toMatch(/<a:blip[^>]*r:embed="[^"]+"/)
    const session = await openPptxForEdit(output.bytes)
    await session.save()
    session.commit()
    const saved2 = await session.save()
    const reopened = await openPptxForEdit(saved2),
      tree = renderSlide(reopened, 0, { fitWidthPx: 960 })!.tree
    expect(inkNodesOf(tree)).toHaveLength(1)
    expect(decodeInkPayload(inkNodesOf(tree)[0]!.node.descr!)).toMatchObject({
      tool: 'highlighter',
      color: 'FFFF00',
      width: 10,
    })
    const final = await nativePictures(saved2)
    expect(final.pics[0]).toEqual(original.pics[0])
    expect(await final.zip.file('ppt/theme/theme1.xml')!.async('string')).toBe(
      await original.zip.file('ppt/theme/theme1.xml')!.async('string'),
    )
  })
  it('erases only decoded own strokes, clears current page, preserves ordinary pictures, and refuses a mixed invalid batch atomically', async () => {
    const first = await apply(load(), 0, add),
      session = await openPptxForEdit(first.bytes)
    const ink = inkNodesOf(renderSlide(session, 0, { fitWidthPx: 960 })!.tree)[0]!.node
    const ordinary = session
      .slides()[0]!
      .elements.find((e) => e.type === 'picture' && !e.name?.startsWith(INK_NAME_PREFIX))!
    await expect(
      apply(first.bytes, 1, { kind: 'erase', slide: 0, ids: [ink.durableId!, ordinary.id] }),
    ).rejects.toThrow(/只能擦除/)
    expect(inkNodesOf(renderSlide(session, 0, { fitWidthPx: 960 })!.tree)).toHaveLength(1)
    const erased = await apply(first.bytes, 1, { kind: 'erase', slide: 0, ids: [ink.durableId!] })
    expect((await nativePictures(erased.bytes)).pics).toHaveLength(1)
    const second = await apply(first.bytes, 1, {
      ...add,
      stroke: { ...stroke, tool: 'pen', color: '0070C0', width: 3.5 },
    })
    expect((await nativePictures(second.bytes)).pics).toHaveLength(3)
    const cleared = await apply(second.bytes, 2, { kind: 'clear', slide: 0 })
    expect((await nativePictures(cleared.bytes)).pics).toHaveLength(1)
    const noop = await apply(cleared.bytes, 3, { kind: 'clear', slide: 0 })
    expect(noop).toMatchObject({ changed: false, version: 3 })
  })
  it('shares the live Agent version/history path and rejects stale/cancelled writes', async () => {
    const session = await openPptxForEdit(load())
    const handle = createPptxAgentHandle(
      session,
      'ink-doc',
      () => ({ slideIndex: 0, elementId: null }),
      () => {},
      applyPptxOpsOnHost,
    )
    expect(
      await handle.execute('manual_ink', add, { expectedVersion: 0, roundId: 'pen-1' }),
    ).toMatchObject({ ok: true, changed: true, version: 1 })
    expect(inkNodesOf(renderSlide(session, 0, { fitWidthPx: 960 })!.tree)).toHaveLength(1)
    expect(await handle.execute('manual_ink', add, { expectedVersion: 0 })).toMatchObject({
      ok: false,
    })
    expect(handle.undoRound('pen-1')).toBe(true)
    expect(inkNodesOf(renderSlide(session, 0, { fitWidthPx: 960 })!.tree)).toHaveLength(0)
    const controller = new AbortController()
    controller.abort()
    expect(
      await handle.execute('manual_ink', add, {
        expectedVersion: session.version(),
        signal: controller.signal,
      }),
    ).toMatchObject({ ok: false })
    handle.dispose()
  })
  it('clears only the active page and accepts the dedicated action through the authenticated route contract', async () => {
    const first = await apply(load(), 0, add)
    const duplicate = await applyPptxOpsOnHost({
      documentId: 'ink-doc',
      bytes: first.bytes,
      expectedVersion: 1,
      ops: [{ op: 'duplicateSlide', target: { slide: 0 } }],
    })
    const cleared = await apply(duplicate.bytes, 2, { kind: 'clear', slide: 0 })
    const session = await openPptxForEdit(cleared.bytes)
    expect(inkNodesOf(renderSlide(session, 0, { fitWidthPx: 960 })!.tree)).toHaveLength(0)
    expect(inkNodesOf(renderSlide(session, 1, { fitWidthPx: 960 })!.tree)).toHaveLength(1)
    const form = new FormData()
    form.set('file', new File([load()], 'current.pptx'))
    form.set('documentId', 'ink-doc')
    form.set('expectedVersion', '0')
    form.set('action', 'manual_ink')
    form.set('ops', JSON.stringify([add]))
    const app = new Hono().route('/', conversationsRoute)
    const response = await app.request('/pptx-agent/apply-ops', { method: 'POST', body: form })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ version: 1, changed: true })
  })
  it('refuses missing authorization, malformed payload/PNG, stale page and raw non-model picture op', async () => {
    await expect(
      applyPptxOpsOnHost({
        documentId: 'missing',
        bytes: load(),
        expectedVersion: 0,
        action: 'manual_ink',
        ops: [add],
      }),
    ).rejects.toThrow(/不存在/)
    await expect(apply(load(), 0, { ...add, slide: 99 })).rejects.toThrow(/页面已失效/)
    await expect(apply(load(), 0, { ...add, png: 'AAAA' })).rejects.toThrow(/图片/)
    await expect(
      apply(load(), 0, { ...add, stroke: { ...stroke, width: Infinity } }),
    ).rejects.toThrow(/finite|number|invalid|Invalid/)
    await expect(
      applyPptxOpsOnHost({
        documentId: 'ink-doc',
        bytes: load(),
        expectedVersion: 0,
        ops: [{ op: 'addPicture', target: { slide: 0 }, bytes: [], ext: 'png' }],
      }),
    ).rejects.toThrow(/不对 Agent开放|不对 Agent 开放/)
  })
})
