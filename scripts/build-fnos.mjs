import { spawnSync } from 'node:child_process'
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateCommittedReleaseVersion } from '../apps/desktop/scripts/release-artifacts.mjs'
import { verifyFnpack } from './fnos-fnpack.mjs'
import { verifyFnosManifest } from './fnos-artifacts.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'apps/fnos')
const staging = path.join(source, 'staging')
const release = path.join(source, 'release')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status})`)
}

async function present(file) {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

async function copySource() {
  for (const file of ['manifest', 'ICON.PNG', 'ICON_256.PNG']) {
    await cp(path.join(source, file), path.join(staging, file))
  }
  for (const dir of ['config', 'wizard', 'cmd', 'app']) {
    await cp(path.join(source, dir), path.join(staging, dir), { recursive: true })
  }
}

async function main() {
  if (process.platform !== 'linux' || os.arch() !== 'x64') {
    throw new Error('fnOS 包必须在 Linux x86_64 上构建，以获取匹配的原生模块。')
  }
  if (Number(process.versions.node.split('.')[0]) !== 22) {
    throw new Error('fnOS 包必须用 Node 22 构建并验证。')
  }

  const desktopPackage = JSON.parse(
    await readFile(path.join(root, 'apps/desktop/package.json'), 'utf8'),
  )
  const manifest = await readFile(path.join(source, 'manifest'), 'utf8')
  const version = validateCommittedReleaseVersion(desktopPackage.version, manifest)
  verifyFnosManifest(manifest, version)
  const fnpack = process.env.FNOS_FNPACK
  if (!fnpack) throw new Error('Set FNOS_FNPACK to the verified official fnpack 1.2.3 binary')
  verifyFnpack(await readFile(fnpack))
  if (await present(staging)) await rm(staging, { recursive: true, force: true })
  if (await present(release)) await rm(release, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })
  await mkdir(release, { recursive: true })

  // Web 产物 base 中立（`./assets`）：fnOS 的前缀由 runtime 注入，不再重跑构建
  run('pnpm', ['--filter', '@mimir/web', 'build'])
  await copySource()
  const server = path.join(staging, 'app/server')
  // 与 Docker/desktop 同一个拼装实现：manifest、生产依赖、迁移、native 校验
  // 都在 build-runtime 内完成；fnOS 不再自己 `pnpm deploy`。
  run(process.execPath, [
    path.join(root, 'scripts/build-runtime.mjs'),
    '--out',
    server,
    '--web',
    'apps/web/dist',
  ])

  const runtimeManifest = JSON.parse(await readFile(path.join(server, 'manifest.json'), 'utf8'))
  await writeFile(
    path.join(staging, 'app/version.json'),
    `${JSON.stringify(
      {
        productVersion: runtimeManifest.productVersion,
        protocolVersion: runtimeManifest.protocolVersion,
        shellAbi: runtimeManifest.shellAbi,
      },
      null,
      2,
    )}\n`,
  )
  const index = await readFile(path.join(server, 'web/dist/index.html'), 'utf8')
  if (!index.includes('./assets/') || index.includes('/app/mimir/assets/')) {
    throw new Error('Web 构建必须是 base 中立的相对资源（./assets/），前缀由 runtime 注入。')
  }
  run(process.execPath, [path.join(root, 'scripts/fnos-native.mjs'), server])

  run(fnpack, ['build', '--directory', staging], { cwd: release })
  const packages = (await readdir(release)).filter((file) => file.endsWith('.fpk'))
  if (packages.length !== 1) throw new Error('fnpack must generate exactly one .fpk')
  const output = path.join(release, `mimir-${version}-fnos-x64.fpk`)
  await rename(path.join(release, packages[0]), output)
  console.log(`[fnOS] 生成 ${output}`)
}

main().catch((error) => {
  console.error(`[fnOS] ${error.message}`)
  process.exitCode = 1
})
