import { lstat, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashFile } from './release-artifacts.mjs'

function safeRelativePath(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    /[\\:]/.test(value) ||
    [...value].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    path.posix.isAbsolute(value) ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error(`Unsafe resource path: ${JSON.stringify(value)}`)
}

function diagnostics(files) {
  const longestRelativePathLength = files.reduce(
    (longest, file) => Math.max(longest, file.path.length),
    0,
  )
  return {
    fileCount: files.length,
    longestRelativePathLength,
    longestRelativePaths: files
      .filter((file) => file.path.length === longestRelativePathLength)
      .map((file) => file.path),
  }
}

export async function captureResources(root) {
  if (!(await lstat(root)).isDirectory()) throw new Error('Resource root must be a real directory')
  const canonicalRoot = await realpath(root)
  const files = []
  async function visit(directory, prefix) {
    for (const name of await readdir(directory)) {
      const relative = prefix ? `${prefix}/${name}` : name
      safeRelativePath(relative)
      const location = path.join(directory, name)
      const entry = await lstat(location)
      if (entry.isDirectory()) await visit(location, relative)
      else if (entry.isFile())
        files.push({
          path: relative,
          size: entry.size,
          sha256: await hashFile(location, 'sha256', 'hex'),
        })
      else throw new Error(`Resource is not a regular file or directory: ${relative}`)
    }
  }
  await visit(canonicalRoot, '')
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return { formatVersion: 1, files }
}

export function validateResourceManifest(manifest) {
  if (
    !manifest ||
    manifest.formatVersion !== 1 ||
    !Array.isArray(manifest.files) ||
    Object.keys(manifest).some((key) => !['formatVersion', 'files'].includes(key))
  )
    throw new Error('Invalid resource manifest')
  const seen = new Set()
  for (const file of manifest.files) {
    if (!file || typeof file !== 'object') throw new Error('Invalid resource entry')
    safeRelativePath(file.path)
    if (
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      typeof file.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(file.sha256) ||
      Object.keys(file).some((key) => !['path', 'size', 'sha256'].includes(key))
    )
      throw new Error(`Invalid resource entry: ${file.path}`)
    if (seen.has(file.path)) throw new Error(`Duplicate resource entry: ${file.path}`)
    seen.add(file.path)
  }
}

export async function verifyResources(root, manifest) {
  validateResourceManifest(manifest)
  // Enumerate the actual tree independently, without resolving manifest paths or following links.
  const actual = await captureResources(root)
  const expectedByPath = new Map(manifest.files.map((file) => [file.path, file]))
  const actualByPath = new Map(actual.files.map((file) => [file.path, file]))
  const missing = manifest.files
    .filter((file) => !actualByPath.has(file.path))
    .map((file) => file.path)
  const extra = actual.files
    .filter((file) => !expectedByPath.has(file.path))
    .map((file) => file.path)
  const size = []
  const hash = []
  for (const expected of manifest.files) {
    const found = actualByPath.get(expected.path)
    if (!found) continue
    if (expected.size !== found.size)
      size.push({ path: expected.path, expected: expected.size, actual: found.size })
    if (expected.sha256 !== found.sha256)
      hash.push({ path: expected.path, expected: expected.sha256, actual: found.sha256 })
  }
  const differences = { missing, extra, size, hash }
  if (Object.values(differences).some((items) => items.length))
    throw new Error(`Installed resource mismatch: ${JSON.stringify(differences)}`)
  return diagnostics(actual.files)
}

async function main() {
  const [command, root, manifestFile, ...extra] = process.argv.slice(2)
  if (!['capture', 'verify'].includes(command) || !root || !manifestFile || extra.length)
    throw new Error('Usage: package-resources.mjs capture|verify <serverRoot> <manifest.json>')
  if (command === 'capture') {
    const destination = path.join(
      await realpath(path.dirname(path.resolve(manifestFile))),
      path.basename(manifestFile),
    )
    const existing = await lstat(destination).catch((error) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (existing && !existing.isFile())
      throw new Error('Resource manifest output must be a regular file')
    const relative = path.relative(await realpath(root), destination)
    if (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
      throw new Error('Resource manifest output must be outside the captured tree')
    const manifest = await captureResources(root)
    await writeFile(destination, `${JSON.stringify(manifest, null, 2)}\n`)
    console.log(JSON.stringify({ action: 'capture', ...diagnostics(manifest.files) }))
  } else {
    const result = await verifyResources(root, JSON.parse(await readFile(manifestFile, 'utf8')))
    console.log(JSON.stringify({ action: 'verify', ...result }))
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
