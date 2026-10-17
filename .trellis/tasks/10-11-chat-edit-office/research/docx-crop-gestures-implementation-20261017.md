# DOCX image crop gestures implementation — 2026-10-17

## Approved boundary and files

Implements **A only** in `office-crop-remaining-plan-20261017.md` §4. No vendor, shared DocxEditor/session/protection, shell, dependency or server changes. Used Trellis before-dev and impeccable incumbent Operate guidance; narrow existing Inspector refinement. Read the approved fixed GenOffice/WeKnora evidence in the plan; this implementation did not perform a new competitor research pass.

Changed:
- `packages/office/src/editors/DocxImageControls.tsx`
- `packages/office/src/editors/docx-image.ts`
- `packages/office/src/editors/docx-picture-controls.css`
- `packages/office/src/editors/DocxImageControls.test.tsx`
- `packages/office/src/editors/docx-image.test.ts`

New:
- `packages/office/src/editors/DocxImageCropPreview.tsx`
- `packages/office/src/editors/docx-image-crop.ts`
- `packages/office/src/editors/DocxImageCropPreview.test.tsx`
- `packages/office/src/editors/docx-image-crop.test.ts`

## Behavior

- Existing 320px Inspector gains eight source-image crop handles and a move-region control. Native image inset defaults feed the same four percentage fields and the same normalized draft as pointer/keyboard input. Actual `<img>` content bounds convert CSS pointer displacement to normalized source coordinates; no stage/letterbox or device pixel ratio guess. Source aspect ratio fits within available width and 180px image height, including 20:1 and 1:20 images.
- Handles preserve at least one source pixel, clamp crossings/edges; move preserves region dimensions. Arrow keys move one source pixel, Shift ten. Pointer capture accepts only the current pointer. Escape restores an active gesture before reaching the next crop layer; pointer cancel/window blur restore that gesture. Next Escape returns to image formatting and focuses its live crop entry; Inspector close remains owned by the existing outer layer. Numeric Enter remains owned by ToolbarNumberField.
- Crop uses one fixed **应用图片裁切** action: decode/process first, then one PM image transaction. No intermediate document publish or second hidden Apply. Failure retains the draft and primary for retry. Image replacement and cutout keep their existing draft-preparation behavior.
- Native initial insets are retained on untouched apply; full-region and equal source-pixel-boundary operations avoid reencoding and dirty/history changes. Numeric display is capped at six decimals, while the geometry retains its source precision. Current source dimensions reset whenever pixel mode opens, preventing a previous replacement's dimensions from controlling a newly loading source.
- Writer rounds both source boundaries consistently; lower-right of a 240×160 image is exactly x120/y80/w120/h80. Encoding remains the existing **PNG** contract, including JPEG input; GIF pixel processing produces a static PNG. UI says so. Rotation, flips, alignment/wrap and displayed width remain; height follows the processed source ratio; old crop/fill attrs clear only on actual replacement. Native fill offset is explicitly explained as replaced when a real crop applies.
- Bound to initial editor/session/options, frozen doc/node/position and real NodeSelection. External document/selection/protection update cancels pending work and marks the target stale; unmount cancels. Rechecks after decode prevent late writes. A filtered-out PM transaction now throws instead of returning a fake successful target. The helper also refuses a currently noneditable editor.
- Existing scroll body/footer separation remains. Handles have 24px hit boxes with compact visible marks, scoped focus ring/cursors. Footer errors internally scroll at 4.5em rather than displacing the action.

## Verification (current slice)

- Targeted **5 files / 44 tests passed**, exit 0: `/tmp/mimir-docx-crop-targeted-20261017.log`.
  - Pure eight-handle/move/crossing/minimum/source-boundary geometry and normalized DPR/preview scaling equivalence.
  - Actual preview pointer sequences, second-pointer rejection, active-gesture Escape, pointer cancel/blur, keyboard source pixels, wide/portrait fit.
  - Actual Tiptap + DOCX session controls: draft-only dragging boundary, one crop Apply/version change, saved bytes, save→Undo/save→Redo/save, untouched no-op, native defaults, close/late cancellation, selection/options invalidation, filter rejection and retained failure draft, live return focus.
  - Native inline/front source crop+30°+flipH replacement, save twice and saved Undo/Redo, crop removal, unknown transform attr and unrelated ZIP payload preservation. Existing shared original media/sibling regression remains green.
  - Canvas-source-rectangle checks cover PNG/JPEG/GIF input labels and the PNG output contract. These use bounded decode/canvas stubs; **they are not real browser raster/codec validation**.
- `pnpm --filter @mimir/office typecheck` exit 0: `/tmp/mimir-docx-crop-types-20261017.log`.
- Scoped oxlint exit 0, **0 errors / 0 warnings**: `/tmp/mimir-docx-crop-lint-20261017.log`.
- Scoped 9-file oxfmt check exit 0: `/tmp/mimir-docx-crop-format-20261017.log`.
- Separate `antd lint ... --format json` for each new/changed component: both **0 issues**. An initial combined invocation was rejected by CLI arity; corrected to separate invocations.
- `node scripts/check-style-backticks.mjs` and scoped `git diff --check`: exit 0.

## Browser/native fixtures for root

Generation script only creates temporary fixtures, never edits the repo:
`/tmp/mimir-docx-crop-fixtures-20261017.py`.

All use a real 240×160 RGBA PNG: red/green upper quadrants, semi-transparent yellow lower-left, blue lower-right, source-coordinate 20px grid. DOCX frame is 240×160 px. Custom ZIP sentinel and unknown transform attribute included. No uploads/deletions done by this agent.

| Path | SHA256 |
|---|---|
| `/tmp/mimir-docx-crop-plain-20261017.docx` | `98f38f8552da465e112b988ac885fcc7df48e750346429e5027b11457cb9f166` |
| `/tmp/mimir-docx-crop-shared-20261017.docx` | `3c6b0724bac9dccb79fc3a18524760cb36aec26e4eff28c8da7609e7fd3df623` |
| `/tmp/mimir-docx-crop-native-insets-20261017.docx` | `3de554d6311fabc89756a501d1d0a0f70cd064c26de69c47ca5e826c94bf9a1c` |
| `/tmp/mimir-docx-crop-front-native-insets-20261017.docx` | `8aa6d2dd871571593b5c1018645d2e68a42e65b99eb4d8a5d4424b5d0293acec` |

Native-insets samples: left10/top5/right15/bottom20%, rotation30°, flipH. Shared sample duplicates the ordinary drawing while keeping the same original media relationship; crop the first and verify the second remains original. Original PNG also at `/tmp/mimir-docx-crop-quadrants-20261017.png`.

UI route: select a real picture → 图片格式 Inspector → **裁切选中图片**. Handles have aria labels 裁切左上/顶部/右上/右侧/右下/底部/左下/左侧边界; region is 移动保留区域. Primary is 应用图片裁切. Initial crop preview is unrotated source space; actual transforms remain applied after publish.

## Remaining gates / limits

Independent checker and root production build, real 1280 / 420×500 browser interactions and PNG raster/alpha/native download comparison are pending. No browser screenshot, real JPEG/GIF decode, external provider/model call, full Office suite or Desktop acceptance is claimed by this slice. Root owns these gates and any contract/spec synchronization. Floating tables and PPTX group/media scopes B/C/D remain unassigned here.
