import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { request } from 'node:http'
import { access, mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { extractFpk } from './fnos-artifacts.mjs'
import { finalizeResourceTree } from './lib/resource-tree.mjs'
import { validateCommittedReleaseVersion } from '../apps/desktop/scripts/release-artifacts.mjs'

if (
  process.platform !== 'linux' ||
  process.arch !== 'x64' ||
  process.versions.node.split('.')[0] !== '22'
)
  throw new Error('FPK verification requires native Linux x86_64 Node 22')
const root = path.resolve('apps/fnos')
const desktop = JSON.parse(await readFile('apps/desktop/package.json', 'utf8'))
const version = validateCommittedReleaseVersion(
  desktop.version,
  await readFile(path.join(root, 'manifest'), 'utf8'),
)
if (process.argv[2] !== version)
  throw new Error('FPK verification version must match committed desktop')
const directory = path.join(root, 'staging/verification')
await rm(directory, { force: true, recursive: true })
const { outer, app } = await extractFpk(
  path.join(root, 'release', `mimir-${version}-fnos-x64.fpk`),
  directory,
  version,
)
const server = path.join(app, 'server')
const tree = await finalizeResourceTree(server)
assert.equal(tree.materialized, 0, 'Built FPK must already contain physical portable resources')
for (const entry of [
  'manifest.json',
  'dist/runtime/cli.js',
  'dist/runtime/index.js',
  'drizzle-sqlite/meta/_journal.json',
  'web/dist/index.html',
])
  await access(path.join(server, entry))
const runtimeManifest = JSON.parse(await readFile(path.join(server, 'manifest.json'), 'utf8'))
assert.equal(runtimeManifest.productVersion, version)
const packagedVersion = JSON.parse(await readFile(path.join(app, 'version.json'), 'utf8'))
assert.equal(packagedVersion.productVersion, version)
for (const entry of runtimeManifest.required) await access(path.join(server, entry))
assert.ok((await readFile(path.join(server, 'web/dist/index.html'), 'utf8')).includes('./assets/'))
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`)
}
run(process.execPath, ['scripts/fnos-native.mjs', server])

const etc = path.join(directory, 'smoke/etc')
const data = path.join(directory, 'smoke/var')
await mkdir(data, { recursive: true })
const env = {
  ...process.env,
  FNOS_NODE_BIN: process.execPath,
  TRIM_APPDEST: app,
  TRIM_PKGETC: etc,
  TRIM_PKGVAR: data,
  TRIM_TEMP_LOGFILE: path.join(directory, 'smoke/error.log'),
  wizard_owner_email: 'admin@example.com',
  wizard_owner_password: '12345678',
}
const control = (action) => run('sh', [path.join(outer, 'cmd/main'), action], { env })
function gateway(url, { method = 'GET', body, cookie, https = false } = {}) {
  return new Promise((resolve, reject) => {
    const origin = `${https ? 'https' : 'http'}://nas.example.test`
    const req = request(
      {
        socketPath: path.join(app, 'app.sock'),
        path: url,
        method,
        headers: {
          host: 'nas.example.test',
          origin,
          'x-forwarded-proto': https ? 'https' : 'http',
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
        },
      },
      (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          text += chunk
        })
        res.on('end', () =>
          resolve({ status: res.statusCode, body: text, cookies: res.headers['set-cookie'] ?? [] }),
        )
      },
    )
    req.setTimeout(15000, () => req.destroy(new Error('fnOS gateway smoke timed out')))
    req.on('error', reject)
    req.end(body ? JSON.stringify(body) : undefined)
  })
}
try {
  run('sh', [path.join(outer, 'cmd/install_callback')], { env })
  control('start')
  control('status')
  assert.equal((await gateway('/app/mimir/healthz')).status, 200)
  assert.equal((await gateway('/app/mimir/')).status, 200)
  assert.equal((await gateway('/app/mimir/api/documents')).status, 401)
  for (const https of [false, true]) {
    const login = await gateway('/app/mimir/api/auth/sign-in/email', {
      method: 'POST',
      body: { email: 'admin@example.com', password: '12345678' },
      https,
    })
    assert.equal(login.status, 200)
    const cookie = login.cookies.find((value) => value.includes('session_token'))
    assert.ok(cookie?.includes('Path=/app/mimir'))
    assert.equal(cookie.includes('; Secure'), https)
    assert.equal(
      (await gateway('/app/mimir/api/documents', { cookie: cookie.split(';')[0], https })).status,
      200,
    )
  }
  console.log(
    `[fnOS] verified FPK ${version}, ${tree.files} portable files, native modules, real Unix Socket HTTP/HTTPS auth; no fnOS device installation claimed`,
  )
} catch (error) {
  console.error(await readFile(path.join(data, 'mimir.log'), 'utf8').catch(() => 'No host log'))
  throw error
} finally {
  control('stop')
}
