# DOCX quality-gate remediation

2026-10-17. Bounded implementation follow-up under the user-authorized full-repository quality cleanup. This report covers diagnosis and two test-only corrections; the main session/checker owns the full Office/repository gate.

## Diagnosis and changes

1. **EncryptionInfo namespace/lexical seven failures were stale relative to the current tree.** The logged failure predates another Office owner's implementation of XML 1.0 character/reference, reserved namespace and QName checks plus Map namespace scope. The latest parser passed all fifteen independent encryption/container/ZIP regressions in the initial diagnosis, including the original seven red rows. No encryption parser, crypto, fixture or assertion was changed by this agent. The parser was edited again concurrently during this investigation; its final recorded hash appears below, so repository verification must use the final tree.
2. **The 100000-spin lifecycle exceeded the generic twenty-second test budget.** Latest-source diagnosis reproduced only a Vitest timeout at 20006ms; it did not report a wrong-password/hash/native-save assertion failure. The case performs seven sequential real Worker KDF operations: two new credentials, wrong/correct modification verification, restriction verification during the preserve change, and modification/restriction verification during explicit clearing. Only this case now has a 120-second total test budget. Every production Worker still has its own unchanged thirty-second deadline. Random sixteen-byte independent salts, literal 100000 spin assertions, secret exclusion, wrong-password refusal, native reopening, preservation and explicit removal checks remain intact.
3. **The old trackedChanges read-only case conflicted with the newly implemented forced-tracking contract.** Latest-source reproduction failed at `editor.isEditable === false`, because password-free mandatory tracking now deliberately permits bounded text revisions. Retained the same four-row PM/DOM/Agent/save/history/dirty bypass suite, including its trackedChanges row. That row now explicitly includes a genuine unverified native modification-password credential, which must keep the editor locked even when forced tracking is enabled; its Inspector assertion now requires “已设置，等待验证”. The independent password-free forced-tracking real-Editor positive case remains unchanged and was executed in the same gate: actual text becomes a revision, stop/accept/reject are disabled, revision navigation works, native save/reopen keeps mandatory tracking, and source switching invalidates the old handle. This preserves both permitted-edit and forbidden-bypass evidence instead of forcing production behavior back to an obsolete read-only assumption.

## Ownership and parallel work

Read role hook, active PRD/design/implementation artifacts and applicable Office engine/project rules before writing. Initial target hashes were recorded, then rechecked immediately before the exact two-file edit; neither target changed between reads. `DocxEditor.protection.test.tsx` already contained substantial unrelated protected-comments/forms additions, all preserved. No vendor, runtime production, server, UI, fixture, dependency or unrelated DOCX capability changes. No stage, commit, archive, or full Office-suite run by this agent.

Changed files:

- `packages/office/src/docx-protection-settings.test.ts`: two budget comments and a per-case timeout only.
- `packages/office/src/editors/DocxEditor.protection.test.tsx`: existing native credential helper import, conditional unverified password fixture for mandatory mode, updated corresponding Inspector state text only.
- This report.

## Verification

- Before edits: encryption-check and protection-settings two-file diagnosis: **39 passed / 1 timed out**, including **15/15 encryption regressions passed**. `/tmp/mimir-yuque-docx-diagnosis.log`.
- Before edits: real Editor protection suite: **15 passed / 1 failed** at obsolete trackedChanges `isEditable` assertion. `/tmp/mimir-yuque-docx-editor-diagnosis.log`.
- After edits: `pnpm --filter @mimir/office test src/docx-encryption-check.test.ts src/docx-protection-settings.test.ts src/editors/DocxEditor.protection.test.tsx src/editors/DocxEditor.protection-settings.test.tsx`: **4 files / 60 tests passed**, exit0, **9.78s** on this run. `/tmp/mimir-yuque-docx-gate-targeted.log`. The timeout is an upper bound; no fixed sleeps or accelerated/fake KDF were introduced.
- `pnpm exec oxlint` on the two changed test files: exit0.
- `pnpm exec oxfmt --check` on the two changed test files: passed.
- `git diff --check -- packages/office/src/editors/DocxEditor.protection.test.tsx`: passed. The settings test is pre-existing untracked parallel work, so formatting was checked directly as well.

Recorded hashes after the passing targeted run:

- `packages/office/src/docx-protection-settings.test.ts`: `6a4f35ca88bd7b9fb17e8c2e3e1e1821eb513a1b3a8a1561cde30787678a2dc9`
- `packages/office/src/editors/DocxEditor.protection.test.tsx`: `428c79c41d3e3f68686b7dc7edd0afb92a04ac31a6ec3917ca47c66b44b6f6ed`
- `packages/office/src/docx-encryption-info.ts`: `a1bad5e3ea2ddb4a44fc7d82ada51f250c10ef87df679a4bacca9d2fe2ba06d5`
- `packages/office/src/docx-encryption-check.test.ts`: `1e88adb1acc52e0fceb27fb6f7b7a3db923487d7ba993bbaf78c375c59bf32ed`
- `packages/office/src/editors/DocxEditor.protection-settings.test.tsx`: `5dba858ef6f94a8955033ca8a69683c23d25fc17f30ccdf4694c63ad4c6c28cf`

## Remaining verification

The full Office/repository gate still requires the coordinating check agent. Targeted success is not a claim of full `pnpm check` success. Other Office owners were actively changing production code during this run; final-source consolidated checks take precedence over earlier logs. No additional production defect was reproduced in this bounded assignment.
