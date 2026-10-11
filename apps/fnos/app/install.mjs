import { randomBytes } from 'node:crypto'
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'

function fail(message) {
  if (process.env.TRIM_TEMP_LOGFILE) {
    return import('node:fs/promises').then(({ writeFile }) =>
      writeFile(process.env.TRIM_TEMP_LOGFILE, `${message}\n`),
    )
  }
  console.error(message)
}

async function main() {
  const etc = process.env.TRIM_PKGETC
  const varDir = process.env.TRIM_PKGVAR
  if (!etc || !varDir) throw new Error('fnOS 未提供持久化配置或数据目录。')

  const configPath = path.join(etc, 'config.json')
  try {
    await readFile(configPath)
    return // 重试安装或覆盖升级绝不更换所有者与密钥。
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const ownerEmail = process.env.wizard_owner_email?.trim().toLowerCase()
  const ownerPassword = process.env.wizard_owner_password
  if (!ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) || ownerEmail.length > 254) {
    throw new Error('请输入有效的所有者邮箱。')
  }
  if (!ownerPassword || ownerPassword.length < 8 || ownerPassword.includes('\0')) {
    throw new Error('所有者密码至少需要 8 位。')
  }

  await mkdir(etc, { recursive: true, mode: 0o700 })
  await chmod(etc, 0o700)
  await mkdir(path.join(varDir, 'data'), { recursive: true, mode: 0o700 })
  await chmod(path.join(varDir, 'data'), 0o700)
  const temporaryPath = `${configPath}.${process.pid}.tmp`
  const config = {
    ownerEmail,
    ownerPassword,
    authSecret: randomBytes(32).toString('hex'),
  }
  try {
    const file = await open(temporaryPath, 'wx', 0o600)
    try {
      await file.writeFile(JSON.stringify(config))
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporaryPath, configPath)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

main().catch(async (error) => {
  await fail(error.message || 'Mimir 初始化失败。')
  process.exitCode = 1
})
