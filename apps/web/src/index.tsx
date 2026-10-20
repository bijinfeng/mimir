import { buildRouter, createApp } from '@mimir/renderer'
import { createRoot } from 'react-dom/client'
import { routeTree } from '@/routeTree.gen'

/**
 * 浏览器部署的入口（D-103 / D-104）。
 *
 * 这一侧只做三件事：组装路由、声明平台、挂载。界面与业务代码全在
 * `@mimir/renderer`，与桌面渲染进程共用一份源码。
 *
 * `routeTree.gen.ts` 由构建期的文件路由插件生成（见 `vite.config.ts`），
 * **产物在本应用**而不是那个包里——桌面端要在基础路由之外挂自己的页面，
 * 两个平台共用一份路由树的话，浏览器会拿到一条它永远到不了的路由。
 */
const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 挂载点')

createApp(createRoot(container), {
  router: buildRouter(routeTree, import.meta.env.BASE_URL, { publicHome: true }),
  // 浏览器没有窗口可控制、也没有桥——这两件事由判别联合表达，
  // 不是「传 undefined」（见 @mimir/renderer 的 platform.tsx）
  platform: { kind: 'browser' },
})
