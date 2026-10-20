# CI Node 22 failures: diagnosis and narrow fixes

2026-10-20. Failing workflow: `39380273533`, revision `a98a0a5`. Its downloaded log is `github-ci-a98a0a5-failed.log`. Scope is the remaining attachment PDF heap error and two 5-second server test timeouts. No test was skipped, no production memory/time budget was increased, and no root test command was changed.

## PDF failure is the development loader, not the compiled parser

Local shell Node was 25.9.0; CI uses Node 22. Re-running only the real attachment test with installed **Node 22.23.1** reproduced the same PDF worker OOM on an otherwise idle mac host. Therefore Linux or concurrent suites alone cannot explain it.

A portable diagnostic is retained at `ci-diagnostics/worker-heap-probe.mjs`. It creates a real PDF with text, starts a real worker with the existing **192MB old / 16MB young** limits and `execArgv: []`, loads the actual attachment worker and pure parser entry, and calls `inspectChatAttachment`. It reports V8 heap statistics at phase boundaries. No fixture result or parser is mocked. Commands from repository root:

```sh
/Users/admin/.nvm/versions/node/v22.23.1/bin/node .trellis/tasks/10-20-desktop-release-updater/verification/ci-diagnostics/worker-heap-probe.mjs
# Other diagnostic variants: --scoped, --compiled, --compiled --loader, --preload
```

| Node 22 diagnostic | Result | Heap after actual text extraction |
| --- | --- | --- |
| TS source + existing global tsx registration | OOM | Not reached |
| TS source + scoped tsx registration | OOM | Not reached |
| Compiled JS, no loader | Pass, exact `PDF attachment` | 33,666,000 bytes |
| Same compiled JS + only registering tsx | OOM | Not reached |
| TS source + native PDF ESM preload before tsx | Pass, exact `PDF attachment` | 36,152,800 bytes |

Exact stdout/stderr, command and exit code are archived under `verification/ci-diagnostics/` in `node22-source.log`, `node22-scoped.log`, `node22-compiled.log`, `node22-compiled-loader.log`, and `node22-preload.log` (copied from the original verification-root raw logs, with ANSI and trailing whitespace removed; ignored logs require explicit force-add). Passing Node 25 source was much more expensive than compiled too: about 134.6MB used heap after extraction.

Locked versions: **tsx 4.23.13**, **pdfjs-dist 6.4.299**. The vendor PDF ESM modules are 1,069,549 and 2,418,244 bytes. Inspection of installed tsx `register-SoqaU4rg.mjs` and `index-DCefr8NP.mjs` shows its ESM loader applies `transformDynamicImport` to JavaScript modules; this creates a MagicString source map with `hires: "boundary"`. The public registration options offer namespace, onImport and tsconfig; they do not offer a source-map disable switch. Scoped registration still transforms the dependency graph and reproduced OOM. Merely clearing inherited `execArgv` also did not fix it.

The minimal fix applies only when the actual worker entry is `.ts` **and** the existing filename classifier identifies a PDF. Before registering tsx inside the already isolated worker, it uses native ESM imports of the fixed, declared PDF.js modules. URLs come from `require.resolve` plus `pathToFileURL`, using the same locked dependency and canonical module URLs as the real parser. Direct resolution from both `apps/server/package.json` and `plugins/parser/package.json` returned the exact same `.pnpm/pdfjs-dist@6.4.299/.../pdf.mjs` path.

The later parser still loads `attachment-parser.ts` → `@mimir/plugin-parser/attachment` → `pdf.ts` → `pdf-extract.ts`, validates the actual bytes and calls PDF.js `getDocument` and text extraction. Node's ESM cache reuses the preloaded main module; PDF.js reuses the preloaded worker module's `globalThis.pdfjsWorker.WorkerMessageHandler` for its Node fake worker. Preloading does not synthesize text, bypass malformed/scan detection or avoid the actual parser. Its allocations remain inside the same limited, terminable attachment worker. Source mode still runs current TS, rather than selecting possibly stale dist files.

Production compiled `.js` does not take this branch, does not resolve/preload PDF.js early and does not register tsx. After a fresh Node 22 server build, the compiled probe again passed (33,718,528 bytes used heap; `node22-compiled-fresh.log`). Electron **44.7.0** reports actual Node **24.21.0**; its real binary with `ELECTRON_RUN_AS_NODE=1` also ran that fresh compiled worker successfully (18,300,668 bytes used heap; `electron44-compiled-worker.log`). This is a parser/runtime check, not packaged GUI/update acceptance.

## Two server timeouts

The failing tests were the real WebM upload/two-save preservation test and the existing 20,000-stored-cell XLSX budget test. The CI log shows Office and server suites overlapping on the same runner. Both complete unchanged in Node 22 when the two files are run by themselves: **113/113**, 8.07 seconds total. This supports investigating runner contention; it is not proof that every GitHub runner will meet the unchanged 5-second per-test budget.

CI now sets **`PNPM_CONFIG_WORKSPACE_CONCURRENCY: 1`** only on `pnpm check`, serializing recursive workspace scripts while retaining all tests and assertions. pnpm **12.4.2** reads this variable: `PNPM_CONFIG_WORKSPACE_CONCURRENCY=1 pnpm config get workspace-concurrency` prints `1`. The older `npm_config_workspace_concurrency` prefix prints `undefined` in this version and is not used. No global Vitest timeout, worker heap cap, test fixture or native/WASM operation was relaxed. GitHub rerun remains the required proof of the scheduler change.

## Validation after the fix

From `apps/server`:

```sh
/Users/admin/.nvm/versions/node/v22.23.1/bin/node node_modules/vitest/vitest.mjs run src/test/chat-attachments.test.ts src/test/pptx-manual-upload.test.ts src/test/xlsx-range-disjoint.test.ts
```

**143/143 tests, 3/3 files passed**, 23.29 seconds, `node22-ci-regression-fixed.log`. This includes the complete real attachment HTTP/lifecycle suite, actual Office/PDF text, malformed and scanned PDF rejection, timeout/abort and recovery, infinite CPU worker termination, and a new real worker heap exhaustion test. That test fills retained arrays under the existing 192/16MB limits, verifies the OOM rejection and confirms `threadId === -1` after termination.

Also passed:

- `pnpm --filter @mimir/server typecheck`.
- `pnpm exec oxlint apps/server/src/services/chat-attachment-prepare.ts apps/server/src/test/chat-attachments.test.ts`.
- `pnpm exec oxfmt --check` on both TS files and `ci.yml`.
- `/tmp/mimir-actionlint/actionlint .github/workflows/ci.yml`.
- Fresh Node 22 `pnpm --filter @mimir/server build` (1.38 seconds; raw `node22-server-build.log`).

No commits or remote writes by this implementer. Parent coordinates independent review, integration, new GitHub CI and release/update verification. Full remote CI, PostgreSQL rerun and official cross-platform upgrade acceptance remain parent-owned and must not be inferred from these local checks.
