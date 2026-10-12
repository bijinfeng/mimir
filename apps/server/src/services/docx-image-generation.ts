import { generateImage } from '@tanstack/ai'
import { docxImageAdapter, docxImageConfiguration } from '@mimir/plugin-provider'
import { assemble } from '../plugins/host.js'
import { record, tokenFields } from './usage.js'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024

export async function docxImageReady(): Promise<boolean> {
  try {
    return (await docxImageConfiguration(assemble().settings)) !== null
  } catch {
    return false
  }
}

function imageMime(bytes: Buffer): string {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png'
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp'
  throw new Error('图片生成服务返回了不支持的图片格式')
}

/** A bounded image payload that the browser can insert without exposing credentials. */
export async function generateDocxImage(
  prompt: string,
  documentId: string,
): Promise<{ dataUrl: string; mimeType: string }> {
  if (!prompt.trim() || prompt.length > 2_000)
    throw new Error('图片描述不能为空且不能超过 2000 字符')
  const config = await docxImageAdapter(assemble().settings)
  if (!config) throw new Error('请先配置 DOCX 图片生成 API 密钥')
  const startedAt = performance.now()
  let usage: unknown
  let ok = false
  try {
    const result = await generateImage({
      adapter: config.adapter,
      prompt: prompt.trim(),
      numberOfImages: 1,
      ...(config.model.startsWith('dall-e')
        ? { modelOptions: { response_format: 'b64_json' as const } }
        : {}),
      timeout: 60_000,
    })
    usage = result.usage
    const image = result.images[0]
    // Do not fetch a provider URL here: it can be transient or point into a private network.
    if (!image?.b64Json) throw new Error('图片生成服务未返回可安全插入的图片数据')
    if (image.b64Json.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8)
      throw new Error('生成图片超过 8 MB 限制')
    const bytes = Buffer.from(image.b64Json, 'base64')
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('生成图片超过 8 MB 限制')
    const mimeType = imageMime(bytes)
    ok = true
    return { dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}`, mimeType }
  } finally {
    const tokens = tokenFields(usage)
    await record({
      role: 'image',
      source: 'chat',
      model: config.model,
      providerId: 'openai-image',
      baseUrlHost: new URL(config.baseUrl).host,
      promptTokens: tokens.promptTokens,
      completionTokens: tokens.completionTokens,
      totalTokens: tokens.totalTokens,
      durationMs: Math.round(performance.now() - startedAt),
      ok,
      failureKind: ok ? null : 'image_generation',
      refId: documentId,
    })
  }
}
