import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildSidecarConfig,
  minimalSidecarEnv,
  runtimeErrorText,
  startSidecar,
  writeSidecarConfig,
  type SidecarHandle,
} from './sidecar.js'
import { EXPECTED_SHELL_ABI } from './runtime-manifest.js'

const MOCK_RUNTIME = `
import { createServer } from 'node:net'
import { readFile, writeFile } from 'node:fs/promises'
const argv = process.argv.slice(2)
const config = JSON.parse(await readFile(argv[argv.indexOf('--config') + 1], 'utf8'))
const server = createServer()
await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(config.listener.port, '127.0.0.1', resolve)
})
await writeFile(config.dataDir + '/boot.json', JSON.stringify({
  argv,
  env: process.env,
  config,
}))
process.send({
  type: 'ready',
  origin: config.publicUrl,
  version: config.product.version,
  protocolVersion: config.product.protocolVersion,
  shellAbi: config.product.shellAbi,
  pid: process.pid,
})
process.on('message', (message) => {
  if (message?.type === 'shutdown') server.close(() => process.exit(0))
})
`

const handles: SidecarHandle[] = []

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close().catch(() => {})))
})

async function fixture(runtimeSource = MOCK_RUNTIME) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mimir-sidecar-'))
  const runtimeRoot = path.join(root, 'runtime')
  const webDist = path.join(root, 'renderer')
  const dataDir = path.join(root, 'data')
  const userData = path.join(root, 'user')
  await mkdir(path.join(runtimeRoot, 'dist/runtime'), { recursive: true })
  await mkdir(webDist, { recursive: true })
  await writeFile(path.join(webDist, 'index.html'), '<html></html>')
  await writeFile(path.join(runtimeRoot, 'package.json'), '{"type":"module"}')
  await writeFile(path.join(runtimeRoot, 'dist/runtime/cli.mjs'), runtimeSource)
  await writeFile(
    path.join(runtimeRoot, 'manifest.json'),
    JSON.stringify({
      name: 'mimir-runtime',
      productVersion: '1.2.3',
      protocolVersion: 1,
      shellAbi: EXPECTED_SHELL_ABI,
      platform: process.platform,
      arch: process.arch,
      entry: 'dist/runtime/cli.mjs',
      library: 'dist/runtime/cli.mjs',
      required: ['dist/runtime/cli.mjs'],
      migrations: { sqlite: 'drizzle-sqlite', postgres: 'drizzle' },
    }),
  )
  return { root, paths: { runtimeRoot, webDist, dataDir, userData } }
}

describe('sidecar config and environment', () => {
  it('writes 0600 config with the token only in the file', async () => {
    const { root, paths } = await fixture()
    try {
      const configPath = path.join(paths.userData, 'runtime-config.json')
      const config = buildSidecarConfig({
        port: 41234,
        productVersion: '1.2.3',
        protocolVersion: 1,
        shellAbi: EXPECTED_SHELL_ABI,
        dataDir: paths.dataDir,
        runtimeRoot: paths.runtimeRoot,
        webDist: paths.webDist,
        authSecret: 'secret-value',
        localToken: 'token-value',
      })
      await writeSidecarConfig(configPath, config)
      expect((await stat(configPath)).mode & 0o777).toBe(0o600)
      const stored = JSON.parse(await readFile(configPath, 'utf8'))
      expect(stored.auth.localToken).toBe('token-value')
      expect(stored.auth.secret).toBe('secret-value')
      expect(stored.listener).toEqual({ kind: 'tcp', host: '127.0.0.1', port: 41234 })
      expect(stored.static.dir).toBe(paths.webDist)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('strips credentials and deployment variables from the child environment', () => {
    const env = minimalSidecarEnv({
      PATH: '/bin',
      HOME: '/home/me',
      AUTH_SECRET: 'secret',
      DATABASE_URL: 'postgres://secret',
      MIMIR_LOCAL_TOKEN: 'token',
      MODEL_API_KEY: 'key',
      S3_SECRET_ACCESS_KEY: 's3',
      OWNER_PASSWORD: 'password',
      TZ: 'Asia/Shanghai',
    })
    expect(env.PATH).toBe('/bin')
    expect(env.HOME).toBe('/home/me')
    expect(env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(env.NODE_ENV).toBe('production')
    for (const key of [
      'AUTH_SECRET',
      'DATABASE_URL',
      'MIMIR_LOCAL_TOKEN',
      'MODEL_API_KEY',
      'S3_SECRET_ACCESS_KEY',
      'OWNER_PASSWORD',
    ]) {
      expect(env[key]).toBeUndefined()
    }
  })

  it('maps stable runtime codes to actionable text', () => {
    expect(runtimeErrorText('PORT_IN_USE', 'EADDRINUSE')).toContain('端口')
    expect(runtimeErrorText('DB_LOCKED', 'busy')).toContain('数据库')
    expect(runtimeErrorText('VERSION_MISMATCH', '1 vs 2')).toContain('版本')
    expect(runtimeErrorText('WHATEVER', 'boom')).toContain('boom')
  })
})

describe('sidecar lifecycle', () => {
  it('forks the runtime entry, waits for IPC ready, and closes idempotently', async () => {
    const { root, paths } = await fixture()
    try {
      const handle = await startSidecar(paths, { productVersion: '1.2.3', localMode: true })
      handles.push(handle)
      expect(handle.pid).toBeGreaterThan(0)
      expect(handle.origin).toContain(`:${handle.port}`)
      expect(handle.localToken).toBeTruthy()

      const boot = JSON.parse(await readFile(path.join(paths.dataDir, 'boot.json'), 'utf8'))
      expect(boot.config.listener.port).toBe(handle.port)
      expect(boot.config.auth.localToken).toBe(handle.localToken)
      expect(boot.argv).not.toContain(handle.localToken)
      expect(boot.env.AUTH_SECRET).toBeUndefined()
      expect(boot.env.MIMIR_LOCAL_TOKEN).toBeUndefined()
      expect(boot.env.ELECTRON_RUN_AS_NODE).toBe('1')
      expect((await stat(path.join(paths.userData, 'runtime-config.json'))).mode & 0o777).toBe(
        0o600,
      )

      await handle.close()
      await handle.close()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('retries PORT_IN_USE three times before surfacing an actionable error', async () => {
    const { root, paths } = await fixture(
      `process.send({ type: 'error', code: 'PORT_IN_USE', message: 'EADDRINUSE' })
       setTimeout(() => process.exit(1), 50)`,
    )
    try {
      await expect(
        startSidecar(paths, { productVersion: '1.2.3', localMode: true }),
      ).rejects.toThrow(/端口/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 15_000)

  it('rejects a ready message whose shellAbi disagrees with the manifest', async () => {
    const { root, paths } = await fixture(
      `process.send({
         type: 'ready',
         origin: 'http://127.0.0.1:1',
         version: '1.2.3',
         protocolVersion: 1,
         shellAbi: 99,
         pid: process.pid,
       })
       setInterval(() => {}, 1000)`,
    )
    try {
      await expect(
        startSidecar(paths, { productVersion: '1.2.3', localMode: true }),
      ).rejects.toThrow(/契约不匹配/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 10_000)

  it('reports an unexpected exit without closing the parent', async () => {
    const { root, paths } = await fixture()
    try {
      const handle = await startSidecar(paths, { productVersion: '1.2.3', localMode: true })
      handles.push(handle)
      const exited = new Promise<Error>((resolve) => handle.onUnexpectedExit(resolve))
      process.kill(handle.pid, 'SIGKILL')
      const error = await exitPromise(exited)
      expect(error.message).toContain('意外退出')
      await handle.close()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

function exitPromise<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('sidecar exit listener timed out')), 3000),
    ),
  ])
}
