import { randomUUID } from 'node:crypto'
import { pptxManualAssetSchema } from '@mimir/shared'
import {
  pasteElements,
  openPptx,
  savePptx,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import { matchesElementRef } from '../../../../packages/office/vendor/packages/pptx-engine/src/identity.js'
import { elementDurableId } from '../../../../packages/office/vendor/packages/pptx-engine/src/identity.js'
import {
  listMasterParts,
  parseMasterPart,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/master-edit.js'
import { renderSlide } from '../../../../packages/office/src/pptx-render.js'
import {
  getSlideAnimations,
  elementSpid,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/animation.js'
import {
  runTxn,
  type Op,
} from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/index.js'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import { getDocument } from './documents.js'
import type { PptxHostRequest, PptxHostResult } from './pptx-agent-host.js'
import { preparePptxClipboardElements } from './pptx-clipboard-elements.js'
import {
  preparePptxClipboardSlides,
  pastePptxClipboardSlides,
  type PptxSlidePacket,
} from './pptx-clipboard-slides.js'

type Elements = ReturnType<typeof preparePptxClipboardElements>['items']
type Pending = {
  documentId: string
  expires: number
} & (
  | { kind: 'elements'; items: Elements }
  | { kind: 'slide' | 'slides'; packets: PptxSlidePacket[] }
)
type Stored = Pending & { size: number }
const clipboard = new Map<string, Stored>()
const MAX_BYTES = 64 * 1024 * 1024
const TTL_MS = 15 * 60 * 1000
function expire() {
  const now = Date.now()
  for (const [key, value] of clipboard) if (value.expires <= now) clipboard.delete(key)
}
function store(value: Pending): string {
  expire()
  const size = Buffer.byteLength(JSON.stringify(value))
  if (size > MAX_BYTES) throw new Error('复制内容超过64 MiB，请减少对象或媒体数量')
  let total = [...clipboard.values()].reduce((sum, item) => sum + item.size, 0)
  while (clipboard.size >= 12 || total + size > MAX_BYTES) {
    const oldest = clipboard.keys().next().value
    if (!oldest) break
    total -= clipboard.get(oldest)!.size
    clipboard.delete(oldest)
  }
  const ref = randomUUID()
  clipboard.set(ref, { ...value, size })
  return ref
}
const active = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error('复制粘贴已取消，画布未修改')
}

/** Receives authenticated current bytes; clipboard XML is created only by the fixed engine. */
export async function applyPptxManualClipboard(request: PptxHostRequest): Promise<PptxHostResult> {
  const input = pptxManualAssetSchema.parse(request.ops.length === 1 ? request.ops[0] : null)
  active(request.signal)
  const opened = await openPptx(request.bytes)
  let changed = false
  let data: Record<string, unknown> = {}
  let pending: Pending | undefined
  if (input.kind === 'animation_style') {
    const slide = opened.deck.slides[input.slide]
    if (!slide) throw new Error('动画页面已失效')
    const animations = getSlideAnimations(slide),
      previous = animations[input.seq]
    const element = slide.elements.find((item) => elementSpid(item) === previous?.spid)
    if (!previous || !element) throw new Error('动画目标已失效')
    if (
      input.paragraph !== undefined &&
      input.paragraph !== null &&
      ((element.type !== 'text' && element.type !== 'shape') ||
        !element.text ||
        input.paragraph >= element.text.paragraphs.length)
    )
      throw new Error('动画段落不存在')
    const effect = input.effect ?? previous.effect
    const op: Op = {
      op: 'addAnimation',
      target: { slide: input.slide, el: element.id },
      effect,
      trigger: previous.trigger,
      durationMs: previous.durationMs,
      delayMs: previous.delayMs,
      ...(['flyIn', 'flyOut', 'wipe', 'wipeOut'].includes(effect)
        ? { direction: input.direction ?? previous.direction ?? 'bottom' }
        : {}),
      ...(effect === 'motionPath'
        ? { motionPath: input.motionPath ?? previous.motionPath ?? 'M 0 0 L 0.25 0' }
        : {}),
      ...(input.paragraph === null
        ? {}
        : input.paragraph !== undefined
          ? { paragraph: input.paragraph }
          : previous.paragraph !== undefined
            ? { paragraph: previous.paragraph }
            : {}),
    }
    const ops: Op[] = [
      { op: 'removeAnimation', target: { slide: input.slide }, seq: input.seq },
      op,
    ]
    if (input.seq !== animations.length - 1)
      ops.push({
        op: 'reorderAnimation',
        target: { slide: input.slide },
        seq: animations.length - 1,
        to: input.seq,
      })
    const result = runTxn(opened, { ops, isolation: 'atomic' })
    if (!result.applied) throw new Error(result.failures?.[0]?.error ?? '动画修改未应用')
    changed = true
    data = { slideIndex: input.slide }
  } else if (input.kind === 'master_parts' || input.kind === 'master_edit') {
    const masterParts = listMasterParts(opened.archive)
    if (masterParts.length > 100) throw new Error('母版与版式超过 100 项，暂无法编辑此文件的母版')
    if (input.kind === 'master_edit') {
      if (!listMasterParts(opened.archive).some((part) => part.partPath === input.part))
        throw new Error('母版或版式已失效')
      const slide = parseMasterPart(opened.archive, input.part)
      const element = slide?.elements.find((item) => matchesElementRef(item, input.elementId))
      if (!slide || !element) throw new Error('母版对象已失效，请重新选择')
      const target = { part: input.part, el: element.id },
        operation = input.operation
      let op: Op
      if (operation.action === 'fill') op = { op: 'setFill', target, fill: operation.color }
      else if (operation.action === 'stroke')
        op = {
          op: 'setStroke',
          target,
          stroke:
            operation.widthPt === 0
              ? null
              : { color: operation.color, widthEmu: Math.round(operation.widthPt * 12700) },
        }
      else if (operation.action === 'transform')
        op = {
          op: 'setTransform',
          target,
          box: {
            x: Math.round(operation.x * 12700),
            y: Math.round(operation.y * 12700),
            cx: Math.round(operation.width * 12700),
            cy: Math.round(operation.height * 12700),
          },
          rotDeg: operation.rotation,
        }
      else if (operation.action === 'delete') op = { op: 'deleteElement', target }
      else {
        if ((element.type !== 'text' && element.type !== 'shape') || !element.text)
          throw new Error('所选母版对象没有文字')
        op = {
          op: 'setText',
          target,
          paragraphs: operation.text.split('\n').map((text, index) => ({
            srcPara: Math.min(index, element.text!.paragraphs.length - 1),
            runs: [{ text, srcRun: 0 }],
          })),
        }
      }
      const result = runTxn(opened, {
        ops: [op],
        parts: new Map([[input.part, slide]]),
        isolation: 'atomic',
      })
      if (!result.applied) throw new Error(result.failures?.[0]?.error ?? '母版编辑未应用')
      changed = true
    }
    const media = new Map<string, string>()
    for (const [path, bytes] of opened.archive.entries) {
      if (!path.startsWith('ppt/media/')) continue
      const ext = path.split('.').at(-1)?.toLowerCase(),
        mime =
          ext === 'png'
            ? 'image/png'
            : ext === 'jpg' || ext === 'jpeg'
              ? 'image/jpeg'
              : ext === 'svg'
                ? 'image/svg+xml'
                : null
      if (mime) media.set(path, `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`)
    }
    let previewBytes = 0
    data = {
      parts: masterParts
        .map((part) => {
          const slide = parseMasterPart(opened.archive, part.partPath)
          if (!slide) return null
          const preview =
            renderSlide({ size: opened.deck.size, slides: () => [slide], media }, 0, {
              fitWidthPx: 640,
              svgIdPrefix: part.partPath.replace(/\W/g, '-'),
            })?.svg ?? ''
          previewBytes += Buffer.byteLength(preview)
          if (previewBytes > 16 * 1024 * 1024)
            throw new Error('母版预览超过 16 MiB，请减少母版图片后再试')
          return {
            partPath: part.partPath,
            kind: part.kind,
            name: part.name,
            svg: preview,
            elements: slide.elements.map((item) => ({
              id: elementDurableId(item) ?? item.id,
              name: item.name ?? item.type,
              type: item.type,
              fill: 'fill' in item && item.fill?.type === 'solid' ? item.fill.color : null,
              strokeColor:
                'stroke' in item && item.stroke?.fill?.type === 'solid'
                  ? item.stroke.fill.color
                  : null,
              strokeWidth: 'stroke' in item ? (item.stroke?.width ?? 0) / 12700 : 0,
              text:
                item.type === 'shape' || item.type === 'text'
                  ? (item.text?.paragraphs
                      .map((para) => para.runs.map((run) => run.text).join(''))
                      .join('\n') ?? '')
                  : '',
              box: {
                x: item.transform.offset.x / 12700,
                y: item.transform.offset.y / 12700,
                width: item.transform.offset.cx / 12700,
                height: item.transform.offset.cy / 12700,
                rotation: (item.transform.rot ?? 0) / 60000,
              },
            })),
          }
        })
        .filter(Boolean),
    }
  } else if (input.kind === 'copy_elements' || input.kind === 'cut_elements') {
    const slide = opened.deck.slides[input.slide]
    if (!slide) throw new Error('复制所在幻灯片已失效')
    const targets = input.targets ?? input.elementIds!.map((elementId) => ({ elementId }))
    const prepared = preparePptxClipboardElements(
      opened,
      slide,
      targets,
      input.kind === 'cut_elements',
    )
    pending = {
      documentId: request.documentId,
      kind: 'elements',
      items: prepared.items,
      expires: Date.now() + TTL_MS,
    }
    data = {
      kind: 'elements',
      count: prepared.count,
      itemCount: prepared.items.length,
      groupWrapperCount: prepared.groupWrapperCount,
      animationCount: prepared.animationCount,
    }
    if (input.kind === 'cut_elements') {
      prepared.remove()
      changed = true
    }
  } else if (
    input.kind === 'copy_slide' ||
    input.kind === 'cut_slide' ||
    input.kind === 'copy_slides' ||
    input.kind === 'cut_slides'
  ) {
    const indices = 'slides' in input ? input.slides : [input.slide]
    const cut = input.kind === 'cut_slide' || input.kind === 'cut_slides'
    const packets = preparePptxClipboardSlides(opened, indices, cut)
    const kind = 'slides' in input ? 'slides' : 'slide'
    pending = { documentId: request.documentId, kind, packets, expires: Date.now() + TTL_MS }
    data = { kind, count: packets.length }
    if (cut) {
      const result = runTxn(opened, {
        isolation: 'atomic',
        ops: indices
          .toSorted((a, b) => b - a)
          .map((slide) => ({ op: 'deleteSlide' as const, target: { slide } })),
      })
      if (!result.applied) throw new Error(result.failures?.[0]?.error ?? '剪切未应用')
      changed = true
    }
  } else if (
    input.kind === 'paste_elements' ||
    input.kind === 'paste_slide' ||
    input.kind === 'paste_slides'
  ) {
    expire()
    const stored = clipboard.get(input.ref)
    if (!stored || !(await getDocument(stored.documentId)))
      throw new Error('复制内容已过期或源文件不可用，请重新复制')
    active(request.signal)
    if (input.kind === 'paste_elements') {
      if (stored.kind !== 'elements') throw new Error('复制的是幻灯片，请使用粘贴幻灯片')
      const result = pasteElements(opened, input.slide, stored.items, {
        dx: input.dx,
        dy: input.dy,
      })
      if (!result) throw new Error('目标幻灯片已失效，粘贴未应用')
      const elementIds = result.elementIds.map((id) => {
        const element = result.slide.elements.find((item) => item.id === id)
        if (!element) throw new Error('粘贴对象身份已失效')
        return elementDurableId(element) ?? element.id
      })
      data = { kind: 'elements', elementIds, elementRefs: elementIds, slideIndex: input.slide }
    } else {
      if (stored.kind !== 'slide' && stored.kind !== 'slides')
        throw new Error('复制的是对象，请使用粘贴对象')
      const slideIndices = pastePptxClipboardSlides(
        opened,
        input.afterIndex,
        stored.packets,
        input.keepSourceFormatting,
      )
      data = {
        kind: stored.kind,
        slideIndex: slideIndices[0],
        slideIndices,
        count: slideIndices.length,
      }
    }
    changed = true
  } else throw new Error('复制粘贴操作无效')
  active(request.signal)
  const bytes = changed ? await savePptx(opened) : request.bytes
  if (changed) await (await BoundedZip.open(bytes)).preflightAll()
  active(request.signal)
  if (pending) data.ref = store(pending)
  return {
    bytes,
    records: [],
    version: request.expectedVersion + Number(changed),
    sampleData: false,
    changed,
    data,
  }
}
