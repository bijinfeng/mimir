#!/usr/bin/env node
/**
 * 桌面端开发编排（`pnpm desktop:dev`）。
 *
 * 与 `pnpm desktop:start` 使用同一条构建与进程内宿主路径。
 * 本地模式由宿主强制使用 userData 下的 SQLite；仓库 .env 的数据库配置不会覆盖它。
 *
 * 保留进程组清理：构建或 Electron 启动失败时不留孤儿进程。
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { spawnProcess, stopProcessTree } from './desktop-dev-process.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const children = []
function run(name, command, args, options = {}) {
  const child = spawnProcess(command, args, {
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
  const closed = new Promise((resolve) => child.once('close', resolve))
  children.push({ child, closed })
  child.on('error', (error) => {
    console.error(`${tag} 启动失败：`, error)
    void shutdown(1)
  })
  child.on('exit', (code) => {
    console.log(`${tag} 退出（code=${code ?? 'signal'}）`)
    void shutdown(code ?? 1)
  })
  return child
}

let shuttingDown = false
async function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  const results = await Promise.allSettled(children.map(({ child }) => stopProcessTree(child)))
  for (const result of results) {
    if (result.status === 'rejected') console.error('关闭开发进程失败：', result.reason)
  }

  // 给子进程收尾的时间；卡住时强制结束整个进程组。
  const closed = Promise.all(children.map(({ closed: done }) => done))
  let timeout
  const finished = await Promise.race([
    closed.then(() => true),
    new Promise((resolve) => {
      timeout = setTimeout(() => resolve(false), 5000)
    }),
  ])
  clearTimeout(timeout)
  if (!finished) {
    await Promise.allSettled(children.map(({ child }) => stopProcessTree(child, 'SIGKILL')))
  }
  process.exit(code)
}
process.on('SIGINT', () => void shutdown(130))
process.on('SIGTERM', () => void shutdown(143))

run('desktop', 'pnpm', ['desktop:start'], {
  // Electron 首次启动会单独下载二进制；pnpm 的 npm registry 不控制这一步。
  env: { ELECTRON_MIRROR: process.env.ELECTRON_MIRROR ?? 'https://npmmirror.com/mirrors/electron/' },
})
