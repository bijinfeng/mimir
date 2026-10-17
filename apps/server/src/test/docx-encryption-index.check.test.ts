import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { chunkEmbeddings, chunks, documents } from '../db/schema.js'
import { activeStorage } from '../plugins/host.js'
import { metaKey } from '../lib/uploads.js'
import { bytesIdentity, readUploadSnapshot } from '../lib/document-publication.js'
import { embedDocument } from '../services/chunks.js'
import { reindexVault } from '../services/vault-index.js'
import { replaceUpload, uploadFile } from '../services/upload.js'
import * as model from '../services/model.js'
import { app, getAuthCookie } from './helpers.js'

const encoder = new TextEncoder()
const cipher = new Uint8Array(
  readFileSync(
    new URL(
      '../../../../packages/office/tests/fixtures/docx-encryption/office-agile-password.docx',
      import.meta.url,
    ),
  ),
)
let cookie: string
beforeAll(async () => {
  cookie = await getAuthCookie()
})
afterEach(() => {
  vi.restoreAllMocks()
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
async function row(id: string) {
  return (await db.select().from(documents).where(eq(documents.id, id)))[0]!
}
async function upload(text: string) {
  return (await uploadFile({ filename: 'IndependentE1S.txt', data: encoder.encode(text) })).document
    .id
}

describe('independent encrypted-source publication boundaries', () => {
  it('binds reindex extraction to the exact bytes whose source SHA was captured, including a same-key A to B to A change', async () => {
    const original = encoder.encode('original-index-snapshot')
    const transient = encoder.encode('TransientAmberE1S must never describe the restored original')
    const id = await upload(new TextDecoder().decode(original))
    const before = await row(id)
    const storage = activeStorage()
    const read = storage.read.bind(storage)
    let sourceReads = 0
    vi.spyOn(storage, 'read').mockImplementation(async (key) => {
      if (key === before.sourceKey && ++sourceReads === 2) {
        // A real same-key external editor changes the file between identity capture and extraction,
        // then restores A before the publication CAS. The parser really receives B bytes.
        await storage.write(key, transient)
        const bytes = await read(key)
        await storage.write(key, original)
        return bytes
      }
      return read(key)
    })
    await reindexVault()
    expect(sourceReads).toBeGreaterThan(0)
    expect(await read(before.sourceKey!)).toEqual(Buffer.from(original))
    expect((await row(id)).body).toBe(before.body)
    expect((await db.select().from(chunks).where(eq(chunks.documentId, id)))[0]!.content).toBe(
      before.body,
    )
  })

  it('never publishes temporarily read plaintext for a current encrypted source even when a later chunk sync would scrub it', async () => {
    const saved = await uploadFile({ filename: 'independent-current-cipher.docx', data: cipher })
    const id = saved.document.id
    const before = await row(id)
    const plaintext = new Uint8Array(
      readFileSync(
        new URL(
          '../../../../packages/office/tests/fixtures/docx-encryption/office-agile-plain.docx',
          import.meta.url,
        ),
      ),
    )
    const storage = activeStorage()
    const read = storage.read.bind(storage)
    const observed: string[] = []
    let sourceReads = 0
    vi.spyOn(storage, 'read').mockImplementation(async (key) => {
      if (key === before.sourceKey) {
        sourceReads += 1
        if (sourceReads === 2) {
          await storage.write(key, plaintext)
          const bytes = await read(key)
          await storage.write(key, cipher)
          return bytes
        }
        observed.push((await row(id)).body)
      }
      return read(key)
    })
    await reindexVault()
    expect(sourceReads).toBeGreaterThan(0)
    expect(await read(before.sourceKey!)).toEqual(Buffer.from(cipher))
    expect((await row(id)).body).toBe('')
    expect(observed.every((body) => body === '')).toBe(true)
  })

  it('copies raw metadata before awaiting a source read that recycles the metadata backing buffer', async () => {
    const id = await upload('snapshot-pool-body')
    const before = await row(id)
    const storage = activeStorage()
    const read = storage.read.bind(storage)
    const originalMeta = new Uint8Array(await read(metaKey(id)))
    const borrowedMeta = originalMeta.slice()
    vi.spyOn(storage, 'read').mockImplementation(async (key) => {
      if (key === metaKey(id)) return borrowedMeta
      if (key === before.sourceKey) borrowedMeta.fill(0)
      return read(key)
    })
    const snapshot = await readUploadSnapshot(id)
    expect(borrowedMeta.every((value) => value === 0)).toBe(true)
    expect(snapshot?.identity.meta).toBe(bytesIdentity(originalMeta))
    expect(snapshot?.meta).toEqual(JSON.parse(new TextDecoder().decode(originalMeta)))
    expect(snapshot?.data).toEqual(encoder.encode(before.body))
    expect(snapshot?.identity.source).toBe(bytesIdentity(snapshot!.data))
  })

  it('does not publish delayed vectors when only current chunk content changes and source/body identities still match', async () => {
    const id = await upload('same-source-vector-input')
    const before = await row(id)
    const gate = deferred<number[][]>()
    const entered = deferred<void>()
    vi.spyOn(model, 'modelName').mockResolvedValue('independent-stub')
    vi.spyOn(model, 'callEmbed').mockImplementation(() => {
      entered.resolve()
      return gate.promise
    })
    const pending = embedDocument(id)
    try {
      await entered.promise
      const [chunk] = await db.select().from(chunks).where(eq(chunks.documentId, id))
      await db.update(chunks).set({ content: 'new chunk content' }).where(eq(chunks.id, chunk!.id))
      gate.resolve([[1, 0, 0]])
      expect(await pending).toEqual({ embedded: 0 })
      expect(await row(id)).toEqual(before)
      expect(
        await db.select().from(chunkEmbeddings).where(eq(chunkEmbeddings.chunkId, chunk!.id)),
      ).toEqual([])
    } finally {
      gate.resolve([[1, 0, 0]])
      await pending
    }
  })

  it('releases a failed replacement queue so a later valid cipher replacement can finish', async () => {
    const id = await upload('queue-must-recover')
    const storage = activeStorage()
    const write = storage.write.bind(storage)
    let failed = false
    vi.spyOn(storage, 'write').mockImplementation(async (key, data) => {
      if (!failed && key === metaKey(id)) {
        failed = true
        throw new Error('independent metadata fault')
      }
      return write(key, data)
    })
    const failedSave = replaceUpload(id, { filename: 'failed.docx', data: cipher }).then(
      () => null,
      (error: unknown) => error,
    )
    const nextSave = replaceUpload(id, { filename: 'valid.docx', data: cipher })
    expect(await failedSave).toMatchObject({ message: 'independent metadata fault' })
    await nextSave
    const current = await row(id)
    expect(current.body).toBe('')
    expect(current.parseError).toContain('不进入知识库索引')
    expect(await storage.read(current.sourceKey!)).toEqual(Buffer.from(cipher))
    expect(await db.select().from(chunks).where(eq(chunks.documentId, id))).toEqual([])
  })

  it.each(['%', '_', '\\'])(
    'encrypted title query treats %s as a literal and keeps auth at the real API boundary',
    async (literal) => {
      const saved = await uploadFile({ filename: `Literal${literal}OnlyE1S.docx`, data: cipher })
      const id = saved.document.id
      const query = new URLSearchParams({ q: `Literal${literal}OnlyE1S`, limit: '50' })
      const unauthorized = await app.request(`/api/search?${query}`)
      expect(unauthorized.status).toBe(401)
      const response = await app.request(`/api/search?${query}`, { headers: { Cookie: cookie } })
      expect(response.status).toBe(200)
      const result = (await response.json()) as {
        hits: { documentId: string; snippet: { text: string } }[]
      }
      expect(result.hits.map((hit) => hit.documentId)).toEqual([id])
      expect(result.hits[0]!.snippet.text).toBe('')
    },
  )
})
