import { createRequire } from 'node:module'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile, readdir } from 'node:fs/promises'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../../..')
const require = createRequire(join(repo, 'apps/web/package.json'))
const { build } = await import(require.resolve('vite'))
const aliases = ['react', 'react-dom', 'antd', 'antd-style'].map((name) => ({
  find: name,
  replacement: dirname(require.resolve(`${name}/package.json`)),
}))
await build({
  root: here,
  configFile: false,
  base: './',
  resolve: { alias: aliases, dedupe: ['react', 'react-dom'] },
  esbuild: { jsx: 'automatic' },
  build: {
    outDir: join(here, 'dist'),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client'))
          return
        warn(warning)
      },
      output: { inlineDynamicImports: true },
    },
  },
})
const files = await readdir(join(here, 'dist/assets'))
const js = await readFile(
  join(
    here,
    'dist/assets',
    files.find((f) => f.endsWith('.js')),
  ),
  'utf8',
)
const css = await readFile(
  join(
    here,
    'dist/assets',
    files.find((f) => f.endsWith('.css')),
  ),
  'utf8',
)
let html = await readFile(join(here, 'index.html'), 'utf8')
html = html.replace(
  '<script type="module" src="/main.tsx"></script>',
  () =>
    `<style>${css}</style><script type="module">${js.replaceAll('</script', '<\\/script')}</script>`,
)
await writeFile(join(here, 'review.html'), html)
console.log(`Standalone HTML: ${join(here, 'review.html')}`)
