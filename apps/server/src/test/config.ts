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
  // 必须指向测试专用目录：集成测试会真的写文件，
  // 用真实 vault 会把用户的笔记目录变成一堆测试垃圾。
  //
  // **只有一个数据根**（D-038）：vault / raw / avatars 是它下面的前缀。
  // 测试仍然断言磁盘上的 `data/.test/vault` 等具体位置——那是本地后端的
  // 行为，也正是「文件可以直接用 Typora 打开」这条主张的落点——
  // 但配置只从这里来，不再有按目录拆分的环境变量。
  DATA_DIR: './data/.test',
  WEB_ORIGIN: 'http://localhost:5173',
  SERVER_URL: 'http://localhost:3000',
}
