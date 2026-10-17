import { PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { encodePdfPng } from '../services/pdf-image-codec.js'
import type { PdfImageSnapshot, PdfTextTarget } from '@mimir/shared'
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
  it('authenticates image working bytes and refuses stale targets without storing them', async () => {
    const bytes = await fixture()
    const upload = new FormData()
    upload.set('file', pdfFile(bytes))
    const uploaded = await app.request('/api/documents/files', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: upload,
    })
    const documentId = ((await uploaded.json()) as { document: { id: string } }).document.id
    const make = (working: Uint8Array, operation: unknown, id = documentId, version = '7') => {
      const form = new FormData()
      form.set('file', pdfFile(working))
      form.set('documentId', id)
      form.set('expectedVersion', version)
      form.set('operation', JSON.stringify(operation))
      return form
    }
    const path = '/api/conversations/pdf-agent/images'
    expect(
      (await app.request(path, { method: 'POST', body: make(bytes, { op: 'read' }) })).status,
    ).toBe(401)
    const request = (working: Uint8Array, operation: unknown, id?: string, version?: string) =>
      app.request(path, {
        method: 'POST',
        headers: { Cookie: cookie },
        body: make(working, operation, id, version),
      })
    expect((await request(bytes, { op: 'read' }, 'missing-document')).status).toBe(404)
    expect((await request(bytes, { op: 'read' }, undefined, '-1')).status).toBe(400)
    const png = encodePdfPng({ width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 128]) })
    const inserted = await request(bytes, {
      op: 'insert_image',
      pageIndex: 0,
      image: png.toString('base64'),
      x: 40,
      y: 100,
      width: 60,
    })
    expect(inserted.status).toBe(200)
    const first = (await inserted.json()) as {
      version: number
      bytesBase64: string
      images: PdfImageSnapshot
    }
    expect(first).toMatchObject({
      version: 8,
      images: { images: [{ x: 40, y: 100, width: 60, height: 60 }] },
    })
    const working = new Uint8Array(Buffer.from(first.bytesBase64, 'base64'))
    const changed = await request(working, {
      op: 'transform_image',
      target: first.images.images[0]!.target,
      x: 70,
    })
    expect(changed.status).toBe(200)
    const second = (await changed.json()) as { bytesBase64: string; images: PdfImageSnapshot }
    expect(second.images.images[0]!.x).toBe(70)
    expect(
      (
        await request(new Uint8Array(Buffer.from(second.bytesBase64, 'base64')), {
          op: 'delete_image',
          target: first.images.images[0]!.target,
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await request(working, {
          op: 'set_image_opacity',
          target: first.images.images[0]!.target,
          alpha: 2,
        })
      ).status,
    ).toBe(400)
    expect(await readText(new Uint8Array(Buffer.from(second.bytesBase64, 'base64')))).toContain(
      'ORIGINAL',
    )
    const original = await app.request(`/api/documents/${documentId}/file`, {
      headers: { Cookie: cookie },
    })
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(bytes)
  })

  it('authenticates form writes with native outlines, validates hashes and dry runs without storing working bytes', async () => {
    const pdf = await PDFDocument.load(await fixture())
    pdf
      .getForm()
      .createTextField('name')
      .addToPage(pdf.getPage(0), { x: 30, y: 200, width: 200, height: 30 })
    const outlines = pdf.context.obj({ Type: 'Outlines', Count: 1 })
    const outlineRef = pdf.context.register(outlines)
    const itemRef = pdf.context.register(
      pdf.context.obj({
        Title: PDFString.of('Original page'),
        Parent: outlineRef,
        Dest: [pdf.getPage(0).ref, 'Fit'],
      }),
    )
    outlines.set(PDFName.of('First'), itemRef)
    outlines.set(PDFName.of('Last'), itemRef)
    pdf.catalog.set(PDFName.of('Outlines'), outlineRef)
    const bytes = await pdf.save()
    const upload = new FormData()
    upload.set('file', pdfFile(bytes))
    const uploaded = await app.request('/api/documents/files', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: upload,
    })
    const documentId = ((await uploaded.json()) as { document: { id: string } }).document.id
    const make = (operation: unknown, sha256?: string) => {
      const form = new FormData()
      form.set('file', pdfFile(bytes))
      form.set('documentId', documentId)
      form.set('expectedVersion', '5')
      form.set('operation', JSON.stringify(operation))
      if (sha256) form.set('sha256', sha256)
      return form
    }
    const path = '/api/conversations/pdf-agent/forms'
    expect((await app.request(path, { method: 'POST', body: make({ op: 'read' }) })).status).toBe(
      401,
    )
    const request = (operation: unknown, sha256?: string) =>
      app.request(path, {
        method: 'POST',
        headers: { Cookie: cookie },
        body: make(operation, sha256),
      })
    const read = await request({ op: 'read' })
    expect(read.status).toBe(200)
    const snapshot = (await read.json()) as {
      version: number
      forms: { sha256: string; fields: unknown[] }
    }
    expect(snapshot).toMatchObject({
      version: 5,
      forms: { fields: [{ name: 'name', type: 'text' }] },
    })
    const op = {
      op: 'apply',
      ops: [{ op: 'setFormValue', value: { name: 'name', value: '路由中文' } }],
    }
    expect((await request(op, '0'.repeat(64))).status).toBe(400)
    const dryRun = await request({ ...op, dryRun: true }, snapshot.forms.sha256)
    expect(await dryRun.json()).toMatchObject({ version: 5, forms: { fields: [{ value: '' }] } })
    const write = await request(op, snapshot.forms.sha256)
    expect(write.status).toBe(200)
    const result = (await write.json()) as { version: number; bytesBase64: string; forms: unknown }
    expect(result).toMatchObject({ version: 6, forms: { fields: [{ value: '路由中文' }] } })
    const working = await PDFDocument.load(Buffer.from(result.bytesBase64, 'base64'))
    expect(working.getForm().getTextField('name').getText()).toBe('路由中文')
    const task = getDocument({ data: new Uint8Array(Buffer.from(result.bytesBase64, 'base64')) })
    try {
      const independent = await task.promise
      const outline = await independent.getOutline()
      expect(outline).toHaveLength(1)
      expect(outline![0]!.title).toBe('Original page')
      const destination = outline![0]!.dest as Array<{ num: number; gen: number }>
      expect(await independent.getPageIndex(destination[0]!)).toBe(0)
    } finally {
      await task.destroy()
    }
    expect(await readText(new Uint8Array(Buffer.from(result.bytesBase64, 'base64')))).toContain(
      'ORIGINAL',
    )
    const original = await app.request(`/api/documents/${documentId}/file`, {
      headers: { Cookie: cookie },
    })
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(bytes)
  })

  it('authenticates annotation bytes, rejects invalid/stale requests and leaves the stored original unchanged', async () => {
    const bytes = await fixture()
    const upload = new FormData()
    upload.set('file', pdfFile(bytes))
    const uploaded = await app.request('/api/documents/files', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: upload,
    })
    const documentId = ((await uploaded.json()) as { document: { id: string } }).document.id
    const make = (operation: unknown, sha256?: string) => {
      const form = new FormData()
      form.set('file', pdfFile(bytes))
      form.set('documentId', documentId)
      form.set('expectedVersion', '7')
      form.set('operation', JSON.stringify(operation))
      if (sha256) form.set('sha256', sha256)
      return form
    }
    const path = '/api/conversations/pdf-agent/annotations'
    expect((await app.request(path, { method: 'POST', body: make({ op: 'read' }) })).status).toBe(
      401,
    )
    const read = await app.request(path, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: make({ op: 'read' }),
    })
    expect(read.status).toBe(200)
    const baseline = (await read.json()) as {
      version: number
      annotations: { sha256: string; annotations: unknown[] }
    }
    expect(baseline).toMatchObject({ version: 7, annotations: { annotations: [] } })
    const op = {
      authorship: 'user',
      author: 'spoofed',
      op: 'add_note',
      pageIndex: 0,
      x: 20,
      y: 20,
      text: 'route note',
    }
    expect(
      (
        await app.request(path, {
          method: 'POST',
          headers: { Cookie: cookie },
          body: make(op, '0'.repeat(64)),
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await app.request(path, {
          method: 'POST',
          headers: { Cookie: cookie },
          body: make({ ...op, text: '' }, baseline.annotations.sha256),
        })
      ).status,
    ).toBe(400)
    const response = await app.request(path, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: make(op, baseline.annotations.sha256),
    })
    expect(response.status).toBe(200)
    const written = (await response.json()) as {
      bytesBase64: string
      version: number
      annotations: { annotations: Array<{ text: string }> }
    }
    expect(written).toMatchObject({
      version: 8,
      annotations: { annotations: [{ text: 'route note', author: 'admin' }] },
    })
    const task = getDocument({ data: Uint8Array.from(Buffer.from(written.bytesBase64, 'base64')) })
    try {
      expect(
        (await (await (await task.promise).getPage(1)).getAnnotations())[0].contentsObj.str,
      ).toBe('route note')
    } finally {
      await task.destroy()
    }
    const original = await app.request(`/api/documents/${documentId}/file`, {
      headers: { Cookie: cookie },
    })
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(bytes)
  })

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

  it('offers only the executable text insert shape from the upstream tool family', async () => {
    const catalog = await pdfAgentCatalog()
    expect(catalog.clientToolNames.has('insert_text')).toBe(true)
    expect(catalog.clientToolNames.has('edit_text')).toBe(true)
    const insert = catalog.tools.find((tool) => tool.name === 'insert_text')
    expect(insert?.inputSchema).toMatchObject({
      required: ['page', 'text'],
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

describe('PDF semantic text host parameters', () => {
  it('authenticates current working bytes, validates layout/markup and never persists preparation', async () => {
    const bytes = await fixture(),
      upload = new FormData()
    upload.set('file', pdfFile(bytes))
    const response = await app.request('/api/documents/files', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: upload,
    })
    const id = ((await response.json()) as { document: { id: string } }).document.id
    const make = (path: 'apply-text' | 'apply-markup', value: unknown, documentId = id) => {
      const form = new FormData()
      form.set('file', pdfFile(bytes))
      form.set('documentId', documentId)
      form.set('expectedVersion', '8')
      if (path === 'apply-text') {
        form.set('kind', 'layout')
        form.set('items', JSON.stringify([value]))
      } else form.set('markup', JSON.stringify(value))
      return form
    }
    const layout = {
      pageIndex: 0,
      text: 'Inserted paragraph wraps inside the page',
      fontSize: 12,
      color: [0, 0, 0],
      maxWidth: 80,
      align: 'right',
    }
    const path = '/api/conversations/pdf-agent/apply-text'
    expect(
      (await app.request(path, { method: 'POST', body: make('apply-text', layout) })).status,
    ).toBe(401)
    expect(
      (
        await app.request(path, {
          method: 'POST',
          headers: { Cookie: cookie },
          body: make('apply-text', layout, 'missing'),
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await app.request(path, {
          method: 'POST',
          headers: { Cookie: cookie },
          body: make('apply-text', { ...layout, x: 4 }),
        })
      ).status,
    ).toBe(400)
    const prepared = await app.request(path, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: make('apply-text', layout),
    })
    expect(prepared.status).toBe(200)
    const result = (await prepared.json()) as {
      bytesBase64: string
      version: number
      layouts: { wrappedText: string; lineXOffsets: number[] }[]
    }
    expect(result.version).toBe(8)
    expect(Buffer.from(result.bytesBase64, 'base64')).toEqual(Buffer.from(bytes))
    expect(result.layouts[0]!.wrappedText).toContain('\n')
    expect(result.layouts[0]!.lineXOffsets.some((x) => x > 0)).toBe(true)
    const markup = { pageIndex: 0, text: 'ORIG', type: 'underline', all: true, color: '#123456' }
    const marked = await app.request('/api/conversations/pdf-agent/apply-markup', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: make('apply-markup', markup),
    })
    expect(marked.status).toBe(200)
    expect(await marked.json()).toMatchObject({ version: 9, count: 1 })
    expect(
      (
        await app.request('/api/conversations/pdf-agent/apply-markup', {
          method: 'POST',
          headers: { Cookie: cookie },
          body: make('apply-markup', { ...markup, color: 'red' }),
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await app.request('/api/conversations/pdf-agent/apply-markup', {
          method: 'POST',
          headers: { Cookie: cookie },
          body: make('apply-markup', { ...markup, text: 'missing' }),
        })
      ).status,
    ).toBe(400)
    const stored = await app.request(`/api/documents/${id}/file`, { headers: { Cookie: cookie } })
    expect(stored.status).toBe(200)
    expect(Buffer.from(await stored.arrayBuffer())).toEqual(Buffer.from(bytes))
  })
})
