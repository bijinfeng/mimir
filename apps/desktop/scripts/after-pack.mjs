import { execSync } from 'node:child_process'
import { cp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
 * 过滤，点目录、符号链接（解引用）都按真实内容拷贝。
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

  // 服务端的三份资源来自 desktop:build 的 deploy 产物（apps/desktop/server-deploy）：
  // 它是 `pnpm --filter @mimir/server deploy --prod` 的输出，dist / drizzle-sqlite /
  // node_modules 三件套齐全且 node_modules 已按生产依赖裁剪。
  //
  // **前端产物不在这里拷**（D-103）：渲染进程已经是本包 electron-vite 的第三个
  // 入口，产物在 `dist/renderer`，由打包配置的 `files: dist/**` 进 asar。
  const deploy = path.join(here, '..', 'server-deploy')
  const jobs = [
    // 窗口图标（Linux / Windows 运行时读它；macOS 用 .app 包里的 .icns）。
    // 与打包配置里的 `mac.icon` 是两个用途：那个进 bundle，这个给 BrowserWindow
    [path.join(here, '..', 'resources', 'icon.png'), path.join(resources, 'icon.png')],
    [path.join(deploy, 'dist'), path.join(resources, 'server', 'dist')],
    [path.join(deploy, 'drizzle-sqlite'), path.join(resources, 'server', 'drizzle-sqlite')],
    [path.join(deploy, 'node_modules'), path.join(resources, 'server', 'node_modules')],
  ]

  for (const [from, to] of jobs) {
    await rm(to, { recursive: true, force: true })
    await cp(from, to, { recursive: true, verbatimSymlinks: true })
    console.log(
      `[after-pack] ${path.relative(process.cwd(), from)} → ${path.relative(process.cwd(), to)}`,
    )
  }

  if (electronPlatformName === 'darwin') {
    const appPath = path.join(appOutDir, `${context.packager.appInfo.productFilename}.app`)
    console.log(`[after-pack] ad-hoc 签名 → ${appPath}`)
    execSync(`codesign --force --deep -s - ${JSON.stringify(appPath)}`, { stdio: 'inherit' })
  }
}
