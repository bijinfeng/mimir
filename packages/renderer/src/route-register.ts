import type { buildRouter } from './router'
import type { routeTree } from './routeTree.gen'

/**
 * 路由类型的注册（D-104）。
 *
 * ## 为什么包内也要注册一次
 *
 * `createFileRoute('/login')` 这类调用靠模块增强（`interface Register`）校验
 * 路径字面量。路由实例自 D-104 下沉到各应用之后，包内就没有 router 了——
 * 不注册的话包内每个路由文件都报「`'/login'` 不能赋给 `undefined`」。
 *
 * 这里注册的是**基础路由树**（本包 `src/routes/` 生成的那一份，不含任何平台
 * 专属路由）。它只服务于本包的 typecheck：使用方那边各自注册自己那棵完整的
 * 树，而桌面端那棵是基础树的超集——所以包内代码对两个平台都成立。
 *
 * `routeTree.gen.ts` 由 `pnpm routes:generate` 生成（已 gitignore）。
 */
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof buildRouter<typeof routeTree>>
  }
}
