import { resolve } from 'node:path'
import devServer from '@hono/vite-dev-server'
import { defineConfig, loadEnv } from 'vite'

const repoRoot = resolve(import.meta.dirname, '../..')

/**
 * 服务端的两条链路都由 Vite 驱动（与前端同一套工具、同一个版本）：
 *
 *   dev    `vite`        —— 请求交给 `src/dev.ts` 导出的应用。TS（含 workspace
 *                           内的源码包）由 Vite 按需转换，改完下一个请求就生效
 *   build  `vite build`  —— SSR 构建，两个入口：
 *                             dist/index.js       生产服务（node dist/index.js）
 *                             dist/db/migrate.js  迁移脚本
 *
 * ## 三条不能改的契约
 *
 * 1. **产物要一文件对一文件**（`preserveModules`）。
 *    `lib/static.ts` 用「本文件所在目录往上两级」推导前端产物位置，
 *    `db/migrate.ts` 用 `../../drizzle` 找迁移目录。打成 chunk 后
 *    `import.meta.url` 指向重命名后的 chunk，推导出的根会少一级——
 *    **不报错，只是静态资源 404**。preserveModules 让 dist 镜像 src 的目录结构，
 *    这两个推导就与源码位置一致
 * 2. **第三方依赖保持 external**（SSR 构建的默认行为），由运行环境的
 *    node_modules 提供。`@node-rs/jieba` 是原生模块，打进产物会丢掉平台二进制
 * 3. **workspace 包会被编译进产物**：它们以源码发布（见 D-023），而链接的包
 *    默认不 external——编译 shared 的责任因此落在使用方，正好是我们要的
 *
 * 三条都不是风格问题：违反 1 的症状是静默 404，违反 2 的症状是生产启动才炸。
 */
export default defineConfig(({ mode }) => {
  /**
   * 端口必须与 `src/env.ts` 读的是**同一个来源**（仓库根的 `.env`）。
   *
   * Vite 只把 `.env` 的 `VITE_*` 给到客户端代码，不放进 `process.env`，
   * 所以这里要显式读一次。不读的后果不是报错，而是**改了一半**：
   * `.env` 里写 `PORT=3100`，生产入口听 3100，开发服务器还听 3000——
   * 而前端代理正指着 3000，于是「代码明明改了却没生效」。
   *
   * `process.env` 放在后面：真实环境变量优先于 `.env` 文件，
   * 这样 `PORT=3100 pnpm dev` 这种一次性覆盖也成立。
   */
  const env = { ...loadEnv(mode, repoRoot, ''), ...process.env }

  return {
    plugins: [
      /**
       * 只在 dev 生效：它把每个请求交给 `src/dev.ts` 的 `app.fetch`，
       * 并且自己监听端口——所以服务端入口不能同时再起一个 `@hono/node-server`，
       * 见 `src/dev.ts` 里的说明。
       */
      devServer({ entry: 'src/dev.ts' }),
    ],

    server: {
      // 与前端 dev 代理的默认目标对齐（前端的 vite.config.ts 也读这个 PORT）。
      // strictPort：占用时报错而不是悄悄换端口——换了端口，前端代理就指向一个
      // 没人监听的地址，症状是前端所有请求 502，而两个终端里都看不到原因
      port: Number(env.PORT ?? 3000),
      strictPort: true,
    },

    build: {
      outDir: 'dist',
      emptyOutDir: true,
      ssr: true,
      target: 'node22',
      sourcemap: true,
      // 不压缩：单用户自托管不在乎产物大小，可读的栈帧值钱
      minify: false,
      rolldownOptions: {
        input: {
          index: 'src/index.ts',
          // 名字自带一层目录：配合 preserveModules 产出 dist/db/migrate.js，
          // 与源码同深度——`../../drizzle` 才能指到 apps/server/drizzle
          'db/migrate': 'src/db/migrate.ts',
        },
        output: {
          // 见本文件开头契约 1
          preserveModules: true,
          preserveModulesRoot: resolve(import.meta.dirname, 'src'),
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
        },
      },
    },
  }
})
