# Research: PDF external image tools and separate OCR boundary

- Query: Complete the remaining GenOffice PDF `image_search` / `generate_image` bridge with a concrete route, client handle, service, cancellation, private-reference and byte-history contract; separately identify exact upstream OCR behavior and realistic integrations.
- Scope: mixed; read-only source research and implementation recommendation, no code changes or real provider calls.
- Date: 2026-10-17
- Active task: `.trellis/tasks/10-11-chat-edit-office`

## Findings

### 1. Recommendation and fixed reference

Implement both external image tools through a dedicated PDF client asset hook and authenticated JSON host route. Keep asset preparation separate from native PDF mutation. An image becomes part of the document only when the existing `insert_image` or `replace_image` operation succeeds against current PDF bytes. Merely adding tool names to the model catalog cannot complete this feature.

Main editing reference: GenOffice commit `480548fd55f1be3593ee0d8e316a734751d58309`, matching `packages/office/vendor/UPSTREAM.json:15–18`. PDF source was read from `/tmp/mimir-genoffice-html-git`; its HEAD was checked directly. The other checkout `/tmp/mimir-genoffice-full` lacks `apps/pdf` and was not used to infer PDF behavior.

- Upstream `apps/pdf/src/renderer/ai/tools.ts:643–673` defines `image_search({query,max_results?})` and `generate_image({prompt,aspect_ratio?})`. Search defaults to eight results; generation accepts `1:1|4:3|16:9|9:16|3:4|2:3|3:2|auto`.
- `tools.ts:2746–2783` invokes search/generation dependencies and returns an image URL for later insertion. Empty results and backend failures are distinct.
- `tools.ts:2786–2804` inserts after fetching the chosen image and checking cancellation. Mimir must adapt this to its authenticated host and safe download service; upstream desktop `file://` support is not an appropriate browser/server contract.
- `tools.ts:787` and the PDF skill prefer `replace_image` for replacing image content while preserving its footprint and stacking, rather than delete-and-insert.
- Upstream `packages/ai-provider/src/media-protocols.ts:196–205` maps all landscape OpenAI requests (`16:9`, `4:3`, `3:2`) to `1536x1024` and all portrait requests to `1024x1536`. Exact 16:9 pixels are not an evidenced upstream guarantee.

### 2. Files found and reusable code patterns

| File | Existing responsibility / evidence |
| --- | --- |
| `apps/server/src/services/pdf-agent-catalog.ts:1–21` | Native PDF image/text tools; no external image preparation tools. Catalog currently synchronous. |
| `apps/server/src/services/document-agent-catalog.ts:41` | Async document catalog delegates PDF; can await an async PDF catalog without inventing another capability endpoint. |
| `apps/server/src/services/pptx-agent-catalog.ts:151–225` | Existing readiness gating and unavailable metadata for Brave/image tools; reusable semantics, not a sufficient PDF implementation. |
| `apps/server/src/services/docx-brave-search.ts:24–29,32–68,86–110` | Application-level Brave readiness, bounded query/count validation, ten-second request timeout and normalized image results. Caller cancellation is not yet accepted. |
| `apps/server/src/services/docx-image-generation.ts:9–16,32–97` | Configured image adapter, 60-second timeout, one image, 8 MiB cap, magic-byte validation and usage accounting. No aspect or caller signal options yet. |
| `plugins/provider/src/docx-image.ts:4–31` | Only provider plugin constructs image adapter; supports gpt-image-1, gpt-image-1-mini, gpt-image-2, dall-e-2 and dall-e-3. |
| `apps/server/src/services/pptx-agent-services.ts:44,68–76,219–234` | Process-private generated-reference registry: UUID URL, document binding, twenty-minute TTL, capped at eight entries. Resolver is module private; PDF cannot reuse a PPTX URL by passing it to a public URL downloader. |
| `apps/server/src/services/docx-image-fetch.ts` | Public HTTP(S), DNS/IP pinning, private/reserved-address rejection, bounded redirects/time/8 MiB, MIME and magic checks. Preserve this downloader; no generic fetch of user-supplied URLs. |
| `packages/shared/src/pdf-agent.ts:237–300` | Strict native insert/replace operations and stable image targets. `url` is syntactically a URL; custom scheme still needs an explicit trusted host resolver. |
| `packages/office/src/agent/pdf-image-agent.ts:7–25,44–60,84–89` | Ten native image tools; always reads the current image snapshot first, validates target/version, then calls byte host. Pure search/generation must not be routed here as if it required a page/image number. |
| `apps/server/src/services/pdf-images.ts:250–255,356–418` | Source download/base64 decoding and PNG normalization before PDFium insert/replace; service currently lacks document identity and caller signal. |
| `apps/server/src/services/pdf-image-codec.ts:46–77` | Bounded real PNG/JPEG decode and PNG encode; WebP is not supported by this PDF path. |
| `apps/server/src/routes/conversations.ts:579–630` | Existing PDF image multipart route validates PDF identity, operation and version; computes new bytes without persisting the original. |
| `packages/renderer/src/lib/api.ts:356–383` | Current-file multipart request and caller AbortSignal transport; add neighboring JSON assets method. |
| `packages/renderer/src/components/document/OfficeSourceEditor.tsx` | PDF host prop adapter for the renderer integration. |
| `packages/office/src/editors/PdfEditor.tsx:1370–1435,1616–1645` | Content hook, pending-page/insert guards, abort/version/source checks, one publication of returned bytes. Pure assets need an earlier separate branch. |
| `packages/office/src/agent/pdf-agent.ts:258–305` | Content delegation and version/history advancement only for `changed`; separate pure asset branch can avoid capturing document history. |
| `apps/server/src/services/docx-agent-stream.ts:187–203` | Model streaming currently does not visibly forward request abort in this call; do not rely on server-execute search alone to satisfy end-to-end cancellation. |

### 3. Proposed cross-layer contract and flow

Names below are implementation recommendations, not existing endpoints.

1. Add shared strict `PdfAssetOperation` union: `{op:'image_search',query,max_results?}` or `{op:'generate_image',prompt,aspect_ratio?}`. Trim query/prompt; query 1–500 characters, prompt 1–2000; integer `max_results` 1–10, default 8; ratio enum above, default `auto`. Reject unknown keys. Explicitly map `max_results` to Brave's `maxResults`; do not silently ignore it.
2. Add `POST /api/conversations/pdf-agent/assets` JSON input `{documentId,assetSessionId,expectedVersion,operation}`. Bound JSON before parsing; `assetSessionId` is a UUID per loaded editor source; nonnegative safe `expectedVersion` with increment headroom. Existing `/api` authentication plus actual PDF document/format checks apply. This route does not accept arbitrary files, model keys or provider URLs.
3. Add `api.documents.pdfAssets` and `PdfHostAssets` prop through `OfficeSourceEditor` → `PdfEditor`. Host sends signal and session identity; no PDF upload is needed to search or generate an asset. Response `{version:expectedVersion,data}` has no PDF byte payload. Search result is bounded titles/source URLs/direct `imageUrl`s; generation result is opaque URL plus MIME, dimensions, requested ratio, actual dimensions/ratio and expiry.
4. Register `PDF_EXTERNAL_IMAGE_TOOLS` as dedicated client tools with the existing client-tool output schema. `PdfAgentHandle.execute` calls an `assetTool` hook before the mutation/content branch, checks disposed/signal/version, and returns `changed:false`. No page is required, no PDFium snapshot read, no document checkpoint allocation, no dirty/history/version increment. The hook captures source/session/handle/version and discards stale results. Pending unsaved page or inserted-text edits do not prevent pure asset preparation.
5. Search host maps to `braveImageSearch` using the existing application secret. Generation host uses the existing provider construction and usage-accounted image service with explicit aspect and signal options. Do not duplicate secret storage or instantiate adapters in server code.
6. Generation validates and decodes PNG/JPEG before registering a ref. Existing generation accepts WebP; that is not directly insertable by `decodePdfImage`. Explicitly request supported output where the adapter supports it, and reject an unexpected WebP result accurately before promising an insertable ref. Do not claim implicit WebP conversion exists.
7. User/Agent later invokes existing `insert_image` / `replace_image` using the returned URL. Add optional `assetSessionId` to trusted host transport, not to the native geometry operation. In `/pdf-agent/images`, resolve only exact `mimir-generated://<UUID>` references against authenticated principal + PDF document + current asset session. Replace the operation URL with validated base64 image bytes in a new local object, then call existing native service. Never feed the custom scheme to `fetchDocxImage`, or add it as an allowed network protocol. Ordinary public search-result URLs continue through the hardened downloader.
8. Existing native stable target, geometry, structure guards, readback, client stale checks, version increment and history publication remain the actual insertion/replacement acceptance path. Save remains explicit. No automatic knowledge-base asset entry or original-file write is introduced by preparation.

Catalog should become async and call actual `braveSearchReady()` / `docxImageReady()`. Missing/corrupt/migrating keys produce real unavailable metadata with the shared settings destination. Search readiness and image readiness are independent. Native PDF write prerequisites remain separately gated by PDFium/HarfBuzz and document restrictions; a successful generation is not proof that an unsafe PDF can be rewritten. Prompt must say preparation does not insert, reference expires, use insert/replace afterward, and save after mutation.

### 4. Aspect ratio contract grounded in installed adapter

Installed `@tanstack/ai@0.68.0` declaration `dist/esm/activities/generateImage/index.d.ts:39–87` supports `size`, `timeout`, and request-specific `abortSignal` composed with timeout. Installed `@tanstack/ai-openai@0.22.8` `image/image-provider-options.d.ts:43–47,164–168` supports:

| Model | Recommended PDF mapping |
| --- | --- |
| gpt-image family | square 1024x1024; landscape 1536x1024; portrait 1024x1536; auto uses model `auto`/default. Matches evidenced GenOffice approximation. |
| dall-e-3 | square 1024x1024; landscape 1792x1024; portrait 1024x1792; auto omit size. Valid installed adapter sizes. |
| dall-e-2 | square 1024x1024; auto omit size; explicitly reject nonsquare ratio before provider call with useful model limitation. Do not silently generate square for 16:9. |

Return actual decoded dimensions; tool description/result must state requested ratio is mapped to supported provider size. No cropping, stretching, invented arbitrary-resolution support or new image model/provider is needed. If exact arbitrary ratios become a product requirement, specify image fit/crop semantics separately before implementing them.

To avoid ownership conflict, the implementer should coordinate the optional `{signal,aspectRatio}` expansion of `generateDocxImage` and optional signal expansion of Brave with the DOCX owner, or factor the common mechanism into a neutral service preserving current DOCX/PPTX defaults. Do not change DOCX callers' output/history contract while completing PDF.

### 5. Cancellation and private-reference lifetime

- Compose route/request cancellation with existing Brave 10 s and generation 60 s timeouts. SDK `abortSignal` is supported; use it. DNS/socket/redirect download cancellation also needs propagation rather than a check only after download. `c.req.raw.signal` disconnect behavior must be verified in the server runtime; a browser fetch abort alone does not prove the provider request stopped.
- Check cancellation before config/provider work, after awaited calls, before registry allocation, before ref resolution/native processing, and before returning. Preserve cancellation classification rather than turning it into misleading provider failure or empty search results.
- Asset hook controller belongs to editor source/session; Stop, disposal, document/source/handle/version changes cancel it. A monotonically invalidated session identity prevents A→B→A source changes or edit→Undo from reviving an old response. A busy re-render must not cancel its own operation.
- Use a private process registry with cryptographically random UUIDs, strict reference parsing and no public GET/static route. Bind each entry to authenticated user ID, document ID, `format:'pdf'`, and asset-session UUID; never trust an owner field from input. Resolve to cloned bytes only after authentication and PDF check.
- Reuse twenty-minute expiry as an existing product precedent. Enforce a global byte/entry budget (for example eight 8-MiB entries, at most 64 MiB), purge expired entries before allocation/resolution, and delete on expiry/eviction. Add smaller per-owner/session limits if needed to prevent one caller consuming all entries. Do not log image bytes, secrets or token URLs.
- Refs may be reused within their scope until expiry so insertion failures can be retried; one-shot consumption would make a stale client/native rejection destroy the retry path. A ref prepared by a canceled/old source must never be published to the new client session. Server entries that were already allocated at a late disconnect remain bounded and inaccessible to another session until eviction/expiry; do not promise instantaneous erasure without an explicit revoke mechanism.
- In a multiprocess deployment, a process-local ref may miss on a later request; fail with an explicit expired/unavailable reference and regeneration path. Existing PPTX precedent does not establish distributed persistence. Document this limitation rather than introducing a database/object store unasked.

### 6. Byte/history invariants and meaningful verification

Pure assets: current byte identity, PDF output hash, version, saved baseline, dirty flag, undo/redo and Agent round state remain exactly unchanged. They do not serialize pending edits or mark the document saved. Failed/unconfigured/canceled requests have the same invariant. Insertion/replacement publishes one native mutation, one version increment and one ordinary history step only after current-source validation; generation and insertion are not one artificial compound mutation.

Targeted implementation acceptance:

- Catalog: both independent readiness combinations, invalid config unavailable reason, no advertised tool without its client hook/route; exact schemas and snake-case mapping.
- Route/service: 401, missing/non-PDF document, strict/oversize invalid input, unchanged response version, no storage writes; real fixture search mapping and provider dimensions, canceled SDK request and no ref allocation, no secret/base64 response leakage.
- Registry/resolver: correct scope resolves; wrong user/document/session/format, malformed/custom URL, expiry, FIFO/byte cap and arbitrary token fail; clone isolation; no private URL fetching. Reuse after first rejected native operation remains possible. PNG/JPEG validation occurs before ref allocation.
- Native integration: a generated fixture ref → real PDF insert → independent PDF.js image/readback; replace preserves original footprint/z-order; save/reopen and undo/redo; current unknown-Catalog/AcroForm restrictions are not relaxed. Cancellation/error/stale version returns no writable bytes and leaves original and dirty work intact.
- Handle/component: pure preparation with unsaved page/insert edits succeeds without materialization; no page parameter needed; stop/close/source-switch/manual edit→Undo rejects old results; no beforeState/history entry for reads. Actual insert still obeys its existing unsaved-content constraints.
- Browser: use existing test account only. Confirm missing configuration has a readable disabled reason/settings path; preparation is visually distinct from insertion. If a manual entry is included, use the existing compact Image Inspector (single search/generate source switch, internal scroll, fixed one primary insert action, no extra permanent toolbar row), real image aspect, bounded result grid, pending/error/empty states, Escape and visible trigger focus return at 420/690 px and a wide layout. User already rejected unpolished tool collections. A manual panel must invoke the same asset/native flow.
- Provider mocks verify contracts, not real-service success. Current account has no model provider and user chose code/browser acceptance first; do not claim real generation, real Agent model continuation or Desktop acceptance. Desktop is user-owned for this round.

### 7. Required related specs

Read and preserve: `.trellis/spec/shared/contract/pdf-agent.md` (current byte/auth/history/structure guards), `shared/contract/document-agent.md` (client interrupt/output continuation), `server/backend/api-routes.md`, `server/backend/auth.md`, `server/backend/ai-service-settings.md`, `office/engine/conventions.md`, `office/frontend/editors/conventions.md`, `plugin-provider/backend/index.md`, `project/rules.md`, `project/product.md` and `project/quality.md`.

Current PDF contract §1 explicitly leaves external images and digital certificates for separate verification. This research supports external image implementation only; the implementer must update the current contract to the concrete resulting behavior with code. Role-isolated research does not modify specs or implementation manifests.

### 8. WeKnora required reference and applicability

Fresh checks already performed in this research session:

- Website `https://weknora.weixin.qq.com/`: HTTP 200, 113529 bytes, SHA-256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`.
- Public source release `v0.8.3`, GitHub ref endpoint `https://api.github.com/repos/Tencent/WeKnora/git/ref/tags/v0.8.3`: HTTP 200, commit `3e22822c1d2397be730c458c7539d0eb8c113a24`.
- `https://raw.githubusercontent.com/Tencent/WeKnora/3e22822c1d2397be730c458c7539d0eb8c113a24/internal/agent/tools/definitions.go`: HTTP 200, 13533 bytes, SHA-256 `3aae03dc09c5c5261e71df3e9ee4fba9ad457cf632c817e4ea7ae1312f5bcae0`.
- `definitions.go:14–21` defines knowledge search/read/list tools; `:29–49` makes sandbox file capabilities depend on actual availability and warns against an ineffective checkbox. Applicable to Mimir's truthful tool/config gating. This is not evidence for a PDF content rewrite, generated-reference transport or Office toolbar layout.

GenOffice is the main reference for editing behavior. Office for the web/Google Docs would be relevant to toolbar interaction, Obsidian to page shell/visual style; no fresh inspection of those products was performed for this narrow bridge study. WeKnora's Markdown toolbar must not substitute for an Office toolbar model.

## Appendix A: OCR evidence and product decision

### Exact fixed-upstream behavior

- `apps/pdf/src/main/ocr.ts:1–7,20–65`: system helper bridge, macOS Vision / Windows.Media.Ocr. Compiled helpers are sought under packaged `Resources/ocr` or repository helper directory; absent engine returns `null`, recognition failure an empty array. Output includes recognized text, confidence, normalized bottom-left line boxes and optional per-character boxes.
- `packages/pdf2docx/src/ocr-vision.ts:13–20,41–67,80–99`: Node-only helper spawn, 30-second timeout and 64-MiB output budget, platform and existing-binary checks. No model download. Source helper files are `ocr-helper/vision-ocr.swift` and `win-ocr.cs`. Source availability alone does not prove a compiled helper is shipped by Mimir.
- `apps/pdf/src/renderer/App.tsx:1888–1939`: sequential background processing of scanned pages, starting at current page, stale-result rejection; OCR overlays the session search index. `ocr-layer.tsx:163–185` detects fewer than eight nonspace characters and renders page snapshots around a 2048-px long edge with scale clamp 1.5–4; later transparent text overlay makes recognition selectable.
- `renderer/ai/tools.ts:1216–1218` labels recovered `read_pages` text as OCR with possible recognition errors.
- It does not write a new native text layer into PDF bytes. It does not create a searchable exported PDF or native editable text objects. Geometry must be transformed consistently through page Rotate/CropBox; OCR boxes cannot be passed as verified native PDFium text objects.
- Linux/no helper keeps the previous behavior. Therefore portable Linux server OCR is not established by upstream parity.

### What Mimir actually has

`plugins/parser/src/pdf.ts:23` / `plugins/parser/src/index.ts:137` explicitly exclude OCR. Searches of current app/plugin sources did not identify an OCR route/helper integration. `.trellis/spec/project/product.md:23,173–174` makes OCR an explicit product non-goal. User's broad tool-completion authorization should not silently erase that documented cost/deployment decision.

Existing `apps/server/src/services/docx-media-analysis.ts:105–151` can send bounded image content to a configured chat model with vision enabled (`model.vision.enabled` plus chat readiness). It returns unstructured `{text}` and does not provide proven word/character boxes/confidence or a selectable search overlay. It may cost money and the current test model is unconfigured. Calling this automatically for every scanned page would add new paid behavior; it is not an equivalent drop-in implementation of the system OCR helper.

Realistic choices to surface to the main session, without silently implementing:

| Choice | What can honestly be delivered | Limitation |
| --- | --- | --- |
| Existing configured vision, explicit per-page action | User-triggered text reading with existing provider and clear cost/config gate | No proven OCR geometry/selectable overlay; partial capability, not upstream OCR parity. |
| System helper integration | Compile/package existing macOS/Windows helper, bounded authenticated host, session-only geometry/search overlay | Server OS determines availability; Linux unsupported; deployment/licensing/package review and product non-goal update needed. Use asynchronous cancellable child processes in a web server rather than copy blocking spawnSync. |
| Portable engine/provider | Separate planned OCR capability chosen for server/browser deployment | New dependency/provider/model and operating cost; no such choice has been authorized or established by this research. Do not download a model or add a paid provider by default. |

Prior to implementation, the main session has already surfaced one scope question to the user about local current-PDF copying/search without original/KB writes or a paid model. Do not send a duplicate question or interpret elapsed time as approval. Reference wording if further clarification is necessary: “OCR 当前是产品明确非目标；GenOffice 使用 macOS/Windows 系统 OCR，Linux 不支持。是否改为支持系统 OCR 的会话搜索/选字，或只增加使用现有视觉模型的手动逐页取字？后者会调用已配置模型，也不提供字框选取。” This is a real product/deployment choice; finish the separately authorized external image work while it is pending.

## Appendix B: certificate signature scope correction

At fixed upstream `apps/pdf/src/renderer/App.tsx:1587–1590`, the source explicitly says the app does not verify certificate signatures, and distinguishes visual Ink/Stamp signatures from a digital signature field. Digital-certificate signing/verification must not be reported as a proven missing GenOffice capability on this evidence. It would be a separately justified Office enhancement, not an automatic consequence of “complete all GenOffice tools.” Existing visual-signature work should retain its current explicit/manual semantics.

## Caveats / Not Found

- This file proposes implementation boundaries; no production code, tests, builds, real provider calls, uploads/deletes or Git operations were performed by this research step.
- Line numbers are source-time anchors; other workers are editing related code. Resolve symbols before applying the plan. The renderer adapter is currently `packages/renderer/src/components/document/OfficeSourceEditor.tsx`.
- Do not edit DOCX or XLSX owner files without coordination. The likely shared contention points are `conversations.ts`, `api.ts`, `OfficeSourceEditor`, and optional image/Brave service signatures.
- Configured ≠ healthy provider; report configured availability and runtime failures accurately. No genuine generation/Agent acceptance is possible from mock results alone.
- PDFium safety guards still reject some structured originals. External preparation must not loosen those guards.
- OCR and digital certificates are separate scope findings, not implementation instructions for the external-image slice. Main-session research `research/pdf-text-params-next-plan-20261017.md` identifies a separate PDF text-parameter slice sharing PdfEditor/catalog/routes; schedule those edits sequentially with the external-image slice, rather than parallel ownership of the same files.
