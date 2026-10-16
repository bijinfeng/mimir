import { PDFArray, PDFDict, PDFDocument, PDFName, PDFObject, PDFStream } from 'pdf-lib'

const key = PDFName.of

/** Preserve the original catalog; explicitly model safe outlines, metadata and forms. */
export function assertPdfPreservingSafe(pdf: PDFDocument) {
  const allowed = new Set([
    '/Type',
    '/Pages',
    '/AcroForm',
    '/Outlines',
    '/PageMode',
    '/Metadata',
    '/Lang',
    '/ViewerPreferences',
    '/PageLayout',
    '/MarkInfo',
    '/StructTreeRoot',
    '/Names',
    '/Dests',
  ])
  const unknown = pdf.catalog.keys().filter((k) => !allowed.has(k.toString()))
  if (unknown.length) throw new Error(`PDF 含暂未支持的文档结构：${unknown.join('、')}`)
  const seen = new Set<PDFObject>()
  const inspect = (raw: PDFObject) => {
    const obj = pdf.context.lookup(raw)
    if (!obj || seen.has(obj)) return
    seen.add(obj)
    if (obj instanceof PDFStream) inspect(obj.dict)
    else if (obj instanceof PDFArray) obj.asArray().forEach(inspect)
    else if (obj instanceof PDFDict) {
      if (
        ['AA', 'JS', 'JavaScript', 'XFA', 'SigFlags'].some((n) => obj.has(key(n))) ||
        obj.lookup(key('FT'))?.toString() === '/Sig' ||
        obj.lookup(key('Type'))?.toString() === '/Sig'
      )
        throw new Error('PDF 含动作、XFA 或数字签名，不能安全改写')
      const action = obj.lookup(key('A'))
      if (
        action &&
        (!(action instanceof PDFDict) ||
          action.lookup(key('S'))?.toString() !== '/GoTo' ||
          action.keys().some((k) => !['/S', '/D'].includes(k.toString())))
      )
        throw new Error('PDF 含外部或活动动作，不能安全改写')
      obj.entries().forEach(([, value]) => inspect(value))
    }
  }
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) inspect(obj)
}
