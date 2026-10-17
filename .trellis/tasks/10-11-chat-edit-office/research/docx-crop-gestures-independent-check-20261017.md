# DOCX image crop gestures — independent check (2026-10-17)

## Scope

Reviewed approved slice **A only** from `office-crop-remaining-plan-20261017.md` §4 and the implementation report. Loaded Trellis check guidance, task artifacts and applicable Office engine/editor/shell specs. Reviewed the nine image-specific implementation/test/style files; did not change shared `DocxEditor`, session, protection, vendor, server, dependencies or unrelated work. Reused the approved competitor research; this was verification, not a new competitor research pass.

## Findings (fixed)

- File: `packages/office/src/editors/DocxImageCropPreview.tsx`.
  - Issue: `pointerdown`, `pointermove` and `pointerup` checked the active pointer ID, but `pointercancel` and `lostpointercapture` did not. A second pointer's cancellation could restore the first pointer's draft or terminate its capture while the first pointer was still dragging.
  - Fix: Gate both handlers by the current gesture's `pointerId`. No geometry or publish-path changes.
  - Regression: `DocxImageCropPreview.test.tsx` drives one owning pointer, a second pointer's cancellation/capture loss, continuing owner movement, then owner cancellation. Before the fix it failed (`left=10`, expected `20`); after the fix it passes. The owner still restores its own original crop on cancellation.

## Findings (not fixed)

No remaining concrete code defect found within this slice after the fix. Root-owned gates remain pending: production Web build/full suites, actual 1280 and 420×500 browser layout/interaction, real PNG alpha/raster output and real JPEG/GIF browser decoding. Happy DOM/canvas stubs do not establish these results. No Desktop acceptance or model/provider invocation was performed.

Spec synchronization recommendation for root: record the source-image rectangle mapping, one-source-pixel minimum, matching pointer IDs for **all** gesture lifecycle events, preview-only draft/one final PM transaction, unchanged source-pixel-boundary no-op, PNG/static-GIF encoding and original crop/fill clearing only after a real replacement. These contracts are backed by this slice's code/tests; no shared spec was edited here to avoid conflicting root ownership.

## Verification

- Targeted tests: **5 files, 45/45 passed**, exit 0.
  - `DocxImageCropPreview.test.tsx`
  - `docx-image-crop.test.ts`
  - `DocxImageControls.test.tsx`
  - `docx-image.test.ts`
  - `DocxEditor.picture-history.test.tsx`
  - Log: `/tmp/mimir-docx-crop-check-targeted-20261017.log`.
- Regression red evidence: `/tmp/mimir-docx-crop-check-pointer-red-20261017.log` (1 failed / 4 passed before the local fix).
- Office TypeCheck: **pass**, `pnpm --filter @mimir/office typecheck`, exit 0; `/tmp/mimir-docx-crop-check-types-20261017.log`.
- Scoped oxlint: **pass**, eight TS/TSX files, exit 0; `/tmp/mimir-docx-crop-check-lint-20261017.log` (no diagnostics).
- Scoped oxfmt: **pass**, all nine files, exit 0; `/tmp/mimir-docx-crop-check-format-20261017.log`.
- Ant Design lint: **pass**, both components independently, **0 issues** each; `/tmp/mimir-docx-crop-check-antd-{controls,preview}-20261017.log`.
- Style backticks: **pass**, exit 0; `/tmp/mimir-docx-crop-check-styles-20261017.log`.
- Scoped `git diff --check`: **pass**, exit 0.

Reviewed actual code paths and native/editor tests for eight handles plus move; actual image rect scaling; clamped source geometry; numeric draft synchronization; native inset defaults; one final crop action; rejection/retained draft; selection/options/unmount cancellation and late-result guards; native PNG replacement/save/history; untouched sibling/media/custom ZIP payload; Escape layering and live crop-entry focus. The JPEG/GIF-labelled canvas tests establish the existing PNG output contract only, not real codec decoding. No full repository `pnpm check` was rerun (known bundled-skill lint baseline remains root-owned).

Image slice files are frozen and released to root for browser acceptance. No staging, commit, archive, upload, or deletion was performed.
