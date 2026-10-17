import {
  readEncryptionContainer,
  writeEncryptionContainer,
} from '../../../../packages/office/src/docx-encryption-container.js'
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { chunkEmbeddings, chunks, documents } from '../db/schema.js'
import { dbDriver } from '../env.js'
import { activeStorage, assemble, executeRaw } from '../plugins/host.js'
import { contentHash } from '../lib/text.js'
import { bytesIdentity, readUploadSnapshot } from '../lib/document-publication.js'
import { metaKey, readUploadMeta, writeUploadMeta } from '../lib/uploads.js'
import { extractText } from '../services/extract.js'
import { replaceUpload, uploadFile } from '../services/upload.js'
import { rebuildAllChunks, embedDocument, serializeVector, syncChunks } from '../services/chunks.js'
import { reindexVault } from '../services/vault-index.js'
import { searchChunks } from '../search/index.js'
import * as model from '../services/model.js'
import { updateNote, createNote } from '../services/documents.js'
import { app, getAuthCookie } from './helpers.js'

async function ddl(query: ReturnType<typeof sql.raw>): Promise<void> {
  if (dbDriver === 'sqlite') (db as unknown as { run(query: unknown): unknown }).run(query)
  else await executeRaw(query)
}
async function titleQuery(suffix: string) {
  const response = await app.request(`/api/search?q=VisibleTitleE1S&${suffix}`, {
    headers: { Cookie: cookie },
  })
  expect(response.status).toBe(200)
  return response.json() as Promise<{
    hits: { documentId: string; snippet: { text: string; start: number; end: number } }[]
  }>
}
const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(
      new URL(
        `../../../../packages/office/tests/fixtures/docx-encryption/${name}`,
        import.meta.url,
      ),
    ),
  )
const cipher = fixture('office-agile-password.docx')
const plain = fixture('office-agile-plain.docx')
const marker = 'HiddenCobaltE1S'
let cookie: string
beforeAll(async () => {
  cookie = await getAuthCookie()
})
afterEach(() => {
  vi.restoreAllMocks()
})
async function row(id: string) {
  return (await db.select().from(documents).where(eq(documents.id, id)))[0]!
}
async function create() {
  return uploadFile({ filename: 'VisibleTitleE1S.txt', data: new TextEncoder().encode(marker) })
}
async function encrypt(id: string) {
  return replaceUpload(id, { filename: 'locked.docx', data: cipher })
}
async function assertHidden(id: string) {
  expect(await row(id)).toMatchObject({
    body: '',
    excerpt: '',
    contentHash: contentHash(''),
    parseError: expect.stringContaining('不进入知识库索引'),
  })
  expect((await row(id)).searchText).not.toContain(marker)
  for (const { impl } of assemble()
    .seams.leg.implementations()
    .filter(({ impl: leg }) => ['keyword', 'substring'].includes(leg.id))) {
    const hits = await impl.run({ query: marker, limit: 100 })
    expect(hits.some((hit) => hit.id.startsWith(`${id}:`))).toBe(false)
  }
  const ftsRows =
    dbDriver === 'sqlite'
      ? await Promise.all([
          executeRaw(
            sql`select doc_id from documents_fts where documents_fts match ${marker} and doc_id = ${id}`,
          ),
          executeRaw(
            sql`select chunk_id from chunks_fts where chunks_fts match ${marker} and chunk_id like ${id + ':%'}`,
          ),
        ])
      : [[], []]
  expect(ftsRows).toEqual([[], []])

  expect(await db.select().from(chunks).where(eq(chunks.documentId, id))).toEqual([])
  expect(
    (await searchChunks({ q: marker, limit: 100 })).hits.some((h) => h.documentId === id),
  ).toBe(false)
  const response = await app.request(`/api/search?q=VisibleTitleE1S&limit=50`, {
    headers: { Cookie: cookie },
  })
  expect(response.status).toBe(200)
  expect(
    ((await response.json()) as { hits: { documentId: string }[] }).hits.some(
      (h) => h.documentId === id,
    ),
  ).toBe(true)
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// Real CFB/EncryptionInfo/EncryptedPackage; no password or decryption enters the server.
describe('encrypted Office source publication and derived-index isolation', () => {
  it.each(['office-agile-password.docx', 'office-standard-password.docx'])(
    'classifies bounded actual %s and keeps every uploaded byte',
    async (name) => {
      const bytes = fixture(name)
      const form = new FormData()
      form.append('file', new Blob([bytes]), 'VisibleTitleE1S.docx')
      const res = await app.request('/api/documents/files', {
        method: 'POST',
        headers: { Cookie: cookie },
        body: form,
      })
      expect(res.status).toBe(201)
      const saved = (await res.json()) as {
        document: { id: string }
        charCount: number
        parseError: string
      }
      expect(saved.charCount).toBe(0)
      expect(saved.parseError).toContain('不进入知识库索引')
      const download = await app.request(`/api/documents/${saved.document.id}/file`, {
        headers: { Cookie: cookie },
      })
      expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes)
      await assertHidden(saved.document.id)
    },
  )
  it('does not mistake a damaged or unsupported CFB for plaintext or a supported encryption envelope', async () => {
    const damaged = cipher.slice(0, 512)
    const parsed = await extractText(
      'broken.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      damaged,
    )
    expect(parsed.markdown).toBe('')
    expect(parsed.error).toContain('结构')
    // ZIP DOCX goes through the real registered parser as before.
    expect(
      (
        await extractText(
          'plain.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          plain,
        )
      ).markdown,
    ).not.toBe('')
  })
  it.each([
    ['unsupported-info', '当前不支持'],
    ['invalid-package-size', '结构'],
    ['declared-size-budget', '处理预算'],
  ])(
    'rejects the actual %s envelope before any plaintext parser is called',
    async (kind, message) => {
      const container = readEncryptionContainer(cipher)
      if (kind === 'unsupported-info') container.info[0] = 5
      else
        new DataView(
          container.package.buffer,
          container.package.byteOffset,
          container.package.byteLength,
        ).setBigUint64(0, kind === 'declared-size-budget' ? 51n * 1024n * 1024n : 0n, true)
      const malformed = writeEncryptionContainer(container.info, container.package)
      const parser = assemble()
        .seams.parser.implementations()
        .find(({ impl }) => impl.accepts.includes('docx'))!.impl
      const parse = vi.spyOn(parser, 'parse')
      const result = await extractText(
        'locked.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        malformed,
      )
      expect(result.markdown).toBe('')
      expect(result.error).toContain(message)
      expect(parse).not.toHaveBeenCalled()
    },
  )
  it('API replacement atomically clears document/chunk/embedding/FTS plaintext but retains title and ciphertext download', async () => {
    const saved = await create()
    const id = saved.document.id
    const [chunk] = await db.select().from(chunks).where(eq(chunks.documentId, id))
    expect(chunk).toBeDefined()
    await db.insert(chunkEmbeddings).values({
      chunkId: chunk!.id,
      model: 'stub',
      dimension: 3,
      embedding: serializeVector([1, 0, 0]) as never,
    })
    expect(
      (await searchChunks({ q: marker, limit: 100 })).hits.some((h) => h.documentId === id),
    ).toBe(true)
    const form = new FormData()
    form.append('file', new Blob([cipher]), 'locked.docx')
    expect(
      (
        await app.request(`/api/documents/${id}/file`, {
          method: 'PUT',
          headers: { Cookie: cookie },
          body: form,
        })
      ).status,
    ).toBe(200)
    await assertHidden(id)
    expect(
      await db.select().from(chunkEmbeddings).where(eq(chunkEmbeddings.chunkId, chunk!.id)),
    ).toEqual([])
    expect(await activeStorage().read((await row(id)).sourceKey!)).toEqual(Buffer.from(cipher))
    expect(await readUploadMeta(id)).toMatchObject({ sourceKey: (await row(id)).sourceKey })
    await rebuildAllChunks()
    await reindexVault()
    await assertHidden(id)
    // Current cipher backup/restore is the same source/meta identity, not a historical plaintext backup.
    const storage = activeStorage()
    const current = await row(id)
    const rawMeta = await storage.read(metaKey(id))
    const rawSource = await storage.read(current.sourceKey!)
    await db.delete(documents).where(eq(documents.id, id))
    await storage.write(current.sourceKey!, rawSource)
    await storage.write(metaKey(id), rawMeta)
    await reindexVault()
    await assertHidden(id)
  })
  it('saving genuinely unencrypted bytes enables extraction and chunks again', async () => {
    const saved = await create()
    const id = saved.document.id
    await encrypt(id)
    await assertHidden(id)
    await replaceUpload(id, { filename: 'unlocked.docx', data: plain })
    expect((await row(id)).body).not.toBe('')
    expect((await row(id)).parseError).toBeNull()
    expect(
      (await db.select().from(chunks).where(eq(chunks.documentId, id))).length,
    ).toBeGreaterThan(0)
  })
  it.each(['source', 'meta', 'meta-after-write'])(
    '%s write failure keeps the old source/meta/body/chunks',
    async (where) => {
      const saved = await create()
      const id = saved.document.id
      const before = await row(id)
      const meta = await readUploadMeta(id)
      const rawMeta = await activeStorage().read(metaKey(id))
      const storage = activeStorage()
      const write = storage.write.bind(storage)
      let failed = false
      vi.spyOn(storage, 'write').mockImplementation(async (key, data) => {
        if (
          !failed &&
          (where !== 'source'
            ? key === metaKey(id)
            : key.includes(`/uploads/${id}/versions/`) || key.startsWith(`uploads/${id}/versions/`))
        ) {
          failed = true
          if (where === 'meta-after-write') await write(key, data)
          throw new Error('injected storage failure')
        }
        return write(key, data)
      })
      await expect(encrypt(id)).rejects.toThrow('injected storage')
      expect(await row(id)).toEqual(before)
      expect(await readUploadMeta(id)).toEqual(meta)
      expect(await activeStorage().read(metaKey(id))).toEqual(rawMeta)
      expect((await db.select().from(chunks).where(eq(chunks.documentId, id)))[0]?.content).toBe(
        marker,
      )
    },
  )
  it('a database error after updating the source row rolls the row and chunk deletion back together', async () => {
    const saved = await create()
    const id = saved.document.id
    const before = await row(id)
    const meta = await readUploadMeta(id)
    if (dbDriver === 'sqlite')
      await ddl(
        sql.raw(
          `CREATE TRIGGER e1s_reject_delete BEFORE DELETE ON chunks WHEN OLD.document_id = '${id}' BEGIN SELECT RAISE(ABORT, 'e1s injected db failure'); END`,
        ),
      )
    else {
      await ddl(
        sql.raw(
          `CREATE FUNCTION e1s_reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.document_id = '${id}' THEN RAISE EXCEPTION 'e1s injected db failure'; END IF; RETURN OLD; END $$`,
        ),
      )
      await ddl(
        sql.raw(
          'CREATE TRIGGER e1s_reject_delete BEFORE DELETE ON chunks FOR EACH ROW EXECUTE FUNCTION e1s_reject_delete()',
        ),
      )
    }
    try {
      await expect(encrypt(id)).rejects.toThrow(/e1s injected|Failed query/)
    } finally {
      await ddl(
        sql.raw('DROP TRIGGER e1s_reject_delete' + (dbDriver === 'postgres' ? ' ON chunks' : '')),
      )
      if (dbDriver === 'postgres') await ddl(sql.raw('DROP FUNCTION e1s_reject_delete()'))
    }
    expect(await row(id)).toEqual(before)
    expect(await readUploadMeta(id)).toEqual(meta)
    expect(await activeStorage().read(before.sourceKey!)).toEqual(Buffer.from(marker))
    expect((await db.select().from(chunks).where(eq(chunks.documentId, id)))[0]?.content).toBe(
      marker,
    )
  })
  it('a sync paused in settings cannot refill old plaintext after encrypted replacement', async () => {
    const saved = await create()
    const id = saved.document.id
    const gate = deferred<number>()
    const entered = deferred<void>()
    const settings = assemble().settings
    const original = settings.getNumber.bind(settings)
    let waiting = false
    vi.spyOn(settings, 'getNumber').mockImplementation((key) => {
      if (key === 'parser.chunk.size' && !waiting) {
        waiting = true
        entered.resolve()
        return gate.promise
      }
      return original(key)
    })
    const stale = syncChunks(id, marker)
    await entered.promise
    await encrypt(id)
    gate.resolve(500)
    await stale
    await assertHidden(id)
    expect((await row(id)).body).toBe('')
  })
  it('late provider vectors cannot refill deleted chunks or later same-id different-content chunks', async () => {
    const saved = await create()
    const id = saved.document.id
    const gate = deferred<number[][]>()
    const entered = deferred<void>()
    vi.spyOn(model, 'modelName').mockResolvedValue('stub')
    vi.spyOn(model, 'callEmbed').mockImplementation(() => {
      entered.resolve()
      return gate.promise
    })
    const stale = embedDocument(id)
    await entered.promise
    await encrypt(id)
    gate.resolve([[1, 0, 0]])
    expect(await stale).toEqual({ embedded: 0 })
    await assertHidden(id)
    expect(
      await db
        .select()
        .from(chunkEmbeddings)
        .where(eq(chunkEmbeddings.chunkId, `${id}:0`)),
    ).toEqual([])
  })
  it('a reindex paused in old plaintext parsing cannot overwrite a new cipher publication', async () => {
    const saved = await uploadFile({ filename: 'VisibleTitleE1S.docx', data: plain })
    const id = saved.document.id
    const parser = assemble()
      .seams.parser.implementations()
      .find(({ impl }) => impl.accepts.includes('docx'))!.impl
    const parse = parser.parse.bind(parser)
    const entered = deferred<void>()
    const gate = deferred<void>()
    vi.spyOn(parser, 'parse').mockImplementation(async (input) => {
      if (input.type === 'docx') {
        entered.resolve()
        await gate.promise
      }
      return parse(input)
    })
    const stale = reindexVault()
    await entered.promise
    await encrypt(id)
    gate.resolve()
    await stale
    await assertHidden(id)
    expect((await row(id)).sourceKey).toContain('/versions/')
  })
  it('owns the captured source bytes even when storage returns a mutable shared buffer', async () => {
    const saved = await create()
    const id = saved.document.id
    const before = await row(id)
    const storage = activeStorage()
    const read = storage.read.bind(storage)
    const shared = new Uint8Array(await read(before.sourceKey!))
    vi.spyOn(storage, 'read').mockImplementation(async (key) =>
      key === before.sourceKey ? shared : read(key),
    )
    const snapshot = await readUploadSnapshot(id)
    const expected = new TextEncoder().encode(marker)
    shared.fill(0)
    expect(snapshot?.data).toEqual(expected)
    expect(snapshot?.identity.source).toBe(bytesIdentity(expected))
  })
  it('does not retry failed identity reads into a separately parsed source', async () => {
    const saved = await create()
    const id = saved.document.id
    const before = await row(id)
    const storage = activeStorage()
    const read = storage.read.bind(storage)
    let sourceReads = 0
    vi.spyOn(storage, 'read').mockImplementation(async (key) => {
      if (key === before.sourceKey && ++sourceReads === 1) throw new Error('temporary read failure')
      return read(key)
    })
    const parser = assemble()
      .seams.parser.implementations()
      .find(({ impl }) => impl.accepts.includes('text'))!.impl
    const parse = parser.parse.bind(parser)
    let parsedFailedRead = false
    vi.spyOn(parser, 'parse').mockImplementation(async (input) => {
      if (sourceReads === 1) parsedFailedRead = true
      return parse(input)
    })
    await reindexVault()
    expect(parsedFailedRead).toBe(false)
    expect(await row(id)).toEqual(before)
  })
  it('keeps the cipher classification when a chunk rebuild observes a transient plaintext read', async () => {
    const id = (await uploadFile({ filename: 'VisibleTitleE1S.docx', data: cipher })).document.id
    const before = await row(id)
    const storage = activeStorage()
    const read = storage.read.bind(storage)
    let sourceReads = 0
    vi.spyOn(storage, 'read').mockImplementation(async (key) => {
      if (key === before.sourceKey && ++sourceReads === 3) {
        await storage.write(key, plain)
        const transient = await read(key)
        await storage.write(key, cipher)
        return transient
      }
      return read(key)
    })
    await syncChunks(id, '')
    expect(await row(id)).toEqual(before)
    await assertHidden(id)
  })
  it('never drops the cipher marker while updating metadata across a transient plaintext read', async () => {
    const id = (await uploadFile({ filename: 'VisibleTitleE1S.docx', data: cipher })).document.id
    const before = await row(id)
    const storage = activeStorage()
    const read = storage.read.bind(storage)
    let sourceReads = 0
    vi.spyOn(storage, 'read').mockImplementation(async (key) => {
      if (key === before.sourceKey && ++sourceReads === 2) {
        await storage.write(key, plain)
        const transient = await read(key)
        await storage.write(key, cipher)
        return transient
      }
      return read(key)
    })
    await expect(updateNote(id, { title: 'VisibleTitleE1S source-bound' })).rejects.toThrow(
      '原件已变化',
    )
    expect(await row(id)).toEqual(before)
    await assertHidden(id)
  })
  it('two overlapping replacements serialize source generation and leave the later ciphertext authoritative', async () => {
    const saved = await create()
    const id = saved.document.id
    const parser = assemble()
      .seams.parser.implementations()
      .find(({ impl }) => impl.accepts.includes('docx'))!.impl
    const parse = parser.parse.bind(parser)
    const entered = deferred<void>()
    const gate = deferred<void>()
    vi.spyOn(parser, 'parse').mockImplementation(async (input) => {
      if (input.type === 'docx') {
        entered.resolve()
        await gate.promise
      }
      return parse(input)
    })
    const first = replaceUpload(id, { filename: 'plain.docx', data: plain })
    await entered.promise
    const second = encrypt(id)
    gate.resolve()
    await first
    await second
    await assertHidden(id)
    expect(await activeStorage().read((await row(id)).sourceKey!)).toEqual(Buffer.from(cipher))
  })
  it('an in-flight metadata update serializes with encryption and cannot restore its old plaintext body', async () => {
    const saved = await create()
    const id = saved.document.id
    const entered = deferred<void>()
    const gate = deferred<void>()
    const storage = activeStorage()
    const read = storage.read.bind(storage)
    let once = false
    vi.spyOn(storage, 'read').mockImplementation(async (key) => {
      if (key === metaKey(id) && !once) {
        once = true
        entered.resolve()
        await gate.promise
      }
      return read(key)
    })
    const metadata = updateNote(id, { title: 'VisibleTitleE1S renamed', tags: ['retain-tag'] })
    await entered.promise
    const replacement = encrypt(id)
    gate.resolve()
    await metadata
    await replacement
    await assertHidden(id)
    expect(await readUploadMeta(id)).toMatchObject({
      title: 'VisibleTitleE1S renamed',
      tags: ['retain-tag'],
    })
    const patch = await app.request(`/api/documents/${id}`, {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: marker }),
    })
    expect(patch.status).toBe(409)
    expect(await patch.text()).toContain('本地解锁')
    await assertHidden(id)
    await updateNote(id, { title: 'VisibleTitleE1S after cipher', tags: ['cipher-tag'] })
    await assertHidden(id)
    expect(await readUploadMeta(id)).toMatchObject({ tags: ['cipher-tag'] })
  })
  it('normal note and plain-file metadata updates retain current text and healthy chunks', async () => {
    const note = await createNote({ title: 'ordinary note', body: 'ordinary-body', tags: [] })
    await updateNote(note.id, { title: 'renamed note', body: 'updated-note-body' })
    expect((await row(note.id)).body).toBe('updated-note-body')
    const saved = await create()
    const id = saved.document.id
    const old = (await db.select().from(chunks).where(eq(chunks.documentId, id)))[0]!
    await updateNote(id, { title: 'VisibleTitleE1S updated', tags: ['meta-keep'] })
    expect((await row(id)).body).toBe(marker)
    expect((await db.select().from(chunks).where(eq(chunks.documentId, id)))[0]!.createdAt).toEqual(
      old.createdAt,
    )
  })
  it('cipher title results respect kind/tag/limit, contain no snippet, and do not duplicate ordinary body results', async () => {
    const saved = await create()
    const id = saved.document.id
    await encrypt(id)
    await updateNote(id, { tags: ['unique-e1s-tag'] })
    const plainFile = await uploadFile({
      filename: 'VisibleTitleE1S ordinary.txt',
      data: new TextEncoder().encode('plain body stays searchable'),
    })

    const filtered = await titleQuery('kind=file&tag=unique-e1s-tag&limit=50')
    expect(filtered.hits.map((h) => h.documentId)).toEqual([id])
    expect(filtered.hits[0]!.snippet).toEqual({ text: '', start: 0, end: 0 })
    expect((await titleQuery('kind=note&limit=50')).hits.some((h) => h.documentId === id)).toBe(
      false,
    )
    expect((await titleQuery('tag=absent-e1s-tag&limit=50')).hits).toEqual([])
    const combined = await titleQuery('limit=50')
    expect(combined.hits.filter((h) => h.documentId === id)).toHaveLength(1)
    expect(combined.hits.filter((h) => h.documentId === plainFile.document.id)).toHaveLength(1)
    const limited = await titleQuery('limit=1')
    expect(limited.hits).toHaveLength(1)
    expect(limited.hits[0]!.documentId).toBe(combined.hits[0]!.documentId)
    // UI-only title matches never appear as invented Agent/citation chunks.
    expect(
      (await searchChunks({ q: 'VisibleTitleE1S', limit: 100 })).hits.some(
        (h) => h.documentId === id,
      ),
    ).toBe(false)
  })
  it('rebuilding a restored cipher clears pre-existing plaintext DB/FTS/chunks without calling a provider', async () => {
    const saved = await create()
    const id = saved.document.id
    const before = await row(id)
    await activeStorage().write(before.sourceKey!, cipher)
    const embed = vi.spyOn(model, 'callEmbed')
    await rebuildAllChunks()
    await assertHidden(id)
    expect(embed).not.toHaveBeenCalled()
  })
  it('same-id chunk reuse and a same-key externally changed source reject delayed vectors', async () => {
    const saved = await create()
    const id = saved.document.id
    const before = await row(id)
    const gate = deferred<number[][]>()
    const entered = deferred<void>()
    vi.spyOn(model, 'modelName').mockResolvedValue('stub')
    vi.spyOn(model, 'callEmbed').mockImplementation(() => {
      entered.resolve()
      return gate.promise
    })
    const stale = embedDocument(id)
    await entered.promise
    await activeStorage().write(before.sourceKey!, cipher)
    // Even if an old buggy chunk writer reuses the deterministic id, raw source CAS wins.
    await db
      .update(chunks)
      .set({ content: 'later different content' })
      .where(eq(chunks.documentId, id))
    gate.resolve([[1, 0, 0]])
    expect(await stale).toEqual({ embedded: 0 })
    expect(
      await db
        .select()
        .from(chunkEmbeddings)
        .where(eq(chunkEmbeddings.chunkId, `${id}:0`)),
    ).toEqual([])
  })
  it('external same-key source changes invalidate delayed chunk and embedding publication even before reindex', async () => {
    const saved = await create()
    const id = saved.document.id
    const before = await row(id)
    const gate = deferred<number>()
    const entered = deferred<void>()
    const settings = assemble().settings
    const get = settings.getNumber.bind(settings)
    let once = false
    vi.spyOn(settings, 'getNumber').mockImplementation((key) => {
      if (!once && key === 'parser.chunk.size') {
        once = true
        entered.resolve()
        return gate.promise
      }
      return get(key)
    })
    const stale = syncChunks(id, marker)
    await entered.promise
    await activeStorage().write(before.sourceKey!, cipher)
    await writeUploadMeta(id, {
      ...(await readUploadMeta(id))!,
      filename: 'locked.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    await db.delete(chunks).where(eq(chunks.documentId, id))
    gate.resolve(500)
    await stale
    expect(await db.select().from(chunks).where(eq(chunks.documentId, id))).toEqual([])
    await reindexVault()
    await assertHidden(id)
  })
})
