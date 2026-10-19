import { createRequire } from 'node:module'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile, readdir, symlink, lstat, readlink, unlink } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../../../..')
const require = createRequire(join(repo, 'apps/web/package.json'))
const rendererRequire = createRequire(join(repo, 'packages/renderer/package.json'))
const { build } = await import(require.resolve('vite'))

const isolated =
  process.env.MIMIR_CHAT_PROTOTYPE_DEPS || '/tmp/mimir-chat-official-v2/official-deps'
const depsRequire = createRequire(join(isolated, 'package.json'))
const modulesLink = join(here, 'node_modules')
try {
  const stat = await lstat(modulesLink)
  if (!stat.isSymbolicLink())
    throw new Error('Prototype node_modules must be its own isolated symlink')
  if ((await readlink(modulesLink)) !== join(isolated, 'node_modules')) {
    await unlink(modulesLink)
    await symlink(join(isolated, 'node_modules'), modulesLink, 'dir')
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  await symlink(join(isolated, 'node_modules'), modulesLink, 'dir')
}
// Compile the official registry CSS with its actual Tailwind engine, then scope its selectors.
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
const postcss = (await import(depsRequire.resolve('postcss'))).default
const prefixSelector = (await import(depsRequire.resolve('postcss-prefix-selector'))).default
const officialCss = await postcss([
  prefixSelector({
    prefix: '.official-message',
    transform(prefix, selector, prefixedSelector) {
      if ([':root', ':host', 'html', 'body'].includes(selector)) return prefix
      if (selector === '.dark') return `${prefix}:is(.dark *)`
      return prefixedSelector
    },
  }),
]).process(await readFile(join(here, 'official.generated.css'), 'utf8'), { from: undefined })
await writeFile(join(here, 'official.scoped.css'), officialCss.css)

const aliases = ['react', 'react-dom', 'antd', 'antd-style', 'lucide-react'].map((name) => ({
  find: name,
  replacement: dirname(
    (name === 'lucide-react' ? rendererRequire : require).resolve(`${name}/package.json`),
  ),
}))
aliases.push(
  { find: '@assistant-ui/react', replacement: join(isolated, 'node_modules/@assistant-ui/react') },
  { find: '@base-ui/react', replacement: join(isolated, 'node_modules/@base-ui/react') },
  {
    find: 'class-variance-authority',
    replacement: depsRequire.resolve('class-variance-authority'),
  },
  { find: 'cn', replacement: depsRequire.resolve('cn') },
  { find: '@/lib/utils', replacement: join(here, 'vendor/packages/ui/src/lib/utils.ts') },
  {
    find: '@/components/ui/button',
    replacement: join(here, 'vendor/packages/ui/src/components/react/ui/base/button.tsx'),
  },
  {
    find: '@/components/ui/textarea',
    replacement: join(here, 'vendor/packages/ui/src/components/react/ui/base/textarea.tsx'),
  },
)
await build({
  root: here,
  configFile: false,
  base: './',
  resolve: { alias: aliases, dedupe: ['react', 'react-dom'] },
  esbuild: { jsx: 'automatic' },
  plugins: [
    {
      name: 'record-prototype-runtime-resolution',
      async generateBundle(_options, bundle) {
        const moduleIds = Object.values(bundle)
          .filter((item) => item.type === 'chunk')
          .flatMap((item) => Object.keys(item.modules))
        const reactModules = moduleIds.filter((id) =>
          /\/react\/(?:index\.js|jsx-runtime\.js|cjs\/)/.test(id),
        )
        const roots = [
          ...new Set(
            reactModules.map((id) => id.slice(0, id.indexOf('/react/') + '/react'.length)),
          ),
        ]
        if (roots.length !== 1 || reactModules.some((id) => id.includes(isolated)))
          throw new Error('Expected a single project React instance')
        await writeFile(
          join(here, 'runtime-resolution.json'),
          JSON.stringify(
            {
              assistantUi: JSON.parse(
                await readFile(
                  join(isolated, 'node_modules/@assistant-ui/react/package.json'),
                  'utf8',
                ),
              ).version,
              react: require('react/package.json').version,
              reactRoots: roots,
              reactModules,
              isolatedProductChanges: false,
            },
            null,
            2,
          ) + '\n',
        )
      },
    },
  ],
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
      output: { codeSplitting: false },
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
const officialLicense = await readFile(join(here, 'vendor/LICENSE'), 'utf8')
// A standalone HTML may leave its directory; preserve the full upstream MIT notice in it.
// Encode comment delimiters before insertion so a future notice cannot close the comment.
const safeLicense = officialLicense.replaceAll('--', '&#45;&#45;').replaceAll('>', '&gt;')
html = html.replace(
  /<!doctype html>/i,
  (doctype) =>
    `${doctype}\n<!--\nThird-party license: assistant-ui registry (AgentbaseAI Inc.)\n${safeLicense}\n-->`,
)
await writeFile(join(here, 'review.html'), html)
console.log(`Standalone HTML: ${join(here, 'review.html')}`)
