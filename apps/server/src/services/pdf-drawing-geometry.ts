import { PDFHexString, PDFString, PDFName, type PDFPage } from 'pdf-lib'
import { pdfDrawingSchema, type PdfLocalInfo } from '@mimir/shared'
import { z } from 'zod'

const cachedDrawingsSchema = z
  .array(pdfDrawingSchema.extend({ id: z.string().min(1).max(200) }))
  .max(500)

/** Private page dictionaries originate in uploaded files, too. */
export function readPdfDrawings(page: PDFPage): PdfLocalInfo['drawings'] {
  const raw = page.node.lookup(PDFName.of('MimirDrawings'))
  if (!raw) return []
  if (!(raw instanceof PDFHexString || raw instanceof PDFString))
    throw new Error('PDF 编辑绘图数据损坏')
  let input: unknown
  try {
    input = JSON.parse(raw.decodeText())
  } catch {
    throw new Error('PDF 编辑绘图数据损坏')
  }
  // Reject counts before schema traversal allocates parsed point/object copies.
  if (
    !Array.isArray(input) ||
    input.length > 500 ||
    input.some(
      (d: unknown) =>
        typeof d === 'object' &&
        d !== null &&
        'points' in d &&
        Array.isArray(d.points) &&
        d.points.length > 2000,
    )
  )
    throw new Error('PDF 编辑绘图超过 500 项 / 每项 2000 点')
  const result = cachedDrawingsSchema.safeParse(input)
  if (!result.success) throw new Error('PDF 编辑绘图数据无效或超过 500 项 / 每项 2000 点')
  return result.data
}

export interface PdfDrawingGeometry {
  box: { x: number; y: number; width: number; height: number }
  rotation: number
}
const quarter = (value: number) => ((value % 360) + 360) % 360
export function pdfDrawingGeometry(page: PDFPage): PdfDrawingGeometry {
  return { box: page.getCropBox(), rotation: quarter(page.getRotation().angle) }
}
function toUser(
  [x, y]: [number, number],
  { box: b, rotation: r }: PdfDrawingGeometry,
): [number, number] {
  if (r === 90) return [b.x + y, b.y + x]
  if (r === 180) return [b.x + b.width - x, b.y + y]
  if (r === 270) return [b.x + b.width - y, b.y + b.height - x]
  return [b.x + x, b.y + b.height - y]
}
function fromUser(
  [x, y]: [number, number],
  { box: b, rotation: r }: PdfDrawingGeometry,
): [number, number] {
  if (r === 90) return [y - b.y, x - b.x]
  if (r === 180) return [b.x + b.width - x, y - b.y]
  if (r === 270) return [b.y + b.height - y, b.x + b.width - x]
  return [x - b.x, b.y + b.height - y]
}

/** Keep the editable cache in the same displayed coordinates as the existing PDF stream. */
export function transformPdfDrawings(page: PDFPage, before: PdfDrawingGeometry, scale = 1) {
  const current = readPdfDrawings(page)
  if (!current.length) return
  const after = pdfDrawingGeometry(page),
    delta = quarter(after.rotation - before.rotation),
    point = (p: [number, number]) => {
      const [x, y] = toUser(p, before)
      return fromUser([x * scale, y * scale], after)
    }
  const drawings = current.map((d) => {
    const { id, ...base } = d
    const corners = [
        point([d.x, d.y]),
        point([d.x + d.width, d.y]),
        point([d.x, d.y + d.height]),
        point([d.x + d.width, d.y + d.height]),
      ],
      x = Math.min(...corners.map((p) => p[0])),
      y = Math.min(...corners.map((p) => p[1])),
      input = pdfDrawingSchema.parse(
        Object.assign({}, base, {
          x,
          y,
          width: Math.max(...corners.map((p) => p[0])) - x,
          height: Math.max(...corners.map((p) => p[1])) - y,
          thickness: d.thickness * scale,
          rotation: quarter((d.rotation ?? 0) + delta),
          arrowHeadLength:
            d.kind === 'arrow'
              ? (d.arrowHeadLength ?? Math.min(12, d.width / 3, d.height / 3)) * scale
              : d.arrowHeadLength,
          points: d.points?.map(point),
        }),
      )
    return Object.assign(input, { id })
  })
  page.node.set(PDFName.of('MimirDrawings'), PDFHexString.fromText(JSON.stringify(drawings)))
}
