# Native close readiness — independent review

Reviewed 2026-10-20 by the separate `quality_check` reviewer. Scope is the frozen external acceptance harness, its regression tests, and the integrating workflow/spec changes. No product source, version, tag, published asset, or remote state was changed by this review. Unrelated desktop/renderer interaction-polish WIP is excluded.

## Findings (fixed)

None. No implementation edits were needed or made.

## Findings (not fixed)

No blocking source finding in the frozen change. Real Windows/Linux execution of this revised native-close path remains required; local test doubles and macOS PowerShell compilation cannot establish a native Windows or X11 close result.

The first official run, [39437731315](https://github.com/bijinfeng/mimir/actions/runs/39437731315), remains preserved under `update-017-to-018-attempt1/`:

- Windows `result.json` records all five acceptance checks, automatic new PIDs before the explicit `upgraded` launch, target version 0.1.8, exact data/mode retention, NSIS exit 0, and three explicit application exits with code 0/no signal. This is first-run evidence, separate from validation of the newly revised harness.
- Linux `result.json` remains `success=false`, with four checks and no explicit upgraded launch. The original source order requires exact official target AppImage bytes before accepting automatic new PIDs. The old baseline launchers exited with code 0/no signal, but the subsequent all-process exit gate timed out. Neither target-version UI nor complete data-retention checks ran.
- The old function's initial-empty enumeration can resolve with zero close requests, as reproduced in the author's preserved `native-close-readiness-local/old-head-red.log` against commit `22bb6476ad7a26a5a3b4d0db2d043af007e2dda6`. This proves a harness defect. The historical final `native-windows.txt` was overwritten by cleanup; it cannot establish initial readiness, first-request delivery, product veto, or a unique Linux failure cause.

A separate second-attempt artifact set must demonstrate mapped/closable ownership, one actual normal-close request and response, real process disappearance, target version, and full retained data before Linux acceptance is complete. Operating-system notification delivery/focus and fnOS device installation remain outside these checks. macOS remains manual without formal signing credentials.

## Source-path review

- `closeNativeWorkspace` requires the confirmed PID set and strict exit callback for the required phase. Its observation-only wait accepts a nonzero native window belonging to that PID set only when mapped and closable. An absent target fails rather than silently resolving. A request rejection, transport error, or exit timeout is logged and propagated; the request is outside the retry loop.
- Windows enumeration records visible/enabled main HWNDs and ownership. Immediately before `CloseMainWindow`, the PowerShell driver rechecks exact PID/process name/current main HWND/owner/visibility/enabled state. This is one ordinary request; its Boolean response does not replace the process-exit gate.
- Linux reads actual `xwininfo` mapping plus `_NET_WM_PID` and `WM_PROTOCOLS`, then repeats that observation immediately before one `wmctrl -i -c` dispatch. A command exit 0 is followed by the existing all-process exit gate; it cannot turn a product veto into success. `x11-utils` is included in the workflow prerequisite installation.
- `requestedClosePids` is updated before dispatch. Required failure and optional finally cleanup share it, so an already-requested PID is observed/skipped even if its window changes. Rejected/uncertain requests do not trigger a second close. Post-install and cleanup logs use separate filenames, preserving the first failure. The existing NSIS driver-process cleanup is unchanged; no new product process kill was added.
- Automatic relaunch PID detection still precedes the new readiness wait and the later explicit upgraded launch. The 90-second all-Mimir exit gate, explicit launcher exit checks, exact official target validation, target version, complete body/title/tags/folder/local mode, rendered content and final normal-exit assertions remain intact.
- Four new regression cases cover delayed readiness/unrelated PIDs, required no-target failure, rejected/throwing/vetoed close without another request, and changed-window cleanup skipping. The updated release/update spec captures this contract in its existing unique location.

## Verification

All commands below were independently rerun against the frozen files and exited 0. Node executable: `/Users/admin/.nvm/versions/node/v22.23.1/bin/node`; PowerShell executable: `/tmp/mimir-pwsh-parser/runtime/pwsh` (7.5.4 on macOS).

| Check | Result |
| --- | --- |
| `node --test apps/desktop/scripts/update-smoke.test.mjs apps/desktop/scripts/manual-update-smoke.test.mjs` | **30 passed, 0 failed, 0 skipped** |
| Scoped `pnpm exec oxlint` on the three changed MJS files | Pass, no diagnostic output |
| Scoped `pnpm exec oxfmt --check` on the same files | Pass, all 3 files correct |
| `node --check` on each changed MJS file | Pass |
| `GITHUB_ACTIONS=true pwsh -NoProfile -File apps/desktop/scripts/update-smoke-native.ps1 -Action self-test` | Pass: NSIS policy and interop compilation |
| `git diff HEAD --check` on the four scripts, workflow and release/update spec | Pass |

TypeCheck: no TypeScript changes in this frozen fix; MJS syntax and PowerShell compilation passed. Full workspace type-check/quality gate was not independently rerun over another session's active UI WIP. The integrating session owns full CI on the precise committed revision. The PowerShell self-test does not execute user32 close APIs on this macOS host.

Independent raw logs are at `/tmp/mimir-native-close-independent-{tests,lint,format,powershell}.log`; this review was authorized to persist only this report. The author's separate auditable rerun logs are retained under `native-close-readiness-local/`. Independent output included:

```text
# tests 30
# pass 30
# fail 0
# skipped 0
All matched files use the correct format.
PASS NSIS exact process path, dialog identity, button policy, Finish classification and interop compilation
```

Frozen source SHA-256:

```text
0799244d7e9ed435b14c46d547770a17e605b25a2b92720a0b1d441d7f0b3cac  update-smoke-lib.mjs
bfa0b6f1ca9d8da74a584fec6fc05f5bd7fd450d55504dc1e0b8aca6c6a8a7b1  update-smoke.mjs
a161ba85a5bce2645a71f690aedef7a310241c7950831f6bfaf24f92ecdad410  update-smoke.test.mjs
549b2e9998a5a9add66b4d8bdfb6078c674a75b4e57197832f162be3b7aad8cb  update-smoke-native.ps1
```

Independent raw-log SHA-256, in tests/lint/format/PowerShell order:

```text
18bcea29cc802cc24890901350fa6b482625d86552a9ccc52bdb71bb4fe208b0
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
0faed3f4d98cd37e706cbe06516d1a695b60ed9c474b0cdaff43116ecc0b868c
db770de13791985db1f94291e436a807a15f21fec62714ea7cea4277924e7766
```
