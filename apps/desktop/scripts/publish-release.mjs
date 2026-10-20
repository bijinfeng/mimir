import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { lstat, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashFile, validateReleaseManifest, validateVersion } from './release-artifacts.mjs'

// The API adapter is injected so failure ordering can be tested without publishing.
export async function publishRelease({ api, manifest, commit }) {
  validateReleaseManifest(manifest)
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Expected exact release commit')
  const marker = `<!-- mimir-desktop-build:${commit} -->`
  let release = await api.find(manifest.tag)
  if (release && !release.draft)
    throw new Error('Published releases are immutable; bump the version')
  if (
    release &&
    (!release.body?.includes(marker) ||
      release.tag_name !== manifest.tag ||
      release.target_commitish !== commit)
  )
    throw new Error('Draft does not belong to this build commit')
  if (!release)
    release = await api.create({
      tag_name: manifest.tag,
      target_commitish: commit,
      name: `mimir ${manifest.version}`,
      body: `${marker}\n\n桌面客户端安装包与 fnOS x86_64 原生 FPK。macOS 默认是需手动更新的测试包；fnOS 通过系统管理安装和升级。各平台限制和更新说明见仓库 README。`,
      draft: true,
      prerelease: false,
      make_latest: 'false',
      generate_release_notes: true,
    })
  const existing = await api.assets(release.id)
  const names = new Set(manifest.assets.map((asset) => asset.name))
  if (existing.some((asset) => !names.has(asset.name)))
    throw new Error('Draft contains assets outside this build')
  for (const asset of existing) await api.removeAsset(asset.id)
  for (const asset of manifest.assets) await api.upload(release, asset)
  const uploaded = await api.assets(release.id)
  if (uploaded.length !== manifest.assets.length) throw new Error('Incomplete draft uploads')
  for (const asset of manifest.assets) {
    const remote = uploaded.find((item) => item.name === asset.name)
    if (!remote || remote.size !== asset.size || (await api.digest(remote)) !== asset.sha256)
      throw new Error(`Uploaded asset mismatch: ${asset.name}`)
  }
  // This is the only operation that makes the version visible to auto-updaters.
  return api.publish(release.id)
}

/** Recheck downloaded artifacts before creating or changing any remote draft. */
export async function validateReleaseDirectory(dir, manifest) {
  validateReleaseManifest(manifest)
  for (const asset of manifest.assets) {
    const file = path.join(dir, asset.name)
    const stat = await lstat(file)
    if (
      !stat.isFile() ||
      stat.size !== asset.size ||
      (await hashFile(file, 'sha256', 'hex')) !== asset.sha256 ||
      (await hashFile(file)) !== asset.sha512
    )
      throw new Error(`Local asset mismatch: ${asset.name}`)
  }
}

async function publishDirectory(dir) {
  const token = process.env.GITHUB_TOKEN
  if (
    !token ||
    process.env.GITHUB_REPOSITORY !== 'bijinfeng/mimir' ||
    process.env.GITHUB_EVENT_NAME !== 'push' ||
    process.env.GITHUB_REF_TYPE !== 'tag'
  )
    throw new Error('Publishing is restricted to official tag workflow runs')
  const manifest = JSON.parse(await readFile(path.join(dir, 'release-manifest.json'), 'utf8'))
  validateVersion(manifest.version, process.env.GITHUB_REF_NAME)
  await validateReleaseDirectory(dir, manifest)
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }
  const endpoint = 'https://api.github.com/repos/bijinfeng/mimir'
  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } })
    if (!response.ok) throw new Error(`GitHub request failed (${response.status})`)
    return response
  }
  const api = {
    async find(tag) {
      const response = await fetch(`${endpoint}/releases/tags/${encodeURIComponent(tag)}`, {
        headers,
      })
      if (response.status === 404) {
        // A draft may not have created its tag yet. Authenticated listing includes drafts.
        for (let page = 1; ; page++) {
          const releases = await (
            await request(`${endpoint}/releases?per_page=100&page=${page}`)
          ).json()
          const existing = releases.find((item) => item.tag_name === tag)
          if (existing) return existing
          if (releases.length < 100) return null
        }
      }
      if (!response.ok) throw new Error(`Release lookup failed (${response.status})`)
      return response.json()
    },
    async create(body) {
      return (
        await request(`${endpoint}/releases`, { method: 'POST', body: JSON.stringify(body) })
      ).json()
    },
    async assets(id) {
      return (await request(`${endpoint}/releases/${id}/assets?per_page=100`)).json()
    },
    async removeAsset(id) {
      await request(`${endpoint}/releases/assets/${id}`, { method: 'DELETE' })
    },
    async upload(release, asset) {
      // Do not trust a URL from a mutable release description or uploaded metadata.
      await request(
        `https://uploads.github.com/repos/bijinfeng/mimir/releases/${release.id}/assets?name=${encodeURIComponent(asset.name)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(asset.size),
          },
          body: createReadStream(path.join(dir, asset.name)),
          duplex: 'half',
        },
      )
    },
    async digest(asset) {
      if (typeof asset.digest === 'string' && /^sha256:[a-f0-9]{64}$/.test(asset.digest))
        return asset.digest.slice(7)
      const response = await request(`${endpoint}/releases/assets/${asset.id}`, {
        headers: { Accept: 'application/octet-stream' },
      })
      const hash = createHash('sha256')
      for await (const chunk of response.body) hash.update(chunk)
      return hash.digest('hex')
    },
    async publish(id) {
      return (
        await request(`${endpoint}/releases/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ draft: false, prerelease: false, make_latest: 'true' }),
        })
      ).json()
    },
  }
  // Annotated tag objects can have a different SHA than their checked-out commit.
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const taggedCommit = execFileSync('git', ['rev-parse', `${manifest.tag}^{commit}`], {
    encoding: 'utf8',
  }).trim()
  if (commit !== taggedCommit)
    throw new Error('Release tag does not identify the checked-out commit')
  await publishRelease({ api, manifest, commit })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await publishDirectory(process.argv[2])
