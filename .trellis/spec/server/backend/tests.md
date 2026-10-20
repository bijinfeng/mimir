# Test pattern

- Server tests use Vitest. API integration tests call `app.request()` in memory; [`api.test.ts`](../../../../apps/server/src/test/api.test.ts#L1-L39) checks both unauthenticated 401 responses and authenticated behavior. [`helpers.ts`](../../../../apps/server/src/test/helpers.ts#L1-L72) provides an idempotent test login and cookie-bearing client.
- Integration state is isolated under `data/.test`: [`config.ts`](../../../../apps/server/src/test/config.ts#L12-L28) sets the test database and data root, and [`global-setup.ts`](../../../../apps/server/src/test/global-setup.ts#L46-L92) clears that root and applies migrations. [`vitest.config.ts`](../../../../apps/server/vitest.config.ts#L4-L19) disables file-level parallelism because tests share the database.
- Default integration tests use SQLite. When a change affects dialect-specific search SQL, the same assertions also run against a `TEST_DATABASE_URL` Postgres database whose name contains `mimir_test`; the setup refuses other Postgres names in [`global-setup.ts`](../../../../apps/server/src/test/global-setup.ts#L44-L49).
- Test observable outcomes and the fragile boundary. [`api.test.ts`](../../../../apps/server/src/test/api.test.ts#L41-L106) checks status, file path, listing, and deletion; [`feeds.test.ts`](../../../../apps/server/src/test/feeds.test.ts#L149-L168) checks that fetched content becomes Markdown and can be searched. Use a real local HTTP server only when the network-fetch path itself matters, as in [`feeds.test.ts`](../../../../apps/server/src/test/feeds.test.ts#L120-L146).
- Chunking tests assert reversible offsets, deterministic ids, and complete source coverage in [`chunk.test.ts`](../../../../apps/server/src/lib/chunk.test.ts); [`chunks.test.ts`](../../../../apps/server/src/test/chunks.test.ts) checks that assembled citations point back to the source text. Settings tests exercise override → environment → default fallback in [`settings.test.ts`](../../../../apps/server/src/test/settings.test.ts#L94-L134).
- Renderer component tests use Vitest with `happy-dom` ([`vitest.config.ts`](../../../../packages/renderer/vitest.config.ts#L1-L12)). The [`SettingControl` test](../../../../packages/renderer/src/components/settings/SettingControl.test.tsx#L89-L125) checks that editing enables Save and clicking it calls the API. The repository's full gate is `pnpm check` ([`package.json`](../../../../package.json#L7-L16)).

## Test environment isolation contract

### 1. Scope / Trigger

The PostgreSQL dialect gate reruns ordinary/local server assertions. fnOS supports SQLite only and must remain isolated even when the invoking process exports a PostgreSQL TEST_DATABASE_URL.

### 2. Signatures

`FNOS_TEST_ENV: Record<string, string>` is consumed by `vitest.fnos.config.ts`; shared `setup(project: TestProject)` reads `project.config.env`.

### 3. Contracts

The setup and worker use the same DATABASE_URL/DATA_DIR. Ordinary/local tests retain TEST_ENV/LOCAL_MODE_TEST_ENV and the existing dialect selection. fnOS fixes SQLite to `file:./data/.test-fnos/mimir.db` and DATA_DIR to `./data/.test-fnos`, disables local bypass, and uses admin@example.com / 12345678. Production fnOS SQLite validation stays unchanged.

### 4. Validation & Error Matrix

- Missing project DATABASE_URL/DATA_DIR: fail before cleanup.
- PostgreSQL name lacking `mimir_test`: reject before schema deletion.
- fnOS invoked with outer PostgreSQL TEST_DATABASE_URL: clean/migrate only the independent fnOS SQLite root.

### 5. Good / Base / Bad

Good: both migration and fnOS workers select the dedicated SQLite database while a PG sentinel remains intact. Base: ordinary/local tests still run real PG when selected. Bad: overriding only worker env while globalSetup cleans or migrates the generic TEST_ENV database.

### 6. Tests Required

Run fnOS with an outer PG URL and assert driver, SQLite path, data root, standard account, Socket/auth behavior; rerun ordinary API/search and local mode on PG. A sentinel in the PG test schema must survive the fnOS run.

### 7. Wrong vs Correct

Wrong: globalSetup imports generic TEST_ENV independently of the Vitest project. Correct: project.config.env is the common source for cleanup, migration, and test workers.
