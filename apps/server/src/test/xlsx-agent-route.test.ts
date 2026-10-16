import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it } from 'vitest'
import { app, getAuthCookie } from './helpers.js'
import { uploadFile } from '../services/upload.js'
import { encodePdfPng } from '../services/pdf-image-codec.js'

const fixture = new URL(
  '../../../../packages/office/vendor/apps/docs/tests/pagination-corpus/xlsx-fixture.xlsx',
  import.meta.url,
)
let cookie: string

beforeAll(async () => {
  cookie = await getAuthCookie()
})

function formFor(bytes: Uint8Array, documentId: string): FormData {
  const form = new FormData()
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  form.set(
    'file',
    new File([copy], 'current.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
  form.set('documentId', documentId)
  form.set('expectedVersion', '2')
  form.set(
    'ops',
    JSON.stringify([{ op: 'set_cell', sheetId: 'sheet-1', address: 'A1', value: '画布新值' }]),
  )
  return form
}

describe('XLSX Agent authenticated host route', () => {
  it('carries a local image through multipart without persisting the working workbook', async () => {
    const bytes = new Uint8Array(readFileSync(fixture))
    const source = await uploadFile({ filename: 'image-route.xlsx', data: bytes })
    const image = encodePdfPng({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([200, 30, 50, 255]),
    })
    const make = (type = 'image/png', content = image) => {
      const form = formFor(bytes, source.document.id)
      form.set(
        'ops',
        JSON.stringify([{ op: 'add_image', sheetId: 'sheet-1', path: 'upload', anchorCell: 'E2' }]),
      )
      form.set('imageBlob', new File([new Uint8Array(content)], 'local.png', { type }))
      return form
    }
    const request = (form: FormData) =>
      app.request('/api/conversations/xlsx-agent/apply-ops', {
        method: 'POST',
        headers: { Cookie: cookie },
        body: form,
      })
    const response = await request(make())
    expect(response.status).toBe(200)
    const result = (await response.json()) as { bytesBase64: string; version: number }
    expect(result.version).toBe(3)
    const zip = await JSZip.loadAsync(Buffer.from(result.bytesBase64, 'base64'))
    const media = Object.keys(zip.files).find((path) => /^xl\/media\/.+\.png$/.test(path))
    expect(media).toBeDefined()
    expect(await zip.file(media!)!.async('uint8array')).toEqual(new Uint8Array(image))
    expect((await request(make('image/jpeg'))).status).toBe(400)
    expect((await request(make('image/svg+xml'))).status).toBe(400)
    expect((await request(make('image/png', Buffer.alloc(0)))).status).toBe(413)
    const original = await app.request(`/api/documents/${source.document.id}/file`, {
      headers: { Cookie: cookie },
    })
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(bytes)
  })

  it('edits submitted canvas bytes while leaving the stored original untouched', async () => {
    const bytes = new Uint8Array(readFileSync(fixture))
    const upload = new FormData()
    upload.set(
      'file',
      new File([bytes], 'agent-route.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    )
    const uploaded = await app.request('/api/documents/files', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: upload,
    })
    expect(uploaded.status).toBe(201)
    const documentId = ((await uploaded.json()) as { document: { id: string } }).document.id
    const response = await app.request('/api/conversations/xlsx-agent/apply-ops', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: formFor(bytes, documentId),
    })
    expect(response.status).toBe(200)
    const result = (await response.json()) as {
      bytesBase64: string
      version: number
      changedCells: string[]
    }
    expect(result.version).toBe(3)
    expect(result.changedCells).toContain('sheet-1:A1')
    const edited = await JSZip.loadAsync(Buffer.from(result.bytesBase64, 'base64'))
    const editedSheet = await edited.file('xl/worksheets/sheet1.xml')?.async('string')
    expect(editedSheet).toContain('画布新值')
    const original = await app.request(`/api/documents/${documentId}/file`, {
      headers: { Cookie: cookie },
    })
    expect(original.status).toBe(200)
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(bytes)
  })

  it('requires authentication before accepting canvas bytes', async () => {
    const response = await app.request('/api/conversations/xlsx-agent/apply-ops', {
      method: 'POST',
      body: formFor(new Uint8Array(readFileSync(fixture)), 'missing'),
    })
    expect(response.status).toBe(401)
  })
})
