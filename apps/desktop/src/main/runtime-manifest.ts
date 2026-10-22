import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

/**
 * 桌面壳读取的 runtime 产物清单。
 *
 * 宿主**只认 manifest**：入口、必需文件、平台/架构、版本都在这里，主进程不再
 * 知道 `dist/runtime/cli.js` 或 `drizzle-sqlite` 的具体布局。校验失败要在
 * fork 之前发生，并且错误里点名缺了哪个文件与修复命令。
 */

/** shell ↔ sidecar 的 IPC/生命周期契约；改消息形状时递增（与 runtime/version.ts 对齐）。 */
export const EXPECTED_SHELL_ABI = 1

export interface RuntimeManifest {
  name: string
  productVersion: string
  protocolVersion: number
  shellAbi: number
  platform: string
  arch: string
  entry: string
  library: string
  required: string[]
  migrations: { sqlite: string; postgres: string }
  [key: string]: unknown
}

export interface ManifestExpectations {
  productVersion: string
  platform?: NodeJS.Platform
  arch?: string
  shellAbi?: number
}

function safeRelative(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`manifest.${field} 不是非空字符串`)
  if (
    path.isAbsolute(value) ||
    value.includes('\\') ||
    value.includes(':') ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`manifest.${field} 必须是产物内的相对路径：${value}`)
  }
  return value
}

async function exists(location: string): Promise<boolean> {
  try {
    await stat(location)
    return true
  } catch {
    return false
  }
}

/**
 * 读取并校验 `<runtimeRoot>/manifest.json`。
 *
 * 校验顺序有意从「产物完整性」到「版本兼容」：先列缺文件，用户能直接
 * 重跑构建；再报版本/平台不匹配，那说明装错了包或客户端与运行时不同步。
 */
export async function readRuntimeManifest(
  runtimeRoot: string,
  expectations: ManifestExpectations,
): Promise<RuntimeManifest> {
  const root = path.resolve(runtimeRoot)
  const manifestPath = path.join(root, 'manifest.json')
  let raw: string
  try {
    raw = await readFile(manifestPath, 'utf8')
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      throw new Error(`缺少 runtime manifest：${manifestPath}。修复：pnpm desktop:build`)
    }
    throw error
  }

  let manifest: RuntimeManifest
  try {
    manifest = JSON.parse(raw) as RuntimeManifest
  } catch (error) {
    throw new Error(`runtime manifest 不是合法 JSON：${manifestPath}`, { cause: error })
  }

  if (manifest.name !== 'mimir-runtime') {
    throw new Error(`runtime manifest 的 name 不是 mimir-runtime：${String(manifest.name)}`)
  }
  safeRelative(manifest.entry, 'entry')
  safeRelative(manifest.library, 'library')
  if (!Array.isArray(manifest.required)) throw new Error('runtime manifest 缺少 required 数组')
  const required = manifest.required.map((file, index) => safeRelative(file, `required[${index}]`))

  const platform = expectations.platform ?? process.platform
  const arch = expectations.arch ?? process.arch
  if (manifest.platform !== platform || manifest.arch !== arch) {
    throw new Error(
      `runtime 产物平台不匹配：需要 ${platform}/${arch}，产物是 ${String(manifest.platform)}/${String(manifest.arch)}`,
    )
  }

  const missing = []
  for (const file of required) {
    if (!(await exists(path.join(root, file)))) missing.push(file)
  }
  if (missing.length) {
    throw new Error(
      `runtime 产物不完整（${root}）：\n  - ${missing.join('\n  - ')}\n修复：pnpm desktop:build`,
    )
  }

  if (manifest.productVersion !== expectations.productVersion) {
    throw new Error(
      `客户端与 runtime 版本不匹配：客户端 ${expectations.productVersion}，runtime ${String(manifest.productVersion)}`,
    )
  }
  const expectedShellAbi = expectations.shellAbi ?? EXPECTED_SHELL_ABI
  if (manifest.shellAbi !== expectedShellAbi) {
    throw new Error(
      `客户端与 runtime 的 shellAbi 不匹配：期望 ${expectedShellAbi}，实际 ${String(manifest.shellAbi)}`,
    )
  }
  if (!Number.isInteger(manifest.protocolVersion) || manifest.protocolVersion <= 0) {
    throw new Error('runtime manifest 的 protocolVersion 不是正整数')
  }
  if (!Number.isInteger(manifest.shellAbi) || manifest.shellAbi <= 0) {
    throw new Error('runtime manifest 的 shellAbi 不是正整数')
  }
  if (
    !manifest.migrations ||
    typeof manifest.migrations.sqlite !== 'string' ||
    typeof manifest.migrations.postgres !== 'string'
  ) {
    throw new Error('runtime manifest 缺少 migrations.sqlite/postgres')
  }

  return manifest
}
