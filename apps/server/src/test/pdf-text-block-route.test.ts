import { PDFDocument, StandardFonts } from 'pdf-lib'
import type { PdfTextBlockSnapshot, PdfTextBlockTarget } from '@mimir/shared'
import { beforeAll, expect, it } from 'vitest'
import { app, getAuthCookie } from './helpers.js'
import { pdfAgentCatalog } from '../services/pdf-agent-catalog.js'

const file = (data: Uint8Array) =>
  new File([data.slice()], 'block-route.pdf', { type: 'application/pdf' })

let cookie: string
beforeAll(async () => {
  cookie = await getAuthCookie()
})
it('authenticates complete-block reads/writes; versions advance once and actual original saves/undo/redo remain explicit', async () => {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    page = pdf.addPage([400, 600])
  page.drawText('HTTP original paragraph first line', { x: 50, y: 500, font, size: 12 })
  page.drawText('HTTP original paragraph second line', { x: 50, y: 482, font, size: 12 })
  const bytes = await pdf.save(),
    upload = new FormData()

  upload.set('file', file(bytes))
  const uploaded = await app.request('/api/documents/files', {
    method: 'POST',
    headers: { Cookie: cookie },
    body: upload,
  })
  expect(uploaded.status).toBe(201)
  const id = ((await uploaded.json()) as { document: { id: string } }).document.id
  const form = (data: Uint8Array, operation: unknown, documentId = id, version = '11') => {
    const result = new FormData()
    result.set('file', file(data))
    result.set('operation', JSON.stringify(operation))
    result.set('documentId', documentId)
    result.set('expectedVersion', version)
    return result
  }
  const path = '/api/conversations/pdf-agent/text-blocks'
  expect(
    (await app.request(path, { method: 'POST', body: form(bytes, { op: 'read', pageIndex: 0 }) }))
      .status,
  ).toBe(401)
  const request = (data: Uint8Array, operation: unknown, documentId?: string, version?: string) =>
    app.request(path, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: form(data, operation, documentId, version),
    })
  const read = await request(bytes, { op: 'read', pageIndex: 0 })
  expect(read.status).toBe(200)
  const snapshot = (await read.json()) as {
    version: number
    blocks: PdfTextBlockSnapshot
    bytesBase64?: string
  }
  expect(snapshot.version).toBe(11)
  expect(snapshot.bytesBase64).toBeUndefined()
  expect(snapshot.blocks.blocks).toHaveLength(1)
  const target = snapshot.blocks.blocks[0]!.target as PdfTextBlockTarget
  expect(target.members).toHaveLength(2)
  expect((await request(bytes, { op: 'read', pageIndex: 0 }, 'missing')).status).toBe(404)
  expect((await request(bytes, { op: 'read', pageIndex: 0 }, id, '-1')).status).toBe(400)
  const operation = { op: 'move', target, dx: 15, dy: 20 }
  expect(
    (await request(bytes, { ...operation, target: { ...target, sha256: '0'.repeat(64) } })).status,
  ).toBe(400)
  expect(
    (
      await request(bytes, {
        ...operation,
        target: { ...target, members: target.members.slice(1) },
      })
    ).status,
  ).toBe(400)
  const moved = await request(bytes, operation)
  expect(moved.status).toBe(200)
  const result = (await moved.json()) as {
    version: number
    bytesBase64: string
    blocks: PdfTextBlockSnapshot
  }
  expect(result.version).toBe(12)
  expect(result.blocks.blocks[0]!.x).toBeCloseTo(snapshot.blocks.blocks[0]!.x + 15, 2)
  expect(result.blocks.blocks[0]!.y).toBeCloseTo(snapshot.blocks.blocks[0]!.y + 20, 2)
  const edited = new Uint8Array(Buffer.from(result.bytesBase64, 'base64'))
  const original = async () =>
    new Uint8Array(
      await (
        await app.request(`/api/documents/${id}/file`, { headers: { Cookie: cookie } })
      ).arrayBuffer(),
    )
  expect(await original()).toEqual(bytes)
  for (const data of [edited, edited, bytes, edited]) {
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
  expect((await request(edited, operation)).status).toBe(400)
  const catalog = await pdfAgentCatalog()
  for (const name of ['list_text_blocks', 'move_text_block']) {
    expect(catalog.clientToolNames.has(name)).toBe(true)
    expect(catalog.tools.some((tool) => tool.name === name)).toBe(true)
  }
  expect(catalog.tools.find((tool) => tool.name === 'move_text_block')!.inputSchema).toMatchObject({
    required: ['page', 'paragraph_text', 'dx', 'dy'],
  })
})
