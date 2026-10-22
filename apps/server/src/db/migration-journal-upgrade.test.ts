import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { expect, it } from 'vitest'

const execute = promisify(execFile)
const require = createRequire(import.meta.url)
it('upgrades both already-applied and skipped old out-of-order SQLite migrations without replay', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'mimir-migration-'))
  try {
    const folder = join(temp, 'legacy')
    await mkdir(join(folder, 'meta'), { recursive: true })
    const source = resolve(import.meta.dirname, '../../drizzle-sqlite')
    const journal = JSON.parse(await readFile(join(source, 'meta/_journal.json'), 'utf8')) as {
      entries: Array<{ tag: string; when: number }>
    }
    const legacy = journal.entries.filter((entry) => entry.tag <= '0012_cuddly_namora')
    legacy.at(-1)!.when = 1792311287590
    for (const entry of legacy)
      await writeFile(
        join(folder, entry.tag + '.sql'),
        await readFile(join(source, entry.tag + '.sql')),
      )
    await writeFile(
      join(folder, 'meta/_journal.json'),
      JSON.stringify({ ...journal, entries: legacy }),
    )
    const appliedPath = join(temp, 'applied.db'),
      skippedPath = join(temp, 'skipped.db'),
      laterPath = join(temp, 'later.db')
    const applied = new Database(appliedPath)
    migrate(drizzle(applied), { migrationsFolder: folder })
    applied.close()
    // First install up to the preceding migration, then upgrade through a journal
    // whose final timestamp is behind the installed maximum: real Drizzle skips it.
    await writeFile(
      join(folder, 'meta/_journal.json'),
      JSON.stringify({ ...journal, entries: legacy.slice(0, -1) }),
    )
    const skipped = new Database(skippedPath)
    migrate(drizzle(skipped), { migrationsFolder: folder })
    await writeFile(
      join(folder, 'meta/_journal.json'),
      JSON.stringify({ ...journal, entries: legacy }),
    )
    migrate(drizzle(skipped), { migrationsFolder: folder })
    expect(
      skipped.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='miniapp_devices'").get(),
    ).toEqual({ n: 0 })
    skipped.close()
    await copyFile(skippedPath, laterPath)
    for (const entry of journal.entries)
      await writeFile(
        join(folder, entry.tag + '.sql'),
        await readFile(join(source, entry.tag + '.sql')),
      )
    await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify(journal))
    const later = new Database(laterPath)
    migrate(drizzle(later), { migrationsFolder: folder })
    expect(
      later.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='miniapp_devices'").get(),
    ).toEqual({ n: 0 })
    later.close()
    for (const path of [appliedPath, skippedPath, laterPath]) {
      const script = `const {loadRuntimeConfigFromEnv,toServerConfig}=await import(${JSON.stringify(resolve(import.meta.dirname, '../runtime/config.ts'))});const {configureServer}=await import(${JSON.stringify(resolve(import.meta.dirname, '../config.ts'))});const {configureDb,closeDb}=await import(${JSON.stringify(resolve(import.meta.dirname, 'client.ts'))});const cfg=loadRuntimeConfigFromEnv({loadEnvFile:false});configureServer(toServerConfig(cfg));configureDb(cfg.database);const {runMigrations}=await import(${JSON.stringify(resolve(import.meta.dirname, 'migrate.ts'))});await runMigrations(cfg.migrations);await runMigrations(cfg.migrations);await closeDb()`
      await execute(
        process.execPath,
        ['--import', require.resolve('tsx'), '--input-type=module', '-e', script],
        { env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: `file:${path}`, DATA_DIR: temp } },
      )
      const updated = new Database(path)
      expect(
        updated
          .prepare(
            "SELECT count(*) AS n FROM sqlite_master WHERE name IN ('miniapp_devices','miniapp_operations','conversation_attachments','message_attachments')",
          )
          .get(),
      ).toEqual({ n: 4 })
      expect(
        updated
          .prepare('SELECT count(*) AS n FROM __drizzle_migrations WHERE created_at=1792311600001')
          .get(),
      ).toEqual({ n: 1 })
      expect(updated.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get()).toEqual({
        n: journal.entries.length,
      })
      updated.close()
    }
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
}, 20_000)
