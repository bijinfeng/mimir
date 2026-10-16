import JSZip from 'jszip'
import { pptxManualAnimationSchema } from '../../../../packages/shared/src/pptx-animation.js'
import {
  openPptx,
  savePptx,
  getSlideAnimations,
  setSlideAnimations,
  elementSpid,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import { readSlideTransitionXml } from '../../../../packages/office/vendor/packages/pptx-engine/src/generate.js'
import { matchesElementRef } from '../../../../packages/office/vendor/packages/pptx-engine/src/identity.js'
import type { SlideElement } from '../../../../packages/office/vendor/packages/pptx-engine/src/types.js'
import {
  runTxn,
  type Op,
} from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/index.js'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import type { PptxHostRequest, PptxHostResult } from './pptx-agent-host.js'

const MAX_ITEMS = 5000
function findElement(elements: SlideElement[], id: string): SlideElement | undefined {
  for (const element of elements) {
    if (matchesElementRef(element, id)) return element
    if (element.type === 'group') {
      const found = findElement(element.children, id)
      if (found) return found
    }
  }
  return undefined
}
/** Only dedicated manual semantics; never exposes an expanded model DSL budget or accepts XML. */
export async function applyPptxManualAnimation(request: PptxHostRequest): Promise<PptxHostResult> {
  const active = () => {
    if (request.signal?.aborted) throw new Error('动画操作已取消，文档未修改')
  }
  const input = pptxManualAnimationSchema.parse(request.ops.length === 1 ? request.ops[0] : null)
  active()
  const opened = await openPptx(request.bytes)
  const slide = opened.deck.slides[input.slide]
  if (!slide) throw new Error('动画所在页面已失效')
  let ops: Op[] = []
  let animationRecord: { op: typeof input & { op: string }; after: { count: number } } | null = null
  if (input.kind === 'transition-all') {
    const kind = readSlideTransitionXml(slide.bodySuffix)
    ops = opened.deck.slides.map((_, index) => ({
      op: 'setTransition',
      target: { slide: index },
      kind,
    }))
  } else {
    const element = findElement(slide.elements, input.elementId)
    if (!element) throw new Error('动画对象已失效，请重新选择')
    const spid = elementSpid(element)
    if (spid == null) throw new Error('对象没有可用的动画标识')
    const items = getSlideAnimations(slide)
    const kept = input.operation === 'add' ? items : items.filter((item) => item.spid !== spid)
    const added: typeof items = []
    if (input.operation !== 'remove') {
      const count =
        element.type === 'text' || element.type === 'shape'
          ? (element.text?.paragraphs.length ?? 0)
          : 0
      if (input.paragraph !== undefined && input.paragraph >= count)
        throw new Error('目标段落已失效，请重新选择')
      const effect = input.effect!
      if (effect.startsWith('media') && (element.type !== 'picture' || !element.media))
        throw new Error('媒体动画只适用于视频或音频对象')
      const n = input.byParagraph && count > 1 ? count : 1
      const duration =
        effect === 'appear' || effect === 'disappear' || effect.startsWith('media')
          ? 0
          : ['spin', 'grow', 'bounce', 'motionPath'].includes(effect)
            ? 2000
            : ['pulse', 'teeter'].includes(effect)
              ? 1000
              : 500
      if (kept.length + n > MAX_ITEMS) throw new Error('本页动画超过5000项预算，请减少后重试')
      added.push(
        ...Array.from({ length: n }, (_, paragraph) => ({
          spid,
          effect,
          trigger: input.trigger ?? 'onClick',
          durationMs: input.durationMs ?? duration,
          delayMs: input.delayMs ?? 0,
          ...(input.direction ? { direction: input.direction } : {}),
          ...(input.motionPath ? { motionPath: input.motionPath } : {}),
          ...(input.byParagraph && count > 1
            ? { paragraph }
            : input.paragraph !== undefined
              ? { paragraph: input.paragraph }
              : {}),
          ...(element.type === 'picture' && element.media ? { mediaKind: element.media.kind } : {}),
        })),
      )
    }
    active()
    setSlideAnimations(slide, [...kept, ...added])
    animationRecord = {
      op: { op: 'manualAnimation', ...input },
      after: { count: kept.length + added.length },
    }
  }
  if (ops.length > MAX_ITEMS) throw new Error('动画操作超过5000项预算，请减少后重试')
  active()
  const result = animationRecord
    ? { applied: true, records: [animationRecord], failures: [] }
    : runTxn(opened, { ops, isolation: 'atomic' })
  if (!result.applied) throw new Error(result.failures?.[0]?.error ?? '动画操作未应用')
  active()
  const bytes = await savePptx(opened)
  await (await BoundedZip.open(bytes)).preflightAll()
  active()
  const beforeZip = await JSZip.loadAsync(request.bytes),
    afterZip = await JSZip.loadAsync(bytes)
  const beforeNames = Object.keys(beforeZip.files).filter((name) => !beforeZip.files[name]!.dir),
    afterNames = Object.keys(afterZip.files).filter((name) => !afterZip.files[name]!.dir)
  let changed = beforeNames.length !== afterNames.length
  for (const name of beforeNames) {
    if (changed) break
    active()
    const after = afterZip.file(name)
    if (!after) {
      changed = true
      break
    }
    const original = await beforeZip.file(name)!.async('uint8array'),
      current = await after.async('uint8array')
    changed =
      original.length !== current.length ||
      original.some((value, index) => value !== current[index])
  }
  active()
  return {
    bytes: changed ? bytes : request.bytes,
    records: changed ? (result.records ?? []) : [],
    changed,
    version: request.expectedVersion + Number(changed),
    sampleData: false,
  }
}
