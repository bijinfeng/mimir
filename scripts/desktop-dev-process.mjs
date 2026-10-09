import { spawn } from 'node:child_process'

/** pnpm 会再启动构建工具和 Electron；命令独占进程组，退出时才能一起收尾。 */
export function spawnProcess(command, args, options) {
  return spawn(command, args, {
    ...options,
    detached: process.platform !== 'win32',
  })
}

export async function stopProcessTree(child, signal = 'SIGTERM') {
  if (!child.pid) return

  if (process.platform === 'win32') {
    // Windows 没有 POSIX 进程组；taskkill /T 递归关闭 pnpm 启动的子进程。
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
      })
      killer.once('error', resolve)
      killer.once('close', resolve)
    })
    return
  }

  try {
    // 即使 pnpm 自己已经退出，组内的 Vite/Electron 仍可能活着。
    process.kill(-child.pid, signal)
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
}
