import type { ChatAttachment } from '@mimir/shared'
import { afterEach, expect, it, vi } from 'vitest'
import { api, configureApiTransport } from './api'
import { createChatIo } from './chat-io'

const attachment: ChatAttachment = {
  id: 'attachment-1',
  conversationId: 'conversation-1',
  name: '资料.txt',
  mime: 'text/plain',
  size: 6,
  sha256: 'a'.repeat(64),
  kind: 'document',
  status: 'ready',
  originalUrl: '/api/conversations/conversation-1/attachments/attachment-1/file',
  createdAt: '2026-10-19T00:00:00.000Z',
  bound: false,
}

afterEach(() => {
  configureApiTransport({ baseUrl: '', headers: {}, fetchImpl: fetch })
})

it('uploads a temporary attachment through the authenticated gateway and retains cancellation', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(attachment))
  configureApiTransport({
    baseUrl: 'https://mimir.example/app',
    headers: { 'X-Host-Token': 'local-test-token' },
    fetchImpl,
  })
  const controller = new AbortController()
  const file = new File(['资料'], attachment.name, { type: 'text/plain' })
  const io = createChatIo({
    invalidate: vi.fn<() => void>(),
    onConversationCreated: vi.fn<(id: string) => void>(),
    onManageModels: vi.fn<() => void>(),
  })

  const result = await io.uploadChatAttachment!(
    'conversation/1',
    file,
    'operation-1',
    controller.signal,
  )

  expect(fetchImpl).toHaveBeenCalledOnce()
  const [url, init] = fetchImpl.mock.calls[0]!
  expect(url).toBe('https://mimir.example/app/api/conversations/conversation%2F1/attachments')
  expect(init).toMatchObject({
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Host-Token': 'local-test-token' },
    signal: controller.signal,
  })
  const body = init?.body as FormData
  expect(body.get('uploadOperationId')).toBe('operation-1')
  expect((body.get('file') as File).name).toBe(attachment.name)
  expect(new Headers(init?.headers).has('Content-Type')).toBe(false)
  expect(result.originalUrl).toBe(`https://mimir.example/app${attachment.originalUrl}`)
  expect(result.sha256).toBe(attachment.sha256)
})

it('uses the same scoped attachment and lease identities for cleanup without importing a document', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
  configureApiTransport({ baseUrl: '/gateway', fetchImpl })

  await api.conversations.leaseAttachment('conversation/1', 'attachment/1', 'queue/1')
  await api.conversations.releaseAttachmentLease('conversation/1', 'attachment/1', 'queue/1')
  await api.conversations.deleteAttachment('conversation/1', 'attachment/1')

  expect(fetchImpl.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
    ['/gateway/api/conversations/conversation%2F1/attachments/attachment%2F1/lease', 'POST'],
    [
      '/gateway/api/conversations/conversation%2F1/attachments/attachment%2F1/lease/queue%2F1',
      'DELETE',
    ],
    ['/gateway/api/conversations/conversation%2F1/attachments/attachment%2F1', 'DELETE'],
  ])
  expect(fetchImpl.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ leaseId: 'queue/1' }))
  expect(fetchImpl.mock.calls.every(([, init]) => init?.credentials === 'include')).toBe(true)
})

it('restores protected original URLs from persisted history and propagates actual preparation failures', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async (url) => {
    if (String(url).endsWith('/attachments')) {
      return Response.json(
        { error: { code: 'ATTACHMENT_LIMIT', message: '附件过大' } },
        { status: 413 },
      )
    }
    return Response.json({
      id: 'conversation-1',
      messages: [
        { id: 'message-1', role: 'user', text: '请概括附件内容', attachments: [attachment] },
      ],
    })
  })
  configureApiTransport({ baseUrl: '/gateway', fetchImpl })
  const detail = await api.conversations.get('conversation-1')
  expect(detail.messages[0]?.attachments?.[0]?.originalUrl).toBe(
    `/gateway${attachment.originalUrl}`,
  )
  await expect(
    api.conversations.uploadAttachment(
      'conversation-1',
      new File(['资料'], attachment.name),
      'operation-1',
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ status: 413, code: 'ATTACHMENT_LIMIT', message: '附件过大' })
})
