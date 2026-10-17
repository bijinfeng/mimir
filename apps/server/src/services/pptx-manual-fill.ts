import { createHash } from 'node:crypto'
import { pptxManualFillSchema } from '@mimir/shared'
import {
  openPptx,
  savePptx,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import {
  groupChildDurableId,
  matchesElementRef,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/identity.js'
import {
  runTxn,
  type Op,
} from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/index.js'
import { BoundedZip } from '../../../../packages/office/src/zip-bounds.js'
import { pptxSupportsShapeFill } from '../../../../packages/office/src/pptx-element-capabilities.js'
import type { PptxHostRequest, PptxHostResult } from './pptx-agent-host.js'
import { copyCurrentPptxBackground } from './pptx-copy-background.js'

// Exact Apache-2.0 assets at GenOffice 480548fd55f1be3593ee0d8e316a734751d58309.
const TEXTURES = {
  paper: 'c91102652bf97632c2dd4e3dfc84aac3e6022e59d521557750eaed6e1944e158',
  canvas: 'ffa409fdaf31695bad36751fd490b09a4a7d84fe06bbd8f935b031bcaca614b2',
  wood: '1f3735b67b527e90dbef8e9cc6632a1779a88019050fb87ebf77bc218c8410b8',
  marble: '0434af3f2f462731f4d81944931539733bc841665a1e6548d3c4c6152fb0539c',
  granite: '4504f393f0c30652310373f776ce8fd195eb0f1b2643c3ae0abcc1c1af2f7010',
  denim: 'dcd536be5b70c7d264124bfa0b032bb814807d3aa29ebb78468ec9ddda2470cc',
  cork: '31c68ae8cc7155f1e5d850061e2e7bf8913d3b9c528dc9c16d86ffa33d427e05',
  parchment: 'f64b05df420bf21ebcb164aca4ef39a24d5b97792686f0a5979a83d3896619d7',
}
export async function applyPptxManualFill(
  request: PptxHostRequest,
  imageInfo: (bytes: Uint8Array) => { ext: string; width: number; height: number },
): Promise<PptxHostResult> {
  const active = () => {
    if (request.signal?.aborted) throw new Error('填充操作已取消，文档未修改')
  }
  const input = pptxManualFillSchema.parse(request.ops.length === 1 ? request.ops[0] : null)
  active()
  const opened = await openPptx(request.bytes),
    slide = opened.deck.slides[input.slide]
  if (!slide) throw new Error('填充页面已失效')
  if (input.kind === 'copy-current-background') {
    const result = await copyCurrentPptxBackground(opened, input.slide, active)
    await (await BoundedZip.open(result.bytes)).preflightAll()
    active()
    return {
      ...result,
      bytes: result.changed ? result.bytes : request.bytes,
      records: result.changed
        ? [
            {
              op: { op: 'copyCurrentBackground', target: { slide: input.slide } },
              after: { slides: opened.deck.slides.length },
            },
          ]
        : [],
      version: request.expectedVersion + Number(result.changed),
      sampleData: false,
    }
  }
  const targets =
    input.kind === 'selection'
      ? input.targets
      : input.kind === 'shape'
        ? [{ elementId: input.elementId, group: undefined }]
        : []
  const resolved = targets.map((target) => {
    const group = target.group
      ? slide.elements.find((item) => matchesElementRef(item, target.group!))
      : undefined
    if (target.group && group?.type !== 'group') throw new Error('父组合已失效，请重新选择')
    const element =
      group?.type === 'group'
        ? group.children.find(
            (item) =>
              matchesElementRef(item, target.elementId) ||
              groupChildDurableId(group, item) === target.elementId,
          )
        : slide.elements.find((item) => matchesElementRef(item, target.elementId))
    if (!element || (element.type !== 'shape' && element.type !== 'text'))
      throw new Error('请重新选择可填充的形状或文本框')
    if (!pptxSupportsShapeFill(element)) throw new Error('线条不支持填充，请选择形状或文本框')
    return { target, element }
  })
  if (new Set(resolved.map(({ element }) => element)).size !== resolved.length)
    throw new Error('填充对象不得重复')
  let texture: { bytes: Uint8Array; ext: string } | undefined
  if (input.source.kind === 'texture') {
    const bytes = new Uint8Array(Buffer.from(input.source.png, 'base64'))
    if (createHash('sha256').update(bytes).digest('hex') !== TEXTURES[input.source.id])
      throw new Error('内置纹理内容不匹配，请刷新后重试')
    const info = imageInfo(bytes)
    if (info.ext !== 'png') throw new Error('内置纹理必须为PNG')
    texture = { bytes, ext: 'png' }
  }
  const sourceFor = (fill: typeof slide.background) => {
    if (texture) return texture
    if (
      fill?.type !== 'image' ||
      !/^ppt\/media\/[^/]+$/.test(fill.mediaRef) ||
      !opened.archive.readBytes(fill.mediaRef)?.length
    )
      throw new Error('当前填充图片已失效，请重新读取')
    return { mediaPath: fill.mediaRef }
  }
  const ops: Op[] =
    input.kind === 'shape' || input.kind === 'selection'
      ? resolved.map(({ target, element }) => ({
          op: 'setImageFill',
          target: { slide: input.slide, el: target.elementId },
          group: target.group,
          source: sourceFor(element.fill),
          tile: input.tile,
        }))
      : (input.allSlides ? opened.deck.slides.map((_, index) => index) : [input.slide]).map(
          (index) => ({
            op: 'setBackground',
            target: { slide: index },
            kind: 'image',
            source: sourceFor(slide.background),
            tile: input.tile,
          }),
        )
  active()
  const result = runTxn(opened, { ops, isolation: 'atomic' })
  if (!result.applied) throw new Error(result.failures?.[0]?.error ?? '填充操作未应用')
  active()
  const bytes = await savePptx(opened)
  await (await BoundedZip.open(bytes)).preflightAll()
  active()
  return {
    bytes,
    // Native records repeat the texture bytes per target. Keep the HTTP response
    // bounded by describing this manual action once, with no image payload.
    records:
      input.kind === 'selection'
        ? [
            {
              op: {
                op: 'manual_fill',
                kind: input.kind,
                slide: input.slide,
                targets: input.targets,
                source:
                  input.source.kind === 'texture'
                    ? { kind: 'texture', id: input.source.id }
                    : { kind: 'current' },
                tile: input.tile,
              },
              after: { objects: resolved.length },
            },
          ]
        : (result.records ?? []),
    version: request.expectedVersion + 1,
    sampleData: false,
    changed: true,
  }
}
