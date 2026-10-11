import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const appDest = process.env.TRIM_APPDEST
const etc = process.env.TRIM_PKGETC
const varDir = process.env.TRIM_PKGVAR
if (!appDest || !etc || !varDir) throw new Error('fnOS 未提供 Mimir 所需目录。')

const configPath = path.join(etc, 'config.json')
const configStat = await stat(configPath)
if (configStat.mode & 0o077) throw new Error('Mimir 配置文件权限过宽，应为 0600。')
const config = JSON.parse(await readFile(configPath, 'utf8'))
if (!config.ownerEmail || !config.ownerPassword || !config.authSecret) {
  throw new Error('Mimir 所有者配置不完整。')
}

const dataDir = path.join(varDir, 'data')
delete process.env.MIMIR_LOCAL_MODE
delete process.env.MIMIR_LOCAL_TOKEN
Object.assign(process.env, {
  NODE_ENV: 'production',
  OWNER_EMAIL: config.ownerEmail,
  OWNER_PASSWORD: config.ownerPassword,
  AUTH_SECRET: config.authSecret,
  DATA_DIR: dataDir,
  DATABASE_URL: `file:${path.join(dataDir, 'mimir.db')}`,
  WEB_DIST: path.join(appDest, 'server', 'web', 'dist'),
  MIMIR_FNOS_SOCKET: path.join(appDest, 'app.sock'),
  MIMIR_BASE_PATH: '/app/mimir',
})

const { startServer, closeDb } = await import('./server/dist/index.js')
const { server } = await startServer()

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(() => {
      closeDb()
      process.exit(0)
    })
  })
}
