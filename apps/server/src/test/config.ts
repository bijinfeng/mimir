/**
 * 测试环境配置的唯一来源。
 *
 * 为什么抽出来：vitest 的 `test.env` 只作用于测试工作进程，
 * globalSetup 跑在主进程里读不到，须读取 project.config.env。两边共用配置才能保证
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

/**
 * 本地模式（D-100）那一遍测试的环境。
 *
 * ## 为什么要**单独跑一个进程**，不能塞进上面的 TEST_ENV
 *
 * `env.ts` 在模块加载时读取 `process.env`，`localMode` 一旦打开就会改变
 * 全局行为：`requireAuth` 多一条令牌分支、`setup/state` 与 `/api/config`
 * 的形状里多一个字段、`startServer` 会把监听地址钉死在回环。
 * 那些正是「另一个模式」的实现——让整套测试都跑在本地模式下，
 * 等于两条路径里有一条永远没被测过（而没被测的那条恰好是生产部署用的）。
 *
 * 所以本地模式是一个**独立进程**：`vitest.local.config.ts` 只收录
 * `local-mode.test.ts`，环境由这里提供。两份 env 只有本地模式那两个变量不同，
 * 其余（库、数据目录、密钥）走同一份常量——两边分叉是这类测试最容易
 * 静默失真的地方。
 */
export const LOCAL_MODE_TEST_ENV: Record<string, string> = {
  ...TEST_ENV,
  MIMIR_LOCAL_MODE: '1',
  /** 与 `services/local-mode.ts` 的比较对象。测试里用固定值，真实宿主每次随机 */
  MIMIR_LOCAL_TOKEN: 'test-local-token-0123456789abcdef',
}

/** fnOS 只支持 SQLite，不能继承方言对齐门传入的 Postgres 测试库。 */
export const FNOS_TEST_ENV: Record<string, string> = {
  ...TEST_ENV,
  DATABASE_URL: 'file:./data/.test-fnos/mimir.db',
  DATA_DIR: './data/.test-fnos',
  OWNER_EMAIL: 'admin@example.com',
  OWNER_PASSWORD: '12345678',
  MIMIR_LOCAL_MODE: '0',
  MIMIR_LOCAL_TOKEN: '',
  MIMIR_FNOS_SOCKET: '/tmp/mimir-fnos-vitest.sock',
  MIMIR_BASE_PATH: '/app/mimir',
}
