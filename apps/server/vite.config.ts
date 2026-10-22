import { resolve } from 'node:path'
import devServer from '@hono/vite-dev-server'
import { defineConfig, loadEnv } from 'vite'

const repoRoot = resolve(import.meta.dirname, '../..')

/**
 * 服务端的两条链路都由 Vite 驱动（与前端同一套工具、同一个版本）：
 *
 *   dev    `vite`        —— 请求交给 `src/dev.ts` 导出的应用。TS（含 workspace
 *                           内的源码包）由 Vite 按需转换，改完下一个请求就生效
 *   build  `vite build`  —— SSR 构建，入口：
 *                             dist/index.js              兼容入口（旧 CMD / 桌面 / fnOS）
 *                             dist/runtime/cli.js        runtime 进程入口（新宿主）
 *                             dist/runtime/index.js      runtime 公共 API
 *                             dist/runtime/migrate-cli.js 迁移/重建索引
 *                             dist/db/migrate.js         迁移实现（兼容旧路径）
 *
 * ## 三条不能改的契约
 *
 * 1. **产物要一文件对一文件**（`preserveModules`）。
 *    `defaultServerRoot()` 用「本文件所在目录往上两级」定位迁移目录与产物根。
 *    打成 chunk 后 `import.meta.url` 指向重命名后的 chunk，推导出的根会少一级——
 *    **不报错，只是找不到迁移目录**。preserveModules 让 dist 镜像 src 的目录结构，
 *    这些推导就与源码位置一致
 * 2. **第三方依赖保持 external**（SSR 构建的默认行为），由运行环境的
 *    node_modules 提供。`@node-rs/jieba` 是原生模块，打进产物会丢掉平台二进制
 * 3. **workspace 包会被编译进产物**：它们以源码发布（见 D-023），而链接的包
 *    默认不 external——编译 shared 的责任因此落在使用方，正好是我们要的
 *
 * 三条都不是风格问题：违反 1 的症状是启动找不到迁移目录，违反 2 的症状是生产启动才炸。
 */
export default defineConfig(({ mode }) => {
  /**
   * 端口必须与 runtime 的配置加载器读的是**同一个来源**（仓库根的 `.env`）。
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
       *
       * `injectClientScript: false`：这个 dev server **不服务自己的 HTML 页面**
       * （前端页面由 `apps/web` 的 dev server 提供），它只服务 API。而
       * `@hono/vite-dev-server` 默认按 `content-type: text/html` 往响应体末尾
       * 追加 `<script>import("/@vite/client")</script>`（`dev-server.mjs:126`），
       * **不看 `Content-Disposition` 是 inline 还是 attachment**。于是上传的
       * `.html` 原件走 `/api/documents/:id/file` 取回时多出 42 字节，编辑器把
       * 它当文件内容显示出来、保存一次就写进用户的文件——原件字节 =
       * 磁盘上的文件这条前提在开发路径上悄悄不成立（实测 619 B → 659/661 B）。
       */
      devServer({ entry: 'src/dev.ts', injectClientScript: false }),
    ],

    // Canvas contains platform .node binaries; only the isolated Node worker loads it.
    // Vite's browser dependency optimizer must never parse those binaries.
    optimizeDeps: { exclude: ['@napi-rs/canvas'] },
    // During builds Vite checks default external resolution from this package root.
    // S3 belongs to the workspace storage plugin, so that lookup cannot see it
    // under pnpm's isolated layout. Keep the SDK external explicitly: deploying
    // the plugin supplies its dependency, without emitting deep .pnpm ESM chunks.
    ssr: { external: ['@napi-rs/canvas', '@aws-sdk/client-s3'] },

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
          'runtime/cli': 'src/runtime/cli.ts',
          'runtime/index': 'src/runtime/index.ts',
          'runtime/migrate-cli': 'src/runtime/migrate-cli.ts',
          // 保留旧入口：外部脚本可能还在 `node dist/db/migrate.js`。
          // 名字自带一层目录，配合 preserveModules 与源码同深度。
          'db/migrate': 'src/db/migrate.ts',
          'services/chat-attachment-worker': 'src/services/chat-attachment-worker.ts',
          'plugins/attachment-parser': 'src/plugins/attachment-parser.ts',
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
