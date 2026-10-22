import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  loadRuntimeConfigFile,
  loadRuntimeConfigFromEnv,
  runtimeConfigSchema,
  toServerConfig,
  type RuntimeConfig,
} from '../runtime/config.js'

/**
 * RuntimeConfig 的映射与校验。
 *
 * 这些用例不经过 `configureServer()`：配置层必须是纯函数，才能在宿主进程
 * 启动前就说清「这份 env 会被解释成什么」。fnOS / 本地模式的错误分支尤其
 * 重要——它们以前散落在 `env.ts` 的模块顶层，出错时只能看到一行 throw。
 */

const serverRoot = resolve(import.meta.dirname, '../..')
let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'mimir-runtime-config-'))
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

function baseEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DATA_DIR: join(root, 'data'),
    DATABASE_URL: `file:${join(root, 'data', 'mimir.db')}`,
    AUTH_SECRET: 'test-secret-only-for-tests-0123456789',
    ...overrides,
  }
}

function load(overrides: NodeJS.ProcessEnv = {}): RuntimeConfig {
  return loadRuntimeConfigFromEnv({
    env: baseEnv(overrides),
    serverRoot,
    loadEnvFile: false,
  })
}

describe('RuntimeConfig 从 env 映射', () => {
  it('把路径、监听、认证与设置快照翻译成可序列化对象', () => {
    const config = load({
      PORT: '4321',
      WEB_ORIGIN: 'http://localhost:5173',
      SERVER_URL: 'http://localhost:4321',
      OWNER_EMAIL: 'admin@example.com',
      OWNER_PASSWORD: '12345678',
      MODEL_API_KEY: 'sk-test',
      MODEL_BASE_URL: 'https://example.test/v1',
      MIMIR_MINIAPP_ENABLED: '1',
    })

    expect(config.nodeEnv).toBe('test')
    expect(config.database).toEqual({
      kind: 'sqlite',
      file: join(root, 'data', 'mimir.db'),
    })
    expect(config.listener).toEqual({ kind: 'tcp', port: 4321 })
    expect(config.publicUrl).toBe('http://localhost:4321')
    expect(config.auth.owner).toEqual({
      email: 'admin@example.com',
      password: '12345678',
    })
    expect(config.auth.trustedOrigins).toEqual(['http://localhost:5173'])
    expect(config.auth.secureCookies).toBe(false)
    expect(config.settingsEnv.MODEL_API_KEY).toBe('sk-test')
    expect(config.settingsEnv.MODEL_BASE_URL).toBe('https://example.test/v1')
    expect(config.miniappEnabled).toBe(true)
    // 迁移目录显式给出，运行时不依赖 import.meta.url 的深度
    expect(config.migrations).toEqual({
      sqlite: resolve(serverRoot, 'drizzle-sqlite'),
      postgres: resolve(serverRoot, 'drizzle'),
    })
  })

  it('Postgres 协议头切驱动，WEB_DIST 变成静态配置', () => {
    const config = load({
      DATABASE_URL: 'postgres://user:pass@localhost:5432/mimir_test',
      WEB_DIST: join(root, 'web'),
      MIMIR_BASE_PATH: '/app/mimir',
    })
    expect(config.database.kind).toBe('postgres')
    expect(config.static).toEqual({
      dir: join(root, 'web'),
      basePath: '/app/mimir',
    })
  })

  it('本地模式：令牌必填，监听强制回环', () => {
    const config = load({
      MIMIR_LOCAL_MODE: '1',
      MIMIR_LOCAL_TOKEN: 'local-token',
      PORT: '0',
    })
    expect(config.listener).toEqual({ kind: 'tcp', host: '127.0.0.1', port: 0 })
    expect(config.auth.localToken).toBe('local-token')

    expect(() => load({ MIMIR_LOCAL_MODE: '1' })).toThrow(/MIMIR_LOCAL_TOKEN/)
    expect(() => load({ MIMIR_LOCAL_MODE: '1', MIMIR_LOCAL_TOKEN: 'x', HOST: '0.0.0.0' })).toThrow(
      /回环/,
    )
  })

  it('owner 变量必须成对，密码长度与生产密钥在启动期校验', () => {
    expect(() => load({ OWNER_EMAIL: 'admin@example.com' })).toThrow(/OWNER_PASSWORD/)
    expect(() => load({ OWNER_PASSWORD: '12345678' })).toThrow(/OWNER_EMAIL/)
    expect(() => load({ OWNER_EMAIL: 'a@b.c', OWNER_PASSWORD: 'short' })).toThrow(/8 位/)

    expect(() => load({ NODE_ENV: 'production', AUTH_SECRET: undefined })).toThrow(/AUTH_SECRET/)
    expect(() => load({ NODE_ENV: 'production', AUTH_SECRET: '' })).toThrow(/AUTH_SECRET/)
    expect(() =>
      load({ NODE_ENV: 'production', AUTH_SECRET: 'dev-only-insecure-secret-change-me' }),
    ).toThrow(/AUTH_SECRET/)
  })

  it('fnOS：Unix listener + SQLite + owner + 固定前缀', () => {
    const socket = join(root, 'mimir.sock')
    const config = load({
      MIMIR_FNOS_SOCKET: socket,
      MIMIR_BASE_PATH: '/app/mimir',
      OWNER_EMAIL: 'admin@example.com',
      OWNER_PASSWORD: '12345678',
    })
    expect(config.listener).toEqual({ kind: 'unix', path: socket })
    expect(config.auth.fnosGateway).toEqual({ basePath: '/app/mimir' })
    expect(config.auth.cookiePath).toBe('/app/mimir')
    expect(config.auth.secureCookies).toBe(false)
    expect(config.auth.baseURL).toBeUndefined()
    expect(config.auth.trustedOrigins).toEqual([])

    expect(() => load({ MIMIR_FNOS_SOCKET: socket, MIMIR_BASE_PATH: '/other' })).toThrow(
      /\/app\/mimir/,
    )
    expect(() =>
      load({
        MIMIR_FNOS_SOCKET: socket,
        DATABASE_URL: 'postgres://user:pass@localhost:5432/mimir_test',
        OWNER_EMAIL: 'admin@example.com',
        OWNER_PASSWORD: '12345678',
      }),
    ).toThrow(/SQLite/)
    expect(() => load({ MIMIR_FNOS_SOCKET: socket })).toThrow(/OWNER_EMAIL/)
  })

  it('拒绝非法 base path 与端口', () => {
    expect(() => load({ MIMIR_BASE_PATH: '/app/../mimir' })).toThrow(/MIMIR_BASE_PATH/)
    expect(() => load({ MIMIR_BASE_PATH: 'app/mimir' })).toThrow(/MIMIR_BASE_PATH/)
    expect(() => load({ PORT: 'not-a-port' })).toThrow(/PORT/)
  })
})

describe('RuntimeConfig 文件与 ServerConfig 翻译', () => {
  it('JSON 文件可往返，且 schema 不接受缺失字段', async () => {
    const config = load()
    const file = join(root, 'runtime.json')
    await writeFile(file, JSON.stringify(config))
    expect(loadRuntimeConfigFile(file)).toEqual(runtimeConfigSchema.parse(config))

    await writeFile(file, JSON.stringify({ ...config, database: undefined }))
    expect(() => loadRuntimeConfigFile(file)).toThrow(/database/)
  })

  it('toServerConfig 去掉监听/静态/platform 方言，只留 core 需要的事实', () => {
    const config = load({
      MIMIR_FNOS_SOCKET: join(root, 'mimir.sock'),
      MIMIR_BASE_PATH: '/app/mimir',
      OWNER_EMAIL: 'admin@example.com',
      OWNER_PASSWORD: '12345678',
    })
    const server = toServerConfig(config)

    expect(server).not.toHaveProperty('listener')
    expect(server).not.toHaveProperty('static')
    expect(server).not.toHaveProperty('publicUrl')
    expect(server.auth).not.toHaveProperty('fnosGateway')
    expect(server.auth.cookiePath).toBe('/app/mimir')
    expect(server.auth.secureCookies).toBe(false)
    expect(server.auth.baseURL).toBeUndefined()
    expect(server.database).toEqual(config.database)
    expect(server.migrations).toEqual(config.migrations)
    expect(server.settingsEnv).toEqual(config.settingsEnv)
  })
})
