import { pptxManualZoomSchema } from '../../../../packages/shared/src/pptx-zoom.js'
import {
  openPptx,
  savePptx,
  getSections,
  listSlideLayouts,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import {
  runTxn,
  type Op,
  type OpRecord,
} from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/index.js'
import {
  pptxZoomGroups,
  pptxZoomCascade,
  pptxSummaryZoomFrames,
  pptxSummaryZoomSections,
  type ZoomFrame,
} from '../../../../packages/office/src/pptx-zoom.js'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import type { Slide } from '../../../../packages/office/vendor/packages/pptx-engine/src/types.js'
import type { PptxHostRequest, PptxHostResult } from './pptx-agent-host.js'

const isBody = (type: string) => ['body', 'obj', ''].includes(type)

function titleOf(slide: Slide, index: number): string {
  const element = slide.elements.find(
    (item) =>
      (item.type === 'text' || item.type === 'shape') &&
      (item.placeholder === 'title' || item.placeholder === 'ctrTitle'),
  )
  const text =
    element && (element.type === 'text' || element.type === 'shape') ? element.text : null
  return (
    text?.paragraphs
      .map((paragraph) => paragraph.runs.map((run) => run.text).join(''))
      .join(' ')
      .trim() || `第 ${index + 1} 页`
  )
}
/** Pinned GenOffice zoom-actions semantics: picture snapshots + native internal links; summary adds sections. */
export async function applyPptxManualZoom(
  request: PptxHostRequest,
  imageInfo: (bytes: Uint8Array) => { ext: string; width: number; height: number },
): Promise<PptxHostResult> {
  const active = () => {
    if (request.signal?.aborted) throw new Error('缩放导航已取消，文档未修改')
  }
  const input = pptxManualZoomSchema.parse(request.ops.length === 1 ? request.ops[0] : null)
  active()
  // The caller owns authentication, expectedVersion and archive preflight. Work on a private copy;
  // publish nothing until every tile/link/section has succeeded and the complete archive was checked.
  const opened = await openPptx(request.bytes)
  const original = [...opened.deck.slides]
  if (!original[input.slide]) throw new Error('缩放导航的当前页面已失效')
  const sections = getSections(opened)
  const starts = new Set(pptxZoomGroups(sections, original.length).map((group) => group.start))
  const targets = input.targets
    .toSorted((a, b) => a.slide - b.slide)
    .map((target) => {
      if (!original[target.slide]) throw new Error('缩放导航的目标页面已失效，请重新选择')
      if (input.mode === 'section' && !starts.has(target.slide))
        throw new Error('节缩放只能选择当前分节的首页，请重新读取分节')
      const bytes = new Uint8Array(Buffer.from(target.png, 'base64'))
      const info = imageInfo(bytes)
      if (
        info.ext !== 'png' ||
        info.width > 1280 ||
        info.height > 1280 ||
        info.width * info.height > 1_638_400
      )
        throw new Error('缩放快照须为不超过1280×1280的PNG')
      return { slide: target.slide, bytes }
    })
  const records: OpRecord[] = []
  const apply = (ops: Op[]) => {
    active()
    const result = runTxn(opened, { ops, isolation: 'atomic' })
    if (!result.applied) throw new Error(result.failures?.[0]?.error ?? '缩放导航未应用')
    records.push(...(result.records ?? []))
    active()
    return result
  }
  let index = input.slide,
    frames: ZoomFrame[]
  const { cx, cy } = opened.deck.size
  if (input.mode === 'summary') {
    const first = targets[0]!.slide
    const layouts = listSlideLayouts(opened.archive)
    const layout =
      layouts.find((item) => item.layoutType === 'obj') ??
      layouts.find(
        (item) =>
          item.placeholders.length === 2 &&
          item.placeholders.some((ph) => ['title', 'ctrTitle'].includes(ph.type)) &&
          item.placeholders.some((ph) => isBody(ph.type)),
      ) ??
      layouts.find((item) => item.placeholders.some((ph) => isBody(ph.type)))
    apply([
      {
        op: layout ? 'addSlideWithLayout' : 'addBlankSlide',
        target: { slide: Math.max(first - 1, 0) },
        ...(layout ? { layoutPath: layout.path } : {}),
      },
    ])
    index = first
    if (first === 0) apply([{ op: 'moveSlide', target: { slide: 1 }, to: 0 }])
    const summary = opened.deck.slides[index]!
    const body = summary.elements.find(
      (item) =>
        (item.type === 'shape' || item.type === 'text') && isBody(item.placeholder ?? 'missing'),
    )
    let box: ZoomFrame = { x: cx / 6, y: cy / 4, w: (cx * 2) / 3, h: (cy * 2) / 3 }
    if (body) {
      const { x, y, cx: w, cy: h } = body.transform.offset
      if (w > 0 && h > 0) box = { x, y, w, h }
      apply([{ op: 'deleteElement', target: { slide: index, el: body.id } }])
    }
    frames = pptxSummaryZoomFrames(targets.length, box, cx / cy)
  } else frames = pptxZoomCascade(cx, cy, targets.length)
  const ids: string[] = []
  for (const [at, target] of targets.entries()) {
    const frame = frames[at]!
    const result = apply([
      {
        op: 'addPicture',
        target: { slide: index },
        bytes: target.bytes,
        ext: 'png',
        offset: { x: frame.x, y: frame.y, cx: frame.w, cy: frame.h },
        name: `${input.mode === 'slide' ? 'Slide' : input.mode === 'section' ? 'Section' : 'Summary'} Zoom ${target.slide + 1}`,
      },
    ])
    const id = result.records?.[0]?.created?.[0]
    if (!id) throw new Error('缩放快照没有生成对象，文档未修改')
    apply([
      {
        op: 'setLink',
        target: { slide: index, el: id },
        link: { kind: 'slide', slideIndex: target.slide + (input.mode === 'summary' ? 1 : 0) },
      },
    ])
    ids.push(id)
  }
  if (input.mode === 'summary')
    apply([
      {
        op: 'setSections',
        sections: pptxSummaryZoomSections(
          sections,
          original.length,
          targets.map((target) => target.slide),
          (at) => titleOf(original[at]!, at),
        ),
      },
    ])
  const bytes = await savePptx(opened)
  await (await BoundedZip.open(bytes)).preflightAll()
  active()
  return {
    bytes,
    records: records.map((record) =>
      Object.assign({}, record, {
        // Images already travel in the new archive; avoid expanding Uint8Array into a huge JSON object.
        op: Object.fromEntries(Object.entries(record.op).filter(([key]) => key !== 'bytes')) as Op,
      }),
    ),
    version: request.expectedVersion + 1,
    sampleData: false,
    changed: true,
    data: { slideIndex: index, count: ids.length },
  }
}
