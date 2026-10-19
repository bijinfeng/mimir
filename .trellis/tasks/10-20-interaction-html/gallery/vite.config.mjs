import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = dirname(fileURLToPath(import.meta.url))
const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: root,
  encoding: 'utf8',
}).trim()
const source = process.env.GALLERY_SOURCE_ROOT ?? repo
const require = createRequire(resolve(repo, 'apps/web/package.json'))
const esbuild = require('esbuild')
export default {
  root,
  base: './',
  // Vendor contains type-only names in ordinary imports. Match TypeScript's
  // value-use erasure in this isolated build without rewriting vendored sources.
  plugins: [
    {
      name: 'gallery:vendor-typescript-erasure',
      enforce: 'pre',
      async transform(code, id) {
        if (!id.includes('/packages/office/vendor/') || !/\.tsx?$/.test(id)) return
        return esbuild.transform(code, {
          sourcefile: id,
          loader: id.endsWith('.tsx') ? 'tsx' : 'ts',
          target: 'es2023',
          format: 'esm',
          jsx: 'automatic',
          tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: false } },
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@gallery-repo': source,
      '@mimir/office': resolve(source, 'packages/office/src/editors/markdown-find.ts'),
      '@mimir/shared': resolve(repo, 'packages/shared/src/index.ts'),
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
