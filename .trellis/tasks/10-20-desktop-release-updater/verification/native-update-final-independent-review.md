# Official native update — final independent review

Reviewed 2026-10-20 by the separate `quality_check` reviewer. Source, workflow and specification revision: **`442cd13a4b75fdc207cf9f7c7e8025e490ddd0da`**. Official product versions remain **0.1.7 → 0.1.8**, with no replacement of published tags or assets. Subsequent evidence/task/journal commits do not change that verified source revision. Another session's uncommitted interaction-polish changes are outside this review and this CI result.

## Findings (fixed)

None. This reviewer made no implementation changes, commits, pushes or remote writes. The earlier harness source review and independent local 30/30 regression validation are recorded in `native-close-readiness-independent-review.md`.

## Findings (not fixed)

No blocking finding. **The real Windows NSIS and Linux AppImage cross-version upgrade/data-retention acceptance is approved.** Combined with the existing save/close/host failure, timeout, late-response and duplicate-request regression coverage, this supplies the previously missing real-upgrade evidence for AC6.

This does not establish operating-system notification delivery or automatic focus behavior: the CDP screenshot helper explicitly foregrounds its target. macOS remains a manual update path without formal signing credentials. fnOS package build/distribution evidence does not establish installation or upgrade on an actual fnOS device. These boundaries remain open where separately required; they do not become automatic-update successes through this review.

## Evidence provenance

- Complete CI: [39441401694](https://github.com/bijinfeng/mimir/actions/runs/39441401694), `push` on master, exact head `442cd13a4b75fdc207cf9f7c7e8025e490ddd0da`, completed **success**. Final API result is `github-native-close-ci.json`; complete job log is `github-native-close-ci.log`, with only ANSI sequences and trailing whitespace removed.
- Real-update second attempt: [39441421036](https://github.com/bijinfeng/mimir/actions/runs/39441421036), exact same head, completed **success**. Linux job `118691964620` and Windows job `118691964219` both succeeded. Frozen original artifacts, run/artifact API responses, job logs, file manifest and author's summary are under `update-017-to-018-attempt2/`.
- I independently recomputed both original ZIP hashes against `github-artifacts.json`, then compared every extracted file byte-for-byte to its ZIP entry: Linux **19/19** and Windows **44/44**. The source assertions, raw result/native-close records, application logs, HTML and PNG evidence were reviewed directly rather than relying only on the author's summary.

The archived CI log retains all **36,235 lines** (4,178,107 bytes), SHA-256 `29283e12120c740a8b451cbf8d97f50b159290e204ac6f4b6cbfa1f1a097be44`. Normalization removed actual and caret-rendered ANSI sequences plus trailing whitespace; no lines or assertions were filtered. The final API step times are: check 14:41:40–14:58:45 UTC, build 14:58:45–14:59:12, PostgreSQL tests 14:59:12–15:04:53, S3 15:04:53–15:04:58; all four conclusions are success.

| Platform | GitHub artifact ID | Verified original ZIP SHA-256 |
| --- | --- | --- |
| Linux | 12274151927 | `4a495c13cab38ed8a8f9294fd4669ebf415d1c3eaa20f32d77935bd7c9a072fb` |
| Windows | 12275257693 | `173749344b20fc324b856e5086525d5f1865e64bd1fd6fa9ab99998de7632661` |

## Actual paths and assertions

Both result files have five completed acceptance checks and `success=true`. Both downloaded through the real fixed official updater source; ordinary UI quit left the baseline installed bytes unchanged. A real editor edit produced a held HTTP PATCH, the actual save guard appeared, and Continue Editing cancelled installation without changing installed bytes. A second real edit then exercised Save and Restart while its actual save request remained held; the pre-save installed-byte assertion passed. Application logs contain both successful PATCH responses before explicit `quitAndInstall` execution.

The frozen source continues to require the actual updater's target-file replacement and automatic new PID detection before any explicit `upgraded` launch. Linux requires the exact official target AppImage SHA-256, not merely a changed filename/hash. Windows validates the real cached target installer digest and drives the updater-created NSIS process. The harness does not directly start a target installer or launch an application to fabricate the automatic-relaunch assertion.

| Native event (UTC) | Linux | Windows |
| --- | --- | --- |
| Automatic new PID set accepted | 14:42:46.617 — 4533/4537/4538/4540 | 14:49:49.496 — 3476/8892/9184 |
| Ready owned close target | PID 4533, XID `0x00400003` | PID 9184, HWND `590288` |
| One normal-close request | 14:42:48.854 | 14:49:51.842 |
| Accepted response recorded | 14:42:48.902, `wmctrl -i -c`, exit 0 | 14:49:53.364, `CloseMainWindow`, true |
| Strict all-process exit gate passed | 14:42:49.011 | 14:49:54.024 |
| Later explicit upgraded launch | 14:42:49.115, PID 4639 | 14:49:54.039, PID 9192 |
| Target/version/data check completed | 14:43:00.770 | 14:50:00.357 |

Linux records **eight initial empty enumerations**, then a real mapped/closable window, its matching `_NET_WM_PID=4533`, and `WM_DELETE_WINDOW`. The one close request followed that observation. Windows records a mapped/closable HWND in the confirmed automatic PID set; the driver rechecks exact HWND ownership and readiness before the ordinary close. Both have one request, one accepted response and a later `exited` event. Both cleanup logs contain only empty enumeration/no-target, with no cleanup close request. Existing no-kill and no-repeat-close behavior and strict exit gates remain intact.

Windows NSIS snapshots and logs show the real official cached 0.1.8 installer path, a visible enabled Next button, then the actual completion page with Run mimir checked and visible enabled Finish. The log records two native actions and `PASS official NSIS Finish clicked and window closed`; `wizardExitCode=0`. Snapshot 011 shows the original wizard window gone before automatic new PIDs are accepted.

All three explicit launches on each platform use distinct CDP ports and exit **code 0, signal null**. Linux ports are 46859/40965/35479; Windows ports are 62971/62927/49897. Automatic PID sets are disjoint from the captured previous sets and precede the later explicit launches, so the latter are not counted as automatic relaunches.

The reopened application reports currentVersion **0.1.8** and automatic capability on both platforms. Frozen source checks exact complete body equality, exact title, tags, folder and `desktop-config.json` local mode before recording the fifth success. I independently checked the full retained body in both archived HTML files:

```text
真实待保存改动 retained through update. Saved by the actual restart guard. Official release upgrade preserves this local Markdown document. 中文资料保留。
```

I visually inspected all five product PNGs on each platform: download ready, save guard, blocked/retry state, save-and-restart awaiting HTTP and upgraded document. Dialogs and actions are rendered and readable; the waiting state visibly disables repeated submission; final document previews show the title and both real edits with the original body and Chinese content. Windows NSIS PNGs 001/010/011 also corroborate Next, real Finish completion, and window disappearance. These screenshots supplement the exact data assertions; they do not substitute for them or prove automatic system focus behavior.

## Historical failure remains separate

First attempt [39437731315](https://github.com/bijinfeng/mimir/actions/runs/39437731315) is preserved unchanged under `update-017-to-018-attempt1/`. Windows succeeded; Linux failed the post-relaunch all-process exit gate and never ran its final explicit-launch/data-retention checks. Its old empty-window branch could silently issue no close, and finally overwrote first-enumeration evidence. The second attempt's observed delayed readiness supports the need for the harness fix; it cannot recover the missing first-attempt enumeration, establish that a close was actually delivered there, prove a product veto, or uniquely identify that historical failure's cause.

## Verification

- Lint / formatting / type-check: **pass**, complete `pnpm check` at the exact CI head; focused independent MJS lint/format/syntax also passed previously.
- Tests: **pass**, complete CI quality gate, native harness behavior on both actual runner platforms, real Windows/Linux official 7→8 upgrades, PostgreSQL service tests and S3 compatibility smoke.
- Build: **pass**, complete `pnpm build` at the exact CI head.
- Evidence checks: **pass**, original ZIP/API digests, all 63 ZIP entries, result checks, exact full-body HTML, single native-close/exit ordering, distinct ports, normal launcher exits and the listed real PNGs.

No uncommitted shared-workspace full gate was run over the other session's WIP. The committed-source CI is the full quality-gate evidence. Only task verification artifacts were written by this reviewer.
