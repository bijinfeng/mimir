import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { TEST_DATABASE_URL } from './config.js'

/**
 * 集成测试只跑一次的前置：清库 + 建表。
 * 用独立的 mimir_test 库，避免测试把开发数据洗掉。
 */
export async function setup() {
  if (!TEST_DATABASE_URL.includes('mimir_test')) {
    throw new Error(`拒绝在非测试库上运行：${TEST_DATABASE_URL}。库名必须包含 mimir_test。`)
  }

  const sql = postgres(TEST_DATABASE_URL, { max: 1 })
  await sql`drop schema public cascade`
  await sql`create schema public`
  await sql`create extension if not exists pg_trgm`
  await sql`create extension if not exists vector`
  await sql.end()

  // 直接用 drizzle-kit push 建表，避免测试依赖已提交的迁移文件顺序
  execSync('npx drizzle-kit push --force --config drizzle.config.ts', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    // fileURLToPath 而非 URL.pathname：项目路径含中文会被百分号编码
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
  })
}
