// Run after the real server build + hoisted desktop deployment, under Node 22.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { cp, mkdtemp, readdir, realpath, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const repo = process.cwd()
const temporary = await mkdtemp(join(tmpdir(), 'mimir-relocated-sdk-'))
const resources = join(temporary, 'server')
const objects = new Map()
const requests = []
const endpoint = createServer(async (request, response) => {
  try {
    assert.match(request.headers.authorization ?? '', /^AWS4-HMAC-SHA256 /)
    const url = new URL(request.url, 'http://localhost')
    const key = decodeURIComponent(url.pathname)
    requests.push(request.method)
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    if (request.method === 'PUT') {
      const source = request.headers['x-amz-copy-source']
      if (source) {
        assert.ok(objects.has(decodeURIComponent(source)))
        objects.set(key, objects.get(decodeURIComponent(source)))
        response.setHeader('Content-Type', 'application/xml')
        response.end(
          '<CopyObjectResult><ETag>"fixture"</ETag><LastModified>2026-10-20T00:00:00Z</LastModified></CopyObjectResult>',
        )
      } else {
        objects.set(key, Buffer.concat(chunks))
        response.end()
      }
    } else if (request.method === 'DELETE') {
      objects.delete(key)
      response.writeHead(204).end()
    } else if (request.method === 'GET' && url.searchParams.has('list-type')) {
      const prefix = `${url.pathname.replace(/\/$/, '')}/${url.searchParams.get('prefix') ?? ''}`
      const keys = [...objects.keys()].filter((item) => item.startsWith(prefix))
      response.setHeader('Content-Type', 'application/xml')
      response.end(
        `<ListBucketResult><IsTruncated>false</IsTruncated>${keys.map((item) => `<Contents><Key>${item.slice('/fixture/'.length)}</Key></Contents>`).join('')}</ListBucketResult>`,
      )
    } else if (request.method === 'GET' && objects.has(key)) {
      response.end(objects.get(key))
    } else {
      response
        .writeHead(404, { 'Content-Type': 'application/xml' })
        .end('<Error><Code>NoSuchKey</Code></Error>')
    }
  } catch (error) {
    console.error(error)
    response.writeHead(500).end()
  }
})
let running
let host
try {
  await cp(resolve(repo, 'apps/desktop/server-deploy'), resources, { recursive: true, mode: 2 })
  const { finalizeResourceTree } = await import(
    pathToFileURL(join(repo, 'apps/desktop/scripts/resource-tree.mjs')).href
  )
  console.log('relocated resource tree:', await finalizeResourceTree(resources))
  const files = await readdir(join(resources, 'dist'), { recursive: true })
  assert.equal(files.filter((file) => file.includes('@aws-sdk')).length, 0)
  const require = createRequire(join(resources, 'package.json'))
  const sdkEntry = require.resolve('@aws-sdk/client-s3')
  assert.ok(sdkEntry.startsWith((await realpath(resources)) + sep), sdkEntry)
  console.log('SDK entry belongs to relocated deployment; generated AWS chunks: 0')
  await new Promise((accept) => endpoint.listen(0, '127.0.0.1', accept))
  const { createS3Storage } = await import(
    pathToFileURL(join(resources, 'dist/plugins/storage/src/s3.js')).href
  )
  const storage = createS3Storage(async () => ({
    bucket: 'fixture',
    endpoint: `http://127.0.0.1:${endpoint.address().port}`,
    region: 'us-east-1',
    accessKeyId: 'fixture',
    secretAccessKey: 'fixture',
    pathStyle: true,
    prefix: 'integration',
  }))
  await storage.write('vault/中文旧名.md', '中文正文')
  assert.equal(Buffer.from(await storage.read('vault/中文旧名.md')).toString(), '中文正文')
  await storage.move('vault/中文旧名.md', 'vault/中文新名.md')
  await assert.rejects(storage.read('vault/中文旧名.md'), /文件不存在/)
  assert.equal(Buffer.from(await storage.read('vault/中文新名.md')).toString(), '中文正文')
  assert.deepEqual(await storage.list('vault'), ['vault/中文新名.md'])
  await storage.remove('vault/中文新名.md')
  await storage.remove('vault/中文新名.md')
  assert.equal((await storage.probe()).ok, true)
  assert.equal(objects.size, 0)
  console.log(
    'Built adapter sent real signed SDK HTTP requests: write/read/copy/list/delete/probe passed',
    { requests: requests.length },
  )
  // This is an in-process S3 protocol fixture, not a MinIO/AWS compatibility claim.
  process.chdir(temporary)
  Object.assign(process.env, {
    NODE_ENV: 'production',
    DATA_DIR: join(temporary, 'data'),
    DATABASE_URL: `file:${join(temporary, 'data/mimir.db')}`,
    PORT: '0',
    AUTH_SECRET: 'isolated-relocated-host-verification-32-bytes',
    OWNER_EMAIL: 'admin@example.com',
    OWNER_PASSWORD: '12345678',
    SERVER_URL: 'http://127.0.0.1:3000',
    WEB_ORIGIN: 'http://127.0.0.1:3000',
    MIMIR_LOCAL_MODE: '',
    MIMIR_LOCAL_TOKEN: '',
    MIMIR_FNOS_SOCKET: '',
  })
  host = await import(pathToFileURL(join(resources, 'dist/index.js')).href)
  running = await host.startServer({ hostname: '127.0.0.1' })
  if (!running.server.listening)
    await new Promise((accept) => running.server.once('listening', accept))
  const base = `http://127.0.0.1:${running.server.address().port}`
  const login = await fetch(`${base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:3000' },
    body: JSON.stringify({ email: 'admin@example.com', password: '12345678' }),
  })
  assert.equal(login.status, 200, await login.text())
  const cookie = login.headers
    .getSetCookie()
    .map((item) => item.split(';')[0])
    .join('; ')
  assert.ok(cookie)
  for (const path of ['/api/auth/get-session', '/api/documents', '/api/folders']) {
    const response = await fetch(`${base}${path}`, { headers: { Cookie: cookie } })
    assert.equal(response.status, 200, path)
    await response.arrayBuffer()
  }
  console.log(
    'Relocated production host: fresh SQLite migrations, standard test login, session/documents/folders HTTP 200 passed',
  )
} finally {
  if (running)
    await new Promise((accept, reject) =>
      running.server.close((error) => (error ? reject(error) : accept())),
    )
  if (host) await host.closeDb()
  await new Promise((accept) => endpoint.close(accept))
  await rm(temporary, { recursive: true, force: true })
}
