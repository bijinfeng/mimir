# Independent implementation review — workspace v2

2026-10-18. Reviewed against the approved v2 task PRD/design/implementation plan, shared/server/renderer contracts and current code. Prototype HTML was not changed. No product fixes were needed in this review; no commits made.

## Findings (fixed)

None. Scoped lint, format, type checks and focused behavior tests pass.

## Findings (not fixed)

No blocking implementation findings. The main session owns canonical specification synchronization, actual browser acceptance, and the full repository gate; these are still required before completion and are not replaced by this review. Pre-existing theme/spec changes, platform/skill changes and Office binary fixtures were excluded from review ownership.

## Behavior reviewed

- Description-only and explicit clearing flow through shared schema → renderer API → PATCH → folder service; omitted description preserves legacy values. Old callers receiving only `moved` remain compatible. Existing icons/codes remain intact, and server validation retains the 2000-character compatibility limit.
- File-first rename coordination registers compensating writes before mutations, preserves original note bytes/custom YAML, restores file metadata and SQL indices, and returns authoritative identity/path with retry safety. No asynchronous SQL transaction was added. This is compensated coordination, not crash-safe cross-storage atomicity or concurrent-writer isolation.
- Shared create/edit form keeps both drafts, protects IME/duplicate submit/pending dismissal, supports unchanged close, description-only save/clear and name-only editing of historical long descriptions. Lost/error responses reconcile by stable folder code; unavailable authority blocks saving, and an explicitly unsafe recovery stays blocked even after a successful list reload.
- Navigation follows renamed subtree suffixes while retaining the open note ID; this is a location synchronization rather than leaving dirty content. Both creation surfaces reuse the same form.
- Recent records remain account-keyed and bounded. Returned 403/404 documents are excluded; transient failures get retry state; 401 propagates as query error and cannot reveal a previous cached title through the public hook data.
- Existing returned conversations retain a current item outside the first 12 without inventing data. Cached list refresh failure retains actual existing entries.
- Runtime config remains the local/cloud authority. Unknown config hides signout; session failure preserves settings. Guarded signout does not call the API on cancellation or failed save, and its single-flight state survives account-row remounts between rail and Drawer. Controlled theme portals close before parent/theme transition.

## Verification actually run by reviewer

- `pnpm exec oxlint --deny-warnings` over the 19 task source/test files: pass.
- `pnpm exec oxfmt --check` over the same 19 files: pass.
- `pnpm --filter @mimir/renderer typecheck`: pass.
- `pnpm --filter @mimir/shared typecheck`: pass.
- `pnpm --filter @mimir/server typecheck`: pass.
- `pnpm --filter @mimir/renderer exec vitest run src/components/KnowledgeBaseCreateModal.test.tsx src/components/nav/FolderSection.test.tsx src/components/nav/RecentNotes.test.tsx src/components/nav/menu-items.test.ts src/lib/recent-documents.test.ts src/components/NavSidebar.test.tsx`: 6 files / 52 tests pass.
- `git diff --check`: pass at review time.

Backend integration evidence was read from `backend-evidence.md`: 4 files / 66 tests on SQLite and the same on dedicated PostgreSQL. Those server suites were not repeated concurrently by this reviewer. Browser evidence and full `pnpm check` are coordinated by the main session and must be reported from their actual results.
