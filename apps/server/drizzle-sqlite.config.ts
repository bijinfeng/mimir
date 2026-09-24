import { defineConfig } from 'drizzle-kit'

/**
 * SQLite 方言的迁移配置（本地开发 / 桌面端，D-045）。
 *
 * 与 `drizzle.config.ts`（Postgres）并存，各管各的目录：
 *   drizzle/         PG 迁移（服务器部署路径，生产习惯不变）
 *   drizzle-sqlite/  SQLite 迁移
 *
 * 生成：`pnpm db:generate:sqlite`；应用：`pnpm db:migrate`（按 DATABASE_URL 分发）。
 * FTS5 虚拟表与触发器 drizzle-kit 表达不了，由 migrate.ts 在迁移后幂等追加
 * （`drizzle-sqlite/fts.sql`）。
 */
export default defineConfig({
  schema: './src/db/schema.sqlite.ts',
  out: './drizzle-sqlite',
  dialect: 'sqlite',
  dbCredentials: {
    // generate 不连库；push/check 才需要。这里给一个占位文件路径。
    url: 'file:./drizzle-sqlite/.local.db',
  },
})
