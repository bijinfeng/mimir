import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * fnOS 的薄宿主。
 *
 * 它只做四件事：
 *   1. 读受保护的 config.json（所有者凭据与 authSecret）
 *   2. 读 runtime 产物里的 manifest.json，与包根 version.json 做产品版本握手
 *   3. 把 manifest 的版本/入口/迁移/静态目录翻译成 RuntimeConfig
 *   4. 调 startRuntime() 并把 SIGINT/SIGTERM 转成优雅关停
 *
 * 这里**不再设置** MIMIR_FNOS_SOCKET / MIMIR_BASE_PATH / WEB_DIST / DATABASE_URL
 * 这套旧环境变量：部署事实由 manifest + 本文件的显式配置给出，core 不知道 fnOS。
 */

const appDest = process.env.TRIM_APPDEST
const etc = process.env.TRIM_PKGETC
const varDir = process.env.TRIM_PKGVAR
if (!appDest || !etc || !varDir) throw new Error('fnOS 未提供 Mimir 所需目录。')

const runtimeRoot = path.join(appDest, 'server')
const dataDir = path.join(varDir, 'data')

async function report(message) {
  const location = process.env.TRIM_TEMP_LOGFILE
  if (location) await writeFile(location, `${message}\n`)
  else console.error(message)
}

async function main() {
  const configPath = path.join(etc, 'config.json')
  const configStat = await stat(configPath)
  if (configStat.mode & 0o077) throw new Error('Mimir 配置文件权限过宽，应为 0600。')
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  if (!config.ownerEmail || !config.ownerPassword || !config.authSecret) {
    throw new Error('Mimir 所有者配置不完整。')
  }

  const manifest = JSON.parse(await readFile(path.join(runtimeRoot, 'manifest.json'), 'utf8'))
  const expected = JSON.parse(await readFile(path.join(appDest, 'version.json'), 'utf8'))
  if (!manifest.productVersion || !expected.productVersion) {
    throw new Error('runtime manifest 或 version.json 缺少 productVersion。')
  }
  if (manifest.productVersion !== expected.productVersion) {
    throw new Error(
      `应用版本与 runtime 产物不一致：包 ${expected.productVersion}，runtime ${manifest.productVersion}。`,
    )
  }

  for (const file of Array.isArray(manifest.required) ? manifest.required : []) {
    await stat(path.join(runtimeRoot, file))
  }

  const { PROTOCOL_VERSION, SHELL_ABI } = await import(
    pathToFileURL(path.join(runtimeRoot, 'dist/runtime/version.js')).href
  )
  if (manifest.protocolVersion !== PROTOCOL_VERSION || manifest.shellAbi !== SHELL_ABI) {
    throw new Error(
      `runtime 契约版本不一致：manifest ${manifest.protocolVersion}/${manifest.shellAbi}，` +
        `二进制 ${PROTOCOL_VERSION}/${SHELL_ABI}。`,
    )
  }

  const { collectSettingsEnv, startRuntime } = await import(
    pathToFileURL(path.join(runtimeRoot, 'dist/runtime/index.js')).href
  )

  // 先取设置项快照（MODEL_* / S3_* / TZ …），再把宿主凭据从进程环境里删掉
  const settingsEnv = collectSettingsEnv(process.env)
  const miniappEnabled = process.env.MIMIR_MINIAPP_ENABLED === '1'
  for (const key of [
    'MIMIR_LOCAL_MODE',
    'MIMIR_LOCAL_TOKEN',
    'MIMIR_FNOS_SOCKET',
    'MIMIR_BASE_PATH',
    'MIMIR_MINIAPP_ENABLED',
    'WEB_DIST',
    'DATABASE_URL',
    'OWNER_EMAIL',
    'OWNER_PASSWORD',
    'AUTH_SECRET',
  ]) {
    delete process.env[key]
  }
  process.env.NODE_ENV = 'production'
  process.env.DATA_DIR = dataDir

  const runtime = await startRuntime({
    product: {
      version: manifest.productVersion,
      protocolVersion: manifest.protocolVersion,
      shellAbi: manifest.shellAbi,
    },
    nodeEnv: 'production',
    dataDir,
    repoRoot: appDest,
    database: { kind: 'sqlite', file: path.join(dataDir, 'mimir.db') },
    listener: { kind: 'unix', path: path.join(appDest, 'app.sock') },
    publicUrl: 'http://localhost',
    auth: {
      secret: config.authSecret,
      owner: { email: config.ownerEmail, password: config.ownerPassword },
      fnosGateway: { basePath: '/app/mimir' },
      trustedOrigins: [],
      cookiePath: '/app/mimir',
      secureCookies: false,
      failClosedOwner: true,
    },
    ...(manifest.web
      ? { static: { dir: path.join(runtimeRoot, manifest.web), basePath: '/app/mimir/' } }
      : {}),
    migrations: {
      sqlite: path.join(runtimeRoot, 'drizzle-sqlite'),
      postgres: path.join(runtimeRoot, 'drizzle'),
    },
    miniappEnabled,
    settingsEnv,
  })

  const shutdown = (signal) => {
    void runtime.close().then(
      () => process.exit(0),
      (error) => {
        void report(`Mimir 关停失败（${signal}）：${error?.message ?? error}`).then(() =>
          process.exit(1),
        )
      },
    )
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => shutdown(signal))
}

main().catch(async (error) => {
  await report(error?.message ?? String(error))
  process.exitCode = 1
})
