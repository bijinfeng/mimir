import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { createBlankPptx } from '../../vendor/packages/pptx-engine/src/blank.js'
import { openPptx, savePptx } from '../../vendor/packages/pptx-engine/src/index.js'
import {
  elementCNvPrId,
  elementDurableId,
  groupChildDurableId,
} from '../../vendor/packages/pptx-engine/src/identity.js'
import { runTxn, type Op } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import { openPptxForEdit, textOfElement } from '../pptx.js'
import { createPptxAgentHandle, type PptxHostApply } from './pptx-agent.js'

async function fixture() {
  const opened = await openPptx(await createBlankPptx())
  const add = runTxn(opened, {
    ops: ['成员甲', '成员乙', '组外对象'].map((text, index) => ({
      op: 'addElement',
      target: { slide: 0 },
      kind: 'rect',
      offset: { x: index * 2_000_000, y: 1_000_000, cx: 1_500_000, cy: 1_000_000 },
      paragraphs: [{ runs: [{ text, fontSize: 18 }] }],
      fill: '#EEEEEE',
    })),
  })
  expect(add.applied).toBe(true)
  const members = opened.deck.slides[0]!.elements.slice(-3)
  const grouped = runTxn(opened, {
    ops: [{ op: 'groupElements', target: { slide: 0 }, els: members.slice(0, 2).map((e) => e.id) }],
  })
  expect(grouped.applied).toBe(true)
  return savePptx(opened)
}

const nativeHost: PptxHostApply = async ({ bytes, ops, expectedVersion }) => {
  const opened = await openPptx(bytes)
  const txn = runTxn(opened, { ops: ops as Op[], isolation: 'atomic' })
  if (!txn.applied) throw new Error(txn.failures?.[0]?.error ?? '原生操作失败')
  return { bytes: await savePptx(opened), records: txn.records ?? [], version: expectedVersion + 1 }
}

function targets(session: Awaited<ReturnType<typeof openPptxForEdit>>) {
  const group = session.slides()[0]!.elements.find((e) => e.type === 'group')!
  if (group.type !== 'group') throw new Error('missing group')
  return {
    group,
    children: group.children,
    groupId: elementDurableId(group)!,
    childIds: group.children.map((child) => groupChildDurableId(group, child)!),
  }
}

async function entries(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  return Object.fromEntries(
    await Promise.all(
      Object.values(zip.files)
        .filter((file) => !file.dir)
        .map(async (file) => [file.name, await file.async('string')]),
    ),
  )
}

const unchanged = (data: Record<string, string>) =>
  Object.fromEntries(Object.entries(data).filter(([name]) => name !== 'ppt/slides/slide1.xml'))

describe('PPTX direct group members and global selection', () => {
  it('exposes actual child content and freezes additive durable selection with group ownership', async () => {
    const session = await openPptxForEdit(await fixture())
    const { groupId, childIds, children } = targets(session)
    const outside = session.slides()[0]!.elements.find((e) => e.type !== 'group')!
    const handle = createPptxAgentHandle(
      session,
      'doc-1',
      () => ({
        slideIndex: 0,
        elementId: children[0]!.id,
        elementIds: [children[0]!.id, outside.id],
      }),
      () => {},
      nativeHost,
    )
    expect(handle.freezeSelection('round')).toMatchObject({
      elementId: childIds[0],
      groupId,
      elementIds: [childIds[0], elementDurableId(outside)],
      elements: [{ elementId: childIds[0], groupId }, { elementId: elementDurableId(outside) }],
    })
    expect(handle.getContext()).toMatchObject({
      slides: [
        {
          elements: expect.arrayContaining([
            expect.objectContaining({
              id: groupId,
              children: [
                expect.objectContaining({ id: childIds[0], group: groupId, text: '成员甲' }),
                expect.objectContaining({ id: childIds[1], group: groupId, text: '成员乙' }),
              ],
            }),
          ]),
        },
      ],
    })
    const read = await handle.execute('read_slide', {}, { roundId: 'round' })
    expect(read).toMatchObject({
      ok: true,
      data: {
        elements: expect.arrayContaining([
          expect.objectContaining({
            id: groupId,
            children: [
              expect.objectContaining({
                id: childIds[0],
                text: [{ runs: [expect.objectContaining({ text: '成员甲' })] }],
              }),
              expect.objectContaining({ id: childIds[1] }),
            ],
          }),
        ]),
      },
    })
  })

  it('applies font, paragraph, fill and stroke to two real grouped children in one native transaction', async () => {
    const bytes = await fixture(),
      session = await openPptxForEdit(bytes)
    const { children, group, childIds } = targets(session)
    const host = vi.fn<PptxHostApply>(nativeHost),
      changed = vi.fn<() => void>()
    const handle = createPptxAgentHandle(
      session,
      'doc-1',
      () => ({
        slideIndex: 0,
        elementId: children[0]!.id,
      }),
      changed,
      host,
    )
    const ops = children.flatMap((child) =>
      [
        { op: 'setFont', font: { bold: true, fontSizePt: 26, color: '#123456' } },
        { op: 'setParagraphFormat', format: { align: 'center', rtl: true } },
        { op: 'setFill', fill: '#4472C4' },
        { op: 'setStroke', stroke: { color: '#FF0000', widthEmu: 25400, dash: 'dash' } },
      ].map((op) => Object.assign(op, { group: group.id, target: { slide: 0, el: child.id } })),
    )
    const result = await handle.execute(
      'apply_ops',
      { ops },
      { roundId: 'bulk', expectedVersion: session.version() },
    )
    expect(result).toMatchObject({ ok: true, changed: true })
    expect(host).toHaveBeenCalledTimes(1)
    expect(changed).toHaveBeenCalledTimes(1)
    expect(host.mock.calls[0]![0].ops[0]).toMatchObject({
      group: elementDurableId(group),
      target: { el: childIds[0] },
    })
    const first = await session.save()
    session.commit()
    const second = await session.save()
    expect(await entries(second)).toEqual(await entries(first))
    const reopened = await openPptxForEdit(second)
    const updated = targets(reopened)
    expect(updated.childIds).toEqual(childIds)
    for (const child of updated.children) {
      const text = textOfElement(child)!
      expect(text.paragraphs[0]!.align).toBe('center')
      expect(text.paragraphs[0]!.runs[0]).toMatchObject({
        bold: true,
        fontSize: 26,
        color: '#123456',
      })
    }
    const xml = (await entries(second))['ppt/slides/slide1.xml']!
    expect(xml.match(/<a:srgbClr val="4472C4"/g)).toHaveLength(2)
    expect(xml.match(/<a:ln w="25400"/g)).toHaveLength(2)
    expect(xml.match(/<a:pPr[^>]*rtl="1"/g)).toHaveLength(2)
    // Saving is a newer version, so round undo must refuse rather than overwrite it.
    expect(handle.undoRound('bulk')).toBe(false)
    const original = await entries(bytes),
      saved = await entries(second)
    expect(unchanged(saved)).toEqual(unchanged(original))
  })

  it('routes group font and text through host, retaining cNvPr aliases and undoing the whole round', async () => {
    const bytes = await fixture(),
      session = await openPptxForEdit(bytes)
    const { group, children } = targets(session)
    const alias = elementCNvPrId(children[0]!)!,
      groupAlias = elementCNvPrId(group)!
    const host = vi.fn<PptxHostApply>(nativeHost)
    const handle = createPptxAgentHandle(
      session,
      'doc-1',
      () => ({
        slideIndex: 0,
        elementId: alias,
        elementIds: [alias],
      }),
      () => {},
      host,
    )
    for (const op of [
      { op: 'setFont', font: { italic: true } },
      { op: 'setText', paragraphs: [{ runs: [{ text: '新的组内文字' }] }] },
    ]) {
      expect(
        await handle.execute(
          'apply_ops',
          { ops: [{ ...op, group: groupAlias, target: { slide: 0, el: alias } }] },
          { roundId: 'round' },
        ),
      ).toMatchObject({ ok: true })
      expect(handle.freezeSelection()).toMatchObject({ elementId: alias, elementIds: [alias] })
    }
    expect(host).toHaveBeenCalledTimes(2)
    expect(textOfElement(targets(session).children[0]!)!.paragraphs[0]!.runs[0]!.text).toBe(
      '新的组内文字',
    )
    expect(handle.undoRound('round')).toBe(true)
    expect(await entries(await session.save())).toEqual(await entries(bytes))
  })

  it('rejects an invalid group, foreign child, or unsupported group op before any host mutation', async () => {
    const bytes = await fixture(),
      session = await openPptxForEdit(bytes)
    const { groupId, childIds } = targets(session)
    const outside = session.slides()[0]!.elements.find((e) => e.type !== 'group')!
    const host = vi.fn<PptxHostApply>(nativeHost),
      changed = vi.fn<() => void>()
    const handle = createPptxAgentHandle(
      session,
      'doc-1',
      () => ({ slideIndex: 0, elementId: childIds[0]! }),
      changed,
      host,
    )
    const valid = {
      op: 'setFill',
      group: groupId,
      target: { slide: 0, el: childIds[0] },
      fill: '#000000',
    }
    const version = session.version()
    for (const invalid of [
      { ...valid, group: 'e_missing' },
      { ...valid, target: { slide: 0, el: elementDurableId(outside) } },
      { ...valid, op: 'deleteElement' },
      { ...valid, group: '' },
    ]) {
      expect(
        await handle.execute(
          'apply_ops',
          { ops: [valid, invalid] },
          { roundId: 'bad', expectedVersion: version },
        ),
      ).toMatchObject({ ok: false, changed: false })
      expect(session.version()).toBe(version)
      expect(session.hasChanges()).toBe(false)
      expect(await entries(await session.save())).toEqual(await entries(bytes))
      expect(handle.undoRound('bad')).toBe(false)
    }
    expect(host).not.toHaveBeenCalled()
    expect(changed).not.toHaveBeenCalled()
  })

  it('rolls back native group validation failure without publishing partial writes and refuses local fallback', async () => {
    const bytes = await fixture(),
      session = await openPptxForEdit(bytes)
    const { groupId, childIds } = targets(session)
    const selection = () => ({ slideIndex: 0, elementId: childIds[0]! })
    const handle = createPptxAgentHandle(session, 'doc-1', selection, () => {}, nativeHost)
    const valid = {
      op: 'setFont',
      group: groupId,
      target: { slide: 0, el: childIds[0] },
      font: { bold: true },
    }
    expect(
      await handle.execute(
        'apply_ops',
        {
          ops: [
            valid,
            {
              op: 'setStroke',
              group: groupId,
              target: { slide: 0, el: childIds[1] },
              stroke: { color: '#FF0000', widthEmu: -1 },
            },
          ],
        },
        {},
      ),
    ).toMatchObject({ ok: false, changed: false })
    expect(await entries(await session.save())).toEqual(await entries(bytes))
    const local = createPptxAgentHandle(session, 'doc-1', selection, () => {})
    expect(await local.execute('apply_ops', { ops: [valid] }, {})).toMatchObject({
      ok: false,
      changed: false,
      error: expect.stringContaining('宿主'),
    })
    expect(session.hasChanges()).toBe(false)
  })
})
