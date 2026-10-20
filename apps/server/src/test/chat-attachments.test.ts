import { Worker } from 'node:worker_threads'
import { once } from 'node:events'
import { createCanvas } from '@napi-rs/canvas'
import type { ChatAttachment } from '@mimir/shared'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, sql, getTableColumns } from 'drizzle-orm'
import JSZip from 'jszip'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { PNG } from 'pngjs'
import { app, getAuthCookie } from './helpers.js'
import { db } from '../db/client.js'
import {
  conversationAttachments,
  documents,
  chunks,
  attachmentLeases,
  attachmentGarbage,
} from '../db/schema.js'
import { activeStorage } from '../plugins/host.js'
import {
  createConversation,
  appendMessage,
  getConversation,
  deleteConversation,
  saveMessageAsNote,
} from '../services/conversations.js'
import {
  prepareChatAttachmentContext,
  bindChatAttachments,
  collectChatAttachments,
  recoverChatAttachments,
  leaseChatAttachment,
  releaseChatAttachmentLease,
  deleteChatAttachment,
  readChatAttachment,
  drainAttachmentGarbage,
} from '../services/chat-attachments.js'
import {
  prepareAttachmentBytes,
  runPreparationWorker,
} from '../services/chat-attachment-prepare.js'

let cookie = '',
  ownerId = ''
beforeAll(async () => {
  cookie = await getAuthCookie()
  const session = await app.request('/api/auth/get-session', { headers: { Cookie: cookie } })
  ownerId = ((await session.json()) as { user: { id: string } }).user.id
})
async function upload(
  conversationId: string,
  name: string,
  data: Uint8Array | string,
  mime = 'application/octet-stream',
  operationId = crypto.randomUUID(),
) {
  const form = new FormData()
  form.append(
    'file',
    new File([typeof data === 'string' ? data : Buffer.from(data)], name, { type: mime }),
  )
  form.append('uploadOperationId', operationId)
  const response = await app.request(`/api/conversations/${conversationId}/attachments`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: form,
  })
  return { response, body: (await response.json()) as ChatAttachment }
}
async function count(table: typeof documents | typeof chunks) {
  return Number((await db.select({ n: sql<number>`count(*)` }).from(table))[0]!.n)
}
async function ready() {
  const conversation = await createConversation()
  const { body } = await upload(conversation.id, '资料.txt', '会话临时资料：预算是 100 元。')
  expect(body.status).toBe('ready')
  return { conversation, attachment: body, refs: [{ id: body.id, sha256: body.sha256 }] }
}
describe('conversation attachment HTTP and lifecycle', () => {
  it('requires auth, exact conversation and owner; no KB side effects; idempotency and protected original', async () => {
    const conversation = await createConversation(),
      before = [await count(documents), await count(chunks)]
    expect((await app.request(`/api/conversations/${conversation.id}/attachments/x`)).status).toBe(
      401,
    )
    const operation = crypto.randomUUID(),
      first = await upload(conversation.id, 'notes.txt', 'hello chat', 'text/plain', operation)
    expect(first.response.status).toBe(200)
    expect(first.body.status).toBe('ready')
    const second = await upload(conversation.id, 'notes.txt', 'hello chat', 'text/plain', operation)
    expect(second.body.id).toBe(first.body.id)
    expect(
      (await upload(conversation.id, 'notes.txt', 'different', 'text/plain', operation)).response
        .status,
    ).toBe(409)
    const other = await createConversation()
    expect(
      (
        await app.request(`/api/conversations/${other.id}/attachments/${first.body.id}/file`, {
          headers: { Cookie: cookie },
        })
      ).status,
    ).toBe(404)
    const original = await app.request(first.body.originalUrl, { headers: { Cookie: cookie } })
    expect(await original.text()).toBe('hello chat')
    expect(original.headers.get('x-content-type-options')).toBe('nosniff')
    await expect(
      readChatAttachment(conversation.id, first.body.id, 'foreign-owner'),
    ).rejects.toThrow('不属于')
    expect([await count(documents), await count(chunks)]).toEqual(before)
    await deleteConversation(conversation.id)
    await deleteConversation(other.id)
  })
  it('exposes protected lease/release and draft removal endpoints with canonical identifiers', async () => {
    const { conversation, attachment } = await ready()
    const path = `/api/conversations/${conversation.id}/attachments/${attachment.id}`
    const leased = await app.request(path + '/lease', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ leaseId: 'http-queue' }),
    })
    expect(leased.status).toBe(204)
    expect(
      (await app.request(path, { method: 'DELETE', headers: { Cookie: cookie } })).status,
    ).toBe(409)
    expect(
      (
        await app.request(path + '/lease/http-queue', {
          method: 'DELETE',
          headers: { Cookie: cookie },
        })
      ).status,
    ).toBe(204)
    expect(
      (await app.request(path, { method: 'DELETE', headers: { Cookie: cookie } })).status,
    ).toBe(204)
    expect((await app.request(path, { headers: { Cookie: cookie } })).status).toBe(404)
    await deleteConversation(conversation.id)
  })
  // Each real worker-backed rejection has a bounded 15s budget for parser startup,
  // its actual response and cleanup under the full workspace test load.
  it.each([
    ['empty.txt', '', 'text/plain'],
    ['bad.txt', new Uint8Array([0xc0, 0xff]), 'text/plain'],
    ['fake.png', 'not png', 'image/png'],
    ['binary.txt', 'a\u0000b', 'text/plain'],
    ['archive.zip', 'fake', 'application/zip'],
    ['long.txt', 'a'.repeat(12_001), 'text/plain'],
    ['lie.txt', 'abc', 'image/png'],
    ['fake.docx', 'not a zip', 'application/octet-stream'],
  ] as const)(
    'rejects invalid attachment %s without truncating',
    async (name, data, mime) => {
      const conversation = await createConversation()
      const { response, body } = await upload(conversation.id, name, data, mime)
      expect(response.status).toBe(name === 'empty.txt' ? 413 : 200)
      expect(body.status).toBe(name === 'empty.txt' ? undefined : 'failed')
      await deleteConversation(conversation.id)
    },
    15_000,
  )
  it('parses actual Office/PDF text and fails scan or malformed container', async () => {
    const conversation = await createConversation()
    const docx = new JSZip()
    docx.file(
      'word/document.xml',
      '<w:document><w:body><w:p><w:r><w:t>Word attachment</w:t></w:r></w:p></w:body></w:document>',
    )
    const xlsx = new JSZip()
    xlsx.file(
      'xl/workbook.xml',
      '<workbook><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    )
    xlsx.file(
      'xl/worksheets/sheet1.xml',
      '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Excel attachment</t></is></c></row></sheetData></worksheet>',
    )
    const pptx = new JSZip()
    pptx.file(
      'ppt/slides/slide1.xml',
      '<p:sld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Slide attachment</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:sld>',
    )
    const pdf = await PDFDocument.create()
    const page = pdf.addPage()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    page.drawText('PDF attachment', { font })
    for (const [name, data] of [
      ['a.docx', await docx.generateAsync({ type: 'uint8array' })],
      ['a.xlsx', await xlsx.generateAsync({ type: 'uint8array' })],
      ['a.pptx', await pptx.generateAsync({ type: 'uint8array' })],
      ['a.pdf', await pdf.save()],
    ] as const) {
      const { body } = await upload(conversation.id, name, data)
      expect(body.status, `${name}: ${body.error}`).toBe('ready')
    }
    const scan = await PDFDocument.create()
    scan.addPage()
    expect((await upload(conversation.id, 'scan.pdf', await scan.save())).body.status).toBe(
      'failed',
    )
    const wrong = new JSZip()
    wrong.file('wrong.xml', 'hello')
    expect(
      (
        await upload(
          conversation.id,
          'wrong.docx',
          await wrong.generateAsync({ type: 'uint8array' }),
        )
      ).body.status,
    ).toBe('failed')
    await deleteConversation(conversation.id)
  }, 30_000)
  // Five real worker-backed preparations plus ZIP compression need the same
  // bounded budget as the adjacent Office/PDF validation matrix.
  it('accepts common code MIME only after strict text validation and rejects inflated Office XML', async () => {
    const conversation = await createConversation()
    expect(
      (await upload(conversation.id, 'example.js', 'const value = 1', 'text/javascript')).body
        .status,
    ).toBe('ready')
    const source = await upload(
      conversation.id,
      'example.ts',
      'const value: number = 1',
      'video/mp2t',
    )
    expect(source.body.status).toBe('ready')
    expect(source.body.mime).toBe('text/plain')
    const transportStream = new Uint8Array(188)
    transportStream[0] = 0x47
    expect(
      (await upload(conversation.id, 'video.ts', transportStream, 'video/mp2t')).body.status,
    ).toBe('failed')
    expect(
      (await upload(conversation.id, 'forged.js', 'const value = 1', 'video/mp2t')).body.status,
    ).toBe('failed')
    const bomb = new JSZip()
    bomb.file('word/document.xml', '<w:document>' + 'a'.repeat(17 * 1024 * 1024) + '</w:document>')
    const { body } = await upload(
      conversation.id,
      'inflate.docx',
      await bomb.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }),
    )
    expect(body.status).toBe('failed')
    expect(body.error).toContain('过大')
    await deleteConversation(conversation.id)
  }, 30_000)
  it('checks image dimensions and actual PNG decoding before trusted use', async () => {
    const conversation = await createConversation(),
      png = PNG.sync.write(new PNG({ width: 2, height: 2 }))
    const { body } = await upload(conversation.id, 'a.png', png, 'image/png')
    expect(body.status).toBe('ready')
    expect(body.kind).toBe('image')
    const huge = Buffer.from(png)
    huge.writeUInt32BE(5000, 16)
    expect((await upload(conversation.id, 'huge.png', huge, 'image/png')).body.status).toBe(
      'failed',
    )
    const context = await prepareChatAttachmentContext({
      conversationId: conversation.id,
      refs: [{ id: body.id, sha256: body.sha256 }],
    })
    expect(Buffer.from(context.images[0]!.data).equals(png)).toBe(true)
    await context.release()
    await deleteConversation(conversation.id)
  })
  it('fully decodes static WebP, rejects damaged payload and animation', async () => {
    const conversation = await createConversation()
    const bytes = await createCanvas(3, 2).encode('webp')
    const good = await upload(conversation.id, 'photo.webp', bytes, 'image/webp')
    expect(good.body.status).toBe('ready')
    const corrupt = Buffer.from(bytes)
    corrupt.fill(255, 24)
    expect((await upload(conversation.id, 'broken.webp', corrupt, 'image/webp')).body.status).toBe(
      'failed',
    )
    const animation = Buffer.alloc(30)
    animation.write('RIFF')
    animation.writeUInt32LE(22, 4)
    animation.write('WEBPVP8X', 8)
    animation.writeUInt32LE(10, 16)
    animation[20] = 2
    expect(
      (await upload(conversation.id, 'animation.webp', animation, 'image/webp')).body.status,
    ).toBe('failed')
    await deleteConversation(conversation.id)
  })
  it('enforces per-round and conversation budgets without deleting prior resources', async () => {
    const conversation = await createConversation()
    const first = await upload(conversation.id, 'one.txt', 'a'.repeat(12000))
    const second = await upload(conversation.id, 'two.txt', 'b'.repeat(12000))
    const third = await upload(conversation.id, 'three.txt', 'c')
    const refs = [first, second, third].map((result) => ({
      id: result.body.id,
      sha256: result.body.sha256,
    }))
    await expect(
      prepareChatAttachmentContext({ conversationId: conversation.id, refs }),
    ).rejects.toThrow('24000')
    await expect(
      prepareChatAttachmentContext({
        conversationId: conversation.id,
        refs: Array(5).fill(refs[0]),
      }),
    ).rejects.toThrow('4')
    await db
      .update(conversationAttachments)
      .set({ size: 200 * 1024 * 1024 })
      .where(eq(conversationAttachments.id, first.body.id))
    expect((await upload(conversation.id, 'quota.txt', 'new')).response.status).toBe(413)
    expect(
      (
        await db
          .select()
          .from(conversationAttachments)
          .where(eq(conversationAttachments.conversationId, conversation.id))
      ).length,
    ).toBe(3)
    await deleteConversation(conversation.id)
  })
  it('bounded multipart reader rejects oversized actual request bytes', async () => {
    const conversation = await createConversation()
    const response = await app.request(`/api/conversations/${conversation.id}/attachments`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'multipart/form-data; boundary=x' },
      body: new Uint8Array(11 * 1024 * 1024 + 1),
    })
    expect(response.status).toBe(413)
    expect(
      (
        await db
          .select()
          .from(conversationAttachments)
          .where(eq(conversationAttachments.conversationId, conversation.id))
      ).length,
    ).toBe(0)
    await deleteConversation(conversation.id)
  })
  it('persists actual ordered protocol events through history without synthesizing content', async () => {
    const conversation = await createConversation()
    const protocolEvents = [
      { type: 'REASONING_MESSAGE_START', messageId: 'r' },
      { type: 'REASONING_MESSAGE_CONTENT', messageId: 'r', delta: 'true reasoning' },
      { type: 'REASONING_MESSAGE_END', messageId: 'r' },
    ]
    await appendMessage({
      conversationId: conversation.id,
      role: 'assistant',
      text: 'answer',
      protocolEvents,
    })
    expect((await getConversation(conversation.id))?.messages[0]?.protocolEvents).toEqual(
      protocolEvents,
    )
    await deleteConversation(conversation.id)
  })
  it('terminates a worker already executing an infinite CPU loop and leaves parent responsive', async () => {
    const worker = new Worker(
      `const {parentPort}=require('node:worker_threads');parentPort.postMessage('started');while(true){Math.sqrt(12345)}`,
      { eval: true },
    )
    await once(worker, 'message')
    const running = runPreparationWorker(worker, undefined, 20)
    await new Promise<void>((resolve) => setImmediate(resolve))
    await expect(running).rejects.toThrow('超过')
    expect(worker.threadId).toBe(-1)
  })
  it('rejects and terminates an actual worker that exceeds the preparation heap budget', async () => {
    const worker = new Worker(
      `const held=[];while(true){held.push(new Array(10000).fill('retain'))}`,
      {
        eval: true,
        resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 16 },
      },
    )
    await expect(runPreparationWorker(worker)).rejects.toThrow(/memory limit.*heap out of memory/)
    expect(worker.threadId).toBe(-1)
  })
  it('binds canonical refs, retains failed answer attachments and rebuilds context from server bytes', async () => {
    const { conversation, attachment, refs } = await ready()
    await expect(
      prepareChatAttachmentContext({
        conversationId: conversation.id,
        refs: [{ ...refs[0]!, sha256: 'a'.repeat(64) }],
      }),
    ).rejects.toThrow('快照')
    const context = await prepareChatAttachmentContext({ conversationId: conversation.id, refs })
    expect(context.documents[0]?.text).toContain('100 元')
    const message = await appendMessage({
      conversationId: conversation.id,
      role: 'user',
      text: '概括附件',
    })
    await bindChatAttachments(conversation.id, message.id, refs)
    await context.release()
    await appendMessage({
      conversationId: conversation.id,
      role: 'assistant',
      text: '',
      failure: 'offline',
    })
    await deleteChatAttachment(conversation.id, attachment.id, ownerId)
    await collectChatAttachments(new Date(Date.now() + 2 * 86400_000))
    expect((await getConversation(conversation.id))?.messages[0]?.attachments?.[0]?.bound).toBe(
      true,
    )
    const followup = await prepareChatAttachmentContext({ conversationId: conversation.id })
    expect(followup.documents[0]?.text).toContain('100 元')
    await followup.release()
    const keys = await activeStorage().list(`chat-attachments/${conversation.id}/`)
    await deleteConversation(conversation.id)
    for (const key of keys) await expect(activeStorage().read(key)).rejects.toThrow(/ENOENT|不存在/)
  })
  it('leases protect queue, expired drafts reclaim, restart processing becomes retryable failure', async () => {
    const { conversation, attachment } = await ready()
    await leaseChatAttachment(conversation.id, attachment.id, 'queue')
    await db
      .update(conversationAttachments)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(conversationAttachments.id, attachment.id))
    await collectChatAttachments()
    expect(
      (
        await db
          .select()
          .from(conversationAttachments)
          .where(eq(conversationAttachments.id, attachment.id))
      ).length,
    ).toBe(1)
    await releaseChatAttachmentLease(attachment.id, 'queue')
    await collectChatAttachments()
    expect(
      (
        await db
          .select()
          .from(conversationAttachments)
          .where(eq(conversationAttachments.id, attachment.id))
      ).length,
    ).toBe(0)
    const pending = await upload(conversation.id, 'restart.txt', 'retry me')
    await db
      .update(conversationAttachments)
      .set({ status: 'processing' })
      .where(eq(conversationAttachments.id, pending.body.id))
    await recoverChatAttachments()
    const [row] = await db
      .select()
      .from(conversationAttachments)
      .where(eq(conversationAttachments.id, pending.body.id))
    expect(row?.status).toBe('failed')
    expect(row?.error).toContain('重启')
    expect(await db.select().from(attachmentLeases)).toEqual([])
    await deleteConversation(conversation.id)
    expect(await db.select().from(attachmentGarbage)).toEqual([])
  })
  it('saving answer adds a session-dependent attachment notice without importing originals', async () => {
    const { conversation, refs } = await ready()
    const user = await appendMessage({
      conversationId: conversation.id,
      role: 'user',
      text: 'summarize',
    })
    await bindChatAttachments(conversation.id, user.id, refs)
    const answer = await appendMessage({
      conversationId: conversation.id,
      role: 'assistant',
      text: '预算为100元',
      usedAttachmentRefs: refs,
    })
    const before = await count(documents)
    const saved = await saveMessageAsNote(answer.id)
    const [note] = await db.select().from(documents).where(eq(documents.id, saved!.noteId))
    expect(note?.body).toContain('本笔记未导入附件原件')
    expect(note?.body).toContain('资料.txt')
    expect(await count(documents)).toBe(before + 1)
    expect(note?.kind).toBe('note')
    await deleteConversation(conversation.id)
  })
  it('saving a branched answer does not infer unused or legacy attachment sources', async () => {
    const { conversation, refs } = await ready()
    const original = await appendMessage({
      conversationId: conversation.id,
      role: 'user',
      text: 'original',
    })
    await bindChatAttachments(conversation.id, original.id, refs)
    const legacy = await appendMessage({
      conversationId: conversation.id,
      role: 'assistant',
      text: '旧记录没有精确来源',
    })
    const context = await prepareChatAttachmentContext({
      conversationId: conversation.id,
      historyMessageIds: [],
    })
    expect(context.attachments).toEqual([])
    const branched = await appendMessage({
      conversationId: conversation.id,
      role: 'assistant',
      text: '新分支未使用附件',
      usedAttachmentRefs: context.attachments,
    })
    await context.release()
    for (const answer of [legacy, branched]) {
      const saved = await saveMessageAsNote(answer.id)
      const [note] = await db.select().from(documents).where(eq(documents.id, saved!.noteId))
      expect(note?.body).not.toContain('会话附件')
      expect(note?.body).not.toContain('资料.txt')
    }
    await deleteConversation(conversation.id)
  })
  it('collector rechecks expiry after a candidate is renewed even if its queue lease was released', async () => {
    const { conversation, attachment } = await ready()
    const at = new Date(Date.now() + 2000)
    await db
      .update(conversationAttachments)
      .set({ expiresAt: new Date(at.getTime() - 1000) })
      .where(eq(conversationAttachments.id, attachment.id))
    // Pause the actual candidate query at its result boundary, then complete a queue
    // renewal/release before GC consumes the stale rows. No scheduling sleeps involved.
    const selection = db.select(getTableColumns(conversationAttachments))
    const candidates = selection.from(conversationAttachments)
    const execute = candidates.execute.bind(candidates)
    vi.spyOn(candidates, 'execute').mockImplementationOnce(async () => {
      const rows = await execute()
      await leaseChatAttachment(conversation.id, attachment.id, 'racing-queue')
      await releaseChatAttachmentLease(attachment.id, 'racing-queue')
      return rows
    })
    vi.spyOn(selection, 'from').mockReturnValueOnce(candidates as ReturnType<typeof selection.from>)
    const selectSpy = vi.spyOn(db, 'select').mockReturnValueOnce(selection)
    try {
      await collectChatAttachments(at)
    } finally {
      selectSpy.mockRestore()
    }
    expect(
      (await readChatAttachment(conversation.id, attachment.id, ownerId)).attachment.status,
    ).toBe('ready')
    await deleteConversation(conversation.id)
  })
  it('limits followup attachment context to selected persisted message prefix', async () => {
    const { conversation, refs } = await ready()
    const first = await appendMessage({
      conversationId: conversation.id,
      role: 'user',
      text: 'first',
    })
    await bindChatAttachments(conversation.id, first.id, refs)
    const secondUpload = await upload(conversation.id, 'tail.txt', 'abandoned tail')
    const second = await appendMessage({
      conversationId: conversation.id,
      role: 'user',
      text: 'tail',
    })
    await bindChatAttachments(conversation.id, second.id, [
      { id: secondUpload.body.id, sha256: secondUpload.body.sha256 },
    ])
    const prefix = await prepareChatAttachmentContext({
      conversationId: conversation.id,
      historyMessageIds: [first.id],
    })
    expect(prefix.documents.map((item) => item.text)).toEqual(['会话临时资料：预算是 100 元。'])
    await prefix.release()
    const empty = await prepareChatAttachmentContext({
      conversationId: conversation.id,
      historyMessageIds: [],
    })
    expect(empty.attachments).toEqual([])
    await empty.release()
    await deleteConversation(conversation.id)
  })
  it('remove cancels a live preparation and a late upload result cannot recreate it', async () => {
    const conversation = await createConversation()
    const pending = upload(conversation.id, 'cancel.txt', 'pending preparation')
    let attachmentId = ''
    await vi.waitFor(async () => {
      const [row] = await db
        .select()
        .from(conversationAttachments)
        .where(eq(conversationAttachments.conversationId, conversation.id))
      expect(row?.status).toBe('processing')
      attachmentId = row!.id
    })
    await deleteChatAttachment(conversation.id, attachmentId, ownerId)
    const result = await pending
    expect(result.response.status).toBe(404)
    expect(
      (
        await db
          .select()
          .from(conversationAttachments)
          .where(eq(conversationAttachments.conversationId, conversation.id))
      ).length,
    ).toBe(0)
    expect(await activeStorage().list(`chat-attachments/${conversation.id}/`)).toEqual([])
    await deleteConversation(conversation.id)
  })
  it('conversation deletion revokes reads while storage failures retain retryable cleanup records', async () => {
    const { conversation, attachment } = await ready()
    const storage = activeStorage(),
      remove = vi
        .spyOn(storage, 'remove')
        .mockRejectedValueOnce(new Error('temporary storage failure'))
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await deleteConversation(conversation.id)
    expect((await db.select().from(attachmentGarbage)).length).toBe(1)
    await expect(readChatAttachment(conversation.id, attachment.id, ownerId)).rejects.toThrow(
      '会话不存在',
    )
    remove.mockRestore()
    await drainAttachmentGarbage()
    expect(await db.select().from(attachmentGarbage)).toEqual([])
    expect(await storage.list(`chat-attachments/${conversation.id}/`)).toEqual([])
    warning.mockRestore()
  })
  it('reclaims only aged unregistered objects after crash between original write and DB insert', async () => {
    const storage = activeStorage(),
      old = 'chat-attachments/orphan/1000_missing/original',
      young = `chat-attachments/orphan/${Date.now()}_new/original`
    await storage.write(old, 'old')
    await storage.write(young, 'young')
    await collectChatAttachments()
    await expect(storage.read(old)).rejects.toThrow(/ENOENT|不存在/)
    expect(Buffer.from(await storage.read(young)).toString()).toBe('young')
    await storage.remove(young)
  })
  it('missing/tampered originals explicitly fail instead of trusting cached text', async () => {
    const { conversation, attachment, refs } = await ready()
    const [row] = await db
      .select()
      .from(conversationAttachments)
      .where(eq(conversationAttachments.id, attachment.id))
    await activeStorage().write(row!.objectKey, 'tampered')
    await expect(
      prepareChatAttachmentContext({ conversationId: conversation.id, refs }),
    ).rejects.toThrow('缺失或已更改')
    expect(await db.select().from(attachmentLeases)).toEqual([])
    await deleteConversation(conversation.id)
  })
  it('terminates actual worker on timeout/abort and subsequent preparations still work', async () => {
    await expect(
      prepareAttachmentBytes('a.txt', 'text/plain', new TextEncoder().encode('text'), undefined, 1),
    ).rejects.toThrow('超过')
    const controller = new AbortController()
    const pending = prepareAttachmentBytes(
      'a.txt',
      'text/plain',
      new TextEncoder().encode('text'),
      controller.signal,
    )
    controller.abort()
    await expect(pending).rejects.toThrow('取消')
    expect(
      (await prepareAttachmentBytes('a.txt', 'text/plain', new TextEncoder().encode('text'))).text,
    ).toBe('text')
  })
})
