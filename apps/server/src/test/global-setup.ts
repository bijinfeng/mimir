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
 *
 * 双后端（D-045）：默认走 SQLite 临时库（`data/.test/mimir.db`，免 Docker）；
 * 设 `TEST_DATABASE_URL=postgres://…mimir_test` 时走 Postgres 路径——
 * 两个检索通道的 SQL 是按方言分开写的，同一套断言在两种方言下都要过
 * （`docs/TECH.md` §9.2 的「方言对齐门」）。
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

const isPostgres = /^postgres(ql)?:\/\//.test(TEST_DATABASE_URL)

export async function setup() {
  if (isPostgres && !TEST_DATABASE_URL.includes('mimir_test')) {
    throw new Error(`拒绝在非测试库上运行：${TEST_DATABASE_URL}。库名必须包含 mimir_test。`)
  }

  // 1. 清文件（先做，避免下面建表失败时留下半清理状态）
  // 数据库和文件系统是两处状态，只清一处等于没隔离。
  //
  // 只清一个根就够：vault / raw / avatars 都是它下面的前缀（D-038），
  // SQLite 测试库（mimir.db）也在这个根下面，删父目录自然一起带走。
  {
    const abs = testPath(TEST_ENV.DATA_DIR)
    if (abs) await rm(abs, { recursive: true, force: true })
  }

  // 2. 重建目录。env.ts 导入时会 mkdir 数据目录，这里先建好保持顺序清晰。
  {
    const abs = testPath(TEST_ENV.DATA_DIR)
    if (abs) await mkdir(abs, { recursive: true })
  }

  if (isPostgres) {
    // 3. 清库（PG 专属：schema 级重建 + 建扩展）
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
    return
  }

  // SQLite 路径：测试库文件在 DATA_DIR 下面，上面清根时已一并删掉。
  // 走与运行时同一条 runMigrations()（journal 记账、幂等），含 FTS5 表与触发器。
  // 动态 import：必须先把 TEST_ENV 写进 process.env，env.ts 在模块加载时
  // 就读取并解析 DATABASE_URL。
  for (const [key, value] of Object.entries(TEST_ENV)) {
    process.env[key] = value
  }
  const { runMigrations } = await import('../db/migrate.js')
  const { closeDb } = await import('../db/client.js')
  await runMigrations()
  await closeDb()
}
