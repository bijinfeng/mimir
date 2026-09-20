import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { env } from './env.js'

const app = createApp()

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`mimir server 监听 http://localhost:${info.port}`)
  console.log(`  数据目录 ${env.dataDir}`)
  console.log(`  笔记目录 ${env.vaultDir}`)
})

export { app }
