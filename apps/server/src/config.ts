/**
 * ServerConfig：core 唯一认得的部署事实。
 *
 * 这个文件必须**中立**：
 *   - 不读 `process.env`
 *   - 不 import `runtime/`
 *   - 不 import `boot` / `app` / `db/schema`
 *
 * 宿主（Docker/fnOS/桌面）把平台事实翻译成 `RuntimeConfig`，runtime 再
 * `toServerConfig()` 后调用 `configureServer()`。core 只从这里取快照。
 *
 * `db/schema.ts` 在 import 时按方言选表对象，所以配置必须先于 core 模块加载：
 * runtime/dev/test setup 先 `configureServer()`，再动态 import core。
 */

import { isDeepStrictEqual } from 'node:util'

export type DatabaseConfig = { kind: 'sqlite'; file: string } | { kind: 'postgres'; url: string }

export interface ServerProduct {
  version: string
  /** HTTP/API 契约版本 */
  protocolVersion: number
  /** shell ↔ sidecar IPC/生命周期契约版本 */
  shellAbi: number
}

export interface ServerOwnerConfig {
  email: string
  password: string
}

export interface ServerAuthConfig {
  secret: string
  owner?: ServerOwnerConfig
  /** 桌面本地模式的每进程令牌；存在即本地模式 */
  localToken?: string
  /** fnOS 等无人值守部署：建号失败必须拒绝启动 */
  failClosedOwner?: boolean
  /** Better Auth baseURL；fnOS 走请求 Host 时为 undefined */
  baseURL?: string
  trustedOrigins: string[]
  cookiePath?: string
  /** 明确覆盖 cookie Secure；undefined 时按 nodeEnv 推断 */
  secureCookies?: boolean
}

export interface ServerMigrationsConfig {
  sqlite: string
  postgres: string
}

export interface ServerConfig {
  product: ServerProduct
  nodeEnv: 'production' | 'development' | 'test'
  dataDir: string
  /** 仓库根；测试/相对路径解析用，不参与业务 */
  repoRoot: string
  database: DatabaseConfig
  auth: ServerAuthConfig
  webOrigin?: string
  miniappEnabled?: boolean
  migrations: ServerMigrationsConfig
  /**
   * 设置层的环境变量快照（DB 行 > env > 默认）。
   *
   * core 不直接读 process.env；runtime 只把设置项可能用到的键放进来。
   */
  settingsEnv: Record<string, string | undefined>
}

let snapshot: ServerConfig | null = null

/**
 * 保存不可变快照。只能在 import core 之前调用。
 *
 * 同值重复调用是**幂等**的：测试的 `setupFiles` 配一次，随后 `startServer()` /
 * `startRuntime()` 又按同一份 env 配一次——两者必须能共存。内容不同则是编程
 * 错误（说明有模块在配置已生效后才试图改部署事实），直接抛错而不是静默覆盖。
 */
export function configureServer(next: ServerConfig): void {
  if (snapshot) {
    if (isDeepStrictEqual(snapshot, next)) return
    throw new Error(
      'configureServer 已用不同的配置调用过；测试若需要换配置，先 resetServerConfig() 并重新加载 core 模块',
    )
  }
  snapshot = Object.freeze({
    ...next,
    product: Object.freeze({ ...next.product }),
    database: Object.freeze({ ...next.database }),
    auth: Object.freeze({
      ...next.auth,
      ...(next.auth.owner ? { owner: Object.freeze({ ...next.auth.owner }) } : {}),
      // 复制一份而不是冻结：Better Auth 可能对 trustedOrigins 做规范化/追加，
      // 冻结它会变成第三方库里的 TypeError，而收益只是防住我们自己的代码
      trustedOrigins: [...next.auth.trustedOrigins],
    }),
    migrations: Object.freeze({ ...next.migrations }),
    settingsEnv: Object.freeze({ ...next.settingsEnv }),
  })
}

export function getServerConfig(): ServerConfig {
  if (!snapshot) throw new Error('configureServer() 尚未调用，core 不能读取部署配置')
  return snapshot
}

/** 只给测试用；不要在运行时调用。 */
export function resetServerConfig(): void {
  snapshot = null
}

export function isOwnerConfigured(): boolean {
  const owner = getServerConfig().auth.owner
  return Boolean(owner?.email && owner.password)
}

/**
 * 旧 `env.*` 调用的兼容面。
 *
 * 新代码优先用 `getServerConfig()` / `config.auth`。保留这些 getter 是为了让
 * 本子任务的迁移可以逐步进行；最终 `env.ts` 删除后，它们仍是 core 的唯一读取口。
 */
export const config = {
  get product() {
    return getServerConfig().product
  },
  get nodeEnv() {
    return getServerConfig().nodeEnv
  },
  get dataDir() {
    return getServerConfig().dataDir
  },
  get repoRoot() {
    return getServerConfig().repoRoot
  },
  get database() {
    return getServerConfig().database
  },
  get dbDriver(): 'postgres' | 'sqlite' {
    return getServerConfig().database.kind
  },
  get databaseUrl(): string {
    const database = getServerConfig().database
    return database.kind === 'postgres' ? database.url : `file:${database.file}`
  },
  get databaseFile(): string {
    const database = getServerConfig().database
    return database.kind === 'sqlite' ? database.file : ''
  },
  get auth() {
    return getServerConfig().auth
  },
  get authSecret(): string {
    return getServerConfig().auth.secret
  },
  get ownerEmail(): string {
    return getServerConfig().auth.owner?.email ?? ''
  },
  get ownerPassword(): string {
    return getServerConfig().auth.owner?.password ?? ''
  },
  get localMode(): boolean {
    return getServerConfig().auth.localToken !== undefined
  },
  get localToken(): string {
    return getServerConfig().auth.localToken ?? ''
  },
  get webOrigin(): string {
    return getServerConfig().webOrigin ?? 'http://localhost:5173'
  },
  get miniappEnabled(): boolean {
    return getServerConfig().miniappEnabled ?? false
  },
  get migrations() {
    return getServerConfig().migrations
  },
  get settingsEnv() {
    return getServerConfig().settingsEnv
  },
}
