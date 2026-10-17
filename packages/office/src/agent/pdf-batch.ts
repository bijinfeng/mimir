import {
  pdfBatchArgsSchema,
  type PdfBatchArgs,
  type PdfNativeBatchOp,
  type PdfAnnotationSnapshot,
} from '@mimir/shared'
import type { PdfPendingTextInsert } from './pdf-agent.js'
import type { PdfHostAnnotations } from './pdf-content-agent.js'
import type { PdfHostLocal } from './pdf-local-agent.js'
import type { PdfHostApply } from '../editors/PdfEditor.js'
import { loadPdfDocument } from '../editors/pdf-render.js'
import { readPdfPages } from '../editors/pdf-pages.js'

export interface PdfPendingTextState {
  documentId: string
  source: Uint8Array
  /** Raw bytes without any of the pending inserts. */
  base: Uint8Array
  inserts: readonly PdfPendingTextInsert[]
}

export const hasPdfBatchPageOps = (ops: PdfBatchArgs['ops']) =>
  ops.some((op) => ['rotatePages', 'deletePage', 'setPageOrder'].includes(op.op))

/** Compute only; the caller publishes after its final identity check. */
export async function replayPdfPendingText({
  base,
  inserts,
  version,
  apply,
  assertCurrent,
  signal,
}: {
  base: Uint8Array
  inserts: readonly PdfPendingTextInsert[]
  version: number
  apply?: PdfHostApply
  assertCurrent(): void
  signal?: AbortSignal
}): Promise<Uint8Array> {
  assertCurrent()
  if (inserts.length > 30) throw new Error('一次最多保留 30 段待保存文字')
  if (!inserts.length) return base
  if (!apply) throw new Error('PDF 文字宿主执行器尚未就绪')
  const pdf = await loadPdfDocument(base)
  assertCurrent()
  const items = []
  for (const insert of inserts) {
    const page = await pdf.getPage(insert.pageIndex + 1)
    assertCurrent()
    const viewport = page.getViewport({ scale: 1 })
    if (
      ![insert.x, insert.y, insert.fontSize].every(Number.isFinite) ||
      insert.fontSize <= 0 ||
      insert.fontSize > 500 ||
      insert.x < 0 ||
      insert.y < 0 ||
      insert.x > viewport.width ||
      insert.y + insert.fontSize > viewport.height
    )
      throw new Error(`文字 ${insert.id} 的位置超出页面范围`)
    items.push({
      pageIndex: insert.pageIndex,
      origin: viewport.convertToPdfPoint(insert.x, insert.y + insert.fontSize),
      text: insert.text,
      fontSize: insert.fontSize,
      color: insert.color,
    })
  }
  assertCurrent()
  const response = await apply({
    bytes: base,
    expectedVersion: version,
    kind: 'insert',
    items,
    signal,
  })
  assertCurrent()
  if (response.version !== version + 1 || !response.bytes?.length)
    throw new Error('PDF 文字宿主返回了错误的画布版本或字节')
  return response.bytes
}

async function geometry(bytes: Uint8Array, assertCurrent: () => void) {
  const pdf = await loadPdfDocument(bytes)
  assertCurrent()
  const result: number[][] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    assertCurrent()
    const v = page.getViewport({ scale: 1 })
    result.push([page.rotate, page.userUnit, ...page.view, v.width, v.height, ...v.transform])
  }
  return result
}

async function assertSameGeometry(a: Uint8Array, b: Uint8Array, assertCurrent: () => void) {
  if (a === b) return
  const before = await geometry(a, assertCurrent)
  const after = await geometry(b, assertCurrent)
  if (
    before.length !== after.length ||
    before.some(
      (page, i) =>
        page.length !== after[i]!.length ||
        page.some(
          (n, j) =>
            !Number.isFinite(n) ||
            !Number.isFinite(after[i]![j]) ||
            Math.abs(n - after[i]![j]!) > 1e-6,
        ),
    )
  )
    throw new Error('PDF 批次意外改变了页面几何，结果未应用')
}

export async function buildPdfBatchCandidate({
  args: raw,
  bytes,
  pending,
  version,
  local,
  apply,
  annotations,
  assertCurrent,
  signal,
}: {
  args: unknown
  bytes: Uint8Array
  pending: PdfPendingTextState | null
  version: number
  local?: PdfHostLocal
  apply?: PdfHostApply
  annotations?: PdfHostAnnotations
  assertCurrent(): void
  signal?: AbortSignal
}) {
  const args = pdfBatchArgsSchema.parse(raw)
  const removed = new Set<string>()
  const native: PdfNativeBatchOp[] = []
  const nativeIndexes: number[] = []
  for (const [index, op] of args.ops.entries()) {
    if (op.op === 'removeTextInsert') {
      if (removed.has(op.id) || !pending?.inserts.some((insert) => insert.id === op.id))
        throw new Error(`PDF 批次第 ${index + 1} 项：找不到或重复删除待保存文字；保存后请重新读取`)
      removed.add(op.id)
    } else {
      native.push(op)
      nativeIndexes.push(index)
    }
  }
  const survivors = pending?.inserts.filter((insert) => !removed.has(insert.id)) ?? []
  const pageOps = hasPdfBatchPageOps(args.ops)
  const base0 = pending?.base ?? bytes
  let candidate = base0
  const targets = native.filter((op) => op.op === 'setNoteContents' || op.op === 'removeMarkup')
  const readAnnotations = async (value: Uint8Array): Promise<PdfAnnotationSnapshot> => {
    if (!annotations) throw new Error('PDF 批注宿主未连接')
    const result = await annotations({
      bytes: value,
      expectedVersion: version,
      operation: { op: 'read' },
      signal,
    })
    assertCurrent()
    if (result.bytes || result.version !== version) throw new Error('PDF 批注读取版本无效')
    return result.annotations
  }
  if (pending && targets.length) {
    if (targets.some((op) => /^R\d+-\d+$/.test(op.id)))
      throw new Error('旧批注对象标识与待保存插字不能可靠映射，请先保存插字并重新读取批注')
    const current = await readAnnotations(bytes)
    const base = await readAnnotations(base0)
    for (const op of targets) {
      const now = current.annotations.filter((entry) => entry.id === op.id)
      const old = base.annotations.filter((entry) => entry.id === op.id)
      if (now.length !== 1 || old.length !== 1 || JSON.stringify(now[0]) !== JSON.stringify(old[0]))
        throw new Error('PDF 批注身份已变化，请先保存插字并重新读取批注')
    }
  }
  const replay = (base: Uint8Array) =>
    replayPdfPendingText({ base, inserts: survivors, version, apply, assertCurrent, signal })
  if (pageOps && pending) {
    candidate = await replay(base0)
    if (targets.length) {
      const after = await readAnnotations(candidate)
      const before = await readAnnotations(base0)
      for (const op of targets)
        if (
          JSON.stringify(after.annotations.find((entry) => entry.id === op.id)) !==
          JSON.stringify(before.annotations.find((entry) => entry.id === op.id))
        )
          throw new Error('重建插字后批注身份不一致，未应用批次')
    }
  }
  let info
  if (native.length) {
    if (!local) throw new Error('PDF 本地批次宿主未连接')
    assertCurrent()
    // Dry runs compute temporary bytes too; only the outer publisher discards them.
    const response = await local({
      bytes: candidate,
      expectedVersion: version,
      operation: { op: 'apply_ops', ops: native },
      signal,
    }).catch((cause: unknown) => {
      if (cause instanceof Error) {
        const match = /^PDF 批次第 (\d+) 项：/.exec(cause.message)
        const original = match ? nativeIndexes[Number(match[1]) - 1] : undefined
        if (original !== undefined)
          throw new Error(
            cause.message.replace(/^PDF 批次第 \d+ 项：/, `PDF 批次第 ${original + 1} 项：`),
            { cause },
          )
      }
      throw cause
    })
    assertCurrent()
    if (!response.bytes?.length || response.version !== version + 1 || response.outputs)
      throw new Error('PDF 批次宿主返回版本或字节无效')
    candidate = response.bytes
    info = response.info
  }
  const nextBase = candidate
  if (!pageOps && pending) {
    await assertSameGeometry(base0, candidate, assertCurrent)
    candidate = await replay(candidate)
    await assertSameGeometry(nextBase, candidate, assertCurrent)
    if (targets.length) {
      const before = await readAnnotations(nextBase)
      const after = await readAnnotations(candidate)
      if (JSON.stringify(before.annotations) !== JSON.stringify(after.annotations))
        throw new Error('重建插字后批注读回不一致，未应用批次')
    }
  }
  const structure = await readPdfPages(candidate)
  assertCurrent()
  return {
    bytes: candidate,
    structure,
    nextPending:
      !pageOps && pending && survivors.length
        ? { ...pending, base: nextBase, inserts: survivors }
        : null,
    info,
    dryRun: args.dry_run === true,
    data: {
      removedTextIds: [...removed],
      survivingTextIds: pageOps ? [] : survivors.map((insert) => insert.id),
      materializedTextIds: pageOps ? survivors.map((insert) => insert.id) : [],
      message:
        pageOps && survivors.length
          ? args.dry_run
            ? '校验通过；执行此批次会物化幸存插字，原 T 标识将不再可编辑'
            : '幸存插字已随页面操作物化，原 T 标识不再可编辑'
          : undefined,
    },
  }
}
