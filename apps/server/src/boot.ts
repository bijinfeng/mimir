import { createApp } from './app.js'
import { assertOwnerConfigComplete } from './env.js'
import { ensureOwnerAccount } from './services/bootstrap.js'

/**
 * 启动前的准备 + 路由装配。**两个入口共用这一份**：
 *
 *   src/index.ts  生产入口。起 `@hono/node-server`，自己监听端口
 *   src/dev.ts    开发入口。Vite 的 dev-server 插件自己监听端口，
 *                 它只要一个带 `fetch` 的应用
 *
 * 两处准备的顺序不能变：
 *
 *  1. 配置错误要在**启动早期**暴露，而不是运行到一半才发现。只配了
 *     OWNER_EMAIL 没配 OWNER_PASSWORD 是典型的一种——静默忽略一半会让人查很久
 *  2. 所有者账号要在**能接受请求之前**建好。反过来会有一个短暂窗口：服务
 *     已经在收请求，但账号还没建好——此时登录会得到「密码错误」，
 *     而它其实是「马上就好」。窗口只有几十毫秒，表现却是随机的登录失败
 */
export async function boot() {
  assertOwnerConfigComplete()
  await ensureOwnerAccount()

  return createApp()
}
