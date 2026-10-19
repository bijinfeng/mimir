import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const root = dirname(fileURLToPath(import.meta.url))
const require = createRequire(resolve(process.cwd(), 'packages/office/package.json'))
const { PDFDocument, PDFName, PDFString, PDFHexString, rgb, degrees } = require('pdf-lib')
const results = []
for (const mode of ['text', 'annotations', 'forms', 'image', 'rotated']) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Mimir PDF interaction fixture: ${mode}`)
  pdf.setAuthor('admin')
  pdf.setCreationDate(new Date('2026-10-20T00:00:00Z'))
  pdf.setModificationDate(new Date('2026-10-20T00:00:00Z'))
  for (const [i, label] of ['FIRST ORIGINAL', 'SECOND ORIGINAL', 'THIRD ORIGINAL'].entries()) {
    const page = pdf.addPage([360, 480])
    page.drawText(label, { x: 30, y: 425, size: 18, color: rgb(0.1, 0.2, 0.16) })
    page.drawText('Mimir workspace / interaction review', { x: 30, y: 394, size: 11 })
    page.drawText('Select text, add notes, review changes.', { x: 30, y: 366, size: 11 })
    page.drawText('Original content must survive every save.', { x: 30, y: 344, size: 11 })
    page.drawText(`PAGE ${i + 1} / 3`, { x: 30, y: 25, size: 9 })
  }
  const page = pdf.getPage(0)
  if (mode === 'annotations') {
    const rootNote = pdf.context.register(
      pdf.context.obj({
        Type: 'Annot',
        Subtype: 'Text',
        Rect: [40, 300, 60, 320],
        Contents: PDFHexString.fromText('Review original paragraph before publishing.'),
        T: PDFHexString.fromText('admin'),
        NM: PDFString.of('Nroot'),
        P: page.ref,
      }),
    )
    const reply = pdf.context.register(
      pdf.context.obj({
        Type: 'Annot',
        Subtype: 'Text',
        Rect: [40, 300, 60, 320],
        Contents: PDFHexString.fromText('Keep the source and save a working copy.'),
        T: PDFHexString.fromText('admin'),
        NM: PDFString.of('Nreply'),
        IRT: rootNote,
        RT: 'R',
        P: page.ref,
      }),
    )
    const highlight = pdf.context.register(
      pdf.context.obj({
        Type: 'Annot',
        Subtype: 'Highlight',
        Rect: [30, 342, 215, 356],
        QuadPoints: [30, 356, 215, 356, 30, 342, 215, 342],
        Contents: PDFString.of('Preserve original content'),
        NM: PDFString.of('Mhighlight'),
        P: page.ref,
      }),
    )
    page.node.set(PDFName.of('Annots'), pdf.context.obj([rootNote, reply, highlight]))
  }
  if (mode === 'forms') {
    const form = pdf.getForm()
    const name = form.createTextField('name')
    name.setText('admin')
    name.addToPage(page, { x: 30, y: 270, width: 230, height: 30 })
    form.createCheckBox('agree').addToPage(page, { x: 30, y: 225, width: 18, height: 18 })
    const choice = form.createDropdown('department')
    choice.addOptions(['Design', 'Engineering', 'Research'])
    choice.select('Design')
    choice.addToPage(page, { x: 30, y: 175, width: 230, height: 30 })
  }
  if (mode === 'image') {
    const bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4U8AAAAASUVORK5CYII=',
      'base64',
    )
    const image = await pdf.embedPng(bytes)
    page.drawImage(image, { x: 30, y: 170, width: 200, height: 110 })
  }
  if (mode === 'rotated') {
    page.setRotation(degrees(90))
    page.setCropBox(20, 30, 300, 400)
  }
  const data = await pdf.save()
  writeFileSync(resolve(root, 'fixtures', `${mode}.pdf`), data)
  const reopened = await PDFDocument.load(data)
  results.push({
    name: mode,
    source: 'pdf-lib generation mirroring apps/server/src/test/pdf-atomic-batch-fixture.ts',
    bytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
    pages: reopened.getPageCount(),
    formFields: reopened
      .getForm()
      .getFields()
      .map((field) => field.getName()),
  })
}
writeFileSync(resolve(root, 'fixture-manifest.json'), JSON.stringify(results, null, 2) + '\n')
console.log(results)
