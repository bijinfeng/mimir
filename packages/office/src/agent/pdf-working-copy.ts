import type { PdfLocalOperation } from '@mimir/shared'
import { buildPdfBytes, readPdfPages, type PdfPageRef } from '../editors/pdf-pages.js'
import { planPdfPageOperations } from './pdf-page-plan.js'
import type { PdfHostLocal } from './pdf-local-agent.js'

/** Materialize unsaved layout in temporary bytes, never write the source. */
export async function buildPdfWorkingCopy({
  bytes,
  layout,
  imports,
  host,
  version,
  assertCurrent,
  signal,
}: {
  bytes: Uint8Array
  layout: readonly PdfPageRef[]
  imports: ReadonlyMap<string, Uint8Array>
  host?: PdfHostLocal
  version: number
  assertCurrent(): void
  signal?: AbortSignal
}) {
  if (!host) return buildPdfBytes({ bytes, layout: [...layout], imports: new Map(imports) })
  const original = await readPdfPages(bytes)
  assertCurrent()
  const perform = async (operation: PdfLocalOperation, assetFile?: File) => {
    assertCurrent()
    const result = await host({ bytes, operation, assetFile, expectedVersion: version, signal })
    assertCurrent()
    if (!result.bytes || result.version !== version + 1) throw new Error('PDF 页面操作响应无效')
    bytes = result.bytes
  }
  const simple = planPdfPageOperations(layout, original)
  if (simple) {
    for (let i = 0; i < simple.length; i += 30)
      await perform({ op: 'apply_ops', ops: simple.slice(i, i + 30) })
    return bytes
  }
  const offsets = new Map<string, { offset: number; count: number }>()
  let total = original.length
  for (const page of layout) {
    if (page.origin.kind !== 'imported' || offsets.has(page.origin.source)) continue
    const source = page.origin.source
    const asset = imports.get(source)
    if (!asset) throw new Error('导入来源已失效，请重新选择 PDF')
    const count = (await readPdfPages(asset)).length
    assertCurrent()
    const sourcePages = [
      ...new Set(
        layout.flatMap((p) =>
          p.origin.kind === 'imported' && p.origin.source === source ? [p.origin.index + 1] : [],
        ),
      ),
    ].toSorted((a, b) => a - b)
    if (sourcePages.some((index) => index < 1 || index > count)) throw new Error('导入页码越界')
    // Only selected source pages count toward the transient page budget.
    await perform(
      { op: 'import_pages', after_page: total, source_pages: sourcePages.join(',') },
      new File([asset.slice().buffer], 'selected-source.pdf', { type: 'application/pdf' }),
    )
    offsets.set(page.origin.source, { offset: total, count: sourcePages.length })
    total += sourcePages.length
  }
  const pages: Extract<PdfLocalOperation, { op: 'apply_page_layout' }>['pages'] = layout.map(
    (page) => {
      let source_page: number | undefined
      if (page.origin.kind === 'original') source_page = page.origin.index + 1
      if (page.origin.kind === 'imported') {
        const source = page.origin.source
        const selected = [
          ...new Set(
            layout.flatMap((p) =>
              p.origin.kind === 'imported' && p.origin.source === source ? [p.origin.index] : [],
            ),
          ),
        ].toSorted((a, b) => a - b)
        source_page = offsets.get(source)!.offset + selected.indexOf(page.origin.index) + 1
      }
      if (![0, 90, 180, 270].includes(page.rotation)) throw new Error('页面旋转角度无效')
      return {
        ...(source_page ? { source_page } : { blank: page.base }),
        rotation: page.rotation as 0 | 90 | 180 | 270,
        ...(page.crop ? { crop: page.crop } : {}),
        ...(page.paper ? { paper: page.paper } : {}),
      }
    },
  )
  await perform({ op: 'apply_page_layout', pages })
  return bytes
}
