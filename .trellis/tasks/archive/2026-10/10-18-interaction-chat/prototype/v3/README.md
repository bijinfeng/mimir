# Chat review v3 · full official Thread

This revision is an HTML planning artifact. Product code and v1/v2 are untouched. The user must approve this concrete revision before implementation.

Open `review.html` directly, or serve the prototype parent folder and visit `/v3/review.html?mode=proposed#scene=CHAT-001.idle`. Both `review.html` and the embedded `thread.review.html` are standalone; no model, backend, parser, persistent store or upload service is called.

## Render and style contract

`thread-app.tsx` renders a direct `<Thread />` inside the real `AssistantRuntimeProvider`. It supplies runtime data and capability adapters only. There are no `components` overrides, custom message/part/data/tool registrations or piecemeal replacement Thread. Official English strings, welcome prompts, layout, actions, tool/reasoning panels and attachment components are retained.

The 35 original vendor files are byte-identical to assistant-ui commit `a587b2838f2d644549d216098d54cfbeedfac522`. `provenance.json` contains upstream URLs, original hashes and dependency closure. Both standalone HTMLs embed the full MIT notice. The iframe uses an opaque sandbox with scripts/forms/downloads/popups allowed; parent IO verifies the concrete event source and channel. The default registry globals and upstream tw-shimmer are compiled by real Tailwind 4.3.3 without selector rewriting, prefixes, token mapping or overrides. An independent iframe isolates that CSS from legacy/Ant Design host CSS. Its document only sets container height; no official font/spacing/color is changed. The dark class uses the official theme.

Mimir-only scope, model, strength, queue retrieval, citations, save, classified failure recovery, Agent/document bridge, screenshots and guards stay in the external host region. Official Refresh is disabled when no safe `onReload` adapter exists. Native Copy/More/Export follows official defaults, including differences from old success-only copy behavior. Feedback/edit/branches/voice/dictation have no invented backend capability.

## Coverage

- The original source baseline remains 71 groups / 379 states with stable IDs and unchanged `current` descriptions.
- The authoritative per-suffix table in `research/full-official-feature-mapping.md` generates all dispositions directly: 71 official, 179 external-host, 7 removed and 122 boundary. Each original state has an explicit disposition in `scenes.json` and `coverage.json`: official-default, external-host, removed or boundary.
- ATT-001 adds 24 separately identified, user-approved attachment-planning states. Total: 72 groups / 403 routes. `attachment-coverage.json` excludes these from the source baseline.
- Seven original trace states remain traceable in current; proposed removes custom mimir.trace entirely. Only real reasoning/tool-call fixture parts reach official components.
- Source audio scenes have no original media payload, so they remain boundary-only. ATT-001.audio-demo is a distinct valid local PCM WAV fixture rendered by official File/AudioPlayer, with no autoplay.
- Mapping counts are not 403 GUI test executions. Parent review records representative browser inspection independently.

Recommended routes: `CHAT-001.idle`, original reasoning/tool/Markdown/queue/failure groups, `ATT-001.policy`, `ready`, `uploading`, `failed`, `send-pending`, `send-failed`, `multiple`, `attachment-only`, `image-only`, `no-vision`, `search-only`, `total-size`, `context-limit`, `ttl`, `history`, `agent-block` and `audio-demo`.

## Attachment proposal and simulation

The genuine official AttachmentAdapter interface is used. Native tiles render preparation spinner, error tooltip, image preview, Remove, send preparation and sent attachments; there is no invented tile Retry or phase/progress label. Recovery uses native Remove and reselect. Host controls are explicitly simulation controls. Local content remains in memory and is destroyed when the document/session is reset; no knowledge-base import occurs.

Proposed limits, still awaiting approval: 4 files / 20 MiB per message, 10 MiB per document, 5 MiB per image, image maximum edge4096 / 16MP. Extraction: 12000 characters per item / 24000 per turn, no silent truncation. Sent files live with the conversation, drafts24h, unbound failed preparations/orphans without an active lease1h, per-conversation quota200 MiB. Formats: text/code, CSV/TSV/JSON/YAML/XML, PDF text layer, modern DOCX/XLSX/PPTX and PNG/JPEG/static WebP; audio/video uploads, OCR and legacy Office are outside this first proposal. Size/count/dimensions and selected model/search-only gates are local simulations. TTL/extraction/session quota states are explicit service boundaries or injected simulation, not claims of working services.

Only attachments: if any document is present, the proposed host instruction is “请概括附件内容”; pure images use “请描述并分析这些图片”. This is explicitly a host-generated instruction, not user-typed text. Generic attachments are proposed for ordinary model Q&A only. Agent/AI-revision mode rejects them before dispatch and preserves the draft; dedicated document screenshots keep their separate source/one-PNG guard. Images require the actually selected model to have vision. Search-only plus attachments is rejected before model dispatch and draft/attachments remain available. The prototype marks model capabilities as simulated.

Formal implementation must preserve canonical server attachment IDs independently of AGUI UI IDs/runConfig. SDK AGUI0.0.68 may replace IDs during round-trip and folds text attachments into user text. The local text fixture is not the formal wire design: use service-owned file/image references. Images need absolute same-origin HTTP(S) URLs because this SDK treats relative images as base64; the server must read canonical IDs rather than arbitrary remote URLs. Auth, cancellation cleanup, retention, image decoding, extraction, safe contexts and history round-trips require real service tests.

## Technical boundaries

The isolated SDK0.15.29/core0.3.29 supports the fixed registry source; product SDK0.15.28 lacks its `responseDeliveryStatus` field. No product dependency was upgraded. `runtime-resolution.json` verifies one existing project React19.3 instance per document; dependencies' React is not bundled.

The local queue adapter demonstrates official Enter-to-enqueue and freezes attachments into the simulated host queue. It does not prove compatibility of product `useAgUiRuntime`, pending submission ordering, Agent pre-enqueue selection/version/run freezing or cached tool continuation. Core0.3.29 routes ordinary running sends to queue.steer by default; this local adapter maps both enqueue and steer to the same Mimir host send IO. While busy, that host appends to its FIFO queue without interrupting a run. This is a disclosed local simulation, not proof of native product steer compatibility. Unsupported reorder/edit/remove operations throw if called and are not exposed by this default Thread. Agent/cached-tool/screenshot/history scenarios do not receive unsafe official Refresh.

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
python3 .trellis/tasks/10-18-interaction-chat/prototype/v3/generate-manifest.py
packages/renderer/node_modules/.bin/tsc -p .trellis/tasks/10-18-interaction-chat/prototype/v3/tsconfig.json
node .trellis/tasks/10-18-interaction-chat/prototype/v3/build.mjs
node .trellis/tasks/10-18-interaction-chat/prototype/v3/check-artifact.mjs
```

`MIMIR_CHAT_V3_DEPS` can change the builder dependency location; the checked-in tsconfig expects the default `/tmp` path. First-party sources use explicit `format.json` and `--ignore-path /dev/null` because repository formatting ignores task assets. Never format vendor originals or generated HTML. The standalone bundle size warning is expected for this review artifact embedding both app and iframe; product delivery strategy is separate.

The two generated HTML files use a scoped Git whitespace attribute: bundled upstream dependency CSS template literals contain whitespace-only lines. Preserve their compiled bytes and frozen hashes; first-party source whitespace checks remain enabled.
