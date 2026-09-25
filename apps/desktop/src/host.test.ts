import { describe, expect, it } from 'vitest'
import net from 'node:net'
import { applyHostEnv, pickFreePort, waitForReady } from './host.js'
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
  it('注入服务端需要的全部部署事实', () => {
    const paths = {
      dataDir: '/tmp/mimir-test-data',
      serverDist: '/tmp/mimir-server-dist',
      webDist: '/tmp/mimir-web-dist',
    }
    const before = { ...process.env }
    try {
      applyHostEnv(41234, paths, 'test-secret-with-more-than-32-characters-1234')

      expect(process.env.NODE_ENV).toBe('production')
      expect(process.env.PORT).toBe('41234')
      // better-auth 的 baseURL / trustedOrigins 都源自这两个值，必须同源
      expect(process.env.SERVER_URL).toBe('http://127.0.0.1:41234')
      expect(process.env.WEB_ORIGIN).toBe('http://127.0.0.1:41234')
      expect(process.env.DATA_DIR).toBe(paths.dataDir)
      expect(process.env.DATABASE_URL).toBe(`file:${join(paths.dataDir, 'mimir.db')}`)
      expect(process.env.WEB_DIST).toBe(paths.webDist)
    } finally {
      // 还原环境，避免污染同进程的其他测试
      for (const key of [
        'NODE_ENV',
        'PORT',
        'SERVER_URL',
        'WEB_ORIGIN',
        'DATA_DIR',
        'DATABASE_URL',
        'WEB_DIST',
      ]) {
        if (before[key] === undefined) delete process.env[key]
        else process.env[key] = before[key]
      }
    }
  })
})

describe('waitForReady', () => {
  it('超时明确报错，而不是静默等待', async () => {
    // 端口 1 几乎必然无监听；即便个别环境有，这个断言也只是退化成通过
    await expect(waitForReady('http://127.0.0.1:1', 300)).rejects.toThrow(/未就绪/)
  })
})
