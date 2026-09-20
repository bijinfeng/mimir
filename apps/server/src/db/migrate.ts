import { fileURLToPath } from 'node:url'
import { sql as rawSql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { db, sql } from './client.js'

/**
 * 迁移前先建扩展。顺序不能反：documents 上的 trigram 索引（gin_trgm_ops）
 * 依赖 pg_trgm 已经存在，否则建索引会直接失败。
 */
async function main() {
  await db.execute(rawSql`create extension if not exists pg_trgm`)
  // M1 做向量检索时会用到；现在建好，避免以后改镜像和初始化流程
  await db.execute(rawSql`create extension if not exists vector`)

  // 必须用 fileURLToPath 而不是 URL.pathname：项目路径可能含中文，
  // pathname 会做百分号编码，导致找不到 migrations 目录。
  const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
  await migrate(db, { migrationsFolder })

  console.log('迁移完成')
  await sql.end()
}

main().catch(async (error) => {
  console.error('迁移失败：', error)
  await sql.end({ timeout: 1 }).catch(() => {})
  process.exit(1)
})
