import JSZip from 'jszip'
import { expect, it } from 'vitest'
import { openPptx, savePptx } from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn, type Op } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import { openPptxForEdit } from '../pptx.js'
import { PptxHistory } from '../pptx-history.js'
import { selectionFixture } from './pptx-selection-test-fixture.js'
import {
  pptxSelectionContexts,
  pptxNormalizeSelection,
  pptxResolveSelection,
  pptxExpandSelection,
  pptxSelectionFormatOps,
  pptxMixedValue,
  pptxSelectionParagraphPatch,
} from './pptx-selection.js'

it('resolves durable/runtime/first cNvPr aliases, deduplicates ancestor sets and expands exactly one group level', async () => {
  const { elements } = await selectionFixture()
  const rows = pptxSelectionContexts(elements)
  const group = rows.find((item) => item.element.type === 'group')!
  const children = rows.filter((item) => item.group === group.ref)
  expect(children).toHaveLength(2)
  expect(pptxResolveSelection(elements, [children[0]!.element.id])[0]!.ref).toBe(children[0]!.ref)
  expect(pptxNormalizeSelection(elements, [children[0]!.ref, group.ref, group.element.id])).toEqual(
    [group.ref],
  )
  expect(pptxExpandSelection(elements, [group.ref]).map((item) => item.ref)).toEqual(
    children.map((item) => item.ref),
  )
  expect(
    pptxNormalizeSelection(elements, ['missing', children[0]!.ref, children[0]!.element.id]),
  ).toEqual([children[0]!.ref])
  expect(pptxMixedValue([true, false])).toBeNull()
  expect(pptxMixedValue([false, false])).toBe(false)
})
it('validates only explicit detailed paragraph drafts and preserves the original numeric form state', async () => {
  const draft = {
    lineSpacingPct: '125',
    spaceBeforePt: '4.5',
    bulletHangPt: '12.25',
    startAt: '3',
    bullet: 'number',
    numType: 'arabicPeriod',
  }
  expect(pptxSelectionParagraphPatch(draft)).toEqual({
    lineSpacingPct: 125,
    spaceBeforePt: 4.5,
    bulletHangEmu: 155575,
    startAt: 3,
    bullet: 'number',
    numType: 'arabicPeriod',
  })
  expect(draft.bulletHangPt).toBe('12.25')
  for (const invalid of [
    { lineSpacingPct: '' },
    { lineSpacingPct: 'abc' },
    { lineSpacingPct: '13201' },
    { startAt: '1.5' },
    { bulletSizePct: '24' },
    { bulletColor: 'red' },
    { bulletHangPt: '-1' },
    { arbitrary: 1 },
  ])
    expect(() => pptxSelectionParagraphPatch(invalid)).toThrow(/请输入|请检查|悬挂/)
  expect(() =>
    pptxSelectionParagraphPatch({ bullet: 'blip', bulletImage: { ext: 'png', base64: 'AAAA' } }),
  ).toThrow('图片符号')
  const { elements } = await selectionFixture()
  const group = pptxSelectionContexts(elements).find((item) => item.element.type === 'group')!
  expect(
    pptxSelectionFormatOps(elements, [group.ref], 0, {
      paragraph: { rtl: true },
      outline: { cap: 'round' },
    }).every((op) => op.op !== 'setFont'),
  ).toBe(true)
  expect(pptxSelectionFormatOps(elements, [group.ref], 0, {})).toEqual([])
})
it('keeps each object glyph when changing only bullet font, and rejects mixed paragraphs before submission', async () => {
  const { elements } = await selectionFixture()
  const copied = structuredClone(elements)
  const group = pptxSelectionContexts(copied).find((item) => item.element.type === 'group')!
  const members = pptxExpandSelection(copied, [group.ref])
  members.forEach(({ element }, index) => {
    if (element.type === 'shape')
      element.text!.paragraphs[0]!.bullet = { type: 'char', char: index ? 'o' : '•', font: 'Arial' }
  })
  expect(
    pptxSelectionFormatOps(copied, [group.ref], 0, { paragraph: { bulletFont: 'Calibri' } }).map(
      (op) => op.format,
    ),
  ).toEqual([
    { bullet: 'char', bulletChar: '•', bulletFont: 'Calibri' },
    { bullet: 'char', bulletChar: 'o', bulletFont: 'Calibri' },
  ])
  const member = members[0]!.element
  if (member.type !== 'shape') throw new Error('Expected shape')
  member.text!.paragraphs.push({ runs: [{ text: 'Plain' }] })
  expect(() =>
    pptxSelectionFormatOps(copied, [group.ref], 0, { paragraph: { bulletFont: 'Calibri' } }),
  ).toThrow('先明确选择字符符号')
})
it('writes one atomic batch into real group children, preserves other font/stroke fields and unrelated archive entries through two saves', async () => {
  const { bytes, elements } = await selectionFixture()
  const group = pptxSelectionContexts(elements).find((item) => item.element.type === 'group')!
  const ops = pptxSelectionFormatOps(elements, [group.ref], 0, {
    italic: true,
    align: 'center',
    fill: '#4472C4',
    strokeColor: '#12345680',
    strokeWidthPt: 3,
  })
  expect(ops).toHaveLength(8)
  expect(ops.every((op) => op.group === group.ref)).toBe(true)
  expect(ops.find((op) => op.op === 'setFont')!.font).toEqual({ italic: true })
  const opened = await openPptx(bytes)
  const result = runTxn(opened, { isolation: 'atomic', ops: ops as Op[] })
  expect(result.failures ?? []).toEqual([])
  expect(result.applied).toBe(true)
  const first = await openPptxForEdit(await savePptx(opened))
  const once = await first.save()
  first.commit()
  const twice = await (await openPptxForEdit(once)).save()
  const after = await openPptxForEdit(twice)
  const targets = pptxExpandSelection(after.slides()[0]!.elements, [group.ref])
  expect(
    targets.map(({ element }) =>
      element.type === 'shape' ? element.text!.paragraphs[0]!.runs[0]!.fontSize : null,
    ),
  ).toEqual([18, 24])
  for (const { element } of targets) {
    if (element.type !== 'shape') throw new Error('Expected shape')
    expect(element.text!.paragraphs[0]).toMatchObject({ align: 'center', runs: [{ italic: true }] })
    expect(element.fill).toEqual({ type: 'solid', color: '#4472C4' })
    expect(element.stroke).toMatchObject({
      width: 38100,
      fill: { type: 'solid', color: '#12345680' },
    })
  }

  const beforeZip = await JSZip.loadAsync(bytes),
    afterZip = await JSZip.loadAsync(twice)
  for (const [path, entry] of Object.entries(beforeZip.files).filter(
    ([entryPath, item]) => !item.dir && entryPath !== 'ppt/slides/slide1.xml',
  ))
    expect(await afterZip.file(path)!.async('uint8array')).toEqual(await entry.async('uint8array'))
})
it('retains exact archives through saved undo/redo and refuses invalid or oversized batches before applying', async () => {
  const { bytes, session, elements } = await selectionFixture()
  const group = pptxSelectionContexts(elements).find((item) => item.element.type === 'group')!
  const history = new PptxHistory(session)
  const opened = await openPptx(bytes)
  expect(
    runTxn(opened, {
      isolation: 'atomic',
      ops: pptxSelectionFormatOps(elements, [group.ref], 0, { bold: true }) as Op[],
    }).applied,
  ).toBe(true)
  await session.replaceFromHost(await savePptx(opened), session.version())
  history.record()
  const changed = await session.save()
  session.commit()
  history.synchronize()
  expect(history.undo()).toBe(true)
  const undone = await session.save()
  session.commit()
  history.synchronize()
  expect(history.redo()).toBe(true)
  const redone = await session.save()
  for (const [a, b] of [
    [bytes, undone],
    [changed, redone],
  ]) {
    const left = await JSZip.loadAsync(a!),
      right = await JSZip.loadAsync(b!)
    for (const [path, entry] of Object.entries(left.files).filter(([, item]) => !item.dir))
      expect(await right.file(path)!.async('uint8array')).toEqual(await entry.async('uint8array'))
  }
  expect(() => pptxSelectionFormatOps(elements, [group.ref], 0, { color: 'none' })).toThrow('颜色')
  expect(() => pptxSelectionFormatOps(elements, [group.ref], 0, { fontSizePt: NaN })).toThrow(
    '字号',
  )
  expect(() => pptxSelectionFormatOps(elements, [group.ref], 0, { strokeWidthPt: -2 })).toThrow(
    '宽度',
  )
  const template = elements.find((element) => element.type === 'text' || element.type === 'shape')!
  const many = Array.from({ length: 13 }, (_, index) => ({
    ...structuredClone(template),
    id: `bulk-${index}`,
    anchor: {
      ...template.anchor,
      originalXml: `<p:sp><p:nvSpPr><p:cNvPr id="${900 + index}"/></p:nvSpPr></p:sp>`,
    },
  }))
  expect(() =>
    pptxSelectionFormatOps(
      many,
      many.map((element) => element.id),
      0,
      { bold: true, align: 'center', fill: '#123456', strokeColor: '#654321' },
    ),
  ).toThrow('超过50项')
})
