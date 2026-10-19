# Independent check — XLSX interaction polish

## Findings (fixed)

None. No product or test edits were required by this review.

## Findings (not fixed)

None in the scoped implementation. Browser geometry, actual theme rendering, archive resource hashes and the full repository quality gate remain the main session's verification responsibilities; the source inventory is not a GUI pass record.

## Reviewed behavior

- Advanced find keeps conditions in the owning control and results/request ownership in the mounted menu panel. Closing unmounts the panel; document, immutable source bytes, sheet, published version or draft changes invalidate its session. Layout cleanup clears request ownership, so old success/failure/finally cannot republish results, overwrite a successor or unlock it after A→B→A. A synchronous ref lock prevents repeated Enter before the disabled render.
- Find preserves all existing query criteria and the 200-result limit. Pending Selects and result navigation are disabled; selection still calls the current handle's existing `select_range`. The real Editor regression verifies result navigation leaves bytes/version/dirty/history unchanged and accepted edits invalidate results while preserving query text.
- The 24 explicit Select disabled props cover the seven researched components. Property controls share the existing busy/protected condition, with workbook names exempt from sheet protection; Range retains its existing locked condition. The read-only zoom control and shared shell are untouched.
- Chart/image/table keep existing operation fields, validation and callbacks while their action/status become siblings of the scrolling fieldset. Their primary buttons explicitly retain busy disabling after leaving that fieldset. The device image button now has visible text. Mature shape/pivot/edit structures are unchanged.
- Tests use actual Antd Select triggers, controlled promises and native workbook search/Editor behavior rather than only checking ancestor fieldsets or duplicating CSS. Operation tests verify exact chart/image/table parameters and first-click input blur behavior. Management cancellation expectations were updated for the relocated disabled button.
- No server, Agent, schema, vendor, native XML writer or save/history implementation changed. Existing editor/shell conventions and pitfalls already cover the applicable contracts; no additional spec entry is needed for this local fix.

## Verification

- Lint: pass — independent `pnpm exec oxlint` on all 12 changed/new XLSX TSX product/test files.
- TypeCheck: pass — independent `pnpm --filter @mimir/office typecheck`.
- Tests: pass — independent `pnpm --filter @mimir/office exec vitest run src/editors/XlsxFindControls.test.tsx src/editors/XlsxObjectControls.polish.test.tsx src/editors/XlsxEditor.test.tsx src/editors/XlsxEditor.management-cancel.test.tsx`; 4 files, 96 tests passed.
- Whitespace: pass — `git diff --check -- packages/office/src/editors`.
- Format: pass — independent `pnpm exec oxfmt --check` on the 12 TSX files and `xlsx-tools.css`; all 13 files correctly formatted.
- Full `pnpm check` and real browser acceptance: delegated to the main session, not claimed by this reviewer.

## Main-session final gate

- Real GUI: nine paired captures, three supplements, actual native chart/table submission and memory-save/reopen, final static archive/index verified; see docs acceptance/browser observations.
- Full repository: `pnpm check` exit0. Office233 files/2749 tests and Renderer80 files/591 tests passed; all remaining package/server/desktop/process suites finished. Full output in docs/visual-comparisons/2026-10-20-xlsx/full-check.txt.
- Spec judgment: existing request identity, composite Select and Inspector conventions already cover this fix; no new contract introduced.
