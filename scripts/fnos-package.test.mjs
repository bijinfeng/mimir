import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'apps/fnos')

function run(script, args, env) {
  return spawnSync('sh', [path.join(source, 'cmd', script), ...args], {
    env,
    encoding: 'utf8',
  })
}

test('fnOS install stores owner credentials only in protected persistent config', async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'mimir-fnos-'))
  t.after(async () => {
    const { rm } = await import('node:fs/promises')
    await rm(temporary, { recursive: true, force: true })
  })
  const appDest = path.join(temporary, 'target')
  const etc = path.join(temporary, 'etc')
  const varDir = path.join(temporary, 'var')
  const errorLog = path.join(temporary, 'error.log')
  await mkdir(appDest)
  await mkdir(varDir)
  const { cp } = await import('node:fs/promises')
  await cp(path.join(source, 'app', 'install.mjs'), path.join(appDest, 'install.mjs'))
  await cp(path.join(source, 'app', 'control.mjs'), path.join(appDest, 'control.mjs'))

  const env = {
    ...process.env,
    FNOS_NODE_BIN: process.execPath,
    TRIM_APPDEST: appDest,
    TRIM_PKGETC: etc,
    TRIM_PKGVAR: varDir,
    TRIM_TEMP_LOGFILE: errorLog,
    wizard_owner_email: 'Owner@Example.com',
    wizard_owner_password: 'correct horse battery staple',
  }
  const install = run('install_callback', [], env)
  assert.equal(install.status, 0, install.stderr)
  assert.equal(install.stdout, '')
  assert.equal(install.stderr, '')

  const configPath = path.join(etc, 'config.json')
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  assert.equal(config.ownerEmail, 'owner@example.com')
  assert.equal(config.ownerPassword, env.wizard_owner_password)
  assert.match(config.authSecret, /^[a-f0-9]{64}$/)
  assert.equal((await stat(configPath)).mode & 0o777, 0o600)
  assert.equal((await stat(etc)).mode & 0o777, 0o700)
  assert.equal((await stat(path.join(varDir, 'data'))).mode & 0o777, 0o700)

  const retry = run('install_callback', [], {
    ...env,
    wizard_owner_email: 'other@example.com',
    wizard_owner_password: 'different password',
  })
  assert.equal(retry.status, 0)
  assert.equal(await readFile(configPath, 'utf8'), JSON.stringify(config))

  const status = run('main', ['status'], env)
  assert.equal(status.status, 3)
  const stop = run('main', ['stop'], env)
  assert.equal(stop.status, 0)

  await writeFile(errorLog, '')
  const { chmod } = await import('node:fs/promises')
  await chmod(configPath, 0o644)
  const start = run('main', ['start'], env)
  assert.equal(start.status, 1)
  assert.match(await readFile(errorLog, 'utf8'), /权限过宽/)
  assert.doesNotMatch(await readFile(errorLog, 'utf8'), /correct horse/)
})

test('fnOS install rejects invalid owner input without writing credentials', async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'mimir-fnos-invalid-'))
  t.after(async () => {
    const { rm } = await import('node:fs/promises')
    await rm(temporary, { recursive: true, force: true })
  })
  const appDest = path.join(temporary, 'target')
  await mkdir(appDest)
  const { cp } = await import('node:fs/promises')
  await cp(path.join(source, 'app', 'install.mjs'), path.join(appDest, 'install.mjs'))
  const env = {
    ...process.env,
    FNOS_NODE_BIN: process.execPath,
    TRIM_APPDEST: appDest,
    TRIM_PKGETC: path.join(temporary, 'etc'),
    TRIM_PKGVAR: path.join(temporary, 'var'),
    TRIM_TEMP_LOGFILE: path.join(temporary, 'error.log'),
    wizard_owner_email: 'bad-email',
    wizard_owner_password: 'secret',
  }
  const result = run('install_callback', [], env)
  assert.equal(result.status, 1)
  assert.match(await readFile(env.TRIM_TEMP_LOGFILE, 'utf8'), /邮箱/)
  await assert.rejects(stat(path.join(env.TRIM_PKGETC, 'config.json')), { code: 'ENOENT' })
})

test('fnOS package declares the gateway, x86 runtime and icons', async () => {
  const manifest = await readFile(path.join(source, 'manifest'), 'utf8')
  assert.match(manifest, /^platform=x86$/m)
  assert.match(manifest, /^install_dep_apps=nodejs_v22$/m)
  assert.match(manifest, /^desktop_uidir=ui$/m)
  const config = JSON.parse(await readFile(path.join(source, 'app/ui/config'), 'utf8'))
  assert.equal(config['.url']['mimir.main'].type, 'iframe')
  assert.equal(config['.url']['mimir.main'].gatewayPrefix, '/app/mimir')
  assert.equal(config['.url']['mimir.main'].gatewaySocket, 'app.sock')
  for (const [file, size] of [
    ['ICON.PNG', 64],
    ['ICON_256.PNG', 256],
  ]) {
    const png = await readFile(path.join(source, file))
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a')
    assert.equal(png.readUInt32BE(16), size)
    assert.equal(png.readUInt32BE(20), size)
  }
})

test('fnOS lifecycle starts on a Unix socket and stops idempotently', async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'mimir-fnos-run-'))
  t.after(async () => {
    const { rm } = await import('node:fs/promises')
    await rm(temporary, { recursive: true, force: true })
  })
  const appDest = path.join(temporary, 'target')
  const etc = path.join(temporary, 'etc')
  const varDir = path.join(temporary, 'var')
  const mockServer = path.join(appDest, 'server')
  await mkdir(appDest)
  await mkdir(mockServer)
  await mkdir(varDir)
  const { cp } = await import('node:fs/promises')
  for (const file of ['install.mjs', 'control.mjs', 'launch.mjs']) {
    await cp(path.join(source, 'app', file), path.join(appDest, file))
  }
  await mkdir(path.join(mockServer, 'dist'))
  await writeFile(path.join(mockServer, 'package.json'), '{"type":"module"}')
  await writeFile(
    path.join(mockServer, 'dist/index.js'),
    `import { createServer } from 'node:net'
     import { writeFile } from 'node:fs/promises'
     export async function startServer() {
       await writeFile(process.env.DATA_DIR + '/boot.json', JSON.stringify({
         socket: process.env.MIMIR_FNOS_SOCKET,
         basePath: process.env.MIMIR_BASE_PATH,
         owner: process.env.OWNER_EMAIL,
         localMode: process.env.MIMIR_LOCAL_MODE ?? null,
       }))
       const server = createServer(() => {})
       await new Promise((resolve) => server.listen(process.env.MIMIR_FNOS_SOCKET, resolve))
       return { server }
     }
     export function closeDb() {}`,
  )

  const env = {
    ...process.env,
    FNOS_NODE_BIN: process.execPath,
    TRIM_APPDEST: appDest,
    TRIM_PKGETC: etc,
    TRIM_PKGVAR: varDir,
    TRIM_TEMP_LOGFILE: path.join(temporary, 'error.log'),
    wizard_owner_email: 'owner@example.com',
    wizard_owner_password: 'long-secret-password',
    MIMIR_LOCAL_MODE: '1',
    MIMIR_LOCAL_TOKEN: 'must-not-leak',
  }
  assert.equal(run('install_callback', [], env).status, 0)
  t.after(() => run('main', ['stop'], env))
  const started = run('main', ['start'], env)
  assert.equal(started.status, 0, started.stderr)
  assert.equal(run('main', ['start'], env).status, 0)
  assert.equal(run('main', ['status'], env).status, 0)
  const boot = JSON.parse(await readFile(path.join(varDir, 'data/boot.json'), 'utf8'))
  assert.equal(boot.socket, path.join(appDest, 'app.sock'))
  assert.equal(boot.basePath, '/app/mimir')
  assert.equal(boot.owner, 'owner@example.com')
  assert.equal(boot.localMode, null)

  assert.equal(run('main', ['stop'], env).status, 0)
  assert.equal(run('main', ['stop'], env).status, 0)
  assert.equal(run('main', ['status'], env).status, 3)
  await assert.rejects(stat(path.join(appDest, 'app.sock')), { code: 'ENOENT' })
})
