import { describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { pickFreePort } from './sidecar.js'
import { defaultScheme, normalizeCloudUrl, probeCloudUrl } from './cloud.js'

/**
 * 云端地址的归一化与探活（D-100）。
 *
 * 这些规则全部是「用户输入习惯」的映射——每一条错了都会表现成「连不上」，
 * 而用户接下来会去查服务器。所以逐条断言，不靠手工点。
 */

describe('normalizeCloudUrl', () => {
  it('去掉首尾空白（粘贴最常见的形态）', () => {
    expect(normalizeCloudUrl('  https://k.example.com  ')).toEqual({
      ok: true,
      url: 'https://k.example.com',
    })
  })

  it('去掉末尾斜杠与查询串 / 锚点', () => {
    expect(normalizeCloudUrl('https://k.example.com/#/docs')).toEqual({
      ok: true,
      url: 'https://k.example.com',
    })
    expect(normalizeCloudUrl('https://k.example.com/?x=1')).toEqual({
      ok: true,
      url: 'https://k.example.com',
    })
  })

  it('保留路径前缀（反代挂在子路径下的部署）', () => {
    expect(normalizeCloudUrl('https://example.com/mimir/')).toEqual({
      ok: true,
      url: 'https://example.com/mimir',
    })
  })

  it('不带协议时按主机补：内网补 http、公网补 https', () => {
    expect(normalizeCloudUrl('192.168.1.10:8080')).toEqual({
      ok: true,
      url: 'http://192.168.1.10:8080',
    })
    expect(normalizeCloudUrl('k.example.com')).toEqual({ ok: true, url: 'https://k.example.com' })
    expect(normalizeCloudUrl('localhost:3000')).toEqual({ ok: true, url: 'http://localhost:3000' })
  })

  it('写全了协议就完全按用户写的来（https 的内网地址不加干涉）', () => {
    expect(normalizeCloudUrl('https://192.168.1.10')).toEqual({
      ok: true,
      url: 'https://192.168.1.10',
    })
  })

  it('空输入与非 http(s) 协议被明确拒绝', () => {
    expect(normalizeCloudUrl('   ').ok).toBe(false)
    expect(normalizeCloudUrl('ftp://example.com').ok).toBe(false)
    expect(normalizeCloudUrl('http://').ok).toBe(false)
  })

  it('解析不了的字符串给出人话', () => {
    const result = normalizeCloudUrl('http://a b')
    expect(result.ok).toBe(false)
    expect(result.message).toBeTruthy()
  })
})

describe('defaultScheme', () => {
  it('本机与内网走 http，公网走 https', () => {
    expect(defaultScheme('localhost')).toBe('http')
    expect(defaultScheme('127.0.0.1')).toBe('http')
    expect(defaultScheme('127.0.0.53')).toBe('http')
    expect(defaultScheme('10.0.0.7')).toBe('http')
    expect(defaultScheme('172.16.4.2')).toBe('http')
    expect(defaultScheme('172.32.4.2')).toBe('https')
    expect(defaultScheme('192.168.0.2')).toBe('http')
    expect(defaultScheme('mimir.local')).toBe('http')
    expect(defaultScheme('mimir.example.com')).toBe('https')
    expect(defaultScheme('8.8.8.8')).toBe('https')
  })
})

/** 起一个真实的 HTTP 服务。探活是 I/O 行为，mock fetch 只能测出写死的规则 */
async function withServer(
  handler: (url: string) => { status: number; body: string },
  run: (origin: string) => Promise<void>,
): Promise<void> {
  const server = createServer((req, res) => {
    const result = handler(req.url ?? '')
    res.writeHead(result.status, { 'Content-Type': 'application/json' })
    res.end(result.body)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('拿不到端口')
  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

describe('probeCloudUrl', () => {
  it('mimir 的 /healthz 通过', async () => {
    await withServer(
      () => ({ status: 200, body: JSON.stringify({ ok: true }) }),
      async (origin) => {
        expect(await probeCloudUrl(origin)).toEqual({ ok: true })
      },
    )
  })

  it('有响应但不是 mimir 时要识别出来（只看 200 会放错页面进去）', async () => {
    await withServer(
      () => ({ status: 200, body: '<html>hello</html>' }),
      async (origin) => {
        const result = await probeCloudUrl(origin)
        expect(result.ok).toBe(false)
        expect(result.message).toContain('不是 mimir')
      },
    )
  })

  it('返回非 2xx 时报出状态码', async () => {
    await withServer(
      () => ({ status: 502, body: '{}' }),
      async (origin) => {
        const result = await probeCloudUrl(origin)
        expect(result.ok).toBe(false)
        expect(result.message).toContain('502')
      },
    )
  })

  it('连不上时说清是连接问题，且不透传 fetch failed', async () => {
    // 拿一个「刚被释放的」端口：它上面几乎必然没人监听，而 ports 1 这类
    // 会被 fetch 自己当成「禁止端口」拦在 DNS/连接之前（那样就测不到连接失败了）
    const port = await pickFreePort()
    const result = await probeCloudUrl(`http://127.0.0.1:${port}`, 2000)
    expect(result.ok).toBe(false)
    // Node 的原始话是 "fetch failed"，它对用户没有任何指导意义
    expect(result.message).not.toContain('fetch failed')
    expect(result.message).toContain('没有人监听')
  })

  it('域名解析不了与端口没人监听给的是两句不同的话（下一步动作不同）', async () => {
    const port = await pickFreePort()
    const refused = await probeCloudUrl(`http://127.0.0.1:${port}`, 2000)
    const notFound = await probeCloudUrl('http://this-domain-should-not-resolve.invalid', 4000)
    expect(refused.message).not.toBe(notFound.message)
    expect(notFound.message).toContain('找不到这个域名')
  })

  it('被 fetch 禁止的端口（如 :1）给的是「换一个端口」而不是 cryptic 的原话', async () => {
    const result = await probeCloudUrl('http://127.0.0.1:1', 2000)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('端口')
    expect(result.message).not.toContain('bad port')
  })
})
