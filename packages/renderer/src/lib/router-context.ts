import type { QueryClient } from '@tanstack/react-query'

/**
 * 路由 context 的类型。
 *
 * 单独一个模块，不从 __root.tsx 导出——原因是 @tanstack/router-plugin
 * 生成的 routeTree.gen.ts 需要引用它，而 TS 要求被引用的类型必须可命名
 * （否则报 TS4023）。从路由文件导出会让生成物反向依赖路由实现。
 */
export interface RouterContext {
  queryClient: QueryClient
  /** Explicit Web-only opt-in; desktop and tests default to the workspace. */
  publicHome?: boolean
}
