import { describe, expect, it } from 'vitest'
import net from 'node:net'
import { applyHostEnv, pickFreePort, waitForReady, startHost } from './host.js'
import { join } from 'node:path'

describe('pickFreePort', () => {
  it('返回的端口立刻可用', async () => {
    const port = await pickFreePort()
    expect(port).toBeGreaterThan(0)

    // 拿到后能真的监听（对 0.0.0.0 随机端口的占位竞争做一次真实验证）
    await new Promise<void>((resolve, reject) => {
      const server = net.createServer()
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => server.close(() => resolve()))
    })
  })
})

describe('applyHostEnv', () => {
  /** 逐个还原，避免污染同进程的其他测试 */
  const MANAGED = [
    'NODE_ENV',
    'PORT',
    'SERVER_URL',
    'WEB_ORIGIN',
    'DATA_DIR',
    'DATABASE_URL',
    'WEB_DIST',
    'AUTH_SECRET',
    'MIMIR_LOCAL_MODE',
    'MIMIR_LOCAL_TOKEN',
  ]

  function withCleanEnv(run: () => void): void {
    const before = { ...process.env }
    try {
      run()
    } finally {
      for (const key of MANAGED) {
        if (before[key] === undefined) delete process.env[key]
        else process.env[key] = before[key]
      }
    }
  }

  it('注入服务端需要的全部部署事实', () => {
    withCleanEnv(() => {
      const paths = {
        dataDir: '/tmp/mimir-test-data',
        serverDist: '/tmp/mimir-server-dist',
        webDist: '/tmp/mimir-web-dist',
      }
      applyHostEnv(41234, paths, 'test-secret-with-more-than-32-characters-1234')

      expect(process.env.NODE_ENV).toBe('production')
      expect(process.env.PORT).toBe('41234')
      // better-auth 的 baseURL / trustedOrigins 都源自这两个值，必须同源
      expect(process.env.SERVER_URL).toBe('http://127.0.0.1:41234')
      expect(process.env.WEB_ORIGIN).toBe('http://127.0.0.1:41234')
      expect(process.env.DATA_DIR).toBe(paths.dataDir)
      expect(process.env.DATABASE_URL).toBe(`file:${join(paths.dataDir, 'mimir.db')}`)
      expect(process.env.WEB_DIST).toBe(paths.webDist)
      // 不带 local 参数时**不打开**本地模式——默认仍是「要登录」的形态
      expect(process.env.MIMIR_LOCAL_MODE).toBeUndefined()
    })
  })

  it('本地模式注入的是服务端读的那个字面量（1，不是 true）', () => {
    withCleanEnv(() => {
      applyHostEnv(
        41234,
        { dataDir: '/tmp/d', serverDist: '/tmp/s', webDist: '/tmp/w' },
        'test-secret-with-more-than-32-characters-1234',
        { token: 'token-abc' },
      )

      // 写成 'true' / 'yes' 时服务端会当成没开，而那种失败是静默的
      // （症状是「本地模式却要求登录」）
      expect(process.env.MIMIR_LOCAL_MODE).toBe('1')
      expect(process.env.MIMIR_LOCAL_TOKEN).toBe('token-abc')
    })
  })

  it('不带 local 时清掉残留的本地模式变量（宿主可能被带旧环境复用）', () => {
    withCleanEnv(() => {
      process.env.MIMIR_LOCAL_MODE = '1'
      process.env.MIMIR_LOCAL_TOKEN = 'stale-token'
      applyHostEnv(
        41235,
        { dataDir: '/tmp/d', serverDist: '/tmp/s', webDist: '/tmp/w' },
        'test-secret-with-more-than-32-characters-1234',
      )
      expect(process.env.MIMIR_LOCAL_MODE).toBeUndefined()
      expect(process.env.MIMIR_LOCAL_TOKEN).toBeUndefined()
    })
  })
})

describe('waitForReady', () => {
  it('超时明确报错，而不是静默等待', async () => {
    // 端口 1 几乎必然无监听；即便个别环境有，这个断言也只是退化成通过
    await expect(waitForReady('http://127.0.0.1:1', 300)).rejects.toThrow(/未就绪/)
  })
})

describe('startHost', () => {
  it('产物缺失时抛清单式错误（而不是等到动态 import 时才报 ERR_MODULE_NOT_FOUND）', async () => {
    const paths = {
      serverDist: '/nonexistent-server-dist',
      webDist: '/nonexistent-web-dist',
      dataDir: '/tmp/mimir-test-data',
    }

    await expect(startHost(paths)).rejects.toThrow(/缺少.*必需产物/)
    await expect(startHost(paths)).rejects.toThrow(/pnpm desktop:start/)
  })
})

