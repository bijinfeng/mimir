import { createAuth, isAuthConfigured, setAuth } from './auth.js'
import { getServerConfig } from './config.js'
import { configureDb, isDbConfigured } from './db/client.js'

/**
 * core 的一次性运行时装配：DB client + Better Auth。
 *
 * 为什么不放在 `boot()` 里：
 *   - 测试的 `helpers.ts` 在模块顶层 `createApp()`，没有经过 boot
 *   - `createApp()` 也可能被脚本直接调用
 * 两处都需要“配置已就绪、连接/认证已创建”的状态。
 *
 * 这个文件属于 core：不 import `runtime/`，也不读 process.env。
 * 调用顺序必须是 `configureServer()` 之后；否则 `db/schema.ts` 已经选错方言。
 */
export function ensureServerRuntime(): void {
  const config = getServerConfig()

  if (!isDbConfigured()) configureDb(config.database)
  if (!isAuthConfigured()) setAuth(createAuth(config))
}
