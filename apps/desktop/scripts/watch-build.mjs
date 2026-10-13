#!/usr/bin/env node
/**
 * 桌面端开发态的增量构建（`pnpm build:watch`）。
 *
 * electron-vite 6.0.0-beta.7 的 `build` 子命令既不注册 `--watch` 选项，
 * 还会在 `build()` 内部把 `viteConfig.build.watch` 强制置 null（见其
 * `dist/chunks/lib-DY7PWz4t.js`）。因此直接 `electron-vite build --watch`
 * 会报 `Unknown option --watch`，且即便绕过 CLI 也不会真的进入 watch。
 *
 * 这里改用 electron-vite 导出的 `resolveConfig` 解析出三段（main /
 * preload / renderer）的 vite 配置，再逐段调用 vite 的 `build()` 并显式
 * 打开 `build.watch`。产物路径、插件、别名与 `electron-vite build` 完全
 * 一致——只是多了文件监听。
 *
 * 与 `desktop-dev.mjs` 配合：宿主完整构建并启动 electron 后，本脚本接管
 * 增量构建，窗口地址不变（同源前提 D-046 不破）。渲染进程改完需刷新窗口；
 * 主进程与 preload 的新产物要重启桌面进程才会加载。
 */
import { resolveConfig } from 'electron-vite'
import { build as viteBuild } from 'vite'

const resolved = await resolveConfig({}, 'build', 'production')
const config = resolved.config

if (!config) {
  console.error('[watch-build] 未能解析 electron-vite 配置')
  process.exit(1)
}

const watchers = []

for (const target of ['main', 'preload', 'renderer']) {
  const viteConfig = config[target]
  if (!viteConfig) continue
  viteConfig.build = { ...viteConfig.build, watch: {} }
  const watcher = await viteBuild(viteConfig)
  if (watcher && typeof watcher.close === 'function') {
    watchers.push(watcher)
  }
}

async function shutdown() {
  await Promise.allSettled(watchers.map((w) => w.close()))
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
