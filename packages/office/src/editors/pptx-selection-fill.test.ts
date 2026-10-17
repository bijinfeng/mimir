import JSZip from 'jszip'
import { expect, it, vi } from 'vitest'
import { openPptx, savePptx } from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn, type Op } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import { createPptxAgentHandle, type PptxHostApply } from '../agent/pptx-agent.js'
import { openPptxForEdit } from '../pptx.js'
import { PptxHistory } from '../pptx-history.js'
import { selectionFixture } from './pptx-selection-test-fixture.js'
import {
  pptxExpandSelection,
  pptxSelectionContexts,
  pptxSelectionFormatOps,
  pptxSelectionOp,
} from './pptx-selection.js'
import {
  pptxElementFill,
  pptxSelectionShapeFillOp,
  type PptxSelectionFillDraft,
} from './pptx-selection-fill.js'
import {
  currentPptxShapeStyle,
  PPTX_SHAPE_STYLES,
  pptxInsertShapeOp,
} from './pptx-shape-presets.js'
import { pptxSupportsShapeFill } from '../pptx-element-capabilities.js'

vi.mock('../../../../apps/server/src/services/documents.js', () => ({
  getDocument: async (id: string) =>
    id === 'fill-doc'
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

const host: PptxHostApply = (request) => applyPptxOpsOnHost({ ...request, action: 'apply_ops' })
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
async function fixture(path = false) {
  const opened = await openPptx((await selectionFixture()).bytes)
  const contexts = pptxSelectionContexts(opened.deck.slides[0]!.elements)
  const child = contexts.find((c) => c.depth === 1)!
  const outside = contexts.find((c) => c.depth === 0 && ['text', 'shape'].includes(c.element.type))!
  const refs = [outside.ref, child.ref]
  const targets = pptxExpandSelection(opened.deck.slides[0]!.elements, refs)
  const ops = targets.flatMap((context, index) => [
    pptxSelectionOp(context, {
      op: 'setFill',
      target: { slide: 0, el: context.ref },
      fill: {
        stops: [
          { pos: 0, color: index ? '#12345680' : '#AABBCC40' },
          { pos: 0.35, color: index ? '#DD8822' : '#6688AA' },
          { pos: 1, color: index ? '#112233' : '#FFEEDD' },
        ],
        ...(path
          ? {
              path: index ? 'rect' : 'circle',
              fillTo: { l: index ? 0.2 : 0.1, t: 0.2, r: 0.3, b: 0.4 },
            }
          : { angle: index ? 5400000 : 2700000 }),
      },
    }),
    pptxSelectionOp(context, {
      op: 'setStroke',
      target: { slide: 0, el: context.ref },
      stroke: {
        color: '#88774480',
        widthEmu: index ? 25400 : 38100,
        cap: index ? 'sq' : 'rnd',
        join: 'bevel',
        compound: 'dbl',
        dash: 'lgDash',
      },
    }),
  ])
  expect(runTxn(opened, { isolation: 'atomic', ops: ops as Op[] }).applied).toBe(true)
  const zip = await JSZip.loadAsync(await savePptx(opened))
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string')
  zip.file(
    'ppt/slides/slide1.xml',
    xml
      .replace(
        /<a:lin ([^>]*?)\/>/g,
        (_, attrs: string) => `<a:lin ${attrs.replace(/scaled="[^"]*"/g, '')} scaled="0"/>`,
      )
      .replace(/<\/a:gradFill>/g, '<a:tileRect l="1000" t="2000" r="3000" b="4000"/></a:gradFill>')
      .replace(
        /<\/a:ln>/g,
        '<a:headEnd type="triangle" w="lg"/><a:tailEnd type="oval" len="sm"/></a:ln>',
      ),
  )
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  const session = await openPptxForEdit(bytes)
  return { bytes, session, refs, targets: pptxExpandSelection(session.slides()[0]!.elements, refs) }
}
function handleFor(
  session: Awaited<ReturnType<typeof openPptxForEdit>>,
  refs: string[],
  invoke = host,
) {
  return createPptxAgentHandle(
    session,
    'fill-doc',
    () => ({ slideIndex: 0, elementId: refs[0]!, elementIds: refs }),
    () => {},
    invoke,
  )
}

it('edits only requested gradient stops and angle per object through actual agent/host, two saves and exact history', async () => {
  const { bytes, session, refs, targets } = await fixture()
  const originalRows = pptxSelectionContexts(session.slides()[0]!.elements)
  const sibling = originalRows.find((c) => c.depth === 1 && c.ref !== refs[1])!
  const invoke = vi.fn<PptxHostApply>(host),
    history = new PptxHistory(session)
  const handle = handleFor(session, refs, invoke)
  const ops = pptxSelectionFormatOps(session.slides()[0]!.elements, refs, 0, {
    fillFormat: {
      angle: '123.5',
      stopEdits: [
        { kind: 'patch', index: 1, pos: '42.5' },
        { kind: 'patch', index: 0, color: '#22446666' },
      ],
    },
  })
  expect(ops).toHaveLength(2)
  expect(ops[1]!.group).toBe(targets[1]!.group)
  expect(
    await handle.execute(
      'apply_ops',
      { ops },
      { expectedVersion: session.version(), roundId: 'fill' },
    ),
  ).toMatchObject({ ok: true, changed: true })
  expect(invoke).toHaveBeenCalledTimes(1)
  history.record()
  const saved = await session.save()
  session.commit()
  history.synchronize()
  expect(await entries(await session.save())).toEqual(await entries(saved))
  const reopened = await openPptxForEdit(saved)
  pptxExpandSelection(reopened.slides()[0]!.elements, refs).forEach(({ element }, index) => {
    const original = pptxElementFill(targets[index]!.element)
    if (original?.type !== 'gradient') throw new Error('Expected gradient')
    expect(pptxElementFill(element)).toEqual({
      ...original,
      angle: 7410000,
      stops: original.stops.map((stop, i) =>
        i === 0
          ? Object.assign({}, stop, { color: '#22446666' })
          : i === 1
            ? Object.assign({}, stop, { pos: 0.425 })
            : stop,
      ),
    })
    expect('stroke' in element && element.stroke).toEqual(
      'stroke' in targets[index]!.element && targets[index]!.element.stroke,
    )
    expect('text' in element && element.text).toEqual(
      'text' in targets[index]!.element && targets[index]!.element.text,
    )
  })
  expect(
    pptxSelectionContexts(reopened.slides()[0]!.elements).find((c) => c.ref === sibling.ref)!
      .element.anchor.originalXml,
  ).toBe(sibling.element.anchor.originalXml)
  const originalEntries = await entries(bytes),
    savedEntries = await entries(saved)
  for (const path of Object.keys(originalEntries).filter((p) => p !== 'ppt/slides/slide1.xml'))
    expect(savedEntries[path]).toEqual(originalEntries[path])
  expect(history.undo()).toBe(true)
  expect(await entries(await session.save())).toEqual(originalEntries)
  session.commit()
  history.synchronize()
  expect(history.redo()).toBe(true)
  expect(await entries(await session.save())).toEqual(savedEntries)
})

it('preserves each path focus and tile rectangle while appending/removing alpha stops and changing path kind', async () => {
  const { session, refs, targets } = await fixture(true)
  const handle = handleFor(session, refs)
  const ops = pptxSelectionFormatOps(session.slides()[0]!.elements, refs, 0, {
    fillFormat: {
      path: 'shape',
      stopEdits: [
        { kind: 'append', from: 0 },
        { kind: 'patch', index: 3, pos: '75' },
        { kind: 'remove', index: 1 },
      ],
    },
  })
  const result = await handle.execute('apply_ops', { ops }, {})
  expect(result).toMatchObject({ ok: true })
  for (const [index, { element }] of pptxExpandSelection(
    (await openPptxForEdit(await session.save())).slides()[0]!.elements,
    refs,
  ).entries()) {
    const original = pptxElementFill(targets[index]!.element)
    if (original?.type !== 'gradient') throw new Error('Expected gradient')
    expect(pptxElementFill(element)).toEqual({
      ...original,
      path: 'shape',
      stops: [original.stops[0], { ...original.stops[0], pos: 0.75 }, original.stops[2]],
    })
  }
})

it('applies every fixed 32-style preset to mixed top-level/group targets, retaining widths, caps, joins, arrows and glyphs', async () => {
  const { bytes, session, refs, targets } = await fixture(true)
  const handle = handleFor(session, refs)
  const history = new PptxHistory(session)
  for (const style of PPTX_SHAPE_STYLES) {
    const ops = pptxSelectionFormatOps(session.slides()[0]!.elements, refs, 0, {
      shapeStyle: style.key,
    })
    expect(ops).toHaveLength(4)
    const result = await handle.execute('apply_ops', { ops }, {})
    expect(result).toMatchObject({ ok: true })
    const reopened = await openPptxForEdit(await session.save())
    pptxExpandSelection(reopened.slides()[0]!.elements, refs).forEach(({ element }, index) => {
      const original = targets[index]!.element
      expect(currentPptxShapeStyle(element)?.key).toBe(style.key)
      if (!('stroke' in element) || !('stroke' in original)) throw new Error('Expected line')
      expect(element.stroke).toMatchObject({
        width: original.stroke!.width,
        cap: original.stroke!.cap,
        join: original.stroke!.join,
        compound: original.stroke!.compound,
        headEnd: original.stroke!.headEnd,
        tailEnd: original.stroke!.tailEnd,
      })
      expect('text' in element && element.text).toEqual('text' in original && original.text)
    })
  }
  history.record()
  const saved = await session.save()
  session.commit()
  history.synchronize()
  const originalEntries = await entries(bytes),
    savedEntries = await entries(saved)
  expect(await entries(await session.save())).toEqual(savedEntries)
  for (const path of Object.keys(originalEntries).filter((p) => p !== 'ppt/slides/slide1.xml'))
    expect(savedEntries[path]).toEqual(originalEntries[path])
  expect(history.undo()).toBe(true)
  expect(await entries(await session.save())).toEqual(originalEntries)
  session.commit()
  history.synchronize()
  expect(history.redo()).toBe(true)
  expect(await entries(await session.save())).toEqual(savedEntries)
})

it('combines an explicit style, fill override and outline override once per target and preserves atomic failure', async () => {
  const { bytes, session, refs } = await fixture()
  const handle = handleFor(session, refs)
  const ops = pptxSelectionFormatOps(session.slides()[0]!.elements, refs, 0, {
    shapeStyle: 'dash-blue',
    fillFormat: { mode: 'solid', color: '#12345680' },
    outline: { widthPt: 5, join: 'round' },
  })
  expect(ops).toHaveLength(4)
  expect(ops.filter((op) => op.op === 'setFill').map((op) => op.fill)).toEqual([
    '#12345680',
    '#12345680',
  ])
  expect(
    ops
      .filter((op) => op.op === 'setStroke')
      .every((op) => (op.stroke as { widthEmu: number }).widthEmu === 63500),
  ).toBe(true)
  expect(
    await handle.execute('apply_ops', { ops: [...ops, { ...ops[0], fill: { stops: [] } }] }, {}),
  ).toMatchObject({ ok: false, changed: false })
  expect(await entries(await session.save())).toEqual(await entries(bytes))
})

it('excludes native lines from fill targets but still styles every selected line stroke in the same transaction', async () => {
  const opened = await openPptx((await selectionFixture()).bytes)
  expect(
    runTxn(opened, {
      isolation: 'atomic',
      ops: ['line', 'lineArrow', 'lineArrowDouble', 'lineBent', 'lineCurved'].map((kind) =>
        pptxInsertShapeOp(kind, 0, 9144000, 5143500),
      ),
    }).applied,
  ).toBe(true)
  const session = await openPptxForEdit(await savePptx(opened))
  const contexts = pptxSelectionContexts(session.slides()[0]!.elements)
  const group = contexts.find((context) => context.element.type === 'group')!
  const lines = contexts.filter(
    (context) =>
      context.depth === 0 &&
      !pptxSupportsShapeFill(context.element) &&
      context.element.type !== 'group',
  )
  expect(lines).toHaveLength(5)
  const refs = [group.ref, ...lines.map((context) => context.ref)]
  const handle = handleFor(session, refs)
  const ops = pptxSelectionFormatOps(session.slides()[0]!.elements, refs, 0, {
    fillFormat: {
      mode: 'gradient',
      angle: '35',
      stops: [
        { pos: 0, color: '#11223380' },
        { pos: 0.4, color: '#778899' },
        { pos: 1, color: '#FFFFFF' },
      ],
    },
  })
  expect(ops).toHaveLength(2)
  expect(await handle.execute('apply_ops', { ops }, {})).toMatchObject({ ok: true })
  let rows = pptxSelectionContexts(session.slides()[0]!.elements)
  for (const line of lines)
    expect(rows.find((context) => context.ref === line.ref)!.element.anchor.originalXml).toBe(
      line.element.anchor.originalXml,
    )
  expect(
    pptxExpandSelection(session.slides()[0]!.elements, refs)
      .filter((context) => pptxSupportsShapeFill(context.element))
      .map(({ element }) => pptxElementFill(element)),
  ).toEqual([
    expect.objectContaining({ type: 'gradient', angle: 2100000 }),
    expect.objectContaining({ type: 'gradient', angle: 2100000 }),
  ])
  const styleOps = pptxSelectionFormatOps(session.slides()[0]!.elements, refs, 0, {
    shapeStyle: 'dash-blue',
  })
  expect(styleOps.filter((op) => op.op === 'setFill')).toHaveLength(2)
  expect(styleOps.filter((op) => op.op === 'setStroke')).toHaveLength(7)
  expect(await handle.execute('apply_ops', { ops: styleOps }, {})).toMatchObject({ ok: true })
  rows = pptxSelectionContexts((await openPptxForEdit(await session.save())).slides()[0]!.elements)
  for (const line of lines) {
    const element = rows.find((context) => context.ref === line.ref)!.element
    expect(pptxSupportsShapeFill(element)).toBe(false)
    expect(pptxElementFill(element)).toEqual(pptxElementFill(line.element))
    expect('stroke' in element && element.stroke).toMatchObject({
      fill: { type: 'solid', color: '#0A50A1' },
      dash: 'dash',
    })
    expect(element.anchor.originalXml).not.toContain('<a:gradFill')
  }
})

it('rejects invalid or incomplete gradient drafts before submitting, and never silently converts mixed fill types', () => {
  const gradient = {
    type: 'gradient',
    angle: 0,
    stops: [
      { pos: 0, color: '#123456' },
      { pos: 1, color: '#FFFFFF80' },
    ],
  } as const
  for (const draft of [
    { angle: '' },
    { angle: 'NaN' },
    { angle: '361' },
    { stopEdits: [{ kind: 'patch', index: 0, pos: '' }] },
    { stopEdits: [{ kind: 'patch', index: 0, pos: '101' }] },
    { stopEdits: [{ kind: 'patch', index: 0, color: 'bad' }] },
    { stopEdits: [{ kind: 'patch', index: 3, color: '#123456' }] },
    { stopEdits: [{ kind: 'remove', index: 1 }] },
  ] satisfies PptxSelectionFillDraft[])
    expect(() =>
      pptxSelectionShapeFillOp({ ...gradient, stops: [...gradient.stops] }, draft, {
        slide: 0,
        el: 'x',
      }),
    ).toThrow(/请输入|须|色标|至少/)
  expect(() =>
    pptxSelectionShapeFillOp(
      { type: 'solid', color: '#123456' },
      { angle: 90 },
      { slide: 0, el: 'x' },
    ),
  ).toThrow('非渐变')
  expect(() =>
    pptxSelectionShapeFillOp(
      { ...gradient, stops: [...gradient.stops] },
      { color: '#123456' },
      { slide: 0, el: 'x' },
    ),
  ).toThrow('非纯色')
})
