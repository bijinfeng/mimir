import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EXPECTED_SHELL_ABI, readRuntimeManifest } from './runtime-manifest.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(manifest: object) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mimir-runtime-manifest-'))
  roots.push(root)
  await mkdir(path.join(root, 'dist/runtime'), { recursive: true })
  await writeFile(path.join(root, 'dist/runtime/cli.js'), '// entry\n')
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest))
  return root
}

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    name: 'mimir-runtime',
    productVersion: '1.2.3',
    protocolVersion: 1,
    shellAbi: EXPECTED_SHELL_ABI,
    platform: process.platform,
    arch: process.arch,
    entry: 'dist/runtime/cli.js',
    library: 'dist/runtime/cli.js',
    required: ['dist/runtime/cli.js'],
    migrations: { sqlite: 'drizzle-sqlite', postgres: 'drizzle' },
    ...overrides,
  }
}

describe('runtime manifest', () => {
  it('returns the manifest after checking required files and versions', async () => {
    const root = await fixture(manifest())
    const result = await readRuntimeManifest(root, { productVersion: '1.2.3' })
    expect(result.entry).toBe('dist/runtime/cli.js')
    expect(result.shellAbi).toBe(EXPECTED_SHELL_ABI)
  })

  it('lists every missing required file with the rebuild command', async () => {
    const root = await fixture(
      manifest({ required: ['dist/runtime/cli.js', 'drizzle-sqlite/meta/_journal.json'] }),
    )
    await expect(readRuntimeManifest(root, { productVersion: '1.2.3' })).rejects.toThrow(
      /drizzle-sqlite\/meta\/_journal\.json[\s\S]*pnpm desktop:build/,
    )
  })

  it('rejects platform, product version and shellAbi mismatch before fork', async () => {
    const root = await fixture(
      manifest({ platform: process.platform === 'linux' ? 'darwin' : 'linux' }),
    )
    await expect(readRuntimeManifest(root, { productVersion: '1.2.3' })).rejects.toThrow(
      /平台不匹配/,
    )

    const versionRoot = await fixture(manifest())
    await expect(readRuntimeManifest(versionRoot, { productVersion: '9.9.9' })).rejects.toThrow(
      /版本不匹配/,
    )
    await expect(
      readRuntimeManifest(versionRoot, { productVersion: '1.2.3', shellAbi: 99 }),
    ).rejects.toThrow(/shellAbi.*99/)
  })

  it('rejects unsafe manifest paths instead of resolving outside the artifact', async () => {
    for (const field of ['entry', 'library', 'required']) {
      const root = await fixture(
        manifest(field === 'required' ? { required: ['../escape'] } : { [field]: '../escape' }),
      )
      await expect(readRuntimeManifest(root, { productVersion: '1.2.3' })).rejects.toThrow(
        /相对路径/,
      )
    }
  })
})
