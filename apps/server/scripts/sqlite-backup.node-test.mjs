import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { backupSqlite, restoreSqliteBackup, verifySqliteBackup } from './sqlite-backup.mjs'

test('SQLite 实例备份 → 校验 → 隔离目录恢复：数据库、文件、密钥都回来', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mimir-backup-test-'))
  try {
    const data = join(root, 'data')
    const backup = join(root, 'snapshot')
    const restored = join(root, 'restored')
    await mkdir(join(data, 'vault', 'notes'), { recursive: true })
    await mkdir(join(data, 'uploads', 'file-id'), { recursive: true })
    await mkdir(join(data, 'empty-dir'))
    await writeFile(join(data, 'auth-secret'), `${'s'.repeat(48)}\n`, { mode: 0o600 })
    await writeFile(join(data, 'vault', 'notes', 'hello.md'), '# 往返测试\n')
    await writeFile(join(data, 'uploads', 'file-id', 'original.bin'), Buffer.from([0, 1, 2, 255]))

    const db = new Database(join(data, 'mimir.db'))
    db.pragma('journal_mode = WAL')
    migrate(drizzle(db), {
      migrationsFolder: fileURLToPath(new URL('../drizzle-sqlite', import.meta.url)),
    })
    db.prepare(
      'INSERT INTO documents (id, kind, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('web-1', 'web', '抓取件', '只在数据库里的正文', 1, 1)
    db.prepare(
      'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ).run('conversation-1', '历史会话', 1, 1)
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, text, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('message-1', 'conversation-1', 'assistant', '带引用的回答', 1)
    db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      'capture.maxBytes',
      '8192',
      1,
    )
    // 保持连接开放、WAL 仍可能存在：备份必须通过 Online Backup API 包含已提交记录。
    const manifest = await backupSqlite(data, backup, { appStopped: true })
    assert.equal(manifest.format, 'mimir-sqlite-backup-v1')
    assert.equal(
      manifest.files.some((file) => file.path === 'mimir.db'),
      true,
    )
    assert.equal(
      manifest.files.some((file) => file.path === 'auth-secret'),
      true,
    )
    await verifySqliteBackup(backup)
    db.close()

    await restoreSqliteBackup(backup, restored)
    const restoredDb = new Database(join(restored, 'mimir.db'), { readonly: true })
    try {
      assert.equal(
        restoredDb.prepare('SELECT body FROM documents WHERE id = ?').get('web-1').body,
        '只在数据库里的正文',
      )
      assert.equal(
        restoredDb.prepare('SELECT text FROM messages WHERE id = ?').get('message-1').text,
        '带引用的回答',
      )
      assert.equal(
        restoredDb.prepare('SELECT value FROM settings WHERE key = ?').get('capture.maxBytes')
          .value,
        '8192',
      )
    } finally {
      restoredDb.close()
    }
    assert.equal(
      await readFile(join(restored, 'vault', 'notes', 'hello.md'), 'utf8'),
      '# 往返测试\n',
    )
    assert.deepEqual(
      await readFile(join(restored, 'uploads', 'file-id', 'original.bin')),
      Buffer.from([0, 1, 2, 255]),
    )
    assert.equal((await readFile(join(restored, 'auth-secret'), 'utf8')).trim(), 's'.repeat(48))
    await assert.rejects(restoreSqliteBackup(backup, restored), /目标已存在/)

    await writeFile(join(backup, 'vault', 'notes', 'hello.md'), 'tampered')
    await assert.rejects(verifySqliteBackup(backup), /校验失败/)
    await assert.rejects(restoreSqliteBackup(backup, join(root, 'must-not-exist')), /校验失败/)
    await assert.rejects(readFile(join(root, 'must-not-exist', 'mimir.db')), { code: 'ENOENT' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('无 auth-secret 时不能声称创建完整备份', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mimir-backup-test-'))
  try {
    const data = join(root, 'data')
    await mkdir(data)
    const db = new Database(join(data, 'mimir.db'))
    db.close()
    await assert.rejects(
      backupSqlite(data, join(root, 'snapshot'), { appStopped: true }),
      /auth-secret/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
