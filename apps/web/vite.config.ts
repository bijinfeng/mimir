import { resolve } from 'node:path'
import {
  genofficeFontAlias,
  projectReactSources,
  rendererPlugins,
} from '@mimir/renderer/vite-preset'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { alias } from './alias.ts'

/** 仓库根。`.env` 在那里，服务端的 vite.config.ts 读的也是同一个文件 */
const repoRoot = resolve(import.meta.dirname, '../..')

/**
 * 浏览器部署的构建（D-103）。
 *
 * 这个应用现在只是**薄壳**：一个入口文件，注入浏览器那套平台插槽，然后挂载
 * `@mimir/renderer`。界面与业务代码全在那个包里，与桌面渲染进程共用一份。
 *
 * 渲染层自己需要的构建期插件（文件路由生成、pdf.js 资产）由
 * `@mimir/renderer/vite-preset` 提供——两个平台引同一份，不各写一遍。
 */
export default defineConfig(({ mode }) => {
  /**
   * 后端端口**不在前端这里再写一遍**。
   *
   * 它来自仓库根的 `.env`（与服务端 runtime 的配置加载器同源）。写死 3000 的代价是
   * 「改了 `PORT` 只有一半生效」：后端换了端口，代理还指着旧的，
   * 表现为前端所有请求失败，而两个终端都看不出原因。
   */
  const env = { ...loadEnv(mode, repoRoot, ''), ...process.env }
  const apiTarget = env.VITE_API_TARGET ?? `http://localhost:${env.PORT ?? 3000}`
  return {
    // 资源用相对路径：同一份产物既能挂根路径（Docker），也能挂 /app/mimir/
    // （fnOS 网关）。运行时前缀由 index.html 注入，不靠构建参数。
    base: './',
    plugins: [
      ...rendererPlugins({
        publicDir: resolve(import.meta.dirname, 'public'),
        // 路由树产物落在本应用：桌面端会多挂几条自己的路由，两个平台
        // 共用一份产物的话，浏览器会拿到一条它永远到不了的路由（D-104）
        generatedRouteTree: resolve(import.meta.dirname, 'src/routeTree.gen.ts'),
        // 浏览器没有平台专属页面
      }),
      react({
        /**
         * React Compiler：构建期自动插入记忆化，替代手写 useMemo / useCallback / memo。
         *
         * 为什么开：这个项目的编辑器组件持有大量状态（Tiptap 实例、保存防抖、
         * 查询缓存），手写记忆化的依赖数组很容易写错——写错的代价是难查的
         * 过度重渲染，而不是报错。交给编译器比靠人记得更可靠。
         *
         * 依赖两个包（由 @vitejs/plugin-react 声明为 peer）：
         *   - oxc-transform-react：JSX 转换（OXC 原生，比 Babel 快）
         *   - babel-plugin-react-compiler：编译器本身
         *
         * 目标 React 19，自带 runtime，不需要 react-compiler-runtime。
         */
        compiler: { logDiagnostics: true, sources: projectReactSources },
      }),
    ],
    resolve: { alias: { ...alias, ...genofficeFontAlias } },
    server: {
      port: 5173,
      // 开发时前端在 5173、后端在 3000，代理掉跨源与 cookie 的麻烦。
      // 目标端口见上面的 apiTarget（来自 .env，可用 VITE_API_TARGET 覆盖）
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: false,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  }
})
