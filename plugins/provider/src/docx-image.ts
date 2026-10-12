import { createOpenaiImage } from '@tanstack/ai-openai'
import type { PluginSettings } from '@mimir/shared'

const MODELS = ['gpt-image-1', 'gpt-image-1-mini', 'gpt-image-2', 'dall-e-2', 'dall-e-3'] as const
type ImageModel = (typeof MODELS)[number]

export async function docxImageConfiguration(settings: PluginSettings): Promise<{
  model: ImageModel
  baseUrl: string
  apiKey: string
} | null> {
  const secret = await settings.getSecret('model.image.apiKey')
  if (!secret.ok || !secret.value) return null
  const model = await settings.getString('model.image.model')
  if (!MODELS.includes(model as ImageModel)) throw new Error('图片生成模型不受当前适配器支持')
  const baseUrl = await settings.getString('model.image.baseUrl')
  const parsed = new URL(baseUrl)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('图片生成接口地址无效')
  return { model: model as ImageModel, baseUrl, apiKey: secret.value }
}

/** Adapter construction stays inside the provider plugin. */
export async function docxImageAdapter(settings: PluginSettings) {
  const config = await docxImageConfiguration(settings)
  if (!config) return null
  return {
    model: config.model,
    baseUrl: config.baseUrl,
    adapter: createOpenaiImage(config.model, config.apiKey, { baseURL: config.baseUrl }),
  }
}
