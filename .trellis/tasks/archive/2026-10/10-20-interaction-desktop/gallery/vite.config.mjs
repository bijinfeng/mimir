import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
const root = dirname(fileURLToPath(import.meta.url))
const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: root,
  encoding: 'utf8',
}).trim()
const source = process.env.GALLERY_SOURCE_ROOT ?? repo
const require = createRequire(resolve(repo, 'apps/desktop/package.json'))
export default {
  root,
  cacheDir: resolve(
    '/private/tmp',
    source === repo ? 'mimir-desktop-gallery-after-cache' : 'mimir-desktop-gallery-before-cache',
  ),
  base: `/docs/visual-comparisons/2026-10-20-desktop/demo/dist/${source === repo ? 'after' : 'before'}/`,
  publicDir: resolve(root, 'public'),
  // Vendor contains type-only names in ordinary imports. Match TypeScript's
  // value-use erasure in this isolated build without rewriting vendored sources.
  plugins: [
    {
      name: 'gallery:real-source-provenance',
      generateBundle() {
        const files = [...this.getModuleIds()]
          .map((id) => id.split('?')[0])
          .filter((id) => id.startsWith('/') && !id.includes('/node_modules/'))
          .filter((id) => {
            try {
              return statSync(id).isFile()
            } catch {
              return false
            }
          })
        const sources = [...new Set(files)].toSorted().map((file) => ({
          path: file.startsWith(`${root}/`)
            ? `gallery/${file.slice(root.length + 1)}`
            : file.startsWith(`${source}/`)
              ? file.slice(source.length + 1)
              : file,
          bytes: statSync(file).size,
          sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
        }))
        this.emitFile({
          type: 'asset',
          fileName: 'source-manifest.json',
          source:
            JSON.stringify(
              {
                variant: source === repo ? 'after' : 'before',
                baseline: '53285bb',
                files: sources,
              },
              null,
              2,
            ) + '\n',
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@gallery-repo': source,
      '@mimir/renderer/titlebar-kit': resolve(source, 'packages/renderer/src/titlebar-kit.ts'),
      '@mimir/shared/desktop': resolve(source, 'packages/shared/src/desktop.ts'),
      '@': resolve(source, 'apps/desktop/src/renderer'),
      '@tanstack/react-query': dirname(require.resolve('@tanstack/react-query/package.json')),
      '@tanstack/react-router': dirname(require.resolve('@tanstack/react-router/package.json')),
      react: dirname(require.resolve('react/package.json')),
      'react-dom': dirname(require.resolve('react-dom/package.json')),
      antd: dirname(require.resolve('antd/package.json')),
      'antd-style': dirname(require.resolve('antd-style/package.json')),
    },
  },
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', fs: { allow: [repo, source, '/private/tmp'] } },
  define: { __GALLERY_VARIANT__: JSON.stringify(source === repo ? 'after' : 'before') },
}
