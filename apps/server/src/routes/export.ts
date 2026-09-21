import { Hono } from 'hono'
import { exportJson, exportMarkdownZip, exportStats } from '../services/export.js'
import type { AppEnv } from '../types.js'

/**
 * 导出。
 *
 * 两种格式的响应形状不同（一个是字符串、一个是流），所以不套统一的
 * c.json 外壳——但**错误**仍然走统一外壳，前端只需要处理一种错误形状。
 */
export const exportRoute = new Hono<AppEnv>()

exportRoute.get('/stats', async (c) => c.json(await exportStats()))

exportRoute.get('/:format', async (c) => {
  const format = c.req.param('format') === 'json' ? 'json' : 'markdown'

  if (format === 'json') {
    return new Response(await exportJson(), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': disposition('mimir-export.json'),
      },
    })
  }

  const stream = exportMarkdownZip()
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
      stream.on('end', () => controller.close())
      stream.on('error', (error) => controller.error(error))
    },
    cancel() {
      stream.destroy()
    },
  })

  return new Response(webStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': disposition('mimir-export.zip'),
    },
  })
})

function disposition(filename: string): string {
  // 中文文件名走 RFC 5987 的 filename*，否则某些浏览器会乱码
  return `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}
