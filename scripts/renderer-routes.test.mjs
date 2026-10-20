import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const renderer = fileURLToPath(new URL('../packages/renderer/', import.meta.url))

test('clean route generation prepares shared types and keeps desktop extras out of the base tree', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mimir-clean-routes-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const shared = path.join(root, 'renderer')
  const desktop = path.join(root, 'desktop')
  const web = path.join(root, 'web')
  await mkdir(path.join(shared, 'src/routes'), { recursive: true })
  await mkdir(path.join(desktop, 'src/routes'), { recursive: true })
  await mkdir(path.join(web, 'src'), { recursive: true })
  for (const file of ['generate-routes.mjs', 'route-config.mjs'])
    await copyFile(path.join(renderer, file), path.join(shared, file))
  await symlink(
    path.join(renderer, 'node_modules'),
    path.join(shared, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  await writeFile(
    path.join(shared, 'src/routes/__root.tsx'),
    "import { createRootRoute } from '@tanstack/react-router'; export const Route = createRootRoute()",
  )
  await writeFile(
    path.join(shared, 'src/routes/index.tsx'),
    "import { createFileRoute } from '@tanstack/react-router'; export const Route = createFileRoute('/')({})",
  )
  await writeFile(
    path.join(desktop, 'src/routes/settings.tsx'),
    "import { createFileRoute } from '@tanstack/react-router'; export const Route = createFileRoute('/client/settings')({})",
  )
  const generate = (cwd, ...args) => {
    const result = spawnSync(
      process.execPath,
      [path.join(shared, 'generate-routes.mjs'), ...args],
      {
        cwd,
        encoding: 'utf8',
      },
    )
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  }
  const baseTree = path.join(shared, 'src/routeTree.gen.ts')
  generate(web, 'src/routeTree.gen.ts')
  await access(baseTree)
  assert.match(await readFile(path.join(web, 'src/routeTree.gen.ts'), 'utf8'), /FileRoutesByPath/)
  await rm(baseTree)
  generate(desktop, 'src/routeTree.gen.ts', 'src/routes', '/client')
  const base = await readFile(baseTree, 'utf8')
  const client = await readFile(path.join(desktop, 'src/routeTree.gen.ts'), 'utf8')
  assert.match(base, /FileRoutesByPath/)
  assert.doesNotMatch(base, /client\/settings/)
  assert.match(client, /client\/settings/)
  generate(shared, 'src/routeTree.gen.ts')
  assert.doesNotMatch(await readFile(baseTree, 'utf8'), /client\/settings/)
})
