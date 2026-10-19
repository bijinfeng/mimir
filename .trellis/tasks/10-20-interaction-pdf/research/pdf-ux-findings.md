# Research: PDF polish candidates and minimal ownership

- Query: Inspect short-height long panels, composite Select busy state, text/focus/cancel and read-only boundaries without changing product code.
- Scope: internal
- Date: 2026-10-20

## Findings

### P1: collapsed menu obscures opened Inspector

The exact8groups/10actions and minimal existing pattern are documented in `pdf-inspector-entrypoints.md`. Shared `CompactToolbar.tsx:230` defaults to unchanged section content, so these entrypoints need local `collapsedContent(close)` wiring. Correct existing signature/forms/annotations examples already prove the intended solution. The main session confirmed the document-tools case in390×400; other entries require actual browser checks.

### P1: too many local tasks occupy permanent height; actions embedded among long fields

`PdfLocalPanel.tsx:192` places5 local tabs outside body; `pptx-pdf-toolbar.css:14` makes a2column grid, hence3 rows. At short height that can dominate available Inspector area. Pages (starts333) exposes export/extract/import/replace/split/grid/N-up/crop in one body; stamps (641) exposes watermark plus all header/footer fields; properties (751) exposes metadata plus outline. Primary buttons live within that body rather than the persistent footer. Main session measured document-tools navigation about112px and content about92px at390×400. Those are parent-reported measurements, not this researcher's browser result.

Minimal ownership is `PdfLocalPanel.tsx` and its local CSS. Present an explicit current task, keep browsing/task switching available during host busy, put that task's fields in the scroll body and its action in a sibling persistent footer. Do not convert unrelated OCR/form/image/text/signature footer rules globally; they have existing targeted behavior. Preserve all existing commands, argument shape, selected source file, result output download/print, task semantics and appropriate draft reset on document/target changes.

### P1: composite selection disabled state missing in7source sites

`ToolbarSelect` (`shell/EditorShell.tsx:747`) is an antd composite Select whose trigger and portal do not become correctly disabled merely through an ancestor HTML fieldset. Audit28 total;7 have no explicit `disabled`:

- PdfEditor.tsx:2978 paper size in page menu.
- PdfEditor.tsx:3316 annotation selection.
- PdfLocalPanel.tsx:417 grid;432 N-up direction;529 existing drawing;541 shape;601 drawing direction.

PdfLocalPanel also leaves Field/Input/NumberField/Checkbox editable during busy; mutations use captured values, so continuing to edit can make the eventual result look inconsistent with displayed parameters. Thread `busy` into local field helpers or use targeted disabled fieldset for native/antd inputs, **and explicit props on all Selects**. Disable annotation fields with existing real `contentBusy`; preserve navigation/read-only view controls and cancellation. Paper page-menu operates page-layout state, not host content tool state; assess its exact existing write guard separately rather than inventing a new host lock.

Counterexamples already correct: PdfFormPanel choice Select, PdfImagePanel selectors, external-image selector, PdfTextBlockRewriteForm format selectors, PdfDrawingCanvas selected drawing and PdfImageExportControls have explicit busy props. Do not regress them while consolidating local controls.

### P1/P2: annotations fixed actions and source ownership

`PdfEditor.tsx:3298` owns the annotation panel; selection, edit fields, add/reply/edit/delete and thread all sit in `mimir-pdf-inspector__content mimir-pdf-annotations`. CSS (`editors.css:988`) turns it into a grid with start alignment; actions are inside the scroll area. Parent reported action bottom435.92 vs panel bottom332.36 in a short-height case containing failure notice; clean-native and long-thread cases need confirmation. Move action region out only within this annotation surface if reproduced; retain correct selected-root/reply/markup disables and separate delete confirmation. Keep read-before-write SHA and stale target checks, not a UI-only copy of thread state.

### P2: footer spacing is inconsistent, so verify each actual task

Shared `.mimir-pdf-inspector__footer` (`editors.css:948`) only grid/gap/margin; form panel has its own padding/border at958. OCR/text/image export/drawing have other scoped action CSS. SignaturePanel footer (`:368`) and local asset request (`PdfLocalPanel.tsx:857`) use shared footer without their own padding rule in `pdf-signature.css`; candidate for edge-hugging or inconsistent full-width actions. Verify actual ready/empty/loading/error renders in light/dark before applying a **scoped** layout correction. Do not reintroduce the doubled-padding issue fixed in earlier modules.

### Stable behavior and controls to preserve

- `ToolbarButton` (`shell/EditorShell.tsx:348`) only renders visible label automatically for primary; secondary needs actual children. Current own controls mostly supply children correctly. Do not pass duplicate label text under primary, or remove children from secondary buttons.
- `PdfInspector.tsx:24–65` restores live trigger, same section's visible button and the captured current tab. It does not steal focus after deliberate external focus movement. `PdfEditor.tsx:3077` has deferred focus while content busy. Preserve both; new collapsed triggers must maintain refs/live group fallback.
- `PdfEditor.tsx:4274` handles drawing/signature cancellation before closing the whole Inspector. Selection layers and confirmation/dialog Escape must consume their own Escape first. OCR close stops the worker; source/target changes cancel stale work.
- `PdfTextBlockRewriteForm.tsx:183` expandable format and `PdfTextBlockPanel` selection area may leave a short body under dense fixed content. Existing max-height50% excerpt and persistent actions are intentional; test and adjust within these components if real evidence shows inaccessible fields, not by removing safety messages.
- Read-only navigation/zoom/find/copy/export are not content writes. Avoid blanket disabling all controls during a mutation; protect actual write fields while retaining current view/cancel contracts.

### Related specs and verification

Office editor conventions already cover collapsed menus, fixed action areas, explicit composite disabled, temporary OCR, exact PDF original targets, signature/drawing geometry and deferred focus. The proposed fixes enforce existing contracts. Regression scope should include native/portal mouse+keyboard busy, short viewport and source-cancel/rejection-draft behavior. Screenshot/source mapping totals must remain separate from test/GUI pass counts.

External source/version evidence is in `pdf-external-references.md`; the main visual model is shared Office/GenOffice task grouping, not WeKnora Markdown.

## Caveats / Not Found

This is a source review with parent-reported observations. It does not certify unobserved visual defects, native byte retention, browser acceptance, or all dynamic options. The implementer/main session must confirm candidate issues and retain before/after real-component evidence for the changed surface.
