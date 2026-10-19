# Research: PDF collapsed Inspector entry points

- Query: Audit every PDF ribbon group which opens an Inspector for failure to close its collapsed menu.
- Scope: internal
- Date: 2026-10-20

## Findings

`packages/office/src/editors/CompactToolbar.tsx:230` calls `section.collapsedContent?.(close) ?? section.content`; the fallback does not close its menu. A control that opens another persistent surface must opt in. Existing correct examples are `signatureTrigger` (`PdfEditor.tsx:2555`), `formsTrigger` (`:2581`), and `annotationsTrigger` (`:2602`): each callback calls `close?.()` before its existing state changes. Their sections wire both normal content and collapsed content (`:3645`, `:3861`, `:3869`).

The remaining **8 groups / 10 Inspector-opening actions** have no `collapsedContent` in the baseline:

| Group key | Action label | Baseline file:line |
| --- | --- | --- |
| local-ocr | 识别扫描文字 | PdfEditor.tsx:3557 |
| redaction-copy | 标记涂黑副本 | PdfEditor.tsx:3589 |
| page-images | 导出页面图像 | PdfEditor.tsx:3625 |
| canvas-drawing | 打开画布绘图 | PdfEditor.tsx:3659 |
| document-tools | 页面、绘图与文档属性 | PdfEditor.tsx:3686 |
| insert-text | 插入文字 | PdfEditor.tsx:3721 |
| insert-text | 编辑待保存文字 | PdfEditor.tsx:3746 |
| insert-text | 定位原文 | PdfEditor.tsx:3768 |
| text-blocks | 原文段落编辑 | PdfEditor.tsx:3814 |
| images | PDF图片工具 | PdfEditor.tsx:3844 |

All paths above are under `packages/office/src/editors/`. Labels and source hashes can be checked against `source-inventory.json`; line numbers refer to the captured baseline and may shift after implementation.

Minimal ownership: refactor each affected JSX block into its own `trigger(close?)` (the text group can return its existing fragment), wire `collapsedContent`, and call `close?.()` at the start of the existing click handler. Preserve each handler's particular state cleanup and source/busy guards. Do not replace those handlers with a speculative global reset. Reuse existing `PdfInspector` focus restoration and deferred focus logic.

The primary session reported a real 390×400 reproduction in the document-tools group: collapsed menu remains expanded above the Inspector heading. This researcher independently verified the shared source mechanism; no browser was operated by this researcher. Other seven groups are source-supported candidates requiring actual GUI checks.

Related specs: `.trellis/spec/office/frontend/editors/conventions.md` PDF collapsed menus and Inspector focus; `.trellis/spec/office/frontend/shell/conventions.md` persistent surface/focus boundaries.

## Caveats / Not Found

- The page-layout group opens `pageMenu`, another menu, rather than an Inspector; it is not counted among these eight groups.
- Plain navigation, rotation, ordering and delete are immediate/menu/confirm commands; do not globally close all groups or change their semantics to fix Inspector openings.
- External reference applicability is documented in `pdf-external-references.md`; no external GUI equivalence is claimed here.
