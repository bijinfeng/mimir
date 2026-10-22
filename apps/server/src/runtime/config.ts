import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { ServerAuthConfig, ServerConfig, ServerMigrationsConfig } from '../config.js'
import { DEV_PRODUCT_VERSION, PROTOCOL_VERSION, SHELL_ABI } from './version.js'

/**
 * RuntimeConfig：宿主交给 runtime 的**可序列化**部署事实。
 *
 * 它比 `ServerConfig` 多两类东西：
 *   - 进程/监听/静态资源：只有 runtime 需要
 *   - 平台方言（`fnosGateway`）：runtime 翻译成 Better Auth 的通用字段后，
 *     core 看不到 fnOS
 *
 * 这个文件可以读 process.env / 读 JSON；core 不可以。
 */

const productSchema = z.object({
  version: z.string().min(1),
  protocolVersion: z.number().int().positive(),
  shellAbi: z.number().int().positive(),
})

const databaseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('sqlite'), file: z.string().min(1) }),
  z.object({ kind: z.literal('postgres'), url: z.string().min(1) }),
])

const listenerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('tcp'),
    /** undefined = 交给 @hono/node-server 的默认绑定（所有接口） */
    host: z.string().min(1).optional(),
    port: z.number().int().min(0).max(65535),
  }),
  z.object({ kind: z.literal('unix'), path: z.string().min(1) }),
])

const authSchema = z.object({
  secret: z.string().min(1),
  owner: z
    .object({
      email: z.string().min(1),
      password: z.string().min(8),
    })
    .optional(),
  localToken: z.string().min(1).optional(),
  failClosedOwner: z.boolean().optional(),
  /**
   * Better Auth 的 `baseURL`。fnOS 走请求 Host（网关前缀由 cookiePath 表达），
   * 因此那里显式不设；普通部署指向 publicUrl。
   */
  baseURL: z.string().min(1).optional(),
  fnosGateway: z.object({ basePath: z.string().min(1) }).optional(),
  trustedOrigins: z.array(z.string()),
  cookiePath: z.string().min(1).optional(),
  secureCookies: z.boolean().optional(),
})

const staticSchema = z.object({
  dir: z.string().min(1),
  basePath: z.string().min(1),
})

export const runtimeConfigSchema = z.object({
  product: productSchema,
  nodeEnv: z.enum(['production', 'development', 'test']),
  dataDir: z.string().min(1),
  repoRoot: z.string().min(1),
  database: databaseSchema,
  listener: listenerSchema,
  publicUrl: z.string().min(1),
  webOrigin: z.string().min(1).optional(),
  auth: authSchema,
  static: staticSchema.optional(),
  migrations: z.object({
    sqlite: z.string().min(1),
    postgres: z.string().min(1),
  }),
  miniappEnabled: z.boolean().optional(),
  settingsEnv: z.record(z.string(), z.string().optional()),
})

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>
export type RuntimeListener = RuntimeConfig['listener']

export interface LoadRuntimeConfigOptions {
  /** 产物根（含 drizzle 迁移目录与 dist）；默认从本文件向上两级 */
  serverRoot?: string
  /** 测试/宿主显式传入的环境；默认 process.env */
  env?: NodeJS.ProcessEnv
  /** 是否尝试加载仓库根 .env（默认只在 env 是 process.env 时） */
  loadEnvFile?: boolean
}

/** 与本文件同深度：src/runtime → apps/server；dist/runtime → 产物根。 */
export function defaultServerRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../..')
}

function findRepoRoot(start: string): string {
  let current = start
  while (true) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) return current
    const parent = dirname(current)
    if (parent === current) return process.cwd()
    current = parent
  }
}

function loadDotEnv(repoRoot: string): void {
  try {
    process.loadEnvFile(resolve(repoRoot, '.env'))
  } catch {
    // 没有 .env：生产环境通常直接注入 env
  }
}

function resolvePath(value: string, repoRoot: string): string {
  return isAbsolute(value) ? value : resolve(repoRoot, value)
}

function required(name: string, env: NodeJS.ProcessEnv, fallback?: string): string {
  const value = env[name] ?? fallback
  if (!value) throw new Error(`缺少环境变量 ${name}`)
  return value
}

function parseDatabase(raw: string, repoRoot: string): RuntimeConfig['database'] {
  if (/^postgres(ql)?:\/\//.test(raw)) return { kind: 'postgres', url: raw }
  const file = raw.startsWith('file:') ? raw.slice('file:'.length) : raw
  if (!file) throw new Error('DATABASE_URL 不能被解析为 SQLite 文件')
  return { kind: 'sqlite', file: resolvePath(file, repoRoot) }
}

function normalizeBasePath(raw: string, name: string): string {
  if (raw === '/') return '/'
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('..') || raw.includes('//')) {
    throw new Error(`${name} 必须是 / 或 /segment 形式，收到：${raw}`)
  }
  const trimmed = raw.replace(/\/+$/, '')
  if (trimmed === '') return '/'
  if (!/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/.test(trimmed)) {
    throw new Error(`${name} 含非法字符：${raw}`)
  }
  return trimmed
}

function isLoopback(host: string | undefined): boolean {
  if (!host) return false
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

export function collectSettingsEnv(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const prefixes = ['MODEL_', 'CAPTURE_', 'RETRIEVAL_', 'STORAGE_', 'S3_']
  const result: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(env)) {
    if (
      key === 'TZ' ||
      key === 'GITHUB_TOKEN' ||
      prefixes.some((prefix) => key.startsWith(prefix))
    ) {
      result[key] = value
    }
  }
  return result
}

function resolveMigrations(serverRoot: string): ServerMigrationsConfig {
  return {
    sqlite: resolve(serverRoot, 'drizzle-sqlite'),
    postgres: resolve(serverRoot, 'drizzle'),
  }
}

/**
 * 从进程环境构造 RuntimeConfig。这是旧 `env.ts` 的唯一替代。
 *
 * 校验规则保持原样：生产 AUTH_SECRET 不能是默认值；owner 两个变量必须同时有；
 * 本地模式必须有 token 且只能绑回环；fnOS 必须 SQLite + owner + `/app/mimir`。
 */
export function loadRuntimeConfigFromEnv(options: LoadRuntimeConfigOptions = {}): RuntimeConfig {
  const env = options.env ?? process.env
  const serverRoot = options.serverRoot ?? defaultServerRoot()
  const repoRoot = findRepoRoot(serverRoot)
  if (options.loadEnvFile ?? env === process.env) loadDotEnv(repoRoot)

  const nodeEnvRaw = env.NODE_ENV ?? 'development'
  if (!['production', 'development', 'test'].includes(nodeEnvRaw)) {
    throw new Error(`NODE_ENV 只能是 production/development/test，收到：${nodeEnvRaw}`)
  }
  const nodeEnv = nodeEnvRaw as RuntimeConfig['nodeEnv']

  const dataDir = resolvePath(env.DATA_DIR ?? './data', repoRoot)
  mkdirSync(dataDir, { recursive: true })

  const database = parseDatabase(env.DATABASE_URL ?? 'file:./data/mimir.db', repoRoot)

  const fnosSocket = env.MIMIR_FNOS_SOCKET ?? ''
  const fnosBasePath = normalizeBasePath(env.MIMIR_BASE_PATH ?? '/app/mimir', 'MIMIR_BASE_PATH')
  const port = Number(env.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT 必须是 0-65535 的整数，收到：${env.PORT}`)
  }

  const localMode = env.MIMIR_LOCAL_MODE === '1'
  const localToken = env.MIMIR_LOCAL_TOKEN ?? ''
  if (localMode && !localToken) {
    throw new Error(
      '本地模式（MIMIR_LOCAL_MODE=1）必须同时设置 MIMIR_LOCAL_TOKEN。' +
        '它由桌面宿主每次启动随机生成并注入，不要手工填。',
    )
  }

  const ownerEmail = env.OWNER_EMAIL ?? ''
  const ownerPassword = env.OWNER_PASSWORD ?? ''
  if (Boolean(ownerEmail) !== Boolean(ownerPassword)) {
    throw new Error(
      `所有者账号配置不完整：设了 ${ownerEmail ? 'OWNER_EMAIL' : 'OWNER_PASSWORD'} 但缺少 ${
        ownerEmail ? 'OWNER_PASSWORD' : 'OWNER_EMAIL'
      }。两个都要设，或者都不设。`,
    )
  }
  if (ownerPassword && ownerPassword.length < 8) {
    throw new Error('OWNER_PASSWORD 至少 8 位（与登录页的校验一致）')
  }

  // 空字符串按「没设」处理：compose 里 `AUTH_SECRET=` 很常见，静默接受空密钥
  // 会让 Better Auth 用空串签名（启动不报错，会话却不可信）
  const configuredSecret = env.AUTH_SECRET?.trim()
  const authSecret = configuredSecret
    ? configuredSecret
    : nodeEnv === 'production'
      ? required('AUTH_SECRET', env)
      : 'dev-only-insecure-secret-change-me'
  if (nodeEnv === 'production' && authSecret === 'dev-only-insecure-secret-change-me') {
    throw new Error('生产环境必须设置 AUTH_SECRET（openssl rand -base64 32）')
  }

  if (fnosSocket) {
    if (!isAbsolute(fnosSocket)) throw new Error('MIMIR_FNOS_SOCKET 必须是绝对路径')
    if (fnosBasePath !== '/app/mimir') throw new Error('fnOS 网关路径必须是 /app/mimir')
    if (localMode) throw new Error('fnOS 模式不能启用桌面本地免登录模式')
    if (database.kind !== 'sqlite') throw new Error('fnOS 模式必须使用 SQLite 数据库')
    if (!ownerEmail || !ownerPassword)
      throw new Error('fnOS 模式必须配置 OWNER_EMAIL 和 OWNER_PASSWORD')
  }

  if (localMode) {
    if (fnosSocket) throw new Error('fnOS 模式不能启用桌面本地免登录模式')
    const host = env.HOST ?? '127.0.0.1'
    if (!isLoopback(host)) {
      throw new Error(`本地模式只允许监听回环地址，收到：${host}`)
    }
  }

  const publicUrl = env.SERVER_URL ?? `http://localhost:${port}`
  const webOrigin = env.WEB_ORIGIN ?? 'http://localhost:5173'
  const staticDir = env.WEB_DIST
  const basePath = normalizeBasePath(env.MIMIR_BASE_PATH ?? '/', 'MIMIR_BASE_PATH')

  const listenHost = env.HOST ?? (localMode ? '127.0.0.1' : undefined)
  const listener: RuntimeListener = fnosSocket
    ? { kind: 'unix', path: fnosSocket }
    : {
        kind: 'tcp',
        ...(listenHost ? { host: listenHost } : {}),
        port,
      }

  const config: RuntimeConfig = {
    product: {
      version: env.MIMIR_VERSION ?? DEV_PRODUCT_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      shellAbi: SHELL_ABI,
    },
    nodeEnv,
    dataDir,
    repoRoot,
    database,
    listener,
    publicUrl,
    webOrigin,
    auth: {
      secret: authSecret,
      ...(ownerEmail && ownerPassword
        ? { owner: { email: ownerEmail, password: ownerPassword } }
        : {}),
      ...(localMode ? { localToken } : {}),
      ...(fnosSocket ? { fnosGateway: { basePath: fnosBasePath } } : {}),
      ...(fnosSocket ? {} : { baseURL: publicUrl }),
      trustedOrigins: fnosSocket ? [] : [webOrigin],
      ...(fnosSocket ? { cookiePath: fnosBasePath } : {}),
      secureCookies: fnosSocket ? false : nodeEnv === 'production',
      ...(fnosSocket ? { failClosedOwner: true } : {}),
    },
    ...(staticDir ? { static: { dir: resolvePath(staticDir, repoRoot), basePath } } : {}),
    migrations: resolveMigrations(serverRoot),
    miniappEnabled: env.MIMIR_MINIAPP_ENABLED === '1',
    settingsEnv: collectSettingsEnv(env),
  }

  return runtimeConfigSchema.parse(config)
}

/** 供桌面/fnOS 的 JSON 配置使用。文件由宿主以 0600 写入。 */
export function loadRuntimeConfigFile(path: string): RuntimeConfig {
  const raw = readFileSync(path, 'utf8')
  return runtimeConfigSchema.parse(JSON.parse(raw))
}

/**
 * 把 RuntimeConfig 翻译成 core 唯一认得的 ServerConfig。
 *
 * fnOS 的 gateway 在这里被翻译成 Better Auth 的通用字段；core 不 import
 * `fnosGateway`，也不知道 fnOS 的存在。
 */
export function toServerConfig(config: RuntimeConfig): ServerConfig {
  const auth: ServerAuthConfig = {
    secret: config.auth.secret,
    ...(config.auth.owner ? { owner: config.auth.owner } : {}),
    ...(config.auth.localToken ? { localToken: config.auth.localToken } : {}),
    ...(config.auth.failClosedOwner ? { failClosedOwner: true } : {}),
    ...(config.auth.baseURL !== undefined ? { baseURL: config.auth.baseURL } : {}),
    trustedOrigins: config.auth.trustedOrigins,
    ...(config.auth.cookiePath ? { cookiePath: config.auth.cookiePath } : {}),
    ...(config.auth.secureCookies !== undefined
      ? { secureCookies: config.auth.secureCookies }
      : {}),
  }

  return {
    product: config.product,
    nodeEnv: config.nodeEnv,
    dataDir: config.dataDir,
    repoRoot: config.repoRoot,
    database: config.database,
    auth,
    ...(config.webOrigin ? { webOrigin: config.webOrigin } : {}),
    ...(config.miniappEnabled !== undefined ? { miniappEnabled: config.miniappEnabled } : {}),
    migrations: config.migrations,
    settingsEnv: config.settingsEnv,
  }
}
