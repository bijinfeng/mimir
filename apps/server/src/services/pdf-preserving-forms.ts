import { pdfFormOperationSchema, type PdfFormOperation, type PdfFormSnapshot } from '@mimir/shared'
import { PDFDocument } from 'pdf-lib'
import { applyPdfFormOperation, assertPdfFormSafe, readPdfFormFields } from './pdf-forms.js'
import { applyPdfLocalOperation } from './pdf-local.js'
import { assertPdfPreservingSafe } from './pdf-preserving-guard.js'

/** Explicit preserving form path; the legacy writer keeps its strict default guard. */
export async function applyPreservingPdfFormOperation(
  bytes: Uint8Array,
  raw: PdfFormOperation,
  expectedSha256?: string,
): Promise<{ bytes?: Uint8Array; forms: PdfFormSnapshot }> {
  const operation = pdfFormOperationSchema.parse(raw)
  if (operation.op === 'read' || operation.ops.every((op) => op.op === 'setFormValue'))
    return applyPdfFormOperation(bytes, operation, expectedSha256, assertPdfPreservingSafe)

  const original = await readPdfFormFields(bytes)
  if (expectedSha256 !== original.sha256) throw new Error('PDF 表单字节已变化，请重新读取')
  assertPdfFormSafe(
    await PDFDocument.load(bytes.slice(), { updateMetadata: false }),
    assertPdfPreservingSafe,
  )
  // The local executor already remaps native outlines and removes stale page
  // targets. Compute even dry runs in temporary bytes, then publish nothing.
  const result = await applyPdfLocalOperation(bytes, { op: 'apply_ops', ops: operation.ops })
  if (!result.bytes) throw new Error('PDF 表单页面批次未返回工作副本')
  const forms = await readPdfFormFields(result.bytes)
  return operation.dryRun ? { forms: original } : { bytes: result.bytes, forms }
}
