# Backend implementation evidence — approved workspace v2

2026-10-18. Scoped ownership: shared folder contract; foldersRoute PATCH; folder update service; new folder-update integration tests. Product prototype HTML remains untouched. No commits made by backend implementer.

## Implemented contract

- PATCH `/api/folders` accepts `{from,to,description?}`. Omitted description preserves the stored value, `''` clears it, whitespace is trimmed consistently with create. The existing server 2000-character limit remains; null or >2000 is rejected with INVALID_INPUT. Same-path updates verify existence and can persist description without moving documents.
- Response adds `{path,description}` beside `moved`; additive schema fields are optional to accept older server responses. Empty description is returned as null, consistent with the folder tree.
- Existing stable folder code and icon are preserved. No DB schema/migration changes.
- Rename + description is one root SQL update after all file/index changes. Since storage and SQL have no shared transaction, mutation failures attempt to restore original note bytes (including custom YAML), upload metadata, document index assignments and folder paths/description. No async `db.transaction` is introduced.
- Failed upload metadata writes now fail the update rather than silently report success. FOLDER_UPDATE_FAILED /500 includes `details.recovery`, validated by shared `folderUpdateRecoverySchema`: `{code,path,description,retrySafe}`. Current path/description are queried from the folder registry by its existing stable code. A missing/unreadable recovery identity or any failed compensating write makes retrySafe false; UI must reconcile and block blind retry.
- This is compensated coordination, not a claim of crash-safe filesystem/DB atomicity or concurrent multiwriter isolation. Recovery inverses for folder paths additionally check stable code so a newly created unrelated target is not overwritten.

## Verification actually run

All passed:

1. `pnpm --filter @mimir/shared typecheck`
2. `pnpm --filter @mimir/server typecheck` (also after new tests)
3. `pnpm exec oxlint --deny-warnings packages/shared/src/structure.ts apps/server/src/routes/documents.ts apps/server/src/services/folders.ts apps/server/src/test/folder-update.test.ts`
4. `pnpm exec oxfmt --check` for the same four files.
5. SQLite: `pnpm --filter @mimir/server exec vitest run src/test/folder-update.test.ts src/test/api.test.ts src/test/vault-roundtrip.test.ts src/test/upload.test.ts` — 4 files / 66 tests passed, 13.26s.
6. PostgreSQL: same 4 files / 66 tests passed, 18.18s, with TEST_DATABASE_URL directed at a newly created dedicated `mimir_test_workspace` database on local PostgreSQL (vector + pg_trgm available). Dedicated database dropped after the run. No non-test database was reset.

The new 10 API/contract tests cover old request/response compatibility, auth, description-only save and clearing, historical >500 descriptions, unchanged updates, rename + metadata + subtree + note frontmatter + custom YAML, validation/notfound/conflict, controlled second-file failure, SQL failure after file write, incomplete compensation, upload metadata failure, safe retry and reindex persistence.

No full repository gate or browser QA run by this backend implementer; parent session coordinates those. Server integration runs share data/.test and have finished; parent may resume its server tests.
