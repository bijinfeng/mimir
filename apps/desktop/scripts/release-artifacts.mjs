import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, stringify } from 'yaml'

export const targets = {
  'mac-arm64': {
    platform: 'darwin',
    arch: 'arm64',
    os: 'mac',
    extensions: ['dmg', 'zip'],
    metadata: 'latest-mac.yml',
  },
  'mac-x64': {
    platform: 'darwin',
    arch: 'x64',
    os: 'mac',
    extensions: ['dmg', 'zip'],
    metadata: 'latest-mac.yml',
  },
  'win-x64': {
    platform: 'win32',
    arch: 'x64',
    os: 'win',
    extensions: ['exe'],
    metadata: 'latest.yml',
  },
  'linux-x64': {
    platform: 'linux',
    arch: 'x64',
    os: 'linux',
    extensions: ['AppImage'],
    metadata: 'latest-linux.yml',
  },
}

export function validateVersion(version, tag) {
  if (
    typeof version !== 'string' ||
    version.trim() !== version ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)
  )
    throw new Error(`Not a stable version: ${version}`)
  if (tag !== undefined && tag !== `v${version}`)
    throw new Error(`Tag ${tag} must exactly match v${version}`)
  return version
}

export async function hashFile(file, algorithm = 'sha512', encoding = 'base64') {
  const hash = createHash(algorithm)
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest(encoding)
}

function assetName(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9._-]+$/.test(name) || name === '.' || name === '..')
    throw new Error(`Unsafe asset name: ${name}`)
  return name
}

async function describe(dir, name) {
  assetName(name)
  const file = path.join(dir, name)
  const stat = await lstat(file)
  if (!stat.isFile() || stat.size === 0) throw new Error(`Missing or empty regular asset: ${name}`)
  return {
    name,
    size: stat.size,
    sha512: await hashFile(file),
    sha256: await hashFile(file, 'sha256', 'hex'),
  }
}

function expectedNames(version, target) {
  return target.extensions.map((ext) => `mimir-${version}-${target.os}-${target.arch}.${ext}`)
}

export function validateReleaseManifest(manifest) {
  validateVersion(manifest.version, manifest.tag)
  const required = new Set(['latest-mac.yml', 'latest.yml', 'latest-linux.yml'])
  for (const target of Object.values(targets))
    for (const name of expectedNames(manifest.version, target)) required.add(name)
  const allowed = new Set([
    ...required,
    ...[...required].filter((name) => !name.endsWith('.yml')).map((name) => `${name}.blockmap`),
  ])
  if (!Array.isArray(manifest.assets)) throw new Error('Release assets must be an array')
  const seen = new Set()
  for (const asset of manifest.assets) {
    assetName(asset.name)
    if (
      !allowed.has(asset.name) ||
      seen.has(asset.name) ||
      !Number.isSafeInteger(asset.size) ||
      asset.size <= 0 ||
      !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      !/^[A-Za-z0-9+/]{86}==$/.test(asset.sha512)
    )
      throw new Error(`Invalid release asset: ${asset.name}`)
    seen.add(asset.name)
  }
  if ([...required].some((name) => !seen.has(name)))
    throw new Error('Release is missing required platform assets')
}

export async function validateMetadata(dir, metadataName, version, names) {
  const metadata = parse(await readFile(path.join(dir, metadataName), 'utf8'))
  if (metadata.version !== version || !Array.isArray(metadata.files) || metadata.files.length === 0)
    throw new Error(`Invalid version/files in ${metadataName}`)
  const seen = new Set()
  for (const entry of metadata.files) {
    const name = assetName(entry.url)
    if (!names.includes(name) || seen.has(name))
      throw new Error(`Unexpected or duplicate reference: ${name}`)
    seen.add(name)
    const actual = await describe(dir, name)
    if (entry.sha512 !== actual.sha512 || entry.size !== actual.size)
      throw new Error(`Hash/size mismatch: ${name}`)
  }
  const fallback = metadata.files.find((entry) => entry.url === metadata.path)
  if (!fallback || fallback.sha512 !== metadata.sha512)
    throw new Error(`Invalid compatibility path/hash: ${metadataName}`)
  // Every installer must be present in its update metadata; blockmaps are supplemental.
  if (seen.size !== names.length) throw new Error(`Incomplete installer metadata: ${metadataName}`)
  return metadata
}

export async function stageArtifacts({ releaseDir, outputDir, targetKey, version, updateMode }) {
  validateVersion(version)
  const target = targets[targetKey]
  if (!target || !['manual', 'automatic'].includes(updateMode))
    throw new Error('Invalid build identity')
  const installers = expectedNames(version, target)
  await validateMetadata(releaseDir, target.metadata, version, installers)
  const names = [...installers, target.metadata]
  for (const name of installers) {
    const blockmap = `${name}.blockmap`
    if ((await readdir(releaseDir)).includes(blockmap)) names.push(blockmap)
  }
  await mkdir(path.dirname(outputDir), { recursive: true })
  await mkdir(outputDir, { recursive: false })
  const assets = []
  for (const name of names) {
    const asset = await describe(releaseDir, name)
    await copyFile(path.join(releaseDir, name), path.join(outputDir, name))
    assets.push(asset)
  }
  await writeFile(
    path.join(outputDir, 'build-manifest.json'),
    JSON.stringify({ targetKey, version, updateMode, assets }, null, 2),
  )
}

export async function aggregateArtifacts({ inputDir, outputDir, version, tag }) {
  validateVersion(version, tag)
  const manifests = []
  const metadataByTarget = new Map()
  const installers = []
  const unique = new Set()
  // Validate the entire set before making a distributable directory.
  for (const [targetKey, target] of Object.entries(targets)) {
    const dir = path.join(inputDir, targetKey)
    const manifest = JSON.parse(await readFile(path.join(dir, 'build-manifest.json'), 'utf8'))
    if (
      manifest.targetKey !== targetKey ||
      manifest.version !== version ||
      !['manual', 'automatic'].includes(manifest.updateMode)
    )
      throw new Error(`Wrong build identity: ${targetKey}`)
    const names = expectedNames(version, target)
    const allowed = new Set([...names, ...names.map((name) => `${name}.blockmap`), target.metadata])
    const seen = new Set()
    for (const asset of manifest.assets) {
      if (!allowed.has(asset.name) || seen.has(asset.name))
        throw new Error(`Unexpected manifest asset: ${asset.name}`)
      seen.add(asset.name)
      const actual = await describe(dir, asset.name)
      if (
        actual.size !== asset.size ||
        actual.sha512 !== asset.sha512 ||
        actual.sha256 !== asset.sha256
      )
        throw new Error(`Manifest mismatch: ${asset.name}`)
      if (asset.name !== target.metadata) {
        if (unique.has(asset.name)) throw new Error(`Conflicting asset: ${asset.name}`)
        unique.add(asset.name)
        installers.push({ dir, ...actual })
      }
    }
    if (![...names, target.metadata].every((name) => seen.has(name)))
      throw new Error(`Incomplete build: ${targetKey}`)
    metadataByTarget.set(targetKey, await validateMetadata(dir, target.metadata, version, names))
    manifests.push(manifest)
  }
  const macArm = metadataByTarget.get('mac-arm64')
  const macIntel = metadataByTarget.get('mac-x64')
  if (manifests[0].updateMode !== manifests[1].updateMode)
    throw new Error('macOS signing modes differ')
  const fallback = macIntel.files.find((file) => file.url.endsWith('.zip'))
  if (!fallback || !macArm.files.some((file) => file.url.endsWith('.zip')))
    throw new Error('macOS updates require both ZIPs')
  const mac = {
    ...macIntel,
    files: [...macIntel.files, ...macArm.files],
    path: fallback.url,
    sha512: fallback.sha512,
  }
  await mkdir(outputDir, { recursive: false })
  for (const asset of installers)
    await copyFile(path.join(asset.dir, asset.name), path.join(outputDir, asset.name))
  for (const [name, metadata] of [
    ['latest-mac.yml', mac],
    ['latest.yml', metadataByTarget.get('win-x64')],
    ['latest-linux.yml', metadataByTarget.get('linux-x64')],
  ])
    await writeFile(path.join(outputDir, name), stringify(metadata))
  const assets = []
  for (const name of (await readdir(outputDir)).toSorted())
    assets.push(await describe(outputDir, name))
  const manifest = { version, tag: `v${version}`, assets }
  await writeFile(path.join(outputDir, 'release-manifest.json'), JSON.stringify(manifest, null, 2))
  return manifest
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'version') {
    const pkg = JSON.parse(await readFile('apps/desktop/package.json', 'utf8'))
    console.log(validateVersion(pkg.version, args[0]))
  } else if (command === 'stage') {
    await stageArtifacts({
      releaseDir: args[0],
      outputDir: args[1],
      targetKey: args[2],
      version: args[3],
      updateMode: args[4],
    })
  } else if (command === 'aggregate') {
    await aggregateArtifacts({
      inputDir: args[0],
      outputDir: args[1],
      version: args[2],
      tag: args[3],
    })
  } else throw new Error('Expected version, stage or aggregate')
}
