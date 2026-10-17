import type { PdfInsertLayout, PdfInsertLayoutInput } from '@mimir/shared'
import { applyTextInserts } from '../../../../packages/office/vendor/apps/pdf/src/main/text-edit.js'
import { assertSafeToRewrite, initializePdfAgentHost } from './pdf-agent-host.js'
import { measurePdfNativeBlockText, readPdfNativeBlockObjects } from './pdf-block-writer.js'
import { wrapPdfMeasuredText } from './pdf-block-rewrite.js'
import { matchPdfTextGlyphs } from './pdf-text-glyphs.js'

/** Layout uses a discarded native font probe; no probe bytes reach the working copy. */
export async function layoutPdfTextInsert(
  bytes: Uint8Array,
  input: PdfInsertLayoutInput,
): Promise<PdfInsertLayout> {
  await assertSafeToRewrite(bytes)
  initializePdfAgentHost()
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: bytes.slice() })
  try {
    const pdf = await task.promise
    if (pdf.numPages > 1000) throw new Error('PDF 超过 1000 页排版预算')
    const page = await pdf.getPage(input.pageIndex + 1),
      viewport = page.getViewport({ scale: 1 })
    const before = await readPdfNativeBlockObjects(bytes, input.pageIndex)
    const probe = await applyTextInserts(bytes, [
      {
        pageIndex: input.pageIndex,
        origin: [0, 0],
        text: input.text.replace(/\r\n?/g, '\n'),
        fontSize: input.fontSize,
        color: input.color,
        font: input.font,
        bold: input.bold,
        italic: input.italic,
      },
    ])
    if (probe.skipped.length) throw new Error(probe.skipped[0]!.reason)
    const objects = await readPdfNativeBlockObjects(probe.bytes, input.pageIndex)
    const added = objects.slice(before.length)
    if (!added.length || added.some((object) => object.type !== 1))
      throw new Error('无法核验插字字体')
    const measured = await measurePdfNativeBlockText(
      probe.bytes,
      input.pageIndex,
      added.map((object) => object.objectIndex),
    )
    const logical = input.text.replace(/\r\n?/g, '\n')
    const plan = wrapPdfMeasuredText(logical, measured, input.maxWidth ?? 14400)
    const width = input.maxWidth ?? Math.max(...plan.widths, 0),
      leading = input.fontSize * 1.2
    const height = input.fontSize + Math.max(0, plan.widths.length - 1) * leading
    let x = input.x ?? (viewport.width - width) / 2,
      y = input.y ?? 36
    if (input.anchorText !== undefined) {
      const hits = await matchPdfTextGlyphs(bytes, input.pageIndex, input.anchorText, true)
      if (hits.length !== 1) throw new Error('文字锚点不能唯一定位，请提供更长的原文')
      const rect = [
        ...viewport.convertToViewportPoint(hits[0]!.bounds[0], hits[0]!.bounds[1]),
        ...viewport.convertToViewportPoint(hits[0]!.bounds[2], hits[0]!.bounds[3]),
      ]
      const l = Math.min(rect[0]!, rect[2]!),
        r = Math.max(rect[0]!, rect[2]!),
        t = Math.min(rect[1]!, rect[3]!),
        b = Math.max(rect[1]!, rect[3]!)
      const placement = input.placement ?? 'right'
      x = placement === 'right' ? r + 6 : l
      y = placement === 'above' ? t - height - 6 : placement === 'below' ? b + 6 : t
    }
    if (
      ![x, y, width, height].every(Number.isFinite) ||
      x < 0 ||
      y < 0 ||
      width <= 0 ||
      x + width > viewport.width + 0.01 ||
      y + height > viewport.height + 0.01
    )
      throw new Error('插入文字超出页面，请调整位置、字号或换行宽度')
    const align = input.align ?? 'left'
    return {
      ...input,
      x,
      y,
      wrappedText: plan.text,
      width,
      height,
      lineLeading: leading,
      lineXOffsets: plan.widths.map((advance) =>
        align === 'right' ? width - advance : align === 'center' ? (width - advance) / 2 : 0,
      ),
    }
  } finally {
    await task.destroy()
  }
}
