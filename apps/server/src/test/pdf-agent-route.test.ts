import { PDFDocument, StandardFonts } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PdfTextTarget } from '@mimir/shared'
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

function pdfFile(bytes: Uint8Array): File {
  return new File([bytes.slice()], 'current.pdf', { type: 'application/pdf' })
}

function inspectFormFor(bytes: Uint8Array, documentId: string): FormData {
  const form = new FormData()
  form.set('file', pdfFile(bytes))
  form.set('documentId', documentId)
  form.set(
    'probe',
    JSON.stringify({ pageIndex: 0, rect: [35, 295, 125, 316], oldText: 'ORIGINAL' }),
  )
  return form
}

function formFor(bytes: Uint8Array, documentId: string, target?: PdfTextTarget): FormData {
  const form = new FormData()
  form.set('file', pdfFile(bytes))
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
        target,
      },
    ]),
  )
  return form
}

async function readText(bytes: Uint8Array): Promise<string> {
  const task = getDocument({ data: bytes.slice() })
  try {
    const pdf = await task.promise
    const content = await (await pdf.getPage(1)).getTextContent()
    return content.items.map((item) => ('str' in item ? item.str : '')).join('')
  } finally {
    await task.destroy()
  }
}

describe('PDF Agent authenticated text host route', () => {
  it('authenticates manual markup and returns annotation bytes without saving the original', async () => {
    const bytes = await fixture()
    const upload = new FormData()
    upload.set('file', pdfFile(bytes))
    const uploaded = await app.request('/api/documents/files', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: upload,
    })
    expect(uploaded.status).toBe(201)
    const documentId = ((await uploaded.json()) as { document: { id: string } }).document.id
    const inspected = await app.request('/api/conversations/pdf-agent/inspect-text', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: inspectFormFor(bytes, documentId),
    })
    const { target } = (await inspected.json()) as { target: PdfTextTarget }
    const form = new FormData()
    form.set('file', pdfFile(bytes))
    form.set('documentId', documentId)
    form.set('expectedVersion', '4')
    form.set('markup', JSON.stringify({ target, type: 'highlight' }))
    const denied = await app.request('/api/conversations/pdf-agent/apply-markup', {
      method: 'POST',
      body: form,
    })
    expect(denied.status).toBe(401)
    const response = await app.request('/api/conversations/pdf-agent/apply-markup', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: form,
    })
    expect(response.status).toBe(200)
    const result = (await response.json()) as { bytesBase64: string; version: number }
    expect(result.version).toBe(5)
    const marked = new Uint8Array(Buffer.from(result.bytesBase64, 'base64'))
    const task = getDocument({ data: marked.slice() })
    try {
      const page = await (await task.promise).getPage(1)
      expect(
        (await page.getAnnotations()).some((annotation) => annotation.subtype === 'Highlight'),
      ).toBe(true)
    } finally {
      await task.destroy()
    }
    const original = await app.request(`/api/documents/${documentId}/file`, {
      headers: { Cookie: cookie },
    })
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(bytes)
  })

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

  it('inspects an exact object, then returns verified canvas bytes without replacing the stored original', async () => {
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
    const inspected = await app.request('/api/conversations/pdf-agent/inspect-text', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: inspectFormFor(bytes, documentId),
    })
    expect(inspected.status).toBe(200)
    const { target } = (await inspected.json()) as { target: PdfTextTarget }
    expect(target).toMatchObject({ pageIndex: 0, text: 'ORIGINAL' })
    const response = await app.request('/api/conversations/pdf-agent/apply-text', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: formFor(bytes, documentId, target),
    })
    expect(response.status).toBe(200)
    const result = (await response.json()) as { bytesBase64: string; version: number }
    expect(result.version).toBe(5)
    const edited = new Uint8Array(Buffer.from(result.bytesBase64, 'base64'))
    expect(edited).not.toEqual(bytes)
    expect((await PDFDocument.load(edited)).getPageCount()).toBe(1)
    expect(await readText(edited)).toContain('REVISED')
    expect(await readText(edited)).not.toContain('ORIGINAL')
    const stale = await app.request('/api/conversations/pdf-agent/apply-text', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: formFor(edited, documentId, target),
    })
    expect(stale.status).toBe(400)
    expect(await stale.json()).toMatchObject({ error: { code: 'PDF_TEXT_EDIT_FAILED' } })
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
    const inspect = await app.request('/api/conversations/pdf-agent/inspect-text', {
      method: 'POST',
      body: inspectFormFor(await fixture(), 'missing'),
    })
    expect(inspect.status).toBe(401)
  })

  it('rejects unverified text replacement', async () => {
    const bytes = await fixture()
    const upload = new FormData()
    upload.set('file', pdfFile(bytes))
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
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: 'PDF_TEXT_EDIT_FAILED' } })
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
