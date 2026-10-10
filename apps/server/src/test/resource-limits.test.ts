import { afterEach, describe, expect, it, vi } from 'vitest'
import { readUploadForm } from '../lib/multipart.js'
import { HttpError } from '../lib/http.js'
import { fetchText } from '../../../../plugins/capturer/src/http.js'

function multipartRequest(bytes: Uint8Array, contentLength?: string) {
  const midpoint = Math.floor(bytes.byteLength / 2)
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.subarray(0, midpoint))
      controller.enqueue(bytes.subarray(midpoint))
      controller.close()
    },
  })
  return new Request('http://localhost/upload', {
    method: 'POST',
    headers: {
      'content-type': 'multipart/form-data; boundary=limit-test',
      ...(contentLength === undefined ? {} : { 'content-length': contentLength }),
    },
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
}

const multipart = new TextEncoder().encode(
  '--limit-test\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\nContent-Type: text/plain\r\n\r\nhello\r\n--limit-test--\r\n',
)

describe('上传请求体预算', () => {
  it('无 Content-Length 时，恰好等于上限可解析', async () => {
    const form = await readUploadForm(multipartRequest(multipart), multipart.byteLength)
    expect((form.get('file') as File).size).toBe(5)
  })

  it('无 Content-Length 时，在解析 File 前拒绝超限字节', async () => {
    await expect(
      readUploadForm(multipartRequest(multipart), multipart.byteLength - 1),
    ).rejects.toMatchObject({
      status: 413,
      code: 'TOO_LARGE',
    } satisfies Partial<HttpError>)
  })

  it('不信任偏小的 Content-Length；实际流仍受限', async () => {
    await expect(readUploadForm(multipartRequest(multipart, '1'), 10)).rejects.toMatchObject({
      status: 413,
      code: 'TOO_LARGE',
    })
  })

  it('声明长度已超限时，未读取流就拒绝', async () => {
    await expect(readUploadForm(multipartRequest(multipart, '9999'), 10)).rejects.toMatchObject({
      status: 413,
      code: 'TOO_LARGE',
    })
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('抓取响应体预算', () => {
  it('跨块 UTF-8 正确解码，恰好等于上限可返回', async () => {
    const bytes = new TextEncoder().encode('甲乙')
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(bytes.subarray(0, 2))
                controller.enqueue(bytes.subarray(2))
                controller.close()
              },
            }),
          ),
      ),
    )
    await expect(
      fetchText('https://example.com', { timeoutMs: 1000, maxBytes: 6 }),
    ).resolves.toEqual({
      text: '甲乙',
      bytes: 6,
    })
  })

  it('声明长度偏小时，仍在流读取过程中中止超限响应', async () => {
    let cancelled = false
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new Uint8Array(6))
                controller.enqueue(new Uint8Array(6))
              },
              cancel() {
                cancelled = true
              },
            }),
            { headers: { 'content-length': '1' } },
          ),
      ),
    )
    await expect(
      fetchText('https://example.com', { timeoutMs: 1000, maxBytes: 10 }),
    ).rejects.toThrow('内容过大')
    expect(cancelled).toBe(true)
  })
})
