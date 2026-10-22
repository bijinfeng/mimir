import { fork, spawnSync, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createWriteStream, type WriteStream } from 'node:fs'
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { readRuntimeManifest, type RuntimeManifest } from './runtime-manifest.js'

/**
 * 桌面本地模式的 sidecar。
 *
 * Electron 主进程不再 import 服务端：它只写一份 0600 配置文件，`fork` runtime
 * 入口，等 IPC `ready`，然后把页面指向 `http://127.0.0.1:<port>`。这样：
 *   - 服务端崩溃/重启不会带走窗口（主进程只负责监听 exit）
 *   - Electron 的 V8/Node 版本与 runtime 解耦，原生模块由 runtime 自己加载
 *   - 令牌、AUTH_SECRET、owner 密码都只存在 0600 文件里，不进 argv/env/日志
 *
 * 这个文件不 import `electron`，所以可以在纯 Node 测试里用真实 fork 跑。
 */

export interface SidecarPaths {
  /** runtime 产物根（打包后 resources/server；开发时 apps/desktop/runtime-build） */
  runtimeRoot: string
  /** 渲染进程产物（dist/renderer）；sidecar 的静态资源根 */
  webDist: string
  /** userData/data */
  dataDir: string
  /** userData；配置、日志放在这里 */
  userData: string
}

export interface SidecarConfig {
  product: { version: string; protocolVersion: number; shellAbi: number }
  nodeEnv: 'production'
  dataDir: string
  repoRoot: string
  database: { kind: 'sqlite'; file: string }
  listener: { kind: 'tcp'; host: '127.0.0.1'; port: number }
  publicUrl: string
  webOrigin: string
  auth: {
    secret: string
    localToken?: string
    baseURL: string
    trustedOrigins: string[]
    secureCookies: false
  }
  static: { dir: string; basePath: string }
  migrations: { sqlite: string; postgres: string }
  miniappEnabled: false
  settingsEnv: Record<string, string>
}

export interface SidecarHandle {
  origin: string
  port: number
  /** sidecar 进程 pid；日志/诊断/烟测用 */
  pid: number
  dataDir: string
  localToken: string | null
  /** 关停：IPC shutdown → SIGTERM → SIGKILL；幂等 */
  close(): Promise<void>
  /** runtime 在 ready 之后异常退出时触发；返回取消订阅函数。 */
  onUnexpectedExit(listener: (error: Error) => void): () => void
}

export interface StartSidecarOptions {
  /** 客户端版本；必须与产物 manifest 的 productVersion 一致 */
  productVersion: string
  localMode?: boolean
  /** 测试注入；生产用 child_process.fork */
  spawn?: typeof fork
}

interface ReadyMessage {
  type: 'ready'
  origin: string
  version: string
  protocolVersion: number
  shellAbi: number
  pid: number
}

interface ErrorMessage {
  type: 'error'
  code?: string
  message: string
}

/** 父进程用于把 code 变成可操作文案；stderr 只进日志。 */
export function runtimeErrorText(code: string | undefined, message: string): string {
  const suffix = message ? `\n\n${message}` : ''
  switch (code) {
    case 'PORT_IN_USE':
      return `本地端口被占用，已重试仍失败。请关闭占用该端口的程序后重试。${suffix}`
    case 'DB_LOCKED':
      return `本地数据库被另一个进程占用。请关闭其它 mimir 窗口后重试。${suffix}`
    case 'DB_UNAVAILABLE':
      return `无法打开本地数据库。请检查磁盘空间与数据目录权限。${suffix}`
    case 'MIGRATION_FAILED':
      return `数据库迁移失败。请备份数据目录后重试。${suffix}`
    case 'CONFIG_INVALID':
      return `本地服务配置无效。请重新启动客户端；仍失败请查看 runtime.log。${suffix}`
    case 'NATIVE_MODULE_FAILED':
      return `本地服务缺少原生模块。请重新安装客户端。${suffix}`
    case 'STATIC_MISSING':
      return `客户端界面资源不完整。请重新安装客户端。${suffix}`
    case 'VERSION_MISMATCH':
      return `客户端与本地服务版本不匹配。请重新安装或更新客户端。${suffix}`
    default:
      return `本地服务启动失败。${suffix}`
  }
}

export function buildSidecarConfig(input: {
  port: number
  productVersion: string
  protocolVersion: number
  shellAbi: number
  dataDir: string
  runtimeRoot: string
  webDist: string
  authSecret: string
  localToken?: string
}): SidecarConfig {
  const origin = `http://127.0.0.1:${input.port}`
  return {
    product: {
      version: input.productVersion,
      protocolVersion: input.protocolVersion,
      shellAbi: input.shellAbi,
    },
    nodeEnv: 'production',
    dataDir: input.dataDir,
    repoRoot: input.runtimeRoot,
    database: { kind: 'sqlite', file: path.join(input.dataDir, 'mimir.db') },
    listener: { kind: 'tcp', host: '127.0.0.1', port: input.port },
    publicUrl: origin,
    webOrigin: origin,
    auth: {
      secret: input.authSecret,
      ...(input.localToken ? { localToken: input.localToken } : {}),
      baseURL: origin,
      trustedOrigins: [origin],
      secureCookies: false,
    },
    static: { dir: input.webDist, basePath: '/' },
    migrations: {
      sqlite: path.join(input.runtimeRoot, 'drizzle-sqlite'),
      postgres: path.join(input.runtimeRoot, 'drizzle'),
    },
    miniappEnabled: false,
    settingsEnv: {},
  }
}

/** 原子写 0600：临时文件 + rename；目录 0700。 */
export async function writeSidecarConfig(configPath: string, config: SidecarConfig): Promise<void> {
  const directory = path.dirname(configPath)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700).catch(() => {})
  const temporary = `${configPath}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`
  try {
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
    await chmod(temporary, 0o600)
    await rename(temporary, configPath)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

/**
 * 子进程环境：保留 OS 必需项，删掉所有可能带凭据的变量。
 *
 * 这不是「防本机攻击者」——同机进程本来就能读文件；它防的是**意外泄漏**：
 * 子进程崩溃时 Electron 把 env 写进日志、或者某个第三方库打印 process.env。
 */
export function minimalSidecarEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...base }
  for (const key of Object.keys(env)) {
    if (
      key.startsWith('MIMIR_') ||
      key.startsWith('MODEL_') ||
      key.startsWith('S3_') ||
      key.startsWith('OWNER_') ||
      key === 'AUTH_SECRET' ||
      key === 'DATABASE_URL' ||
      key === 'WEB_DIST' ||
      key === 'SERVER_URL' ||
      key === 'WEB_ORIGIN'
    ) {
      delete env[key]
    }
  }
  env.NODE_ENV = 'production'
  env.ELECTRON_RUN_AS_NODE = '1'
  return env
}

export function pickFreePort(hostname = '127.0.0.1'): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, hostname, () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close(() => reject(new Error('无法获取空闲端口')))
        return
      }
      probe.close(() => resolve(address.port))
    })
  })
}

/** 读取或生成宿主的 AUTH_SECRET（0600）。必须持久化，否则重启后所有会话失效。 */
export async function ensureAuthSecret(dataDir: string): Promise<string> {
  const secretPath = path.join(dataDir, 'auth-secret')
  try {
    const existing = (await readFile(secretPath, 'utf8')).trim()
    if (existing.length >= 32) return existing
  } catch {
    // 首次启动
  }
  const secret = randomBytes(32).toString('base64')
  await writeFile(secretPath, `${secret}\n`, { mode: 0o600 })
  await chmod(secretPath, 0o600).catch(() => {})
  return secret
}

/** 5 MB 轮转；返回当前日志路径。 */
export async function rotateRuntimeLog(userData: string): Promise<string> {
  const directory = path.join(userData, 'logs')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const file = path.join(directory, 'runtime.log')
  try {
    const info = await stat(file)
    if (info.size > 5 * 1024 * 1024) {
      const previous = `${file}.1`
      await rm(previous, { force: true })
      await rename(file, previous)
    }
    await chmod(file, 0o600).catch(() => {})
  } catch {
    // 首次启动
  }
  return file
}

function childExit(
  child: ChildProcess,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode })
  }
  return new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })))
}

/** Windows 下 child.kill 只结束直接子进程；runtime 还会派生 worker，用 taskkill /T 兜底。 */
function killProcessTree(child: ChildProcess): void {
  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  child.kill('SIGKILL')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitUntil(childExitPromise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  return Promise.race([childExitPromise.then(() => true), sleep(timeoutMs).then(() => false)])
}

export async function startSidecar(
  paths: SidecarPaths,
  options: StartSidecarOptions,
): Promise<SidecarHandle> {
  const manifest: RuntimeManifest = await readRuntimeManifest(paths.runtimeRoot, {
    productVersion: options.productVersion,
  })
  const entry = path.join(paths.runtimeRoot, manifest.entry)
  const configPath = path.join(paths.userData, 'runtime-config.json')
  const logPath = await rotateRuntimeLog(paths.userData)
  const log: WriteStream = createWriteStream(logPath, { flags: 'a', mode: 0o600 })

  await mkdir(paths.dataDir, { recursive: true, mode: 0o700 })
  await chmod(paths.dataDir, 0o700).catch(() => {})
  try {
    const info = await stat(path.join(paths.webDist, 'index.html'))
    if (!info.isFile()) throw new Error('静态入口不是文件')
  } catch {
    log.end()
    throw new Error(`客户端界面资源不完整：${path.join(paths.webDist, 'index.html')}`)
  }

  const authSecret = await ensureAuthSecret(paths.dataDir)
  const spawn = options.spawn ?? fork
  const localToken = options.localMode === false ? null : randomBytes(24).toString('base64url')

  let lastError: Error & { code?: string } = new Error('sidecar 未启动')
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const port = await pickFreePort()
    const config = buildSidecarConfig({
      port,
      productVersion: options.productVersion,
      protocolVersion: manifest.protocolVersion,
      shellAbi: manifest.shellAbi,
      dataDir: paths.dataDir,
      runtimeRoot: paths.runtimeRoot,
      webDist: paths.webDist,
      authSecret,
      ...(localToken ? { localToken } : {}),
    })
    await writeSidecarConfig(configPath, config)

    const child = spawn(entry, ['--config', configPath], {
      execPath: process.execPath,
      env: minimalSidecarEnv(),
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
    })
    const exitPromise = childExit(child)
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => log.write(`[runtime] ${chunk.toString()}`))
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr = (stderr + text).slice(-4096)
      log.write(`[runtime] ${text}`)
    })

    const outcome = await new Promise<
      | { kind: 'ready'; message: ReadyMessage }
      | { kind: 'failed'; error: Error & { code?: string } }
    >((resolve) => {
      let settled = false
      const finish = (
        value:
          | {
              kind: 'ready'
              message: ReadyMessage
            }
          | {
              kind: 'failed'
              error: Error & { code?: string }
            },
      ) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      }
      const timer = setTimeout(() => {
        const error = Object.assign(new Error(`本地服务在 20000ms 内未就绪`), {
          code: 'START_TIMEOUT',
        })
        finish({ kind: 'failed', error })
      }, 20_000)

      child.on('message', (raw) => {
        const message = raw as ReadyMessage | ErrorMessage
        if (message?.type === 'ready') {
          finish({ kind: 'ready', message })
        } else if (message?.type === 'error') {
          finish({
            kind: 'failed',
            error: Object.assign(new Error(message.message), {
              code: message.code ?? 'BOOT_FAILED',
            }),
          })
        }
      })
      child.once('error', (error) => finish({ kind: 'failed', error }))
      void exitPromise.then(({ code, signal }) => {
        const error = Object.assign(
          new Error(
            `本地服务在就绪前退出（code=${code ?? 'null'} signal=${signal ?? 'null'}）` +
              (stderr ? `\n${stderr}` : ''),
          ),
          { code: 'RUNTIME_EXITED' },
        )
        finish({ kind: 'failed', error })
      })
    })

    if (outcome.kind === 'ready') {
      const ready = outcome.message
      if (ready.version !== manifest.productVersion) {
        child.kill('SIGTERM')
        log.end()
        throw new Error(
          `runtime ready 版本不匹配：期望 ${manifest.productVersion}，实际 ${String(ready.version)}`,
        )
      }
      if (
        ready.protocolVersion !== manifest.protocolVersion ||
        ready.shellAbi !== manifest.shellAbi
      ) {
        child.kill('SIGTERM')
        log.end()
        throw new Error(
          `runtime ready 契约不匹配：manifest ${manifest.protocolVersion}/${manifest.shellAbi}，` +
            `ready ${String(ready.protocolVersion)}/${String(ready.shellAbi)}`,
        )
      }
      let origin: URL
      try {
        origin = new URL(ready.origin)
      } catch {
        child.kill('SIGTERM')
        log.end()
        throw new Error(`runtime ready 的 origin 不合法：${String(ready.origin)}`)
      }
      if (origin.hostname !== '127.0.0.1' || origin.port !== String(port)) {
        child.kill('SIGTERM')
        log.end()
        throw new Error(`runtime 绑定到意外的地址：${ready.origin}`)
      }

      let stopping = false
      const exitListeners = new Set<(error: Error) => void>()
      void exitPromise.then(({ code, signal }) => {
        if (stopping) return
        const error = new Error(
          `本地服务意外退出（code=${code ?? 'null'} signal=${signal ?? 'null'}）`,
        )
        for (const listener of exitListeners) listener(error)
      })

      let closing: Promise<void> | null = null
      return {
        origin: ready.origin,
        port,
        pid: child.pid ?? -1,
        dataDir: paths.dataDir,
        localToken,
        onUnexpectedExit(listener) {
          exitListeners.add(listener)
          return () => exitListeners.delete(listener)
        },
        close() {
          closing ??= (async () => {
            stopping = true
            if (child.exitCode === null && child.signalCode === null) {
              try {
                child.send({ type: 'shutdown' }, () => {})
              } catch {
                // IPC 已断开：下面直接走信号
              }
              if (!(await waitUntil(exitPromise, 5000))) {
                child.kill('SIGTERM')
                if (!(await waitUntil(exitPromise, 2000))) {
                  killProcessTree(child)
                  await waitUntil(exitPromise, 1000)
                }
              }
            }
            log.end()
          })()
          return closing
        },
      }
    }

    lastError = outcome.error
    log.write(
      `[desktop] sidecar 启动失败（${outcome.error.code ?? 'unknown'}）：${outcome.error.message}\n`,
    )
    child.kill('SIGTERM')
    await waitUntil(exitPromise, 1000)
    if (outcome.error.code === 'PORT_IN_USE' && attempt < 2) {
      await sleep(attempt === 0 ? 1000 : 3000)
      continue
    }
    log.end()
    throw new Error(runtimeErrorText(outcome.error.code, outcome.error.message), {
      cause: outcome.error,
    })
  }

  log.end()
  throw new Error(runtimeErrorText(lastError.code, lastError.message), { cause: lastError })
}
