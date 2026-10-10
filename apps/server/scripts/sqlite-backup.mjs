import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const DATABASE_NAME = 'mimir.db'
const SECRET_NAME = 'auth-secret'
const MANIFEST_NAME = 'manifest.json'
const IGNORED_DB_FILES = new Set([
  DATABASE_NAME,
  `${DATABASE_NAME}-wal`,
  `${DATABASE_NAME}-shm`,
  `${DATABASE_NAME}-journal`,
])

function inside(parent, child) {
  const path = relative(parent, child)
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path))
}

async function present(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function safeRelative(path) {
  if (
    !path ||
    isAbsolute(path) ||
    path.includes('\\') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`备份清单包含非法路径：${path}`)
  }
  return path
}

async function walk(root, { omitDatabase = false } = {}) {
  const dirs = []
  const files = []
  async function visit(dir) {
    for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
      const path = dir ? `${dir}/${entry.name}` : entry.name
      if (omitDatabase && !dir && IGNORED_DB_FILES.has(entry.name)) continue
      if (entry.isSymbolicLink()) throw new Error(`数据目录包含符号链接，不能安全备份：${path}`)
      if (entry.isDirectory()) {
        dirs.push(path)
        await visit(path)
      } else if (entry.isFile()) {
        files.push(path)
      } else {
        throw new Error(`数据目录包含非普通文件：${path}`)
      }
    }
  }
  await visit('')
  return { dirs: dirs.toSorted(), files: files.toSorted() }
}

async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function copyChecked(source, target) {
  await mkdir(dirname(target), { recursive: true })
  await copyFile(source, target)
  const [sourceHash, targetHash] = await Promise.all([sha256(source), sha256(target)])
  if (sourceHash !== targetHash) throw new Error(`复制时文件发生变化：${source}`)
  return targetHash
}

function schemaMigration(sqlite) {
  const row = sqlite
    .prepare('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1')
    .get()
  if (!row) throw new Error('数据库没有已应用的迁移记录，不能确认实例 schema')
  return { hash: row.hash, createdAt: Number(row.created_at) }
}

/** 桌面本地模式：应用已退出时，创建 SQLite + 数据文件 + auth-secret 的一致备份。 */
export async function backupSqlite(dataDirInput, outputInput, { appStopped = false } = {}) {
  if (!appStopped) throw new Error('先完全退出桌面应用，再传 --app-stopped 创建备份')
  const dataDir = resolve(dataDirInput)
  const output = resolve(outputInput)
  if (inside(dataDir, output) || inside(output, dataDir)) {
    throw new Error('备份目录不能与数据目录重叠')
  }
  if (await present(output)) throw new Error(`备份目标已存在：${output}`)
  if (!(await lstat(dataDir)).isDirectory()) throw new Error('数据目录不是目录')
  if (!(await lstat(join(dataDir, DATABASE_NAME))).isFile()) throw new Error('找不到 SQLite 数据库')
  const secret = (await readFile(join(dataDir, SECRET_NAME), 'utf8')).trim()
  if (secret.length < 32) throw new Error('auth-secret 缺失或无效，不能创建完整实例备份')

  const staging = join(dirname(output), `.${basename(output)}.tmp-${randomUUID()}`)
  await mkdir(staging, { mode: 0o700 })
  try {
    // Online Backup API 捕获 WAL 中已提交的数据，不直接复制可能落后的 mimir.db。
    const sqlite = new Database(join(dataDir, DATABASE_NAME), {
      readonly: true,
      fileMustExist: true,
    })
    try {
      await sqlite.backup(join(staging, DATABASE_NAME))
    } finally {
      sqlite.close()
    }
    // 备份库若继承 WAL 模式，只读 quick_check 也可能在备份目录生成 -shm/-wal。
    // 归档副本不需要 WAL；先转成单文件 journal，再计算哈希与文件清单。
    const snapshot = new Database(join(staging, DATABASE_NAME))
    try {
      snapshot.pragma('journal_mode = DELETE')
    } finally {
      snapshot.close()
    }

    const tree = await walk(dataDir, { omitDatabase: true })
    if (tree.files.includes(MANIFEST_NAME)) {
      throw new Error('数据目录根部已有 manifest.json，无法生成无歧义的备份清单')
    }
    for (const dir of tree.dirs) await mkdir(join(staging, dir), { recursive: true })
    const hashes = {}
    hashes[DATABASE_NAME] = await sha256(join(staging, DATABASE_NAME))
    for (const file of tree.files) {
      hashes[file] = await copyChecked(join(dataDir, file), join(staging, file))
    }
    await chmod(join(staging, SECRET_NAME), 0o600)

    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    const snapshotForVersion = new Database(join(staging, DATABASE_NAME), {
      readonly: true,
      fileMustExist: true,
    })
    let schema
    try {
      schema = schemaMigration(snapshotForVersion)
    } finally {
      snapshotForVersion.close()
    }
    const manifest = {
      format: 'mimir-sqlite-backup-v1',
      appVersion: pkg.version,
      schemaMigration: schema,
      createdAt: new Date().toISOString(),
      dirs: tree.dirs,
      files: Object.entries(hashes)
        .map(([path, digest]) => ({ path, sha256: digest }))
        .toSorted((a, b) => a.path.localeCompare(b.path)),
    }
    await writeFile(join(staging, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o600,
    })
    await verifySqliteBackup(staging)
    await rename(staging, output)
    return manifest
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}

/** 不修改目标；校验清单、所有字节、文件集合和 SQLite 可读性。 */
export async function verifySqliteBackup(input) {
  const root = resolve(input)
  const manifest = JSON.parse(await readFile(join(root, MANIFEST_NAME), 'utf8'))
  if (manifest.format !== 'mimir-sqlite-backup-v1') throw new Error('不支持的备份格式')
  if (!Array.isArray(manifest.dirs) || !Array.isArray(manifest.files)) {
    throw new Error('备份清单缺少目录或文件列表')
  }
  const declaredDirs = manifest.dirs.map(safeRelative).toSorted()
  const declaredFiles = manifest.files.map((item) => safeRelative(item.path)).toSorted()
  if (!declaredFiles.includes(DATABASE_NAME) || !declaredFiles.includes(SECRET_NAME)) {
    throw new Error('备份缺少数据库或 auth-secret')
  }
  if (new Set(declaredFiles).size !== declaredFiles.length) throw new Error('备份清单有重复文件')
  const actual = await walk(root)
  const actualFiles = actual.files.filter((path) => path !== MANIFEST_NAME)
  if (
    JSON.stringify(actual.dirs) !== JSON.stringify(declaredDirs) ||
    JSON.stringify(actualFiles) !== JSON.stringify(declaredFiles)
  ) {
    throw new Error('备份文件集合与清单不一致')
  }
  for (const item of manifest.files) {
    if (
      !/^[a-f0-9]{64}$/.test(item.sha256) ||
      (await sha256(join(root, item.path))) !== item.sha256
    ) {
      throw new Error(`备份文件校验失败：${item.path}`)
    }
  }
  const secret = (await readFile(join(root, SECRET_NAME), 'utf8')).trim()
  if (secret.length < 32) throw new Error('备份中的 auth-secret 无效')
  const sqlite = new Database(join(root, DATABASE_NAME), { readonly: true, fileMustExist: true })
  try {
    if (sqlite.pragma('quick_check', { simple: true }) !== 'ok')
      throw new Error('SQLite quick_check 失败')
    if (JSON.stringify(schemaMigration(sqlite)) !== JSON.stringify(manifest.schemaMigration)) {
      throw new Error('备份清单的 schema 版本与数据库不一致')
    }
  } finally {
    sqlite.close()
  }
  return manifest
}

/** 仅恢复到不存在的目录；先校验，失败时不触碰目标。 */
export async function restoreSqliteBackup(backupInput, targetInput) {
  const backup = resolve(backupInput)
  const target = resolve(targetInput)
  if (inside(backup, target) || inside(target, backup)) {
    throw new Error('恢复目标不能与备份目录重叠')
  }
  if (await present(target)) throw new Error(`恢复目标已存在，拒绝覆盖：${target}`)
  const manifest = await verifySqliteBackup(backup)
  const staging = join(dirname(target), `.${basename(target)}.tmp-${randomUUID()}`)
  await mkdir(staging, { mode: 0o700 })
  try {
    for (const dir of manifest.dirs) await mkdir(join(staging, dir), { recursive: true })
    for (const item of manifest.files) {
      const copiedHash = await copyChecked(join(backup, item.path), join(staging, item.path))
      if (copiedHash !== item.sha256) throw new Error(`恢复期间备份文件发生变化：${item.path}`)
    }
    await chmod(join(staging, SECRET_NAME), 0o600)
    await rename(staging, target)
    return manifest
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}

async function main(args) {
  const [command, first, second, ...rest] = args
  if (command === 'backup' && first && second && rest.join(' ') === '--app-stopped') {
    const manifest = await backupSqlite(first, second, { appStopped: true })
    console.log(`备份完成并通过校验：${resolve(second)}（${manifest.files.length} 个文件）`)
  } else if (command === 'verify' && first && !second) {
    const manifest = await verifySqliteBackup(first)
    console.log(`备份校验通过：${resolve(first)}（${manifest.files.length} 个文件）`)
  } else if (command === 'restore' && first && second && rest.length === 0) {
    await restoreSqliteBackup(first, second)
    console.log(`恢复完成：${resolve(second)}`)
  } else {
    throw new Error(
      '用法：sqlite-backup.mjs backup <数据目录> <新备份目录> --app-stopped | verify <备份目录> | restore <备份目录> <不存在的目标目录>',
    )
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
