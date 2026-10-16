import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { beforeAll, expect, it } from 'vitest'
import { app, getAuthCookie } from './helpers.js'
import { uploadFile } from '../services/upload.js'
import { encodePdfPng } from '../services/pdf-image-codec.js'

const sourceBytes = new Uint8Array(
  readFileSync(
    new URL('../../../../packages/office/tests/fixtures/title-layout.pptx', import.meta.url),
  ),
)
let cookie: string
beforeAll(async () => {
  cookie = await getAuthCookie()
})

function makeForm(documentId: string, bytes: Uint8Array, image: Uint8Array): FormData {
  const form = new FormData()
  form.set('documentId', documentId)
  form.set('expectedVersion', '7')
  form.set('input', JSON.stringify({ kind: 'image_background', slide: 0 }))
  form.set('file', new File([new Uint8Array(bytes)], 'working.pptx'))
  form.set('asset', new File([new Uint8Array(image)], 'background.png', { type: 'image/png' }))
  return form
}

it('applies an image to current unsaved PPTX bytes without persisting them', async () => {
  const source = await uploadFile({ filename: 'manual-asset-route.pptx', data: sourceBytes })
  const working = await JSZip.loadAsync(sourceBytes)
  const slide = working.file('ppt/slides/slide1.xml')!
  working.file(
    'ppt/slides/slide1.xml',
    (await slide.async('string')).replace('Title', 'Unsaved title'),
  )
  const bytes = await working.generateAsync({ type: 'uint8array' })
  const png = encodePdfPng({ width: 1, height: 1, data: new Uint8ClampedArray([30, 60, 90, 255]) })
  const request = (form: FormData, auth = true) =>
    app.request('/api/conversations/pptx-agent/manual-asset', {
      method: 'POST',
      headers: auth ? { Cookie: cookie } : {},
      body: form,
    })
  const response = await request(makeForm(source.document.id, bytes, png))
  expect(response.status).toBe(200)
  const result = (await response.json()) as { bytesBase64: string; version: number; data: unknown }
  expect(result.version).toBe(8)
  expect(result.data).toEqual({ slideIndex: 0 })
  const zip = await JSZip.loadAsync(Buffer.from(result.bytesBase64, 'base64'))
  expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain('Unsaved title')
  expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain('blipFill')
  const images = await Promise.all(
    Object.keys(zip.files)
      .filter((path) => /^ppt\/media\/.+\.png$/.test(path))
      .map((path) => zip.file(path)!.async('uint8array')),
  )
  expect(images).toContainEqual(new Uint8Array(png))
  const original = await app.request(`/api/documents/${source.document.id}/file`, {
    headers: { Cookie: cookie },
  })
  expect(new Uint8Array(await original.arrayBuffer())).toEqual(sourceBytes)
  expect((await request(makeForm(source.document.id, bytes, png), false)).status).toBe(401)
  const invalid = makeForm(source.document.id, bytes, png)
  invalid.set('input', '{')
  expect((await request(invalid)).status).toBe(400)
  const staleField = makeForm(source.document.id, bytes, png)
  staleField.set('expectedVersion', '-1')
  expect((await request(staleField)).status).toBe(400)
  expect((await request(makeForm(source.document.id, bytes, new Uint8Array()))).status).toBe(413)
  const wrongMime = makeForm(source.document.id, bytes, png)
  wrongMime.set('asset', new File([new Uint8Array(png)], 'wrong.jpg', { type: 'image/jpeg' }))
  expect((await request(wrongMime)).status).toBe(400)
})
