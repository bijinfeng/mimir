#!/usr/bin/env node
/**
 * 生成某个平台的路由树（`routeTree.gen.ts`）。
 *
 * ## 为什么需要它，而不是只靠 Vite 插件
 *
 * 路由树是**构建产物**（已 gitignore），而 `tsc --noEmit` 需要它先存在。
 * 插件只在 `vite build` / `vite dev` 时生成，于是干净检出直接跑 typecheck
 * 会报「找不到 routeTree.gen.ts」——这条坑在抽包前就记在坑表里。
 *
 * 所以两个平台的 `typecheck` 与 `build` 都先调一次这个脚本。它与
 * `vite-preset.ts` 里那份插件配置**必须同源**，否则「构建能过、typecheck
 * 看到的是另一棵树」——所以两边都从 `routeGeneratorConfig()` 取配置。
 *
 * ## 为什么不用 @tanstack/router-cli
 *
 * 那个 CLI 从 `tsr.config.json` 读配置，而我们的配置里有 `virtualRouteConfig`
 * （基础路由 + 平台专属路由的组合，见 D-104），它表达不了。
 *
 * 用法：`node generate-routes.mjs <generatedRouteTree> [extraDir] [extraPrefix]`
 */
import { resolve } from 'node:path'
import { Generator, getConfig } from '@tanstack/router-generator'
import { PKG_ROOT, routeGeneratorConfig } from './route-config.mjs'

const [treeArg, extraDirArg, extraPrefix] = process.argv.slice(2)

if (!treeArg) {
  console.error('用法：node generate-routes.mjs <generatedRouteTree> [extraDir] [extraPrefix]')
  process.exit(1)
}

/**
 * 路径按**调用方的 cwd** 解析，不是按本包根。
 *
 * 两个应用都从自己的目录调它（`pnpm routes:generate`），传的是
 * `src/routeTree.gen.ts` 这种相对路径。按本包根解析的话文件会静默落到
 * `packages/renderer/src/` 下——脚本照样打印「已生成」，而使用方那边
 * 报「找不到模块」，两条线索指不到一起。
 */
const generatedRouteTree = resolve(process.cwd(), treeArg)
const extraRoutes =
  extraDirArg && extraPrefix
    ? { directory: resolve(process.cwd(), extraDirArg), pathPrefix: extraPrefix }
    : undefined

async function generate(tree, routes) {
  const config = getConfig(
    routeGeneratorConfig({ generatedRouteTree: tree, extraRoutes: routes }),
    PKG_ROOT,
  )
  await new Generator({ root: PKG_ROOT, config }).run()
  console.log(`路由树已生成 → ${tree}`)
}

// 消费方的 tsc 也会读 renderer 的 route-register.ts；干净检出必须先有基础类型树。
// 基础树永远不混入桌面专属路由，每个平台仍保留自己的完整树。
const baseTree = resolve(PKG_ROOT, 'src/routeTree.gen.ts')
if (generatedRouteTree !== baseTree) await generate(baseTree)
await generate(generatedRouteTree, extraRoutes)
