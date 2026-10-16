import { pptxManualInkSchema } from '@mimir/shared'
import {
  openPptx,
  savePptx,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import {
  elementDurableId,
  matchesElementRef,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/identity.js'
import {
  runTxn,
  type Op,
} from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/index.js'
import {
  decodeInkPayload,
  encodeInkPayload,
  INK_NAME_PREFIX,
  relativeInkStroke,
  strokeBounds,
} from '../../../../packages/office/src/pptx-ink.js'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import type { PptxHostRequest, PptxHostResult } from './pptx-agent-host.js'

/** Authenticated stateless draw action. Only decoded own-ink pictures can be erased. */
export async function applyPptxManualInk(
  request: PptxHostRequest,
  imageInfo: (bytes: Uint8Array) => { ext: string; width: number; height: number },
): Promise<PptxHostResult> {
  const active = () => {
    if (request.signal?.aborted) throw new Error('绘图已取消，画布未修改')
  }
  const input = pptxManualInkSchema.parse(request.ops.length === 1 ? request.ops[0] : null)
  active()
  const opened = await openPptx(request.bytes),
    slide = opened.deck.slides[input.slide]
  if (!slide) throw new Error('绘图页面已失效')
  let ops: Op[]
  if (input.kind === 'add') {
    const bytes = new Uint8Array(Buffer.from(input.png, 'base64')),
      info = imageInfo(bytes)
    if (info.ext !== 'png' || info.width * info.height > 16_000_000)
      throw new Error('笔迹须为不超过1600万像素的PNG')
    const bounds = strokeBounds(input.stroke),
      factor = opened.deck.size.cx / input.fitWidthPx
    if (bounds.w * bounds.h * 4 > 16_000_000) throw new Error('笔迹区域过大，请分成几笔绘制')
    const toEmu = (value: number) => Math.round(value * factor)
    ops = [
      {
        op: 'addPicture',
        target: { slide: input.slide },
        bytes,
        ext: 'png',
        offset: {
          x: toEmu(bounds.x),
          y: toEmu(bounds.y),
          cx: Math.max(1, toEmu(bounds.w)),
          cy: Math.max(1, toEmu(bounds.h)),
        },
        name: `${INK_NAME_PREFIX} ${crypto.randomUUID()}`,
        descr: encodeInkPayload(relativeInkStroke(input.stroke)),
      },
    ]
  } else {
    const ownInk = slide.elements.filter(
      (el) =>
        el.type === 'picture' &&
        el.name?.startsWith(INK_NAME_PREFIX) &&
        el.descr &&
        decodeInkPayload(el.descr),
    )
    const targets =
      input.kind === 'clear'
        ? ownInk
        : input.ids.map((id) => {
            const found = ownInk.find((el) => matchesElementRef(el, id))
            if (!found) throw new Error('只能擦除当前页可识别的手写笔迹，请重新读取')
            return found
          })
    ops = [...new Set(targets)].map((el) => ({
      op: 'deleteElement',
      target: { slide: input.slide, el: elementDurableId(el) ?? el.id },
    }))
  }
  if (!ops.length)
    return {
      bytes: request.bytes,
      records: [],
      version: request.expectedVersion,
      sampleData: false,
      changed: false,
    }
  active()
  const result = runTxn(opened, { ops, isolation: 'atomic' })
  if (!result.applied) throw new Error(result.failures?.[0]?.error ?? '笔迹修改失败')
  active()
  const bytes = await savePptx(opened)
  await (await BoundedZip.open(bytes)).preflightAll()
  active()
  return {
    bytes,
    records: result.records ?? [],
    version: request.expectedVersion + 1,
    sampleData: false,
    changed: true,
  }
}
