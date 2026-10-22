/**
 * @mimir/renderer 的导出面（D-103 / D-104）。
 *
 * 这个包**以源码发布**（与 `@mimir/chat` / `@mimir/shared` 同一种做法，
 * 见 D-023）：使用方（`apps/web` 与 `apps/desktop` 的渲染进程）各自用自己的
 * Vite 把它编译进产物。
 *
 * 平台入口要的东西只有三样：挂载、组装 router、以及平台契约的类型。
 * 标题栏实现方要用的品牌件在 `@mimir/renderer/titlebar-kit`。
 */

// 路由类型的注册（模块增强，只有副作用）
import './route-register'

export { createApp } from './main'
export { buildRouter } from './router'
export { runtimeBasePath } from '@mimir/shared/runtime-base'
export { PlatformProvider, useDesktopBridge, useIsDesktop, usePlatform } from './platform'
export type { Platform, TitleBarSlotProps } from './platform'

/**
 * 这两个类型必须出现在**公共导出面**上（D-104）。
 *
 * 路由树（`routeTree.gen.ts`）生成在使用方那边，而它推断出的类型引用了本包
 * 内部的 `RouterContext` 与 `AuthSession`（前者是路由 context，后者是根路由
 * 守卫的返回值）。不导出的话 TS 只能走
 * `node_modules/@mimir/renderer/src/lib/...` 去命名它们，于是整棵树每一个
 * 路由都报 `TS2883: inferred type cannot be named without a reference to …
 * This is likely not portable`。
 *
 * 换句话说：**跨包的文件路由要求路由 context 的类型是公开的**。
 */
export type { RouterContext } from './lib/router-context'
export type { AuthSession } from './lib/api'
