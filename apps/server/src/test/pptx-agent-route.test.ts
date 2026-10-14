import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it } from 'vitest'
import { app, getAuthCookie } from './helpers.js'

const fixture = new URL(
  '../../../../packages/office/tests/fixtures/title-layout.pptx',
  import.meta.url,
)
let cookie: string

beforeAll(async () => {
  cookie = await getAuthCookie()
})

function formFor(bytes: Uint8Array, documentId: string, ops: unknown[]): FormData {
  const form = new FormData()
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  form.set(
    'file',
    new File([copy], 'current.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }),
  )
  form.set('documentId', documentId)
  form.set('expectedVersion', '2')
  form.set('ops', JSON.stringify(ops))
  return form
}

describe('PPTX Agent authenticated host route', () => {
  it('uses the unsaved canvas and returns edited bytes without saving the original', async () => {
    const bytes = new Uint8Array(readFileSync(fixture))
    const upload = new FormData()
    upload.set(
      'file',
      new File([bytes], 'agent-route.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }),
    )
    const uploaded = await app.request('/api/documents/files', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: upload,
    })
    expect(uploaded.status).toBe(201)
    const uploadedBody = (await uploaded.json()) as { document: { id: string } }
    const documentId = uploadedBody.document.id
    const response = await app.request('/api/conversations/pptx-agent/apply-ops', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: formFor(bytes, documentId, [{ op: 'addBlankSlide', target: { slide: 0 } }]),
    })
    const raw = await response.text()
    expect({ status: response.status, body: raw }).toMatchObject({ status: 200 })
    const result = JSON.parse(raw) as { bytesBase64: string; records: unknown[]; version: number }
    expect(result.version).toBe(3)
    expect(result.records).toHaveLength(1)
    const saved = await JSZip.loadAsync(Buffer.from(result.bytesBase64, 'base64'))
    expect(saved.file('ppt/slides/slide2.xml')).not.toBeNull()
    const original = await app.request(`/api/documents/${documentId}/file`, {
      headers: { Cookie: cookie },
    })
    expect(original.status).toBe(200)
    const originalZip = await JSZip.loadAsync(await original.arrayBuffer())
    expect(originalZip.file('ppt/slides/slide2.xml')).toBeNull()
  })

  it('requires authentication before reading the submitted file', async () => {
    const response = await app.request('/api/conversations/pptx-agent/apply-ops', {
      method: 'POST',
      body: formFor(new Uint8Array(readFileSync(fixture)), 'missing', [{ op: 'addBlankSlide' }]),
    })
    expect(response.status).toBe(401)
  })
})
