import type { PptxDeckProgressListener } from '@mimir/shared'
import { pptxImageInfo as imageInfo } from './pptx-image-info.js'
import {
  pptxChartEditOpSchema,
  pptxAnimationTimingOpSchema,
  type PptxHostAction,
  type PptxManualPictureFields,
  PPTX_SERVICE_ACTIONS,
  PPTX_ASSET_MAX_BYTES,
  pptxManualUploadSchema,
  type PptxManualUpload,
} from '@mimir/shared'
import {
  openPptx,
  savePptx,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import {
  getSlideAnimations,
  setSlideAnimations,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/animation.js'
import { OP_DOCS } from '../../../../packages/office/vendor/packages/pptx-ops/src/op-docs.js'
import { matchesElementRef } from '../../../../packages/office/vendor/packages/pptx-engine/src/identity.js'
import {
  runTxn,
  type Op,
  type OpRecord,
} from '../../../../packages/office/vendor/packages/pptx-ops/src/ops/index.js'
import { BoundedZip, MAX_ZIP_INPUT_BYTES } from '../../../../packages/office/src/zip-bounds.js'
import { documentAgentFormatOf } from './document-agent-format.js'
import { getDocument } from './documents.js'
import { applyPptxService } from './pptx-agent-services.js'
import { applyPptxManualFill } from './pptx-manual-fill.js'
import { applyPptxManualPicture } from './pptx-manual-picture.js'
import { applyPptxManualAnimation } from './pptx-manual-animation.js'
import { applyPptxManualShape } from './pptx-manual-shape.js'
import { applyPptxManualParagraph } from './pptx-manual-paragraph.js'
import { applyPptxManualZoom } from './pptx-manual-zoom.js'
import { applyPptxManualInk } from './pptx-manual-ink.js'
import { applyPptxManualClipboard } from './pptx-manual-clipboard.js'
import { applyPptxUpload } from './pptx-manual-upload.js'
import { runPptxHostTxn } from './pptx-group-flip.js'
import { preflightPptxPictureBullets } from './pptx-picture-bullet.js'

/** Stateless service: the browser sends its current unsaved canvas and still owns Save. */
export interface PptxHostRequest {
  documentId: string
  bytes: Uint8Array
  expectedVersion: number
  ops: unknown[]
  action?: PptxHostAction
  signal?: AbortSignal
  generationId?: string
  onDeckProgress?: PptxDeckProgressListener
  /** Original user-selected bytes, scoped to this authenticated request only. */
  attachments?: { name: string; mimeType: string; bytes: Uint8Array }[]
}

export interface PptxHostResult {
  bytes: Uint8Array
  records: OpRecord[]
  version: number
  sampleData: boolean
  changed?: boolean
  data?: unknown
}

export interface PptxManualPictureRequest extends PptxManualPictureFields {
  bytes: Uint8Array
  imageBytes: Uint8Array
  signal?: AbortSignal
}
export interface PptxManualUploadRequest {
  documentId: string
  bytes: Uint8Array
  expectedVersion: number
  input: PptxManualUpload
  assetBytes: Uint8Array
  assetName: string
  assetMime: string
  posterBytes?: Uint8Array
  signal?: AbortSignal
}

export async function applyPptxManualUploadOnHost(
  request: PptxManualUploadRequest,
): Promise<PptxHostResult> {
  if (!Number.isSafeInteger(request.expectedVersion) || request.expectedVersion < 0)
    throw new Error('PPTX画布版本无效')
  const document = await getDocument(request.documentId)
  if (!document || documentAgentFormatOf(document) !== 'pptx')
    throw new Error('文档不存在或不是PPTX')
  if (!(request.bytes instanceof Uint8Array) || request.bytes.length > MAX_ZIP_INPUT_BYTES)
    throw new Error('PPTX原件超过50 MiB上限')
  if (
    !(request.assetBytes instanceof Uint8Array) ||
    !request.assetBytes.length ||
    request.assetBytes.length > PPTX_ASSET_MAX_BYTES
  )
    throw new Error('上传素材须为非空文件，且不超过32 MiB')
  pptxManualUploadSchema.parse(request.input)
  checkSignal(request.signal)
  await (await BoundedZip.open(request.bytes)).preflightAll()
  return applyPptxUpload(request, imageInfo)
}

function checkSignal(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('PPTX 操作已取消；文档未修改')
}

function validatedOps(ops: unknown[]): { ops: Op[]; sampleData: boolean } {
  if (!Array.isArray(ops) || ops.length < 1 || ops.length > 50) {
    throw new Error('PPTX 操作批次必须包含 1–50 项')
  }
  let sampleData = false
  const validated = ops.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(`第 ${index + 1} 项操作不是对象`)
    const op = value as Record<string, unknown>
    if (typeof op.op !== 'string') throw new Error(`第 ${index + 1} 项操作缺少 op 名称`)
    const doc = OP_DOCS[op.op]
    if (!doc || doc.aiCallable === false || doc.pending) {
      throw new Error(`PPTX 操作 ${op.op} 不对 Agent 开放`)
    }
    if (op.op === 'addChart') {
      const source = op.dataSource
      if (source !== 'user' && source !== 'document' && source !== 'sample') {
        throw new Error(
          '图表数字须声明 dataSource 为 user、document 或 sample；当前图表批量操作尚不接受 search 来源',
        )
      }
      if (source === 'sample') sampleData = true
      const chartOp = { ...op }
      delete chartOp.dataSource
      return chartOp as Op
    }
    return op as Op
  })
  return { ops: validated, sampleData }
}

/** Called only by the authenticated document route. Does not persist to the vault. */
export async function applyPptxOpsOnHost(request: PptxHostRequest): Promise<PptxHostResult> {
  const { documentId, bytes, expectedVersion, signal } = request
  if (!documentId) throw new Error('缺少文档 ID')
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0)
    throw new Error('PPTX 画布版本无效')
  const document = await getDocument(documentId)
  if (!document || documentAgentFormatOf(document) !== 'pptx')
    throw new Error('文档不存在或不是 PPTX')
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_ZIP_INPUT_BYTES) {
    throw new Error(`PPTX 原件必须是至多 ${MAX_ZIP_INPUT_BYTES} 字节的二进制数据`)
  }
  if (request.action === 'manual_picture') {
    checkSignal(signal)
    await (await BoundedZip.open(bytes)).preflightAll()
    return applyPptxManualPicture(request)
  }
  if (request.action === 'manual_shape') {
    checkSignal(signal)
    await (await BoundedZip.open(bytes)).preflightAll()
    return applyPptxManualShape(request)
  }
  if (request.action === 'manual_paragraph') {
    checkSignal(signal)
    await (await BoundedZip.open(bytes)).preflightAll()
    return applyPptxManualParagraph(request, imageInfo)
  }
  if (request.action === 'manual_animation') {
    checkSignal(signal)
    await (await BoundedZip.open(bytes)).preflightAll()
    return applyPptxManualAnimation(request)
  }
  if (request.action === 'manual_zoom') {
    checkSignal(signal)
    await (await BoundedZip.open(bytes)).preflightAll()
    return applyPptxManualZoom(request, imageInfo)
  }
  if (request.action === 'manual_fill') {
    checkSignal(signal)
    await (await BoundedZip.open(bytes)).preflightAll()
    return applyPptxManualFill(request, imageInfo)
  }
  if (request.action === 'manual_ink') {
    checkSignal(signal)
    await (await BoundedZip.open(bytes)).preflightAll()
    return applyPptxManualInk(request, imageInfo)
  }
  if (request.action === 'manual_asset') {
    checkSignal(signal)
    await (await BoundedZip.open(bytes)).preflightAll()
    return applyPptxManualClipboard(request)
  }
  if (PPTX_SERVICE_ACTIONS.includes(request.action as (typeof PPTX_SERVICE_ACTIONS)[number])) {
    checkSignal(signal)
    await (await BoundedZip.open(bytes)).preflightAll()
    const output = await applyPptxService(request, (pictureBytes) => {
      const info = imageInfo(pictureBytes)
      if (info.ext !== 'png' && info.ext !== 'jpg')
        throw new Error('Agent 图片服务当前仅支持 PNG 或 JPEG')
      return { ...info, ext: info.ext }
    })
    await (await BoundedZip.open(output.bytes)).preflightAll()
    checkSignal(signal)
    return output
  }
  if (
    request.action !== undefined &&
    request.action !== 'apply_ops' &&
    request.action !== 'edit_chart' &&
    request.action !== 'edit_animation'
  )
    throw new Error('PPTX 操作类型无效')
  const chartInput =
    request.action === 'edit_chart'
      ? pptxChartEditOpSchema.parse(request.ops.length === 1 ? request.ops[0] : null)
      : null
  const animationInput =
    request.action === 'edit_animation'
      ? pptxAnimationTimingOpSchema.parse(request.ops.length === 1 ? request.ops[0] : null)
      : null
  const { ops, sampleData } = chartInput
    ? {
        ops: [{ op: 'setChart', target: chartInput.target, patch: chartInput.patch }] as Op[],
        sampleData: chartInput.dataSource === 'sample',
      }
    : animationInput
      ? { ops: [] as Op[], sampleData: false }
      : validatedOps(request.ops)
  checkSignal(signal)
  await (await BoundedZip.open(bytes)).preflightAll()
  checkSignal(signal)
  const opened = await openPptx(bytes)
  checkSignal(signal)
  if (chartInput) {
    const element = opened.deck.slides[chartInput.target.slide]?.elements.find((item) =>
      matchesElementRef(item, chartInput.target.el),
    )
    if (!element || element.type !== 'chart') throw new Error('所选图表已失效，请重新读取')
    if (element.descr !== 'aislides-chart' && chartInput.confirmImport !== true)
      throw new Error('导入图表首次编辑会转换为可编辑图表，可能简化特殊格式；请确认后继续')
    const patch = chartInput.patch
    if ((patch.categories || patch.series) && !chartInput.dataSource)
      throw new Error('图表数字须声明 dataSource 为 user、document 或 sample')
    if (patch.switchRowCol && (patch.categories || patch.series))
      throw new Error('切换行列不能同时修改图表数据')
    const categories = patch.categories ?? element.chart.categories
    const series = patch.series ?? element.chart.series
    if (series.some((item) => item.values.length !== categories.length))
      throw new Error('图表每个系列的数值数量必须与类别一致')
  }
  if (animationInput) {
    const slide = opened.deck.slides[animationInput.target.slide]
    if (!slide) throw new Error('动画所在幻灯片已失效')
    const items = getSlideAnimations(slide)
    const item = items[animationInput.seq]
    if (!item) throw new Error('所选动画已失效，请重新打开面板')
    items[animationInput.seq] = {
      ...item,
      ...(animationInput.durationMs !== undefined ? { durationMs: animationInput.durationMs } : {}),
      ...(animationInput.delayMs !== undefined ? { delayMs: animationInput.delayMs } : {}),
      ...(animationInput.trigger !== undefined ? { trigger: animationInput.trigger } : {}),
    }
    setSlideAnimations(slide, items)
  }
  preflightPptxPictureBullets(opened, ops)
  const result = animationInput
    ? {
        applied: true,
        records: [{ op: animationInput, after: { count: 1 } }],
        failures: [],
      }
    : runPptxHostTxn(opened, ops)
  if (!result.applied) {
    const reason = result.failures
      ?.map((failure) => `第 ${failure.index + 1} 项：${failure.error}`)
      .join('；')
    throw new Error(reason || 'PPTX 操作未应用')
  }
  checkSignal(signal)
  const output = await savePptx(opened)
  await (await BoundedZip.open(output)).preflightAll()
  checkSignal(signal)
  return { bytes: output, records: result.records ?? [], version: expectedVersion + 1, sampleData }
}

/** Local-file media path; only the two fixed picture operations can carry bytes. */
export async function applyPptxManualPictureOnHost(
  request: PptxManualPictureRequest,
): Promise<PptxHostResult> {
  const { documentId, bytes, expectedVersion, signal } = request
  if (!documentId) throw new Error('缺少文档 ID')
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0)
    throw new Error('PPTX 画布版本无效')
  const document = await getDocument(documentId)
  if (!document || documentAgentFormatOf(document) !== 'pptx')
    throw new Error('文档不存在或不是 PPTX')
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_ZIP_INPUT_BYTES)
    throw new Error('PPTX 原件超过 50 MiB 上限')
  const info = imageInfo(request.imageBytes)
  if (!Number.isSafeInteger(request.slide) || request.slide < 0) throw new Error('幻灯片序号无效')
  if (request.action !== 'insert' && request.action !== 'replace') throw new Error('图片操作无效')
  checkSignal(signal)
  await (await BoundedZip.open(bytes)).preflightAll()
  checkSignal(signal)
  const opened = await openPptx(bytes)
  if (!opened.deck.slides[request.slide]) throw new Error('幻灯片序号已失效')
  const slide = opened.deck.slides[request.slide]!
  if (request.action === 'replace') {
    if (
      !request.elementId ||
      !slide.elements.some(
        (element) => element.type === 'picture' && matchesElementRef(element, request.elementId!),
      )
    )
      throw new Error('所选图片已失效，请重新选择')
  }
  const maxWidth = opened.deck.size.cx * 0.7
  const maxHeight = opened.deck.size.cy * 0.6
  const scale = Math.min(maxWidth / info.width, maxHeight / info.height)
  const width = Math.round(info.width * scale)
  const height = Math.round(info.height * scale)
  const op: Op =
    request.action === 'insert'
      ? {
          op: 'addPicture',
          target: { slide: request.slide },
          bytes: request.imageBytes,
          ext: info.ext,
          offset: {
            x: Math.round((opened.deck.size.cx - width) / 2),
            y: Math.round((opened.deck.size.cy - height) / 2),
            cx: width,
            cy: height,
          },
        }
      : {
          op: 'replacePicture',
          target: { slide: request.slide, el: request.elementId },
          bytes: request.imageBytes,
          ext: info.ext,
        }
  checkSignal(signal)
  const result = runTxn(opened, { ops: [op], isolation: 'atomic' })
  if (!result.applied) throw new Error(result.failures?.[0]?.error ?? '图片操作未应用')
  checkSignal(signal)
  const output = await savePptx(opened)
  await (await BoundedZip.open(output)).preflightAll()
  checkSignal(signal)
  return {
    bytes: output,
    records: result.records ?? [],
    version: expectedVersion + 1,
    sampleData: false,
  }
}
