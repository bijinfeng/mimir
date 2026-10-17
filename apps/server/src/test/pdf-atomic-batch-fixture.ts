import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString, degrees } from 'pdf-lib'

export async function pdfAtomicBatchFixture({
  form = false,
  legacy = false,
  rotation = 0,
  crop = false,
} = {}) {
  const pdf = await PDFDocument.create()
  for (const label of ['FIRST ORIGINAL', 'SECOND ORIGINAL', 'THIRD ORIGINAL'])
    pdf.addPage([360, 480]).drawText(label, { x: 40, y: 350, size: 12 })
  const page = pdf.getPage(0)
  page.setRotation(degrees(rotation))
  if (crop) page.setCropBox(20, 30, 300, 400)
  const root = pdf.context.register(
    pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [40, 300, 60, 320],
      Contents: PDFHexString.fromText('old note'),
      T: PDFHexString.fromText('admin'),
      ...(legacy ? {} : { NM: PDFString.of('Nroot') }),
      P: page.ref,
    }),
  )
  const reply = pdf.context.register(
    pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [40, 300, 60, 320],
      Contents: PDFHexString.fromText('old reply'),
      NM: PDFString.of('Nreply'),
      IRT: root,
      RT: 'R',
      P: page.ref,
    }),
  )
  const markup = pdf.context.register(
    pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Highlight',
      Rect: [40, 345, 130, 365],
      QuadPoints: [40, 365, 130, 365, 40, 345, 130, 345],
      Contents: PDFString.of('highlight'),
      NM: PDFString.of('Mhighlight'),
      P: page.ref,
    }),
  )
  const link = pdf.context.register(
    pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [80, 200, 110, 230],
      Dest: [pdf.getPage(1).ref, 'Fit'],
    }),
  )
  page.node.set(PDFName.of('Annots'), pdf.context.obj([root, reply, markup, link]))
  if (form)
    pdf.getForm().createCheckBox('agree').addToPage(page, { x: 30, y: 50, width: 20, height: 20 })
  return {
    bytes: await pdf.save(),
    rootId: legacy ? `R${root.objectNumber}-${root.generationNumber}` : 'Nroot',
  }
}

export async function pdfNativeContentStreams(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes)
  return pdf.getPages().map((page) => {
    const raw = page.node.lookup(PDFName.of('Contents'))
    const values = raw instanceof PDFArray ? raw.asArray() : raw ? [raw] : []
    return values.map((ref) => {
      const stream = pdf.context.lookup(ref)
      return stream instanceof PDFDict ? stream.toString() : stream?.toString()
    })
  })
}
