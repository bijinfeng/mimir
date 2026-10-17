import { createHash } from 'node:crypto'
import type { PdfTextBlockTarget } from '@mimir/shared'
import {
  chainPdfium,
  loadPdfium,
  saveDoc,
  withDocument,
  type Pdfium,
} from '../../../../packages/office/vendor/apps/pdf/src/main/text-edit.js'

function pdfiumApi(m: Pdfium) {
  const {
    _FPDFFont_GetFontData: FPDFFont_GetFontData,
    _FPDFFont_GetBaseFontName: FPDFFont_GetBaseFontName,
    _FPDFFont_GetFamilyName: FPDFFont_GetFamilyName,
    _FPDFFont_GetGlyphWidth: FPDFFont_GetGlyphWidth,
    _FPDFFormObj_CountObjects: FPDFFormObj_CountObjects,
    _FPDFFormObj_GetObject: FPDFFormObj_GetObject,
    _FPDFImageObj_GetImageDataRaw: FPDFImageObj_GetImageDataRaw,
    _FPDFPageObj_GetBounds: FPDFPageObj_GetBounds,
    _FPDFPageObj_GetFillColor: FPDFPageObj_GetFillColor,
    _FPDFPageObj_GetMatrix: FPDFPageObj_GetMatrix,
    _FPDFPageObj_GetStrokeColor: FPDFPageObj_GetStrokeColor,
    _FPDFPageObj_GetType: FPDFPageObj_GetType,
    _FPDFPageObj_SetMatrix: FPDFPageObj_SetMatrix,
    _FPDFPage_CountObjects: FPDFPage_CountObjects,
    _FPDFPage_GenerateContent: FPDFPage_GenerateContent,
    _FPDFPage_GetObject: FPDFPage_GetObject,
    _FPDFTextObj_GetFont: FPDFTextObj_GetFont,
    _FPDFTextObj_GetFontSize: FPDFTextObj_GetFontSize,
    _FPDFTextObj_GetText: FPDFTextObj_GetText,
    _FPDFTextObj_GetTextRenderMode: FPDFTextObj_GetTextRenderMode,
    _FPDFTextObj_SetTextRenderMode: FPDFTextObj_SetTextRenderMode,
    _FPDFText_ClosePage: FPDFText_ClosePage,
    _FPDFText_CountChars: FPDFText_CountChars,
    _FPDFText_GetCharOrigin: FPDFText_GetCharOrigin,
    _FPDFText_GetTextObject: FPDFText_GetTextObject,
    _FPDFText_LoadPage: FPDFText_LoadPage,
    _FPDF_ClosePage: FPDF_ClosePage,
    _FPDF_GetPageCount: FPDF_GetPageCount,
    _FPDF_LoadPage: FPDF_LoadPage,
    _free: free,
    _malloc: malloc,
  } = m
  return {
    FPDFFont_GetFontData,
    FPDFFont_GetBaseFontName,
    FPDFFont_GetFamilyName,
    FPDFFont_GetGlyphWidth,
    FPDFFormObj_CountObjects,
    FPDFFormObj_GetObject,
    FPDFImageObj_GetImageDataRaw,
    FPDFPageObj_GetBounds,
    FPDFPageObj_GetFillColor,
    FPDFPageObj_GetMatrix,
    FPDFPageObj_GetStrokeColor,
    FPDFPageObj_GetType,
    FPDFPageObj_SetMatrix,
    FPDFPage_CountObjects,
    FPDFPage_GenerateContent,
    FPDFPage_GetObject,
    FPDFTextObj_GetFont,
    FPDFTextObj_GetFontSize,
    FPDFTextObj_GetText,
    FPDFTextObj_GetTextRenderMode,
    FPDFTextObj_SetTextRenderMode,
    FPDFText_ClosePage,
    FPDFText_CountChars,
    FPDFText_GetCharOrigin,
    FPDFText_GetTextObject,
    FPDFText_LoadPage,
    FPDF_ClosePage,
    FPDF_GetPageCount,
    FPDF_LoadPage,
    free,
    malloc,
  }
}

type Bounds = [number, number, number, number]
type Matrix = [number, number, number, number, number, number]
export interface PdfNativeBlockObject {
  objectIndex: number
  type: number
  text: string
  /** Actual character codes owned by this object, excluding layout-generated gaps. */
  glyphs: number[]
  font?: { name: string; family: string; weight: number; italicAngle: number }
  bounds: Bounds
  matrix: Matrix
  style: string
  resource: string
  clipped: boolean
  children: PdfNativeBlockObject[]
}
type ClipApi = {
  _FPDFPageObj_GetClipPath?: (object: number) => number
  _FPDFClipPath_CountPaths?: (clip: number) => number
}
export function assertPdfBlockActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('PDF 段落操作已取消')
}
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')
function readObjects(m: Pdfium, page: number): PdfNativeBlockObject[] {
  const api = pdfiumApi(m)
  const textPage = api.FPDFText_LoadPage(page)
  if (!textPage) throw new Error('无法读取 PDF 原文字形')
  const charCount = api.FPDFText_CountChars(textPage)
  if (charCount < 0 || charCount > 200000) {
    api.FPDFText_ClosePage(textPage)
    throw new Error('PDF 原文字形超过单页校验预算')
  }
  const pointer = api.malloc(48),
    resources = new Map<number, string>()
  let total = 0
  const { _FPDFText_GetUnicode: getUnicode, _FPDFText_IsGenerated: isGenerated } = m as Pdfium & {
      _FPDFText_GetUnicode: (page: number, index: number) => number
      _FPDFText_IsGenerated: (page: number, index: number) => number
    },
    glyphsOf = new Map<number, number[]>()
  for (let index = 0; index < charCount; index++) {
    if (isGenerated(textPage, index)) continue
    const object = api.FPDFText_GetTextObject(textPage, index),
      glyphs = glyphsOf.get(object) ?? []
    glyphs.push(getUnicode(textPage, index))
    glyphsOf.set(object, glyphs)
  }
  const resource = (object: number, type: number) => {
    const font = type === 1 ? api.FPDFTextObj_GetFont(object) : 0,
      key = font || object
    if (resources.has(key)) return resources.get(key)!
    let size = 0
    if (type === 1) {
      if (!font || !api.FPDFFont_GetFontData(font, 0, 0, pointer + 40)) return ''
      size = m.HEAP32[(pointer + 40) >> 2]! >>> 0
    } else if (type === 3) size = api.FPDFImageObj_GetImageDataRaw(object, 0, 0)
    if (!size) return ''
    if (size > 50 * 1024 * 1024) throw new Error('PDF 原生资源超过校验预算')
    const buffer = api.malloc(size)
    try {
      const ok =
        type === 1
          ? api.FPDFFont_GetFontData(font, buffer, size, pointer + 40)
          : api.FPDFImageObj_GetImageDataRaw(object, buffer, size)
      if (!ok) throw new Error('无法核验 PDF 字体或图片资源')
      const value = hash(m.HEAPU8.subarray(buffer, buffer + size))
      resources.set(key, value)
      return value
    } finally {
      api.free(buffer)
    }
  }
  const fontInfo = (object: number) => {
    const font = api.FPDFTextObj_GetFont(object)
    const readName = (read: (font: number, buffer: number, length: number) => number) => {
      const size = read(font, 0, 0)
      if (size < 1 || size > 10000) return ''
      const buffer = api.malloc(size)
      try {
        read(font, buffer, size)
        return Buffer.from(m.HEAPU8.subarray(buffer, buffer + size - 1)).toString()
      } finally {
        api.free(buffer)
      }
    }
    const { _FPDFFont_GetWeight: getWeight, _FPDFFont_GetItalicAngle: getAngle } = m as Pdfium & {
      _FPDFFont_GetWeight(font: number): number
      _FPDFFont_GetItalicAngle(font: number, angle: number): boolean
    }
    const angle = getAngle(font, pointer) ? m.HEAP32[pointer >> 2]! : 0
    return {
      name: readName(api.FPDFFont_GetBaseFontName),
      family: readName(api.FPDFFont_GetFamilyName),
      weight: getWeight(font),
      italicAngle: angle,
    }
  }
  const visit = (object: number, objectIndex: number, depth: number): PdfNativeBlockObject => {
    if (++total > 30000 || depth > 20) throw new Error('PDF 原生对象超过校验预算')
    const type = api.FPDFPageObj_GetType(object)
    if (
      !api.FPDFPageObj_GetBounds(object, pointer + 24, pointer + 28, pointer + 32, pointer + 36) ||
      !api.FPDFPageObj_GetMatrix(object, pointer)
    )
      throw new Error('PDF 对象几何无法核验')
    const bounds = Array.from(
      m.HEAPF32.subarray((pointer + 24) >> 2, (pointer + 40) >> 2),
    ) as Bounds
    const matrix = Array.from(m.HEAPF32.subarray(pointer >> 2, (pointer + 24) >> 2)) as Matrix
    let text = ''
    if (type === 1) {
      const length = api.FPDFTextObj_GetText(object, textPage, 0, 0)
      if (length > 20002) throw new Error('PDF 文字对象超过校验预算')
      if (length > 2) {
        const buffer = api.malloc(length)
        try {
          api.FPDFTextObj_GetText(object, textPage, buffer, length)
          text = Buffer.from(m.HEAPU8.subarray(buffer, buffer + length - 2)).toString('utf16le')
        } finally {
          api.free(buffer)
        }
      }
    }
    const style: unknown[] = []
    for (const getter of [api.FPDFPageObj_GetFillColor, api.FPDFPageObj_GetStrokeColor]) {
      const ok = getter(object, pointer, pointer + 4, pointer + 8, pointer + 12)
      style.push(ok ? Array.from(m.HEAP32.subarray(pointer >> 2, (pointer + 16) >> 2)) : null)
    }
    if (type === 1) {
      api.FPDFTextObj_GetFontSize(object, pointer)
      style.push(m.HEAPF32[pointer >> 2], api.FPDFTextObj_GetTextRenderMode(object))
    }
    const { _FPDFPageObj_GetClipPath: getClipPath, _FPDFClipPath_CountPaths: countClipPaths } =
      m as Pdfium & ClipApi
    const clip = getClipPath?.(object)
    const clipped = clip ? (countClipPaths?.(clip) ?? 1) > 0 : false
    const children: PdfNativeBlockObject[] = []
    if (type === 5)
      for (let index = 0; index < api.FPDFFormObj_CountObjects(object); index++)
        children.push(visit(api.FPDFFormObj_GetObject(object, index), index, depth + 1))
    return {
      objectIndex,
      type,
      text,
      glyphs: glyphsOf.get(object) ?? [],
      font: type === 1 ? fontInfo(object) : undefined,
      bounds,
      matrix,
      style: JSON.stringify(style),
      resource: resource(object, type),
      clipped,
      children,
    }
  }
  try {
    return Array.from({ length: api.FPDFPage_CountObjects(page) }, (_, index) =>
      visit(api.FPDFPage_GetObject(page, index), index, 0),
    )
  } finally {
    api.free(pointer)
    api.FPDFText_ClosePage(textPage)
  }
}
export async function readPdfNativeBlockObjects(
  bytes: Uint8Array,
  pageIndex: number,
  signal?: AbortSignal,
): Promise<PdfNativeBlockObject[]> {
  return chainPdfium(async () => {
    assertPdfBlockActive(signal)
    const m = await loadPdfium()
    const api = pdfiumApi(m)
    return withDocument(m, bytes, async (doc) => {
      if (pageIndex < 0 || pageIndex >= api.FPDF_GetPageCount(doc))
        throw new Error('PDF 段落页号已失效')
      const page = api.FPDF_LoadPage(doc, pageIndex)
      if (!page) throw new Error('无法读取 PDF 段落页面')
      try {
        return readObjects(m, page)
      } finally {
        api.FPDF_ClosePage(page)
      }
    })
  })
}
/** Remove only a verified target's synthetic fill+stroke before a real rebuild. */
export async function clearPdfNativeBlockBoldStroke(
  bytes: Uint8Array,
  pageIndex: number,
  indices: number[],
  signal?: AbortSignal,
): Promise<Uint8Array> {
  return chainPdfium(async () => {
    assertPdfBlockActive(signal)
    const m = await loadPdfium(),
      api = pdfiumApi(m)
    return withDocument(m, bytes, async (doc) => {
      const page = api.FPDF_LoadPage(doc, pageIndex)
      try {
        for (const index of indices) {
          const object = api.FPDFPage_GetObject(page, index)
          if (!object || api.FPDFPageObj_GetType(object) !== 1)
            throw new Error('取消粗体目标已失效')
          const mode = api.FPDFTextObj_GetTextRenderMode(object)
          if (mode !== 0 && mode !== 2) throw new Error('原文含特殊描边，无法安全取消粗体')
          if (mode === 2 && !api.FPDFTextObj_SetTextRenderMode(object, 0))
            throw new Error('无法取消原文合成粗体')
        }
        if (!api.FPDFPage_GenerateContent(page)) throw new Error('取消原文粗体未生成内容')
        assertPdfBlockActive(signal)
        return saveDoc(m, doc)
      } finally {
        api.FPDF_ClosePage(page)
      }
    })
  })
}
/** Measure actual saved fonts, not a browser's fallback face. */
export async function measurePdfNativeBlockText(
  bytes: Uint8Array,
  pageIndex: number,
  indices: number[],
): Promise<{ text: string; advances: number[]; spaceAdvance: number }[]> {
  return chainPdfium(async () => {
    const m = await loadPdfium()
    const api = pdfiumApi(m)
    return withDocument(m, bytes, async (doc) => {
      const page = api.FPDF_LoadPage(doc, pageIndex),
        textPage = api.FPDFText_LoadPage(page),
        pointer = api.malloc(40)
      try {
        const objects = readObjects(m, page),
          chars = new Map<number, number[]>()
        for (let at = 0; at < api.FPDFText_CountChars(textPage); at++) {
          const object = api.FPDFText_GetTextObject(textPage, at),
            list = chars.get(object) ?? []
          list.push(at)
          chars.set(object, list)
        }
        return indices.map((index) => {
          const info = objects[index]!,
            object = api.FPDFPage_GetObject(page, index),
            font = api.FPDFTextObj_GetFont(object),
            points = [...info.text],
            nativeChars = chars.get(object) ?? []
          api.FPDFTextObj_GetFontSize(object, pointer)
          const size = m.HEAPF32[pointer >> 2]! * Math.hypot(info.matrix[0], info.matrix[1])
          if (!api.FPDFFont_GetGlyphWidth(font, 32, 1, pointer))
            throw new Error('无法测量原文字体空格')
          const spaceAdvance = m.HEAPF32[pointer >> 2]! * size
          const advances = points.map((character, at) => {
            const ci = nativeChars[at]
            if (
              (nativeChars.length === points.length ||
                nativeChars.length === [...info.text.trimEnd()].length) &&
              ci !== undefined &&
              api.FPDFText_GetCharOrigin(textPage, ci, pointer + 8, pointer + 16) &&
              nativeChars[at + 1] !== undefined &&
              api.FPDFText_GetCharOrigin(textPage, nativeChars[at + 1]!, pointer + 24, pointer + 32)
            ) {
              const width = m.HEAPF64[(pointer + 24) >> 3]! - m.HEAPF64[(pointer + 8) >> 3]!
              if (width > 0 && Number.isFinite(width)) return width
            }
            if (!api.FPDFFont_GetGlyphWidth(font, character.codePointAt(0)!, 1, pointer))
              throw new Error('无法测量原文字体的字宽')
            const width = m.HEAPF32[pointer >> 2]! * size
            if (!Number.isFinite(width) || width < 0) throw new Error('原文字体字宽无效')
            return width
          })
          return { text: info.text, advances, spaceAdvance }
        })
      } finally {
        api.free(pointer)
        api.FPDFText_ClosePage(textPage)
        api.FPDF_ClosePage(page)
      }
    })
  })
}
const near = (a: readonly number[], b: readonly number[], tolerance = 0.02) =>
  a.length === b.length &&
  a.every((value, index) => Number.isFinite(value) && Math.abs(value - b[index]!) <= tolerance)
export function samePdfBlockMembers(
  a: PdfTextBlockTarget['members'],
  b: PdfTextBlockTarget['members'],
): boolean {
  return (
    a.length === b.length &&
    a.every((item, index) => {
      const other = b[index]!
      return (
        item.objectIndex === other.objectIndex &&
        item.text === other.text &&
        near(item.bounds, other.bounds) &&
        near(item.matrix, other.matrix, 0.0001)
      )
    })
  )
}
/** Matrix-only translation. No replacement glyph, font, overlay or extra page object. */
export async function writePdfNativeBlockMove(
  bytes: Uint8Array,
  target: PdfTextBlockTarget,
  delta: [number, number],
  signal?: AbortSignal,
): Promise<Uint8Array> {
  return chainPdfium(async () => {
    assertPdfBlockActive(signal)
    const m = await loadPdfium()
    const api = pdfiumApi(m),
      before: PdfNativeBlockObject[][] = []
    let objectCount = 0
    const countObjects = (objects: PdfNativeBlockObject[]): number =>
      objects.reduce((count, object) => count + 1 + countObjects(object.children), 0)
    const result = await withDocument(m, bytes, async (doc) => {
      const count = api.FPDF_GetPageCount(doc)
      if (count > 1000) throw new Error('PDF 超过 1000 页校验预算')
      for (let index = 0; index < count; index++) {
        const page = api.FPDF_LoadPage(doc, index)
        if (!page) throw new Error('无法读取 PDF 页面')
        try {
          const objects = readObjects(m, page)
          objectCount += countObjects(objects)
          if (objectCount > 30000) throw new Error('PDF 全文原生对象超过校验预算')
          before.push(objects)
        } finally {
          api.FPDF_ClosePage(page)
        }
        assertPdfBlockActive(signal)
      }
      const current = before[target.pageIndex]
      if (!current) throw new Error('PDF 段落页号已失效')
      const members = target.members.map((member) => current[member.objectIndex])
      if (
        members.some((member) => !member || member.type !== 1 || member.clipped) ||
        !samePdfBlockMembers(target.members, members as PdfTextBlockTarget['members'])
      )
        throw new Error('PDF 段落对象已变化，未写入')
      const page = api.FPDF_LoadPage(doc, target.pageIndex),
        pointer = api.malloc(24)
      try {
        for (const member of target.members) {
          assertPdfBlockActive(signal)
          const matrix = [...member.matrix]
          matrix[4]! += delta[0]
          matrix[5]! += delta[1]
          m.HEAPF32.set(matrix, pointer >> 2)
          if (!api.FPDFPageObj_SetMatrix(api.FPDFPage_GetObject(page, member.objectIndex), pointer))
            throw new Error('PDF 原文字矩阵写入失败')
        }
        if (!api.FPDFPage_GenerateContent(page)) throw new Error('PDF 原文字内容流生成失败')
        assertPdfBlockActive(signal)
        return saveDoc(m, doc)
      } finally {
        api.free(pointer)
        api.FPDF_ClosePage(page)
      }
    })
    assertPdfBlockActive(signal)
    await withDocument(m, result, async (doc) => {
      if (api.FPDF_GetPageCount(doc) !== before.length) throw new Error('PDF 页面读回不一致')
      const selected = new Set(target.members.map((member) => member.objectIndex))
      for (let pageIndex = 0; pageIndex < before.length; pageIndex++) {
        const page = api.FPDF_LoadPage(doc, pageIndex)
        if (!page) throw new Error('PDF 页面读回失败')
        try {
          const after = readObjects(m, page),
            original = before[pageIndex]!
          if (after.length !== original.length) throw new Error('PDF 对象数读回不一致')
          for (const [index, previous] of original.entries()) {
            const current = after[index]!,
              moved = pageIndex === target.pageIndex && selected.has(index),
              expectedMatrix = [...previous.matrix],
              expectedBounds = [...previous.bounds]
            if (moved) {
              expectedMatrix[4]! += delta[0]
              expectedMatrix[5]! += delta[1]
              expectedBounds[0]! += delta[0]
              expectedBounds[2]! += delta[0]
              expectedBounds[1]! += delta[1]
              expectedBounds[3]! += delta[1]
            }
            if (
              current.type !== previous.type ||
              current.text !== previous.text ||
              JSON.stringify(current.glyphs) !== JSON.stringify(previous.glyphs) ||
              current.style !== previous.style ||
              current.resource !== previous.resource ||
              current.clipped !== previous.clipped ||
              JSON.stringify(current.children) !== JSON.stringify(previous.children) ||
              !near(current.matrix, expectedMatrix) ||
              !near(current.bounds, expectedBounds)
            )
              throw new Error('PDF 字形、字体或非目标对象读回不一致，未写入')
          }
        } finally {
          api.FPDF_ClosePage(page)
        }
        assertPdfBlockActive(signal)
      }
    })
    return result
  })
}
