import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const here = dirname(fileURLToPath(import.meta.url))
let repo = here
while (!existsSync(resolve(repo, 'pnpm-workspace.yaml'))) {
  const parent = dirname(repo)
  if (parent === repo) throw new Error('Run this gallery within the Mimir repository')
  repo = parent
}
const require = createRequire(resolve(repo, 'apps/web/package.json'))
export default {
  root: here,
  base: './',
  resolve: { alias: {
    '@gallery-sdk': resolve(repo, 'packages/chat/node_modules/@tanstack/ai-react'),
    '@gallery-repo': process.env.GALLERY_SOURCE_ROOT ?? repo,
    '@mimir/chat': resolve(process.env.GALLERY_SOURCE_ROOT ?? repo, 'packages/chat/src/index.ts'),
    '@mimir/shared': resolve(repo, 'packages/shared/src/index.ts'),
    react: dirname(require.resolve('react/package.json')),
    'react-dom': dirname(require.resolve('react-dom/package.json')),
    antd: dirname(require.resolve('antd/package.json')),
    'antd-style': dirname(require.resolve('antd-style/package.json')),
  } },
  esbuild: { jsx: 'automatic' },
  build: { outDir: process.env.GALLERY_OUT ?? '/private/tmp/mimir-chat-polish-after', emptyOutDir: true },
  server: { host: '127.0.0.1' },
}
