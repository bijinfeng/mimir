# DOCX final gate regression repair — 2026-10-17

## Scope and authorization

Root assigned the three DOCX failures from `/tmp/mimir-all-tools-final-pnpm-check-20261017.log` (Office 229 files, 2703 tests: 5 failures, 2698 passed). Only the two assigned tests were initially writable. After a stable production lifecycle failure was reported, root explicitly released the minimum `DocxEditor.tsx` export busy/lock ownership repair. Other concurrent owners handle the XLSX selector regressions and PPTX focus. No changes to server, encryption security, IO guards, vendor, dependencies, staging, commits, archives or fixture deletion.

## Reproduction and root cause

Scoped original run: `/tmp/mimir-docx-gate-repro-20261017.log`: **2 failures, 9 passed**. Both export failures reproduced independently of full-suite load. Password test passed in this run, so its prior full-gate failure is recorded as a timing-dependent failure rather than falsely described as a stable production defect.

1. Late export after manual editing: new encrypted-session safety wrapper rejects the pending save first with `文档或保护状态已变化，请重新保存或导出`. Diagnostic DOM showed the exact status `导出失败：文档或保护状态已变化，请重新保存或导出`, version 1, changed PM text, no download. The old test required an older outer-layer notice. Updated the exact expected current safety notice, retaining no download/no library write/fresh retry/native XML assertions. No rejection guard was weakened.
2. Export while switching documents: actual lifecycle defect. `exportRequest.current` and `exportJob !== null` treated an old document's pending generation as globally busy. A newly loaded clean document with a fresh handle could not export until the old promise resolved. Production lock checks now compare the current handle; busy presentation checks the current session and document ID. The save lock similarly recognizes only an export owned by its active handle. Existing binding, handle, version, protection, candidate and draft checks are unchanged. Old finally blocks retain identity comparisons so an old completion cannot clear a successor's lock/busy state. Existing deferred test still proves old completion downloads nothing while successor remains busy, then exactly one successor download; added current document/version and final enabled/version assertions.
3. Native password creation: fixed UI polling window (1200 × 3 ms) could expire before the real worker completes 100,000 SHA-512 digests under workspace load. The test now observes and awaits the real `RealDocxPasswordWorker.emit` response before checking UI completion. It does not replace hashing, lower the spin count, extend any timeout, or bypass worker transport. Error events reject the wait. Existing cleared draft/no plaintext/native save/reopen/verify checks remain. Added a live-worker assertion before the subsequent source switch and retained full termination, clean PM, zero undo and exactly one library save assertions. Production password/security modules are unchanged.

## Files

- `packages/office/src/editors/DocxEditor.tsx`: current-owner export lock/busy scope only.
- `packages/office/src/editors/DocxEditor.export.test.tsx`: current precise safety notice and successor state assertions.
- `packages/office/src/editors/DocxEditor.protection-settings.test.tsx`: actual worker response wait and pending-worker assertion.

## Verification

- Scoped two-file runner: **11/11 passed**, exit 0; `/tmp/mimir-docx-export-password-fixed-20261017.log` (4.92 s).
- Office `tsc --noEmit`: exit 0; `/tmp/mimir-docx-export-password-types-20261017.log`.
- Scoped three-file oxlint: exit 0; `/tmp/mimir-docx-export-password-lint-20261017.log`.
- Scoped three-file oxfmt check after formatting: exit 0; `/tmp/mimir-docx-export-password-format-20261017.log`.
- `git diff --check`: exit 0.
- Exact three-file snapshot: `/tmp/mimir-docx-export-password-freeze-20261017.sha256`.

A diagnostic runner was accidentally first invoked from repository root and then replaced by the correctly scoped package runner; it is not used as evidence. No browser was operated by this owner. Root still owns independent check and final unchanged `pnpm check`; the failed full gate is not reclassified as passed by these scoped results.
