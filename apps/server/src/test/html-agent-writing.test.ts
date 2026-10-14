import { beforeEach, describe, expect, it, vi } from 'vitest'
import { planHtmlPage, writeHtmlDocument } from '../services/html-agent-writing.js'

const mocks = vi.hoisted(() => ({
  call: vi.fn<() => Promise<string>>(),
  stream: vi.fn<() => Promise<AsyncIterable<unknown>>>(),
}))

vi.mock('../services/documents.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDocument: async (id: string) =>
    id === 'html-1' ? { id, kind: 'file', mime: 'text/html', fileExtension: 'html' } : null,
}))
vi.mock('../services/model.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  modelReady: async () => true,
  callChat: mocks.call,
  streamChat: mocks.stream,
}))

async function* chunks(text: string) {
  yield { type: 'TEXT_MESSAGE_CONTENT', delta: text }
}

describe('HTML page writer service', () => {
  beforeEach(() => {
    mocks.call.mockReset()
    mocks.stream.mockReset()
  })

  it('validates a model brief before returning it for human confirmation', async () => {
    mocks.call.mockResolvedValue(
      '```json\n{"title":"Guide","tone":"calm","audience":"readers","sections":[{"title":"Intro","purpose":"explain"}]}\n```',
    )
    expect(
      await planHtmlPage({ documentId: 'html-1', mode: 'new', instruction: 'Make a guide' }),
    ).toMatchObject({ title: 'Guide', sections: [{ title: 'Intro' }] })
    mocks.call.mockResolvedValue('{"title":"Guide","sections":[]}')
    await expect(
      planHtmlPage({ documentId: 'html-1', mode: 'new', instruction: 'Make a guide' }),
    ).rejects.toThrow('字段无效')
  })

  it('returns only a complete generated HTML page', async () => {
    const full =
      '<!doctype html><html><head><title>Guide</title></head><body>Complete</body></html>'
    mocks.stream.mockResolvedValue(chunks(`Here is your page:\n${full}\nDone`))
    expect(
      await writeHtmlDocument({
        documentId: 'html-1',
        kind: 'content',
        instruction: 'Guide',
        plan: 'Guide',
      }),
    ).toEqual({ html: full, complete: true })
    mocks.stream.mockResolvedValue(chunks('<html><body>Incomplete'))
    await expect(
      writeHtmlDocument({
        documentId: 'html-1',
        kind: 'content',
        instruction: 'Guide',
        plan: 'Guide',
      }),
    ).rejects.toThrow('未完成')
  })

  it('rejects non-HTML documents and missing content plans before model use', async () => {
    await expect(
      writeHtmlDocument({
        documentId: 'missing',
        kind: 'content',
        instruction: 'Guide',
        plan: 'Guide',
      }),
    ).rejects.toThrow('HTML 原件')
    await expect(
      writeHtmlDocument({ documentId: 'html-1', kind: 'content', instruction: 'Guide' }),
    ).rejects.toThrow('写作计划')
    expect(mocks.stream).not.toHaveBeenCalled()
  })
})
