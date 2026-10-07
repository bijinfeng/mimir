import { mkdir, readFile, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomBytes } from 'node:crypto'
/**
 * 桌面端私有宿主（D-046，借鉴 deepseek-harness 的 host/carrier 分层）。
 *
 * Electron 主进程以 Node 模式跑**完整的 mimir 服务端**：数据在用户目录下的
 * SQLite，监听 127.0.0.1 的随机端口。窗口加载的就是宿主自己的地址——
 * 于是 cookie 会话、SSE 聊天流、文件的 Range 请求、multipart 上传与 zip
 * 导出全部是**同源 HTTP 的原生行为**，不需要为桌面再写一套传输。
 *
 * 启动顺序不能变（每一环都依赖前一环）：
 *
 *   1. 选一个空闲端口（随机端口：避免与用户自己部署的 mimir 服务冲突，
 *      也压小本机其他进程误触的面）
 *   2. **先注入环境变量，再动态 import 服务端**——`env.ts` 与 better-auth
 *      都在模块加载时读取配置（trustedOrigins / baseURL / 端口），导入选早了
 *      配置就定了，`SERVER_URL` 会指向错误的地址
 *   3. `startServer({ hostname: '127.0.0.1' })`——只绑回环地址
 *   4. 轮询 /healthz 就绪后再开窗（dsh 的「readiness via Node IPC」对应物）
 */

/** 宿主需要的三个路径（由 main.ts 按打包/开发形态解析） */
export interface HostPaths {
  /** 数据根。打包版在 userData 下，开发版与仓库 data/ 分离 */
  dataDir: string
  /** apps/server 的 vite 构建产物目录（dist） */
  serverDist: string
  /** web 前端构建产物目录（apps/web/dist） */
  webDist: string
}

export interface HostHandle {
  /** 宿主源，如 `http://127.0.0.1:41234`。窗口加载它 */
  origin: string
  port: number
  dataDir: string
  /**
   * 本地模式的本机令牌（D-100）。云端模式下没有宿主，也就没有它。
   *
   * 载体（main.ts）负责把它写进 Electron 的 cookie jar——**只有那一条路**：
   * 令牌不进 URL、不进日志、也不从 preload 暴露给页面。
   */
  localToken: string | null
  /** 关停：先停 HTTP 监听，再关数据库连接 */
  close(): Promise<void>
}

/**
 * 拿一个空闲端口。listen(0) 让 OS 分配，拿到后立刻释放——
 * 存在极小的「释放后被别的进程抢走」窗口（TOCU），但桌面场景重试成本为零，
 * 不值得为此引入端口持有直到 listen 的复杂度。
 */
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

/**
 * 注入服务端读取的全部部署事实（`docs/TECH.md` §7.5：这些是部署事实，
 * 不进设置页）。桌面宿主只缺端口与路径——其余配置沿用 .env / 默认值。
 *
 * `local` 非空时打开**本地模式**（D-100）：免登录（入口是本机令牌）、
 * 监听强制回环、`/api/local/profile` 可用。令牌每次启动随机生成——
 * 它只在这个宿主进程的生命周期里被比较，不需要持久化。
 */
export function applyHostEnv(
  port: number,
  paths: HostPaths,
  authSecret: string,
  local?: { token: string },
): void {
  const origin = `http://127.0.0.1:${port}`
  // 生产形态：lib/static.ts 只在 production 挂载前端产物，桌面宿主需要它
  process.env.NODE_ENV = 'production'
  process.env.PORT = String(port)
  // better-auth 的 baseURL 与 trustedOrigins 在模块加载时读取，
  // 必须指向宿主自己的源，否则登录请求会被当成跨源拒绝
  process.env.SERVER_URL = origin
  process.env.WEB_ORIGIN = origin
  process.env.DATA_DIR = paths.dataDir
  process.env.DATABASE_URL = `file:${join(paths.dataDir, 'mimir.db')}`
  process.env.WEB_DIST = paths.webDist
  // 生产形态下 env.ts 拒绝默认密钥（TECH §8.2）——桌面宿主用持久化的
  // 私有密钥替代部署方手动配置的那一步
  process.env.AUTH_SECRET = authSecret

  if (local) {
    // 服务端读的是 '1' 这个字面量；写成 'true' / 'yes' 都会被当成没开，
    // 而那种失败是静默的（表现是「本地模式却要求登录」）
    process.env.MIMIR_LOCAL_MODE = '1'
    process.env.MIMIR_LOCAL_TOKEN = local.token
  } else {
    delete process.env.MIMIR_LOCAL_MODE
    delete process.env.MIMIR_LOCAL_TOKEN
  }
}

/**
 * 读取或生成宿主的 AUTH_SECRET，落在数据目录里（0600）。
 * **必须持久化**而不是每次启动随机：会话 cookie 用它签名，换了密钥
 * 所有登录态在重启后失效——症状就是「每次重启都要重新登录」。
 */
export async function ensureAuthSecret(dataDir: string): Promise<string> {
  const secretPath = join(dataDir, 'auth-secret')
  try {
    const existing = (await readFile(secretPath, 'utf8')).trim()
    if (existing.length >= 32) return existing
  } catch {
    // 首次启动：文件不存在
  }
  const secret = randomBytes(32).toString('base64')
  await writeFile(secretPath, `${secret}\n`, { mode: 0o600 })
  return secret
}

/** 轮询 /healthz 直到宿主就绪。超时抛错——静默等待会让白屏变成无头案 */
export async function waitForReady(origin: string, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${origin}/healthz`)
      if (res.ok) return
    } catch {
      // 宿主还没开始监听，继续等
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`宿主在 ${timeoutMs}ms 内未就绪：${origin}`)
}

/**
 * 启动私有宿主。**调用前不要 import 任何 @mimir/server 的模块**——
 * 本函数负责「先注入环境变量再加载服务端」的顺序。
 *
 * `options.localMode` 打开本地模式（D-100）：宿主会建一个本机用户、
 * 放行令牌请求，并且只能绑回环地址（服务端侧结构性保证，见
 * `apps/server/src/index.ts`）。
 */
export async function startHost(
  paths: HostPaths,
  options: { localMode?: boolean } = {},
): Promise<HostHandle> {
  await mkdir(paths.dataDir, { recursive: true })

  const [port, authSecret] = await Promise.all([pickFreePort(), ensureAuthSecret(paths.dataDir)])
  const localToken = options.localMode ? randomBytes(24).toString('base64url') : null
  applyHostEnv(port, paths, authSecret, localToken === null ? undefined : { token: localToken })

  // 动态 import + 文件 URL：路径含空格/中文时 pathname 会做百分号编码
  // （与 migrate.ts 的 fileURLToPath 是同一条教训，方向相反）
  const serverIndex = pathToFileURL(join(paths.serverDist, 'index.js')).href
  const serverModule = (await import(serverIndex)) as {
    startServer: (options?: {
      hostname?: string
    }) => Promise<{ server: { close(cb: () => void): void } }>
    closeDb: () => Promise<void>
  }

  const { server } = await serverModule.startServer({ hostname: '127.0.0.1' })
  const origin = `http://127.0.0.1:${port}`
  await waitForReady(origin)

  return {
    origin,
    port,
    dataDir: paths.dataDir,
    localToken,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await serverModule.closeDb()
    },
  }
}
