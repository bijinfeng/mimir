import { existsSync } from 'node:fs'
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
 */
function findRepoRoot(start: string): string {
  let current = start

  while (true) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) return current
    const parent = dirname(current)
    if (parent === current) return process.cwd()
    current = parent
  }
}

const repoRoot = findRepoRoot(import.meta.dirname)

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

if (!existsSync(dataDir)) {
  throw new Error(`数据目录不存在：${dataDir}。请执行 mkdir -p data/vault data/raw`)
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL', 'postgres://mimir:mimir@127.0.0.1:5544/mimir'),
  authSecret: required('AUTH_SECRET', 'dev-only-insecure-secret-change-me'),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  serverUrl: process.env.SERVER_URL ?? 'http://localhost:3000',
  repoRoot,
  dataDir,
  vaultDir: resolvePath(process.env.VAULT_DIR ?? './data/vault'),
  rawDir: resolvePath(process.env.RAW_DIR ?? './data/raw'),

  /**
   * 模型配置。**全部可选**——没有它们时问答走「只用检索」路径，
   * 应用依然完整可用（见 docs/PRD.md §5.8：离线不是全盘瘫痪）。
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
