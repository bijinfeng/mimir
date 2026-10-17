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
import {
  openPptx,
  savePptx,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import {
  runTxn,
  type Op,
} from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/index.js'
import { openPptxForEdit } from '../../../../packages/office/src/pptx.js'
import {
  createPptxAgentHandle,
  type PptxHostApply,
} from '../../../../packages/office/src/agent/pptx-agent.js'
import { PptxHistory } from '../../../../packages/office/src/pptx-history.js'
import { selectionFixture } from '../../../../packages/office/src/editors/pptx-selection-test-fixture.js'
import {
  pptxExpandSelection,
  pptxSelectionContexts,
  pptxSelectionFormatOps,
  pptxSelectionOp,
} from '../../../../packages/office/src/editors/pptx-selection.js'

async function fixture() {
  const opened = await openPptx((await selectionFixture()).bytes)
  const group = pptxSelectionContexts(opened.deck.slides[0]!.elements).find(
    (c) => c.element.type === 'group',
  )!
  const targets = pptxExpandSelection(opened.deck.slides[0]!.elements, [group.ref])
  const ops = targets.flatMap((context, index) => [
    pptxSelectionOp(context, {
      op: 'setParagraphFormat',
      target: { slide: 0, el: context.ref },
      format: {
        bullet: 'char',
        bulletChar: index ? 'o' : '•',
        bulletFont: 'Arial',
        spaceBeforePt: 3 + index,
        spaceAfterPt: index,
        lineSpacingPct: 115 + index * 5,
        bulletSizePct: 75 + index * 5,
        bulletColor: '#774411',
        bulletHangEmu: 152400,
      },
    }),
    pptxSelectionOp(context, {
      op: 'setStroke',
      target: { slide: 0, el: context.ref },
      stroke: {
        color: '#12345680',
        widthEmu: 25400,
        dash: index ? 'dash' : 'lgDash',
        cap: 'sq',
        join: 'round',
        compound: 'dbl',
        gradient: {
          stops: [
            { pos: 0, color: '#12345680' },
            { pos: 1, color: '#ABCDEF' },
          ],
          angle: 2700000,
        },
      },
    }),
  ])
  expect(runTxn(opened, { isolation: 'atomic', ops: ops as Op[] }).applied).toBe(true)
  const zip = await JSZip.loadAsync(await savePptx(opened)),
    path = opened.deck.slides[0]!.path
  zip.file(
    path,
    (await zip.file(path)!.async('string')).replace(
      /<\/a:ln>/g,
      '<a:headEnd type="triangle"/><a:tailEnd type="oval"/></a:ln>',
    ),
  )
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }))
}
async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((f) => !f.dir)
        .map(async (f) => [f.name, await f.async('string')]),
    ),
  )
}
const host: PptxHostApply = (request) => applyPptxOpsOnHost({ ...request, action: 'apply_ops' })

it('executes advanced paragraph+outline through real agent/host for top-level and group targets, preserving untouched native data twice and through history', async () => {
  const bytes = await fixture(),
    session = await openPptxForEdit(bytes)
  const contexts = pptxSelectionContexts(session.slides()[0]!.elements)
  const child = contexts.find((c) => c.depth === 1)!,
    outside = contexts.find(
      (c) => c.depth === 0 && (c.element.type === 'shape' || c.element.type === 'text'),
    )!
  const refs = [child.ref, outside.ref],
    original = pptxExpandSelection(session.slides()[0]!.elements, refs)
  const sibling = contexts.find((c) => c.depth === 1 && c.ref !== child.ref)!
  const history = new PptxHistory(session),
    invoke = vi.fn<PptxHostApply>(host)
  const handle = createPptxAgentHandle(
    session,
    'pptx-1',
    () => ({ slideIndex: 0, elementId: refs[0]!, elementIds: refs }),
    () => {},
    invoke,
  )
  const ops = pptxSelectionFormatOps(session.slides()[0]!.elements, refs, 0, {
    paragraph: {
      rtl: true,
      lineSpacingPct: '150',
      spaceAfterPt: '9.5',
      indentDelta: 1,
      bulletHangPt: '14',
      bulletSizePct: '110',
    },
    outline: { cap: 'round', join: 'bevel' },
  })
  expect(
    await handle.execute(
      'apply_ops',
      { ops },
      { expectedVersion: session.version(), roundId: 'detail' },
    ),
  ).toMatchObject({ ok: true, changed: true })
  expect(invoke).toHaveBeenCalledTimes(1)
  expect(invoke.mock.calls[0]![0].ops).toHaveLength(4)
  history.record()
  const first = await session.save()
  session.commit()
  history.synchronize()
  const second = await session.save()
  expect(await entries(second)).toEqual(await entries(first))
  const reopened = await openPptxForEdit(second)
  pptxExpandSelection(reopened.slides()[0]!.elements, refs).forEach(({ element }, index) => {
    const before = original[index]!.element
    if (
      (element.type !== 'shape' && element.type !== 'text') ||
      (before.type !== 'shape' && before.type !== 'text')
    )
      throw new Error('Expected text/shape')
    const paragraph = element.text!.paragraphs[0]!,
      previous = before.text!.paragraphs[0]!
    expect(paragraph).toMatchObject({ rtl: true, lineHeight: 150, spaceAfter: 9.5, level: 1 })
    expect(paragraph.spaceBefore).toBe(previous.spaceBefore)
    expect(paragraph.runs).toEqual(previous.runs)
    const hasBullet = previous.bullet && previous.bullet.type !== 'none'
    expect(paragraph.bullet).toEqual(
      hasBullet ? { ...previous.bullet, sizePct: 110 } : previous.bullet,
    )
    expect(paragraph.indent).toBe(hasBullet ? -177800 : previous.indent)
    expect(paragraph.marL).toBe(hasBullet ? 355600 : previous.marL)
    expect(element.stroke).toMatchObject({ ...before.stroke, cap: 'round', join: 'bevel' })
    expect(element.stroke?.headEnd).toEqual(before.stroke?.headEnd)
    expect(element.stroke?.tailEnd).toEqual(before.stroke?.tailEnd)
  })
  expect(
    pptxSelectionContexts(reopened.slides()[0]!.elements).find((c) => c.ref === sibling.ref)!
      .element.anchor.originalXml,
  ).toBe(sibling.element.anchor.originalXml)
  const beforeEntries = await entries(bytes),
    afterEntries = await entries(second)
  for (const path of Object.keys(beforeEntries).filter((p) => p !== 'ppt/slides/slide1.xml'))
    expect(afterEntries[path]).toBe(beforeEntries[path])
  expect(history.undo()).toBe(true)
  expect(await entries(await session.save())).toEqual(beforeEntries)
  session.commit()
  history.synchronize()
  expect(history.redo()).toBe(true)
  expect(await entries(await session.save())).toEqual(afterEntries)
})

it('writes per-object bullet fonts and numbering through true host and rolls back failed native validation atomically', async () => {
  const bytes = await fixture(),
    session = await openPptxForEdit(bytes)
  const group = pptxSelectionContexts(session.slides()[0]!.elements).find(
    (c) => c.element.type === 'group',
  )!
  const handle = createPptxAgentHandle(
    session,
    'pptx-1',
    () => ({ slideIndex: 0, elementId: null }),
    () => {},
    host,
  )
  const apply = (draft: Parameters<typeof pptxSelectionFormatOps>[3]) =>
    handle.execute(
      'apply_ops',
      { ops: pptxSelectionFormatOps(session.slides()[0]!.elements, [group.ref], 0, draft) },
      { expectedVersion: session.version() },
    )
  expect(await apply({ paragraph: { bulletFont: 'Calibri' } })).toMatchObject({ ok: true })
  expect(
    pptxExpandSelection(session.slides()[0]!.elements, [group.ref]).map(({ element }) =>
      element.type === 'shape' ? element.text!.paragraphs[0]!.bullet : null,
    ),
  ).toEqual(['•', 'o'].map((char) => expect.objectContaining({ char, font: 'Calibri' })))
  expect(
    await apply({
      paragraph: {
        bullet: 'number',
        numType: 'ea1ChsPeriod',
        startAt: '3',
        bulletColor: '#224466',
      },
    }),
  ).toMatchObject({ ok: true })
  const saved = await session.save(),
    version = session.version()
  for (const { element } of pptxExpandSelection(
    (await openPptxForEdit(saved)).slides()[0]!.elements,
    [group.ref],
  )) {
    if (element.type !== 'shape') throw new Error('Expected shape')
    expect(element.text!.paragraphs[0]!.bullet).toMatchObject({
      type: 'number',
      numType: 'ea1ChsPeriod',
      startAt: 3,
      color: '#224466',
    })
  }
  const valid = pptxSelectionFormatOps(session.slides()[0]!.elements, [group.ref], 0, {
    paragraph: { spaceBeforePt: '20' },
  })
  expect(
    await handle.execute(
      'apply_ops',
      { ops: [...valid, { ...valid[0], format: { lineSpacingPct: -1 } }] },
      { expectedVersion: version },
    ),
  ).toMatchObject({ ok: false, changed: false })
  expect(session.version()).toBe(version)
  expect(await entries(await session.save())).toEqual(await entries(saved))
})
