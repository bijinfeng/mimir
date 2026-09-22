import { defineConfig } from 'tsdown'

/**
 * 服务端构建：把 TS（含 `@mimir/shared` 的源码）编译成可直接运行的 JS。
 *
 * 为什么必须打包而不是 `tsc` 直出：`@mimir/shared` 以**源码**形式发布，
 * 而 Node 不能执行 node_modules 里的 .ts，所以「编译 shared」这件事落在使用方。
 * 前端由 Vite 负责，服务端由这里负责——把 shared 的源码一起编译进产物。
 *
 * `unbundle`（保持 src 的目录结构，一文件对一文件）不是审美选择：
 * `lib/static.ts` 用「本文件所在目录往上两级」推导前端产物位置，
 * 而打包成 chunk 后 `import.meta.url` 指向的是重命名后的 chunk
 * （dist/static-xxxx.js），推导出来的根目录会少一级——不报错，只是找不到前端。
 * 一文件对一文件时这个推导与 `tsc` 直出完全一致。
 */
export default defineConfig({
  entry: ['src/**/*.ts', '!src/**/*.test.ts', '!src/test/**'],
  outDir: 'dist',
  unbundle: true,
  clean: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  // 没有包消费 dist 里的类型声明；类型检查由 `pnpm typecheck` 负责
  dts: false,
  // package.json 是 "type": "module"，保持 .js 才能让 dist/index.js 照常启动
  outExtensions: () => ({ js: '.js' }),
  deps: {
    /**
     * 只有 workspace 内的 shared 需要编译进产物（这正是「交给使用方编译」）。
     * 其余依赖保持 external，由运行环境的 node_modules 提供——
     * @node-rs/jieba 这类原生模块更是必须如此。
     */
    alwaysBundle: ['@mimir/shared'],
  },
})
