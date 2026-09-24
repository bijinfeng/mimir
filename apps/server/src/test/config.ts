/**
 * 测试环境配置的唯一来源。
 *
 * 为什么抽出来：vitest 的 `test.env` 只作用于测试工作进程，
 * globalSetup 跑在主进程里读不到。两边共用同一份常量才能保证
 * 「清库的那个库」和「测试连的那个库」确实是同一个。
 *
 * 双后端（D-045）：`TEST_DATABASE_URL` 按协议头分发——
 *   未设置 / `file:` 开头 → SQLite 临时库（默认，免 Docker）
 *   `postgres://` 开头    → Postgres 测试库（方言对齐门：检索断言两种方言都要过）
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'file:./data/.test/mimir.db'

export const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  AUTH_SECRET: 'test-secret-only-for-tests-0123456789',
  // 一律相对仓库根目录，与 src/env.ts 的规则保持一致。
  // 必须指向测试专用目录：集成测试会真的写文件，
  // 用真实 vault 会把用户的笔记目录变成一堆测试垃圾。
  //
  // **只有一个数据根**（D-038）：vault / raw / avatars 是它下面的前缀。
  // SQLite 测试库也放在这个根下面（mimir.db）——清根目录时一起带走，
  // 不会在真实数据目录里留下上一个运行的残留。
  DATA_DIR: './data/.test',
  WEB_ORIGIN: 'http://localhost:5173',
  SERVER_URL: 'http://localhost:3000',
}
