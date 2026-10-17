# DOCX T / narrow W2 independent check

**Latest status: second independent check PASS for this bounded slice.** The original three findings below were repaired by the original implementer and independently reproduced as fixed. See the final recheck section; the original red evidence remains historical. This does not include root browser/build/full-suite release or real OS Chinese IME acceptance.

2026-10-17. Formal independent `trellis-check` review of the frozen implementation in `docx-forced-tracking-implementation-20261017.md` against `docx-protection-password-next-plan-20261017.md`. **Not released: return three algorithm/behavior defects to the original implementer.** No production code, shared spec, vendor, server or XLSX files changed by this checker.

Read the complete saved role-hook context, task PRD/design and relevant implementation-plan sections, Office engine/editor conventions, project rules/quality, the implementation/next-plan reports and the Trellis check skill. Main reference remains fixed GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`. Reused the implementation's cached same-day WeKnora v0.8.3 source evidence (`3e22822c1d2397be730c458c7539d0eb8c113a24`): truthful capability gates apply; it is not the native Word revision algorithm or Office toolbar reference. No fresh network-success claim.

## Findings (fixed)

- No production mechanical issue found that required a local fix. Added seven meaningful test rows to `packages/office/src/docx-forced-tracking.test.ts`, formatted them and resolved checker-created conditional-assertion lint failures before handoff. Three rows pass (old insertion editing and two explicit-off native format preservation probes); four expose defects below. The red rows remain intentionally active for the original implementer.

## Findings (not fixed)

### 1. Overlapping inline steps throw from the recorder (P1)

- File: `packages/office/src/editors/docx-forced-tracking.ts`, step replay at lines94–134.
- Repro: in a real Editor with the protection plugin, dispatch `editor.state.tr.insertText('abc', 1).delete(2, 3)`.
- Actual: filter accepts both paragraph-local ReplaceSteps, then appendTransaction throws `强制修订校验失败：原文、已有修订、结构与格式必须完整保留`.
- Cause: each step's `before` contains the earlier raw untracked insertion. The second deletion therefore treats the intermediate `b` as original content and reinserts it as a deletion. The private original projection correctly detects the mismatch, but only by throwing from transaction application.
- Required: preserve intermediate provenance while compiling the tracked transaction, or reject the whole unsupported overlap in filterTransaction with the normal blocked reason. Never weaken final original-projection checks. The regression accepts safe atomic refusal or a savable tracked result; an uncaught application exception is not acceptable. No partial published PM state or on-disk corruption is claimed by this repro.
- Test: `handles overlapping inline steps atomically without throwing from the recorder`.
- Not fixed because this changes the tracking/protection algorithm and belongs to the formal implementer.

### 2. Consecutive forward Delete stalls at retained deleted text (P2)

- File: same module, caret mapping at lines123–130.
- Repro: set the caret to position1 in `Alpha…`; three times delete `[selection.from, selection.from+1]`.
- Actual: only `A` is tracked as deleted. The caret remains before retained `A`; subsequent Delete operations keep hitting that same already-deleted text. The existing Backspace case works because its selection is moved before the retained span.
- Required: distinguish forward and backward deletion placement so consecutive forward Delete can reach the next live character without losing original text/revisions, while Backspace and replacements keep their current correct behavior. Also avoid recording no-op document/history updates when the final tracked document is unchanged.
- Test: `makes consecutive forward deletions advance over retained deleted text`; observed deletion text was `Aexisting deletion`, expected to contain `Alp` (the old second-paragraph deletion is intentionally retained).
- Not fixed because selection placement is coupled to the tracking replay algorithm.

### 3. Agent silently discards modeled block-format intent (P2)

- File: `packages/office/src/agent/docx-agent.ts`, `forcedText` lines747–757.
- Repro: mandatory mode `replace_blocks` for block0 with either `<h1>Heading intent</h1>` or `<p style="text-align:right">Aligned intent</p>`.
- Actual: both resolve `{ ok:true, changed:true, summary:'段内文字已作为修订替换，尚未保存到库', version:1 }`. `forcedText` checks only `isTextblock` and then returns its inline content, throwing away the parsed heading/alignment attributes.
- Required: reject unsupported structural/block-format intent before publication with the precise forced-tracking boundary, or explicitly support and track that intent. The approved slice is text-only, so refusal is the bounded recommendation. Retain allowed ordinary paragraph wrappers and supported inline text styles.
- Tests: two rows of `rejects unsupported Agent block formatting rather than silently discarding it: %s` assert refusal, unchanged document/version/history/dirty.
- Not fixed because this is Agent parameter semantics and a behavior change, not a mechanical cleanup.

## Reviewed paths and evidence

- Inspected native eligibility, reserved original IDs, private author/date identities, projection and accepted-history fingerprints; PM filter/append ordering and vendor recorder isolation; mandatory storage restoration; raw accept/reject and auxiliary guards; final native readback and original non-document ZIP preservation; authorized settings transitions and protection epochs; Agent insert/replace/findReplace/round paths; actual Editor source-switch and revision controls regressions.
- Original 10-file gate passed **211/211** before checker additions. Native tests cover wrong/fake revisions, settings credentials, mode history, real password worker, late save transition, actual Editor UI labels, disabled required-tracking controls, source switch and native output.
- Added passing probes confirm an edit within a pre-existing insertion saves through native readback with original identities, and explicit `<w:u w:val="none"/>` / `<w:strike w:val="0"/>` survive a target paragraph text edit. These do not broaden support to arbitrary native formatting.
- W2 visible group/field labels are asserted through actual Editor markup. Reviewed distinct current restriction versus modification password paths. Recommended preservation tests cover absent,0,false,off spelling, dormant writeProtection and unchanged credential attributes; no new W2 defect reproduced.

## Verification

- Original scoped regression: `pnpm --filter @mimir/office test src/docx-forced-tracking.test.ts src/docx-protection.test.ts src/docx-protection-settings.test.ts src/docx-protection-password-native.test.ts src/docx-protected-comments.test.ts src/docx-protected-anchors.test.ts src/docx-protected-forms.test.ts src/editors/DocxEditor.protection-settings.test.tsx src/editors/DocxEditor.password.test.tsx src/agent/docx-agent.test.ts` — **10 files /211 PASS**, exit0. `/tmp/mimir-t-check-regression-20261017.log`.
- Final adversarial dedicated suite: `pnpm --filter @mimir/office test src/docx-forced-tracking.test.ts` — **18 PASS /4 FAIL /22 total**, exit1. `/tmp/mimir-t-check-adversarial-20261017.log`. Four red rows represent the three findings above.
- Office typecheck: **PASS**, exit0, including final checker regressions. `/tmp/mimir-t-check-types-final-20261017.log`.
- Scoped oxlint across all17 implementation TS/TSX files including checker additions: **PASS**, exit0; four existing `no-map-spread` warnings in docx-agent.ts. `/tmp/mimir-t-check-lint-final-20261017.log`.
- Scoped oxfmt17-file check PASS; final modified test rechecked PASS. `/tmp/mimir-t-check-format-20261017.log`, `/tmp/mimir-t-check-format-final-20261017.log`.
- Antd lint both protection controls: **zero issues, partial=false**, exit0. `/tmp/mimir-t-check-antd-settings-20261017.log`, `/tmp/mimir-t-check-antd-status-20261017.log`.
- `pnpm lint:styles` and `git diff --check`: **PASS**, exit0. `/tmp/mimir-t-check-styles-20261017.log`, `/tmp/mimir-t-check-diff-final-20261017.log`.
- No server tests, full Office suite, build or browser run by this checker. No stage/commit/archive/upload/delete.

## Limits and parent handoff

- Return these findings to the original T implementer, then recheck the frozen fix. Root owns browser/build/full gates and shared spec sync.
- Actual OS Chinese IME remains unverified; synchronous synthetic composition metadata does not prove physical browser composition behavior. Root must describe text/paste/composition evidence accurately and must not mark IME acceptance based on these tests.
- Original paragraphs with pPr/rsid/extensions/complex content and structural/format tracked changes remain explicit capability gaps in this bounded slice. Broad all-tools parity remains open, as do whole-file encryption and privacy scrub; conservative refusal is preservation behavior, not evidence of completion.
- W2 new labels/fixed320px/footer and untouched recommendation need the root's rebuilt1280/420×500 browser verification. Existing passwords may be verified locally; new-credential browser interactions retain the documented CUA handoff requirement. No model/provider configured, so no real Agent model/provider call claimed.

## Second independent check — formal fixes frozen, 2026-10-17

Reviewed `docx-forced-tracking-fixes-20261017.md` and actual changed code. No production change by this checker. Privacy owner's concurrent `docx.ts` finalization was preserved and not rewritten; these T fixtures do not enable privacy. Root still owns the T/privacy combination and browser/full release.

### Findings (fixed by original implementer, independently verified)

1. Overlap: output ranges are mapped into each subsequent ReplaceStep's coordinate space. A later overlapping replacement/insertion or deletion-boundary crossing now refuses in the filter with a visible bounded reason, before document/version/history publication. The exact original `insertText('abc',1).delete(2,3)` no longer throws. The original red row plus the implementer's exact zero-publication assertions pass. Independent additional variable-length adjacent replacements (`'A'→'ABC'`, next original `'l'→'XYZW'`) save through the unchanged native projection/readback checks; disjoint and one-character-adjacent tests also pass.
2. Forward Delete: a single deletion at the old empty caret places selection after retained deleted text. Three consecutive Deletes now track `Alp`; the original Backspace caret test still passes. A pure re-deletion of retained deletion text returns before publication and preserves history/version. Replacement placement retains the prior behavior.
3. Agent semantic grammar: raw heading/unsupported elements and paragraph attributes now refuse before schema parsing can discard them, then the parsed single block must match the default paragraph markup. The original h1/right-alignment red rows pass with document/version/history/dirty unchanged. Plain paragraphs plus supported bold/italic remain accepted.

The implementation also canonicalizes *new* styled insertion raw rPr using the existing vendor `inlineToRuns`/`mergeRPrModel` output. Original raw properties are not overwritten and the full final native/PM comparator remains unchanged. Eligibility admits bCs/iCs/szCs only with a semantically equal same-rPr base property; lone/conflicting twins remain refused. Reviewed numeric/on-off comparisons and preserved the refusal tests. This does not authorize arbitrary complex-script/native formatting.

### Additional independent regressions

Three new passing rows in `src/docx-forced-tracking.test.ts`:

- Adjacent variable-length replacements save with exact protected-original projection and non-document ZIP preservation.
- Accepted Agent span color `#335599` plus12pt size saves/reopens, then permits another genuine tracked edit/save.
- Accepted underline and strike text saves/reopens, then permits another genuine tracked edit/save.

These extend the dedicated suite from26 to29; no weakening or deletion of the first checker regressions.

### Verification

- Same10-file targeted protection/Agent/actual-Editor gate: **222/222 PASS**, exit0, before the three final independent additions. `/tmp/mimir-t-recheck-regression-20261017.log`.
- Final dedicated T suite including all original red rows and all three new probes: **29/29 PASS**, exit0. `/tmp/mimir-t-recheck-core-20261017.log`.
- Office TypeCheck: **PASS**, exit0, after the concurrent XLSX import issue was resolved. Final rerun includes the added test rows. `/tmp/mimir-t-recheck-types-final-20261017.log`.
- Scoped oxlint four fix files: **PASS**, exit0, only the same four pre-existing `no-map-spread` warnings in Agent. `/tmp/mimir-t-recheck-lint-final-20261017.log`.
- Scoped oxfmt four files and `git diff --check`: **PASS**, exit0. `/tmp/mimir-t-recheck-format-final-20261017.log`, `/tmp/mimir-t-recheck-diff-final-20261017.log`.
- No CSS/Antd/UI production changes in this repair/recheck, so the earlier zero-issue Antd/style checks remain the evidence for unchanged controls; root owns rebuilt physical browser acceptance.

### Findings (not fixed / remaining limits)

No additional production defect found within the reviewed fix scope. Complex native paragraphs and structural/format/auxiliary tracked writes remain explicitly unsupported. Actual OS Chinese IME is still unverified; synthetic composition remains insufficient evidence. Browser1280/420×500, final production build/full gates and T/privacy interactions are root-owned. These limitations do not close the larger all-tools task or whole-file encryption/privacy scope.
