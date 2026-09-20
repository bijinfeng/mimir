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
} as const

if (env.nodeEnv === 'production' && env.authSecret === 'dev-only-insecure-secret-change-me') {
  throw new Error('生产环境必须设置 AUTH_SECRET（openssl rand -base64 32）')
}
