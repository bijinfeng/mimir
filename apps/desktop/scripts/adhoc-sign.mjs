import { execSync } from 'node:child_process'
import path from 'node:path'

/**
 * electron-builder 的 afterPack 钩子：对产物做 **ad-hoc 签名**（`codesign -s -`）。
 *
 * identity: null 时 builder 会完全跳过签名，而 macOS（Sequoia 起，含 Intel）
 * 会把未签名二进制直接 SIGKILL——症状是 app 秒退、零输出、无崩溃日志。
 * ad-hoc 签名不等于分发签名：仍然不能对外分发（Gatekeeper 照拦），
 * 但本机执行合法。正式分发需要开发者证书 + 公证，见 electron-builder.yml。
 */
export default function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  console.log(`[adhoc-sign] codesign -s - → ${appPath}`)
  execSync(`codesign --force --deep -s - ${JSON.stringify(appPath)}`, { stdio: 'inherit' })
}
