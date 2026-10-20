# Native close readiness diagnosis

## Original official 0.1.7 → 0.1.8 run

Run [39437731315](https://github.com/bijinfeng/mimir/actions/runs/39437731315) used harness commit `e3a950fdd5a42bf02e83ab1fb40a6832c35f38c9`. Original artifacts remain unchanged under `update-017-to-018-attempt1/`.

- Windows job `118679111438` succeeded. Its five checks include official target bytes, ordinary quit without installation, a real pending HTTP save and Continue Editing cancellation, automatic new PIDs before the explicit upgraded launch, and exact target version/local mode/full Markdown/title/tags/folder retention. Three explicit launches exited with code 0 and no signal; the real NSIS wizard completed with exit 0. The saved upgraded-document screenshot shows the retained content.
- Linux job `118679111674` failed after its first four checks. The installed AppImage SHA-256 matched the official target before automatic new processes were accepted at `2026-10-20T14:18:43.422Z`: previous `[3599,3603,3604,3607,3633,3636,3676,3704]`, new `[3733,3737,3738,3740]`. Both explicit baseline launcher processes exited with code 0 and no signal. At approximately `14:20:14Z`, the subsequent all-process exit check timed out. No explicit upgraded launch, target-version UI check, or complete data-retention assertion ran on Linux.

The old close routine enumerated windows once immediately after detecting new PIDs. An empty enumeration resolved successfully without sending any close request. Its finally cleanup repeated enumeration and overwrote `native-windows.txt`; therefore the retained final window (`0x00400003`, PID 3733) does not prove a target existed during the first enumeration or that the first close request was delivered. The Actions cleanup orphan PID 3719 was an AppImage wrapper, not Electron main PID 3733. These artifacts cannot establish a product close veto or uniquely establish the exact Linux failure cause. Startup readiness is a plausible explanation and the silent no-target path is a confirmed harness defect.

## Minimal external-driver correction

Only the external smoke harness changes; official v0.1.7/v0.1.8 tags and assets remain unchanged.

- Poll for up to 30 seconds for an observed window belonging to the confirmed automatically relaunched PID set. Each enumeration is timestamped. Linux requires actual `xwininfo` mapped state and matching `_NET_WM_PID`/`WM_DELETE_WINDOW` properties; Windows requires a visible, enabled main HWND owned by the expected Mimir process.
- Record the exact PID/window before one ordinary close request and its actual response. Recheck native ownership/readiness immediately before dispatch. A missing target, rejected request, command error, or process-exit timeout fails the required phase.
- Keep the existing 90-second all-Mimir-process exit gate and normal launcher-exit checks. Preserve official byte verification, automatic-PID-before-explicit-launch ordering, target-version checks, and exact full document/title/tags/folder/mode assertions.
- Keep requested PIDs across the post-install and finally phases. Cleanup skips any already-requested PID even if its HWND changes, so veto, rejection, or uncertain transport results cannot trigger another close request. There is no process kill or repeated close to make an assertion pass.
- Save `native-close-post-install.json` and `native-close-cleanup.json` separately, with enumerate/request/response/exit-wait/exited/failure events. Cleanup enumeration errors have independent `native-close-cleanup-error.json` evidence. Cleanup does not overwrite the original failure or first close log.

Linux runner prerequisites include `x11-utils` for the native property observations (workflow change owned by the integrating session).

## Local validation

- Causal RED: executed the unchanged HEAD `normalClose()` implementation in a VM with the real initial-empty-window branch. It resolved after one enumeration and zero requests; the assertion that a successful close must issue one observed request failed as expected. This reproduces the harness defect, not the unrecorded first enumeration of the historical run.
- GREEN: Node 22.23.1 ran `update-smoke.test.mjs` and `manual-update-smoke.test.mjs`: **30/30 passed**. Four new cases cover initially absent/unrelated/unmapped/unclosable windows becoming ready, required no-target failure and optional cleanup absence, rejection/request error/exit veto without a second request, and cleanup skipping the same PID with a changed window after veto.
- Focused oxlint: no warnings or errors; oxfmt check: passed. Node syntax checks passed for the three changed `.mjs` files. `git diff --check` passed.
- PowerShell 7.5.4 `-Action self-test` passed on macOS, including compilation of the native interop and the existing NSIS identity/button/Finish policy. This does not execute Win32 APIs or prove a native close on Windows.

## Remaining acceptance

An independent source review and a new official 7→8 run on both Windows and Linux are still required. Preserve the first run and save the new artifacts in a separate attempt directory. Actual native close logs, normal exits, target version, and exact data retention must pass before Linux is declared complete. CDP screenshots explicitly foreground their targets; they do not prove operating-system notification delivery or absence of focus stealing. macOS remains a manual update path without Developer ID credentials.
