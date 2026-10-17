# PPTX external images and multi-slide clipboard — 2026-10-17

## Evidence and reference choice

- GenOffice checkout `/tmp/mimir-genoffice-html-git`, fixed HEAD `480548fd55f1be3593ee0d8e316a734751d58309`.
- `apps/slides/src/renderer/clipboard-actions.ts:64–128`: actual external image bytes become native pictures, natural aspect ratio, centered unless a drop point is given; ordered multi-slide copy captures bundles and optional PNGs. `:170–200` routes explicit paste by actual native clipboard type.
- `apps/slides/src/main/slides-main.ts:2539–2608`: ordered bundles, theme/source-format paste, one journal transaction. Electron clipboard marker is real OS data. Browser sessionStorage references are not equivalent to OS payloads.
- Vendored fixed `pptx-engine/src/slide-transfer.ts:115–138` skips notes and recursively collects linked slides as dependency parts; `:317–351` materializes each independent bundle without joint selected-slide remapping. Native `index.ts:1921–1977` preserves layout/master/theme chain and media but alone cannot preserve notes/backlinks/batch links.
- WeKnora public site `https://weknora.weixin.qq.com/` HTTP200 on 2026-10-17 (`/tmp/mimir-pptx-external-weknora-site.html`). Public source v0.8.3, commit `3e22822c1d2397be730c458c7539d0eb8c113a24`, `internal/agent/tools/definitions.go:14–21,35–49,69–75` (HTTP200 verified earlier this session, `/tmp/mimir-pdf-canvas-weknora-definitions.go`) defines KB retrieval and capability-gated sandbox/wiki tools. It supports keeping actual capability and permissions honest; it provides no Office clipboard interaction model. GenOffice is the primary semantics reference.

## Implementation decision

- Browser paste command explicitly reads `navigator.clipboard.read()` and accepts actual PNG/JPEG blobs; native paste event consumes image file bytes. Never read OS clipboard at mount/focus; never treat a stored internal ref as system clipboard. Copy/cut shortcuts use Mimir's documented internal clipboard, with native text editing excluded.
- External file drop accepts one PNG/JPEG; existing authenticated, bounded `hostAsset` picture path writes one native picture and one history entry. Preserve aspect ratio and pointer drop location; stale document/page/version and cancellation reject results. Subtle stage affordance, no persistent empty-state overlay.
- Add bounded 1–40 slide batch schema and server cache payload, preserving source order, media, source-format chains, and single commit/version/history. Single-slide schema remains compatible.
- Private slide graph adapter augments native bundles for notes and same-batch links. Notes back-links and slide links are resolved only after all destination slide paths exist. Conflicting notes master chains, comments, zoom, links outside the selected batch and presentation-level membership graphs must be rejected before cut; never silently drop structures. Incoming links to a cut slide must also be rejected.
- Inspector is existing 320px panel with scrolling body/fixed action and actual page multiselect; all group-member element clipboard safeguards remain unchanged.

## Verification plan

Real native fixtures for ordered media+notes+batch-link copy/cut/paste, two saves, history, graph rejection, stale/cancel and source visibility; UI tests for real blob read, paste/drop/shortcuts, rich text exclusion and late responses. Root owns unified build and browser 1280/420 acceptance. No model test without configured model; Desktop remains user-tested.

## Implementation and frozen handoff

- Actual PNG/JPEG bytes are read only by explicit system paste or native paste/drop events. Blob size/signature and host decoding are checked. Context changes and cancellation reject late results. Native picture IDs remain selectable; natural image size uses 96dpi and an 80% page fit, with pointer drop centering.
- Canvas and actual sorter selection support copy/cut shortcuts; text editing is excluded. Successful internal copy writes an actual OS text marker when permitted; a denied write retains a visibly identified internal fallback. Inspector offers explicit system-image paste and ordered 1–40 slide selection.
- One batch paste imports native media/layout/theme resources, notes, and same-batch page links in one save/history entry. Private graph adaptation resolves links against actual destination paths and reuses semantically identical notes-master graphs on repeated paste.
- Atomic rejection boundaries: sections/custom shows; comments, Zoom/custom-show jumps, external media, 3D placeholders; links outside the selected batch or unsupported dependency-part links; incoming retained-slide links before cut; page-size mismatch; incompatible notes-master graphs. Deep-group element clipboard restrictions remain in force. External text-to-shape, editable OS OOXML payloads, slide-to-image paste and Electron clipboard APIs are outside this implementation.
- Final focused Office run: `pnpm --filter @mimir/office exec vitest run src/editors/PptxClipboardBridge.test.tsx src/editors/PptxClipboardControls.test.tsx src/editors/PptxEditor.selection-clipboard.test.tsx src/pptx-selection-clipboard.test.ts` — 4 files, 40/40 tests passed.
- Final focused host run: `pnpm --filter @mimir/server exec vitest run src/test/pptx-slides-clipboard-host.test.ts src/test/pptx-selection-clipboard-host.test.ts` — 2 files, 12/12 tests passed. Fixtures verify media bytes, native notes/backlinks, same-batch links, source order, source formatting and repeated paste. Editor/host integration verifies exact ZIP entries across save, undo/save and redo/save.
- Office/Server/Shared type checks, targeted oxlint, 13-file oxfmt, Antd control lint, `pnpm lint:styles` and `git diff --check` passed at freeze. No worker build or browser claim; root owns combined verification. Shared schema/server changes require the running server to reload.
