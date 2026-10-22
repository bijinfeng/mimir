#!/usr/bin/env node
/**
 * 构建一份可移植的 mimir runtime。
 *
 * 这是 Docker / fnOS / desktop 三个宿主**唯一**的服务端拼装实现：产物布局、
 * 生产依赖、迁移目录、manifest 都由这里决定。宿主的启动代码只读
 * `manifest.json`，不再知道 `dist/`、`drizzle-sqlite/`、`node_modules/` 的具体形状。
 *
 * 关键约束（实测得来，不是风格偏好）：
 *
 * 1. `pnpm deploy` 的目标必须落在**仓库内**。`patchedDependencies` 的相对路径
 *    按目标目录解析，部署到 `/tmp` 或 Docker 的 `/out` 会报
 *    `Failed to read patch file`。所以先部署到 `.runtime-staging/`，再复制到 out。
 * 2. 目标目录必须是空的，且脚本会删除它；`assertDeletableOut()` 拒绝仓库根、
 *    `apps/server` 等源码目录，避免一次参数写错删掉源码。
 * 3. `pnpm deploy` 受 `.npmignore` 影响；部署后还要自己校验入口文件真的在，
 *    不能假设构建产物一定被带上。
 * 4. 只允许原生构建：原生模块（better-sqlite3 / sqlite-vec / jieba / canvas）
 *    必须与目标平台、架构、libc 匹配。
 */
import { spawnSync } from 'node:child_process'
import { cp, mkdir, readFile, readdir, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { finalizeResourceTree } from './lib/resource-tree.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_ROOT = path.join(REPO_ROOT, 'apps/server')
const STAGING_ROOT = path.join(REPO_ROOT, '.runtime-staging')

/** 宿主启动前的最小校验集。native 包也在这里：缺了会在第一次 SQLite/检索才炸。 */
export const REQUIRED_RUNTIME_FILES = [
  'package.json',
  'dist/runtime/cli.js',
  'dist/runtime/index.js',
  'drizzle-sqlite/meta/_journal.json',
  'drizzle/meta/_journal.json',
  'node_modules/better-sqlite3/package.json',
  'node_modules/sqlite-vec/package.json',
  'node_modules/@node-rs/jieba/package.json',
  'node_modules/@napi-rs/canvas/package.json',
]

/** 产物里不允许出现的开发文件。 */
export const DEV_ONLY_PATHS = [
  '.npmignore',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '_verify.mjs',
  '_verify_identifier.mjs',
  'tmp-pdf-test.mts',
  'public',
  'scripts',
  'vite.config.ts',
  'vitest.config.ts',
  'vitest.local.config.ts',
  'vitest.fnos.config.ts',
  'drizzle.config.ts',
  'drizzle-sqlite.config.ts',
  'tsconfig.json',
  'src/test',
]

const USAGE = `用法：node scripts/build-runtime.mjs --out <dir> [选项]

  --out <dir>          产物根（必填；会被清空后重建）
  --web <dir>          前端产物目录，复制为 <out>/web/dist
  --platform <p>       目标平台（默认当前；只允许原生构建）
  --arch <a>           目标架构（默认当前；只允许原生构建）
  --skip-build         跳过 pnpm --filter @mimir/server build
  --help               显示本帮助`

function parseArgs(argv) {
  const result = {
    out: undefined,
    web: undefined,
    platform: process.platform,
    arch: process.arch,
    skipBuild: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help') {
      console.log(USAGE)
      process.exit(0)
    }
    if (argument === '--skip-build') {
      result.skipBuild = true
      continue
    }
    if (!argument.startsWith('--')) throw new Error(`无法识别的参数：${argument}`)
    const [name, inline] = argument.slice(2).split('=', 2)
    const value = inline ?? argv[++index]
    if (!value || value.startsWith('--')) throw new Error(`${name} 需要一个值`)
    if (name === 'out') result.out = value
    else if (name === 'web') result.web = value
    else if (name === 'platform') result.platform = value
    else if (name === 'arch') result.arch = value
    else throw new Error(`未知选项：--${name}`)
  }
  if (!result.out) throw new Error('必须指定 --out')
  return result
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} 失败（${result.status}）`)
}

async function exists(location) {
  try {
    await stat(location)
    return true
  } catch {
    return false
  }
}

async function readJson(location) {
  return JSON.parse(await readFile(location, 'utf8'))
}

/** 只允许在目标平台上原生构建，跨平台会拿到错误的预编译二进制。 */
export function assertNativeTarget(platform, arch) {
  if (platform !== process.platform || arch !== process.arch) {
    throw new Error(
      `runtime 产物只允许原生构建：当前 ${process.platform}/${process.arch}，请求 ${platform}/${arch}`,
    )
  }
}

/**
 * 删除前先证明目标路径是构建目录。
 *
 * 允许两类：
 *   - 仓库外的临时/CI 目录（Docker 的 /out、mktemp）
 *   - 仓库内固定的构建目录（.runtime-staging、desktop runtime-build、fnos staging）
 *
 * 明确拒绝仓库根本身、`apps/server` 这类源码目录，以及任何「包含仓库」的父目录。
 */
export function assertDeletableOut(out) {
  const target = path.resolve(out)
  if (target === REPO_ROOT) throw new Error(`拒绝把仓库根作为产物目录：${target}`)
  if (target === STAGING_ROOT) throw new Error(`拒绝把 staging 根作为产物目录：${target}`)

  const repoInsideOut = path.relative(target, REPO_ROOT)
  if (
    repoInsideOut === '' ||
    (!repoInsideOut.startsWith('..') && !path.isAbsolute(repoInsideOut))
  ) {
    throw new Error(`产物目录不能是仓库的父目录：${target}`)
  }

  // Windows 的 path.relative 用反斜杠；比较前统一成产物清单里的 `/` 形式
  const outInsideRepo = path.relative(REPO_ROOT, target).split(path.sep).join('/')
  if (!outInsideRepo.startsWith('..') && !path.isAbsolute(outInsideRepo)) {
    const allowed =
      outInsideRepo === '.runtime-staging' ||
      outInsideRepo.startsWith('.runtime-staging/') ||
      outInsideRepo === 'apps/desktop/runtime-build' ||
      outInsideRepo.startsWith('apps/desktop/runtime-build/') ||
      outInsideRepo === 'apps/fnos/staging' ||
      outInsideRepo.startsWith('apps/fnos/staging/')
    if (!allowed) {
      throw new Error(
        `仓库内只允许输出到 apps/desktop/runtime-build 或 apps/fnos/staging：${target}`,
      )
    }
  }
}

/** 校验 manifest.required 里的每个文件都真实存在。 */
export async function verifyRuntimeTree(root, required = REQUIRED_RUNTIME_FILES) {
  const runtimeRoot = path.resolve(root)
  const missing = []
  for (const file of required) {
    if (!(await exists(path.join(runtimeRoot, file)))) missing.push(file)
  }
  if (missing.length) {
    throw new Error(`runtime 产物缺少文件：\n  - ${missing.join('\n  - ')}`)
  }
  return { root: runtimeRoot, files: required.length }
}

/** 开发文件不得进入产物。 */
export async function assertPortableLayout(root) {
  const runtimeRoot = path.resolve(root)
  const present = []
  for (const file of DEV_ONLY_PATHS) {
    if (await exists(path.join(runtimeRoot, file))) present.push(file)
  }
  if (present.length) {
    throw new Error(`runtime 产物包含开发文件：\n  - ${present.join('\n  - ')}`)
  }
  const tests = await collectFiles(path.join(runtimeRoot, 'src'))
  const testFiles = tests.filter((file) => file.endsWith('.test.ts'))
  if (testFiles.length) {
    throw new Error(`runtime 产物包含测试：\n  - ${testFiles.join('\n  - ')}`)
  }
}

async function collectFiles(directory, prefix = '') {
  if (!(await exists(directory))) return []
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    const location = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await collectFiles(location, relative)))
    else if (entry.isFile()) files.push(relative)
  }
  return files
}

export function detectLibc(platform = process.platform) {
  if (platform !== 'linux') return 'n/a'
  const report = process.report?.getReport?.()
  return report?.header?.glibcVersionRuntime ? 'glibc' : 'musl'
}

export function gitSha(env = process.env, cwd = REPO_ROOT) {
  if (env.GITHUB_SHA) return env.GITHUB_SHA.slice(0, 40)
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : 'unknown'
}

async function readProductVersion() {
  const pkg = await readJson(path.join(REPO_ROOT, 'apps/desktop/package.json'))
  if (typeof pkg.version !== 'string' || !pkg.version) throw new Error('桌面版本号为空')
  return pkg.version
}

async function readSchemaVersion(root) {
  const journal = await readJson(path.join(root, 'drizzle-sqlite/meta/_journal.json'))
  const last = Array.isArray(journal.entries) ? journal.entries.at(-1) : undefined
  if (!last || !Number.isSafeInteger(last.when)) {
    throw new Error('drizzle-sqlite/meta/_journal.json 缺少可用的 when')
  }
  return last.when
}

async function readRuntimeVersions(root) {
  const module = await import(pathToFileURL(path.join(root, 'dist/runtime/version.js')).href)
  if (!Number.isInteger(module.PROTOCOL_VERSION) || !Number.isInteger(module.SHELL_ABI)) {
    throw new Error('dist/runtime/version.js 没有导出整数 PROTOCOL_VERSION / SHELL_ABI')
  }
  return { protocolVersion: module.PROTOCOL_VERSION, shellAbi: module.SHELL_ABI }
}

/**
 * 生成 manifest。`schemaVersion` 取 SQLite journal 最后一条 `when`，只用于诊断。
 *
 * `web` 传相对路径 `web/dist` 或 null；不传时 manifest 不含 web 字段，宿主不得
 * 假设一定有前端（desktop 的 renderer 在 asar 里）。
 */
export async function buildManifest({
  root,
  platform,
  arch,
  web,
  productVersion,
  protocolVersion,
  shellAbi,
  sha,
}) {
  const required = [...REQUIRED_RUNTIME_FILES]
  if (web) required.push(`${web}/index.html`)
  return {
    name: 'mimir-runtime',
    productVersion,
    protocolVersion,
    shellAbi,
    gitSha: sha,
    platform,
    arch,
    libc: detectLibc(platform),
    node: '>=22',
    entry: 'dist/runtime/cli.js',
    library: 'dist/runtime/index.js',
    migrations: { sqlite: 'drizzle-sqlite', postgres: 'drizzle' },
    ...(web ? { web } : {}),
    required,
    schemaVersion: await readSchemaVersion(root),
  }
}

async function copyWeb(staging, webArgument) {
  const web = path.resolve(REPO_ROOT, webArgument)
  if (!(await exists(path.join(web, 'index.html')))) {
    throw new Error(`--web 目录缺少 index.html：${web}`)
  }
  const destination = path.join(staging, 'web/dist')
  await rm(destination, { recursive: true, force: true })
  await mkdir(path.dirname(destination), { recursive: true })
  await cp(web, destination, { recursive: true, verbatimSymlinks: true })
  return 'web/dist'
}

async function deployServer(staging) {
  await rm(staging, { recursive: true, force: true })
  await mkdir(path.dirname(staging), { recursive: true })
  run('pnpm', [
    '--filter',
    '@mimir/server',
    'deploy',
    '--prod',
    '--node-linker',
    'hoisted',
    path.relative(REPO_ROOT, staging),
  ])

  // pnpm deploy 会在目标里写锁文件/工作区描述与 .npmignore；运行时都不需要。
  for (const file of ['.npmignore', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
    await rm(path.join(staging, file), { force: true })
  }

  const pkg = await readJson(path.join(staging, 'package.json'))
  if (pkg.name !== '@mimir/server') throw new Error('deploy 产物不是 @mimir/server')
  return pkg
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  assertNativeTarget(args.platform, args.arch)
  const out = path.resolve(process.cwd(), args.out)
  assertDeletableOut(out)

  const staging = path.join(STAGING_ROOT, `${args.platform}-${args.arch}-${process.pid}`)
  try {
    if (!args.skipBuild) run('pnpm', ['--filter', '@mimir/server', 'build'])
    await deployServer(staging)
    const web = args.web ? await copyWeb(staging, args.web) : null

    await verifyRuntimeTree(staging)
    await assertPortableLayout(staging)
    const portable = await finalizeResourceTree(staging)

    const { protocolVersion, shellAbi } = await readRuntimeVersions(staging)
    const manifest = await buildManifest({
      root: staging,
      platform: args.platform,
      arch: args.arch,
      web,
      productVersion: await readProductVersion(),
      protocolVersion,
      shellAbi,
      sha: gitSha(),
    })

    await rm(out, { recursive: true, force: true })
    await mkdir(out, { recursive: true })
    await cp(staging, out, { recursive: true, verbatimSymlinks: true })
    await writeFile(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    await verifyRuntimeTree(out, manifest.required)

    const files = await collectFiles(out)
    console.log(
      JSON.stringify(
        {
          out,
          productVersion: manifest.productVersion,
          protocolVersion: manifest.protocolVersion,
          shellAbi: manifest.shellAbi,
          platform: manifest.platform,
          arch: manifest.arch,
          libc: manifest.libc,
          files: files.length,
          materialized: portable.materialized,
          web: manifest.web ?? null,
        },
        null,
        2,
      ),
    )
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => {})
    await rmdir(STAGING_ROOT).catch(() => {})
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[runtime] ${error.message}`)
    process.exitCode = 1
  })
}

// 显式导出内部路径，测试可以按需构造 fixture，而不复制常量
export const RUNTIME_PATHS = {
  repoRoot: REPO_ROOT,
  serverRoot: SERVER_ROOT,
  stagingRoot: STAGING_ROOT,
}
