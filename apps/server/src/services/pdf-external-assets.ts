import { randomUUID } from 'node:crypto'
import {
  pdfAssetOperationSchema,
  type PdfAssetData,
  type PdfAssetOperation,
  type PdfAssetReadiness,
  type PdfPreparedImage,
} from '@mimir/shared'
import { braveImageSearch, braveSearchReady } from './docx-brave-search.js'
import { docxImageReady, generateDocxImage } from './docx-image-generation.js'
import { decodePdfImage } from './pdf-image-codec.js'

export interface PdfAssetScope {
  principal: string
  documentId: string
  assetSessionId: string
}
const TTL = 20 * 60_000
const LIMIT = 8
const MAX_BYTES = 64 * 1024 * 1024
const REF =
  /^mimir-generated:\/\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/

/** Process-private and bounded. No URL downloader ever sees this protocol. */
export class PdfAssetRegistry {
  private readonly entries = new Map<
    string,
    { scope: PdfAssetScope; bytes: Uint8Array; image: PdfPreparedImage }
  >()
  constructor(private readonly now = Date.now) {}
  private purge() {
    for (const [key, entry] of this.entries)
      if (entry.image.expiresAt <= this.now()) this.entries.delete(key)
  }
  register(
    scope: PdfAssetScope,
    bytes: Uint8Array,
    requestedRatio: PdfPreparedImage['requestedRatio'],
  ): PdfPreparedImage {
    const decoded = decodePdfImage(bytes)
    this.purge()
    // A single editor source can retain at most four prepared images.
    const owned = [...this.entries].filter(
      ([, entry]) =>
        entry.scope.principal === scope.principal &&
        entry.scope.assetSessionId === scope.assetSessionId,
    )
    while (owned.length >= 4) this.entries.delete(owned.shift()![0])
    let retained = [...this.entries.values()].reduce((sum, entry) => sum + entry.bytes.length, 0)
    while (this.entries.size >= LIMIT || retained + bytes.length > MAX_BYTES) {
      const oldest = this.entries.keys().next().value
      if (!oldest) break
      retained -= this.entries.get(oldest)!.bytes.length
      this.entries.delete(oldest)
    }
    const url = `mimir-generated://${randomUUID()}`
    const image: PdfPreparedImage = {
      url,
      mimeType: bytes[0] === 255 ? 'image/jpeg' : 'image/png',
      width: decoded.width,
      height: decoded.height,
      requestedRatio,
      actualRatio: decoded.width / decoded.height,
      expiresAt: this.now() + TTL,
    }
    this.entries.set(url, { scope: { ...scope }, bytes: Uint8Array.from(bytes), image })
    return { ...image }
  }
  resolve(
    scope: PdfAssetScope,
    url: string,
  ): { bytes: Uint8Array; mimeType: PdfPreparedImage['mimeType'] } {
    this.purge()
    const entry = REF.test(url) ? this.entries.get(url) : undefined
    if (
      !entry ||
      entry.scope.principal !== scope.principal ||
      entry.scope.documentId !== scope.documentId ||
      entry.scope.assetSessionId !== scope.assetSessionId
    )
      throw new Error('生成图片引用已过期或不属于当前文档会话，请重新生成')
    return { bytes: entry.bytes.slice(), mimeType: entry.image.mimeType }
  }
}
export const pdfAssetRegistry = new PdfAssetRegistry()
export async function pdfAssetReadiness(): Promise<PdfAssetReadiness> {
  const [search, image] = await Promise.all([braveSearchReady(), docxImageReady()])
  return {
    image_search: {
      available: search,
      ...(!search
        ? { reason: '图片搜索未配置或密钥不可用，请前往设置 → 网络搜索配置 Brave Search' }
        : {}),
    },
    generate_image: {
      available: image,
      ...(!image ? { reason: '图片生成未配置或密钥不可用，请前往设置 → 模型配置图片生成' } : {}),
    },
  }
}
export async function preparePdfAsset(
  scope: PdfAssetScope,
  raw: PdfAssetOperation,
  signal?: AbortSignal,
): Promise<PdfAssetData> {
  signal?.throwIfAborted()
  const operation = pdfAssetOperationSchema.parse(raw)
  if (operation.op === 'image_search') {
    const data = await braveImageSearch(
      { query: operation.query, maxResults: operation.max_results },
      signal,
    )
    signal?.throwIfAborted()
    return { results: data.results.slice(0, operation.max_results) }
  }
  const image = await generateDocxImage(operation.prompt, scope.documentId, {
    signal,
    aspectRatio: operation.aspect_ratio,
  })
  signal?.throwIfAborted()
  const bytes = Buffer.from(image.dataUrl.split(',')[1] ?? '', 'base64')
  // Full PNG/JPEG decoding, not just magic bytes; WebP is deliberately rejected.
  return pdfAssetRegistry.register(scope, bytes, operation.aspect_ratio)
}
