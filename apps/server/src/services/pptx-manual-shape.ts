import { pptxManualShapeSchema } from '../../../../packages/shared/src/pptx-shape.js'
import {
  openPptx,
  savePptx,
  elementDurableId,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import {
  runTxn,
  type Op,
} from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/index.js'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import type { PptxHostRequest, PptxHostResult } from './pptx-agent-host.js'

/** Native add + direction flips in a private document, published as one host version/history. */
export async function applyPptxManualShape(request: PptxHostRequest): Promise<PptxHostResult> {
  const active = () => {
    if (request.signal?.aborted) throw new Error('形状插入已取消，画布未修改')
  }
  const input = pptxManualShapeSchema.parse(request.ops.length === 1 ? request.ops[0] : null)
  active()
  const opened = await openPptx(request.bytes),
    slide = opened.deck.slides[input.slide]
  if (!slide) throw new Error('插入页面已失效')
  active()
  const line = ['line', 'lineArrow', 'lineArrowDouble', 'lineBent', 'lineCurved'].includes(
    input.kind,
  )
  const inserted = runTxn(opened, {
    isolation: 'atomic',
    ops: [
      {
        op: 'addElement',
        target: { slide: input.slide },
        kind: input.kind,
        offset: input.offset,
        ...(line ? {} : { fill: '#D9E8FB' }),
        stroke: { color: line ? '#000000' : '#245A9B', widthEmu: 12700 },
      },
    ],
  })
  if (!inserted.applied) throw new Error(inserted.failures?.[0]?.error ?? '形状未插入')
  const element = slide.elements.at(-1)
  if (!element || !inserted.records?.[0]?.created?.includes(element.id))
    throw new Error('无法定位新增形状')
  const id = elementDurableId(element) ?? element.id
  const flips: Op[] = [
    ...(input.flipH
      ? [{ op: 'flipElements', target: { slide: input.slide }, els: [id], axis: 'h' }]
      : []),
    ...(input.flipV
      ? [{ op: 'flipElements', target: { slide: input.slide }, els: [id], axis: 'v' }]
      : []),
  ]
  const flipped = flips.length ? runTxn(opened, { isolation: 'atomic', ops: flips }) : null
  if (flipped && !flipped.applied)
    throw new Error(flipped.failures?.[0]?.error ?? '连接线方向未应用')
  active()
  const bytes = await savePptx(opened)
  await (await BoundedZip.open(bytes)).preflightAll()
  active()
  return {
    bytes,
    version: request.expectedVersion + 1,
    changed: true,
    sampleData: false,
    records: [...(inserted.records ?? []), ...(flipped?.records ?? [])],
  }
}
