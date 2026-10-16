import { elementDurableId } from '../../../../packages/office/vendor/packages/pptx-engine/src/identity.js'
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  openPptx,
  getSlideAnimations,
} from '../../../../packages/office/vendor/packages/pptx-engine/src/index.js'
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

  it('accepts the dedicated Zoom snapshot envelope while retaining the ordinary operation limit', async () => {
    const bytes = new Uint8Array(readFileSync(fixture))
    const upload = new FormData()
    upload.set(
      'file',
      new File([bytes], 'zoom-route.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }),
    )
    const uploaded = await app.request('/api/documents/files', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: upload,
    })
    expect(uploaded.status).toBe(201)
    const { document } = (await uploaded.json()) as { document: { id: string } }
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X9WQAAAAASUVORK5CYII='
    const form = formFor(bytes, document.id, [
      { mode: 'slide', slide: 0, targets: [{ slide: 0, png }] },
    ])
    // JSON whitespace exercises the HTTP envelope independently of the image budget.
    form.set('ops', String(form.get('ops')) + ' '.repeat(1_000_001))
    form.set('action', 'manual_zoom')
    const result = await app.request('/api/conversations/pptx-agent/apply-ops', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: form,
    })
    const raw = await result.text()
    expect({ status: result.status, body: raw }).toMatchObject({ status: 200 })
    const body = JSON.parse(raw) as { bytesBase64: string; version: number; changed: boolean }
    expect(body.version).toBe(3)
    expect(body.changed).toBe(true)
    const zip = await JSZip.loadAsync(Buffer.from(body.bytesBase64, 'base64'))
    expect(await zip.file('ppt/slides/_rels/slide1.xml.rels')!.async('string')).toContain(
      '/relationships/slide"',
    )
    const ordinary = formFor(bytes, document.id, [
      { op: 'setHidden', target: { slide: 0 }, hidden: true },
    ])
    ordinary.set('ops', String(ordinary.get('ops')) + ' '.repeat(1_000_001))
    const rejected = await app.request('/api/conversations/pptx-agent/apply-ops', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: ordinary,
    })
    expect(rejected.status).toBe(400)
    expect(await rejected.text()).toContain('INVALID_INPUT')
  })

  it('executes manual animation through the authenticated action without widening model operations', async () => {
    const bytes = new Uint8Array(readFileSync(fixture))
    const opened = await openPptx(bytes)
    const elementId = elementDurableId(opened.deck.slides[0]!.elements[0]!)!
    const upload = new FormData()
    upload.set(
      'file',
      new File([bytes], 'manual-animation-route.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }),
    )
    const uploaded = await app.request('/api/documents/files', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: upload,
    })
    expect(uploaded.status).toBe(201)
    const { document } = (await uploaded.json()) as { document: { id: string } }
    const input = {
      kind: 'animation',
      slide: 0,
      elementId,
      operation: 'replace',
      effect: 'fade',
      byParagraph: true,
    }
    const form = formFor(bytes, document.id, [input])
    form.set('action', 'manual_animation')
    const response = await app.request('/api/conversations/pptx-agent/apply-ops', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: form,
    })
    const body = (await response.json()) as {
      bytesBase64: string
      version: number
      changed: boolean
    }
    expect({ status: response.status, body }).toMatchObject({
      status: 200,
      body: { version: 3, changed: true },
    })
    const result = await openPptx(new Uint8Array(Buffer.from(body.bytesBase64, 'base64')))
    expect(getSlideAnimations(result.deck.slides[0]!)).toMatchObject([{ effect: 'fade' }])
    const original = await app.request(`/api/documents/${document.id}/file`, {
      headers: { Cookie: cookie },
    })
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(bytes)
    const invalid = formFor(bytes, document.id, [{ ...input, presetXml: '<p:par/>' }])
    invalid.set('action', 'manual_animation')
    const rejected = await app.request('/api/conversations/pptx-agent/apply-ops', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: invalid,
    })
    expect(rejected.status).toBe(400)
    const model = await app.request('/api/conversations/pptx-agent/apply-ops', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: formFor(
        bytes,
        document.id,
        Array.from({ length: 51 }, () => ({ op: 'setHidden', target: { slide: 0 }, hidden: true })),
      ),
    })
    expect(model.status).toBe(400)
    const unauthorized = formFor(bytes, document.id, [input])
    unauthorized.set('action', 'manual_animation')
    expect(
      (
        await app.request('/api/conversations/pptx-agent/apply-ops', {
          method: 'POST',
          body: unauthorized,
        })
      ).status,
    ).toBe(401)
  })

  it('applies a strict manual paragraph request without persisting the submitted canvas', async () => {
    const bytes = new Uint8Array(readFileSync(fixture))
    const upload = new FormData()
    upload.set(
      'file',
      new File([bytes], 'paragraph-route.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }),
    )
    const uploaded = await app.request('/api/documents/files', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: upload,
    })
    expect(uploaded.status).toBe(201)
    const { document } = (await uploaded.json()) as { document: { id: string } }
    const opened = await openPptx(bytes)
    const element = opened.deck.slides[0]!.elements.find(
      (item) => (item.type === 'text' || item.type === 'shape') && item.text?.paragraphs.length,
    )!
    const input = {
      slide: 0,
      el: elementDurableId(element),
      paraIndices: [0],
      format: { align: 'right' },
    }
    const form = formFor(bytes, document.id, [input])
    form.set('action', 'manual_paragraph')
    const response = await app.request('/api/conversations/pptx-agent/apply-ops', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: form,
    })
    const body = (await response.json()) as {
      bytesBase64: string
      version: number
      changed: boolean
    }
    expect({ status: response.status, body }).toMatchObject({
      status: 200,
      body: { version: 3, changed: true },
    })
    const zip = await JSZip.loadAsync(Buffer.from(body.bytesBase64, 'base64'))
    expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain('algn="r"')
    const original = await app.request(`/api/documents/${document.id}/file`, {
      headers: { Cookie: cookie },
    })
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(bytes)
    const invalid = formFor(bytes, document.id, [
      { ...input, format: { align: 'right', xml: '<a:pPr/>' } },
    ])
    invalid.set('action', 'manual_paragraph')
    expect(
      (
        await app.request('/api/conversations/pptx-agent/apply-ops', {
          method: 'POST',
          headers: { Cookie: cookie },
          body: invalid,
        })
      ).status,
    ).toBe(400)
    const unauthorized = formFor(bytes, document.id, [input])
    unauthorized.set('action', 'manual_paragraph')
    expect(
      (
        await app.request('/api/conversations/pptx-agent/apply-ops', {
          method: 'POST',
          body: unauthorized,
        })
      ).status,
    ).toBe(401)
  })

  it('inserts a reversed native arrow in one manual response and rejects arbitrary shape XML', async () => {
    const bytes = new Uint8Array(readFileSync(fixture))
    const upload = new FormData()
    upload.set(
      'file',
      new File([bytes], 'shape-route.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }),
    )
    const uploaded = await app.request('/api/documents/files', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: upload,
    })
    expect(uploaded.status).toBe(201)
    const { document } = (await uploaded.json()) as { document: { id: string } }
    const input = {
      kind: 'lineArrow',
      slide: 0,
      offset: { x: 1000000, y: 1000000, cx: 2000000, cy: 1000000 },
      flipH: true,
      flipV: true,
    }
    const form = formFor(bytes, document.id, [input])
    form.set('action', 'manual_shape')
    const response = await app.request('/api/conversations/pptx-agent/apply-ops', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: form,
    })
    const body = (await response.json()) as {
      bytesBase64: string
      version: number
      changed: boolean
    }
    expect({ status: response.status, body }).toMatchObject({
      status: 200,
      body: { version: 3, changed: true },
    })
    const zip = await JSZip.loadAsync(Buffer.from(body.bytesBase64, 'base64'))
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string')
    expect(xml).toContain('flipH="1"')
    expect(xml).toContain('flipV="1"')
    expect(xml).toContain('cx="2000000"')
    const original = await app.request(`/api/documents/${document.id}/file`, {
      headers: { Cookie: cookie },
    })
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(bytes)
    const invalid = formFor(bytes, document.id, [{ ...input, xml: '<p:cxnSp/>' }])
    invalid.set('action', 'manual_shape')
    expect(
      (
        await app.request('/api/conversations/pptx-agent/apply-ops', {
          method: 'POST',
          headers: { Cookie: cookie },
          body: invalid,
        })
      ).status,
    ).toBe(400)
    const unauthorized = formFor(bytes, document.id, [input])
    unauthorized.set('action', 'manual_shape')
    expect(
      (
        await app.request('/api/conversations/pptx-agent/apply-ops', {
          method: 'POST',
          body: unauthorized,
        })
      ).status,
    ).toBe(401)
  })

  it('requires authentication before reading the submitted file', async () => {
    const response = await app.request('/api/conversations/pptx-agent/apply-ops', {
      method: 'POST',
      body: formFor(new Uint8Array(readFileSync(fixture)), 'missing', [{ op: 'addBlankSlide' }]),
    })
    expect(response.status).toBe(401)
  })
})
