import { beforeEach, describe, expect, it, vi } from 'vitest'
import { analyzeDocxMedia } from '../services/docx-media-analysis.js'

const state = vi.hoisted(() => ({
  vision: true,
  chat: vi.fn<(options: { messages: Array<{ content: unknown }> }) => Promise<string>>(),
  transcription: vi.fn<(options: unknown) => Promise<{ text: string }>>(),
  record: vi.fn<(entry: unknown) => Promise<void>>(),
}))

vi.mock('@tanstack/ai', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  generateTranscription: state.transcription,
}))
vi.mock('@mimir/plugin-provider', () => ({
  docxTranscriptionConfiguration: async () => ({ model: 'whisper-1' }),
  docxTranscriptionAdapter: async () => ({
    model: 'whisper-1',
    baseUrl: 'https://api.openai.com/v1',
    adapter: { model: 'whisper-1' },
  }),
}))
vi.mock('../plugins/host.js', () => ({
  assemble: () => ({ settings: { getBoolean: async () => state.vision } }),
}))
vi.mock('../services/model.js', () => ({
  modelReady: async () => true,
  callChat: state.chat,
}))
vi.mock('../services/usage.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  record: state.record,
}))

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]).toString('base64')

describe('DOCX media analysis', () => {
  beforeEach(() => {
    state.vision = true
    state.chat.mockReset().mockResolvedValue('分析结果')
    state.transcription.mockReset().mockResolvedValue({ text: '讲话内容' })
    state.record.mockReset()
  })

  it('sends validated selected image and video frames to TanStack chat', async () => {
    expect(
      await analyzeDocxMedia({
        documentId: 'doc-1',
        instruction: '描述',
        kind: 'image',
        media: [{ mimeType: 'image/png', data: png }],
      }),
    ).toEqual({ text: '分析结果' })
    expect(state.chat.mock.calls[0]?.[0].messages[0]?.content).toEqual([
      { type: 'text', content: '描述' },
      { type: 'image', source: { type: 'data', value: png, mimeType: 'image/png' } },
    ])
    await analyzeDocxMedia({
      documentId: 'doc-1',
      instruction: '总结视频',
      kind: 'video',
      media: [
        { mimeType: 'image/png', data: png },
        { mimeType: 'image/png', data: png },
      ],
    })
    expect(state.chat.mock.calls[1]?.[0].messages[0]?.content).toHaveLength(3)
  })

  it('transcribes a selected audio file through TanStack before analysis', async () => {
    const wav = Buffer.from('RIFF1234WAVEdata').toString('base64')
    const result = await analyzeDocxMedia({
      documentId: 'doc-1',
      instruction: '总结',
      kind: 'audio',
      media: [{ mimeType: 'audio/wav', data: wav }],
    })
    expect(result.text).toBe('分析结果')
    expect(state.transcription).toHaveBeenCalledOnce()
    expect(state.chat.mock.calls[0]?.[0].messages[0]?.content).toContain('讲话内容')
    expect(state.record).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'transcription', ok: true }),
    )
  })

  it('rejects media type spoofing before the model is called', async () => {
    await expect(
      analyzeDocxMedia({
        documentId: 'doc-1',
        instruction: '描述',
        kind: 'image',
        media: [{ mimeType: 'image/jpeg', data: png }],
      }),
    ).rejects.toThrow('类型不符')
    expect(state.chat).not.toHaveBeenCalled()
  })
})
