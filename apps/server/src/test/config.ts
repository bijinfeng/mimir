/**
 * 测试环境配置的唯一来源。
 *
 * 为什么抽出来：vitest 的 `test.env` 只作用于测试工作进程，
 * globalSetup 跑在主进程里读不到。两边共用同一份常量才能保证
 * 「清库的那个库」和「测试连的那个库」确实是同一个。
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://mimir:mimir@127.0.0.1:5544/mimir_test'

export const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  AUTH_SECRET: 'test-secret-only-for-tests-0123456789',
  // 一律相对仓库根目录，与 src/env.ts 的规则保持一致。
  // 必须指向测试专用目录：集成测试会真的写 md 文件，
  // 用真实 vault 会把用户的笔记目录变成一堆测试垃圾。
  DATA_DIR: './data/.test',
  VAULT_DIR: './data/.test/vault',
  RAW_DIR: './data/.test/raw',
  WEB_ORIGIN: 'http://localhost:5173',
  SERVER_URL: 'http://localhost:3000',
}
