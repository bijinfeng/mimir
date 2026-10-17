# W1 — ephemeral DOCX modification password verification

2026-10-17. Owner `/root/pdf_text_parameters`. Implementation frozen for independent check; root owns real browser, full Office/server/build gates. This is W1 only, not W2 protection settings or forced tracking/encryption completion.

## Changes

- `packages/office/src/docx-protection.ts`: strict native credential validation; per-node document/write credentials in a module-private WeakMap; frozen public summaries contain no hash/salt/password. Controller verifies its own native write credential with private request/token/epoch, grants only the modification gate, and dynamically restores supported comments/forms capability without body writes. Successful verification increments epoch; wrong/cancel/late results leave access unchanged. `endModificationSession()` aborts/relocks.
- `docx-protection-password-crypto.ts`, `docx-protection-password.worker.ts`, `docx-protection-password.ts`: real dedicated module Worker, UTF16LE SHA512 + little-endian iteration, constant-time byte comparison, native defaults/strict base64/hash/salt/spin budgets, password UTF16 length1024, deadline30s. All settle paths remove listeners and terminate. Main thread never executes repeated hashes.
- `editors/DocxProtectionControls.tsx` + `docx-protection.css`: existing compact320px Inspector, Antd standard password show/hide, local draft/error state, clear-on-input, Enter, Escape clear/cancel with parent close/focus; fixed single primary and cancel while busy. Verification does not emit PM transactions.
- Minimal `editors/DocxEditor.tsx`: fallback safe flags; lifecycle cleanup bound to session+documentId; Inspector bound to documentId so cached byte identity cannot expose a previous source's draft.
- New tests/helpers: production worker code runs in real Node workers (not a fake verifier), independent hardcoded hashlib vectors, native exact preservation and actual mounted Editor/Agent flows. Test-only type stripping uses Node built-in `stripTypeScriptTypes`, not unavailable TS7 compiler APIs.
- `.trellis/spec/office/engine/conventions.md`: unique W1 contract; existing C1/C2/forms contracts retained.
- `docx.ts`, server, shared, vendor and shell unchanged by W1. Existing private session.save guard and normal surgical patch path suffice.

## Verification

- `/tmp/docx-w1-final-tests1.log`: **8 files / 146 tests passed**. Includes worker19, native14, mounted Editor W1 five cases, existing protection/comments/anchors/forms tests.
- `/tmp/docx-w1-final-types.log`: Office `tsc --noEmit` passed.
- `/tmp/docx-w1-final-lint2.log`: scoped oxlint, zero errors/warnings (final lifecycle explicit valid-source guard).
- `/tmp/docx-w1-final-format.log`: oxfmt12 files passed; Editor subsequently formatted after its one-line guard refinement.
- `/tmp/docx-w1-antd-lint.json`: zero issues, no skipped/partial files.

Covered: spin0/1/1024 Chinese+emoji/100000 independent vectors; absent native spin defaults100000; malformed native mixed credentials refuse before worker; wrong password; maximum spin cancellation and30s timeout/error/protocol termination; duplicate/late verify and exact access; freeze/privacy; combined readOnly/trackedChanges/comments/forms retain restriction; final save public override denial; untouched unlock returns full original bytes; actual edited native file preserves settings/every non-target ZIP entry; real PM/raw+Agent denied until verification; zero dirty/history on verification; stale Agent version invalidated; actual manual+Agent edits save/reopen relocked; combined actual protected comments Agent reply/forms UI toggle save and remain body-locked; panel-close worker termination; Escape plaintext removal+trigger focus; A→B→A reverify.

## Browser handoff / limits

Local fixture `/tmp/mimir-docx-w1-password.docx` (kitchen-sink with writeProtection SHA512 spin0; test password `editor`). This is local only, not uploaded. Root can use existing native fixture/harness to verify desktop and420×500 sidebar scroll/fixed footer, show/hide, wrong/correct/cancel/Escape and source switch. A visible browser password entry may require human handoff under CUA credential policy; code/native verification is complete regardless.

No real model/provider/Desktop claims. W2 settings creation/removal, document-protection password verification, forced revisions, privacy/encryption remain explicitly separate approved follow-ups.

## Reference

Fixed GenOffice480548fd55f1be3593ee0d8e316a734751d58309 protection.ts supplies native algorithm. Same approved research plan records WeKnora official site/source v0.8.3 commit3e22822c1d2397be730c458c7539d0eb8c113a24 hashes/evidence: truthful capability gates apply, not Word password crypto/Office Ribbon design. No new network-success claim.
