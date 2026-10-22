import { configureServer } from '../config.js'
import { loadRuntimeConfigFromEnv, toServerConfig } from './config.js'

/**
 * `pnpm db:migrate` / `pnpm db:reindex` 的 CLI 入口。
 *
 * 它属于 runtime，不是 core：先配置，再动态 import core 的 DB/migrate，
 * 这样 `db/schema.ts` 选方言时配置一定已经就绪。
 */
const config = loadRuntimeConfigFromEnv()
configureServer(toServerConfig(config))

const [{ ensureServerRuntime }, { runMigrations, reindexSearch }, { closeDb }] = await Promise.all([
  import('../server-runtime.js'),
  import('../db/migrate.js'),
  import('../db/client.js'),
])

ensureServerRuntime()

const reindex = process.argv.includes('--reindex')
try {
  if (reindex) {
    await reindexSearch()
    console.log('FTS 索引已重建')
  } else {
    await runMigrations(config.migrations)
    console.log('迁移完成')
  }
} catch (error) {
  console.error('迁移失败：', error)
  process.exitCode = 1
} finally {
  await closeDb().catch(() => {})
}
