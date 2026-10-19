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
export default {
  root,
  base: './',
  resolve: {
    alias: {
      '@gallery-repo': source,
      '@mimir/shared': resolve(repo, 'packages/shared/src/index.ts'),
      react: dirname(require.resolve('react/package.json')),
      'react-dom': dirname(require.resolve('react-dom/package.json')),
      antd: dirname(require.resolve('antd/package.json')),
      'antd-style': dirname(require.resolve('antd-style/package.json')),
      '@tanstack/react-query': dirname(require.resolve('@tanstack/react-query/package.json')),
      '@tanstack/react-router': dirname(require.resolve('@tanstack/react-router/package.json')),
    },
  },
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', fs: { allow: [repo, source, '/private/tmp'] } },
}
