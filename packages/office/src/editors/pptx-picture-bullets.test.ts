import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { expect, it, vi } from 'vitest'
import { createBlankPptx } from '../../vendor/packages/pptx-engine/src/blank.js'
import {
  openPptx,
  savePptx,
  groupChildSlices,
} from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn, type Op } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import { createPptxAgentHandle } from '../agent/pptx-agent.js'
import { openPptxForEdit } from '../pptx.js'
import { PptxHistory } from '../pptx-history.js'
import { pptxSelectionContexts, pptxSelectionFormatOps } from './pptx-selection.js'
import { preflightPptxPictureBullets } from '../../../../apps/server/src/services/pptx-picture-bullet.js'
vi.mock('../../../../apps/server/src/services/documents.js', () => ({
  getDocument: async () => ({
    kind: 'file',
    fileExtension: 'pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  }),
}))
vi.mock('../../../../apps/server/src/services/pptx-agent-services.js', () => ({
  applyPptxService: () => {
    throw new Error('Unexpected provider')
  },
}))
import { applyPptxOpsOnHost } from '../../../../apps/server/src/services/pptx-agent-host.js'

const picture = (ext: 'png' | 'jpg') =>
  new Uint8Array(
    readFileSync(new URL(`../../tests/fixtures/pptx-images/picture.${ext}`, import.meta.url)),
  )
async function source() {
  const opened = await openPptx(await createBlankPptx())
  expect(
    runTxn(opened, {
      isolation: 'atomic',
      ops: [0, 1, 2, 3, 4].map((n) => ({
        op: 'addElement',
        target: { slide: 0 },
        kind: 'rect',
        offset: { x: n * 1_000_000, y: 500000, cx: 900000, cy: 900000 },
        paragraphs: [
          { runs: [{ text: `Text${n}`, bold: !!n }] },
          { runs: [{ text: `Second${n}` }] },
        ],
        fill: '#EEEEEE',
      })),
    }).applied,
  ).toBe(true)
  const members = opened.deck.slides[0]!.elements.slice(2, 4)
  expect(
    runTxn(opened, {
      isolation: 'atomic',
      ops: [{ op: 'groupElements', target: { slide: 0 }, els: members.map((item) => item.id) }],
    }).applied,
  ).toBe(true)
  const zip = await JSZip.loadAsync(await savePptx(opened))
  const path = opened.deck.slides[0]!.path
  const xml = await zip.file(path)!.async('string')
  zip.file(
    path,
    xml.replace(
      /<a:p>/g,
      '<a:p><a:pPr defTabSz="777777" hangingPunct="0"><a:tabLst><a:tab pos="333" algn="ctr"/></a:tabLst><a:extLst><a:ext uri="opaque"><m:keep xmlns:m="urn:mimir"/></a:ext></a:extLst></a:pPr>',
    ),
  )
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  const session = await openPptxForEdit(bytes)
  return { bytes, session }
}
async function parts(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.entries(zip.files)
        .filter(([, entry]) => !entry.dir)
        .map(async ([path, entry]) => [path, Buffer.from(await entry.async('uint8array'))]),
    ),
  ) as Record<string, Buffer>
}
it.each(['png', 'jpg'] as const)(
  'publishes one native %s picture-bullet batch for top-level and immediate group members with exact saved history',
  async (ext) => {
    const { bytes, session } = await source()
    const baseline = await parts(bytes)
    const contexts = pptxSelectionContexts(session.slides()[0]!.elements)
    const group = contexts.find((item) => item.element.type === 'group')!
    const top = contexts
      .filter((item) => item.depth === 0 && item.element.type !== 'group')
      .slice(0, 2)
    const members = contexts.filter((item) => item.group === group.ref)
    const refs = [...top, ...members].map((item) => item.ref)
    const image = picture(ext)
    const ops = pptxSelectionFormatOps(session.slides()[0]!.elements, refs, 0, {
      paragraph: {
        bullet: 'blip',
        bulletImage: { ext, base64: Buffer.from(image).toString('base64') },
        bulletSizePct: 110,
      },
    })
    expect(ops).toHaveLength(4)
    let calls = 0,
      changes = 0
    const history = new PptxHistory(session)
    const handle = createPptxAgentHandle(
      session,
      'picture-bullets',
      () => ({ slideIndex: 0, elementId: null }),
      () => {
        changes++
        history.record()
      },
      async (request) => {
        calls++
        return applyPptxOpsOnHost(request)
      },
    )
    const version = session.version()
    expect(
      await handle.execute('apply_ops', { ops }, { expectedVersion: version, roundId: 'picture' }),
    ).toMatchObject({ ok: true, changed: true, version: version + 1 })
    expect([calls, changes]).toEqual([1, 1])
    const saved = await session.save()
    session.commit()
    history.synchronize()
    const after = await parts(saved)
    const reopened = await openPptxForEdit(saved)
    const read = pptxSelectionContexts(reopened.slides()[0]!.elements)
    for (const target of refs) {
      const context = read.find((item) => item.ref === target)!
      expect(context.element.type === 'shape' || context.element.type === 'text').toBe(true)
      if (context.element.type !== 'shape' && context.element.type !== 'text')
        throw new Error('Expected text')
      const native = context.group
        ? groupChildSlices(
            read.find((item) => item.ref === context.group)!.element.anchor.originalXml,
          ).find((slice) => slice.nvId === context.element.nvId)!.xml
        : context.element.anchor.originalXml
      for (const paragraph of context.element.text!.paragraphs) {
        expect(paragraph.bullet).toMatchObject({ type: 'blip', sizePct: 110 })
        const { mediaRef, blipEmbedId } = paragraph.bullet!
        expect(after[mediaRef!]).toEqual(Buffer.from(image))
        expect(after['ppt/slides/_rels/slide1.xml.rels']!.toString()).toContain(
          `Id="${blipEmbedId}"`,
        )
        expect(native).toContain(`r:embed="${blipEmbedId}"`)
      }
      expect(native).toContain('hangingPunct="0"')
      expect(native).toContain('<m:keep xmlns:m="urn:mimir"/>')
    }
    const untouched = contexts.find(
      (item) => item.depth === 0 && item.element.type !== 'group' && !refs.includes(item.ref),
    )!
    expect(read.find((item) => item.ref === untouched.ref)!.element.anchor.originalXml).toBe(
      untouched.element.anchor.originalXml,
    )
    for (const [path, value] of Object.entries(baseline).filter(
      ([entryPath]) =>
        ![
          'ppt/slides/slide1.xml',
          'ppt/slides/_rels/slide1.xml.rels',
          '[Content_Types].xml',
        ].includes(entryPath),
    ))
      expect(after[path]).toEqual(value)
    expect(await parts(await reopened.save())).toEqual(after)
    expect(history.undo()).toBe(true)
    expect(await parts(await session.save())).toEqual(baseline)
    session.commit()
    history.synchronize()
    expect(history.redo()).toBe(true)
    expect(await parts(await session.save())).toEqual(after)
    expect(history.undo()).toBe(true)
    expect(history.undo()).toBe(false)
  },
)
it('preflights every image and identity without native mutation, and refuses mixed unsupported selections', async () => {
  const { bytes, session } = await source()
  const elements = session.slides()[0]!.elements
  const contexts = pptxSelectionContexts(elements)
  const refs = contexts
    .filter((item) => item.depth === 0 && item.element.type !== 'group')
    .slice(0, 2)
    .map((item) => item.ref)
  const draft = {
    paragraph: {
      bullet: 'blip',
      bulletImage: { ext: 'png', base64: Buffer.from(picture('png')).toString('base64') },
    },
  }
  for (const invalid of [
    [...refs, 'missing'],
    [contexts.find((item) => item.element.type === 'group')!.ref, 'missing'],
  ])
    expect(() => pptxSelectionFormatOps(elements, invalid, 0, draft)).toThrow('图片符号须选择')
  const withoutText = structuredClone(elements)
  const first = withoutText[0]!
  if (first.type !== 'shape') throw new Error('Expected shape')
  first.text = undefined
  expect(() => pptxSelectionFormatOps(withoutText, refs, 0, draft)).toThrow('图片符号须选择')
  const ops = pptxSelectionFormatOps(elements, refs, 0, draft) as Op[]
  for (const corrupt of [
    { ...ops[1], target: { slide: 0, el: 'missing' } },
    {
      ...ops[1],
      format: {
        bullet: 'blip',
        bulletImage: { ext: 'jpg', base64: draft.paragraph.bulletImage.base64 },
      },
    },
    {
      ...ops[1],
      format: {
        bullet: 'blip',
        bulletImage: {
          ext: 'png',
          base64: Buffer.from(picture('png').subarray(0, 32)).toString('base64'),
        },
      },
    },
    { ...ops[1], format: { bullet: 'blip', bulletImage: { ext: 'png', base64: 'AAAA' } } },
  ]) {
    const opened = await openPptx(bytes)
    expect(() => preflightPptxPictureBullets(opened, [ops[0]!, corrupt] as Op[])).toThrow(
      /图片|image|PNG|JPEG/,
    )
    expect(await parts(await savePptx(opened))).toEqual(await parts(bytes))
    await expect(
      applyPptxOpsOnHost({
        documentId: 'picture-bullets',
        bytes,
        expectedVersion: 0,
        ops: [ops[0]!, corrupt],
      }),
    ).rejects.toThrow(/图片|image|PNG|JPEG/)
  }
})
it.each(['abort', 'version', 'dispose'] as const)(
  'rejects a valid late picture-bullet candidate after %s without a history entry',
  async (scenario) => {
    const { session } = await source()
    const elements = session.slides()[0]!.elements
    const refs = pptxSelectionContexts(elements)
      .filter((item) => item.depth === 0 && item.element.type !== 'group')
      .slice(0, 2)
      .map((item) => item.ref)
    const ops = pptxSelectionFormatOps(elements, refs, 0, {
      paragraph: {
        bullet: 'blip',
        bulletImage: { ext: 'png', base64: Buffer.from(picture('png')).toString('base64') },
      },
    })
    let release!: () => void, candidateReady!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const ready = new Promise<void>((resolve) => {
      candidateReady = resolve
    })
    const changed = vi.fn<() => void>()
    const history = new PptxHistory(session)
    const handle = createPptxAgentHandle(
      session,
      'picture-bullets',
      () => ({ slideIndex: 0, elementId: null }),
      changed,
      async (request) => {
        const candidate = await applyPptxOpsOnHost(request)
        candidateReady()
        await gate
        return candidate
      },
    )
    const controller = new AbortController(),
      version = session.version()
    const running = handle.execute(
      'apply_ops',
      { ops },
      { expectedVersion: version, signal: controller.signal },
    )
    await ready
    if (scenario === 'abort') controller.abort()
    if (scenario === 'dispose') handle.dispose()
    if (scenario === 'version')
      session.setText(0, elements[0]!.id, [{ runs: [{ text: 'New manual text' }] }])
    const current = await session.save(),
      currentVersion = session.version()
    release()
    expect(await running).toMatchObject({ ok: false, changed: false })
    expect(session.version()).toBe(currentVersion)
    expect(await parts(await session.save())).toEqual(await parts(current))
    expect(changed).not.toHaveBeenCalled()
    expect(history.undo()).toBe(false)
  },
)
