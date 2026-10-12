import { describe, expect, it, vi } from 'vitest'
import { api, configureApiTransport } from './api'

function response(lines: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const line of lines) controller.enqueue(encoder.encode(line))
        controller.close()
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } },
  )
}

describe('DOCX 写作流 API', () => {
  it('按行边界聚合分段 NDJSON，逐段通知画布', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      response([
        '{"type":"del',
        'ta","text":"第一段"}\n{"type":"delta","text":"第二段"}\n',
        '{"type":"done"}\n',
      ]),
    )
    configureApiTransport({ fetchImpl })
    const deltas: string[] = []
    await api.conversations.writeDocxDocument(
      { documentId: 'd1', instruction: '写一段', context: '现有内容' },
      new AbortController().signal,
      (delta) => deltas.push(delta),
    )
    expect(deltas).toEqual(['第一段', '第二段'])
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/api/conversations/docx-agent/write-document'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
  })

  it('缺少 done 时拒绝完成，草稿由界面决定保留或丢弃', async () => {
    configureApiTransport({
      fetchImpl: vi.fn<typeof fetch>(async () => response(['{"type":"delta","text":"半截"}\n'])),
    })
    await expect(
      api.conversations.writeDocxDocument(
        { documentId: 'd1', instruction: '写一段', context: '' },
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow('意外中断')
  })
})
