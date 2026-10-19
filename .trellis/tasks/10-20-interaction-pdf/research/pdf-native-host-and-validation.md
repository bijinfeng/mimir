# Research: PDF native host and browser validation recipes

- Query: Identify real PDF service methods that can drive an isolated true-component browser demo without replacing the rendering or writer with mocks.
- Scope: internal
- Date: 2026-10-20

## Findings

### Actual app boundary

`packages/renderer/src/components/document/OfficeSourceEditor.tsx:190` renders the own `PdfEditor`; lines193–216 supply `api.documents` adapters for text/inspect/blocks/assets/images/local/forms/annotations/markup. This is the actual application path. The render engine is `packages/office/src/editors/pdf-render.ts`: PDF.js draws real canvas and extracts text; PDF-lib reads page geometry; server-side PDFium/HarfBuzz and guarded native services perform writes.

The editor's `io.load/save` owns original input and explicit save; tool hosts return working bytes and version only. A gallery may use an isolated fixture-backed `io` implementation plus actual service routes/functions, but must label simulated save acknowledgement/failure rather than claiming a real database/file save. For product proof, use the actual authenticated app and download/readback or a verified isolated file sink.

### Native methods and version rules

| PdfEditor adapter | Real server method | Result/version boundary |
| --- | --- | --- |
| hostLocal | `apps/server/src/services/pdf-local.ts:495` `applyPdfLocalOperation(bytes, operation, assetBytes?, signal?)` | Returns optional bytes/info/outputs. Host route529–588 returns `expectedVersion + (bytes ? 1 : 0)`. Read/export/copy-output retain version. |
| hostBlocks | `apps/server/src/services/pdf-text-blocks.ts:214` `applyPdfTextBlockOperation(bytes, operation, signal?)` (re-exported by pdf-agent-host) | Returns blocks, optional target/bytes; version advances only if bytes returned. Read/inspect retain exact version. |
| hostForms | `apps/server/src/services/pdf-preserving-forms.ts:8` `applyPreservingPdfFormOperation(bytes, operation, sha256?)` | Use preserving wrapper, not low-level form writer. Real route826–879 retains version when no bytes and advances once when written. |
| hostAnnotations | `apps/server/src/services/pdf-annotations.ts:89` `applyPdfAnnotationOperation(bytes, operation, expectedSha256?, author?)` | Read returns input bytes at low level, but real route918–931 deliberately omits them and retains version; writes return bytes/version+1. Match that adapter behavior. |
| hostImages | `apps/server/src/services/pdf-images.ts:359` `applyPdfImageOperation(bytes, operation, signal?)` | Read returns images only. Real route808–816 advances only if bytes. External URL fetching uses actual existing image host safeguards. |
| hostInspect | `apps/server/src/services/pdf-agent-host.ts:57` `inspectPdfTextTarget(bytes, probe)` | Exact current original text identity/geometry verified independently; no write/version advance. |
| hostApply kind insert/edit | `pdf-agent-host.ts:374` `applyPdfTextInserts`; `:151` `applyPdfVerifiedTextEdit` / `:351` `applyPdfTextEdits` as actual route requires | Keep schema, target identity and readback gates; accepted write version+1. Do not route the layout branch through text primitives. |
| hostMarkup | `pdf-agent-host.ts:195` `applyPdfMarkupWithCount(bytes, input)` | Returns real bytes/count, route964–976 advances once. |

The simplest supported native demo for this polish is **hostLocal**, because it supports reading properties, actual imports, page operations, metadata, outlines, watermarks, headers/footers, native drawings and visual signatures, plus independent outputs. Existing `PdfEditor.local.test.tsx:80` shows the correct adapter. Sources normalize friendly tool strings through `pdfLocalToolOperation` (`packages/office/src/agent/pdf-local-agent.ts`) before calling the host: e.g. `get_document_properties` becomes `{op:'read'}`. Do not hand a friendly tool string directly to the native operation schema.

`initializePdfAgentHost()` (`pdf-agent-host.ts:330`) resolves/configures actual WASM asset paths. Server modules and vendored PDF native main code depend on Node APIs and **must stay in the Node helper/server bundle**, never browser imports. Browser PDF.js worker must remain `?worker&url`; copy CMaps, standard fonts and PDF WASM assets using the actual preset/static asset machinery (`pdfjs-assets.ts`). No external CDN fallback.

### Priority GUI scenarios using real fixtures

1. At390×400, page tab → collapsed 文档工具 → 页面、绘图与文档属性. Verify collapsed menu closes, title/close accessible, body can reach extraction/import/grid/N-up/crop and actions without document-wide horizontal overflow. Repeat keyboard open/Tab/Escape and dark690×600.
2. Native import: choose actual two-page source PDF through chooser; verify current page and page count; save/reopen bytes independently through PDF.js/PDF-lib; same history/dirty; fail save then retry without losing imported pages.
3. Watermark/header/footer task: long watermark and six header/footer fields; crop/rotation not mistaken for PDF text position; native apply/save/reopen metadata or stream text. Clear watermark should remove only known own watermark.
4. Properties/bookmark task: long metadata and multiline outline; invalid outline retains draft and useful error; successful metadata/outline is independently readable after save; unchanged/unrelated catalog features preserved or rejected by existing guards.
5. Drawing: canvas draft and numeric precision parameters are distinct. Choose existing drawing/shape/rotation while native write deferred: select keyboard and mouse must stay disabled; cancel remains available according to current lifecycle. After write, undo/redo and native save/reopen retain actual kind/geometry.
6. Annotations: simple clean PDF without AcroForm/outline etc for allowed content writes; add note, choose root/reply/markup; long thread/errors in390×400; selection and all mutation fields correctly busy. Verify delete confirmation Escape only closes confirmation, and Inspector close returns visible live group trigger.
7. Forms: separate real AcroForm fixture with text, checkbox, choice, readonly and unsupported signature; preserve field identity and original form properties via actual preserving wrapper. The same fixture may deliberately be ineligible for generic content-stream writes; do not disable the safety guards to make it pass.
8. Blocks: simple text fixture with actual PDFium-verified editable blocks; inspect, move, rewrite, partial replacement with repeated match; expand format details at390×400; reset/Enter/Escape/native apply and source invalidation. Do not build a fixture with fabricated editable target props and call it native accepted.
9. Signature: each source mode plus ready/placing/cancel; short-height visible prepare action; central place scroll behavior and actual geometric save/reopen. The existing separate shared global save is not replaced with a panel-level fake save.
10. OCR, redaction copy and page-image export already have specialized persistent action regions. Exercise actual local assets/canvas/output, running/stop/cancel and stale source boundaries, and record any scenario not run. Temporary OCR and redaction outputs must not mutate original bytes/dirty/history.

### Fixture/safety boundaries

`assertSafeToRewrite` (`pdf-agent-host.ts:335`) rejects encryption and unverified catalog structures for content-stream rewriting. `applyPdfLocalOperation` (`pdf-local.ts:517` onward) has its own bounded structure-preservation checks and rejects tagged PDF page-tree operations. Keep separate native fixtures for content editing vs AcroForm/metadata/outline rather than interpreting the expected rejection as a UI failure. No-op exports and read-only navigation are useful negative assertions.

The existing happy-dom suites mock rendering in several places; they verify contracts and source identity but do not prove visible canvas pixels, panel layout or native OS behavior. Distinguish those results from browser interactions in the final archive.

Related specs: office/frontend/editors PDF source/save/OCR/Inspector contracts; office/engine/page-structure; shared PDF contracts; server PDF guarded host contracts. External evidence and applicability are in `pdf-external-references.md`.

## Caveats / Not Found

- No helper server was started, product code changed, or GUI test executed by this research agent.
- External image generation/search requires actual configured providers. A local fixture demo may explicitly reject these without claiming them accepted.
- Native save/reopen assertions must inspect returned real bytes rather than only a rendered toast or page-count state.
