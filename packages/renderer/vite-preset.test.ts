// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { build } from 'vite'
import { expect, it } from 'vitest'
import { rendererPlugins } from './vite-preset'

it('the shared host preset emits the full Phosphor MIT notice in the distributable bundle', async () => {
  const preset = rendererPlugins({ publicDir: '/unused', generatedRouteTree: '/unused/routes.ts' })
  const licenses = preset.filter(
    (plugin) =>
      plugin &&
      typeof plugin === 'object' &&
      'name' in plugin &&
      plugin.name === 'mimir:emit-phosphor-license',
  )
  expect(licenses).toHaveLength(1)
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    publicDir: false,
    plugins: [
      {
        name: 'test:license-entry',
        resolveId(id) {
          if (id === 'virtual:license-entry') return '\0license-entry'
        },
        load(id) {
          if (id === '\0license-entry') return 'export const licenseTest = true'
        },
      },
      ...licenses,
    ],
    build: { write: false, rollupOptions: { input: 'virtual:license-entry' } },
  })
  expect(Array.isArray(result)).toBe(false)
  if (Array.isArray(result) || !('output' in result)) throw new Error('Expected one bundle')
  const notice = result.output.find((item) => item.fileName === 'licenses/Phosphor-Icons-MIT.txt')
  expect(notice?.type).toBe('asset')
  if (notice?.type !== 'asset') throw new Error('Phosphor notice missing from bundle')
  const expected = await readFile(
    new URL('./src/components/library/phosphor-file-icons/LICENSE', import.meta.url),
    'utf8',
  )
  expect(String(notice.source)).toBe(expected)
  expect(expected).toContain('Copyright (c) 2023 Phosphor Icons')
  expect(expected).toContain('Permission is hereby granted')
})
