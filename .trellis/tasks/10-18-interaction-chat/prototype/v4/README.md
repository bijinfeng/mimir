# Chat review v4 · official Thread with Composer toolbar

This revision is an HTML planning artifact. Product code and v1/v2/v3 are untouched. The user must approve this concrete revision before implementation.

Open `review.html` directly, or serve the prototype parent folder and visit `/v4/review.html?mode=proposed#scene=CHAT-001.idle`. Both `review.html` and the embedded `thread.review.html` are standalone; no model, backend, parser, persistent store or upload service is called.

## Render and style contract

The user accepted one narrow exception after v3: model, thinking strength and retrieval scope must stay **inside** the input shell. `thread-app.tsx` renders `<Thread />` from `thread-extended.tsx`; the derivative is an exact copy of fixed upstream `thread.aui.tsx` with only one import plus `<ComposerBusinessToolbar />` immediately before the unchanged `<ComposerAction />`. `thread-extension.patch` and `check-artifact.mjs` verify this exact two-line extension. It is **not an entirely unmodified Thread**. Upstream originals remain byte-for-byte archived. v1/v2/v3 are frozen and untouched.

`composer-toolbar.tsx` is the sole local UI composition. It uses original upstream Button (`ghost`, `sm`) and DropdownMenu components, with their default styles. Layout/wrapping/truncation belongs only to newly added wrapper/span nodes; no className or style overrides are passed to the upstream controls. The original input, attachment/add, send/cancel, messages, Markdown/code, reasoning, tool fallback, action bar and errors remain unchanged. The derivative's original classes and content, and full default CSS, are retained. `official.css` only adds Tailwind source scans for the new first-party components. No Mimir colors/tokens, fonts, spacing or CSS selectors override official elements.

Business semantics follow `research/composer-v4-contract.md`: both global chat/reasoning model bindings are readonly, current check follows the model name, and Manage Models crosses the host leave guard. No arbitrary conversation-level model selection and no provider ModelContext registration are invented. Main chat Standard/Deep changes only the existing role boolean; sidebar shows a disabled Standard button, with no Deep menu, and always uses Standard. Proposed model rows add a visible role label so identical bindings can be distinguished; the current column retains its original name-only presentation. Scope means all documents or a single document from the most recent20, with replace/clear/loading/retry/empty states. It is not a knowledge-base multiselect. Agent execution target and permissions remain separately bound to the current canvas.

Host-to-iframe fixture props and iframe-to-host action IO keep one selected state. Toolbar action IO updates the iframe capture context synchronously before posting to the host. A public runtime facade intercepts composer.send and thread.append before SDK submission/async attachment finalization, writes scope/strength/source into runConfig.custom.mimirComposerIntent, and onNew/enqueue/steer consume only this captured message payload. Later selections cannot replace an already-started send snapshot. Queued host rows expose that local snapshot. This proves only prototype behavior, not product AGUI integration, native IME or real server dispatch. Model display is a global binding, not a frozen per-request model ID. The inherited local fixture stores selected document titles as scope identifiers; these are explicitly not real service-owned document IDs. Formal product dispatch must freeze canonical documentId, not title strings.

Other application operations (citations, note save, explicit queue retrieve, failure recovery, Agent guards) stay outside Thread. No custom trace/data/part/tool renderer is registered. Reasoning and tools require real canonical fixture parts.

## Attachment proposal and simulation

The genuine official AttachmentAdapter interface is used. Native tiles render preparation spinner, error tooltip, image preview, Remove, send preparation and sent attachments; there is no invented tile Retry or phase/progress label. Recovery uses native Remove and reselect. Host controls are explicitly simulation controls. Local content remains in memory and is destroyed when the document/session is reset; no knowledge-base import occurs.

Proposed limits, still awaiting approval: 4 files / 20 MiB per message, 10 MiB per document, 5 MiB per image, image maximum edge4096 / 16MP. Extraction: 12000 characters per item / 24000 per turn, no silent truncation. Sent files live with the conversation, drafts24h, unbound failed preparations/orphans without an active lease1h, per-conversation quota200 MiB. Formats: text/code, CSV/TSV/JSON/YAML/XML, PDF text layer, modern DOCX/XLSX/PPTX and PNG/JPEG/static WebP; audio/video uploads, OCR and legacy Office are outside this first proposal. Size/count/dimensions and selected model/search-only gates are local simulations. TTL/extraction/session quota states are explicit service boundaries or injected simulation, not claims of working services.

Only attachments: if any document is present, the proposed host instruction is “请概括附件内容”; pure images use “请描述并分析这些图片”. This is explicitly a host-generated instruction, not user-typed text. Generic attachments are proposed for ordinary model Q&A only. Agent/AI-revision mode rejects them before dispatch and preserves the draft; dedicated document screenshots keep their separate source/one-PNG guard. Images require the actually selected model to have vision. Search-only plus attachments is rejected before model dispatch and draft/attachments remain available. The prototype marks model capabilities as simulated.

Formal implementation must preserve canonical server attachment IDs independently of AGUI UI IDs/runConfig. SDK AGUI0.0.68 may replace IDs during round-trip and folds text attachments into user text. The local text fixture is not the formal wire design: use service-owned file/image references. Images need absolute same-origin HTTP(S) URLs because this SDK treats relative images as base64; the server must read canonical IDs rather than arbitrary remote URLs. Auth, cancellation cleanup, retention, image decoding, extraction, safe contexts and history round-trips require real service tests.

## Technical boundaries

The isolated SDK0.15.29/core0.3.29 supports the fixed registry source; product SDK0.15.28 lacks its `responseDeliveryStatus` field. No product dependency was upgraded. `runtime-resolution.json` verifies one existing project React19.3 instance per document; dependencies' React is not bundled.

The SDK0.15.29 ExternalStoreRuntime with a queue adapter routes even idle sends through enqueue; without that adapter it calls onNew. The three passing automated probes use real ExternalStoreRuntime and official Send/Suggestion primitives: async attachment A→C retains A; explicit enqueue/steer retain independent A/B after C; suggestion append and sidebar false/rejected readiness preserve their contracts. These are runtime probes, not complete Thread product E2E. The local queue adapter demonstrates official Enter-to-enqueue and freezes attachments into the simulated host queue. It does not prove compatibility of product `useAgUiRuntime`, pending submission ordering, Agent pre-enqueue selection/version/run freezing or cached tool continuation. Core0.3.29 routes ordinary running sends to queue.steer by default; this local adapter maps both enqueue and steer to the same Mimir host send IO. While busy, that host appends to its FIFO queue without interrupting a run. This is a disclosed local simulation, not proof of native product steer compatibility. Unsupported reorder/edit/remove operations throw if called and are not exposed by this default Thread. Agent/cached-tool/screenshot/history scenarios do not receive unsafe official Refresh.

The iframe boundary means keyboard events do not bubble to the host. Official keyboard behavior stays unchanged; host dialogs and menus retain their own guard. Actual IME, cross-document Escape/focus, overlay trap, browser200% zoom, system reduced-motion, screen readers, native picker/clipboard, media decode, Electron, real upload/model/Office/API must be validated during implementation. Reviewer font200% and reduced-motion switches affect only host UI; they do not simulate those settings inside the official document.

## Rebuild and checks

Prerequisite: repository dependencies are already installed. Keep the isolated dependency package outside the repository:

```sh
mkdir -p /tmp/mimir-chat-official-v3/deps
cp dependencies/package.json dependencies/package-lock.json /tmp/mimir-chat-official-v3/deps/
npm ci --prefix /tmp/mimir-chat-official-v3/deps --cache /tmp/mimir-chat-official-v3/npm-cache --registry https://registry.npmjs.org --ignore-scripts --no-audit --no-fund
```

From the repository root:

```sh
python3 .trellis/tasks/10-18-interaction-chat/prototype/v4/generate-manifest.py
packages/renderer/node_modules/.bin/tsc -p .trellis/tasks/10-18-interaction-chat/prototype/v4/tsconfig.json
node .trellis/tasks/10-18-interaction-chat/prototype/v4/build.mjs
node .trellis/tasks/10-18-interaction-chat/prototype/v4/check-artifact.mjs
```

`MIMIR_CHAT_V4_DEPS` can change the builder dependency location; the checked-in tsconfig expects the default `/tmp` path. First-party sources use explicit `format.json` and `--ignore-path /dev/null` because repository formatting ignores task assets. Never format vendor originals or generated HTML. The standalone bundle size warning is expected for this review artifact embedding both app and iframe; product delivery strategy is separate.

The two generated HTML files use a scoped Git whitespace attribute: bundled upstream dependency CSS template literals contain whitespace-only lines. Preserve their compiled bytes and frozen hashes; first-party source whitespace checks remain enabled.

## Pre-send snapshot regression probe

From this v4 directory run `packages/chat/node_modules/.bin/vitest` by its repository-absolute path with `run --config vitest.config.ts --reporter=json --outputFile=send-intent-probe-result.json`. The test configuration uses the same isolated SDK/core versions as the prototype. `composer-send-intent.test.tsx` directly exercises the actual public runtime and official send/suggestion primitives; the complete Thread GUI remains a separate manual check.

For browser verification use ATT-001.send-pending: choose scope A and Deep, click official Send, change scope to C and Standard while finalization waits, then use “模拟准备完成”. The external “本地发送快照” output must still show A/Deep. Current visible controls stay C/Standard. For running queue, enqueue independent A and B settings then change to C; retrieve the first entry to inspect the next frozen row. Source IDs are fixture titles only.
