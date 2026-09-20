import { createRouter } from '@tanstack/react-router'
import { queryClient } from '@/lib/query'
import type { RouterContext } from '@/lib/router-context'
import { routeTree } from './routeTree.gen'

/**
 * 路由实例。
 *
 * routeTree.gen.ts 由 @tanstack/router-plugin 在 dev/build 时生成，
 * 已加入 .gitignore——不要手工编辑它。
 *
 * 把 queryClient 挂进 context，路由守卫与 loader 就能直接预取数据，
 * 不必在组件里再取一遍。
 */
export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  // 显式标注类型，让 router 与其 context 的关联在生成物里可命名
  context: { queryClient } satisfies RouterContext,
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
