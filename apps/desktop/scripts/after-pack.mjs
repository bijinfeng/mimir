import { execFileSync } from 'node:child_process'
import { cp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { finalizeResourceTree } from '../../../scripts/lib/resource-tree.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * electron-builder 的 afterPack 钩子：拷贝宿主运行所需的资源 + ad-hoc 签名。
 *
 * ## 为什么不用 extraResources
 *
 * server 的构建产物里有 `dist/node_modules/.pnpm/…`（vite 的 SSR 构建把
 * 部分传递依赖按 pnpm 结构放进 dist），而 electron-builder 拷贝
 * extraResources 时**会跳过点开头的目录**——打出来的包运行时报
 * `Cannot find module …/.pnpm/fflate/…`（实测踩过）。`fs.cp` 没有这个
 * 过滤。生产依赖以 hoisted 物理目录部署；复制后物化内部文件链接，并拒绝
 * 目录链接或越界链接，确保 NSIS 不携带 Windows junction 或 runner 绝对路径。
 *
 * ## 为什么拷完再签名
 *
 * identity: null 时 builder 完全跳过签名，而 macOS（Sequoia 起，含 Intel）
 * 会把未签名二进制直接 SIGKILL——症状是 app 秒退、零输出、无崩溃日志。
 * ad-hoc 签名（`codesign -s -`）不等于分发签名：仍然不能对外分发
 * （Gatekeeper 照拦），但本机执行合法。正式分发需要开发者证书 + 公证。
 */

export default async function afterPack(context) {
  const { electronPlatformName, appOutDir } = context
  const resources =
    electronPlatformName === 'darwin'
      ? path.join(
          appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'resources',
        )
      : path.join(appOutDir, 'resources')

  // 服务端资源来自 desktop:build 的 runtime 产物（apps/desktop/runtime-build）：
  // 它是 scripts/build-runtime.mjs 的输出，是一个**完整的 runtime 根**——
  // dist / drizzle* / node_modules / manifest.json 都在一起。这里整体复制，
  // 不再按三件套逐项列路径：宿主只认 manifest，产物布局变了不需要改 afterPack。
  //
  // 前端产物仍由 `files: dist/**` 进 asar（主进程的 setup.html 从 asar 加载）；
  // 同时复制到 Resources/renderer 供 sidecar 的静态服务——sidecar 是普通 Node
  // 进程，读不到 asar。
  const runtime = path.join(here, '..', 'runtime-build')
  const jobs = [
    // 窗口图标（Linux / Windows 运行时读它；macOS 用 .app 包里的 .icns）。
    // 与打包配置里的 `mac.icon` 是两个用途：那个进 bundle，这个给 BrowserWindow
    [path.join(here, '..', 'resources', 'icon.png'), path.join(resources, 'icon.png')],
    [runtime, path.join(resources, 'server')],
    // sidecar 是普通 Node 进程，读不到 asar 里的 dist/renderer；静态资源必须
    // 放在 Resources 下。主进程的 setup.html 仍从 asar 加载（Electron 能读）。
    [path.join(here, '..', 'dist', 'renderer'), path.join(resources, 'renderer')],
  ]

  for (const [from, to] of jobs) {
    await rm(to, { recursive: true, force: true })
    await cp(from, to, { recursive: true, verbatimSymlinks: true })
    console.log(
      `[after-pack] ${path.relative(process.cwd(), from)} → ${path.relative(process.cwd(), to)}`,
    )
  }

  const portable = await finalizeResourceTree(path.join(resources, 'server'))
  console.log(
    `[after-pack] portable host resources: ${portable.files} files, ${portable.materialized} file aliases materialized, no directory links`,
  )

  if (electronPlatformName === 'darwin' && context.packager.config.mac?.identity === null) {
    const appPath = path.join(appOutDir, `${context.packager.appInfo.productFilename}.app`)
    console.log(`[after-pack] ad-hoc 签名 → ${appPath}`)
    execFileSync('codesign', ['--force', '--deep', '-s', '-', appPath], { stdio: 'inherit' })
  }
}
