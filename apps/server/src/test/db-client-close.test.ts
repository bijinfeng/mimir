import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { TEST_DATABASE_URL } from './config.js'

const execFileAsync = promisify(execFile)

// A fresh process is essential: NODE_ENV and the selected database are read at
// module load, and the ordinary Vitest process already owns a test connection.
it.each(['production', 'development'])(
  'closes the actual %s database connection',
  async (nodeEnv) => {
    const isPostgres = /^postgres(ql)?:\/\//.test(TEST_DATABASE_URL)
    if (isPostgres && !new URL(TEST_DATABASE_URL).pathname.includes('mimir_test')) {
      throw new Error('Database close tests require a mimir_test PostgreSQL database')
    }
    const root = await mkdtemp(join(tmpdir(), 'mimir-db-close-'))
    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        [
          '--import',
          'tsx',
          '--input-type=module',
          '--eval',
          `
          import assert from 'node:assert/strict'
          import Database from 'better-sqlite3'
          import postgres from 'postgres'
          const { db, closeDb } = await import(${JSON.stringify(new URL('../db/client.ts', import.meta.url).href)})
          const client = db.$client
          const cacheKey = ${JSON.stringify(isPostgres ? '__mimirSql' : '__mimirSqlite')}
          assert.equal(globalThis[cacheKey], process.env.NODE_ENV === 'production' ? undefined : client)
          if (${isPostgres}) {
            const observer = postgres(process.env.DATABASE_URL, { max: 1 })
            try {
              const [{ pid }] = await client\`select pg_backend_pid() as pid\`
              await client\`create temporary table close_probe (value text)\`
              await client\`insert into close_probe values ('persisted')\`
              assert.equal((await client\`select value from close_probe\`)[0].value, 'persisted')
              assert.equal((await observer\`select pid from pg_stat_activity where pid = \${pid}\`).length, 1)
              await closeDb()
              assert.equal(globalThis[cacheKey], undefined)
              assert.equal((await observer\`select pid from pg_stat_activity where pid = \${pid}\`).length, 0)
              await assert.rejects(client\`select 1\`, { code: 'CONNECTION_ENDED' })
              await Promise.all([closeDb(), closeDb()])
              console.log('POSTGRES_CONNECTION_CLOSED_AND_IDEMPOTENT')
            } finally {
              await observer.end({ timeout: 1 })
              await client.end({ timeout: 1 })
            }
          } else {
            assert.equal(client.open, true)
            client.exec('create table close_probe (value text)')
            client.prepare('insert into close_probe values (?)').run('persisted')
            assert.equal(client.prepare('select value from close_probe').get().value, 'persisted')
            try {
              await closeDb()
              assert.equal(globalThis[cacheKey], undefined)
              assert.equal(client.open, false)
              assert.throws(() => client.prepare('select 1'), /not open/)
              await Promise.all([closeDb(), closeDb()])
              const reopened = new Database(process.env.DATABASE_URL.slice('file:'.length))
              try {
                assert.equal(reopened.prepare('select value from close_probe').get().value, 'persisted')
              } finally {
                reopened.close()
              }
              console.log('SQLITE_CONNECTION_CLOSED_AND_IDEMPOTENT')
            } finally {
              if (client.open) client.close()
            }
          }
        `,
        ],
        {
          env: {
            ...process.env,
            NODE_ENV: nodeEnv,
            DATA_DIR: root,
            DATABASE_URL: isPostgres ? TEST_DATABASE_URL : `file:${join(root, 'mimir.db')}`,
            AUTH_SECRET: 'test-secret-only-for-tests-0123456789',
            MIMIR_LOCAL_MODE: '0',
            MIMIR_FNOS_SOCKET: '',
          },
        },
      )
      expect(stdout).toContain(
        `${isPostgres ? 'POSTGRES' : 'SQLITE'}_CONNECTION_CLOSED_AND_IDEMPOTENT`,
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)
