import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFObject,
  PDFPage,
  PDFPageLeaf,
  PDFRef,
  PDFStream,
  PDFString,
} from 'pdf-lib'
const key = PDFName.of
const textOf = (obj: PDFObject | undefined) =>
  obj instanceof PDFString || obj instanceof PDFHexString ? obj.decodeText() : ''
/** pdf-lib 1.17 removePage does not invalidate its getPages cache. */
export function currentPdfPages(pdf: PDFDocument): PDFPage[] {
  const pages: PDFPage[] = []
  pdf.catalog.Pages().traverse((node, ref) => {
    if (node instanceof PDFPageLeaf) pages.push(PDFPage.of(node, ref, pdf))
  })
  return pages
}
export function pruneExtractedObjects(pdf: PDFDocument, removedPages: Set<string>) {
  const removedNames = new Set<string>()
  const pointsToRemovedPage = (raw: PDFObject | undefined): boolean => {
    const value = raw ? pdf.context.lookup(raw) : undefined
    if (value instanceof PDFDict) return pointsToRemovedPage(value.get(key('D')))
    return value instanceof PDFArray && removedPages.has(value.get(0)?.toString() ?? '')
  }
  const dests = pdf.catalog.lookupMaybe(key('Dests'), PDFDict)
  for (const [name, dest] of dests?.entries() ?? [])
    if (pointsToRemovedPage(dest)) {
      dests!.delete(name)
      removedNames.add(name.decodeText())
    }
  const visited = new Set<PDFDict>()
  const pruneNames = (node: PDFDict) => {
    if (visited.has(node) || visited.size >= 1000) throw new Error('PDF 命名目标树无效')
    visited.add(node)
    const names = node.lookupMaybe(key('Names'), PDFArray)
    if (names)
      for (let i = names.size() - 2; i >= 0; i -= 2)
        if (pointsToRemovedPage(names.get(i + 1))) {
          removedNames.add(textOf(pdf.context.lookup(names.get(i))))
          names.remove(i + 1)
          names.remove(i)
        }
    for (const child of node.lookupMaybe(key('Kids'), PDFArray)?.asArray() ?? []) {
      const dict = pdf.context.lookup(child)
      if (!(dict instanceof PDFDict)) throw new Error('PDF 命名目标节点无效')
      pruneNames(dict)
    }
    node.delete(key('Limits'))
  }
  const names = pdf.catalog.lookupMaybe(key('Names'), PDFDict)?.lookupMaybe(key('Dests'), PDFDict)
  if (names) pruneNames(names)
  const removedDestination = (raw: PDFObject | undefined) => {
    const dest = raw ? pdf.context.lookup(raw) : undefined
    return (
      pointsToRemovedPage(raw) ||
      (dest instanceof PDFName
        ? removedNames.has(dest.decodeText())
        : removedNames.has(textOf(dest)))
    )
  }
  for (const page of currentPdfPages(pdf)) {
    const annots = page.node.lookupMaybe(key('Annots'), PDFArray)
    if (annots)
      for (let i = annots.size() - 1; i >= 0; i--) {
        const annot = pdf.context.lookup(annots.get(i))
        if (!(annot instanceof PDFDict)) continue
        const action = annot.lookupMaybe(key('A'), PDFDict)
        if (
          removedDestination(annot.get(key('Dest'))) ||
          (action?.lookup(key('S'))?.toString() === '/GoTo' &&
            removedDestination(action.get(key('D'))))
        )
          annots.remove(i)
      }
  }
  discardUnreachablePdfObjects(pdf, removedPages)
}
export function discardUnreachablePdfObjects(pdf: PDFDocument, removedPages = new Set<string>()) {
  // PDF writers serialize all context objects. Removing a page from the tree is
  // insufficient: omit unreachable streams/fields so unselected content cannot
  // be recovered from the generated extraction or split files.
  const reachable = new Set<string>(),
    seen = new Set<PDFObject>()
  const visit = (raw: PDFObject | undefined) => {
    if (!raw) return
    if (raw instanceof PDFRef) {
      const id = raw.toString()
      if (removedPages.has(id)) throw new Error('抽页后仍有结构引用未选页面，未生成输出')
      if (reachable.has(id)) return
      reachable.add(id)
    }
    const obj = pdf.context.lookup(raw)
    if (!obj || seen.has(obj)) return
    seen.add(obj)
    if (obj instanceof PDFStream) visit(obj.dict)
    else if (obj instanceof PDFDict) obj.entries().forEach(([, value]) => visit(value))
    else if (obj instanceof PDFArray) obj.asArray().forEach(visit)
  }
  for (const root of Object.values(pdf.context.trailerInfo)) visit(root)
  for (const [ref] of pdf.context.enumerateIndirectObjects())
    if (!reachable.has(ref.toString())) pdf.context.delete(ref)
}
