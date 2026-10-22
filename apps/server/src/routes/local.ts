import { Hono } from 'hono'
import { localProfileInputSchema } from '@mimir/shared'
import { config } from '../config.js'
import { HttpError, parseInput } from '../lib/http.js'
import { setLocalOwnerName } from '../services/local-mode.js'
import type { AppEnv } from '../types.js'

/**
 * 本地模式专有端点（D-100）。
 *
 * ## 为什么需要一个自己的端点
 *
 * 本地模式没有可用凭据，better-auth 的 `update-user` 要求真实会话——
 * 桌面壳里那条路必然失败。与其在服务端拦截并改写 better-auth 的端点
 * （等于把它的字段白名单与校验复刻一遍），不如把它做成一个名字诚实、
 * 语义单一的端点（`packages/shared/src/local.ts` 的注释是同一条理由）。
 *
 * 它挂在鉴权中间件后面（本地模式下由令牌放行），并且**只在本地模式注册**；
 * 别的部署里 404——「这个部署没有这个能力」，不是「你没权限」。
 */
export const localRoute = new Hono<AppEnv>()

localRoute.patch('/profile', async (c) => {
  if (!config.localMode) {
    throw new HttpError(404, 'NOT_FOUND', '这个部署没有开启本地模式')
  }

  const input = await parseInput(c, 'json', localProfileInputSchema)
  const name = await setLocalOwnerName(input.name)
  if (name === null) {
    // 本地模式开着却没有本机用户：建号那一步失败了，说清楚而不是静默返回成功
    throw new HttpError(500, 'LOCAL_OWNER_MISSING', '本机用户不存在，请重启客户端')
  }

  return c.json({ name })
})
