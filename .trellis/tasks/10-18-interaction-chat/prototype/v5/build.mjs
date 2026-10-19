import { createRequire } from 'node:module'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile, readdir, symlink, lstat, unlink } from 'node:fs/promises'
const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../../../..')
const require = createRequire(join(repo, 'apps/web/package.json'))
const rr = createRequire(join(repo, 'packages/renderer/package.json'))
const isolated = process.env.MIMIR_CHAT_V5_DEPS || '/tmp/mimir-chat-tanstack-v5/deps'
const { build } = await import(require.resolve('vite'))
try {
  await lstat(join(here, 'node_modules'))
  await unlink(join(here, 'node_modules'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
await symlink(join(isolated, 'node_modules'), join(here, 'node_modules'), 'dir')
const aliases = ['react', 'react-dom', 'antd', 'antd-style', 'lucide-react'].map((name) => ({
  find: name,
  replacement: dirname((name === 'lucide-react' ? rr : require).resolve(`${name}/package.json`)),
}))
for (const name of [
  '@tanstack/ai-react',
  '@tanstack/ai-client',
  '@tanstack/ai',
  'react-markdown',
  'remark-gfm',
])
  aliases.push({
    find: new RegExp('^' + name + '$'),
    replacement: join(isolated, 'node_modules', name),
  })
const resolution = { versions: {}, documents: {} }
for (const name of ['@tanstack/ai-react', '@tanstack/ai-client', '@tanstack/ai'])
  resolution.versions[name] = JSON.parse(
    await readFile(join(isolated, 'node_modules', name, 'package.json'), 'utf8'),
  ).version
async function standalone(entry, source, out, destination) {
  await build({
    root: here,
    configFile: false,
    base: './',
    resolve: { alias: aliases, dedupe: ['react', 'react-dom'] },
    esbuild: { jsx: 'automatic' },
    plugins: [
      {
        name: 'verify-no-assistant-ui',
        generateBundle(_options, bundle) {
          const ids = Object.values(bundle)
            .filter((x) => x.type === 'chunk')
            .flatMap((x) => Object.keys(x.modules))
          if (ids.some((id) => id.includes('/@assistant-ui/') || id.includes('/vendor/')))
            throw Error('assistant-ui execution is forbidden in v5')
          const reactRoots = [
            ...new Set(
              ids
                .filter((id) => /\/react\/(?:index\.js|jsx-runtime\.js|cjs\/)/.test(id))
                .map((id) => id.slice(0, id.indexOf('/react/') + 6)),
            ),
          ]
          if (reactRoots.length !== 1) throw Error('Expected one project React')
          resolution.documents[entry] = {
            modules: ids.length,
            reactRoots,
            tanstack: ids.filter((id) => id.includes('/@tanstack/ai')),
          }
        },
      },
    ],
    build: {
      outDir: join(here, out),
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
  const files = await readdir(join(here, out, 'assets'))
  const js = await readFile(
    join(
      here,
      out,
      'assets',
      files.find((f) => f.endsWith('.js')),
    ),
    'utf8',
  )
  const cssName = files.find((f) => f.endsWith('.css'))
  const css = cssName ? await readFile(join(here, out, 'assets', cssName), 'utf8') : ''
  let html = await readFile(join(here, entry), 'utf8')
  html = html.replace(
    `<script type="module" src="/${source}"></script>`,
    () =>
      `<style>${css}</style><script type="module">${js.replaceAll('</script', '<\\/script')}</script>`,
  )
  await writeFile(join(here, destination), html)
}
await standalone('thread.html', 'thread-app.tsx', 'thread-dist', 'thread.review.html')
await standalone('index.html', 'main.tsx', 'dist', 'review.html')
await standalone(
  'interactions.entry.html',
  'interactions-app.tsx',
  'interactions-dist',
  'interactions.review.html',
)
await writeFile(
  join(here, 'interactions.html'),
  await readFile(join(here, 'interactions.review.html')),
)
await writeFile(join(here, 'runtime-resolution.json'), JSON.stringify(resolution, null, 2) + '\n')
