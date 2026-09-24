import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { TEST_DATABASE_URL, TEST_ENV } from './config.js'

/**
 * 集成测试只跑一次的前置：清库、清测试目录、建表。
 *
 * **测试的隔离必须覆盖它写入的每一个地方。** 这个文件曾经只清数据库，
 * 不清测试 vault——后果是上一次运行残留的 md 文件会累积（实测攒到 144 个），
 * 而重建索引会把它们重新导入数据库，污染后续断言。
 *
 * 症状很隐蔽：单跑某个文件通过，全量跑就挂，而且挂的是看起来毫不相关的断言。
 */

/**
 * 定位仓库根。TEST_ENV 里的路径都是相对仓库根的（与 src/env.ts 的约定一致），
 * 所以必须找到真正的仓库根，不能按 apps/server 解析。
 */
function findRepoRoot(start: string): string {
  let current = start
  while (true) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) return current
    const parent = dirname(current)
    if (parent === current) throw new Error(`找不到仓库根目录（从 ${start} 向上）`)
    current = parent
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)))
/** server 包根：drizzle.config.ts 在这里，不是在仓库根 */
const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** TEST_ENV 里的路径统一相对仓库根 */
function testPath(relative: string | undefined): string | null {
  return relative ? resolve(repoRoot, relative.replace('./', '')) : null
}

export async function setup() {
  if (!TEST_DATABASE_URL.includes('mimir_test')) {
    throw new Error(`拒绝在非测试库上运行：${TEST_DATABASE_URL}。库名必须包含 mimir_test。`)
  }

  // 1. 清文件（先做，避免下面建表失败时留下半清理状态）
  // 数据库和文件系统是两处状态，只清一处等于没隔离。
  //
  // 只清一个根就够：vault / raw / avatars 都是它下面的前缀（D-038），
  // 删父目录自然把它们一起带走。原先逐个清是因为它们各有独立的环境变量，
  // 那种写法**漏一个就留下残留**，而残留会让下一次测试的断言莫名其妙地失败
  // （这个文件的历史注释记过：测试文件曾攒到 144 个）。
  {
    const abs = testPath(TEST_ENV.DATA_DIR)
    if (abs) await rm(abs, { recursive: true, force: true })
  }

  // 2. 重建目录。env.ts 启动时会校验 DATA_DIR 存在，缺了会直接抛错。
  {
    const abs = testPath(TEST_ENV.DATA_DIR)
    if (abs) await mkdir(abs, { recursive: true })
  }

  // 3. 清库
  const sql = postgres(TEST_DATABASE_URL, { max: 1 })
  await sql`drop schema public cascade`
  await sql`create schema public`
  await sql`create extension if not exists pg_trgm`
  await sql`create extension if not exists vector`
  await sql.end()

  // 4. 建表。用 drizzle-kit push 而不是跑迁移，避免测试依赖迁移文件的顺序。
  execSync('npx drizzle-kit push --force --config drizzle.config.ts', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    cwd: serverRoot,
  })
}
