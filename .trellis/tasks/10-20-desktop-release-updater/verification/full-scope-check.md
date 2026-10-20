# Final scope quality review

2026-10-20. Reviewed task scope through Windows resource/build correction `b563569`, PostgreSQL isolation `8dc85b1`, and the frozen clean-route correction. Subsequent implementation or remote acceptance requires its own evidence; this record does not declare the task complete.

## Affected packages and spec quality requirements

Loaded `get_context.py --mode packages`, the active task artifacts and affected spec index Quality Check sections:

| Scope | Spec entry and required checks |
| --- | --- |
| Desktop runtime, preload, update UI, packaging | `desktop/runtime/index.md`: project `pnpm check`, actual UI and packaged runtime evidence; `releases-updates.md` defines trust, save/close/install ordering and native release gates. |
| Server build, worker and integration setup | `server/backend/index.md`: project gate plus actual parsing behavior; `conventions.md` and `tests.md` define unchanged output paths, resource limits and PG/SQLite isolation. |
| Renderer save bridge, build preset, route generation | `renderer/frontend/index.md`: project gate and actual interface behavior; shared dirty-state source and platform route isolation retained. |
| Shared IPC types | `shared/contract/index.md`: project gate and consistent caller/receiver contract; no install action added to the remote workspace API. |
| Office test CSS preparation | `office/engine/index.md` and `office/frontend/index.md`: project gate, real content/save behavior and actual interface evidence when affected. Production editing code is unchanged by this task's test preparation. |
| Web consumer build, including fnOS prefix | `web/frontend/index.md`: project gate and real build/interface evidence; the consumer keeps its own route tree and shared build preset. |
| Root workflows/scripts and fnOS native package | `project/quality.md`, `project/rules.md`, `architecture.md` §8.6.1 and desktop release contract: native tool/package verification and five-target byte/identity checks before publication. |

## Findings (fixed)

- This checker added the Windows installed-smoke 15-minute step timeout; detailed findings and bounds are in `windows-resource-check.md`.
- Earlier full-scope review fixes remain documented in `quality-check.md`: updater error recovery, genuine unpublished detection, notification failure isolation and close-veto feedback. Their code paths and contracts remain present in the current source.

## Findings (not fixed)

- Windows uninstaller parent wait does not prove forked temporary-copy completion; this cleanup evidence limitation remains explicitly recorded in `windows-resource-check.md`. It does not replace installed resource verification or full smoke.
- Actual five-target successful GitHub build/aggregate, public immutable releases and anonymous official dual-version update acceptance remain outstanding at this checkpoint. A failed/skipped/pending external gate is not passed.
- macOS ad-hoc packages retain manual capability. Signing/notarization, native system-notification delivery/focus and fnOS device installation/upgrade require their own actual evidence.
- The latest GitHub CI result, including any separately investigated Office test issue, must be recorded by the main session. Previously successful full gates are historical evidence rather than a claim that all later snapshots passed.

No additional code defect was found in the frozen PostgreSQL isolation or clean-route corrections. The main session owns the final spec sync and acceptance ledger.

## Cross-layer and release flow review

- Main-process update controller remains the state source. The fixed public GitHub provider disables prereleases/downgrades and ordinary-quit installation. Automatic download completion only emits a silent notification; opening/focusing details requires explicit action.
- Dedicated updater action IPC still checks the exact window, main frame and file URL. Cloud workspaces receive no preload. Local workspace API exposes state/open and nonce save response, not installation commands.
- Explicit restart still waits for the real shared save guard, actual window close/beforeunload and host shutdown before `quitAndInstall`. Error/timeout blocks installation; ordinary shutdown does not imply installation.
- Packaging keeps native runner assertions, portable finite resource finalization and genuine ASAR reads. Narrow S3 externalization retains source output layout; the implementation's relocated Node22 host/S3 probe provides runtime evidence beyond source inspection.
- Five-target identity/version/size/SHA checks remain prerequisites for the single draft publisher. fnOS has manual FPK artifacts only, with no Electron update metadata. Published assets are not overwritten.
- Clean-route generation prepares the shared base type tree without desktop extras before each consumer tree; PostgreSQL setup and test workers now use the same project's trusted Vitest `config.env`.

## Verification

- Prior comprehensive full-repository Node22.23.1 gate, `PNPM_CONFIG_WORKSPACE_CONCURRENCY=1 pnpm check`, passed with exit0 in `github-local-node22-pnpm-check.log`; `github-flow-check.md` records the exact historical scope. Existing earlier UI/native runtime reports remain separate evidence.
- Fresh global `pnpm lint`, `pnpm lint:styles`, `pnpm format:check` passed during this review before the final route edit; existing repository warnings were not suppressed. The frozen route additions then passed focused lint/format.
- Fresh Node22 root Node test list, including all current entries and new route regression: **53/53 pass**, `final-root-node22-check.log`. This covers release identities/bytes and failure behavior, portable resources, installed inventory, route generation, lifecycle, update-driver helpers and actual ASAR fixtures.
- Fresh Node22 fnOS integration with deliberately unreachable inherited PostgreSQL URL: **5/5 pass**, `fnos-pg-independent-check.log`; production SQLite restriction unchanged. Real ordinary/local PostgreSQL and sentinel evidence reviewed in `fnos-postgres-isolation.md` without recreating the author's database.
- Fresh Node22 server, renderer, web and desktop typechecks: pass. Renderer/web/desktop typechecks include actual route generation. Latest changed route and test files: lint/format pass.
- All four workflows passed actionlint; `git diff --check` passed.
- Reviewed independent prior native/fnOS, CSS, ASAR, worker and update harness reports rather than repeating already successful heavy suites without a changed failure boundary. The new root/route/PG boundaries received fresh checks above.
- This focused final pass did not rerun the whole monorepo test suite, install on Windows, build a real FPK on macOS or execute official cross-version updates. None is represented as newly passed here.

## Subsequent Office regression checkpoint

After the scope checkpoint above, the implementation agent froze a DOCX ink fix for an independently reproduced metadata-only transaction interrupting a live stroke. This adds production Office editing code to the scope; the earlier table's statement about test-only Office preparation applies to its earlier snapshot. The editor-level spec index and ink contract were loaded for this follow-up.

Independently reviewed frozen doc/anchor/canvas/origin validation, retained content/layout/tool/cancel guards and red-to-green evidence. Strengthened the actual external content-write test to assert immediate preview cancellation before pointerup. Node22 two complete ink suites **31/31**, Office typecheck and two-file lint/format passed; details in `docx-ink-display-transactions.md`. No additional production-code finding. This targeted proof does not declare the original CI failure's exact transaction known or substitute for the next full CI run. Main-session native Actions acceptance progressed separately and is recorded in its live ledger.

## Latest full Node22 gate after Office correction

The main session requested one new full gate after the Office production correction. Independently ran **Node22.23.1 / pnpm12.4.2 / `PNPM_CONFIG_WORKSPACE_CONCURRENCY=1 pnpm check`**. It completed with **`FINAL_EXIT_CODE=0`**; `final-latest-node22-pnpm-check.log` contains the actual command, runtime/tool versions, resolved concurrency `1`, complete output and final subprocess exit code. The log is closed and safe to archive.

Lint, style guard, format, every workspace typecheck and the entire current test chain passed. Counts include Office **235 files / 2777 tests**, renderer **85 / 636**, server **122 / 1366** plus local10, fnOS5 and SQLite backup2, desktop **12 / 110**, and root Node53. Existing storage integration tests requiring explicit S3 credentials retain their prior two skips; no skip, exclusion, assertion, timeout or memory budget was weakened. The previously quiet server stage completed normally; no test process was killed or replaced.

This checkpoint supersedes the earlier “not rerun whole monorepo” limitation for local quality checks. It does not substitute for the new GitHub CI's PostgreSQL/S3 jobs, official release assets, actual cross-version upgrades, macOS signing or fnOS device acceptance.
