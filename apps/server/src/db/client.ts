import { createRequire } from 'node:module'
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js'
import Database from 'better-sqlite3'
import postgres from 'postgres'
import { dbDriver, env } from '../env.js'
import * as pgSchema from './schema.pg.js'
import * as sqliteSchema from './schema.sqlite.js'

/**
 * 数据库客户端工厂。按 `DATABASE_URL` 协议头判定的驱动（`env.dbDriver`，D-045）
 * 创建 postgres.js 或 better-sqlite3 的 drizzle 实例。
 *
 * ## 服务层为什么感知不到驱动
 *
 * 服务层 import 的表对象来自 `schema.ts` 分发器（运行时按驱动给出
 * `schema.pg` / `schema.sqlite`），`db` 在这里的类型**断言成 PG 形状**
 * （`PostgresJsDatabase`）——两份 schema 由 parity 守卫测试逐列对齐，
 * drizzle 查询构建器的公共子集（select / insert / update / delete /
 * returning / onConflict）在两个方言下行为一致。这是双后端唯二的类型接缝
 * （另一处在 schema 分发器），别在别处再按驱动分支。
 *
 * ## dev 热重载的单例
 *
 * 与原来一样：开发时 Vite 每次热重载都会重新执行模块，连接不缓存的话
 * 每次重启都泄漏一个连接池 / 文件句柄。
 */

type PgClient = ReturnType<typeof postgres>
type SqliteClient = InstanceType<typeof Database>

const globalForDb = globalThis as unknown as {
  __mimirSql?: PgClient
  __mimirSqlite?: SqliteClient
}

function createPostgres(): PostgresJsDatabase<typeof pgSchema> {
  // 单用户自托管，池子不需要大
  const sql = globalForDb.__mimirSql ?? postgres(env.databaseUrl, { max: 10, onnotice: () => {} })

  if (env.nodeEnv !== 'production') {
    globalForDb.__mimirSql = sql
  }

  return drizzlePg(sql, { schema: pgSchema })
}

function createSqlite(): PostgresJsDatabase<typeof pgSchema> {
  const sqlite =
    globalForDb.__mimirSqlite ??
    // better-sqlite3 不自动创建父目录；env.ts 已经把 DATA_DIR 建好了
    new Database(env.databaseFile)

  if (env.nodeEnv !== 'production') {
    globalForDb.__mimirSqlite = sqlite
  }

  // 这些 PRAGMA 缺一条的后果都是**静默**的（TECH §10）：
  //   foreign_keys —— 默认关闭，不开则所有 onDelete: 'cascade' 失效
  //   journal_mode —— WAL 是单写多读的基础；文件库默认 rollback journal
  //   busy_timeout —— 并发读（如 drizzle-studio）持有锁时报 SQLITE_BUSY
  //   synchronous  —— WAL 下的安全与速度平衡点
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('busy_timeout = 5000')
  sqlite.pragma('synchronous = NORMAL')

  /**
   * 加载 sqlite-vec 扩展（M1-C 的向量通道用它算余弦距离）。
   *
   * **装不上就抛错，不静默降级**：它的缺席表现是「语义检索返回空」，
   * 而那看起来像「库里没有相关内容」——正是最难查的一类。抛在建立连接时
   * （启动即失败）比等到第一次检索好得多。
   *
   * 用 `createRequire` 而不是顶层 import：`sqlite-vec` 是**按平台的**
   * 可选依赖（只有 linux-x64 / darwin / win32 的预编译包），而服务器部署
   * 走 Postgres 路径、根本不需要它——顶层 import 会让那条路径也去解析它。
   * better-sqlite3 的 `loadExtension` 需要已解析的模块导出，所以用 require。
   */
  try {
    const require = createRequire(import.meta.url)
    const sqliteVec = require('sqlite-vec') as { load(db: unknown): void }
    sqliteVec.load(sqlite)
  } catch (error) {
    throw new Error(
      '加载 sqlite-vec 扩展失败（本地 / 桌面端的语义检索需要它）。' +
        `原始错误：${error instanceof Error ? error.message : String(error)}`,
      // 带上 cause：抛出去的是一句人话，而排查时要看的是原始栈
      { cause: error },
    )
  }

  return drizzleSqlite(sqlite, { schema: sqliteSchema }) as never
}

export const db = dbDriver === 'postgres' ? createPostgres() : createSqlite()

/**
 * 进程退出 / 脚本收尾用。dev 热重载不调它（要复用单例）。
 * 关闭后清掉缓存引用——复用一个已关闭的连接是静默的坏行为。
 */
export async function closeDb(): Promise<void> {
  if (dbDriver === 'postgres') {
    await globalForDb.__mimirSql?.end({ timeout: 1 })
    globalForDb.__mimirSql = undefined
    return
  }
  globalForDb.__mimirSqlite?.close()
  globalForDb.__mimirSqlite = undefined
}
