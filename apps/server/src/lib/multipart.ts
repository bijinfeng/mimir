import { FILE_MAX_BYTES } from '@mimir/shared'
import { HttpError } from './http.js'

// 文件上限之外，留给 multipart 边界、文件名和 folder 字段 1 MiB。
// 这是整个请求体的预算；文件本身仍由 upload service 按 FILE_MAX_BYTES 校验。
export const UPLOAD_REQUEST_MAX_BYTES = FILE_MAX_BYTES + 1024 * 1024

/** 在 multipart 解析（它会物化 File）之前，逐块限制请求体大小。 */
export async function readUploadForm(
  request: Request,
  maxBytes = UPLOAD_REQUEST_MAX_BYTES,
): Promise<FormData> {
  const length = request.headers.get('content-length')
  if (length && /^\d+$/.test(length) && Number(length) > maxBytes) {
    void request.body?.cancel().catch(() => undefined)
    throw tooLarge()
  }

  const reader = request.body?.getReader()
  if (!reader) throw new HttpError(400, 'INVALID_INPUT', '请求里没有文件（字段名应为 file）')

  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      void reader.cancel().catch(() => undefined)
      throw tooLarge()
    }
    chunks.push(value)
  }

  // 不用 Blob 再复制一份完整请求；解析器从已受限的块流读取。
  const boundedBody = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
  return new Response(boundedBody, {
    headers: { 'content-type': request.headers.get('content-type') ?? '' },
  }).formData()
}

function tooLarge() {
  return new HttpError(413, 'TOO_LARGE', '上传请求过大（单个文件上限 50 MiB）')
}
