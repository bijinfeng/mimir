import { pathToFileURL } from 'node:url'
import { serve } from '@hono/node-server'
import type { Hono } from 'hono'
import { boot } from './boot.js'
import { dbDriver, env } from './env.js'
import type { AppEnv } from './types.js'

export { closeDb } from './db/client.js'

/**
 * 生产入口。构建后跑 `node dist/index.js`（Dockerfile 的 CMD）。
 *
 * `startServer` 被拆成**可导入的函数**而不是直接在模块顶层监听，因为
 * 桌面端（`apps/desktop`，D-046）要在**进程内**启动同一个宿主：它需要
 * 拿到 server 句柄做优雅关停，还需要传 `hostname` 把监听收进 127.0.0.1。
 * 浏览器部署的行为不变：本文件被直接执行时自动 startServer。
 */

export interface RunningServer {
  /** @hono/node-server 的句柄，`close()` 用于优雅关停 */
  server: ReturnType<typeof serve>
  app: Hono<AppEnv>
}

export async function startServer(options: { hostname?: string } = {}): Promise<RunningServer> {
  /**
   * 本地模式的监听地址**强制回环**（D-100）。
   *
   * 免登录建立在「同一台机器」这个前提上：宿主注入了令牌，而令牌只写进
   * 本机桌面客户端的 cookie jar。一旦绑到 0.0.0.0，局域网里任何人都能
   * 打开这个地址、走本机用户身份直接读写整个知识库。
   *
   * 所以这不是「桌面端碰巧传了 127.0.0.1」，而是本地模式下**无法**监听
   * 其他地址——把「随机端口 + 回环」从调用方的自觉变成结构性的保证。
   *
   * 校验放在 `boot()` **之前**：配置错误不该先跑一遍迁移与装配才报错。
   */
  const hostname = options.hostname ?? (env.localMode ? '127.0.0.1' : undefined)
  if (env.localMode && hostname !== '127.0.0.1' && hostname !== 'localhost') {
    throw new Error(`本地模式只允许监听回环地址，收到：${hostname}`)
  }

  const app = await boot()

  const server = serve({ fetch: app.fetch, port: env.port, hostname }, (info) => {
    console.log(`mimir server 监听 http://localhost:${info.port}`)
    console.log(`  数据目录 ${env.dataDir}`)
    // 驱动与库位置必须打在启动日志里：「数据全空」时第一眼要看的就是这行
    // （DATABASE_URL 漏配会静默换到 SQLite 空库，TECH §10）
    console.log(
      dbDriver === 'postgres' ? `  数据库 postgres` : `  数据库 sqlite（${env.databaseFile}）`,
    )
    if (env.localMode) {
      console.log('  本地模式：免登录（入口是宿主注入的本机令牌）；不对外监听')
    }
  })

  return { server, app }
}

/** CLI 直跑判定（与 migrate.ts 同一模式）：dist 与 src 两种形态都成立 */
function invokedDirectly(): boolean {
  const argv = process.argv[1]
  if (!argv) return false
  return import.meta.url === pathToFileURL(argv).href
}

if (invokedDirectly()) {
  startServer().catch((error) => {
    console.error('启动失败：', error)
    process.exit(1)
  })
}
