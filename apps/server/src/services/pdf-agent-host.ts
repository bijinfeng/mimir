import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import type {
  TextEditInput,
  TextInsertInput,
} from '../../../../packages/office/vendor/apps/pdf/src/shared/ipc.js'
import { configurePdfWasmPaths } from '../../../../packages/office/src/shims/pdf-wasm-path.js'

const require = createRequire(import.meta.url)

/** Resolve from server production dependencies, including a pnpm deploy checkout. */
export function pdfAgentAssetPaths(): { pdfium: string; harfbuzz: string } {
  const pdfium = require.resolve('@embedpdf/pdfium/pdfium.wasm')
  const harfbuzz = join(dirname(require.resolve('harfbuzzjs')), 'hb-subset.wasm')
  if (!existsSync(pdfium) || !existsSync(harfbuzz))
    throw new Error('PDF 编辑资源缺失：PDFium 或 HarfBuzz WASM 未打包')
  return { pdfium, harfbuzz }
}

export function initializePdfAgentHost(): void {
  configurePdfWasmPaths(pdfAgentAssetPaths())
}

/** A content-stream rewrite can invalidate signatures or structures we cannot verify. */
async function assertSafeToRewrite(bytes: Uint8Array): Promise<void> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  if (pdf.isEncrypted) throw new Error('这份 PDF 已加密，未写回原件')
  const unknown = pdf.catalog
    .entries()
    .map(([key]) => key.toString())
    .filter((key) => key !== '/Type' && key !== '/Pages')
  if (unknown.length > 0)
    throw new Error(`这份 PDF 含有暂不能安全保留的文档结构（${unknown.join('、')}），未写回原件`)
}

function assertNoSkips(skipped: readonly { reason: string }[]): void {
  if (skipped.length > 0) throw new Error(`PDF 编辑未写入：${skipped[0]!.reason}`)
}

/** Return verified bytes only; the caller writes them through the shared file save path. */
export async function applyPdfTextEdits(
  bytes: Uint8Array,
  edits: readonly TextEditInput[],
): Promise<Uint8Array> {
  if (edits.length < 1 || edits.length > 30) throw new Error('文字编辑数量必须在 1–30 项之间')
  await assertSafeToRewrite(bytes)
  initializePdfAgentHost()
  const { applyTextEdits, verifyTextEdits } =
    await import('../../../../packages/office/vendor/apps/pdf/src/main/text-edit.js')
  const result = await applyTextEdits(bytes.slice(), [...edits])
  assertNoSkips(result.skipped)
  const failures = await verifyTextEdits(
    result.bytes,
    edits.map((edit) => ({
      pageIndex: edit.pageIndex,
      newText: edit.newText,
    })),
  )
  if (failures.length > 0) throw new Error(`PDF 编辑读回失败：${failures[0]!.reason}`)
  return result.bytes
}

/** Add searchable text with the same PDFium writer and independent read-back gate. */
export async function applyPdfTextInserts(
  bytes: Uint8Array,
  inserts: readonly TextInsertInput[],
): Promise<Uint8Array> {
  if (inserts.length < 1 || inserts.length > 30) throw new Error('文字插入数量必须在 1–30 项之间')
  await assertSafeToRewrite(bytes)
  initializePdfAgentHost()
  const { applyTextInserts, verifyTextEdits } =
    await import('../../../../packages/office/vendor/apps/pdf/src/main/text-edit.js')
  const result = await applyTextInserts(bytes.slice(), [...inserts])
  assertNoSkips(result.skipped)
  const failures = await verifyTextEdits(
    result.bytes,
    inserts.map((insert) => ({
      pageIndex: insert.pageIndex,
      newText: insert.text,
    })),
  )
  if (failures.length > 0) throw new Error(`PDF 插入文字读回失败：${failures[0]!.reason}`)
  return result.bytes
}
