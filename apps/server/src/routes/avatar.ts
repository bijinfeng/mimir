import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from '@mimir/shared'
import { db } from '../db/client.js'
import { user } from '../db/schema.js'
import { HttpError } from '../lib/http.js'
import { readAvatar, writeAvatar } from '../services/avatar.js'
import type { AppEnv } from '../types.js'

/**
 * 头像的上传与读取（`.trellis/spec/project/architecture.md` §12.6、D-036）。
 *
 * ## 为什么读取也要鉴权
 *
 * 头像是**私人资源**，不是公开静态文件。放到 `public/` 下由静态中间件伺服
 * 会让任何人凭一个 id 就能看到——而这是个应该只有你一个人用的服务。
 *
 * ## 为什么上传走 multipart 而不是 base64 塞进 JSON
 *
 * base64 会把体积撑大约 33%，而头像上限是 512KB——多出来的部分纯粹是
 * 编码开销。multipart 是浏览器原生能力（`FormData`），服务端解析也就一行。
 */

export const avatarRoute = new Hono<AppEnv>()

/**
 * 读取当前用户的头像。
 *
 * **URL 里带 `?v=`，但这里不校验它。** 版本号的作用是让浏览器在换头像后
 * 拿到新图（文件名固定，不带版本就会一直显示缓存里的旧图——
 * 那是「上传没反应」这个经典误诊的来源）。服务端只需要把 `v` 当透明参数，
 * 响应头里的 `immutable` 才敢生效。
 *
 * 不带 `v` 时用 `no-cache`：直接访问 `/api/avatar` 的场景（比如调试）
 * 应该拿到当前的真图，而不是某个中间缓存里的旧版本。
 */
avatarRoute.get('/', async (c) => {
  const current = c.get('user')
  const file = await readAvatar(current.id)

  if (!file) {
    // 没有头像不是错误——界面回落到字母头像。回 404 而不是空图，
    // 前端的 `img.onerror` 才有明确的信号可依赖
    throw new HttpError(404, 'NO_AVATAR', '还没有上传头像')
  }

  const versioned = c.req.query('v') !== undefined

  return new Response(new Uint8Array(file.data), {
    headers: {
      'Content-Type': file.mime,
      'Content-Length': String(file.data.byteLength),
      'Cache-Control': versioned ? 'private, max-age=31536000, immutable' : 'private, no-cache',
    },
  })
})

/**
 * 上传头像。
 *
 * ## 校验在写文件**之前**
 *
 * 先写再校验会留下一个永远不会被引用的文件；而且如果先落库后校验，
 * 就会出现「库里指着不存在的东西」= 裂图（铁律 2 要防的正是这个）。
 * 所以顺序是：读 body → 校验 → **写文件** → 写指针。
 *
 * ## 为什么用 `c.req.parseBody()` 而不是流式收
 *
 * 上限是 512KB，一次性读完没有内存顾虑；而流式收要在流的中间做校验，
 * 那意味着「读了 400KB 才发现 MIME 不对」——复杂度换不来任何东西。
 * 单用户自托管，同时上传的请求数最多是一。
 */
avatarRoute.post('/', async (c) => {
  const current = c.get('user')

  const body = await c.req.parseBody().catch(() => null)
  const file = body?.file

  if (!(file instanceof File)) {
    throw new HttpError(400, 'INVALID_INPUT', '请求里没有文件（字段名应为 file）')
  }

  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new HttpError(
      400,
      'INVALID_TYPE',
      `不支持的图片格式：${file.type || '未知'}。请用 webp / png / jpeg`,
    )
  }

  if (file.size > AVATAR_MAX_BYTES) {
    throw new HttpError(
      400,
      'TOO_LARGE',
      `图片太大（${Math.round(file.size / 1024)} KB），上限 ${AVATAR_MAX_BYTES / 1024} KB`,
    )
  }

  if (file.size === 0) {
    throw new HttpError(400, 'EMPTY_FILE', '文件是空的')
  }

  const data = new Uint8Array(await file.arrayBuffer())

  // 先文件（铁律 2）：这一步失败时什么都没变，用户重试即可
  const written = await writeAvatar(current.id, data, file.type)

  /**
   * 再写指针。**版本号在这里生成**，不是在读取时——
   * 它要随「换头像」这个动作变化，而不是随「谁在读」变化。
   * 放在读取时算会让每次请求的 URL 都不同，从而彻底失去缓存的意义。
   */
  const version = Date.now()
  const url = `/api/avatar?v=${version}`

  await db.update(user).set({ image: url, updatedAt: new Date() }).where(eq(user.id, current.id))

  return c.json({ image: url, mime: written.mime, bytes: data.byteLength })
})
