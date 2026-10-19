# Research: PDF own-component interaction inventory

- Query: Inventory all tabs/groups/surfaces/control declarations, document-dependent families and state entry points before module15 polish.
- Scope: internal
- Date: 2026-10-20

## Findings

### Reproducible source map

Run `node .trellis/tasks/10-20-interaction-pdf/research/inventory.cjs` from repository root. Babel TSX AST enumerates every non-test own `Pdf*.tsx` (18 files) and hashes24 support files. Every record has a unique ID, exact file/start/end line, whole-file SHA-256 and node snippet SHA-256. `baseline-source-inventory.json` freezes the research baseline; regenerate `source-inventory.json` after implementation without overwriting the baseline.

Baseline categories: **5 main tabs,17 ribbon groups,21 source surfaces,223 control declarations,125 option/menu label declarations,34 JSX/option map families,157 JSX-producing conditionals/if branches,158 state hook bindings**. **28 ToolbarSelect records** are a cross-cutting audit subset. These heterogeneous/overlapping categories must not be added together as a GUI pass total. States can overlap, labels can be dynamic, hidden legacy JSX remains present, and document-dependent options are families rather than fabricated exhaustive native-document tests.

All18 own component files are in `sourceFiles`; all actual declarations in these files are mapped, including plain antd/native Button/Input elements, shell wrappers, custom Field/NumberField and canvas components' labelled sources. Associated labels may live in wrappers or dynamic arrays; the inventory does not claim every declaration has a visible standalone label.

### Main navigation and surfaces

`packages/office/src/editors/PdfEditor.tsx:3543` defines 开始(home),编辑(edit),页面(page),绘制(draw),视图(view).

- 开始: 导航与查找; page number/next/previous, zoom, find and independent delete confirmation. `navigationToolbar` starts2809.
- 编辑: 文字(insert-text) with insertion, pending-insert editing and original text/markup; 原文段落(text-blocks); 图片(images); 表单(forms); 批注(annotations); 涂黑副本(redaction-copy).
- 页面: 文档工具(document-tools); 旋转(page-rotate); 顺序(page-order); 裁剪与纸型(page-layout); 删除(page-delete).
- 绘制: 签名(visual-signature); 画布绘图(canvas-drawing).
- 视图: 扫描文字(local-ocr); 页面图像(page-images); 缩放(view).

A single `PdfInspector` contains the chosen persistent task, selected by `PdfEditor.tsx:3204` onward. Its content priority is OCR → redaction → local asset request → visual signature → local tools → blocks → images → forms → annotations → text panel. Most surface lifecycle and guarded source publication belong in PdfEditor, not a second local editor/history store.

### All owned component responsibilities

- `PdfEditor.tsx`: source load/parse/zero-page/error; native host wiring; page layout/thumbnail model; global save/history; Ribbon; find/replace boundaries; Inspector selection; annotations thread; native/OCR/pending text/drawing/image overlays.
- `PdfInspector.tsx`: focusable aside, layered Escape and stable trigger/group/tab focus restoration; `PdfInspectorHeader` refresh/close.
- `PdfLocalPanel.tsx`: pages/drawing/stamps/properties; dynamic local task tabs also include signature, which switches the parent to the dedicated signature panel; outputs/download/print; asset-file request/continue/cancel.
- `PdfTextInsertPanel.tsx`: new and pending insert; selected insert list; text/font/size/color/alignment/position; update/delete confirmation.
- `PdfTextMarkupPanel.tsx`: exact original snippet, highlight/underline/strikeout, color, first/all matching; guarded apply/status.
- `PdfTextBlockPanel.tsx`: read/inspect/select native blocks; move/rewrite/replace modes and rewrite reason; excerpt and target version; `PdfTextBlockRewriteForm.tsx` handles whole/partial text, match occurrence, formatting, validation and reset/apply.
- `PdfImagePanel.tsx`: current-page original image selection; upload/external-source insert/replace; crop/position/size/rotation/flip/layer/opacity/removal/background choices; pending/apply/delete confirmation; `PdfExternalImageSource.tsx` owns external search/generate/readiness/preview branches.
- `PdfFormPanel.tsx`: source snapshot/field selection, text/checkbox/radio/choice/unsupported/read-only field branches, goto page, apply/feedback.
- `PdfSignaturePanel.tsx`: ink/type/image source, colors/fonts/import/monochrome, prepared source, previous signatures; `PdfSignatureCanvas.tsx` owns actual placement/drag/resize/rotate/cancel/apply overlay.
- `PdfDrawingCanvas.tsx`: canvas drawing/select/preview and precision interaction; draft apply/cancel separate from already applied native drawings.
- `PdfRedactionCopy.tsx`: clean-state gated region draft/removal/reset and copy output; never a cosmetic black overlay falsely labelled redaction.
- `PdfImageExportControls.tsx`: current/all/custom range, DPI, progress, failure, generated PNG/ZIP/preview, cancel/download.
- `PdfOcrControls.tsx`: current/scanned scope, start/progress/stop/retry, copy/clear/select text; `PdfOcrOverlay.tsx` projects true temporary character geometry.
- `PdfPendingTextOverlay.tsx`: source-identity-bound pending insert boxes and native position/width gestures.

### State coverage that the implementation must preserve

The157 AST branch records provide exact source anchors; human acceptance should deliberately cover these scenario families rather than treating each nested expression as a separate feature:

1. Source loading, load failure/retry, parse failure/retry, valid0page document, ready single/multiple pages.
2. First/last page bounds; min/max zoom; source/crop/paper/rotation geometry; actual-order page navigation, drag/order/delete and last-page guard.
3. Pristine, page-only dirty, native-content dirty, pending insert dirty, successful save, failed save/retry, continued edits during save, history undo/redo and source identity replacement.
4. Native-host missing/reading/writing; source.saving; delayed result, abort, source/target/version change. Reads retain same version; accepted writes advance precisely once; stale work is rejected.
5. Original text index/native target available/unavailable/ambiguous; empty scanned page; OCR temporary text kept out of writable targets.
6. Insertion before/after choosing a paper position, invalid text/color, first insert/pending selection/update/delete, position gestures, numeric draft Enter/Escape and save baseline replay.
7. Original blocks empty/loading/unsupported/inspect failure/ready; move, rewrite and partial replacement; repeated substring occurrence and invalid original query; clear-to-delete; preserve/reset formatting; expanded details in a short viewport.
8. Images empty/selected/upload/search/generate/preview failure; unsupported structure and stale target; local operations and confirmed delete; external requests abort on close/source change.
9. Forms loading/empty/unsupported/read-only/text/check/radio/choice; unchanged vs modified apply; focus stable while switching fields; failures retain draft.
10. Annotations empty/new note/selected root/reply/markup; exact target page; blocked reply/delete conditions; long thread and error; cancel delete.
11. Local pages export/extract/import/replace/split/grid/N-up/crop; long selected filename/output list; watermark/header/footer; metadata and outline parse error; precise drawing new/existing/deleted and canvas draft distinction.
12. Signature ink/type/import image/decoding/errors/monochrome; no stroke/text/file; prepared vs placing vs applied; central placement, cancellation, crop/rotation geometry and native save/reopen.
13. Redaction clean-only guard, box edits/reset, pending copy generation/cancel/retry, output file; original bytes/history/dirty remain unchanged.
14. OCR idle/running/progress/partial/empty/retry/limit/stopped/cleared/selection; worker termination and local assets; copy denied fallback.
15. Page image export current/all/custom and invalid range, DPI, running/cancel/failure/generated/stale result; true rendered PDF pixels and downloads.
16. Wide docked vs medium/narrow overlay Inspector; light/dark; long labels/error/output; independent body scroll and action availability in short height; dropdown Escape before Inspector; close returns visible live trigger/tab without stealing external focus.

### Specs and tests

Read `.trellis/spec/office/frontend/editors/{conventions,pitfalls}.md`, `.trellis/spec/office/frontend/shell/conventions.md` and `.trellis/spec/office/engine/page-structure.md`. Existing meaningful regressions: `PdfEditor.local`, `.content`, `.blocks`, `.forms`, `.pending-forms`, `.signature`, `.drawing-canvas`, `.images`, `.external-images`, `.image-export`, `.ocr`, `.redaction-copy`, `.batch`, `PdfTextControls`, `PdfTextBlockPanel`, `PdfImagePanel`, `pdf-toolbar-render`, `pdf-pages`, `pdf-render` and core host suites. This researcher did not run those tests and does not label them passed.

## Caveats / Not Found

- The source inventory is complete for the defined own Pdf TSX scope, not every shared-shell implementation or vendor function.24 supporting files have hashes; shared shell source/test behavior remains under its own specs.
- True native fixtures/real source identity, fonts/WASM, byte readback, canvas geometry, OS file chooser/download/print and OCR must be tested using actual components; source maps and happy-dom canvas mocks cannot certify them.
- External-source implementation and retrieved evidence are discussed separately in `pdf-external-references.md`. No other product source/spec/task was changed by this researcher.
