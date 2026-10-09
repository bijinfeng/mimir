import { once } from 'node:events'
import { createServer } from 'node:net'
import { test } from 'node:test'
import { spawnProcess, stopProcessTree } from './desktop-dev-process.mjs'

async function checkPortReleasedAfterStoppingTree(wrapperExitsFirst) {
  const serverCode = `
    const { createServer } = require('node:net')
    const server = createServer()
    server.listen(0, '127.0.0.1', () => console.log('PORT:' + server.address().port))
  `
  const wrapperCode = `
    const { spawn } = require('node:child_process')
    spawn(process.execPath, ['-e', ${JSON.stringify(serverCode)}], { stdio: ['ignore', 'inherit', 'inherit'] })
    ${wrapperExitsFirst ? 'setTimeout(() => process.exit(1), 250)' : 'setInterval(() => {}, 1000)'}
  `
  const wrapper = spawnProcess(process.execPath, ['-e', wrapperCode], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  try {
    const port = await new Promise((resolve, reject) => {
      let output = ''
      const timeout = setTimeout(() => reject(new Error('孙进程未启动监听')), 5000)
      wrapper.stdout.on('data', (chunk) => {
        output += chunk.toString()
        const match = output.match(/PORT:(\d+)/)
        if (match) {
          clearTimeout(timeout)
          resolve(Number(match[1]))
        }
      })
      wrapper.once('error', reject)
    })

    if (wrapperExitsFirst) {
      if (wrapper.exitCode === null) await once(wrapper, 'exit')
    }
    const closed = once(wrapper, 'close')
    await stopProcessTree(wrapper)
    await closed

    // 端口能重新绑定，证明监听者也已退出，而不只是 pnpm 包装进程退出。
    const server = createServer()
    server.listen(port, '127.0.0.1')
    await once(server, 'listening')
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  } finally {
    await stopProcessTree(wrapper, 'SIGKILL')
  }
}

test('关闭 pnpm 包装进程时，监听端口的孙进程也退出', async () => {
  await checkPortReleasedAfterStoppingTree(false)
})

test('pnpm 已退出后仍能清理监听端口的孙进程', { skip: process.platform === 'win32' }, async () => {
  await checkPortReleasedAfterStoppingTree(true)
})
