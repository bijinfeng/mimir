# DOCX independent check

Reviewed 2026-10-20 against `prd.md`, `design.md`, `implement.md`, `check.jsonl`, the curated Office engine/editor/shell specs, and the research inventory/reference boundaries.

## Findings (fixed)

None. No blocking code issue was found, and this review did not modify product code, tests, gallery files, screenshots, parent task metadata, or dependencies.

## Findings (not fixed)

None within the reviewed product/test diff. The main session still owns actual browser geometry/visual acceptance, the before/after archive, and the final full-repository `pnpm check`; these are completion requirements, not claimed as completed by this scoped review.

## Reviewed behavior

- The six product files are limited to the planned DOCX UI scope. Vendor, shared shell primitives, source IO, native save/export, protection/encryption, Agent execution, and document history implementations remain unchanged.
- Chart, textbox, page, watermark, and note handlers retain their original tools, parameters, validation, and secondary actions. The optional `DocxControlForm.actions` slot moves actions to a sibling footer while keeping prior no-actions consumers on their old structure. Empty notes do not acquire invented actions.
- Style selection stays outside the keyed definition form, has a visible field label, and explicitly disables Antd Select controls during real pending updates. The definition/apply action hierarchy retains the requirement to update changed definitions before applying them to the frozen selection.
- DOCX-only CSS makes the affected Inspector bodies flex containers with independently scrolling fields and sibling fixed actions. Status text rules target the actual status/alert elements rather than button spans. Pixel boundaries and short-viewport reachability require the main session's actual browser evidence.
- `advancedMenu` captures context/version and source section before closing the owning collapsed group. Existing live trigger/group/tab focus recovery remains in place.
- Find closes through one handler for Escape, close button, and toolbar toggle. It restores the same PM DOM after unmount with `preventScroll`, guards the editor identity/destruction, and does not redirect deliberately external focus. The new real-editor tests assert the original PM instance, one editable PM, unchanged document/version/history/dirty, and outside button/input focus behavior.
- Visible Privacy reload and encryption cancellation labels, plus the Design primary action, use the existing ToolbarButton behavior without duplicate primary labels.
- Existing specs already cover visible labels, local scrolling/fixed actions, busy Selects, first-click numeric commits, and focus restoration. No new contract or architectural decision requires a spec entry.
- The 478-entry inventory remains explicitly a source mapping, not 478 successful GUI interactions. WeKnora/GenOffice and Office/Docs reference evidence is correctly separated from live third-party UI verification.

## Verification

- Lint: **pass** — `pnpm exec oxlint` on all 10 changed DOCX TS/TSX product and test files.
- TypeCheck: **pass** — `pnpm --filter @mimir/office typecheck`.
- Format: **pass** — `pnpm exec oxfmt --check` on the 10 changed TS/TSX files and `docx-tools.css`.
- Diff whitespace: **pass** — `git diff --check` at review time (tracked diff only; final staging must also check newly added archive/task files).
- Tests: **pass**, **5 files / 59 tests** — `pnpm --filter @mimir/office exec vitest run src/editors/DocxAdvancedControls.test.tsx src/editors/DocxEditor.views.test.tsx src/editors/DocxDesignControls.test.tsx src/editors/DocxEditor.privacy.test.tsx src/editors/DocxEditor.encryption.test.tsx --maxWorkers=2`.
- Full repository gate and actual browser screenshots: owned by the main session; not rerun or represented as independently verified here.

An earlier test invocation was intentionally stopped by the reviewer to avoid overlapping high-concurrency work with the main session's full gate. The explicit filtered invocation above completed successfully; no test failure was suppressed or relaxed.
