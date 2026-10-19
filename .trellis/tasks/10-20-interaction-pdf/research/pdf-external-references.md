# Research: PDF editing references and applicability

- Query: Check current WeKnora site/source, Office/Google document guidance, fixed GenOffice PDF implementation and a public native PDF viewer/editor tool source.
- Scope: mixed
- Date: 2026-10-20

## Findings

All responses, resolved URLs, status, date and SHA-256 are retained in `external-responses.json`. Retrieved source bodies and exact excerpts with line anchors are in this directory and `external-evidence-excerpts.json`. These are documentation/source checks, not authenticated vendor GUI tests.

### Required WeKnora check

- Site: <https://weknora.weixin.qq.com/> returned HTTP 200 and exposes **v0.8.3**.
- GitHub latest release API: **v0.8.3**, published **2026-10-14T07:53:24Z**; retained in `weknora-release.json`.
- Current main was fixed at **`eecfe4b3c8c34c94e9b559e5dd02187b4ae447cd`** for this research. Its `frontend/package.json` reports **0.8.3** and `pdfjs-dist: ^6.3.289`; raw source and non-truncated tree retained. This main commit is a source snapshot, not a claim that the v0.8.3 release tag points at main.
- Concrete implementation: [`frontend/src/components/source-preview/PdfSourceViewer.vue`](https://github.com/Tencent/WeKnora/blob/eecfe4b3c8c34c94e9b559e5dd02187b4ae447cd/frontend/src/components/source-preview/PdfSourceViewer.vue), retained as `weknora-pdf-viewer.html` (Vue source; extension reflects the response detector, not an HTML screenshot). Lines32–33 own current page/zoom,246 clamps zoom,428 derives page label,479–488 render zoom controls. Source locate highlights belong to evidence preview.
- Applicability: page navigation, stable source location, explicit loading/errors and bounded zoom are useful knowledge-base preview references. This viewer does not establish native PDF content rewriting or a document editing Inspector. **Do not use WeKnora's Markdown editor, Vue/TDesign components, or source-preview toolbar as the main PDF edit model.** Mimir keeps its own shared Office shell and existing verified PDF writers.

### Office and Google guidance: limit the comparison correctly

- [Microsoft: Edit a PDF](https://support.microsoft.com/en-us/office/edit-a-pdf-b2d1d729-6b79-499a-bcdb-233379c2f63a), HTTP200, resolved to <https://support.microsoft.com/en-us/word/training/edit-a-pdf>. `microsoft-pdf-text.txt:155` describes opening PDF in Word;164 says Word makes a copy and converts it;175 warns page/line breaks may differ. This is **Word conversion guidance**, not proof that Office for the web provides an in-place native PDF editor. Reuse only clear source/copy/save boundaries and task-focused controls. Mimir's existing native content/geometry writers must not be replaced with this conversion flow.
- [Google Drive: Convert PDF and photo files to text](https://support.google.com/drive/answer/176692?hl=en), HTTP200. Retained text lines27 and44 describe supported PDF input and formatting not transferring. This is OCR/conversion into Google Docs. It is not a native PDF geometry editor and is not a suitable primary model for native PDF text/block tools. Mimir's local temporary OCR must continue to leave PDF bytes, dirty, version and knowledge-base content unchanged.
- The references are unversioned public help pages, retrieved2026-10-20; they do not supply a stable software release number.

### GenOffice fixed upstream: primary implementation reference

- Repository: <https://github.com/genspark-ai/genoffice>, exact fixed commit **`480548fd55f1be3593ee0d8e316a734751d58309`**, matching `packages/office/vendor/UPSTREAM.json` (`syncedAt: 2026-10-16T11:39:20.376Z`). Both public README and non-truncated tree retrieved at this commit.
- [`apps/pdf/src/renderer/App.tsx`](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/pdf/src/renderer/App.tsx), retained `genoffice-pdf-app.txt`. Lines280–288 define task categories;5880–5940 group highlight/underline/strikeout with read-only gating;5945 onward separates page/zoom from mutation. README125 explicitly describes in-place text rewriting through PDFium with original fonts;126 distinguishes conversion.
- Mimir owns the shell and Inspector components; upstream already supplies its PDF native writer primitives. Borrow task grouping, separate read-only navigation from writes, explicit cancel/confirmation and contextual tool display. Do not copy the huge upstream App, add unsupported conversion capabilities, or edit vendored source for visual changes.
- An initial guessed `Letxj/GenOffice` URL returned404; it is retained as a failed query only. The authoritative repository above is confirmed from local UPSTREAM metadata and successfully fetched public source.

### Actual public native PDF viewer tool source: Mozilla PDF.js

- Latest public release checked: **v6.4.299**, published **2026-10-03T16:40:51Z**, commit **`d0991a0d53f3bb3a7307e3b83f279c1d117aafb3`**. Release/tag response and source saved.
- [`web/toolbar.js`](https://github.com/mozilla/pdf.js/blob/d0991a0d53f3bb3a7307e3b83f279c1d117aafb3/web/toolbar.js), retained `pdfjs-current-toolbar.txt`:319–372 controls contextual annotation parameters per edit mode and explicit disabled states;407–411 independently bounds page/zoom controls. `web/viewer.html` retains real free-text/highlight/ink/stamp/signature controls and parameter toolbar structure.
- Applicability: context-specific annotation controls, current mode and independent view controls provide a real native-PDF toolbar reference. PDF.js annotation editing is not Mimir's PDFium verified original-text rewrite; retain that distinction. No dependency upgrade is proposed by this UI research.
- `pdfjs-toolbar-source.txt` also retains an earlier v5.6.205 query; use **current** v6.4.299 evidence above for conclusions.

### Related local specs

- `.trellis/spec/office/frontend/editors/conventions.md`: PDF local temporary OCR; PDF redaction-copy/focus; native PDF text and signature/drawing boundaries.
- `.trellis/spec/office/frontend/shell/conventions.md`: visible fields, scroll-body/persistent actions, real dirty and save state.
- `.trellis/spec/office/engine/page-structure.md`: real page identity and structure preservation.

## Caveats / Not Found

- Adobe Acrobat help and online editor requests returned **403**. No Acrobat layout/behavior was verified, and no conclusion relies on inaccessible pages.
- No public source or help page is evidence that a Mimir interaction has passed browser QA; actual component captures/native save tests belong to the main implementation acceptance record.
