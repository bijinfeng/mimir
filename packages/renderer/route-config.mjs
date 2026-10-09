import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { physical, rootRoute } from '@tanstack/virtual-file-routes'

/**
 * 路由生成的配置——**唯一一份**（D-104）。
 *
 * 两个消费方：
 *   - `vite-preset.ts` 的 `tanstackRouter()` 插件（构建与开发时生成）
 *   - `generate-routes.mjs`（typecheck 之前生成，插件那时还没跑）
 *
 * 各写一遍的代价很具体：两边的 `virtualRouteConfig` 一旦漂移，就会出现
 * 「构建能过，但 typecheck 看到的是另一棵路由树」——而那种分叉不报错，
 * 只是某个平台的某条路由在类型上不存在。
 *
 * 写成 `.mjs` 而不是 `.ts`：`generate-routes.mjs` 要用 node 直接跑
 * （它排在 tsc 之前，那时还没有任何编译产物可用）。
 */

/** 本包根目录。fileURLToPath 而不是 url.pathname：仓库路径里有中文 */
export const PKG_ROOT = dirname(fileURLToPath(import.meta.url))

/** 基础路由所在目录（本包的 src/routes/） */
const BASE_ROUTES = join(PKG_ROOT, 'src/routes')

/**
 * @param {object} options
 * @param {string} options.generatedRouteTree - 生成的路由树写到哪（每个平台一份）
 * @param {{ directory: string, pathPrefix: string } | undefined} [options.extraRoutes]
 *        这个平台独有的路由目录与挂载前缀
 */
export function routeGeneratorConfig({ generatedRouteTree, extraRoutes }) {
  return {
    target: 'react',
    autoCodeSplitting: true,
    routesDirectory: BASE_ROUTES,
    generatedRouteTree,
    /**
     * 用 `virtualRouteConfig` 而不是直接给 `routesDirectory`，是因为要支持
     * 「基础路由 + 这个平台独有的路由」，而 `routesDirectory` 只能给一个目录。
     *
     * `physical()` 能挂载**多个**目录，包括跨包的——实测确认：生成器对目录
     * 逃逸不做限制，导入路径按相对计算，`autoCodeSplitting` 对外部目录的
     * 文件同样生效。
     *
     * 运行时合并两棵树走不通：`Route._addFileChildren` 是**替换**语义，
     * 而 `createRouter` 只在初始化时 `buildRouteTree()` 一次。
     */
    virtualRouteConfig: rootRoute('__root.tsx', [
      // 基础路由：本包 src/routes/ 下的全部
      physical('', '.'),
      // 平台专属（physical 的第二个参数相对 routesDirectory 解析）
      ...(extraRoutes
        ? [physical(extraRoutes.pathPrefix, relative(BASE_ROUTES, extraRoutes.directory))]
        : []),
    ]),
  }
}
