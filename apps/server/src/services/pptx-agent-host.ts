import { PPTX_IMAGE_MAX_BYTES, type PptxManualPictureFields } from '@mimir/shared'
import {
  openPptx,
  savePptx,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
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

/** Stateless service: the browser sends its current unsaved canvas and still owns Save. */
export interface PptxHostRequest {
  documentId: string
  bytes: Uint8Array
  expectedVersion: number
  ops: unknown[]
  signal?: AbortSignal
}

export interface PptxHostResult {
  bytes: Uint8Array
  records: OpRecord[]
  version: number
  sampleData: boolean
}

export interface PptxManualPictureRequest extends PptxManualPictureFields {
  bytes: Uint8Array
  imageBytes: Uint8Array
  signal?: AbortSignal
}

function imageInfo(bytes: Uint8Array): { ext: 'png' | 'jpg'; width: number; height: number } {
  if (!(bytes instanceof Uint8Array) || bytes.length < 24 || bytes.length > PPTX_IMAGE_MAX_BYTES)
    throw new Error('图片必须是小于 8 MiB 的 PNG 或 JPEG')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a &&
    bytes[12] === 0x49 &&
    bytes[13] === 0x48 &&
    bytes[14] === 0x44 &&
    bytes[15] === 0x52
  ) {
    const width = view.getUint32(16)
    const height = view.getUint32(20)
    if (width > 0 && height > 0 && width <= 16_384 && height <= 16_384)
      return { ext: 'png', width, height }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2
    while (at + 4 < bytes.length) {
      if (bytes[at] !== 0xff) break
      const marker = bytes[at + 1]!
      at += 2
      if (marker === 0xda || marker === 0xd9) break
      if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
      const length = view.getUint16(at)
      if (length < 2 || at + length > bytes.length) break
      if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker) && length >= 7) {
        const height = view.getUint16(at + 3)
        const width = view.getUint16(at + 5)
        if (width > 0 && height > 0 && width <= 16_384 && height <= 16_384)
          return { ext: 'jpg', width, height }
      }
      at += length
    }
  }
  throw new Error('图片格式或尺寸无效；请选择 PNG 或 JPEG')
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
          '图表数字须声明 dataSource 为 user、document 或 sample；当前 PPTX 工具未接通 web_search',
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
  const { ops, sampleData } = validatedOps(request.ops)
  checkSignal(signal)
  await (await BoundedZip.open(bytes)).preflightAll()
  checkSignal(signal)
  const opened = await openPptx(bytes)
  checkSignal(signal)
  const result = runTxn(opened, { ops, isolation: 'atomic' })
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
