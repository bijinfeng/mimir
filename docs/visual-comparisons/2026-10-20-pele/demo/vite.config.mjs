import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = dirname(fileURLToPath(import.meta.url))
const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: root,
  encoding: 'utf8',
}).trim()
const before = process.env.TRIAL_BASELINE_ROOT
const renderer = resolve(repo, 'packages/renderer')
const rendererRequire = createRequire(resolve(renderer, 'package.json'))
const webRequire = createRequire(resolve(repo, 'apps/web/package.json'))
const esbuild = webRequire('esbuild')

export default {
  root,
  base: './',
  plugins: [
    {
      name: 'trial:frozen-diagram-entry',
      enforce: 'pre',
      resolveId(source, importer) {
        if (
          before &&
          importer?.endsWith('/editor/extensions.ts') &&
          source === './diagram-code-block'
        ) {
          return resolve(before, 'diagram-code-block.ts')
        }
      },
      async transform(code, id) {
        if (!id.includes('/packages/office/vendor/') || !/\.tsx?$/.test(id)) return
        return esbuild.transform(code, {
          sourcefile: id,
          loader: id.endsWith('.tsx') ? 'tsx' : 'ts',
          target: 'es2023',
          format: 'esm',
          tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: false } },
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@trial': resolve(renderer, 'src'),
      '@mimir/office': resolve(repo, 'packages/office/src/editors/markdown-find.ts'),
      '@mimir/shared': resolve(repo, 'packages/shared/src/index.ts'),
      ...Object.fromEntries(
        ['@tiptap/core', '@tiptap/react', '@tiptap/extension-code-block-lowlight'].map((name) => [
          name,
          resolve(dirname(rendererRequire.resolve(name)), '..'),
        ]),
      ),
      ...Object.fromEntries(
        ['dompurify', 'mermaid', 'wavedrom', 'json5'].map((name) => [
          name,
          rendererRequire.resolve(name),
        ]),
      ),
      react: dirname(webRequire.resolve('react/package.json')),
      'react-dom': dirname(webRequire.resolve('react-dom/package.json')),
      antd: dirname(webRequire.resolve('antd/package.json')),
      'antd-style': dirname(webRequire.resolve('antd-style/package.json')),
    },
  },
  esbuild: { jsx: 'automatic' },
  define: { __TRIAL_VARIANT__: JSON.stringify(before ? 'before' : 'after') },
  server: { host: '127.0.0.1', fs: { allow: [repo, ...(before ? [before] : [])] } },
}
