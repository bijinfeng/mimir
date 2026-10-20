# Production database shutdown: actual connection ownership

## Observed defect

The real production Electron/HTTP shutdown probe (`host-close-db-observation.log`) reached the HTTP close callback but then reported `PRODUCTION_SQLITE_OPEN_AFTER_CLOSE true`. This is separate from the native HTTP Session connection-drain deadline investigated by another reviewer.

`apps/server/src/db/client.ts` creates the actual SQLite or PostgreSQL client, but only writes its global HMR cache when `NODE_ENV !== production`. The previous `closeDb` looked exclusively at that development cache. Production therefore returned success without closing its actual database connection; both driver factories had the same ownership mismatch.

## Reproduction before fix

A fresh Node v22.23.1 subprocess imported the actual source client with `NODE_ENV=production`, its own temporary SQLite file and explicit test-only environment. It obtained the real Drizzle `db.$client`, created a table, wrote and read a row, then called `closeDb`. The new test failed with `actual: true, expected: false` at `client.open` after close. The development subprocess passed. This is retained in `production-db-close-before.log` (1 failed / 1 passed). No driver or close method was mocked.

## Minimal fix

The factories now retain the actual selected driver client in module-local references, for both newly created production connections and reused development connections. `closeDb` closes that reference directly, retaining PostgreSQL's existing `end({ timeout: 1 })` behavior. After successful close it clears the module reference and clears a development global only when that global still refers to the same connection. Production remains absent from the development global cache. Close errors propagate and do not clear the reference as if shutdown succeeded. Repeated calls after successful shutdown return without closing again.

Only `apps/server/src/db/client.ts` and the new isolated test `apps/server/src/test/db-client-close.test.ts` were changed by this reviewer. No other DB module, native Session drain implementation, production timeout, public API, schema, account or migration was changed. This restores the existing shutdown contract rather than introducing a new one; no spec contract was altered.

## Real regression coverage

The new test starts isolated production and development subprocesses, because ordinary Vitest/globalSetup already imports the test-mode database module. It checks the appropriate cache exists only in development and is cleared after successful shutdown.

SQLite checks real writes/reads before close, `open === false` after close, rejection of an actual query against the closed handle, repeated/parallel subsequent `closeDb` calls, and reopening the same file to read the original persisted row. The temporary root is removed in `finally`; fallback cleanup closes the handle when a regression fails.

PostgreSQL uses the same test with the repository's existing `TEST_DATABASE_URL` dialect selection and requires a `mimir_test` database name. A real second observer connection verifies that the tested client's backend PID exists before close and disappears from `pg_stat_activity` after close. A query on the ended client then rejects with `CONNECTION_ENDED`, and repeated/parallel subsequent closes succeed. The probe writes only a session-local temporary table. Both production and development scenarios passed against local PostgreSQL at 127.0.0.1:5432 in the dedicated database `mimir_test_db_close_20261020_2103`; that test database was created for this verification and dropped afterward. No existing task database was reused.

## Verification

All commands used `PATH=/Users/admin/.nvm/versions/node/v22.23.1/bin:$PATH`.

- Before fix: `pnpm --filter @mimir/server exec vitest run src/test/db-client-close.test.ts` — expected RED, production SQLite real handle remained open, development passed.
- Final SQLite: same command — GREEN, **2/2** production/development tests passed.
- Final real PostgreSQL: same command with `TEST_DATABASE_URL=postgres://admin@127.0.0.1:5432/mimir_test_db_close_20261020_2103` — GREEN, **2/2** production/development tests passed.
- `pnpm --filter @mimir/server typecheck` — pass (`tsc --noEmit`).
- `pnpm exec oxlint apps/server/src/db/client.ts apps/server/src/test/db-client-close.test.ts` — pass.
- `pnpm exec oxfmt --check apps/server/src/db/client.ts apps/server/src/test/db-client-close.test.ts` — pass.
- `git diff --check` — pass.

Logs are `production-db-close-before.log`, `production-db-close-after.log`, `production-db-close-postgres.log` and `production-db-close-typecheck.log` (present on disk; repository ignores .log files). The original real-host observation is preserved. No full monorepo quality gate, new packaged production host probe, remote CI, commit or push was performed by this reviewer. The root session must integrate the native Session fix and rerun the actual production host/update gate; this source-level real-driver verification does not substitute for it.
