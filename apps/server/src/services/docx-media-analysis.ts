import { generateTranscription } from '@tanstack/ai'
import { docxTranscriptionAdapter, docxTranscriptionConfiguration } from '@mimir/plugin-provider'
import { assemble } from '../plugins/host.js'
import { callChat, modelReady } from './model.js'
import { record, tokenFields } from './usage.js'

type Kind = 'image' | 'audio' | 'video'
type Media = { mimeType: string; data: string }
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_AUDIO_BYTES = 10 * 1024 * 1024

export class DocxMediaInputError extends Error {}

export async function docxMediaReadiness(): Promise<{ vision: boolean; audio: boolean }> {
  const settings = assemble().settings
  const [visionEnabled, model, transcription] = await Promise.all([
    settings.getBoolean('docx.media.visionEnabled'),
    modelReady('chat'),
    docxTranscriptionConfiguration(settings).catch(() => null),
  ])
  return { vision: visionEnabled && model, audio: Boolean(transcription) && model }
}

function decode(item: Media, limit: number): Buffer {
  if (
    !/^[A-Za-z0-9+/]+={0,2}$/.test(item.data) ||
    item.data.length > Math.ceil((limit * 4) / 3) + 8
  ) {
    throw new DocxMediaInputError('媒体数据无效或超过大小限制')
  }
  const bytes = Buffer.from(item.data, 'base64')
  if (!bytes.length || bytes.length > limit)
    throw new DocxMediaInputError('媒体数据无效或超过大小限制')
  return bytes
}

function imageMime(bytes: Buffer): string {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png'
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp'
  throw new DocxMediaInputError('不支持的图片类型')
}

function audioMime(item: Media, bytes: Buffer): string {
  const head = bytes.toString('ascii', 0, 4)
  if (item.mimeType === 'audio/wav' && head === 'RIFF') return 'audio/wav'
  if (
    item.mimeType === 'audio/mpeg' &&
    (head.startsWith('ID3') || (bytes[0] === 255 && (bytes[1] ?? 0) >= 224))
  )
    return 'audio/mpeg'
  if (item.mimeType === 'audio/mp4' && bytes.toString('ascii', 4, 8) === 'ftyp') return 'audio/mp4'
  if (item.mimeType === 'audio/ogg' && head === 'OggS') return 'audio/ogg'
  throw new DocxMediaInputError('不支持的音频类型或文件内容与类型不符')
}

async function transcribe(item: Media, documentId: string): Promise<string> {
  const config = await docxTranscriptionAdapter(assemble().settings)
  if (!config) throw new Error('请先配置 DOCX 音频转录服务')
  const bytes = decode(item, MAX_AUDIO_BYTES)
  const mime = audioMime(item, bytes)
  const startedAt = performance.now()
  let usage: unknown
  let ok = false
  try {
    const result = await generateTranscription({
      adapter: config.adapter,
      audio: new File(
        [new Uint8Array(bytes)],
        `media.${mime === 'audio/wav' ? 'wav' : mime === 'audio/mpeg' ? 'mp3' : mime === 'audio/ogg' ? 'ogg' : 'm4a'}`,
        { type: mime },
      ),
      timeout: 60_000,
    })
    usage = result.usage
    if (!result.text.trim()) throw new Error('音频转录服务没有返回文字')
    ok = true
    return result.text.slice(0, 30_000)
  } finally {
    const tokens = tokenFields(usage)
    await record({
      role: 'transcription',
      source: 'chat',
      model: config.model,
      providerId: 'openai-transcription',
      baseUrlHost: new URL(config.baseUrl).host,
      promptTokens: tokens.promptTokens,
      completionTokens: tokens.completionTokens,
      totalTokens: tokens.totalTokens,
      durationMs: Math.round(performance.now() - startedAt),
      ok,
      failureKind: ok ? null : 'transcription',
      refId: documentId,
    })
  }
}

export async function analyzeDocxMedia(input: {
  documentId: string
  instruction: string
  kind: Kind
  media: Media[]
}): Promise<{ text: string }> {
  const ready = await docxMediaReadiness()
  if (!input.instruction.trim() || input.instruction.length > 4_000)
    throw new DocxMediaInputError('分析要求不能为空且不能超过 4000 字符')
  if (input.kind === 'audio') {
    if (!ready.audio) throw new Error('请先配置 DOCX 音频转录服务和聊天模型')
    if (input.media.length !== 1) throw new DocxMediaInputError('音频分析需要一个文件')
    const transcript = await transcribe(input.media[0]!, input.documentId)
    const text = await callChat({
      role: 'chat',
      source: 'chat',
      refId: input.documentId,
      stream: false,
      messages: [
        { role: 'user', content: `${input.instruction}\n\n音频转录内容：\n${transcript}` },
      ],
    })
    return { text }
  }
  if (!ready.vision) throw new Error('请先确认聊天模型支持图片输入并启用 DOCX 图片与视频分析')
  if (input.media.length < 1 || input.media.length > (input.kind === 'image' ? 1 : 4)) {
    throw new DocxMediaInputError('图片需要一个文件，视频需要 1 到 4 帧')
  }
  const images = input.media.map((item) => {
    const bytes = decode(item, MAX_IMAGE_BYTES)
    const mime = imageMime(bytes)
    if (item.mimeType !== mime) throw new DocxMediaInputError('图片文件内容与类型不符')
    return {
      type: 'image' as const,
      source: { type: 'data' as const, value: item.data, mimeType: mime },
    }
  })
  const text = await callChat({
    role: 'chat',
    source: 'chat',
    refId: input.documentId,
    stream: false,
    messages: [
      { role: 'user', content: [{ type: 'text', content: input.instruction }, ...images] },
    ],
  })
  return { text }
}
