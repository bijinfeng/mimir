import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '../env.js'
import * as schema from './schema.js'

/**
 * 单例连接池。单用户自托管，池子不需要大；
 * 但在开发热重载下必须复用，否则每次重启都会泄漏连接。
 */
const globalForDb = globalThis as unknown as {
  __mimirSql?: ReturnType<typeof postgres>
}

const sql =
  globalForDb.__mimirSql ??
  postgres(env.databaseUrl, {
    max: 10,
    onnotice: () => {},
  })

if (env.nodeEnv !== 'production') {
  globalForDb.__mimirSql = sql
}

export const db = drizzle(sql, { schema })
export { sql }
