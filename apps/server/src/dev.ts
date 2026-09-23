import { boot } from './boot.js'

/**
 * 开发入口。
 *
 * Vite 的 `@hono/vite-dev-server` 自己监听端口、把每个请求交给这里导出的
 * `app.fetch`，所以**不能**像生产入口那样再调一次 `serve()`——两个东西抢
 * 同一个端口，症状是 EADDRINUSE 而不是「谁赢了」。
 *
 * 生产入口是 `src/index.ts`（构建后跑 `node dist/index.js`）。
 */
export default await boot()
