import { pathToFileURL, fileURLToPath } from 'node:url'
import { sql as rawSql } from 'drizzle-orm'
import { migrate as migrateSqlite } from 'drizzle-orm/better-sqlite3/migrator'
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator'
import { dbDriver } from '../env.js'
import { closeDb, db } from './client.js'

/**
 * 迁移的**唯一入口**：`pnpm db:migrate`（CLI）与启动钩子（boot.ts，SQLite 路径
 * 的自动迁移）都走这里的 `runMigrations()`——两条路径各跑各的方言目录：
 *
 *   postgres → drizzle/         建扩展后跑 PG 迁移（生产习惯：手动执行）
 *   sqlite   → drizzle-sqlite/  含 FTS5 虚拟表与触发器（幂等，启动时可重跑）
 *
 * 文件路径用 fileURLToPath 而不是 URL.pathname：项目路径可能含中文，
 * pathname 会做百分号编码，导致找不到 migrations 目录。
 * `../../drizzle` 在 src/db/ 与 dist/db/ 深度一致（vite.config 的 preserveModules
 * 契约），两种运行形态下都指向 apps/server 的迁移目录。
 */

const migrationsFolder = (name: string): string =>
  fileURLToPath(new URL(`../../${name}`, import.meta.url))

export async function runMigrations(): Promise<void> {
  if (dbDriver === 'postgres') {
    /**
     * 迁移前先建扩展。顺序不能反：documents 上的 trigram 索引（gin_trgm_ops）
     * 依赖 pg_trgm 已经存在，否则建索引会直接失败。
     */
    await db.execute(rawSql`create extension if not exists pg_trgm`)
    // M1 做向量检索时会用到；现在建好，避免以后改镜像和初始化流程
    await db.execute(rawSql`create extension if not exists vector`)

    await migratePostgres(db, { migrationsFolder: migrationsFolder('drizzle') })
    return
  }

  await migrateSqlite(db as never, {
    migrationsFolder: migrationsFolder('drizzle-sqlite'),
  })
}

/**
 * 全量重建 SQLite 的 FTS5 索引（`pnpm db:reindex`）。
 *
 * 正常情况下 documents 上的三个触发器把索引维护得严丝合缝；这个命令是
 * 兜底——怀疑索引落后（搜不到明明存在的内容）时跑一次。
 */
export async function reindexSearch(): Promise<void> {
  if (dbDriver !== 'sqlite') {
    throw new Error('db:reindex 只用于 SQLite 路径；Postgres 的全文索引随迁移自动维护')
  }
  // 这里的两个语句只对 sqlite 方言有意义；db 的公开类型是双后端公共形状，
  // 方言专属操作在本文件内收口（D-045 的五个点名处之一）
  const sqliteDb = db as never as {
    run(query: never): unknown
  }
  sqliteDb.run(rawSql`delete from documents_fts` as never)
  sqliteDb.run(
    rawSql`insert into documents_fts (doc_id, search_text) select id, search_text from documents` as never,
  )
}

/** CLI 直跑判定：dist/db/migrate.js 与 src/db/migrate.ts 两种形态都成立 */
function invokedDirectly(): boolean {
  const argv = process.argv[1]
  if (!argv) return false
  return import.meta.url === pathToFileURL(argv).href
}

async function main() {
  const reindex = process.argv.includes('--reindex')
  if (reindex) {
    await reindexSearch()
    console.log('FTS 索引已重建')
  } else {
    await runMigrations()
    console.log('迁移完成')
  }
  await closeDb()
}

if (invokedDirectly()) {
  main().catch(async (error) => {
    console.error('迁移失败：', error)
    await closeDb().catch(() => {})
    process.exit(1)
  })
}
