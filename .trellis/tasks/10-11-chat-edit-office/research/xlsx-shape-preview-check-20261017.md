# V — XLSX imported shape preview independent check

2026-10-17. Formal independent `trellis-check` review of `xlsx-shape-preview-implementation-20261017.md` and `xlsx-preview-range-next-review-20261017.md` §V. This slice is frozen for root integration. The overall task remains in progress. No browser, Desktop, model call, full-suite or production-build acceptance is claimed here.

## Findings (fixed)

- File: `packages/office/src/xlsx-shape-preview.ts` and `xlsx-shape-preview.test.ts`.
  - Issue: custom-geometry formula validation bounded individual operands and literal arc sweeps, but an `arcTo@swAng` guide could multiply those operands into a huge/non-finite value. Vendored `parseCustGeom` expands that resolved sweep into cubic segments before the adapter's post-parse finite/output check. This could monopolize the browser before any fallback appeared.
  - Fix: evaluate the already grammar-checked, bounded guide list using the same fixed vendor evaluator before invoking `parseSlide`; reject non-finite/out-of-budget guide values and resolved arc sweeps beyond one revolution. Require arc attributes and nonnegative radii. Native path extents require positive integer literals, matching the reader's actual supported semantics. Regressions cover guide-derived oversized sweeps, multiplicative overflow, missing arc parameters, guide-valued path extents and an ordinary valid quarter-circle. Valid siblings remain available.
- File: the same parser/test files.
  - Issue: direct image paint and image-bearing theme fill/line templates could be silently discarded because the temporary reader intentionally receives no media relationships. The resulting undefined fill or solid theme fallback appeared as supported artwork, contrary to the slice's stated image-fill limit.
  - Fix: detect direct native `blipFill` and referenced theme image templates before that lossy read; mark the shape explicitly unsupported. Tests cover direct/theme image paint and valid unaffected sibling/direct gradient shapes.
- File: the same parser/test files.
  - Issue: malformed `prstGeom` without its required preset name became `noGeometry`, presenting it as a text-only supported shape.
  - Fix: reject missing/blank preset names and retain the explicit unsupported state; regression added to the malformed/sibling case.

The checker modified only these two production/test files and this report. No vendor, Editor, DV, server, shared shell, upload, staging, commit, archive or test-file deletion.

## Findings (not fixed)

- Existing `.trellis/spec/office/frontend/editors/conventions.md` §XLSX still groups original rotation/adjustments/complex fill among unmodeled preview features. V now supports bounded rotation/flips, adjustments, linear paint and basic rich paragraphs. Root should synchronize that existing sentence when integrating V, retaining explicit image/pattern/nonlinear/effects/unknown-geometry limits. The shared dirty spec is owned by the root/other slices; this checker leaves it untouched.
- Root's actual 1280 and 420×500 browser acceptance remains required, including selected-frame alignment, text readability, frozen-scroll behavior, Inspector/footer reachability and save/history. These are pending integration gates, not inferred browser passes. Fixture remains `/tmp/mimir-xlsx-imported-shapes-20261017.xlsx`; this checker did not upload it.

## Evidence reviewed

- Fixed GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`, `WorkbookVisuals.tsx:1330–1450`; fixed vendor `parseSpShape`, `parseXfrm`, `parseFill`, `evalGuides`/`parseCustGeom`, theme-style reader and geometry helpers. Vendor unchanged.
- WeKnora applicability uses the task's same-day official site/source cache: v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`; exact hashes recorded in the implementation report and protection plan. This is cache reuse, not a fresh network check. Its capability gates inform truthful unsupported states; it does not define DrawingML/Excel visual geometry.
- Namespace expansion, strict/transitional/arbitrary/default prefixes, source-offset identities, one real internal theme relationship, custom path channels, theme gradient/alpha/style, separate stroke/noFill, rich text and source bytes/dirty neutrality were checked against actual paths and focused tests.
- Actual native host insertion of all 104 gallery presets, native save/reopen and actual preview markup remain covered. Existing row/column measurement code and lifecycle were unchanged; targeted layout tests cover hidden/sparse tracks, variable DOM geometry and 75/100/150% zoom.
- Native fill edit preserves transforms, adjustments, line and rich text; all non-target ZIP entries and later drawing anchors remain exact. No-op `openXlsxForEdit.save()` recompresses the archive in the existing writer, so only per-entry equality is claimed, not whole compressed-ZIP identity.

## Verification

- Tests: **PASS, 4 files / 22 tests**. Command: `pnpm --filter @mimir/office exec vitest run src/xlsx-shape-preview.test.ts src/editors/XlsxObjectLayer.test.tsx src/editors/xlsx-object-layout.test.tsx src/editors/xlsx-shape-gallery.test.ts --maxWorkers=2`. Log `/tmp/mimir-xlsx-shape-check-tests-20261017.log`.
- TypeCheck: **PASS**, Office `tsc --noEmit`; `/tmp/mimir-xlsx-shape-check-types-20261017.log`.
- Lint: **PASS**, scoped oxlint over all 9 V-owned files, zero output/warnings after the local test helper cleanup.
- Format: **PASS**, scoped oxfmt check over the same 9 files.
- Styles: **PASS**, `node scripts/check-style-backticks.mjs`.
- Antd: no component/API changes or imports in this slice; the object selection button is the existing native object-layer control.
- Scoped `git diff --check`: **PASS**.
- Full `pnpm check`, full tests/build and browser: deliberately left to root; known bundled-skill lint baseline not rerun.

## Real-editor integration follow-up, 13:14

Root's unified Office run completed with **207/208 files and 2246/2247 tests passing**. Its sole failure was the older real-editor gallery assertion at `XlsxShapeGallery.test.tsx:267`: it queried the removed `.mimir-xlsx-object__shape` wrapper, so its path was `undefined`. The successful native insertion/history assertions immediately before it passed. The checker waited for the complete unified log, reported the narrow cause/fix, then independently reproduced the same failure in that single file (8/9 pass; `/tmp/mimir-xlsx-shape-real-editor-repro-20261017.log`).

Fixed only that test selector to the actual `.mimir-xlsx-object .mimir-xlsx-native-shape path`. The heart's real cubic path assertion, slow-host cancellation, native save twice, undo/redo and every ZIP-entry comparison are unchanged; no production fallback was added.

Expanded focused suite now includes the real `XlsxShapeGallery.test.tsx`: **5 files /31 tests passed** with `--maxWorkers=2`, log `/tmp/mimir-xlsx-shape-check-complete-tests-20261017.log`. Office TypeCheck passed again; changed test scoped oxlint, oxfmt and diff check passed. This follow-up additionally owns that test file only. Formal V freeze restored; root retains full-suite/build/browser gates. The earlier 4-file gate was valid but missed this dependent real-editor selector; use the expanded five-file command for V regression.

## Production copy follow-up, 13:21

Root's actual browser fixture `PK4FilufzKIRoO1G` exposed stale manage-panel copy in `XlsxObjectControls.tsx`: it still described all shapes as preset outlines and original rotation/basic rich styles as limited. Root authorized only this copy and its dependent assertion. Replaced the note with “图片填充、图案填充、非线性渐变及文字特效预览有限，请在 Excel 中核对。” This names the actual remaining limits without claiming complete Excel fidelity. No geometry parser, renderer, fallback state, controls or native writer changed.

Updated the existing `XlsxShapeGallery.check.test.tsx` native-shape preservation test to assert the precise remaining limits and absence of the stale rotation/style phrase. Focused gallery-check plus object-layer tests **2 files /9 tests passed**, including unknown-geometry fallback and native XML preservation; `/tmp/mimir-xlsx-shape-copy-check-tests-20261017.log`. Office TypeCheck passed (`/tmp/mimir-xlsx-shape-copy-check-types-20261017.log`); scoped two-file oxlint/oxfmt/diff check passed. No Antd API/props or styles changed. This follow-up changes only those two files and this report. V is frozen again; root owns shared-spec sync and latest browser/build acceptance.

### Root-reported UI findings, left for a separate formal implementation slice

Root's actual browser acceptance additionally found that a selected shape in Manage shows an unrelated empty “已有结构化表” form; its primary action remains in scrolling content and becomes unreachable/clips the heading at420×500. Root also found that a gradient shape's fill palette falsely reports white as the current fill. These are root-observed UI findings, not independently browser-reproduced by this checker. Root will dispatch a separate implementation slice for contextual forms, fixed footer and truthful non-solid fill state; this copy-only checker leaves those design/interaction changes untouched.
