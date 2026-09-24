import { serve } from '@hono/node-server'
import { boot } from './boot.js'
import { dbDriver, env } from './env.js'

const app = await boot()

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`mimir server 监听 http://localhost:${info.port}`)
  console.log(`  数据目录 ${env.dataDir}`)
  // 驱动与库位置必须打在启动日志里：「数据全空」时第一眼要看的就是这行
  // （DATABASE_URL 漏配会静默换到 SQLite 空库，TECH §10）
  console.log(
    dbDriver === 'postgres' ? `  数据库 postgres` : `  数据库 sqlite（${env.databaseFile}）`,
  )
})

export { app }
