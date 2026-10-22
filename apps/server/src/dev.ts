import { configureServer } from './config.js'
import { loadRuntimeConfigFromEnv, toServerConfig } from './runtime/config.js'
import { createStaticMiddleware } from './runtime/static.js'

/**
 * 开发入口。
 *
 * Vite 的 `@hono/vite-dev-server` 自己监听端口、把每个请求交给这里导出的
 * `app.fetch`，所以**不能**像生产入口那样再调一次 `serve()`——两个东西抢
 * 同一个端口，症状是 EADDRINUSE 而不是「谁赢了」。
 *
 * **顺序不能换**：`db/schema.ts` 在 import 时选方言，所以必须先
 * `configureServer()` 再动态 import `boot`。静态 import `boot` 会让 Vite 的
 * 模块图先加载 core，配置就晚了。
 *
 * 生产入口是 `src/index.ts`（兼容旧 CMD）与 `src/runtime/cli.ts`。
 */
const config = loadRuntimeConfigFromEnv()
configureServer(toServerConfig(config))

const { boot } = await import('./boot.js')

const staticMiddleware = config.static ? createStaticMiddleware(config.static) : undefined

export default await boot({
  staticMiddleware,
  corsOrigin: config.auth.fnosGateway ? undefined : config.webOrigin,
})
