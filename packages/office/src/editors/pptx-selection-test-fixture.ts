import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from 'vitest'
import {
  openPptx,
  savePptx,
  elementDurableId,
} from '../../vendor/packages/pptx-engine/src/index.js'
import { runTxn } from '../../vendor/packages/pptx-ops/src/ops/index.js'
import { openPptxForEdit } from '../pptx.js'
import { pptxInsertShapeOp } from './pptx-shape-presets.js'
const fixture = new Uint8Array(
  readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures/title-layout.pptx'),
  ),
)
export async function selectionFixture() {
  const opened = await openPptx(fixture)
  expect(
    runTxn(opened, {
      isolation: 'atomic',
      ops: [
        pptxInsertShapeOp('rect', 0, 9144000, 5143500),
        pptxInsertShapeOp('rect', 0, 9144000, 5143500),
      ],
    }).applied,
  ).toBe(true)
  const shapes = opened.deck.slides[0]!.elements.slice(-2)
  const refs = shapes.map((shape) => elementDurableId(shape)!)
  expect(
    runTxn(opened, {
      isolation: 'atomic',
      ops: refs.map((el, i) => ({
        op: 'setText',
        target: { slide: 0, el },
        paragraphs: [
          { runs: [{ text: i ? 'Second' : 'First', fontSize: i ? 24 : 18, bold: !!i }] },
        ],
      })),
    }).applied,
  ).toBe(true)
  expect(
    runTxn(opened, {
      isolation: 'atomic',
      ops: [{ op: 'groupElements', target: { slide: 0 }, els: refs }],
    }).applied,
  ).toBe(true)
  const bytes = await savePptx(opened)
  const session = await openPptxForEdit(bytes)
  return { bytes, session, elements: session.slides()[0]!.elements }
}
