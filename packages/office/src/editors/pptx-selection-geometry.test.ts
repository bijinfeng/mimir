import JSZip from 'jszip'
import { expect, it, vi } from 'vitest'
import { groupChildSlices } from '../../vendor/packages/pptx-engine/src/index.js'
import { createPptxAgentHandle } from '../agent/pptx-agent.js'
import { openPptxForEdit } from '../pptx.js'
import { PptxHistory } from '../pptx-history.js'
import { selectionFixture } from './pptx-selection-test-fixture.js'
import { pptxSelectionContexts } from './pptx-selection.js'
import {
  pptxGeometryContext,
  pptxGeometryPreset,
  pptxGeometryValue,
  pptxSelectionGeometryOps,
  PPTX_GEOMETRY_PT,
} from './pptx-selection-geometry.js'

vi.mock('../../../../apps/server/src/services/documents.js', () => ({
  getDocument: async (id: string) =>
    id === 'geometry-doc'
      ? {
          id,
          kind: 'file',
          fileExtension: 'pptx',
          mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        }
      : null,
}))
vi.mock('../../../../apps/server/src/services/pptx-agent-services.js', () => ({
  applyPptxService: () => {
    throw new Error('Unexpected model service')
  },
}))
import { applyPptxOpsOnHost } from '../../../../apps/server/src/services/pptx-agent-host.js'

async function transformedFixture() {
  const fixture = await selectionFixture()
  const group = fixture.elements.find((e) => e.type === 'group')!
  const slices = groupChildSlices(group.anchor.originalXml)
  const child = slices[0]!
  const parentXfrm =
    '<a:xfrm rot="2700000" flipH="1"><a:off x="1200000" y="700000"/><a:ext cx="6000000" cy="3000000"/><a:chOff x="200000" y="100000"/><a:chExt cx="4000000" cy="1500000"/></a:xfrm>'
  const groupXml = group.anchor.originalXml
    .replace(child.xml, child.xml.replace(/<a:xfrm[^>]*>/, '<a:xfrm rot="1800000" flipV="1">'))
    .replace(/(<p:grpSpPr>)\s*<a:xfrm[\s\S]*?<\/a:xfrm>/, `$1${parentXfrm}`)
  const zip = await JSZip.loadAsync(fixture.bytes)
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string')
  zip.file('ppt/slides/slide1.xml', xml.replace(group.anchor.originalXml, groupXml))
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  const session = await openPptxForEdit(bytes)
  const contexts = pptxSelectionContexts(session.slides()[0]!.elements)
  const parent = contexts.find((c) => c.element.type === 'group')!
  const member = contexts.find((c) => c.group === parent.ref)!
  return { bytes, session, parent, member }
}
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((file) => !file.dir)
        .map(async (file) => [file.name, await file.async('uint8array')]),
    ),
  )
}
const unchanged = (data: Record<string, Uint8Array>) =>
  Object.fromEntries(Object.entries(data).filter(([name]) => name !== 'ppt/slides/slide1.xml'))

it('uses exact parent-local values under scaled, rotated and flipped group coordinates', async () => {
  const { session, parent, member } = await transformedFixture()
  expect(parent.element.transform).toMatchObject({ rot: 2700000, flipH: true })
  expect(parent.element.type === 'group' && parent.element.childOffset).toEqual({
    x: 200000,
    y: 100000,
    cx: 4000000,
    cy: 1500000,
  })
  const context = pptxGeometryContext(session.slides()[0]!.elements, [member.ref]).context!
  expect(pptxGeometryValue(context, 'x')).toBe(
    String(Number((member.element.transform.offset.x / PPTX_GEOMETRY_PT).toFixed(4))),
  )
  const ops = pptxSelectionGeometryOps(context, member.ref, 0, { x: '33.25' })
  expect(ops).toEqual([
    {
      op: 'setTransform',
      target: { slide: 0, el: member.ref },
      group: parent.ref,
      box: { ...member.element.transform.offset, x: 422275 },
      rotDeg: 30,
    },
  ])
  expect(ops[0]).not.toHaveProperty('absBox')
})

it('persists geometry, rotation and a preset through the actual host without rewriting another child or parent geometry', async () => {
  const { bytes, session, parent, member } = await transformedFixture()
  const groupXml = parent.element.anchor.originalXml
  const sibling = groupChildSlices(groupXml)[1]!.xml
  const parentTransform = structuredClone(parent.element.transform)
  const host = vi.fn<typeof applyPptxOpsOnHost>(applyPptxOpsOnHost)
  const handle = createPptxAgentHandle(
    session,
    'geometry-doc',
    () => ({ slideIndex: 0, elementId: member.ref }),
    () => {},
    host,
  )
  const history = new PptxHistory(session)
  const ops = pptxSelectionGeometryOps(member, member.ref, 0, {
    x: '17.125',
    width: '144.5',
    rotation: '75',
    preset: 'roundRect',
  })
  expect(
    await handle.execute(
      'apply_ops',
      { ops },
      { expectedVersion: session.version(), roundId: 'geometry' },
    ),
  ).toMatchObject({ ok: true, changed: true })
  history.record()
  expect(host).toHaveBeenCalledTimes(1)
  const saved = await session.save()
  session.commit()
  history.synchronize()
  expect(await entries(await session.save())).toEqual(await entries(saved))
  const reopened = await openPptxForEdit(saved)
  const rows = pptxSelectionContexts(reopened.slides()[0]!.elements)
  const changed = rows.find((c) => c.ref === member.ref)!
  const currentParent = rows.find((c) => c.ref === parent.ref)!
  expect(changed.element.transform).toEqual({
    ...member.element.transform,
    offset: { ...member.element.transform.offset, x: 217488, cx: 1835150 },
    rot: 4500000,
  })
  expect(pptxGeometryPreset(changed)).toBe('roundRect')
  expect(currentParent.element.transform).toEqual(parentTransform)
  expect(groupChildSlices(currentParent.element.anchor.originalXml)[1]!.xml).toBe(sibling)
  expect(unchanged(await entries(saved))).toEqual(unchanged(await entries(bytes)))
  expect(history.undo()).toBe(true)
  const undone = await session.save()
  expect(await entries(undone)).toEqual(await entries(bytes))
  session.commit()
  history.synchronize()
  expect(history.redo()).toBe(true)
  expect(await entries(await session.save())).toEqual(await entries(saved))
})

it('persists a raw hosted group flip and keeps the Inspector batch center-preserving through history', async () => {
  const { bytes, session, member, parent } = await transformedFixture()
  const original = structuredClone(member.element.transform)
  const center = (transform: typeof original) => {
    const radians = ((transform.rot / 60000) * Math.PI) / 180
    const x = ((transform.flipH ? -1 : 1) * transform.offset.cx) / 2
    const y = ((transform.flipV ? -1 : 1) * transform.offset.cy) / 2
    return {
      x:
        transform.offset.x +
        (transform.flipH ? transform.offset.cx : 0) +
        x * Math.cos(radians) -
        y * Math.sin(radians),
      y:
        transform.offset.y +
        (transform.flipV ? transform.offset.cy : 0) +
        x * Math.sin(radians) +
        y * Math.cos(radians),
    }
  }
  // The host now flushes the fixed engine's dirty group XML for a bare flip too.
  const raw = await applyPptxOpsOnHost({
    documentId: 'geometry-doc',
    bytes,
    expectedVersion: 0,
    ops: [
      { op: 'flipElements', target: { slide: 0 }, group: parent.ref, els: [member.ref], axis: 'h' },
    ],
  })
  const rawSession = await openPptxForEdit(raw.bytes)
  const rawMember = pptxSelectionContexts(rawSession.slides()[0]!.elements).find(
    (c) => c.ref === member.ref,
  )!
  const rawTransform = rawMember.element.transform
  expect(rawTransform).toMatchObject({ flipH: true, flipV: original.flipV, rot: original.rot })
  expect(rawTransform.offset.cx).toBe(original.offset.cx)
  expect(rawTransform.offset.cy).toBe(original.offset.cy)
  expect(center(rawTransform).x).toBeCloseTo(center(original).x, 0)
  expect(center(rawTransform).y).toBeCloseTo(center(original).y, 0)
  const rawParent = pptxSelectionContexts(rawSession.slides()[0]!.elements).find(
    (c) => c.ref === parent.ref,
  )!.element
  expect(rawParent.transform).toEqual(parent.element.transform)
  expect(groupChildSlices(rawParent.anchor.originalXml)[1]!.xml).toBe(
    groupChildSlices(parent.element.anchor.originalXml)[1]!.xml,
  )
  expect(unchanged(await entries(raw.bytes))).toEqual(unchanged(await entries(bytes)))
  expect(await entries(await rawSession.save())).toEqual(await entries(raw.bytes))
  const ops = pptxSelectionGeometryOps(member, member.ref, 0, { flipH: true, flipV: false })
  expect(ops.map((op) => op.op)).toEqual(['flipElements', 'flipElements', 'setTransform'])
  const history = new PptxHistory(session)
  const handle = createPptxAgentHandle(
    session,
    'geometry-doc',
    () => ({ slideIndex: 0, elementId: member.ref }),
    () => {},
    applyPptxOpsOnHost,
  )
  expect(await handle.execute('apply_ops', { ops }, { roundId: 'flip' })).toMatchObject({
    ok: true,
  })
  history.record()
  const saved = await session.save()
  const currentRows = pptxSelectionContexts((await openPptxForEdit(saved)).slides()[0]!.elements)
  const changed = currentRows.find((c) => c.ref === member.ref)!.element.transform
  expect(changed).toMatchObject({ flipH: true, flipV: false, rot: original.rot })
  expect(changed.offset).toEqual(ops.at(-1)!.box)
  expect(center(changed).x).toBeCloseTo(center(original).x, 0)
  expect(center(changed).y).toBeCloseTo(center(original).y, 0)
  expect(
    groupChildSlices(currentRows.find((c) => c.ref === parent.ref)!.element.anchor.originalXml)[1]!
      .xml,
  ).toBe(groupChildSlices(parent.element.anchor.originalXml)[1]!.xml)
  session.commit()
  history.synchronize()
  expect(await entries(await session.save())).toEqual(await entries(saved))
  expect(history.undo()).toBe(true)
  expect(await entries(await session.save())).toEqual(await entries(bytes))
  session.commit()
  history.synchronize()
  expect(history.redo()).toBe(true)
  expect(await entries(await session.save())).toEqual(await entries(saved))
})

it('keeps top-level group child coordinates unchanged when resizing the whole group', async () => {
  const { session, parent } = await transformedFixture()
  const old = parent.element.anchor.originalXml
  const childXml = groupChildSlices(old).map((slice) => slice.xml)
  const host = await applyPptxOpsOnHost({
    documentId: 'geometry-doc',
    bytes: await session.save(),
    expectedVersion: 0,
    ops: pptxSelectionGeometryOps(parent, parent.ref, 0, {
      width: '600',
      rotation: '90',
      flipV: true,
    }),
  })
  const rows = pptxSelectionContexts((await openPptxForEdit(host.bytes)).slides()[0]!.elements)
  const group = rows.find((c) => c.ref === parent.ref)!.element
  expect(group.transform).toMatchObject({
    rot: 5400000,
    flipH: true,
    flipV: true,
    offset: { cx: 7620000 },
  })
  expect(groupChildSlices(group.anchor.originalXml).map((slice) => slice.xml)).toEqual(childXml)
  expect(group.type === 'group' && group.childOffset).toEqual(
    parent.element.type === 'group' && parent.element.childOffset,
  )
})

it('does not submit unchanged fields and refuses invalid drafts or stale/cancelled host writes atomically', async () => {
  const { bytes, session, member } = await transformedFixture()
  expect(pptxSelectionGeometryOps(member, member.ref, 0, {})).toEqual([])
  for (const draft of [
    { x: '' },
    { width: '-1' },
    { x: '1e30' },
    { rotation: 'NaN' },
    { preset: 'unsupported' },
  ])
    expect(() => pptxSelectionGeometryOps(member, member.ref, 0, draft)).toThrow(/须|负数|请选择/)
  expect(
    pptxGeometryContext(session.slides()[0]!.elements, [member.ref, 'missing']).reason,
  ).toContain('单独选择')
  expect(pptxGeometryContext(session.slides()[0]!.elements, ['missing']).context).toBeNull()
  const handle = createPptxAgentHandle(
    session,
    'geometry-doc',
    () => ({ slideIndex: 0, elementId: member.ref }),
    () => {},
    applyPptxOpsOnHost,
  )
  const ops = pptxSelectionGeometryOps(member, member.ref, 0, { x: '99' })
  expect(
    await handle.execute('apply_ops', { ops }, { expectedVersion: session.version() + 1 }),
  ).toMatchObject({ ok: false, changed: false })
  const controller = new AbortController()
  controller.abort()
  expect(await handle.execute('apply_ops', { ops }, { signal: controller.signal })).toMatchObject({
    ok: false,
    changed: false,
  })
  expect(
    await handle.execute(
      'apply_ops',
      {
        ops: [
          ...ops,
          {
            op: 'setShapeGeometry',
            target: { slide: 0, el: member.ref },
            group: member.group,
            prst: 'invalid-shape',
          },
        ],
      },
      {},
    ),
  ).toMatchObject({ ok: false, changed: false })
  expect(await entries(await session.save())).toEqual(await entries(bytes))
})
