import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { expect, it, vi } from 'vitest'

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
import { applyPptxOpsOnHost } from '../services/pptx-agent-host.js'
import { runPptxHostTxn } from '../services/pptx-group-flip.js'
import {
  elementDurableId,
  groupChildDurableId,
  groupChildSlices,
  openPptx,
  savePptx,
  type SlideElement,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import {
  runTxn,
  type Op,
} from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/index.js'
import {
  lookup,
  opNames,
} from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/registry.js'
import { openPptxForEdit } from '../../../../packages/office/src/pptx.js'
import {
  createPptxAgentHandle,
  type PptxHostApply,
} from '../../../../packages/office/src/agent/pptx-agent.js'
import { PptxHistory } from '../../../../packages/office/src/pptx-history.js'

const fixture = new URL(
  '../../../../packages/office/tests/fixtures/title-layout.pptx',
  import.meta.url,
)
const imageFixture = new URL(
  '../../../../packages/office/tests/fixtures/image-deck.pptx',
  import.meta.url,
)

async function groupedFixture() {
  const opened = await openPptx(new Uint8Array(readFileSync(fixture)))
  const images = await JSZip.loadAsync(readFileSync(imageFixture))
  expect(
    runTxn(opened, {
      ops: [
        ...['rect', 'textbox'].map((kind, index) => ({
          op: 'addElement',
          target: { slide: 0 },
          kind,
          offset: { x: 300000 + index * 1700000, y: 400000, cx: 1400000, cy: 900000 },
          paragraphs: [{ runs: [{ text: index ? 'Sibling' : 'Flipped' }] }],
        })),
        {
          op: 'addPicture',
          target: { slide: 0 },
          bytes: await images.file('ppt/media/image1.png')!.async('uint8array'),
          ext: 'png',
          offset: { x: 4000000, y: 600000, cx: 1200000, cy: 800000 },
        },
      ],
    }).applied,
  ).toBe(true)
  const refs = opened.deck.slides[0]!.elements.slice(-3).map((el) => elementDurableId(el)!)
  expect(
    runTxn(opened, {
      ops: [{ op: 'groupElements', target: { slide: 0 }, els: refs }],
    }).applied,
  ).toBe(true)
  const group = opened.deck.slides[0]!.elements.find((el) => el.type === 'group')!
  const member = groupChildSlices(group.anchor.originalXml)[0]!
  const parentXfrm =
    '<a:xfrm rot="2700000" flipH="1"><a:off x="1200000" y="700000"/><a:ext cx="6000000" cy="3000000"/><a:chOff x="200000" y="100000"/><a:chExt cx="4000000" cy="1500000"/></a:xfrm>'
  const xml = group.anchor.originalXml
    .replace(member.xml, member.xml.replace(/<a:xfrm[^>]*>/, '<a:xfrm rot="1800000" flipV="1">'))
    .replace(/(<p:grpSpPr>)\s*<a:xfrm[\s\S]*?<\/a:xfrm>/, `$1${parentXfrm}`)
  const zip = await JSZip.loadAsync(await savePptx(opened))
  const path = opened.deck.slides[0]!.path
  zip.file(path, (await zip.file(path)!.async('string')).replace(group.anchor.originalXml, xml))
  return zip.generateAsync({ type: 'uint8array' })
}
function groupOf(elements: SlideElement[]) {
  const group = elements.find((el) => el.type === 'group')
  if (!group || group.type !== 'group') throw new Error('Expected fixture group')
  return group
}
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((f) => !f.dir)
        .map(async (f) => [f.name, await f.async('uint8array')]),
    ),
  )
}
function center({ offset: b, rot, flipH, flipV }: SlideElement['transform']) {
  const angle = (((rot ?? 0) / 60000) * Math.PI) / 180
  const x = ((flipH ? -1 : 1) * b.cx) / 2
  const y = ((flipV ? -1 : 1) * b.cy) / 2
  return {
    x: b.x + (flipH ? b.cx : 0) + x * Math.cos(angle) - y * Math.sin(angle),
    y: b.y + (flipV ? b.cy : 0) + x * Math.sin(angle) + y * Math.cos(angle),
  }
}
const host = (request: Parameters<PptxHostApply>[0]) =>
  applyPptxOpsOnHost({ ...request, action: 'apply_ops' })

it.each([['h'], ['v'], ['h', 'v']] as const)(
  'persists bare grouped flips %j through actual Agent/host, two saves and history',
  async (...axes) => {
    const bytes = await groupedFixture()
    const session = await openPptxForEdit(bytes)
    const before = groupOf(session.slides()[0]!.elements)
    const group = elementDurableId(before)!
    const member = before.children[0]!
    const ref = groupChildDurableId(before, member)!
    const ops: Op[] = axes.map((axis) => ({
      op: 'flipElements',
      target: { slide: 0 },
      group,
      els: [ref],
      axis,
    }))
    const native = await openPptx(bytes)
    expect(runTxn(native, { ops: structuredClone(ops) }).applied).toBe(true)
    const expected = structuredClone(
      groupOf(native.deck.slides[0]!.elements).children[0]!.transform,
    )
    const history = new PptxHistory(session)
    const invoke = vi.fn<typeof host>(host)
    const handle = createPptxAgentHandle(
      session,
      'pptx-1',
      () => ({ slideIndex: 0, elementId: ref }),
      () => {},
      invoke,
    )
    expect(await handle.execute('apply_ops', { ops }, { roundId: 'flip' })).toMatchObject({
      ok: true,
      changed: true,
    })
    expect(invoke).toHaveBeenCalledTimes(1)
    const reply: Awaited<ReturnType<typeof host>> = await invoke.mock.results[0]!.value
    expect(reply.records.map((record) => record.op.op)).toEqual(axes.map(() => 'flipElements'))
    expect(reply.records.map((record) => record.after)).toEqual(axes.map(() => ({ flipped: 1 })))
    history.record()
    const saved = await session.save()
    session.commit()
    history.synchronize()
    expect(await entries(await session.save())).toEqual(await entries(saved))
    const after = groupOf((await openPptxForEdit(saved)).slides()[0]!.elements)
    expect(after.transform).toEqual(before.transform)
    expect(after.childOffset).toEqual(before.childOffset)
    expect(after.children[0]!.transform).toEqual(expected)
    expect(Math.abs(center(expected).x - center(member.transform).x)).toBeLessThan(1.01)
    expect(Math.abs(center(expected).y - center(member.transform).y)).toBeLessThan(1.01)
    expect(
      groupChildSlices(after.anchor.originalXml)
        .slice(1)
        .map((s) => s.xml),
    ).toEqual(
      groupChildSlices(before.anchor.originalXml)
        .slice(1)
        .map((s) => s.xml),
    )
    const originalEntries = await entries(bytes)
    const savedEntries = await entries(saved)
    for (const path of Object.keys(originalEntries).filter((p) => p !== 'ppt/slides/slide1.xml'))
      expect(savedEntries[path]).toEqual(originalEntries[path])
    expect(history.undo()).toBe(true)
    expect(await entries(await session.save())).toEqual(originalEntries)
    session.commit()
    history.synchronize()
    expect(history.redo()).toBe(true)
    expect(await entries(await session.save())).toEqual(savedEntries)
  },
)

it('flips direct shape, text and picture members together with unchanged native center semantics', async () => {
  const bytes = await groupedFixture()
  const opened = await openPptx(bytes)
  const before = groupOf(opened.deck.slides[0]!.elements)
  const ops: Op[] = ['h', 'v'].map((axis) => ({
    op: 'flipElements',
    target: { slide: 0 },
    group: elementDurableId(before),
    els: before.children.map((child) => groupChildDurableId(before, child)!),
    axis,
  }))
  const original = structuredClone(before.children.map((child) => child.transform))
  expect(runTxn(opened, { ops: structuredClone(ops) }).applied).toBe(true)
  const result = await host({ documentId: 'pptx-1', bytes, expectedVersion: 0, ops })
  const after = groupOf((await openPptx(result.bytes)).deck.slides[0]!.elements)
  expect(after.children.map((child) => child.transform)).toEqual(
    groupOf(opened.deck.slides[0]!.elements).children.map((child) => child.transform),
  )
  after.children.forEach((child, index) => {
    expect(Math.abs(center(child.transform).x - center(original[index]!).x)).toBeLessThan(1.01)
    expect(Math.abs(center(child.transform).y - center(original[index]!).y)).toBeLessThan(1.01)
  })
  expect(result.records.map((record) => record.after)).toEqual([{ flipped: 3 }, { flipped: 3 }])
})

it.each(['ungroupElement', 'duplicateSlide'])(
  'flushes before %s in the same atomic batch',
  async (operation) => {
    const bytes = await groupedFixture()
    const group = groupOf((await openPptx(bytes)).deck.slides[0]!.elements)
    const flip: Op = {
      op: 'flipElements',
      target: { slide: 0 },
      group: elementDurableId(group),
      els: [groupChildDurableId(group, group.children[0]!)!],
      axis: 'h',
    }
    const structural: Op = {
      op: operation,
      target: {
        slide: 0,
        ...(operation === 'ungroupElement' ? { el: elementDurableId(group)! } : {}),
      },
    }
    const combined = await host({
      documentId: 'pptx-1',
      bytes,
      expectedVersion: 0,
      ops: [flip, structural],
    })
    const flipped = await host({ documentId: 'pptx-1', bytes, expectedVersion: 0, ops: [flip] })
    const separated = await host({
      documentId: 'pptx-1',
      bytes: flipped.bytes,
      expectedVersion: 1,
      ops: [structural],
    })
    expect(await entries(combined.bytes)).toEqual(await entries(separated.bytes))
    const after = await openPptx(combined.bytes)
    const duplicated = operation === 'duplicateSlide'
    expect(after.deck.slides).toHaveLength(duplicated ? 2 : 1)
    expect(after.deck.slides[0]!.elements.some((el) => el.type === 'group')).toBe(duplicated)
    const flippedObjects = after.deck.slides.flatMap((slide) =>
      (duplicated ? groupOf(slide.elements).children : slide.elements).filter(
        (el) => el.transform.flipH,
      ),
    )
    expect(flippedObjects).toHaveLength(duplicated ? 2 : 1)
    expect(combined.records.map((record) => record.op.op)).toEqual(['flipElements', operation])
  },
)

it('keeps top-level native flips identical and restores registry after concurrent hosts and failure', async () => {
  const bytes = await groupedFixture()
  const originalDefinition = lookup('flipElements')
  const originalNames = opNames()
  const group = groupOf((await openPptx(bytes)).deck.slides[0]!.elements)
  const grouped: Op = {
    op: 'flipElements',
    target: { slide: 0 },
    group: elementDurableId(group),
    els: [groupChildDurableId(group, group.children[0]!)!],
    axis: 'h',
  }
  const top: Op = {
    op: 'flipElements',
    target: { slide: 0 },
    els: [elementDurableId(group)!],
    axis: 'v',
  }
  const native = await openPptx(bytes)
  expect(runTxn(native, { ops: [structuredClone(top)] }).applied).toBe(true)
  const [a, b, failure] = await Promise.allSettled([
    host({ documentId: 'pptx-1', bytes, expectedVersion: 0, ops: [grouped] }),
    host({ documentId: 'pptx-1', bytes, expectedVersion: 0, ops: [top] }),
    host({
      documentId: 'pptx-1',
      bytes,
      expectedVersion: 0,
      ops: [{ ...grouped, axis: 'invalid' }],
    }),
  ])
  expect(a.status).toBe('fulfilled')
  expect(b.status).toBe('fulfilled')
  expect(failure.status).toBe('rejected')
  if (b.status !== 'fulfilled') throw new Error('Expected top-level result')
  expect(await entries(b.value.bytes)).toEqual(await entries(await savePptx(native)))
  expect(lookup('flipElements')).toBe(originalDefinition)
  expect(opNames()).toEqual(originalNames)
  const afterFailure = await host({ documentId: 'pptx-1', bytes, expectedVersion: 0, ops: [top] })
  expect(await entries(afterFailure.bytes)).toEqual(await entries(b.value.bytes))
  expect(lookup('flipElements')).toBe(originalDefinition)
})

it('rolls back a flipped child and parent XML after a later native apply failure', async () => {
  const bytes = await groupedFixture()
  const opened = await openPptx(bytes)
  const group = groupOf(opened.deck.slides[0]!.elements)
  const ref = groupChildDurableId(group, group.children[0]!)!
  const ops: Op[] = [
    {
      op: 'flipElements',
      target: { slide: 0 },
      group: elementDurableId(group),
      els: [ref],
      axis: 'h',
    },
    {
      op: 'setShapeGeometry',
      target: { slide: 0, el: ref },
      group: elementDurableId(group),
      prst: 'invalid-preset',
    },
  ]
  const before = structuredClone(opened.deck.slides)
  const archive = new Map(opened.archive.entries)
  const definition = lookup('flipElements')
  const result = runPptxHostTxn(opened, structuredClone(ops))
  expect(result).toMatchObject({ applied: false, failures: [{ index: 1 }] })
  expect(opened.deck.slides).toEqual(before)
  expect(opened.archive.entries).toEqual(archive)
  expect(lookup('flipElements')).toBe(definition)
  const session = await openPptxForEdit(bytes)
  const handle = createPptxAgentHandle(
    session,
    'pptx-1',
    () => ({ slideIndex: 0, elementId: ref }),
    () => {},
    host,
  )
  const version = session.version()
  expect(await handle.execute('apply_ops', { ops }, { expectedVersion: version })).toMatchObject({
    ok: false,
  })
  expect(session.version()).toBe(version)
  expect(await entries(await session.save())).toEqual(await entries(bytes))
})

it('restores the native definition when runTxn itself throws outside its failure result', async () => {
  const opened = await openPptx(await groupedFixture())
  const definition = lookup('flipElements')
  // Snapshotting is outside the native apply catch; simulate a clone failure
  // there to exercise the host adapter finally rather than a normal op failure.
  const clone = vi.spyOn(globalThis, 'structuredClone').mockImplementationOnce(() => {
    throw new Error('snapshot failed')
  })
  try {
    expect(() =>
      runPptxHostTxn(opened, [
        {
          op: 'flipElements',
          target: { slide: 0 },
          els: [elementDurableId(groupOf(opened.deck.slides[0]!.elements))!],
          axis: 'h',
        },
      ]),
    ).toThrow('snapshot failed')
    expect(lookup('flipElements')).toBe(definition)
  } finally {
    clone.mockRestore()
  }
})

it('keeps invalid identities, stale or cancelled Agent calls and unknown operations atomic', async () => {
  const bytes = await groupedFixture()
  const session = await openPptxForEdit(bytes)
  const group = groupOf(session.slides()[0]!.elements)
  const ref = groupChildDurableId(group, group.children[0]!)!
  const invoke = vi.fn<typeof host>(host)
  const handle = createPptxAgentHandle(
    session,
    'pptx-1',
    () => ({ slideIndex: 0, elementId: ref }),
    () => {},
    invoke,
  )
  const op: Op = {
    op: 'flipElements',
    target: { slide: 0 },
    group: elementDurableId(group),
    els: [ref],
    axis: 'h',
  }
  for (const invalid of [
    { ...op, group: 'missing' },
    { ...op, els: ['missing'] },
  ])
    expect(await handle.execute('apply_ops', { ops: [invalid] }, {})).toMatchObject({ ok: false })
  expect(invoke).not.toHaveBeenCalled()
  expect(
    await handle.execute('apply_ops', { ops: [op] }, { expectedVersion: session.version() + 1 }),
  ).toMatchObject({ ok: false })
  const controller = new AbortController()
  controller.abort()
  expect(
    await handle.execute('apply_ops', { ops: [op] }, { signal: controller.signal }),
  ).toMatchObject({ ok: false })
  for (const invalid of [
    { ...op, group: 'missing' },
    { ...op, els: ['missing'] },
    { op: 'mimirHostGroupFlip' },
  ])
    await expect(
      host({ documentId: 'pptx-1', bytes, expectedVersion: 0, ops: [invalid] }),
    ).rejects.toThrow(/./)
  expect(await entries(await session.save())).toEqual(await entries(bytes))
  expect(invoke).not.toHaveBeenCalled()
})
