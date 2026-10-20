# Dynamic CDP port independent review

2026-10-20. Reviewed after `github_update_e2e` explicitly froze the change. Scope: `apps/desktop/scripts/update-smoke-lib.mjs`, `update-smoke.mjs`, `update-smoke.test.mjs`, author diagnosis and original Windows attempt3 evidence. Review-only: this report is the only file written; no implementation, old artifact, product, workflow or PowerShell edits, commit or remote operation.

## Findings (fixed)

None required in this review. The frozen implementation and focused checks pass independent review.

## Findings (not fixed)

No blocking implementation issue found. Actual official 0.1.7→0.1.8 Windows/Linux validation is still required. The normal gap between releasing the probe and Chromium binding its port remains possible; it is correctly documented, and a real startup/CDP error still fails acceptance. This local review does not guarantee a future runner bind or assert full upgrade/data preservation.

## Original evidence independently checked

Run 39426680220 / d67c331, official Windows 0.1.5→0.1.6, retained in `update-015-to-016-windows-attempt3/`:

- `result.json` remains `success=false`, `wizardExitCode=0`. Its first three checks cover verified official download/no automatic details, ordinary exit without installation, and real pending-save guard/cancel. The fourth records new PIDs disjoint from old PIDs before the later explicit upgraded launch. Both recorded baseline process exits are code 0 without signal.
- NSIS evidence contains real visible/enabled ID1 Next and Finish controls on the official updater cache installer, wizard log records the two actual actions, and the completion result is 0. This review read the native records/log; the author separately recorded PNG visual inspection.
- `upgraded.log:3-4` explicitly reports Windows bind error **0x2740**, followed by `Cannot start http server for devtools`. The result stack then times out in `connect` during `launch('upgraded')`. The prior source reused fixed port 19223 on every explicit launch.
- The artifact does not identify the conflicting socket owner. No claim is made that a specific remaining process or TIME_WAIT caused it. Product HTTP/renderer startup can still occur while CDP fails; those logs do not substitute for missing full document/tag/folder/mode verification.

## Frozen implementation and integration

- `createDebugEndpointAllocator` creates a fresh TCP listener on **127.0.0.1:0**, with exclusive listen requested. It checks the returned address is loopback and port is an integer in 1..65535. `finally` awaits the probe close before the allocated endpoint is returned to the caller.
- A set belongs to the allocator used for the whole harness run. Any port already used by an earlier explicit launch is rejected, its probe closed, and another allocation requested. Twenty duplicate candidates fail clearly; bind, address-validation and close errors propagate. The bound applies to duplicate allocation attempts, not a claim of a separately timed OS operation.
- `launch` obtains a new endpoint before each actual spawn and passes exactly its port with the existing loopback debug address flag. All calls are sequential: baseline-first, baseline-second and upgraded. `targets`/`connect` use the currently assigned endpoint. No fixed 19223 remains in these scripts.
- Name, PID, port, endpoint and timestamp are persisted immediately to `launches.json` and retained in the final result, so later CDP failure does not erase which endpoint was used. A later allocation does not silently reconnect to an earlier launch's endpoint.
- The automatic updater relaunch check still precedes `normalClose`, `noProcesses` and explicit `launch('upgraded')`. The explicit later process cannot satisfy the earlier automatic-relaunch requirement. NSIS target installation still originates only from the application's explicit updater flow.
- Official asset digest/cache identity, real save interception, old-process exit, installed-byte replacement, target version, complete body/title/tags/folder, local mode and final rendering/normal-close assertions are unchanged. No new launch retry, direct target-installer bypass, fake save acknowledgment or relaxed acceptance was introduced.
- The current desktop release/update spec addition agrees with the actual ordering and its port handoff limitation. No product/shared/preload or build template changes are needed for this external-only harness fix.

## Independent verification

Node **22.23.1**:

- `node --test apps/desktop/scripts/update-smoke.test.mjs apps/desktop/scripts/manual-update-smoke.test.mjs`: **26/26 pass**, 0 skipped, 0 failed. Output retained locally at `/tmp/mimir-dynamic-cdp-independent-tests.log`.
- New tests perform real loopback allocation and rebind after probe release, verify four nonrepeated endpoints, and cover injected duplicate-port retries/20-attempt failure, cleanup of every successfully bound probe, original bind/close errors, non-loopback and invalid addresses. Existing harness tests continue to pass.
- `pnpm exec oxlint` for the three changed scripts: pass.
- `pnpm exec oxfmt --check` for the same three scripts: pass.
- `node --check` for each changed script: pass.
- Scoped `git diff --check`: pass.
- TypeCheck: not applicable to these plain `.mjs` scripts; no TypeScript gate is claimed. Full repository gate and real platform execution were not repeated in this narrow review.

Reviewed source SHA256: update-smoke-lib.mjs `743a423e4c9ad16cac1c737b9315a9db4c0349369a773652b0f02651380e1ab7`; update-smoke.mjs `648d5ecc67571b49f3bed96850f93d48962b8ec45c2b51d52319e74d8edba445`; update-smoke.test.mjs `3ce0ef1413879ec6755d0ddc76c232a173930385af4d788c23b2d99780abf016`.
