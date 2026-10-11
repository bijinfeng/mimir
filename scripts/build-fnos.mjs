import { spawnSync } from 'node:child_process'
import { cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'apps/fnos')
const staging = path.join(source, 'staging')
const release = path.join(source, 'release')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status})`)
}

async function present(file) {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

async function copySource() {
  for (const file of ['manifest', 'ICON.PNG', 'ICON_256.PNG']) {
    await cp(path.join(source, file), path.join(staging, file))
  }
  for (const dir of ['config', 'wizard', 'cmd', 'app']) {
    await cp(path.join(source, dir), path.join(staging, dir), { recursive: true })
  }
}

async function main() {
  if (process.platform !== 'linux' || os.arch() !== 'x64') {
    throw new Error('fnOS 包必须在 Linux x86_64 上构建，以获取匹配的原生模块。')
  }
  if (Number(process.versions.node.split('.')[0]) !== 22) {
    throw new Error('fnOS 包必须用 Node 22 构建并验证。')
  }

  const rootPackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  const manifest = await readFile(path.join(source, 'manifest'), 'utf8')
  if (!manifest.includes(`version=${rootPackage.version}\n`)) {
    throw new Error('fnOS manifest 版本与根 package.json 不一致。')
  }
  if (await present(staging)) await rm(staging, { recursive: true, force: true })
  if (await present(release)) await rm(release, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })
  await mkdir(release, { recursive: true })

  run('pnpm', ['--filter', '@mimir/web', 'build'], {
    env: { ...process.env, MIMIR_BASE_PATH: '/app/mimir/' },
  })
  run('pnpm', ['--filter', '@mimir/server', 'build'])
  await copySource()
  const server = path.join(staging, 'app/server')
  run('pnpm', ['--filter', '@mimir/server', 'deploy', '--prod', server])
  await cp(path.join(root, 'apps/web/dist'), path.join(server, 'web/dist'), { recursive: true })

  for (const file of [
    'dist/index.js',
    'drizzle-sqlite/meta/_journal.json',
    'web/dist/index.html',
    'node_modules/better-sqlite3/package.json',
    'node_modules/sqlite-vec/package.json',
    'node_modules/@node-rs/jieba/package.json',
  ]) {
    if (!(await present(path.join(server, file)))) throw new Error(`打包缺少 ${file}`)
  }
  const index = await readFile(path.join(server, 'web/dist/index.html'), 'utf8')
  if (!index.includes('/app/mimir/assets/')) {
    throw new Error('Web 构建未使用 /app/mimir/ 资源前缀。')
  }
  // better-sqlite3 intentionally ships prebuilds for several platforms. Inspect
  // only the binaries actually selected by Node on this Linux x86_64 host.
  const nativeCheck = `
    const fs = await import('node:fs');
    const path = await import('node:path');
    const require = (await import('node:module')).createRequire(${JSON.stringify(path.join(server, 'package.json'))});
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    const sqliteVec = require('sqlite-vec');
    sqliteVec.load(db);
    db.close();
    require('@node-rs/jieba');
    const binaries = [...Object.keys(require.cache).filter((file) => file.endsWith('.node')), sqliteVec.getLoadablePath()];
    if (binaries.length < 3) throw new Error('Native dependency did not load');
    for (const file of binaries) {
      const actual = fs.realpathSync(file);
      if (!actual.startsWith(${JSON.stringify(`${server}/`)})) throw new Error('Native module escapes deploy: ' + actual);
      const header = fs.readFileSync(actual).subarray(0, 20);
      if (header.toString('hex', 0, 4) !== '7f454c46' || header.readUInt16LE(18) !== 62) {
        throw new Error('Native module is not Linux x86_64: ' + actual);
      }
    }
    console.log('[fnOS] loaded ' + binaries.length + ' Linux x86_64 native binaries');
  `
  run(process.execPath, ['--input-type=module', '-e', nativeCheck], { cwd: server })

  const fnpack = process.env.FNOS_FNPACK || 'fnpack'
  run(fnpack, ['build', '--directory', staging], { cwd: release })
  const packages = (await readdir(release)).filter((file) => file.endsWith('.fpk'))
  if (packages.length === 0) throw new Error('fnpack 未在 apps/fnos/release/ 生成 .fpk 文件。')
  console.log(`[fnOS] 生成 ${packages.map((file) => path.join(release, file)).join(', ')}`)
}

main().catch((error) => {
  console.error(`[fnOS] ${error.message}`)
  process.exitCode = 1
})
