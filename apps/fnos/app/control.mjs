import { spawn, spawnSync } from 'node:child_process'
import { createConnection } from 'node:net'
import { chmod, mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const appDest = process.env.TRIM_APPDEST
const etc = process.env.TRIM_PKGETC
const varDir = process.env.TRIM_PKGVAR
const socket = appDest && path.join(appDest, 'app.sock')
const pidFile = varDir && path.join(varDir, 'mimir.pid')
const logFile = varDir && path.join(varDir, 'mimir.log')

async function report(message) {
  const location = process.env.TRIM_TEMP_LOGFILE
  if (location) await writeFile(location, `${message}\n`)
  else console.error(message)
}

function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }
  const command = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' })
  return command.status === 0 && command.stdout.includes(path.join(appDest, 'launch.mjs'))
}

async function runningPid() {
  try {
    const pid = Number((await readFile(pidFile, 'utf8')).trim())
    return alive(pid) ? pid : null
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function socketConnects() {
  return new Promise((resolve) => {
    const connection = createConnection(socket)
    connection.setTimeout(500)
    connection.once('connect', () => {
      connection.destroy()
      resolve(true)
    })
    connection.once('error', () => resolve(false))
    connection.once('timeout', () => {
      connection.destroy()
      resolve(false)
    })
  })
}

async function removeStaleSocket() {
  try {
    await stat(socket)
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }
  if (await socketConnects()) throw new Error('网关 Socket 已被其他进程占用；请检查应用状态。')
  await rm(socket)
}

async function start() {
  if (!appDest || !etc || !varDir) throw new Error('fnOS 未提供 Mimir 所需目录。')
  if (await runningPid()) return

  const configPath = path.join(etc, 'config.json')
  const configStat = await stat(configPath).catch(() => null)
  if (!configStat) throw new Error('缺少 Mimir 所有者配置，请重新安装应用。')
  if (configStat.mode & 0o077) throw new Error('Mimir 配置文件权限过宽，应为 0600。')
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  if (!config.ownerEmail || !config.ownerPassword || !config.authSecret) {
    throw new Error('Mimir 所有者配置不完整。')
  }
  await mkdir(path.join(varDir, 'data'), { recursive: true, mode: 0o700 })
  await chmod(path.join(varDir, 'data'), 0o700)
  await removeStaleSocket()

  const log = await open(logFile, 'a', 0o600)
  await chmod(logFile, 0o600)
  const child = spawn(process.execPath, [path.join(appDest, 'launch.mjs')], {
    detached: true,
    stdio: ['ignore', log.fd, log.fd],
    env: process.env,
  })
  await writeFile(pidFile, `${child.pid}\n`, { mode: 0o600 })
  await chmod(pidFile, 0o600)
  child.unref()
  await log.close()

  for (let attempt = 0; attempt < 150; attempt++) {
    if (await socketConnects()) return
    if (!alive(child.pid)) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (alive(child.pid)) process.kill(child.pid, 'SIGTERM')
  await rm(pidFile, { force: true })
  throw new Error(`Mimir 未能启动；请查看 ${logFile}。`)
}

async function stop() {
  if (!appDest || !varDir) return
  const pid = await runningPid()
  if (pid) {
    process.kill(pid, 'SIGTERM')
    for (let attempt = 0; attempt < 100 && alive(pid); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (alive(pid)) throw new Error(`Mimir 未能在 10 秒内停止；请检查 PID ${pid}。`)
  }
  await rm(pidFile, { force: true })
  await removeStaleSocket()
}

try {
  switch (process.argv[2]) {
    case 'start':
      await start()
      break
    case 'stop':
      await stop()
      break
    case 'status':
      process.exitCode = pidFile && (await runningPid()) ? 0 : 3
      break
    default:
      throw new Error('用法：main start|stop|status')
  }
} catch (error) {
  await report(error.message || 'Mimir 运行控制失败。')
  process.exitCode = 1
}
