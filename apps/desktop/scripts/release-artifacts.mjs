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

// fnOS shares the stable release, but has no Electron update metadata or installer.
export const releaseTargets = {
  ...targets,
  'fnos-x64': {
    platform: 'linux',
    arch: 'x64',
    os: 'fnos',
    extensions: ['fpk'],
    updateMode: 'manual',
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

export function validateCommittedReleaseVersion(desktopVersion, fnosManifest, tag) {
  const version = validateVersion(desktopVersion, tag)
  const versions = fnosManifest.match(/^version=([^\r\n]*)\r?$/gm) ?? []
  if (versions.length !== 1 || versions[0].replace(/^version=/, '').replace(/\r$/, '') !== version)
    throw new Error('fnOS manifest version must exactly match the committed desktop version')
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

function targetAssetNames(version, target) {
  const installers = expectedNames(version, target)
  return {
    required: [...installers, ...(target.metadata ? [target.metadata] : [])],
    supplemental: target.metadata ? installers.map((name) => `${name}.blockmap`) : [],
  }
}

export function validateReleaseManifest(manifest) {
  validateVersion(manifest.version, manifest.tag)
  const required = new Set(['latest-mac.yml', 'latest.yml', 'latest-linux.yml'])
  const supplemental = []
  for (const target of Object.values(releaseTargets)) {
    const names = targetAssetNames(manifest.version, target)
    for (const name of names.required) required.add(name)
    supplemental.push(...names.supplemental)
  }
  const allowed = new Set([...required, ...supplemental])
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
  const target = releaseTargets[targetKey]
  if (
    !target ||
    !['manual', 'automatic'].includes(updateMode) ||
    (target.updateMode && updateMode !== target.updateMode)
  )
    throw new Error('Invalid build identity')
  const installers = expectedNames(version, target)
  if (target.metadata) await validateMetadata(releaseDir, target.metadata, version, installers)
  const { required, supplemental } = targetAssetNames(version, target)
  const available = await readdir(releaseDir)
  const names = [...required, ...supplemental.filter((name) => available.includes(name))]
  // Validate even metadata-free packages before creating a staged directory.
  const assets = await Promise.all(names.map((name) => describe(releaseDir, name)))
  await mkdir(path.dirname(outputDir), { recursive: true })
  await mkdir(outputDir, { recursive: false })
  for (const name of names) {
    await copyFile(path.join(releaseDir, name), path.join(outputDir, name))
  }
  await writeFile(
    path.join(outputDir, 'build-manifest.json'),
    JSON.stringify(
      { targetKey, platform: target.platform, arch: target.arch, version, updateMode, assets },
      null,
      2,
    ),
  )
}

export async function aggregateArtifacts({ inputDir, outputDir, version, tag }) {
  validateVersion(version, tag)
  const manifests = []
  const metadataByTarget = new Map()
  const installers = []
  const unique = new Set()
  // Validate the entire set before making a distributable directory.
  for (const [targetKey, target] of Object.entries(releaseTargets)) {
    const dir = path.join(inputDir, targetKey)
    const manifest = JSON.parse(await readFile(path.join(dir, 'build-manifest.json'), 'utf8'))
    if (
      manifest.targetKey !== targetKey ||
      manifest.platform !== target.platform ||
      manifest.arch !== target.arch ||
      manifest.version !== version ||
      !['manual', 'automatic'].includes(manifest.updateMode) ||
      (target.updateMode && manifest.updateMode !== target.updateMode)
    )
      throw new Error(`Wrong build identity: ${targetKey}`)
    const names = expectedNames(version, target)
    const { required, supplemental } = targetAssetNames(version, target)
    const allowed = new Set([...required, ...supplemental])
    const seen = new Set()
    if (!Array.isArray(manifest.assets)) throw new Error(`Invalid build assets: ${targetKey}`)
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
    if (!required.every((name) => seen.has(name))) throw new Error(`Incomplete build: ${targetKey}`)
    if (target.metadata)
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
  validateReleaseManifest(manifest)
  await writeFile(path.join(outputDir, 'release-manifest.json'), JSON.stringify(manifest, null, 2))
  return manifest
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'version') {
    const pkg = JSON.parse(await readFile('apps/desktop/package.json', 'utf8'))
    const fnosManifest = await readFile('apps/fnos/manifest', 'utf8')
    console.log(validateCommittedReleaseVersion(pkg.version, fnosManifest, args[0]))
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
