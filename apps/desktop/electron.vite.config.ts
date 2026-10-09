import { resolve } from 'node:path'
import { rendererPlugins } from '@mimir/renderer/vite-preset'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { rendererAlias } from './renderer-alias.ts'

/**
 * 桌面端的三段构建（D-103）：main / preload / renderer 由 electron-vite 统一编排。
 *
 * 取代原先那份只打 main 与 preload 的 `vite.config.ts`：渲染进程以前是
 * 「加载 apps/web 的构建产物」，改了前端代码不重新 build 就永远看不到变化
 * （`AGENTS.md` 的坑表记过这条）。现在渲染进程是本包的第三个入口，
 * `electron-vite dev` 三段一起热重载。
 *
 * ## 为什么没有 externalizeDepsPlugin
 *
 * electron-vite 6 把它降级成 `build.externalizeDeps` 配置项（插件已标
 * deprecated），且 main / preload **默认就是 true**——显式写插件反而是
 * 跟着旧文档抄的噪音。
 *
 * ## 为什么 main 与 preload 不写 `format: 'cjs'`
 *
 * electron-vite 的 main / preload 预设已经按 Electron 的兼容面定好了格式与
 * target（preload 在沙箱化 renderer 里必须是 CJS）。原来那份配置手写
 * `rollupOptions.output.format` 是因为用的是裸 Vite，这里不需要再声明一遍。
 */
export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main',
      sourcemap: true,
      minify: false,
      lib: {
        entry: resolve(import.meta.dirname, 'src/main/index.ts'),
      },
    },
  },
  preload: {
    build: {
      outDir: 'dist/preload',
      sourcemap: true,
      minify: false,
      lib: {
        entry: resolve(import.meta.dirname, 'src/preload/index.ts'),
      },
    },
  },
  renderer: {
    /**
     * root 用 electron-vite 的约定（`src/renderer`，HTML 在那里），所以这里
     * 不写 `rolldownOptions.input`——入口就是那份 index.html。
     *
     * `publicDir` 要显式指回包根的 `public/`：root 变了之后 Vite 会去
     * `src/renderer/public` 找，而 pdf.js 的 198 个资产拷在包根那一份里
     * （漏了的症状是中文 PDF 整段空白，不报错）。
     */
    publicDir: resolve(import.meta.dirname, 'public'),
    build: {
      outDir: 'dist/renderer',
      sourcemap: true,
      rolldownOptions: {
        input: {
          index: resolve(import.meta.dirname, 'src/renderer/index.html'),
          /**
           * 首启的使用方式选择页（D-100）。
           *
           * **第二个入口而不是主应用的一条路由**：它必须在没有任何宿主时也能
           * 打开（首启时本地宿主还没起，云端连不上时远端也没有），所以由
           * `file://` 加载——而主应用的路由是 history 模式，file:// 下不工作。
           *
           * 它仍然与主界面同源：同一套 antd 主题、同一个 BrandMark、
           * 同一组窗口控件（D-103 之前它是一份自包含的静态 HTML，
           * 手抄了一套色值变量与一份品牌 path）。
           */
          setup: resolve(import.meta.dirname, 'src/renderer/setup.html'),
        },
      },
    },
    plugins: [
      ...rendererPlugins({
        publicDir: resolve(import.meta.dirname, 'public'),
        generatedRouteTree: resolve(import.meta.dirname, 'src/renderer/routeTree.gen.ts'),
        /**
         * 客户端专属页面（D-104）：目录里按文件路由约定写，挂到 /client 之下。
         *
         * 浏览器部署不传这一项，所以那边**连类型上都没有**这些路由——
         * 一条 `to="/client/about"` 在 web 侧是类型错，而不是运行时 404。
         */
        extraRoutes: {
          directory: resolve(import.meta.dirname, 'src/renderer/routes'),
          pathPrefix: '/client',
        },
      }),
      react({
        /**
         * React Compiler。**两个平台都必须开**：它是构建期的自动记忆化，
         * 关掉的症状是「组件没变快」而不是报错（根 `AGENTS.md` 铁律 1）。
         */
        compiler: { logDiagnostics: true },
      }),
    ],
    resolve: { alias: rendererAlias },
  },
})
