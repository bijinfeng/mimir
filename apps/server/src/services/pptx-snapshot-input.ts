import { readPptxImageInfo } from '@mimir/shared'

type InputMessage = { role: string; content?: unknown }
export function hasImageInput(messages: readonly InputMessage[]): boolean {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some(
        (part: unknown) =>
          typeof part === 'object' &&
          part !== null &&
          (part as { type?: unknown }).type === 'image',
      ),
  )
}
/** The generated-slide path accepts bounded inline PNGs only; it never fetches URLs. */
export function validatePptxSnapshots(messages: readonly InputMessage[]): number {
  let count = 0
  let total = 0
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue
    let perMessage = 0
    for (const part of message.content as unknown[]) {
      if (
        typeof part !== 'object' ||
        part === null ||
        (part as { type?: unknown }).type !== 'image'
      )
        continue
      count++
      if (++perMessage > 1 || count > 4)
        throw new Error('每轮只能附一页截图，一次对话最多保留 4 页截图；请新建对话继续')
      const source = (part as { source?: { type?: unknown; mimeType?: unknown; value?: unknown } })
        .source
      if (
        message.role !== 'user' ||
        source?.type !== 'data' ||
        source.mimeType !== 'image/png' ||
        typeof source.value !== 'string' ||
        source.value.length > 6_990_508 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(source.value) ||
        source.value.length % 4 !== 0
      )
        throw new Error('幻灯片截图须为不超过 5 MiB 的内嵌 PNG')
      const bytes = Buffer.from(source.value, 'base64')
      total += bytes.length
      if (!bytes.length || bytes.length > 5 * 1024 * 1024 || total > 20 * 1024 * 1024)
        throw new Error('幻灯片截图超过本轮大小限制')
      let info: ReturnType<typeof readPptxImageInfo>
      try {
        info = readPptxImageInfo(bytes)
      } catch {
        throw new Error('幻灯片截图的图片内容无效，请重新准备 PNG 截图')
      }
      if (
        info.ext !== 'png' ||
        info.width > 1280 ||
        info.height > 1920 ||
        info.width * info.height > 2_457_600
      )
        throw new Error('幻灯片截图尺寸须在 1280 × 1920 像素以内')
    }
  }
  return count
}
