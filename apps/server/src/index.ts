import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { assertOwnerConfigComplete, env } from './env.js'
import { ensureOwnerAccount } from './services/bootstrap.js'

// 配置错误要在启动早期就暴露，而不是运行到一半才发现。
// 只配了 OWNER_EMAIL 没配 OWNER_PASSWORD 是典型的一种——静默忽略一半
// 会让人查很久
assertOwnerConfigComplete()

/**
 * 所有者账号的准备放在**监听之前**。
 *
 * 反过来（先监听再建号）会有一个短暂窗口：服务已经能接受登录请求，但账号
 * 还没建好——此时来一个登录请求会得到「密码错误」，而它其实是「马上就好」。
 * 这个窗口只有几十毫秒，但它的表现是随机的登录失败，最难排查。
 */
await ensureOwnerAccount()

const app = createApp()

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`mimir server 监听 http://localhost:${info.port}`)
  console.log(`  数据目录 ${env.dataDir}`)
  console.log(`  笔记目录 ${env.vaultDir}`)
})

export { app }
