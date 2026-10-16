import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  streamMarkdownDocument,
  writeMarkdownDocument,
} from '../services/markdown-agent-writing.js'
const mocks = vi.hoisted(() => ({ stream: vi.fn<() => Promise<AsyncIterable<unknown>>>() }))
vi.mock('../services/documents.js', async (original) => ({
  ...(await original<object>()),
  getDocument: async (id: string) => (id === 'note-1' ? { id, kind: 'note', title: '指南' } : null),
}))
vi.mock('../services/model.js', async (original) => ({
  ...(await original<object>()),
  modelReady: async () => true,
  streamChat: mocks.stream,
}))
const input = { documentId: 'note-1', plan: '撰写指南' }
beforeEach(() => mocks.stream.mockReset())
describe('Markdown writer stream', () => {
  it('yields incremental text and requires the model completion event', async () => {
    mocks.stream.mockResolvedValue(
      (async function* () {
        yield { type: 'TEXT_MESSAGE_CONTENT', delta: '# 指南\n' }
        yield { type: 'TEXT_MESSAGE_CONTENT', delta: '正文' }
        yield { type: 'RUN_FINISHED' }
      })(),
    )
    const stream = streamMarkdownDocument(input)
    expect((await stream.next()).value).toEqual({ type: 'delta', text: '# 指南\n' })
    expect((await stream.next()).value).toEqual({ type: 'delta', text: '正文' })
    expect((await stream.next()).value).toEqual({
      type: 'done',
      markdown: '# 指南\n正文',
      complete: true,
    })
  })
  it.each([false, true])(
    'never marks a truncated or failed generation complete (error=%s)',
    async (failed) => {
      mocks.stream.mockResolvedValue(
        (async function* () {
          yield { type: 'TEXT_MESSAGE_CONTENT', delta: '部分正文' }
          if (failed) yield { type: 'RUN_ERROR', message: '模型断流' }
        })(),
      )
      const stream = streamMarkdownDocument(input)
      expect((await stream.next()).value).toEqual({ type: 'delta', text: '部分正文' })
      await expect(stream.next()).rejects.toThrow(failed ? '模型断流' : '连接中断')
    },
  )
  it('rejects a non-note before model invocation', async () => {
    await expect(writeMarkdownDocument({ ...input, documentId: 'missing' })).rejects.toThrow('笔记')
    expect(mocks.stream).not.toHaveBeenCalled()
  })
  it('rejects cancellation after the last model chunk', async () => {
    const controller = new AbortController()
    mocks.stream.mockResolvedValue(
      (async function* () {
        yield { type: 'TEXT_MESSAGE_CONTENT', delta: '内容' }
        yield { type: 'RUN_FINISHED' }
        controller.abort()
      })(),
    )
    await expect(writeMarkdownDocument({ ...input, signal: controller.signal })).rejects.toThrow(
      '停止',
    )
  })
})
