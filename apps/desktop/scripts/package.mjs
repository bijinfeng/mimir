import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { validateVersion } from './release-artifacts.mjs'

const desktopRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

export function nativeArtifactName(arch) {
  if (!['arm64', 'x64'].includes(arch)) throw new Error('Unsupported native build architecture')
  // Builder maps ${arch} to x86_64 for AppImage; release assets use Node's arch names.
  return `mimir-\${version}-\${os}-${arch}.\${ext}`
}

export function signingConfiguration(platform, env) {
  const mode = env.MIMIR_MAC_SIGNING ?? 'adhoc'
  if (!['adhoc', 'signed'].includes(mode))
    throw new Error('MIMIR_MAC_SIGNING must be adhoc or signed')
  if (platform !== 'darwin') return { extraMetadata: { desktopUpdateMode: 'automatic' } }
  if (mode === 'adhoc')
    return {
      extraMetadata: { desktopUpdateMode: 'manual' },
      mac: { identity: null, notarize: false },
    }
  const required = [
    'CSC_LINK',
    'CSC_KEY_PASSWORD',
    'CSC_NAME',
    'APPLE_ID',
    'APPLE_APP_SPECIFIC_PASSWORD',
    'APPLE_TEAM_ID',
  ]
  const missing = required.filter((key) => !env[key]?.trim())
  if (missing.length) throw new Error(`Signed macOS build requires: ${missing.join(', ')}`)
  return {
    extraMetadata: { desktopUpdateMode: 'automatic' },
    forceCodeSigning: true,
    mac: { identity: env.CSC_NAME, notarize: true, hardenedRuntime: true },
  }
}

async function packageDesktop() {
  if (process.argv.length > 2)
    throw new Error(
      'package uses the native runner target; configure MIMIR_BUILD_PLATFORM/ARCH to assert it',
    )
  process.chdir(desktopRoot)
  const pkg = JSON.parse(await readFile('package.json', 'utf8'))
  validateVersion(pkg.version)
  const expectedPlatform = process.env.MIMIR_BUILD_PLATFORM
  const expectedArch = process.env.MIMIR_BUILD_ARCH
  if (expectedPlatform && expectedPlatform !== process.platform)
    throw new Error('Build must run on the target operating system')
  if (expectedArch && expectedArch !== process.arch)
    throw new Error('Build must run on the target CPU architecture')
  const base = parse(await readFile('electron-builder.yml', 'utf8'))
  const signing = signingConfiguration(process.platform, process.env)
  const { build, Platform, Arch } = require('electron-builder')
  const platform = { darwin: Platform.MAC, win32: Platform.WINDOWS, linux: Platform.LINUX }[
    process.platform
  ]
  if (!platform || !['arm64', 'x64'].includes(process.arch))
    throw new Error('Unsupported native build target')
  const config = {
    ...base,
    ...signing,
    artifactName: nativeArtifactName(process.arch),
    mac: { ...base.mac, ...signing.mac },
  }
  // Never allow an inherited GH_TOKEN or builder default to publish from a matrix runner.
  await build({
    config,
    targets: platform.createTarget(undefined, Arch[process.arch]),
    publish: 'never',
  })
  if (process.platform === 'darwin' && process.env.MIMIR_MAC_SIGNING === 'signed') {
    const app = path.join('release', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'mimir.app')
    execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
    execFileSync('spctl', ['--assess', '--type', 'execute', '--verbose', app], { stdio: 'inherit' })
    execFileSync('xcrun', ['stapler', 'validate', app], { stdio: 'inherit' })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await packageDesktop()
