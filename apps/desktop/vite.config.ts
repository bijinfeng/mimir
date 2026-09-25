import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/**
 * 桌面端主进程与 preload 的打包（D-046）。
 *
 * 只有两个入口，产出一个 CJS 的 main.js 与 preload.js：
 *
 *   - preload 必须是 CJS：沙箱化的 renderer 里 preload 不支持 ESM
 *   - 主进程用 CJS 是同一条约定——Electron 对 CJS 入口的兼容面最宽
 *
 * external：`electron` 与 node 内建模块由运行时提供；**其余不打包**——
 * 本包没有运行时第三方依赖（宿主走 apps/server/dist，它自己的依赖
 * 在 server 侧的 node_modules 里按导入文件位置解析）。
 * workspace 源码包（@mimir/*）也不在这里打包：宿主用的是 apps/server 的
 * vite 构建产物（与 Dockerfile 同一形态），不是源码。
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node22',
    sourcemap: true,
    minify: false,
    // Node 目标构建：普通（浏览器向）构建会把 `process.env` 静态替换成
    // `{}`——宿主的环境注入会**静默全部失效**（实测踩过：宿主回落到
    // .env 的 3000 端口与仓库 data/）。与服务端 vite.config 同用
    // `build.ssr: true`，产物保留 process.env。
    ssr: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'src/main.ts'),
        preload: resolve(import.meta.dirname, 'src/preload.ts'),
      },
      output: {
        format: 'cjs',
        entryFileNames: '[name].js',
      },
      external: ['electron', /^node:/],
    },
  },
})
