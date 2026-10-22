import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadRuntimeConfigFile, loadRuntimeConfigFromEnv, type RuntimeConfig } from './config.js'
import { startRuntime, type RuntimeHandle } from './start.js'

/**
 * runtime 的进程入口。
 *
 * 三种宿主共用它：
 *   - Docker：`node dist/runtime/cli.js`（也兼容旧的 `node dist/index.js`）
 *   - fnOS：`launch.mjs` 读产物 manifest 后调用 `startRuntime()`（Unix Socket）
 *   - 桌面：`child_process.fork` 这个文件，用 IPC 收 ready（子任务 3）
 *
 * 输出契约（父进程/部署脚本只依赖这两条）：
 *   ready  `{ "type": "ready", "origin", "version", "protocolVersion", "shellAbi" }`
 *   error  `{ "type": "error", "code", "message" }`
 *
 * 有 IPC 时走 `process.send`；没有时 ready 打印到 stdout、**日志走 stderr**，
 * 这样 `docker logs` 里既有日志，`$(node ... | jq)` 也不会被普通日志污染。
 */

/** sidecar 父进程据此把错误翻译成可操作的文案；不要改已有值。 */
export type RuntimeErrorCode =
  | 'CONFIG_INVALID'
  | 'STATIC_MISSING'
  | 'PORT_IN_USE'
  | 'DB_LOCKED'
  | 'DB_UNAVAILABLE'
  | 'MIGRATION_FAILED'
  | 'NATIVE_MODULE_FAILED'
  | 'VERSION_MISMATCH'
  | 'BOOT_FAILED'
  | 'UNKNOWN'

export interface RuntimeReadyMessage {
  type: 'ready'
  origin: string
  version: string
  protocolVersion: number
  shellAbi: number
  pid: number
}

export interface RuntimeErrorMessage {
  type: 'error'
  code: RuntimeErrorCode
  message: string
}

type RuntimeMessage = RuntimeReadyMessage | RuntimeErrorMessage

function errorNumber(error: unknown): string | undefined {
  const candidate = error as { code?: unknown; errno?: unknown; cause?: { code?: unknown } }
  const code = candidate?.cause?.code ?? candidate?.code ?? candidate?.errno
  return typeof code === 'string' || typeof code === 'number' ? String(code) : undefined
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 把底层异常归到稳定枚举。父进程只认 code，不解析人类文案。 */
export function classifyRuntimeError(error: unknown): RuntimeErrorCode {
  const text = errorText(error)
  const code = errorNumber(error)
  if (text.includes('configureServer') || text.includes('环境变量') || text.includes('配置')) {
    return 'CONFIG_INVALID'
  }
  if (text.includes('manifest') || text.includes('版本不一致')) return 'VERSION_MISMATCH'
  if (code === 'EADDRINUSE') return 'PORT_IN_USE'
  if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED' || /database is locked/i.test(text)) {
    return 'DB_LOCKED'
  }
  if (code === 'MODULE_NOT_FOUND' || /\.node\b|sqlite-vec|jieba|NODE_MODULE_VERSION/i.test(text)) {
    return 'NATIVE_MODULE_FAILED'
  }
  if (
    /migration|migrate|drizzle|no such table|does not exist/i.test(text) &&
    !/connect|ECONNREFUSED|ENOTFOUND/i.test(text)
  ) {
    return 'MIGRATION_FAILED'
  }
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|connect/i.test(text)) return 'DB_UNAVAILABLE'
  if (/index\.html|WEB_DIST|静态资源/i.test(text)) return 'STATIC_MISSING'
  return 'BOOT_FAILED'
}

function writeMessage(message: RuntimeMessage): Promise<void> {
  if (typeof process.send === 'function') {
    return new Promise((resolve) => {
      try {
        process.send?.(message, () => resolve())
      } catch {
        resolve()
      }
    })
  }
  const line = `${JSON.stringify(message)}\n`
  return new Promise((resolve) => {
    if (message.type === 'ready') {
      process.stdout.write(line, () => resolve())
    } else {
      process.stderr.write(line, () => resolve())
    }
  })
}

/** 把普通日志赶到 stderr，stdout 只留给 ready 这一行。 */
function writeStderrLine(...values: unknown[]): void {
  const line = values.map((value) => (typeof value === 'string' ? value : String(value))).join(' ')
  process.stderr.write(`${line}\n`)
}

function redirectLogsToStderr(): void {
  console.log = writeStderrLine
  console.info = writeStderrLine
  console.debug = writeStderrLine
}

function parseConfigPath(argv: string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!
    if (argument === '--config') return argv[index + 1]
    if (argument.startsWith('--config=')) return argument.slice('--config='.length)
  }
  return undefined
}

function loadConfig(argv: string[]): RuntimeConfig {
  const path = parseConfigPath(argv)
  if (path) {
    if (!existsSync(path)) throw new Error(`配置文件不存在：${path}`)
    return loadRuntimeConfigFile(path)
  }
  return loadRuntimeConfigFromEnv()
}

interface RuntimeManifest {
  productVersion: string
  protocolVersion: number
  shellAbi: number
  web?: string
}

/**
 * 读取与 CLI 同级的 `manifest.json`（产物根 = dist/runtime 的上两级）。
 *
 * 源码/仓库内 dist 没有 manifest，返回 null；打包产物必须以 manifest 为准：
 *   - productVersion 覆盖 `MIMIR_VERSION`/开发默认值，`/healthz` 与宿主握手一致
 *   - protocolVersion/shellAbi 与二进制常量不一致时拒绝启动（产物拼错）
 *   - web 目录自动成为静态资源根，Docker 不需要再设 `WEB_DIST`
 */
async function applyPackagedManifest(config: RuntimeConfig): Promise<void> {
  const runtimeRoot = resolve(import.meta.dirname, '../..')
  const manifestPath = join(runtimeRoot, 'manifest.json')
  let raw: string
  try {
    raw = await readFile(manifestPath, 'utf8')
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return
    throw error
  }

  let manifest: RuntimeManifest
  try {
    manifest = JSON.parse(raw) as RuntimeManifest
  } catch {
    throw new Error(`runtime manifest 不是合法 JSON：${manifestPath}`)
  }
  if (typeof manifest.productVersion !== 'string' || !manifest.productVersion) {
    throw new Error(`runtime manifest 缺少 productVersion：${manifestPath}`)
  }
  if (
    manifest.protocolVersion !== config.product.protocolVersion ||
    manifest.shellAbi !== config.product.shellAbi
  ) {
    throw new Error(
      `runtime manifest 与二进制版本不一致：manifest ${manifest.protocolVersion}/${manifest.shellAbi}，` +
        `二进制 ${config.product.protocolVersion}/${config.product.shellAbi}`,
    )
  }

  config.product.version = manifest.productVersion
  if (!config.static && typeof manifest.web === 'string' && manifest.web) {
    config.static = { dir: resolve(runtimeRoot, manifest.web), basePath: '/' }
  }
}

function assertStaticPresent(config: RuntimeConfig): void {
  if (!config.static) return
  if (!existsSync(join(config.static.dir, 'index.html'))) {
    throw new Error(
      `静态资源目录缺少 index.html：${config.static.dir}（检查 WEB_DIST / 运行时产物布局）`,
    )
  }
}

async function main(): Promise<void> {
  redirectLogsToStderr()

  let handle: RuntimeHandle | null = null
  let stopping = false

  const stop = async (reason: string): Promise<void> => {
    if (stopping) {
      // 第二次信号：不再等 I/O，直接退出。容器里这是 `docker stop` 超时后的常态
      process.exit(1)
    }
    stopping = true
    console.log(`[runtime] 收到 ${reason}，正在关停`)
    try {
      await handle?.close()
    } catch (error) {
      console.error('[runtime] 关停失败：', error)
      process.exitCode = 1
    }
    process.exit(process.exitCode ?? 0)
  }

  process.once('SIGTERM', () => void stop('SIGTERM'))
  process.once('SIGINT', () => void stop('SIGINT'))
  // fork 的父进程消失时 IPC 会断开；没有这条，sidecar 会变成孤儿进程
  process.once('disconnect', () => void stop('父进程断开'))

  const fail = async (error: unknown): Promise<never> => {
    const code = classifyRuntimeError(error)
    const errorMessage: RuntimeErrorMessage = {
      type: 'error',
      code,
      message: errorText(error),
    }
    console.error(`[runtime] 启动失败（${code}）：`, error)
    await writeMessage(errorMessage)
    process.exit(1)
  }

  process.once('uncaughtException', (error) => void fail(error))
  process.once('unhandledRejection', (error) => void fail(error))

  const config = await (async (): Promise<RuntimeConfig> => {
    try {
      // 配置错误必须归到 CONFIG_INVALID：父进程据此显示「检查配置」而不是「未知崩溃」
      return loadConfig(process.argv.slice(2))
    } catch (error) {
      await fail(new Error(`配置无效：${errorText(error)}`, { cause: error }))
    }
    // `fail` 已 process.exit；这行只是让 TS 看见「永不返回」
    throw new Error('unreachable')
  })()
  // 显式 --config 由宿主提供全部事实；env 路径才从产物 manifest 补版本/静态目录
  if (!parseConfigPath(process.argv.slice(2))) await applyPackagedManifest(config)

  try {
    // 静态目录缺失是部署/产物问题，不是配置语法问题；单独归到 STATIC_MISSING
    assertStaticPresent(config)
  } catch (error) {
    await fail(error)
  }

  try {
    handle = await startRuntime(config)
  } catch (error) {
    await fail(error)
  }
  if (!handle) throw new Error('startRuntime 未返回句柄')

  const ready: RuntimeReadyMessage = {
    type: 'ready',
    origin: handle.origin,
    version: config.product.version,
    protocolVersion: config.product.protocolVersion,
    shellAbi: config.product.shellAbi,
    pid: process.pid,
  }
  await writeMessage(ready)

  if (config.listener.kind === 'unix') {
    console.log(`mimir runtime 监听 Unix Socket ${config.listener.path}`)
  } else {
    console.log(`mimir runtime 监听 ${handle.origin}`)
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
}

const invokedDirectly = (() => {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return import.meta.url === pathToFileURL(entry).href
  } catch {
    return false
  }
})()

if (invokedDirectly) {
  await main()
}
