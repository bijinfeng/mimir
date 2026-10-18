import { existsSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

/**
 * 环境变量集中在这里读取并校验。其他模块只 import 这个对象，
 * 不在各处散落 process.env 读取——缺配置时启动即失败，而不是运行到一半才炸。
 */

/**
 * 定位仓库根目录，用于解析**相对**路径的环境变量。
 *
 * 两条依据：
 *  1. 向上查找含 pnpm-workspace.yaml 的那一层。按标志文件查找而不是写死
 *     `../../..` 偏移量——后者在 src/（tsx 直跑）、dist/（编译产物）、
 *     以及 vite/vitest 转换后并不一致。
 *  2. 找不到就退回 cwd。生产镜像里没有 pnpm-workspace.yaml，但这没关系：
 *     容器里的路径都是绝对路径（/data、/data/vault），根本不走相对解析。
 *     这里不抛错是刻意的——抛错会让一个本身没问题的绝对路径配置无法启动。
 *
 * `import.meta.dirname` 可能是 undefined：drizzle-kit 这类工具会以 CJS 方式
 * 转换本模块（esbuild 下 import.meta 是空对象），此时退回 cwd——
 * drizzle-kit 的约定就是从 apps/server 目录跑，向上查找依然成立。
 */
const moduleDirname: string | undefined = import.meta.dirname

function findRepoRoot(start: string): string {
  let current = start

  while (true) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) return current
    const parent = dirname(current)
    if (parent === current) return process.cwd()
    current = parent
  }
}

const repoRoot = findRepoRoot(moduleDirname ?? process.cwd())

// 显式加载 .env。Node 22 自带 loadEnvFile，不需要 dotenv 依赖。
// 文件不存在时静默跳过——部署环境通常直接注入环境变量。
try {
  process.loadEnvFile(resolve(repoRoot, '.env'))
} catch {
  // 没有 .env 文件，走进程环境变量
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (!value) throw new Error(`缺少环境变量 ${name}`)
  return value
}

/**
 * 路径类环境变量：绝对路径原样使用，相对路径相对**仓库根目录**解析。
 *
 * 只有这一条规则，就不会出现「这个变量是相对哪儿的」这种问题。
 * 容器部署时全部传绝对路径，因此不依赖仓库根能否被找到。
 */
function resolvePath(value: string): string {
  return isAbsolute(value) ? value : resolve(repoRoot, value)
}

const dataDir = resolvePath(process.env.DATA_DIR ?? './data')

// 数据目录不存在时**自动创建**而不是抛错（D-045）。
// 原先的抛错是「新环境启动即 500」的来源之一；存储层的写入本来就会
// mkdir 父目录（`plugins/storage/src/local.ts`），启动期把这个行为提前而已。
// 接受的代价：DATA_DIR 写错路径会静默新建一个空目录——症状明确（界面全空）、
// 启动日志里打印了绝对路径，好过「任何新环境都必须先读报错才能启动」。
mkdirSync(dataDir, { recursive: true })

/**
 * 数据库驱动：**协议头判定**（D-045）。
 *
 *   postgres://… / postgresql://…  → Postgres（服务器部署路径）
 *   file:路径 / 其余                → SQLite 文件（本地开发、桌面端）
 *
 * 未设置时默认 SQLite——新克隆环境 `pnpm dev` 即跑，零 Docker（TECH §8.6）。
 * 部署环境（compose / Dockerfile）始终显式传 postgres://，不受默认值影响。
 * 这是部署事实（TECH §7.5），不进设置页。
 */
const rawDatabaseUrl = process.env.DATABASE_URL ?? 'file:./data/mimir.db'
export const dbDriver: 'postgres' | 'sqlite' = /^postgres(ql)?:\/\//.test(rawDatabaseUrl)
  ? 'postgres'
  : 'sqlite'

/** SQLite 的库文件路径。相对路径相对仓库根（与 DATA_DIR 同一条解析规则） */
const databaseFile = dbDriver === 'sqlite' ? resolvePath(rawDatabaseUrl.replace(/^file:/, '')) : ''
const fnosSocket = process.env.MIMIR_FNOS_SOCKET ?? ''
const fnosBasePath = process.env.MIMIR_BASE_PATH ?? '/app/mimir'

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  /**
   * 数据库连接。`dbDriver` 决定 `db/client.ts` 用哪个驱动：
   * postgres 时它是 postgres.js 的连接串；sqlite 时真正的文件路径在
   * `databaseFile`（`databaseUrl` 保留原始值，仅供诊断显示）。
   */
  databaseUrl: rawDatabaseUrl,
  dbDriver,
  databaseFile,
  authSecret: required('AUTH_SECRET', 'dev-only-insecure-secret-change-me'),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  serverUrl: process.env.SERVER_URL ?? 'http://localhost:3000',
  /** fnOS 统一网关只通过私有 Unix Socket 进入；其他部署仍监听 TCP。 */
  fnosSocket,
  fnosBasePath,
  repoRoot,
  /**
   * 数据根：本地存储后端的根，也是三类文件的共同父目录。
   *
   * ## 为什么只剩这一个（原先有 vault / raw / avatars 三个）
   *
   * 三个目录各自独立默认时，「新增一个存储位置」要在每个部署文件里各加一行，
   * 而**漏掉哪一行不报错**——数据静静地落到容器可写层。这正是
   * `.trellis/spec/project/research.md` §10.10 记的那个现存缺陷：Dockerfile 与 compose 都设了
   * `VAULT_DIR` / `RAW_DIR` 却漏了 `AVATARS_DIR`，于是生产环境的头像
   * 落在 `/app/data/avatars`（不在挂载的卷上），重新部署就丢。
   *
   * 收成一个根之后这类不一致在结构上不可能发生：三类文件是它的三个**前缀**
   * （`vault/` / `raw/` / `avatars/`），见 `StorageBackend` 的契约注释。
   *
   * 仍然保留 `DATA_DIR` 这个环境变量名——它本来就是部署事实
   * （`.trellis/spec/project/architecture.md` §7.5 的配置分层），不进设置页。
   */
  dataDir,

  /**
   * 模型配置。**全部可选**——没有它们时问答走「只用检索」路径，
   * 应用依然完整可用（见 .trellis/spec/project/product.md §5.8：离线不是全盘瘫痪）。
   *
   * 所以这里不用 required()：缺模型不等于配置错误，只等于少一个功能。
   * 这与 DATABASE_URL / AUTH_SECRET 不同——那两个缺了应用根本起不来。
   */
  modelApiKey: process.env.MODEL_API_KEY ?? '',
  modelBaseUrl: process.env.MODEL_BASE_URL ?? 'https://api.deepseek.com/v1',
  modelProviderName: process.env.MODEL_PROVIDER_NAME ?? 'deepseek',
  modelChatModel: process.env.MODEL_CHAT_MODEL ?? 'deepseek-chat',
  modelReasoningModel: process.env.MODEL_REASONING_MODEL ?? 'deepseek-reasoner',

  /**
   * 所有者账号。**配了它就能跳过首次注册**——服务端启动时自动建号。
   *
   * 这是 self-hosted 单用户产品的标准做法（Grafana / Gitea 等都类似），
   * 而且它比「先注册先得」**更安全**：部署完到你自己注册之间有一个时间窗，
   * 服务如果已经暴露在公网，谁先访问谁就成为了那个唯一用户。
   * 用环境变量把账号定下来，这个窗口不存在。
   *
   * 三个环境（production / development）都生效，语义一致：
   * **它是所有者账号的真相来源**。库里有账号但密码与这里不一致时会被同步，
   * 所以「忘记密码」的找回方式就是改这里再重启。
   *
   * 两个都为空 = 不启用，走「首次注册」路径（默认）。
   * 只配一个视为配置错误，启动时明确报错而不是静默忽略一半。
   */
  ownerEmail: process.env.OWNER_EMAIL ?? '',
  ownerPassword: process.env.OWNER_PASSWORD ?? '',

  /**
   * 本地模式（D-100）：桌面客户端的进程内私有宿主用的形态。
   *
   * 语义是「这台机器上的所有者直接用，不需要登录」——但**不是**「API 没有
   * 鉴权」：入口是宿主注入的 `mimir-local` 令牌 cookie（`localToken`），
   * `requireAuth` 先试真实会话、再验它。理由见 `services/local-mode.ts`。
   *
   * 它是部署事实（由 `apps/desktop/src/host.ts` 注入），不进设置页。
   * 与 DATABASE_URL 同一条：设错了不会「运行到一半才发现」，启动期即断言。
   */
  miniappEnabled: process.env.MIMIR_MINIAPP_ENABLED === '1',
  localMode: process.env.MIMIR_LOCAL_MODE === '1',
  /**
   * 本地模式的访问令牌。宿主每次启动随机生成（每次启动换一把，不需要
   * 持久化：它只在这一个宿主进程的生命周期里被比较）。
   */
  localToken: process.env.MIMIR_LOCAL_TOKEN ?? '',
} as const

/** 两个所有者变量都配了才算启用 */
export function isOwnerConfigured(): boolean {
  return Boolean(env.ownerEmail && env.ownerPassword)
}

/**
 * 只配了一半是配置错误，不是「没配」——静默忽略会让人查半天。
 *
 * 单独一个函数而不是写在 env 字面量里：这里要抛错，而 env.ts 的其余部分
 * 只做读取。启动早期抛错比运行到一半才发现好。
 */
export function assertOwnerConfigComplete(): void {
  const hasEmail = Boolean(env.ownerEmail)
  const hasPassword = Boolean(env.ownerPassword)
  if (hasEmail === hasPassword) return

  const missing = hasEmail ? 'OWNER_PASSWORD' : 'OWNER_EMAIL'
  throw new Error(
    `所有者账号配置不完整：设了 ${hasEmail ? 'OWNER_EMAIL' : 'OWNER_PASSWORD'} 但缺少 ${missing}。` +
      '两个都要设，或者都不设（都不设时走「首次注册」路径）。',
  )
}

if (env.ownerPassword && env.ownerPassword.length < 8) {
  throw new Error('OWNER_PASSWORD 至少 8 位（与登录页的校验一致）')
}

if (env.nodeEnv === 'production' && env.authSecret === 'dev-only-insecure-secret-change-me') {
  throw new Error('生产环境必须设置 AUTH_SECRET（openssl rand -base64 32）')
}

/**
 * 本地模式必须带令牌（D-100）。
 *
 * **绝不能降级成「有 localMode 但无令牌 ⇒ 免鉴权放行」**：那样一个扫本机
 * 端口的网页就能读写整个知识库，而开发机上这条路径根本不会被注意到。
 * 缺令牌就是配置错误，启动即报错。
 */
if (env.localMode && !env.localToken) {
  throw new Error(
    '本地模式（MIMIR_LOCAL_MODE=1）必须同时设置 MIMIR_LOCAL_TOKEN。' +
      '它由桌面宿主每次启动随机生成并注入（apps/desktop/src/host.ts），不要手工填。',
  )
}

if (env.fnosSocket) {
  if (!isAbsolute(env.fnosSocket)) throw new Error('MIMIR_FNOS_SOCKET 必须是绝对路径')
  if (env.fnosBasePath !== '/app/mimir') {
    throw new Error('fnOS 网关路径必须是 /app/mimir')
  }
  if (env.localMode) throw new Error('fnOS 模式不能启用桌面本地免登录模式')
  if (dbDriver !== 'sqlite') throw new Error('fnOS 模式必须使用 SQLite 数据库')
  if (!isOwnerConfigured()) throw new Error('fnOS 模式必须配置 OWNER_EMAIL 和 OWNER_PASSWORD')
}
