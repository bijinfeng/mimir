import type { ServerType } from '@hono/node-server'
import type { Hono } from 'hono'
import { configureServer } from '../config.js'
import { closeDb, isDbConfigured } from '../db/client.js'
import type { AppEnv } from '../types.js'
import { createStaticMiddleware } from './static.js'
import { adaptAuthRequest, adaptAuthResponse, isAuthPath, stripFnosPrefix } from './gateway/fnos.js'
import { listenTcp } from './listeners/tcp.js'
import { listenUnix } from './listeners/unix.js'
import { toServerConfig, type RuntimeConfig } from './config.js'

export interface RuntimeHandle {
  server: ServerType
  app: Hono<AppEnv>
  origin: string
  /** 先关 HTTP，再关 DB；幂等 */
  close(): Promise<void>
}

async function closeServer(server: ServerType, timeoutMs = 5000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      // SSE / keep-alive 可能让 close 永远不回调；超时后强制断开，保证宿主能退出。
      // ServerType 是 http/https/http2 的联合，只有 http(s) 的实例有这个方法。
      const closable = server as ServerType & { closeAllConnections?: () => void }
      closable.closeAllConnections?.()
      resolve()
    }, timeoutMs)

    server.close((error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve()
    })
  })
}

/**
 * 启动一个 mimir 运行时。
 *
 * 顺序不可换：
 *   1. 先 `configureServer()`（`db/schema.ts` 在 import 时选方言）
 *   2. 再动态 import `boot`（它会 ensureServerRuntime、跑迁移、建号、装配 app）
 *   3. 最后监听；出错时关闭已建立的资源
 */
export async function startRuntime(config: RuntimeConfig): Promise<RuntimeHandle> {
  configureServer(toServerConfig(config))

  /**
   * 这个调用是否**拥有** DB 连接的所有权。
   *
   * 生产/CLI 里 startRuntime 创建连接，启动失败必须关掉；测试里 setup 已经
   * 建好连接（`ensureServerRuntime()`），一次失败的 `startServer()`（例如
   * fnOS 账号不一致的用例）不能把共享连接关掉，否则同一进程后续断言全炸。
   */
  const ownsDb = !isDbConfigured()

  let app: Hono<AppEnv>
  try {
    const { boot } = await import('../boot.js')
    const staticMiddleware = config.static ? createStaticMiddleware(config.static) : undefined
    const corsOrigin = config.auth.fnosGateway ? undefined : config.webOrigin
    app = await boot({ staticMiddleware, corsOrigin })
  } catch (error) {
    // boot 可能已经建了 DB 连接（ensureServerRuntime）；启动失败不能留下文件句柄
    if (ownsDb) await closeDb().catch(() => {})
    throw error
  }

  let server: ServerType
  let origin: string

  try {
    if (config.listener.kind === 'unix') {
      const gateway = config.auth.fnosGateway
      if (!gateway) throw new Error('Unix listener 必须配置 fnosGateway.basePath')
      const fetched = await listenUnix(async (request) => {
        const stripped = stripFnosPrefix(request, gateway.basePath)
        if (!stripped) return new Response('Not Found', { status: 404 })
        if (isAuthPath(new URL(stripped.url).pathname)) {
          const adapted = adaptAuthRequest(stripped)
          if (!adapted) return new Response('Invalid origin', { status: 403 })
          return adaptAuthResponse(await app.fetch(adapted), adapted)
        }
        return app.fetch(stripped)
      }, config.listener)
      server = fetched.server
      origin = fetched.origin
    } else {
      const listened = await listenTcp(app, config.listener)
      server = listened.server
      origin = listened.origin
    }
  } catch (error) {
    if (ownsDb) await closeDb().catch(() => {})
    throw error
  }

  let closing: Promise<void> | null = null
  return {
    server,
    app,
    origin,
    close() {
      closing ??= (async () => {
        await closeServer(server)
        // 只关自己创建的连接；测试/嵌入场景里连接可能归 setup 所有
        if (ownsDb) await closeDb()
      })()
      return closing
    },
  }
}
