import { PDFDocument, StandardFonts } from 'pdf-lib'
import type { PdfTextBlockSnapshot } from '@mimir/shared'
import { beforeAll, expect, it } from 'vitest'
import { app, getAuthCookie } from './helpers.js'

let cookie: string
const file = (data: Uint8Array) =>
  new File([data.slice()], 'rewrite-history.pdf', { type: 'application/pdf' })
beforeAll(async () => {
  cookie = await getAuthCookie()
})
it('writes real original paragraphs through authenticated HTTP, with two explicit saves and byte-exact undo/redo saves', async () => {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    page = pdf.addPage()
  page.drawText('HTTP rewrite original repeated repeated', { x: 40, y: 600, size: 12, font })
  page.drawText('A second original line to keep', { x: 40, y: 582, size: 12, font })
  const bytes = await pdf.save(),
    upload = new FormData()
  upload.set('file', file(bytes))
  const uploaded = await app.request('/api/documents/files', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: upload,
  })
  expect(uploaded.status).toBe(201)
  const id = ((await uploaded.json()) as { document: { id: string } }).document.id,
    path = '/api/conversations/pdf-agent/text-blocks'
  const request = async (data: Uint8Array, operation: unknown, version = 10, auth = true) => {
    const form = new FormData()
    form.set('file', file(data))
    form.set('operation', JSON.stringify(operation))
    form.set('documentId', id)
    form.set('expectedVersion', String(version))
    return app.request(path, {
      method: 'POST',
      headers: auth ? { Cookie: cookie } : {},
      body: form,
    })
  }
  expect((await request(bytes, { op: 'read', pageIndex: 0 }, 10, false)).status).toBe(401)
  const snapshot = (await (await request(bytes, { op: 'read', pageIndex: 0 })).json()) as {
      version: number
      blocks: PdfTextBlockSnapshot
    },
    target = snapshot.blocks.blocks[0]!.target!
  expect(snapshot.blocks.blocks[0]!.canRewrite).toBe(true)
  const invalid = await request(bytes, {
    op: 'rewrite',
    target,
    newText: 'no',
    replace: { oldText: 'original', occurrence: 0 },
  })
  expect(invalid.status).toBe(400)
  expect(
    (
      await request(bytes, {
        op: 'rewrite',
        target,
        newText: 'no',
        replace: { oldText: 'original', occurrence: 1 },
        align: 'center',
      })
    ).status,
  ).toBe(400)
  const response = await request(bytes, {
    op: 'rewrite',
    target,
    newText: 'A fully rewritten original paragraph is now searchable after a normal save.',
  })
  expect(response.status).toBe(200)
  const result = (await response.json()) as {
      version: number
      bytesBase64: string
      blocks: PdfTextBlockSnapshot
    },
    rewritten = new Uint8Array(Buffer.from(result.bytesBase64, 'base64'))
  expect(result.version).toBe(11)
  const original = async () =>
    new Uint8Array(
      await (
        await app.request(`/api/documents/${id}/file`, { headers: { Cookie: cookie } })
      ).arrayBuffer(),
    )
  expect(await original()).toEqual(bytes)
  for (const data of [rewritten, rewritten, bytes, rewritten]) {
    const save = new FormData()
    save.set('file', file(data))
    expect(
      (
        await app.request(`/api/documents/${id}/file`, {
          method: 'PUT',
          headers: { Cookie: cookie },
          body: save,
        })
      ).status,
    ).toBe(200)
    expect(await original()).toEqual(data)
  }
  expect((await request(rewritten, { op: 'rewrite', target, newText: 'Stale' }, 11)).status).toBe(
    400,
  )
})
