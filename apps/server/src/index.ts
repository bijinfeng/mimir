import { pathToFileURL } from 'node:url'
import { serve } from '@hono/node-server'
import type { Hono } from 'hono'
import { boot } from './boot.js'
import { dbDriver, env } from './env.js'
import type { AppEnv } from './types.js'

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
  const app = await boot()

  const server = serve({ fetch: app.fetch, port: env.port, hostname: options.hostname }, (info) => {
    console.log(`mimir server 监听 http://localhost:${info.port}`)
    console.log(`  数据目录 ${env.dataDir}`)
    // 驱动与库位置必须打在启动日志里：「数据全空」时第一眼要看的就是这行
    // （DATABASE_URL 漏配会静默换到 SQLite 空库，TECH §10）
    console.log(
      dbDriver === 'postgres' ? `  数据库 postgres` : `  数据库 sqlite（${env.databaseFile}）`,
    )
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
