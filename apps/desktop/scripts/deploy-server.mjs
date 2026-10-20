import { spawnSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
// Only this fixed, gitignored build output is replaced; pnpm deploy requires an empty target.
await rm(path.join(repositoryRoot, 'apps/desktop/server-deploy'), { recursive: true, force: true })
const result = spawnSync(
  'pnpm',
  ['--filter', '@mimir/server', 'deploy', '--prod', 'apps/desktop/server-deploy'],
  {
    cwd: repositoryRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
)
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
