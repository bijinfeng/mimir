import { PDFDocument, StandardFonts } from 'pdf-lib'
import { beforeAll, expect, it } from 'vitest'
import { app, getAuthCookie } from './helpers.js'
import { uploadFile } from '../services/upload.js'

let cookie: string
beforeAll(async () => {
  cookie = await getAuthCookie()
})

async function fixture(label: string, pages = 1) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let index = 0; index < pages; index++)
    pdf.addPage([300, 400]).drawText(`${label} ${index + 1}`, { x: 30, y: 350, font })
  pdf.setTitle(label)
  return pdf.save()
}

it('uses working bytes for PDF writes, reads and outputs while preserving stored originals', async () => {
  const original = await fixture('Stored')
  const working = await fixture('Unsaved', 2)
  const source = await uploadFile({ filename: 'pdf-local-route.pdf', data: original })
  const make = (operation: unknown, version = '7', id = source.document.id) => {
    const form = new FormData()
    form.set('documentId', id)
    form.set('expectedVersion', version)
    form.set('operation', JSON.stringify(operation))
    form.set(
      'file',
      new File([new Uint8Array(working)], 'current.pdf', { type: 'application/pdf' }),
    )
    return form
  }
  const request = (form: FormData, auth = true) =>
    app.request('/api/conversations/pdf-agent/local', {
      method: 'POST',
      headers: auth ? { Cookie: cookie } : {},
      body: form,
    })
  const read = await request(make({ op: 'read' }))
  expect(read.status).toBe(200)
  expect(await read.json()).toMatchObject({ version: 7, info: { metadata: { title: 'Unsaved' } } })
  const write = await request(make({ op: 'set_metadata', metadata: { title: 'Changed' } }))
  expect(write.status).toBe(200)
  const written = (await write.json()) as { version: number; bytesBase64: string }
  expect(written.version).toBe(8)
  const updated = await PDFDocument.load(Buffer.from(written.bytesBase64, 'base64'))
  expect(updated.getPageCount()).toBe(2)
  expect(updated.getTitle()).toBe('Changed')
  const output = await request(make({ op: 'extract_pages', pages: '2' }))
  expect(output.status).toBe(200)
  const exported = (await output.json()) as {
    version: number
    bytesBase64?: string
    outputs: Array<{ name: string; bytesBase64: string }>
  }
  expect(exported.version).toBe(7)
  expect(exported.bytesBase64).toBeUndefined()
  expect(exported.outputs).toHaveLength(1)
  expect(
    (
      await PDFDocument.load(Buffer.from(exported.outputs[0]!.bytesBase64, 'base64'))
    ).getPageCount(),
  ).toBe(1)
  const imported = make({ op: 'import_pages', after_page: 1, source_pages: 'all' })
  imported.set(
    'asset',
    new File([new Uint8Array(original)], 'import.pdf', { type: 'application/pdf' }),
  )
  const importResponse = await request(imported)
  expect(importResponse.status).toBe(200)
  const importResult = (await importResponse.json()) as { version: number; bytesBase64: string }
  expect(importResult.version).toBe(8)
  expect(
    (await PDFDocument.load(Buffer.from(importResult.bytesBase64, 'base64'))).getPageCount(),
  ).toBe(3)
  const stored = await app.request(`/api/documents/${source.document.id}/file`, {
    headers: { Cookie: cookie },
  })
  expect(new Uint8Array(await stored.arrayBuffer())).toEqual(original)
  expect((await request(make({ op: 'read' }), false)).status).toBe(401)
  expect((await request(make({ op: 'read' }, '7', 'missing-document'))).status).toBe(404)
  expect((await request(make({ op: 'read' }, String(Number.MAX_SAFE_INTEGER)))).status).toBe(400)
  expect((await request(make({ op: 'import_pages', after_page: 0 }))).status).toBe(400)
  expect((await request(make({ op: 'extract_pages', pages: '999' }))).status).toBe(400)
  expect((await request(make({ op: 'read', unexpected: true }))).status).toBe(400)
  const invalid = make({ op: 'read' })
  invalid.set('operation', '{')
  expect((await request(invalid)).status).toBe(400)
  const empty = make({ op: 'read' })
  empty.set('file', new File([], 'empty.pdf'))
  expect((await request(empty)).status).toBe(413)
  const wrongAsset = make({ op: 'read' })
  wrongAsset.set('asset', new File([new Uint8Array(original)], 'unexpected.pdf'))
  expect((await request(wrongAsset)).status).toBe(400)
  const malformed = make({ op: 'read' })
  malformed.set('file', new File(['not a PDF'], 'invalid.pdf', { type: 'application/pdf' }))
  expect((await request(malformed)).status).toBe(400)
  const wrongFormat = await uploadFile({
    filename: 'pdf-route-note.md',
    data: new TextEncoder().encode('Note'),
  })
  expect((await request(make({ op: 'read' }, '7', wrongFormat.document.id))).status).toBe(404)
  const tooLarge = await app.request('/api/conversations/pdf-agent/local', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'content-type': 'multipart/form-data; boundary=test',
      'content-length': String(101 * 1024 * 1024 + 1),
    },
    body: '--test--',
  })
  expect(tooLarge.status).toBe(413)
})
