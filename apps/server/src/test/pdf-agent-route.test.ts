import { PDFDocument, StandardFonts } from 'pdf-lib'
import { beforeAll, describe, expect, it } from 'vitest'
import { pdfAgentCatalog } from '../services/pdf-agent-catalog.js'
import { app, getAuthCookie } from './helpers.js'

let cookie: string
beforeAll(async () => {
  cookie = await getAuthCookie()
})

async function fixture(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  pdf.addPage([300, 400]).drawText('ORIGINAL', { x: 40, y: 300, size: 12, font })
  return pdf.save()
}

function formFor(bytes: Uint8Array, documentId: string): FormData {
  const form = new FormData()
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  form.set('file', new File([copy], 'current.pdf', { type: 'application/pdf' }))
  form.set('documentId', documentId)
  form.set('expectedVersion', '4')
  form.set('kind', 'edit')
  form.set(
    'items',
    JSON.stringify([
      {
        pageIndex: 0,
        rect: [35, 295, 125, 316],
        oldText: 'ORIGINAL',
        newText: 'REVISED',
        fontSize: 12,
      },
    ]),
  )
  return form
}

describe('PDF Agent authenticated text host route', () => {
  it('offers only the executable text insert shape from the upstream tool family', () => {
    const catalog = pdfAgentCatalog()
    expect(catalog.clientToolNames.has('insert_text')).toBe(true)
    expect(catalog.clientToolNames.has('edit_text')).toBe(false)
    const insert = catalog.tools.find((tool) => tool.name === 'insert_text')
    expect(insert?.inputSchema).toMatchObject({
      required: ['page', 'text', 'x', 'y'],
      properties: { page: { minimum: 1 }, text: { maxLength: 10000 } },
    })
  })

  it('returns edited canvas bytes without replacing the stored original', async () => {
    const bytes = await fixture()
    const upload = new FormData()
    const uploadBytes = new Uint8Array(bytes.byteLength)
    uploadBytes.set(bytes)
    upload.set('file', new File([uploadBytes], 'agent-route.pdf', { type: 'application/pdf' }))
    const uploaded = await app.request('/api/documents/files', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: upload,
    })
    expect(uploaded.status).toBe(201)
    const documentId = ((await uploaded.json()) as { document: { id: string } }).document.id
    const response = await app.request('/api/conversations/pdf-agent/apply-text', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: formFor(bytes, documentId),
    })
    expect(response.status).toBe(200)
    const result = (await response.json()) as { bytesBase64: string; version: number }
    expect(result.version).toBe(5)
    const edited = new Uint8Array(Buffer.from(result.bytesBase64, 'base64'))
    expect(edited).not.toEqual(bytes)
    expect((await PDFDocument.load(edited)).getPageCount()).toBe(1)
    const original = await app.request(`/api/documents/${documentId}/file`, {
      headers: { Cookie: cookie },
    })
    expect(original.status).toBe(200)
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(bytes)
  })

  it('requires authentication before consuming PDF bytes', async () => {
    const response = await app.request('/api/conversations/pdf-agent/apply-text', {
      method: 'POST',
      body: formFor(await fixture(), 'missing'),
    })
    expect(response.status).toBe(401)
  })

  it('rejects a missing document before writing PDF bytes', async () => {
    const response = await app.request('/api/conversations/pdf-agent/apply-text', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: formFor(await fixture(), 'missing-document'),
    })
    expect(response.status).toBe(404)
  })
})
