import { createRouter } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { queryClient } from './lib/query'
import type { RouterContext } from './lib/router-context'

/**
 * 按平台组装路由实例（D-104）。
 *
 * ## 为什么路由树由使用方传进来
 *
 * `routeTree.gen.ts` 是 `@tanstack/router-plugin` 在构建期生成的，而**生成一份
 * 只能有一份**（插件的 `generatedRouteTree` 是单值）。桌面端要挂自己的页面，
 * 就必须由它自己那次构建去生成——两个平台各生成一棵树，各自调这个工厂。
 *
 * 运行时合并走不通：`Route._addFileChildren` 是**替换**语义
 * （`router-core/dist/esm/route.js`，实测确认），追加子路由会把原有的覆盖掉；
 * `createRouter` 也只在初始化时 `buildRouteTree()` 一次，没有 merge API。
 *
 * ## 但配置只有这一份
 *
 * `defaultPreload`、`scrollRestoration`、挂进 context 的 queryClient——
 * 这些是**产品决定**，不是平台差异。两个应用各写一遍必然漂移（一边开了
 * 预取一边没开，而那只在慢网络下看得出来）。
 *
 * @param routeTree - 该平台构建期生成的路由树
 */
export function buildRouter<TRouteTree extends AnyRoute>(routeTree: TRouteTree) {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    // 把 queryClient 挂进 context，路由守卫与 loader 就能直接预取数据，
    // 不必在组件里再取一遍
    context: { queryClient } satisfies RouterContext,
    scrollRestoration: true,
  })
}
