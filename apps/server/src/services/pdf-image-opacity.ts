import { createHash } from 'node:crypto'
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import type { PdfImageTarget } from '@mimir/shared'
const key = PDFName.of
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const stateName = (hash: string) => `MimirImageOpacity${hash.slice(0, 16)}`
const space = (char: string) => [0, 9, 10, 12, 13, 32].includes(char.charCodeAt(0))
const delim = (char: string) => space(char) || /[()[\]<>/%{}]/.test(char)
/** PDF lexical tokens with byte offsets; strings/comments never become operators. */
function tokens(bytes: Uint8Array) {
  const source = Buffer.from(bytes).toString('latin1'),
    result: Array<{ value: string; start: number; end: number }> = []
  let at = 0
  while (at < source.length) {
    if (space(source[at]!)) {
      at++
      continue
    }
    if (source[at] === '%') {
      while (at < source.length && !/[\r\n]/.test(source[at]!)) at++
      continue
    }
    const start = at
    if (source[at] === '(') {
      at++
      let depth = 1
      while (at < source.length && depth) {
        if (source[at] === '\\') {
          at += 2
          continue
        }
        if (source[at] === '(') depth++
        if (source[at] === ')') depth--
        at++
      }
      if (depth) throw new Error('PDF内容字符串未闭合')
      result.push({ value: '(string)', start, end: at })
      continue
    }
    if (source[at] === '<' && source[at + 1] !== '<') {
      at++
      while (at < source.length && source[at] !== '>') at++
      if (at === source.length) throw new Error('PDF十六进制字符串未闭合')
      at++
      result.push({ value: '<string>', start, end: at })
      continue
    }
    if (source[at] === '/') {
      at++
      while (at < source.length && !delim(source[at]!)) at++
    } else if (delim(source[at]!)) at++
    else {
      while (at < source.length && !delim(source[at]!)) at++
    }
    result.push({ value: source.slice(start, at), start, end: at })
  }
  return result
}
export async function readPdfImageOpacity(
  bytes: Uint8Array,
  targets: PdfImageTarget[],
): Promise<Map<string, number>> {
  const pdf = await PDFDocument.load(bytes.slice(), { updateMetadata: false }),
    result = new Map<string, number>()
  for (const target of targets) {
    const resources = pdf.getPage(target.pageIndex).node.Resources()
    const states = resources?.lookupMaybe(key('ExtGState'), PDFDict)
    const state = states?.lookupMaybe(key(stateName(target.resourceSha256)), PDFDict)
    if (state?.get(key('MimirImageOpacity'))?.toString() === 'true') {
      const alpha = Number(state.get(key('ca'))?.toString())
      if (Number.isFinite(alpha) && alpha >= 0 && alpha <= 1)
        result.set(`${target.pageIndex}:${target.objectIndex}`, alpha)
    }
  }
  return result
}
/** Isolate absolute alpha immediately around one uniquely verified image draw. */
export async function applyPdfImageOpacity(
  bytes: Uint8Array,
  target: PdfImageTarget,
  alpha: number,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes.slice(), { updateMetadata: false }),
    page = pdf.getPage(target.pageIndex)
  const source = page.node.Resources()
  if (!source) throw new Error('图片页面资源缺失')
  const xobjects = source.lookupMaybe(key('XObject'), PDFDict)
  const candidates =
    xobjects?.entries().filter(([, ref]) => {
      const object = pdf.context.lookup(ref)
      return (
        object instanceof PDFRawStream &&
        object.dict.lookup(key('Subtype'))?.toString() === '/Image' &&
        digest(object.contents) === target.resourceSha256
      )
    }) ?? []
  if (candidates.length !== 1) throw new Error('图片资源不唯一，不能设置透明度')
  const imageName = candidates[0]![0].toString(),
    gsName = stateName(target.resourceSha256)
  const contents = page.node.Contents()
  const streams =
    contents instanceof PDFArray
      ? contents.asArray().map((ref) => pdf.context.lookup(ref))
      : contents
        ? [contents]
        : []
  const hits: Array<{
    stream: PDFRawStream
    bytes: Uint8Array
    start: number
    end: number
    wrapped: boolean
  }> = []
  for (const stream of streams) {
    if (!(stream instanceof PDFRawStream)) throw new Error('图片内容流类型不支持')
    const decoded = decodePDFRawStream(stream).decode(),
      list = tokens(decoded)
    if (list.some((token) => token.value === 'BI'))
      throw new Error('含内联位图内容流暂不能设置透明度')
    for (let at = 1; at < list.length; at++)
      if (list[at]!.value === 'Do' && list[at - 1]!.value === imageName)
        hits.push({
          stream,
          bytes: decoded,
          start: list[at - 1]!.start,
          end: list[at]!.end,
          wrapped: list[at - 2]?.value === 'gs' && list[at - 3]?.value === `/${gsName}`,
        })
  }
  if (hits.length !== 1) throw new Error('图片绘制操作不唯一，不能设置透明度')
  const resources = source.clone(pdf.context),
    existing = source.lookupMaybe(key('ExtGState'), PDFDict)
  const states = existing ? existing.clone(pdf.context) : pdf.context.obj({})
  const old = states.lookupMaybe(key(gsName), PDFDict)
  if (old && old.get(key('MimirImageOpacity'))?.toString() !== 'true')
    throw new Error('图片透明度资源名冲突')
  states.set(
    key(gsName),
    pdf.context.obj({ Type: 'ExtGState', ca: alpha, CA: alpha, MimirImageOpacity: true }),
  )
  resources.set(key('ExtGState'), states)
  page.node.set(key('Resources'), resources)
  const hit = hits[0]!
  if (!hit.wrapped) {
    const insertion = Buffer.from(`q /${gsName} gs ${imageName} Do Q`, 'ascii')
    const patched = Buffer.concat([
      hit.bytes.subarray(0, hit.start),
      insertion,
      hit.bytes.subarray(hit.end),
    ])
    // Preserve every unrelated content stream, dictionary and byte sequence.
    const patchedStream = pdf.context.flateStream(patched)
    for (const [name, value] of hit.stream.dict.entries())
      if (!['/Length', '/Filter', '/DecodeParms'].includes(name.toString()))
        patchedStream.dict.set(name, value)
    const replacement = pdf.context.register(patchedStream)
    if (contents instanceof PDFArray) {
      const index = contents.asArray().findIndex((ref) => pdf.context.lookup(ref) === hit.stream)
      contents.set(index, replacement)
    } else page.node.set(key('Contents'), replacement)
  }
  const result = await pdf.save({ updateFieldAppearances: false })
  const after = await readPdfImageOpacity(result, [target])
  if (after.get(`${target.pageIndex}:${target.objectIndex}`) !== alpha)
    throw new Error('图片透明度状态读回失败')
  return result
}
