import { pathToFileURL } from 'node:url'
import type { ServerType } from '@hono/node-server'
import type { Hono } from 'hono'
import { loadRuntimeConfigFromEnv } from './runtime/config.js'
import { startRuntime } from './runtime/start.js'
import type { AppEnv } from './types.js'

export { closeDb } from './db/client.js'

/**
 * 兼容入口：已有宿主（桌面 `apps/desktop`、fnOS `launch.mjs`、Dockerfile）
 * 仍然 `import { startServer } from './dist/index.js'`，本文件保持它们的调用
 * 形状不变，内部转发到新的 `startRuntime()`。
 *
 * **新宿主不要用它**：`startRuntime()` 接收显式 `RuntimeConfig`，而这里为了
 * 兼容只能从 `process.env` 重新构造配置。等子任务 3/5 把桌面与 fnOS 都切到
 * runtime CLI 后，这个文件只剩 Docker 的旧 CMD 在用。
 */

export interface RunningServer {
  /** @hono/node-server 的句柄，`close()` 用于优雅关停 */
  server: ServerType
  app: Hono<AppEnv>
}

/**
 * 启动一个 mimir 服务端。
 *
 * `hostname` 是桌面端唯一需要的覆盖项：本地模式必须绑回环（D-100），
 * 而配置里的 listener 默认跟随 `HOST`。校验放在 `startRuntime()` **之前**：
 * 监听地址错误不该先跑一遍迁移与装配才报错。
 */
export async function startServer(options: { hostname?: string } = {}): Promise<RunningServer> {
  const config = loadRuntimeConfigFromEnv()

  if (config.listener.kind === 'unix') {
    if (options.hostname) {
      throw new Error('fnOS 模式只允许 Unix Socket，不接受 TCP 监听地址')
    }
  } else if (options.hostname) {
    if (config.auth.localToken && !isLoopback(options.hostname)) {
      throw new Error(`本地模式只允许监听回环地址，收到：${options.hostname}`)
    }
    config.listener.host = options.hostname
  }

  const handle = await startRuntime(config)

  // 旧入口的启动日志保持不变：Dockerfile 的 `node dist/index.js` 仍靠它看数据目录
  if (config.listener.kind === 'unix') {
    console.log(`mimir fnOS 网关监听 Unix Socket ${config.listener.path}（/app/mimir）`)
  } else {
    console.log(`mimir server 监听 ${handle.origin}`)
  }
  console.log(`  数据目录 ${config.dataDir}`)
  console.log(
    config.database.kind === 'postgres'
      ? '  数据库 postgres'
      : `  数据库 sqlite（${config.database.file}）`,
  )
  if (config.auth.localToken) {
    console.log('  本地模式：免登录（入口是宿主注入的本机令牌）；不对外监听')
  }

  return { server: handle.server, app: handle.app }
}

function isLoopback(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1'
}

/** CLI 直跑判定（与 migrate-cli.ts 同一模式）：dist 与 src 两种形态都成立 */
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
