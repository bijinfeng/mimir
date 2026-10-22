import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 桌面端的服务端产物：**调用统一 runtime 构建脚本**，不再自己 `pnpm deploy`。
 *
 * 输出是 `apps/desktop/runtime-build`（runtime 根，含 manifest）。`after-pack`
 * 把这个根整体复制到 `resources/server`，宿主只读 manifest 与其中的入口，
 * 不再知道 `dist` / `drizzle-sqlite` / `node_modules` 三件套。
 *
 * 默认 `--skip-build`：`pnpm desktop:build` 已经先跑过 `@mimir/server build`。
 * 单独调用时传 `--build`，脚本会自己构建服务端。
 */
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const result = spawnSync(
  process.execPath,
  [
    path.join(repositoryRoot, 'scripts/build-runtime.mjs'),
    '--out',
    path.join(repositoryRoot, 'apps/desktop/runtime-build'),
    ...(process.argv.includes('--build') ? [] : ['--skip-build']),
  ],
  {
    cwd: repositoryRoot,
    stdio: 'inherit',
  },
)
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
