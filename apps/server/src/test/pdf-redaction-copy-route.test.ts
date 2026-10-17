import { PDFDocument, StandardFonts } from 'pdf-lib'
import { beforeAll, expect, it } from 'vitest'
import { app, getAuthCookie } from './helpers.js'
import { uploadFile } from '../services/upload.js'

let cookie: string
beforeAll(async () => {
  cookie = await getAuthCookie()
})

it('exports an authenticated redacted copy at the same version without replacing library bytes', async () => {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica)
  pdf.addPage([300, 200]).drawText('PUBLIC SECRET PUBLIC', { x: 20, y: 90, size: 18, font })
  const bytes = await pdf.save()
  const source = await uploadFile({ filename: 'redaction-route.pdf', data: bytes })
  const make = (operation: unknown) => {
    const form = new FormData()
    form.set('documentId', source.document.id)
    form.set('expectedVersion', '19')
    form.set('file', new File([new Uint8Array(bytes)], 'current.pdf', { type: 'application/pdf' }))
    form.set('operation', JSON.stringify(operation))
    return form
  }
  const operation = { op: 'redact_copy', regions: [{ pageIndex: 0, rect: [78, 84, 145, 112] }] }
  const request = (body: FormData, authenticated = true) =>
    app.request('/api/conversations/pdf-agent/local', {
      method: 'POST',
      headers: authenticated ? { Cookie: cookie } : {},
      body,
    })
  const response = await request(make(operation))
  expect(response.status).toBe(200)
  const body = (await response.json()) as {
    version: number
    bytesBase64?: string
    info?: unknown
    outputs: Array<{ name: string; bytesBase64: string }>
  }
  expect(body.version).toBe(19)
  expect(body.bytesBase64).toBeUndefined()
  expect(body.info).toBeUndefined()
  expect(body.outputs).toHaveLength(1)
  expect(body.outputs[0]!.name).toBe('document-redacted.pdf')
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({
    data: new Uint8Array(Buffer.from(body.outputs[0]!.bytesBase64, 'base64')),
  })
  try {
    const page = await (await task.promise).getPage(1)
    const text = (await page.getTextContent()).items
      .flatMap((item) => ('str' in item ? [item.str] : []))
      .join('')
    expect(text).toContain('PUBLIC')
    expect(text).not.toContain('SECRET')
  } finally {
    await task.destroy()
  }
  const original = await app.request(`/api/documents/${source.document.id}/file`, {
    headers: { Cookie: cookie },
  })
  expect(new Uint8Array(await original.arrayBuffer())).toEqual(bytes)
  expect((await request(make(operation), false)).status).toBe(401)
  expect((await request(make({ ...operation, unknown: true }))).status).toBe(400)
  expect(
    (
      await request(
        make({
          op: 'redact_copy',
          regions: [...operation.regions, { pageIndex: 999, rect: [1, 1, 2, 2] }],
        }),
      )
    ).status,
  ).toBe(400)
  const wrongAsset = make(operation)
  wrongAsset.set('asset', new File([new Uint8Array(bytes)], 'asset.pdf'))
  expect((await request(wrongAsset)).status).toBe(400)
})
