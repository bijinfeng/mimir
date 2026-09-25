#!/usr/bin/env node
/**
 * 桌面端开发编排（`pnpm desktop:dev`）。
 *
 * 三件事并行：服务端 dev（3000，走 .env）、web vite（5173）、Electron 壳。
 * Electron 只加载 http://localhost:5173（MIMIR_DESKTOP_URL），不进程内起宿主——
 * 迭代前端用这条链路；进程内宿主（与打包一致）用 `pnpm desktop:start` 验证。
 *
 * 任一子进程退出即全部收尾，不留孤儿。
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const children = []
function run(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const tag = `[${name}]`
  child.stdout.on('data', (data) =>
    process.stdout.write(
      data
        .toString()
        .split('\n')
        .filter(Boolean)
        .map((line) => `${tag} ${line}`)
        .join('\n') + '\n',
    ),
  )
  child.stderr.on('data', (data) =>
    process.stderr.write(
      data
        .toString()
        .split('\n')
        .filter(Boolean)
        .map((line) => `${tag} ${line}`)
        .join('\n') + '\n',
    ),
  )
  child.on('exit', (code) => {
    console.log(`${tag} 退出（code=${code ?? 'signal'}）`)
    shutdown(code ?? 1)
  })
  children.push(child)
  return child
}

let shuttingDown = false
function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  process.exit(code)
}
process.on('SIGINT', () => shutdown(130))
process.on('SIGTERM', () => shutdown(143))

// 1. 服务端 + 前端
run('server', 'pnpm', ['--filter', '@mimir/server', 'dev'])
run('web', 'pnpm', ['--filter', '@mimir/web', 'dev'])

// 2. 等 5173 就绪后再开 Electron 窗口
const webUrl = 'http://localhost:5173/'
const deadline = Date.now() + 30000
async function waitWeb() {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(webUrl)
      if (res.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`web dev server 未就绪：${webUrl}`)
}

waitWeb()
  .then(() => {
    run('electron', 'pnpm', ['--filter', '@mimir/desktop', 'start'], {
      cwd: join(repoRoot, 'apps/desktop'),
      env: { MIMIR_DESKTOP_URL: webUrl },
    })
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    shutdown(1)
  })
