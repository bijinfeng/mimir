import { Hono } from 'hono'
import { z } from 'zod'
import { CHAT_ATTACHMENT_LIMITS as L } from '@mimir/shared'
import { readUploadForm } from '../lib/multipart.js'
import { HttpError, parseInput } from '../lib/http.js'
import {
  uploadChatAttachment,
  getChatAttachment,
  readChatAttachment,
  deleteChatAttachment,
  leaseChatAttachment,
  releaseChatAttachmentLease,
} from '../services/chat-attachments.js'
import type { AppEnv } from '../types.js'

export const chatAttachmentsRoute = new Hono<AppEnv>()
chatAttachmentsRoute.post('/:id/attachments', async (c) => {
  const form = await readUploadForm(c.req.raw, L.documentBytes + 1024 * 1024)
  const files = form.getAll('file'),
    file = files[0],
    operationId = form.get('uploadOperationId')
  if (files.length !== 1 || !(file instanceof File) || typeof operationId !== 'string')
    throw new HttpError(400, 'INVALID_ATTACHMENT', '请选择一个文件并提供上传操作 ID')
  const item = await uploadChatAttachment({
    conversationId: c.req.param('id'),
    ownerId: c.get('user').id,
    operationId,
    name: file.name,
    mime: file.type,
    data: new Uint8Array(await file.arrayBuffer()),
    signal: c.req.raw.signal,
  })
  return c.json(item)
})
chatAttachmentsRoute.get('/:id/attachments/:attachmentId', async (c) =>
  c.json(await getChatAttachment(c.req.param('id'), c.req.param('attachmentId'), c.get('user').id)),
)
chatAttachmentsRoute.get('/:id/attachments/:attachmentId/file', async (c) => {
  const { attachment, data } = await readChatAttachment(
    c.req.param('id'),
    c.req.param('attachmentId'),
    c.get('user').id,
  )
  return new Response(Buffer.from(data), {
    headers: {
      'Content-Type': attachment.mime,
      'Content-Length': String(data.length),
      'Content-Disposition': `${attachment.kind === 'image' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  })
})
chatAttachmentsRoute.delete('/:id/attachments/:attachmentId', async (c) => {
  await deleteChatAttachment(c.req.param('id'), c.req.param('attachmentId'), c.get('user').id)
  return c.body(null, 204)
})
chatAttachmentsRoute.post('/:id/attachments/:attachmentId/lease', async (c) => {
  const input = await parseInput(
    c,
    'json',
    z.object({
      leaseId: z.string().min(1).max(150),
      durationMs: z.number().positive().max(L.leaseMs).optional(),
    }),
  )
  await leaseChatAttachment(
    c.req.param('id'),
    c.req.param('attachmentId'),
    input.leaseId,
    input.durationMs,
    c.get('user').id,
  )
  return c.body(null, 204)
})
chatAttachmentsRoute.delete('/:id/attachments/:attachmentId/lease/:leaseId', async (c) => {
  await getChatAttachment(c.req.param('id'), c.req.param('attachmentId'), c.get('user').id)
  await releaseChatAttachmentLease(c.req.param('attachmentId'), c.req.param('leaseId'))
  return c.body(null, 204)
})
