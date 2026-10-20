import { spawnSync } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { validateVersion } from '../apps/desktop/scripts/release-artifacts.mjs'

export function verifyFnosManifest(text, version) {
  validateVersion(version)
  const entries = new Map()
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const match = line.match(/^([^=\s]+)\s*=\s*(.*?)\s*$/)
    if (!match || entries.has(match[1])) throw new Error('Invalid or duplicate fnOS manifest field')
    entries.set(match[1], match[2])
  }
  for (const [name, value] of Object.entries({
    appname: 'mimir',
    version,
    platform: 'x86',
    install_dep_apps: 'nodejs_v22',
  }))
    if (entries.get(name) !== value) throw new Error(`Wrong fnOS manifest ${name}`)
}

export function verifyTarEntries(list) {
  for (const entry of list.trim().split('\n')) {
    if (
      !entry ||
      entry.includes('\\') ||
      path.posix.isAbsolute(entry) ||
      entry.split('/').includes('..')
    )
      throw new Error(`Unsafe FPK archive entry: ${entry}`)
  }
}

function tar(args) {
  const result = spawnSync('tar', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`FPK tar failed: ${result.stderr}`)
  return result.stdout
}

function inspect(archive) {
  const list = tar(['-tf', archive])
  verifyTarEntries(list)
  if (
    tar(['-tvf', archive])
      .split('\n')
      .some((line) => /^[lh]/.test(line))
  )
    throw new Error('FPK archive must not contain symbolic or hard links')
  return list.split('\n')
}

export async function extractFpk(archive, destination, version) {
  const outer = path.join(destination, 'package')
  const app = path.join(destination, 'relocated-app')
  await mkdir(outer, { recursive: true })
  await mkdir(app, { recursive: true })
  const entries = inspect(archive)
  for (const required of [
    'manifest',
    'app.tgz',
    'cmd/main',
    'cmd/install_callback',
    'config/privilege',
    'wizard/install',
  ])
    if (!entries.includes(required)) throw new Error(`FPK missing ${required}`)
  tar(['-xf', archive, '-C', outer])
  verifyFnosManifest(await readFile(path.join(outer, 'manifest'), 'utf8'), version)
  inspect(path.join(outer, 'app.tgz'))
  tar(['-xf', path.join(outer, 'app.tgz'), '-C', app])
  return { outer, app }
}
