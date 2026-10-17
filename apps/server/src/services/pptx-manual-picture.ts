import { pptxManualPictureSchema } from '@mimir/shared'
import {
  openPptx,
  savePptx,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import { editPptxGroupPicture } from '../../../../packages/office/src/pptx-picture-edit.js'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import type { PptxHostRequest, PptxHostResult } from './pptx-agent-host.js'

export async function applyPptxManualPicture(request: PptxHostRequest): Promise<PptxHostResult> {
  const input = pptxManualPictureSchema.parse(request.ops.length === 1 ? request.ops[0] : null)
  const active = () => {
    if (request.signal?.aborted) throw new Error('图片操作已取消，文档未修改')
  }
  active()
  const opened = await openPptx(request.bytes)
  active()
  const slide = opened.deck.slides[input.slide]
  if (!slide) throw new Error('目标幻灯片已失效')
  const changed = editPptxGroupPicture(slide, input)
  const bytes = changed ? await savePptx(opened) : request.bytes
  if (changed) await (await BoundedZip.open(bytes)).preflightAll()
  active()
  return {
    bytes,
    records: changed ? [{ op: { op: 'manual_picture', ...input }, after: { pictures: 1 } }] : [],
    changed,
    version: request.expectedVersion + Number(changed),
    sampleData: false,
  }
}
