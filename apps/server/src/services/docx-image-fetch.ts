import { lookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP } from 'node:net'
import type { IncomingMessage } from 'node:http'

const MAX_BYTES = 8 * 1024 * 1024
const blocked = new BlockList()
for (const [subnet, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(subnet, prefix, 'ipv4')
for (const [subnet, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  blocked.addSubnet(subnet, prefix, 'ipv6')

export function publicImageAddress(address: string): boolean {
  const plain = address.toLowerCase().startsWith('::ffff:') ? address.slice(7) : address
  const family = isIP(plain)
  return family !== 0 && !blocked.check(plain, family === 4 ? 'ipv4' : 'ipv6')
}

function imageMime(bytes: Buffer): string {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png'
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp'
  if (['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif'
  throw new Error('远程资源不是支持的 PNG、JPEG、GIF 或 WebP 图片')
}

function parseUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('图片地址无效')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('图片地址必须是无账号密码的 HTTP(S) 地址')
  if (
    ['localhost', 'localhost.localdomain'].includes(url.hostname.toLowerCase()) ||
    /\.(?:localhost|local|internal)$/i.test(url.hostname)
  )
    throw new Error('不允许读取本地或内网图片地址')
  return url
}

async function oneHop(url: URL, signal?: AbortSignal): Promise<IncomingMessage> {
  signal?.throwIfAborted()
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const candidates = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true, verbatim: true })
  signal?.throwIfAborted()
  if (!candidates.length || candidates.some((candidate) => !publicImageAddress(candidate.address)))
    throw new Error('图片地址解析到私网或保留地址')
  const pinned = candidates[0]!
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'GET',
        signal,
        timeout: 10_000,
        headers: { Accept: 'image/png,image/jpeg,image/gif,image/webp' },
        lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
      },
      (response) => {
        response.once('close', () => clearTimeout(deadline))
        resolve(response)
      },
    )
    const deadline = setTimeout(() => req.destroy(new Error('图片下载超时')), 10_000)
    req.on('timeout', () => req.destroy(new Error('图片下载超时')))
    req.on('error', (error) => {
      clearTimeout(deadline)
      reject(error)
    })
    req.end()
  })
}

async function readBounded(response: IncomingMessage): Promise<Buffer> {
  const declared = Number(response.headers['content-length'])
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    response.destroy()
    throw new Error('远程图片超过 8 MB 限制')
  }
  const parts: Buffer[] = []
  let size = 0
  for await (const part of response) {
    const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part)
    size += bytes.length
    if (size > MAX_BYTES) {
      response.destroy()
      throw new Error('远程图片超过 8 MB 限制')
    }
    parts.push(bytes)
  }
  return Buffer.concat(parts)
}

export async function fetchDocxImage(
  rawUrl: string,
  signal?: AbortSignal,
): Promise<{ dataUrl: string; mimeType: string }> {
  signal?.throwIfAborted()
  if (rawUrl.length > 2_000) throw new Error('图片地址过长')
  let url = parseUrl(rawUrl)
  for (let hop = 0; hop < 4; hop++) {
    const response = await oneHop(url, signal)
    const status = response.statusCode ?? 0
    if ([301, 302, 303, 307, 308].includes(status)) {
      const location = response.headers.location
      response.resume()
      if (!location || hop === 3) throw new Error('图片重定向次数过多')
      url = parseUrl(new URL(location, url).href)
      continue
    }
    if (status !== 200) {
      response.resume()
      throw new Error(`图片服务返回 HTTP ${status}`)
    }
    const type = String(response.headers['content-type'] ?? '')
      .split(';')[0]!
      .trim()
      .toLowerCase()
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(type)) {
      response.resume()
      throw new Error('远程资源的 MIME 不是支持的图片类型')
    }
    const bytes = await readBounded(response)
    signal?.throwIfAborted()
    const mimeType = imageMime(bytes)
    if (mimeType !== type) throw new Error('远程图片内容与 MIME 不符')
    return { dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}`, mimeType }
  }
  throw new Error('图片重定向次数过多')
}
