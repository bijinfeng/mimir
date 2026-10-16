import {
  PDFDocument,
  PDFName,
  PDFString,
  degrees,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  setTextRenderingMode,
  TextRenderingMode,
  setLineWidth,
  setStrokingColor,
} from 'pdf-lib'
import type { PDFFont } from 'pdf-lib'
import type { Run } from '../../../../packages/office/vendor/packages/docx-engine/src/types.js'
import type { RichContent, RichParagraph, RichTable } from './document-rich-content.js'
import { appearanceFont } from './pdf-forms.js'

type Glyph = { text: string; run: Run; size: number; width: number }
type Line = { glyphs: Glyph[]; height: number; width: number; align?: string; code?: boolean }
const ink = (hex = '20242A') =>
  rgb(
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  )
function linesOf(paragraph: RichParagraph, width: number, font: PDFFont): Line[] {
  const heading = paragraph.type === 'heading' || paragraph.level !== undefined
  const base = heading ? Math.max(12, 24 - (paragraph.level ?? 1) * 2) : 11
  const out: Line[] = []
  let glyphs: Glyph[] = [],
    used = 0,
    largest = base
  const flush = () => {
    out.push({
      glyphs,
      width: used,
      height: largest * 1.55,
      align: paragraph.format?.align,
      code: paragraph.code,
    })
    glyphs = []
    used = 0
    largest = base
  }
  const contentRuns = heading
    ? paragraph.runs.map((run) => ({ ...run, bold: run.bold ?? true }))
    : paragraph.runs
  const runs = paragraph.marker ? [{ text: `${paragraph.marker} ` }, ...contentRuns] : contentRuns
  for (const run of runs) {
    const size = (run.sizeHalfPoints ? run.sizeHalfPoints / 2 : base) * (run.vertAlign ? 0.72 : 1)
    for (const char of run.text.replaceAll('\t', '    ')) {
      if (char === '\n') {
        flush()
        continue
      }
      const w = font.widthOfTextAtSize(char, size)
      if (w > width) throw new Error('PDF 单元格过窄，无法容纳当前字号；请减少列数或字号')
      if (used + w > width && glyphs.length) flush()
      glyphs.push({ text: char, run, size, width: w })
      used += w
      largest = Math.max(largest, size)
    }
  }
  if (glyphs.length || !out.length) flush()
  return out
}

/** Paginated rich text/table output. Formula layout is refused instead of flattened. */
export async function richPdfOf(model: RichContent): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const paragraphs = model.blocks.flatMap((block) =>
    'kind' in block ? block.cells.flatMap((c) => c.paragraphs) : [block],
  )
  for (const p of paragraphs) {
    if (p.format?.align === 'justify')
      throw new Error('PDF 新文档暂不支持两端对齐，请使用左/中/右对齐或创建 DOCX')
    for (const run of p.runs)
      if (run.math) throw new Error('PDF 新文档暂不支持公式排版，请创建 DOCX 以保留可编辑公式')
  }
  const font = await appearanceFont(
    pdf,
    paragraphs.flatMap((p) => p.runs.map((run) => run.text)),
  ).catch((error) => {
    throw new Error(
      error instanceof Error ? error.message.replace('PDF 表单字体', 'PDF 字体') : String(error),
    )
  })
  const width = 595.28,
    height = 841.89,
    margin = 50,
    bodyWidth = width - margin * 2,
    bodyHeight = height - margin * 2
  let page = pdf.addPage([width, height]),
    y = height - margin
  function nextPage() {
    page = pdf.addPage([width, height])
    y = height - margin
  }
  function ensure(h: number) {
    if (y - h < margin) nextPage()
  }
  function drawLine(line: Line, x: number, top: number, available: number) {
    const baseline = top - line.height * 0.77
    let cursor =
      x +
      (line.align === 'center'
        ? (available - line.width) / 2
        : line.align === 'right'
          ? available - line.width
          : 0)
    if (line.code)
      page.drawRectangle({
        x,
        y: top - line.height,
        width: available,
        height: line.height,
        color: ink('F2F3F5'),
      })
    // Group adjacent glyphs sharing a run: preserves readable extraction and shaping.
    const groups: Array<{ run: Run; size: number; text: string; width: number }> = []
    for (const g of line.glyphs) {
      const prev = groups.at(-1)
      if (prev && prev.run === g.run && prev.size === g.size) {
        prev.text += g.text
        prev.width += g.width
      } else groups.push({ run: g.run, size: g.size, text: g.text, width: g.width })
    }
    for (const g of groups) {
      const run = g.run,
        rise =
          run.vertAlign === 'superscript'
            ? g.size * 0.4
            : run.vertAlign === 'subscript'
              ? -g.size * 0.25
              : 0
      if (run.shading)
        page.drawRectangle({
          x: cursor,
          y: baseline - 2,
          width: g.width,
          height: g.size * 1.2,
          color: ink(run.shading),
        })
      const options = {
        x: cursor,
        y: baseline + rise,
        font,
        size: g.size,
        color: ink(run.color),
        ySkew: degrees(run.italic ? 12 : 0),
      }
      if (run.bold)
        page.pushOperators(
          pushGraphicsState(),
          setTextRenderingMode(TextRenderingMode.FillAndOutline),
          setLineWidth(0.3),
          setStrokingColor(ink(run.color)),
        )
      if (g.text === '• ')
        page.drawCircle({
          x: cursor + 4,
          y: baseline + g.size * 0.3,
          size: 1.7,
          color: ink(run.color),
        })
      else page.drawText(g.text, options)
      if (run.bold) page.pushOperators(popGraphicsState())
      if (run.underline || run.strike)
        page.drawLine({
          start: { x: cursor, y: baseline + rise + (run.strike ? g.size * 0.3 : -1.5) },
          end: { x: cursor + g.width, y: baseline + rise + (run.strike ? g.size * 0.3 : -1.5) },
          thickness: 0.55,
          color: ink(run.color),
        })
      if (run.underline && run.strike)
        page.drawLine({
          start: { x: cursor, y: baseline + rise - 1.5 },
          end: { x: cursor + g.width, y: baseline + rise - 1.5 },
          thickness: 0.55,
          color: ink(run.color),
        })
      if (run.link) {
        const annotation = pdf.context.register(
          pdf.context.obj({
            Type: 'Annot',
            Subtype: 'Link',
            Rect: [cursor, baseline - 2, cursor + g.width, baseline + g.size],
            Border: [0, 0, 0],
            A: { Type: 'Action', S: 'URI', URI: PDFString.of(run.link.href) },
          }),
        )
        page.node.addAnnot(annotation)
      }
      cursor += g.width
    }
  }
  function drawParagraph(p: RichParagraph) {
    const indent = p.list ? (p.list.ilvl + 1) * 18 : (p.format?.indentLeft ?? 0) / 20
    const available = bodyWidth - indent - (p.quote ? 12 : 0)
    const lines = linesOf(p, available, font)
    if (p.type === 'heading' || p.level !== undefined) {
      ensure(lines[0]!.height + 24)
      y -= 8
    }
    for (const line of lines) {
      ensure(line.height)
      if (p.quote)
        page.drawLine({
          start: { x: margin + indent - 8, y },
          end: { x: margin + indent - 8, y: y - line.height },
          thickness: 2,
          color: ink('BCC4CE'),
        })
      drawLine(line, margin + indent, y, available)
      y -= line.height
    }
    y -= 6
  }
  function drawTable(table: RichTable) {
    const colWidth = bodyWidth / table.cols,
      padding = 6
    const rendered = table.cells.map((cell) => ({
      cell,
      lines: cell.paragraphs.flatMap((p) =>
        linesOf(p, colWidth * cell.colSpan - padding * 2, font),
      ),
    }))
    const heights = Array<number>(table.rows).fill(24)
    for (const item of rendered.filter((i) => i.cell.rowSpan === 1))
      heights[item.cell.row] = Math.max(
        heights[item.cell.row]!,
        item.lines.reduce((h, l) => h + l.height, padding * 2),
      )
    for (const item of rendered.filter((i) => i.cell.rowSpan > 1)) {
      const current = heights
        .slice(item.cell.row, item.cell.row + item.cell.rowSpan)
        .reduce((a, b) => a + b, 0)
      const required = item.lines.reduce((h, l) => h + l.height, padding * 2)
      if (required > current) heights[item.cell.row + item.cell.rowSpan - 1]! += required - current
    }
    function drawCell(item: (typeof rendered)[number], top: number, h: number, lines: Line[]) {
      const x = margin + item.cell.col * colWidth,
        w = item.cell.colSpan * colWidth
      page.drawRectangle({
        x,
        y: top - h,
        width: w,
        height: h,
        ...(item.cell.fill ? { color: ink(item.cell.fill) } : {}),
        borderColor: ink('BCC4CE'),
        borderWidth: 0.5,
      })
      let topLine = top - padding
      for (const line of lines) {
        drawLine(line, x + padding, topLine, w - padding * 2)
        topLine -= line.height
      }
    }
    for (let row = 0; row < table.rows;) {
      let end = row + 1
      for (let scan = row; scan < end; scan++)
        for (const { cell } of rendered)
          if (cell.row === scan) end = Math.max(end, cell.row + cell.rowSpan)
      const groupHeight = heights.slice(row, end).reduce((a, b) => a + b, 0)
      if (groupHeight <= bodyHeight) {
        ensure(groupHeight)
        const startY = y
        for (const item of rendered.filter((i) => i.cell.row >= row && i.cell.row < end)) {
          const top = startY - heights.slice(row, item.cell.row).reduce((a, b) => a + b, 0)
          const h = heights
            .slice(item.cell.row, item.cell.row + item.cell.rowSpan)
            .reduce((a, b) => a + b, 0)
          drawCell(item, top, h, item.lines)
        }
        y -= groupHeight
      } else {
        if (end !== row + 1) throw new Error('PDF 跨行合并单元格组超过一页，请拆分该组或创建 DOCX')
        // A long ordinary row is split into page-sized bands across all columns.
        const items = rendered.filter((i) => i.cell.row === row),
          remaining = items.map((i) => [...i.lines])
        while (remaining.some((ls) => ls.length)) {
          if (y - margin < 36) nextPage()
          const room = y - margin - padding * 2
          const chunks = remaining.map((ls) => {
            const taken: Line[] = []
            let used = 0
            while (ls.length && used + ls[0]!.height <= room) {
              const line = ls.shift()!
              taken.push(line)
              used += line.height
            }
            return taken
          })
          if (!chunks.some((ls) => ls.length)) {
            nextPage()
            continue
          }
          const h = Math.max(...chunks.map((ls) => ls.reduce((a, l) => a + l.height, padding * 2)))
          items.forEach((item, i) => drawCell(item, y, h, chunks[i]!))
          y -= h
          if (remaining.some((ls) => ls.length)) nextPage()
        }
      }
      row = end
    }
    y -= 8
  }
  for (const block of model.blocks) {
    if ('kind' in block) drawTable(block)
    else drawParagraph(block)
  }
  // No opaque generated metadata is required for reopening/editing the result.
  pdf.catalog.set(PDFName.of('Lang'), PDFString.of('zh-CN'))
  return pdf.save()
}
