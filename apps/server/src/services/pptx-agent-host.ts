import {
  openPptx,
  savePptx,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
import { OP_DOCS } from '../../../../packages/office/vendor/packages/pptx-ops/src/op-docs.js'
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
