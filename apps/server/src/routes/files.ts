import { and, eq, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { isInlineSafe } from '@mimir/shared'
import { db } from '../db/client.js'
import { documents } from '../db/schema.js'
import { HttpError } from '../lib/http.js'
import { readUpload } from '../lib/uploads.js'
import { readUploadMeta } from '../lib/uploads.js'
import { replaceUpload, uploadFile, UploadError } from '../services/upload.js'
import type { AppEnv } from '../types.js'

/**
 * 上传、替换与下载原件（`docs/TECH.md` §13）。
 *
 * 挂在与 `/api/documents` 同一个前缀下：原件是**文档的一部分**，
 * 不是另一个资源。分开成 `/api/files` 会让人以为它是独立的一类东西，
 * 而实际上它只有挂在文档 id 上才能被找到（`uploads/<id>/…` 也是这个形状）。
 *
 * 路径都带两段（`/:id/file`、`/files`），与 `documentsRoute` 的 `/:id`
 * （单段）不会互相吞掉——Hono 按段数精确匹配。
 */
export const filesRoute = new Hono<AppEnv>()

/**
 * 上传一个文件。
 *
 * ## 单文件一请求
 *
 * 界面允许多选，但前端**逐个串行发**而不是一次 multipart 带多个——
 * 多文件的部分失败报告会变成一团糊（哪个成功了？标签应用到谁？），
 * 而逐文件请求天然给出逐文件的答案。代价是多个往返，对单用户不是问题。
 *
 * ## `parseBody` 而不是流式收
 *
 * 与头像同一条判断（见 `routes/avatar.ts`）：上限 50MB 一次性读完没有内存顾虑，
 * 而流式收要在流的中间做校验（「读了 40MB 才发现太大」），复杂度换不来东西。
 */
filesRoute.post('/files', async (c) => {
  const body = await c.req.parseBody().catch(() => null)
  const file = body?.file

  if (!(file instanceof File)) {
    throw new HttpError(400, 'INVALID_INPUT', '请求里没有文件（字段名应为 file）')
  }

  // 归入的目录（可选）。multipart 的普通字段与文件字段混在同一个 body 里，
  // 类型上要收窄一次；空串按「没带」处理
  const folderField = body?.folder
  const folder =
    typeof folderField === 'string' && folderField.trim() !== '' ? folderField : undefined

  // 读进内存再校验大小：`file.size` 是浏览器声明的值，不能只信它。
  // 而且校验必须在写任何文件之前（先写再校验会留下永远不会被引用的文件）
  const data = new Uint8Array(await file.arrayBuffer())

  try {
    const result = await uploadFile({
      filename: file.name || 'unnamed',
      declaredMime: file.type,
      data,
      folder,
    })
    return c.json(result, 201)
  } catch (error) {
    throw asHttpError(error)
  }
})

/** 替换已有上传件的原件（下载 → 外部工具改 → 传回）。见 services/upload.ts */
filesRoute.put('/:id/file', async (c) => {
  const body = await c.req.parseBody().catch(() => null)
  const file = body?.file

  if (!(file instanceof File)) {
    throw new HttpError(400, 'INVALID_INPUT', '请求里没有文件（字段名应为 file）')
  }

  const data = new Uint8Array(await file.arrayBuffer())

  try {
    const result = await replaceUpload(c.req.param('id'), {
      filename: file.name || 'unnamed',
      declaredMime: file.type,
      data,
    })
    if (!result) throw new HttpError(404, 'NOT_FOUND', '文档不存在，或它不是上传的文件')
    return c.json(result)
  } catch (error) {
    throw asHttpError(error)
  }
})

/** `UploadError` 是产品级错误（太大 / 空文件），转成统一外壳；其余原样抛给 500 */
function asHttpError(error: unknown): unknown {
  if (error instanceof UploadError) {
    const status = error.code === 'TOO_LARGE' ? 413 : 400
    return new HttpError(status as 400, error.code, error.message)
  }
  return error
}

/**
 * 下载原件。
 *
 * ## 鉴权是必须的
 *
 * 与头像同一条理由：上传的内容是**私人资源**。放到公开静态目录下，
 * 任何人凭一个文档 id 就能拿到——而这是个应该只有一个人用的服务。
 * 原件走这条端点，所以 `data/uploads/` 永远不需要由静态中间件暴露。
 *
 * ## inline 是白名单，不是默认
 *
 * `text/html` 与 `image/svg+xml` 里可以带脚本，而它们与应用的页面**同源**
 * ——内联等于在自己的源上执行用户文件里的脚本，会话 cookie 就在那儿。
 * 所以这两类强制 `attachment`（下载）。判定收在 `shared/files.ts` 的
 * `isInlineSafe`：前端用它决定「这个格式能不能内嵌预览」，两处必须是同一份。
 *
 * ## Range 支持单段
 *
 * 视频要用它——Safari 不认整份 200 响应就播不了。存储接缝是整读，
 * 所以这里是**读全文再切片**：对 50MB 以内的文件比给接缝加流式能力划算得多
 * （那要让本地与 S3 两个实现都改）。
 */
filesRoute.get('/:id/file', async (c) => {
  const id = c.req.param('id')
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), isNull(documents.deletedAt)))

  if (!row) throw new HttpError(404, 'NOT_FOUND', '文档不存在')
  if (row.kind !== 'file' || !row.sourceKey) {
    throw new HttpError(404, 'NO_SOURCE', '这条文档没有原件（只有上传的文件才有）')
  }

  let data: Uint8Array
  try {
    data = await readUpload(row.sourceKey)
  } catch {
    // 记录在而文件不在——那正是铁律 2 要防的形态，必须明说而不是 500
    throw new HttpError(404, 'SOURCE_MISSING', '原件不在存储里（可能被手工删除，试着重新上传）')
  }

  const meta = await readUploadMeta(id)
  const filename = meta?.filename ?? row.sourceKey.split('/').pop() ?? 'file'
  const mime = row.mime ?? 'application/octet-stream'
  const total = data.byteLength

  // 强制下载（?download=1）时不走白名单——用户明确要的就是下载
  const forceDownload = c.req.query('download') !== undefined
  const disposition = forceDownload || !isInlineSafe(mime) ? 'attachment' : 'inline'

  const headers = new Headers({
    'Content-Type': mime,
    /**
     * **不让浏览器猜类型。** 没有它时某些浏览器会对响应体做 MIME 嗅探——
     * 一份内容是 HTML 的 `.txt`（我们按 `text/plain` 发出）有可能被当成网页
     * 渲染，而那是在应用自己的源上执行上传文件的内容。`nosniff` 关掉这条路径，
     * 与 `isInlineSafe` 的白名单是同一条防线的两层。
     */
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
    'Content-Disposition': contentDisposition(disposition, filename),
    // 替换原件后 URL 不变，所以不能给长缓存；条件请求用 ETag 承担
    'Cache-Control': 'private, no-cache',
    ETag: etagFor(row.size ?? total, row.updatedAt),
  })

  // 条件请求优先于 Range（RFC 9110：If-None-Match 命中时返回 304）
  if (c.req.header('if-none-match') === headers.get('ETag')) {
    return new Response(null, { status: 304, headers })
  }

  const range = parseRange(c.req.header('range'), total)
  if (range === 'invalid') {
    headers.set('Content-Range', `bytes */${total}`)
    return new Response(null, { status: 416, headers })
  }

  if (range) {
    const slice = data.slice(range.start, range.end + 1)
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${total}`)
    headers.set('Content-Length', String(slice.byteLength))
    return new Response(new Uint8Array(slice), { status: 206, headers })
  }

  headers.set('Content-Length', String(total))
  return new Response(new Uint8Array(data), { status: 200, headers })
})

/** 弱 ETag：大小 + 更新时间。不用内容哈希——那要读全文件才算得出来 */
function etagFor(size: number, updatedAt: Date): string {
  return `W/"${size}-${updatedAt.getTime()}"`
}

/**
 * 单段 Range 解析。
 *
 * 三种结果：`null`（没有 / 不支持的形式，按整份返回）、区间、`'invalid'`。
 *
 * **多段 Range 直接忽略**（按整份返回）：`bytes=0-99,200-299` 要拼
 * `multipart/byteranges` 响应体，而浏览器与播放器实际只会用单段。
 * 忽略是 RFC 允许的（服务端可以只支持单段）。
 */
function parseRange(
  header: string | undefined,
  total: number,
): { start: number; end: number } | 'invalid' | null {
  if (!header) return null

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null

  const [, rawStart, rawEnd] = match
  if (rawStart === '' && rawEnd === '') return 'invalid'

  // `bytes=-500` 表示「最后 500 字节」
  if (rawStart === '') {
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0) return 'invalid'
    const start = Math.max(0, total - suffix)
    return { start, end: total - 1 }
  }

  const start = Number(rawStart)
  if (!Number.isFinite(start) || start >= total) return 'invalid'

  const end = rawEnd === '' ? total - 1 : Math.min(Number(rawEnd), total - 1)
  if (!Number.isFinite(end) || end < start) return 'invalid'

  return { start, end }
}

/**
 * `Content-Disposition` 头。中文文件名走 RFC 5987 的 `filename*`，
 * 否则某些浏览器会乱码（与 `routes/export.ts` 的 disposition 同一条做法）。
 */
function contentDisposition(kind: 'inline' | 'attachment', filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}
