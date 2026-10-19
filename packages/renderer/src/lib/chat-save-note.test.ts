import { afterEach, expect, it, vi } from 'vitest'
import { configureApiTransport } from './api'
import { createChatIo } from './chat-io'

afterEach(() => configureApiTransport({ baseUrl: '', headers: {}, fetchImpl: fetch }))

function setup() {
  const fetchImpl = vi.fn<typeof fetch>(async (url) =>
    String(url).endsWith('/messages/note')
      ? Response.json({ noteId: 'note-original', conversationId: 'conversation-1' })
      : Response.json({
          id: 'conversation-1',
          messages: [
            { id: 'user-1', role: 'user', text: '问题' },
            { id: 'original', role: 'assistant', text: '原分支回答', failure: null },
            { id: 'failed', role: 'assistant', text: '失败', failure: 'offline' },
            { id: 'regenerated', role: 'assistant', text: '新分支回答', failure: null },
          ],
        }),
  )
  configureApiTransport({ baseUrl: '', fetchImpl })
  const io = createChatIo({
    invalidate: vi.fn<(keys: unknown[][]) => void>(),
    onConversationCreated: vi.fn<(id: string) => void>(),
    onManageModels: vi.fn<() => void>(),
  })
  return { io, fetchImpl }
}

it('saves the canonical visible branch answer rather than the last persisted answer', async () => {
  const { io, fetchImpl } = setup()
  await expect(io.saveAsNote('conversation-1', 'original')).resolves.toEqual({
    noteId: 'note-original',
  })
  expect(fetchImpl.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ messageId: 'original' }))
})

it.each(['missing', 'user-1', 'failed'])(
  'refuses an unsaveable canonical message %s without saving another answer',
  async (id) => {
    const { io, fetchImpl } = setup()
    await expect(io.saveAsNote('conversation-1', id)).rejects.toThrow('没有可保存的回答')
    expect(fetchImpl).toHaveBeenCalledOnce()
  },
)

it('retains last-answer behavior for legacy callers without a canonical message id', async () => {
  const { io, fetchImpl } = setup()
  await io.saveAsNote('conversation-1')
  expect(fetchImpl.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ messageId: 'regenerated' }))
})
