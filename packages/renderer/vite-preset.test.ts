// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { expect, it, vi } from 'vitest'
import { rendererPlugins } from './vite-preset'

vi.mock('node:child_process', { spy: true })

function officeCssPlugins() {
  return rendererPlugins({ publicDir: '/unused', generatedRouteTree: '/unused/routes.ts' }).filter(
    (plugin) =>
      plugin &&
      typeof plugin === 'object' &&
      'name' in plugin &&
      plugin.name === 'mimir:generate-office-editor-css',
  )
}

it('generates usable Office CSS before resolving the renderer import', async () => {
  const plugins = officeCssPlugins()
  expect(plugins).toHaveLength(1)
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    publicDir: false,
    plugins,
    build: {
      write: false,
      rollupOptions: {
        input: fileURLToPath(new URL('../office/src/generated/editor.css', import.meta.url)),
      },
    },
  })
  if (Array.isArray(result) || !('output' in result)) throw new Error('Expected one bundle')
  const stylesheet = result.output.find((item) => item.fileName.endsWith('.css'))
  expect(stylesheet?.type).toBe('asset')
  if (stylesheet?.type !== 'asset') throw new Error('Office stylesheet missing from bundle')
  expect(String(stylesheet.source)).toContain('.page-dark')
  expect(String(stylesheet.source)).toContain('.ProseMirror')
})

it('aborts the renderer build if Office CSS generation fails', async () => {
  vi.mocked(execFileSync).mockImplementationOnce(() => {
    throw new Error('Office vendor stylesheet unavailable')
  })
  await expect(
    build({
      configFile: false,
      logLevel: 'silent',
      publicDir: false,
      plugins: officeCssPlugins(),
      build: {
        write: false,
        rollupOptions: {
          input: fileURLToPath(new URL('../office/src/generated/editor.css', import.meta.url)),
        },
      },
    }),
  ).rejects.toThrow('Office vendor stylesheet unavailable')
})

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
