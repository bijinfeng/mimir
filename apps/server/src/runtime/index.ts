/**
 * runtime 的公共入口。
 *
 * 宿主（Docker/fnOS/桌面 sidecar）只 import 这里；core 的模块不从这里出去，
 * 这样「配置 → 启动」的顺序只有一条实现，宿主不会绕过 RuntimeConfig 直接
 * import `boot` / `app`。
 */

export {
  collectSettingsEnv,
  loadRuntimeConfigFile,
  loadRuntimeConfigFromEnv,
  runtimeConfigSchema,
  toServerConfig,
  type LoadRuntimeConfigOptions,
  type RuntimeConfig,
  type RuntimeListener,
} from './config.js'
export { startRuntime, type RuntimeHandle } from './start.js'
export { DEV_PRODUCT_VERSION, PROTOCOL_VERSION, SHELL_ABI } from './version.js'
export type { RuntimeErrorCode, RuntimeErrorMessage, RuntimeReadyMessage } from './cli.js'
export type { ServerConfig } from '../config.js'
