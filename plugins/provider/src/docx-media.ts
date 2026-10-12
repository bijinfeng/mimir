import { createOpenaiTranscription } from '@tanstack/ai-openai'
import type { PluginSettings } from '@mimir/shared'

const MODELS = [
  'whisper-1',
  'gpt-4o-transcribe',
  'gpt-4o-mini-transcribe',
  'gpt-4o-transcribe-diarize',
] as const
type TranscriptionModel = (typeof MODELS)[number]

export async function docxTranscriptionConfiguration(settings: PluginSettings): Promise<{
  model: TranscriptionModel
  baseUrl: string
  apiKey: string
} | null> {
  const secret = await settings.getSecret('docx.media.apiKey')
  if (!secret.ok || !secret.value) return null
  const model = await settings.getString('docx.media.transcriptionModel')
  if (!MODELS.includes(model as TranscriptionModel))
    throw new Error('DOCX 音频转录模型不受当前适配器支持')
  const baseUrl = await settings.getString('docx.media.baseUrl')
  const parsed = new URL(baseUrl)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('DOCX 音频转录接口地址无效')
  return { model: model as TranscriptionModel, baseUrl, apiKey: secret.value }
}

export async function docxTranscriptionAdapter(settings: PluginSettings) {
  const config = await docxTranscriptionConfiguration(settings)
  if (!config) return null
  return {
    model: config.model,
    baseUrl: config.baseUrl,
    adapter: createOpenaiTranscription(config.model, config.apiKey, { baseURL: config.baseUrl }),
  }
}
