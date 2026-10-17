# DOCX T forced tracking — implementation handoff

2026-10-17, `docx_forced_tracking` implementer. Frozen for independent check. This report covers bounded T support plus root-approved W2 corrections; it does not close the all-tools task or assert GenOffice parity.

## Reference and scope

- Main reference: fixed GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`, protection settings and mandatory revision behavior in the approved `docx-protection-password-next-plan-20261017.md`.
- WeKnora: reused cached same-day official site/public-source evidence, v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`. Site SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`; definitions SHA256 `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`. Applies to capability gates and truthful errors; not Word hashing, native revision algorithms, or Ribbon layout. No new network-success claim.
- Read W2 implementation/check reports before work. No vendor/server/encryption/privacy mutation. No staging, commit, archive, upload or deletion.

## Changed files and behavior

New files:

- `packages/office/src/docx-forced-tracking.ts`: native simple-paragraph eligibility; private new revision identities; exact original projection validation; accepted-history/round-restore policy; native output readback equality; non-document ZIP entry preservation.
- `packages/office/src/editors/docx-forced-tracking.ts`: real PM filter/recorder; forced storage state; paragraph-local inline edits; synchronous revision append; safe known Undo/Redo/round restoration; same-content refusal and consecutive Backspace caret handling.
- `packages/office/src/docx-forced-tracking-fixture.test-helper.ts`: native original revisions/opaque paragraph fixture.
- `packages/office/src/docx-forced-tracking.test.ts`: 15 dedicated policy/manual/Agent/native-save regressions.

Existing files changed (some already contained earlier task work; preserve those changes):

- `src/docx-protection.ts`: mandatory access and private per-settings-token tracking policy; final save guards; native target/id inputs.
- `src/docx.ts`: eligible original paragraphs and reserved native IDs; final original projection + actual native readback verification; only replace document.xml before authorized W2 settings; private original no-op; protection epoch after awaits.
- `src/agent/docx-agent.ts`: mandatory mode context/restriction; genuine plugin required; only inline insert/selection/single-block replacement and findReplace accepted; verified real changes; no drafts/auxiliary/format/structure/accept/reject bypass; safe round restore.
- `src/editors/docx-protection.ts`: install mandatory recorder before general guard; object NodeView/drag/resize entry remains blocked under mandatory mode.
- `src/editors/DocxEditor.tsx`: mandatory status line and existing revision panel restriction reason; stop recording and accept/reject disabled, navigation remains usable.
- `src/editors/DocxProtectionControls.tsx`: clear mandatory status and bounded operation guidance.
- `src/editors/DocxProtectionSettingsControls.tsx`: root-approved visible setting group/field labels through existing one-column ToolbarPropertyForm; success copy “保护设置已应用。”; truthful bounded tracking note. Existing 320px Inspector/body scroll/fixed footer layout reused, no new CSS.
- `src/docx-protection-settings.ts`: root-approved surgical W2 fix: untouched absent/0/false/off recommended flag and dormant writeProtection are not normalized; actual recommendation/password intent still patched.
- `src/docx-protection-settings.test.ts`: original namespace/quote/spacing/recommendation/credential preservation regressions and current tracked-mode expectation.
- `src/docx-protection.test.ts`, `src/docx-protection-password-native.test.ts`, `src/editors/DocxEditor.protection.test.tsx`: old readonly trackedChanges expectations replaced with bounded mandatory expectations while keeping mutation refusals.
- `src/editors/DocxEditor.protection-settings.test.tsx`: actual Editor text edit/native save/revision controls/navigation/source switch/new-versus-stale handle test, visible W2 group/field regression.

## Native preservation and explicit limits

Only original top-level `<w:p>` with modeled simple text/basic run styles is eligible. Unknown attrs/extensions, pPr, tables, fields, controls, alternate prefixes and complex formatting stay readonly. Eligibility additionally rejects unmodeled property values (e.g. double underline/auto color), malformed run nesting/order, repeated properties, nested revisions and misplaced delText. This intentionally excludes many ordinary Word paragraphs carrying paragraph properties/rsid attributes; broader coverage remains follow-up.

New insertion/deletion identities are controller-owned, metadata-distinct from old revisions, with explicit IDs reserved against original document IDs and current baseline marks. They no longer rely on vendor's per-paragraph fallback id9001. Native readback compares full normalized PM including IDs, all existing revisions/formatting/structure and edited text. Forged/plain edits, writer loss, unsupported target changes and late protection transitions refuse final save. All non-document ZIP entry contents remain exact before authorized W2 settings; whole compressed ZIP byte identity is claimed only for no-op.

Auxiliary options must match the accepted empty baseline in mandatory mode; this is not support for forced tracked auxiliary/structure operations. Limits are 10000 private revision identities/history entries and 16MiB total accepted fingerprint storage, then a visible save/reopen refusal. No open-file encryption or metadata privacy behavior implemented.

## Checks run

- `pnpm --filter @mimir/office test src/docx-forced-tracking.test.ts src/docx-protection.test.ts src/docx-protection-settings.test.ts src/docx-protection-password-native.test.ts src/docx-protected-comments.test.ts src/docx-protected-anchors.test.ts src/docx-protected-forms.test.ts src/editors/DocxEditor.protection-settings.test.tsx src/editors/DocxEditor.password.test.tsx src/agent/docx-agent.test.ts`: **10 files / 210 tests PASS**, exit0. Log `/tmp/mimir-t-final-regression-20261017.log`.
- After final eligibility hardening: dedicated T suite **1 file / 15 tests PASS**, exit0. Log `/tmp/mimir-t-hardened-core-20261017.log`. Earlier combined gate had 14 dedicated T tests, hence combined count above predates the one eligibility test.
- Office `tsc --noEmit`: PASS, including final eligibility code. Prior log `/tmp/mimir-t-types-20261017.log`; final command session9722 includes typecheck before hardened core tests, exit0.
- Scoped oxlint on all 17 touched TS/TSX files: exit0, four pre-existing `no-map-spread` warnings in `docx-agent.ts`. Final new policy/test lint also exit0 without diagnostics. Log `/tmp/mimir-t-oxlint-20261017.log`.
- Scoped oxfmt check on 17 files PASS; final two files formatted after hardening. Log `/tmp/mimir-t-format-20261017.log`.
- `antd lint` both protection controls: zero issues, partial=false, exit0.
- `pnpm lint:styles`, `git diff --check`: PASS. Full suites/build/browser are root-owned, not rerun by this implementer.

## Browser/checker handoff and remaining risks

- Browser fixture `/tmp/mimir-docx-forced-tracking-20261017.docx` generated locally from root's unprotected W2 fixture. First paragraph supports text edits; second preserves old insertion id9001/deletion id1; third has opaque attrs and must refuse editing. No upload/delete done here.
- Parent must run independent check then rebuild/browser1280 and real420×500 Inspector acceptance, native download/readback, source switch and revision navigation/disabled actions. W2 mode-change save must preserve absent recommendation attribute and visible field/group labels.
- **Real OS Chinese IME remains unverified.** The plugin currently records synchronously, including synthetic composition metadata. Synthetic test passes; this does not prove physical browser composition will not be interrupted by DOM mark rewrites. Do not claim IME acceptance. Parent advised Mac locked and no physical IME automation available; native Chromium text/paste events are useful but must be described accurately.
- No provider configured: no real model/tool-provider execution claimed. Browser/code only; Desktop acceptance belongs to user.
- Do not claim full T parity: complex native targets and structural/format tracked changes remain explicit gaps; full all-tool scope and E/P remain open.

## Proposed shared spec change for root

Root owns shared spec sync. No net spec edit left by this implementer. Replace the stale W2 sentence:

> trackedChanges设置可原生写入，强制记录行为由独立T实现；W2阶段该模式保持只读。

with:

> trackedChanges设置可原生写入，实际文字权限由T策略逐项约束；已知简单原生段落内文字修改强制记录，其余目标与结构/格式写仍明确拒绝。

Suggested complete T section is saved at `/tmp/mimir-t-proposed-spec-20261017.md` (includes bounded eligibility, private revisions/history, exact native readback, ZIP preservation, limits and IME caveat).
