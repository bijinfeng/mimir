/**
 * 每个测试文件加载 core 之前的配置装配。
 *
 * `db/schema.ts` 在 import 时按方言选表对象，所以**配置必须先于任何 core
 * 模块加载**。Vitest 的 `setupFiles` 正好在这个边界上运行：它在测试文件的
 * import 之前执行，且每个文件一份模块图。
 *
 * 这里显式 `loadRuntimeConfigFromEnv()`（与旧 `env.ts` 同一份 env 映射），
 * 再由 `ensureServerRuntime()` 建好 DB 与 Better Auth——`helpers.ts` 顶层
 * `createApp()` 因此不需要知道配置从哪来。
 */
import { configureServer } from '../config.js'
import { loadRuntimeConfigFromEnv, toServerConfig } from '../runtime/config.js'

configureServer(toServerConfig(loadRuntimeConfigFromEnv()))

const { ensureServerRuntime } = await import('../server-runtime.js')
ensureServerRuntime()
