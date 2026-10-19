import { createRequire } from 'node:module'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile, readdir, symlink, lstat, readlink, unlink } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../../../..')
const require = createRequire(join(repo, 'apps/web/package.json'))
const rendererRequire = createRequire(join(repo, 'packages/renderer/package.json'))
const isolated = process.env.MIMIR_CHAT_V3_DEPS || '/tmp/mimir-chat-official-v3/deps'
const { build } = await import(require.resolve('vite'))
try {
  const path = join(here, 'node_modules')
  const stat = await lstat(path)
  if (!stat.isSymbolicLink()) throw new Error('Expected isolated prototype dependency symlink')
  if ((await readlink(path)) !== join(isolated, 'node_modules')) {
    await unlink(path)
    await symlink(join(isolated, 'node_modules'), path, 'dir')
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  await symlink(join(isolated, 'node_modules'), join(here, 'node_modules'), 'dir')
}
execFileSync(
  process.execPath,
  [
    join(isolated, 'node_modules/@tailwindcss/cli/dist/index.mjs'),
    '-i',
    join(here, 'official.css'),
    '-o',
    join(here, 'official.generated.css'),
    '--minify',
  ],
  { cwd: here, stdio: 'inherit' },
)
const aliases = ['react', 'react-dom', 'antd', 'antd-style', 'lucide-react'].map((name) => ({
  find: name,
  replacement: dirname(
    (name === 'lucide-react' ? rendererRequire : require).resolve(`${name}/package.json`),
  ),
}))
for (const name of [
  '@assistant-ui/react',
  '@assistant-ui/react-markdown',
  '@base-ui/react',
  'class-variance-authority',
  'cn',
  'remark-gfm',
  'zustand',
])
  aliases.push({ find: name, replacement: join(isolated, 'node_modules', name) })
for (const [find, path] of Object.entries({
  '@/components/assistant-ui': 'vendor/packages/ui/src/components/react/assistant-ui',
  '@/components/ui': 'vendor/packages/ui/src/components/react/ui/base',
  '@/hooks': 'vendor/packages/ui/src/hooks',
  '@/lib': 'vendor/packages/ui/src/lib',
}))
  aliases.push({ find, replacement: join(here, path) })
const license = (await readFile(join(here, 'vendor/LICENSE'), 'utf8'))
  .replaceAll('--', '&#45;&#45;')
  .replaceAll('>', '&gt;')
const resolution = {
  assistantUi: JSON.parse(
    await readFile(join(isolated, 'node_modules/@assistant-ui/react/package.json'), 'utf8'),
  ).version,
  core: JSON.parse(
    await readFile(join(isolated, 'node_modules/@assistant-ui/core/package.json'), 'utf8'),
  ).version,
  react: require('react/package.json').version,
  documents: {},
}
async function standalone(entry, source, outDir, destination) {
  await build({
    root: here,
    configFile: false,
    base: './',
    resolve: { alias: aliases, dedupe: ['react', 'react-dom'] },
    esbuild: { jsx: 'automatic' },
    plugins: [
      {
        name: 'verify-single-project-react',
        generateBundle(_options, bundle) {
          const ids = Object.values(bundle)
            .filter((item) => item.type === 'chunk')
            .flatMap((item) => Object.keys(item.modules))
          const reactModules = ids.filter((id) =>
            /\/react\/(?:index\.js|jsx-runtime\.js|cjs\/)/.test(id),
          )
          const reactRoots = [
            ...new Set(
              reactModules.map((id) => id.slice(0, id.indexOf('/react/') + '/react'.length)),
            ),
          ]
          if (reactRoots.length !== 1 || reactModules.some((id) => id.includes(isolated)))
            throw new Error('Expected one project React instance per document')
          resolution.documents[entry] = { reactRoots, reactModules, modules: ids.length }
        },
      },
    ],
    build: {
      outDir: join(here, outDir),
      emptyOutDir: true,
      cssCodeSplit: false,
      rollupOptions: {
        input: join(here, entry),
        onwarn(warning, warn) {
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client'))
            return
          warn(warning)
        },
        output: { codeSplitting: false },
      },
    },
  })
  const files = await readdir(join(here, outDir, 'assets'))
  const js = await readFile(
    join(
      here,
      outDir,
      'assets',
      files.find((file) => file.endsWith('.js')),
    ),
    'utf8',
  )
  const cssName = files.find((file) => file.endsWith('.css'))
  const css = cssName ? await readFile(join(here, outDir, 'assets', cssName), 'utf8') : ''
  let html = await readFile(join(here, entry), 'utf8')
  html = html.replace(
    `<script type="module" src="/${source}"></script>`,
    () =>
      `<style>${css}</style><script type="module">${js.replaceAll('</script', '<\\/script')}</script>`,
  )
  html = html.replace(
    /<!doctype html>/i,
    (doctype) =>
      `${doctype}\n<!--\nThird-party license: assistant-ui registry (AgentbaseAI Inc.)\n${license}\n-->`,
  )
  await writeFile(join(here, destination), html)
}
await standalone('thread.html', 'thread-app.tsx', 'thread-dist', 'thread.review.html')
await standalone('index.html', 'main.tsx', 'dist', 'review.html')
await writeFile(join(here, 'runtime-resolution.json'), JSON.stringify(resolution, null, 2) + '\n')
console.log(`Full official Thread HTML: ${join(here, 'review.html')}`)
