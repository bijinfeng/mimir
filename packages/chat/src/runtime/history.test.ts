import type { Message } from '@mimir/shared'
import { describe, expect, it } from 'vitest'
import {
  createHistoryAdapter,
  historySidecar,
  replayThreadMessage,
  toThreadMessage,
} from './history.js'
import type { ChatIo } from './io.js'
const stored = (overrides: Partial<Message> = {}): Message => ({
  id: 'answer',
  role: 'assistant',
  text: '已保存的正文',
  trace: null,
  citations: [],
  failure: null,
  savedNoteId: null,
  createdAt: '2026-10-19T00:00:00.000Z',
  ...overrides,
})
const ioWith = (messages: Message[] | null): ChatIo => ({
  createConversation: async () => ({ id: 'new' }),
  loadConversation: async () => (messages ? { messages } : null),
  onConversationCreated: () => {},
  onTurnSettled: () => {},
  saveAsNote: async () => ({ noteId: 'note' }),
  onManageModels: () => {},
})
describe('native TanStack history', () => {
  it('keeps user text raw and never fabricates reasoning from legacy trace', () => {
    const message = stored({
      role: 'user',
      text: '**原样文字**',
      trace: { rounds: 2, tools: 3, tookMs: 500, steps: [] },
    })
    expect(toThreadMessage(message)).toEqual({
      id: 'answer',
      role: 'user',
      parts: [{ type: 'text', content: '**原样文字**' }],
    })
    expect(JSON.stringify(historySidecar(message))).not.toContain('trace')
  })
  it('retains citations, classified failures and compact Agent outcomes separately', () => {
    const citations: Message['citations'] = [
      {
        documentId: 'doc',
        kind: 'note',
        title: '来源',
        snippet: '片段',
        start: 0,
        end: 2,
        matchedBy: ['keyword'],
      },
    ]
    const message = stored({ citations, failure: 'offline' })
    expect(historySidecar(message)).toEqual({ citations, failure: { kind: 'offline', detail: '' } })
  })
  it('loads an empty new conversation without a request and rejects missing saved conversations', async () => {
    expect((await createHistoryAdapter(ioWith(null), undefined).load()).messages).toEqual([])
    await expect(createHistoryAdapter(ioWith(null), 'deleted').load()).rejects.toThrow('会话不存在')
  })
  it('round-trips real reasoning, opaque signature, tools and text through SDK reducer', async () => {
    const message = stored({
      protocolEvents: [
        { type: 'REASONING_START' },
        { type: 'REASONING_MESSAGE_START', messageId: 'thinking', role: 'reasoning' },
        { type: 'REASONING_MESSAGE_CONTENT', messageId: 'thinking', delta: '真实推理' },
        { type: 'REASONING_MESSAGE_END', messageId: 'thinking' },
        { type: 'REASONING_END' },
        { type: 'TEXT_MESSAGE_START', messageId: 'assistant', role: 'assistant' },
        {
          type: 'TOOL_CALL_START',
          toolCallId: 'tool',
          toolCallName: 'read_document',
          parentMessageId: 'assistant',
        },
        { type: 'TOOL_CALL_ARGS', toolCallId: 'tool', delta: '{"id":"document"}' },
        { type: 'TOOL_CALL_END', toolCallId: 'tool' },
        {
          type: 'TOOL_CALL_RESULT',
          messageId: 'result',
          toolCallId: 'tool',
          role: 'tool',
          content: '真实结果',
        },
        { type: 'TEXT_MESSAGE_CONTENT', messageId: 'assistant', delta: '最终正文' },
        { type: 'TEXT_MESSAGE_END', messageId: 'assistant' },
      ],
    })
    const result = await replayThreadMessage(message)
    expect(result.id).toBe('answer')
    expect(
      result.parts.some((part) => part.type === 'thinking' && part.content === '真实推理'),
    ).toBe(true)
    expect(
      result.parts.some(
        (part) =>
          part.type === 'tool-call' && part.id === 'tool' && part.arguments === '{"id":"document"}',
      ),
    ).toBe(true)
    expect(result.parts.some((part) => part.type === 'text' && part.content === '最终正文')).toBe(
      true,
    )
  })
})
