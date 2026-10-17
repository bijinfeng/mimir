import {
  chainPdfium,
  loadPdfium,
  withDocument,
  foldMap,
} from '../../../../packages/office/vendor/apps/pdf/src/main/text-edit.js'
import { initializePdfAgentHost } from './pdf-agent-host.js'

type Bounds = [number, number, number, number]
export interface PdfGlyphHit {
  boxes: Bounds[]
  quads: number[][]
  bounds: Bounds
  glyphCount: number
}
export const unionPdfGlyphBoxes = (boxes: readonly Bounds[]): Bounds => [
  Math.min(...boxes.map((b) => b[0])),
  Math.min(...boxes.map((b) => b[1])),
  Math.max(...boxes.map((b) => b[2])),
  Math.max(...boxes.map((b) => b[3])),
]
/** PDFium's source codepoints and actual user-space glyph boxes, never run-width estimates. */
export async function matchPdfTextGlyphs(
  bytes: Uint8Array,
  pageIndex: number,
  needle: string,
  all = false,
): Promise<PdfGlyphHit[]> {
  const wanted = foldMap(needle).units
  if (
    !wanted.length ||
    needle.length > 10000 ||
    [...needle].some((char) => char.codePointAt(0)! < 32 && !'\t\n\r'.includes(char))
  )
    throw new Error('请提供非空原文片段')
  // Linear matching keeps repeated long fragments within the native page budget.
  const failure = Array<number>(wanted.length).fill(0)
  for (let at = 1, rank = 0; at < wanted.length; at++) {
    while (rank > 0 && wanted[at] !== wanted[rank]) rank = failure[rank - 1]!
    if (wanted[at] === wanted[rank]) rank++
    failure[at] = rank
  }
  initializePdfAgentHost()
  return chainPdfium(async () => {
    const m = await loadPdfium()
    const {
      _FPDF_GetPageCount: getPageCount,
      _FPDF_LoadPage: loadPage,
      _FPDFText_LoadPage: loadTextPage,
      _FPDFText_CountChars: countChars,
      _malloc: allocate,
      _free: free,
      _FPDFText_ClosePage: closeTextPage,
      _FPDF_ClosePage: closePage,
    } = m
    return withDocument(m, bytes, async (doc) => {
      if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= getPageCount(doc))
        throw new Error('原文页号已失效')
      const page = loadPage(doc, pageIndex)
      if (!page) throw new Error('无法读取原文页面')
      // Extraction order must not depend on the viewer's page rotation. This private
      // read-only document is never serialized; glyph boxes stay in user space.
      const rotationApi = m as typeof m & {
        _FPDFPage_SetRotation(page: number, rotation: number): void
      }
      const { _FPDFPage_SetRotation: setRotation } = rotationApi
      setRotation(page, 0)
      const textPage = loadTextPage(page),
        ptr = allocate(32)
      try {
        if (!textPage) throw new Error('无法读取原文字形')
        const count = countChars(textPage)
        if (count < 0 || count > 200000) throw new Error('原文字形超过单页预算')
        const glyphApi = m as typeof m & {
          _FPDFPageObj_GetClipPath(object: number): number
          _FPDFClipPath_CountPaths(clip: number): number
          _FPDFText_GetTextObject(page: number, at: number): number
          _FPDFText_GetUnicode(page: number, at: number): number
          _FPDFText_IsGenerated(page: number, at: number): number
          _FPDFText_GetCharAngle(page: number, at: number): number
          _FPDFText_GetCharOrigin(page: number, at: number, x: number, y: number): number
          _FPDFText_GetCharBox(
            page: number,
            at: number,
            l: number,
            r: number,
            b: number,
            t: number,
          ): number
        }
        const {
          _FPDFText_GetUnicode: getUnicode,
          _FPDFText_GetTextObject: getTextObject,
          _FPDFText_GetCharAngle: getAngle,
          _FPDFText_GetCharOrigin: getOrigin,
          _FPDFText_IsGenerated: isGenerated,
          _FPDFText_GetCharBox: getBox,
          _FPDFPageObj_GetClipPath: getClipPath,
          _FPDFClipPath_CountPaths: countClipPaths,
        } = glyphApi
        const clippedObjects = new Map<number, boolean>()
        const units: {
          value: string
          source: number
          box?: Bounds
          angle: number
          baseline?: number
        }[] = []
        let previousGlyph: { source: number; end: number; object: number; box: Bounds } | undefined
        for (let at = 0; at < count; at++) {
          let code = getUnicode(textPage, at)
          let paired = false
          if (code >= 0xd800 && code <= 0xdbff && at + 1 < count) {
            const low = getUnicode(textPage, at + 1)
            if (low >= 0xdc00 && low <= 0xdfff) {
              code = 0x10000 + ((code - 0xd800) << 10) + low - 0xdc00
              paired = true
            }
          }
          if (!code || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
            previousGlyph = undefined
            units.push({ value: '\u0000', source: at, angle: 0 })
            continue
          }
          const char = String.fromCodePoint(code),
            folded = foldMap(char).units
          if (!folded.length) continue
          const object = getTextObject(textPage, at)
          if (!clippedObjects.has(object)) {
            const clip = getClipPath(object)
            clippedObjects.set(object, !!clip && countClipPaths(clip) > 0)
          }
          let box: Bounds | undefined
          const angle = ((((getAngle(textPage, at) * 180) / Math.PI) % 360) + 360) % 360
          if (
            !isGenerated(textPage, at) &&
            !clippedObjects.get(object) &&
            getBox(textPage, at, ptr, ptr + 8, ptr + 16, ptr + 24)
          ) {
            const values = [0, 16, 8, 24].map((offset) => m.HEAPF64[(ptr + offset) >> 3]!) as Bounds
            if (values.every(Number.isFinite) && values[2] > values[0] && values[3] > values[1])
              box = values
          }
          let baseline: number | undefined
          if (getOrigin(textPage, at, ptr, ptr + 8)) {
            const x = m.HEAPF64[ptr >> 3]!,
              y = m.HEAPF64[(ptr + 8) >> 3]!,
              radian = (angle * Math.PI) / 180
            baseline = -Math.sin(radian) * x + Math.cos(radian) * y
          }
          // PDFium expands presentation ligatures (e.g. ﬁ → f/i) into multiple
          // source entries with the same physical glyph box. Keep that cluster
          // indivisible, just as an NFKC expansion of one source codepoint is.
          const source =
            box &&
            previousGlyph?.end === at - 1 &&
            previousGlyph.object === object &&
            box.every((value, index) => Math.abs(value - previousGlyph!.box[index]!) < 0.0001)
              ? previousGlyph.source
              : at
          previousGlyph = box ? { source, end: paired ? at + 1 : at, object, box } : undefined
          for (const value of folded) units.push({ value, source, box, angle, baseline })
          if (paired) at++
        }
        const hits: PdfGlyphHit[] = []
        for (let end = 0, rank = 0; end < units.length; end++) {
          while (rank > 0 && units[end]!.value !== wanted[rank]) rank = failure[rank - 1]!
          if (units[end]!.value === wanted[rank]) rank++
          if (rank !== wanted.length) continue
          const at = end - wanted.length + 1
          rank = failure[rank - 1]!
          if (
            units[at - 1]?.source === units[at]!.source ||
            units[end + 1]?.source === units[end]!.source
          )
            continue
          const matched = units.slice(at, end + 1)
          if (matched.some((unit) => !unit.box || !Number.isFinite(unit.baseline)))
            throw new Error('命中文字缺少可靠的原生字形位置，未添加标注')
          const unique = [...new Map(matched.map((unit) => [unit.source, unit])).values()]
          const groups: { boxes: Bounds[]; angle: number; baseline: number }[] = []
          for (const unit of unique) {
            const previous = groups.at(-1)
            if (
              previous &&
              Math.abs(previous.angle - unit.angle) < 0.1 &&
              Math.abs(previous.baseline - unit.baseline!) < 0.5
            )
              previous.boxes.push(unit.box!)
            else groups.push({ boxes: [unit.box!], angle: unit.angle, baseline: unit.baseline! })
          }
          // Merge only actual neighboring glyphs on the same native baseline. One
          // line quad avoids jagged per-letter underlines around descenders.
          const boxes = groups.map((group) => unionPdfGlyphBoxes(group.boxes))
          const quads = groups.map(({ angle }, index) => {
            const box = boxes[index]!
            const [l, b, r, t] = box!,
              rotation = (Math.round(angle / 90) * 90) % 360
            if (Math.abs(angle - rotation) > 0.1 && Math.abs(angle - rotation - 360) > 0.1)
              throw new Error('斜排原文字形暂不能精确标注')
            return rotation === 90
              ? [l, b, l, t, r, b, r, t]
              : rotation === 180
                ? [r, b, l, b, r, t, l, t]
                : rotation === 270
                  ? [r, t, r, b, l, t, l, b]
                  : [l, t, r, t, l, b, r, b]
          })
          hits.push({ boxes, quads, bounds: unionPdfGlyphBoxes(boxes), glyphCount: unique.length })
          if (hits.length > 200 || hits.reduce((n, hit) => n + hit.glyphCount, 0) > 10000)
            throw new Error('标注命中超过单次预算')
          if (!all) break
          rank = 0
        }
        if (!hits.length) throw new Error('当前页面没有匹配的原文')
        return hits
      } finally {
        free(ptr)
        if (textPage) closeTextPage(textPage)
        closePage(page)
      }
    })
  })
}
