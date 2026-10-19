import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
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

/** Repair only known already-applied out-of-order journal rows, by exact SQL hash.
 * Otherwise a timestamp correction would replay non-idempotent CREATE/ALTER SQL.
 */
async function normalizeLegacyMigrationTime(): Promise<void> {
  const postgres = dbDriver === 'postgres'
  const filename = postgres ? '0014_strange_mastermind.sql' : '0012_cuddly_namora.sql'
  const oldTime = postgres ? 1792311284208 : 1792311287590
  const file = await readFile(
    `${migrationsFolder(postgres ? 'drizzle' : 'drizzle-sqlite')}/${filename}`,
  )
  const hash = createHash('sha256').update(file).digest('hex')
  try {
    const fixedTime = 1792311600001
    if (postgres) {
      const present = await db.execute(
        rawSql`SELECT hash, created_at FROM drizzle.__drizzle_migrations`,
      )
      const rows = [...present] as Array<{ hash: string; created_at: string | number }>
      if (rows.some((row) => row.hash === hash)) {
        await db.execute(
          rawSql`UPDATE drizzle.__drizzle_migrations SET created_at = ${fixedTime} WHERE hash = ${hash} AND created_at = ${oldTime}`,
        )
      } else if (rows.some((row) => Number(row.created_at) >= fixedTime)) {
        // A later migration may already be installed while this one was skipped.
        // Replay exactly this missing migration in a transaction, not the others.
        await db.transaction(async (tx) => {
          for (const statement of file.toString('utf8').split('--> statement-breakpoint')) {
            if (statement.trim()) await tx.execute(rawSql.raw(statement))
          }
          await tx.execute(
            rawSql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${fixedTime})`,
          )
        })
      }
    } else {
      type SqliteMigrationDb = {
        all(query: unknown): Array<{ hash: string; created_at: number }>
        run(query: unknown): unknown
        transaction(fn: (tx: SqliteMigrationDb) => void): void
      }
      const sqliteDb = db as never as SqliteMigrationDb
      const rows = sqliteDb.all(rawSql`SELECT hash, created_at FROM __drizzle_migrations`)
      if (rows.some((row) => row.hash === hash)) {
        sqliteDb.run(
          rawSql`UPDATE __drizzle_migrations SET created_at = ${fixedTime} WHERE hash = ${hash} AND created_at = ${oldTime}`,
        )
      } else if (rows.some((row) => row.created_at >= fixedTime)) {
        sqliteDb.transaction((tx) => {
          for (const statement of file.toString('utf8').split('--> statement-breakpoint')) {
            if (statement.trim()) tx.run(rawSql.raw(statement))
          }
          tx.run(
            rawSql`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (${hash}, ${fixedTime})`,
          )
        })
      }
    }
  } catch (error) {
    // A brand new database has no migration journal yet. All other failures matter.
    const cause = error as {
      code?: string
      message?: string
      cause?: { code?: string; message?: string }
    }
    const code = cause.cause?.code ?? cause.code
    const message = cause.cause?.message ?? cause.message ?? ''
    if (code === '42P01' || (code === 'SQLITE_ERROR' && message.includes('no such table'))) return
    throw error
  }
}

export async function runMigrations(): Promise<void> {
  if (dbDriver === 'postgres') {
    /**
     * 迁移前先建扩展。顺序不能反：documents 上的 trigram 索引（gin_trgm_ops）
     * 依赖 pg_trgm 已经存在，否则建索引会直接失败。
     */
    await db.execute(rawSql`create extension if not exists pg_trgm`)
    // M1 做向量检索时会用到；现在建好，避免以后改镜像和初始化流程
    await db.execute(rawSql`create extension if not exists vector`)

    await normalizeLegacyMigrationTime()
    await migratePostgres(db, { migrationsFolder: migrationsFolder('drizzle') })
    return
  }

  await normalizeLegacyMigrationTime()
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
