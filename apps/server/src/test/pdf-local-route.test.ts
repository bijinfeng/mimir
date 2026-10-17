import { PDFDocument, StandardFonts } from 'pdf-lib'
import { beforeAll, expect, it } from 'vitest'
import { app, getAuthCookie } from './helpers.js'
import { uploadFile } from '../services/upload.js'
import { pdfAtomicBatchFixture } from './pdf-atomic-batch-fixture.js'
import { readPdfAnnotations } from '../services/pdf-annotations.js'

let cookie: string
beforeAll(async () => {
  cookie = await getAuthCookie()
})

it('applies native annotation batches atomically without persisting working bytes', async () => {
  const { bytes } = await pdfAtomicBatchFixture()
  const source = await uploadFile({ filename: 'pdf-atomic-route.pdf', data: bytes })
  const request = (operation: unknown, auth = true) => {
    const form = new FormData()
    form.set('documentId', source.document.id)
    form.set('expectedVersion', '9')
    form.set('operation', JSON.stringify(operation))
    form.set('file', new File([new Uint8Array(bytes)], 'working.pdf', { type: 'application/pdf' }))
    return app.request('/api/conversations/pdf-agent/local', {
      method: 'POST',
      headers: auth ? { Cookie: cookie } : {},
      body: form,
    })
  }
  const ops = [
    { op: 'removeMarkup', id: 'Mhighlight' },
    { op: 'setNoteContents', id: 'Nreply', contents: 'HTTP reply' },
    { op: 'setMetadata', metadata: { title: 'HTTP batch' } },
  ]
  const write = await request({ op: 'apply_ops', ops })
  expect(write.status).toBe(200)
  const result = (await write.json()) as { version: number; bytesBase64: string }
  expect(result.version).toBe(10)
  expect((await readPdfAnnotations(Buffer.from(result.bytesBase64, 'base64'))).annotations).toEqual(
    [
      { id: 'Nroot', page: 1, type: 'note', text: 'old note', author: 'admin' },
      { id: 'Nreply', page: 1, type: 'note', text: 'HTTP reply', author: '', parentId: 'Nroot' },
    ],
  )
  const dry = await request({ op: 'apply_ops', ops, dry_run: true })
  expect(dry.status).toBe(200)
  const dryResult = (await dry.json()) as { version: number; bytesBase64?: string }
  expect(dryResult).toMatchObject({ version: 9 })
  expect(dryResult.bytesBase64).toBeUndefined()
  const invalidForm = await request({
    op: 'apply_ops',
    ops: [...ops, { op: 'setFormValue', value: { name: 'missing', value: 'invalid' } }],
  })
  expect(invalidForm.status).toBe(400)
  const invalidFormResult = (await invalidForm.json()) as {
    error: { message: string }
    bytesBase64?: string
  }
  expect(invalidFormResult.error.message).toContain('PDF 批次第 4 项：表单字段不存在')
  expect(invalidFormResult.bytesBase64).toBeUndefined()
  for (const operation of [
    {
      op: 'apply_ops',
      ops: [...ops, { op: 'setNoteContents', id: 'missing', contents: 'late failure' }],
    },
    { op: 'apply_ops', ops: [{ op: 'removeMarkup', id: 'Mhighlight', extra: true }] },
    { op: 'apply_ops', ops: [{ op: 'removeTextInsert', id: 'T1' }] },
    { op: 'apply_ops', ops, extra: true },
  ]) {
    const response = await request(operation)
    expect(response.status).toBe(400)
    expect(((await response.json()) as { bytesBase64?: string }).bytesBase64).toBeUndefined()
  }
  expect((await request({ op: 'apply_ops', ops }, false)).status).toBe(401)
  const stored = await app.request(`/api/documents/${source.document.id}/file`, {
    headers: { Cookie: cookie },
  })
  expect(new Uint8Array(await stored.arrayBuffer())).toEqual(bytes)
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

it('creates, reads, transforms and removes manual visual signatures on working bytes with strict auth/schema and no library write', async () => {
  const original = await fixture('Signature original'),
    source = await uploadFile({ filename: 'signature-route.pdf', data: original })
  const request = (operation: unknown, bytes = original, auth = true, version = '4') => {
    const form = new FormData()
    form.set('documentId', source.document.id)
    form.set('expectedVersion', version)
    form.set('operation', JSON.stringify(operation))
    form.set('file', new File([new Uint8Array(bytes)], 'working.pdf', { type: 'application/pdf' }))
    return app.request('/api/conversations/pdf-agent/local', {
      method: 'POST',
      headers: auth ? { Cookie: cookie } : {},
      body: form,
    })
  }
  const operation = {
    op: 'add_visual_signature',
    page: 1,
    source: {
      kind: 'ink',
      width: 100,
      height: 50,
      color: '#C00000',
      thickness: 3,
      strokes: [
        [
          [5, 5],
          [35, 35],
        ],
        [
          [10, 40],
          [85, 40],
        ],
      ],
    },
    rect: { x: 40, y: 70, width: 150, height: 75 },
  }
  expect((await request(operation, original, false)).status).toBe(401)
  for (const bad of [
    { ...operation, extra: true },
    { ...operation, source: { ...operation.source, url: 'https://example.com/x.png' } },
    { ...operation, page: 9 },
  ])
    expect((await request(bad)).status).toBe(400)
  expect((await request(operation, original, true, String(Number.MAX_SAFE_INTEGER))).status).toBe(
    400,
  )
  const created = await request(operation)
  expect(created.status).toBe(200)
  type Response = {
    version: number
    bytesBase64?: string
    info: { signatures: Array<{ id: string; rect: { x: number; width: number } }> }
  }
  const result = (await created.json()) as Response
  expect(result.version).toBe(5)
  expect(result.info.signatures).toHaveLength(1)
  const bytes = Buffer.from(result.bytesBase64!, 'base64'),
    id = result.info.signatures[0]!.id
  const read = await request({ op: 'read' }, bytes),
    r = (await read.json()) as Response
  expect(r.version).toBe(4)
  expect(r.bytesBase64).toBeUndefined()
  expect(r.info.signatures[0]!.id).toBe(id)
  const moved = await request(
    {
      op: 'transform_visual_signature',
      page: 1,
      id,
      rect: { x: 80, y: 150, width: 100, height: 50 },
    },
    bytes,
  )
  expect(moved.status).toBe(200)
  const m = (await moved.json()) as Response
  expect(m.info.signatures[0]!.rect.x).toBeCloseTo(80)
  const removed = await request(
    { op: 'delete_visual_signature', page: 1, id },
    Buffer.from(m.bytesBase64!, 'base64'),
  )
  expect(removed.status).toBe(200)
  expect(((await removed.json()) as Response).info.signatures).toEqual([])
  const stored = await app.request(`/api/documents/${source.document.id}/file`, {
    headers: { Cookie: cookie },
  })
  expect(new Uint8Array(await stored.arrayBuffer())).toEqual(original)
})
