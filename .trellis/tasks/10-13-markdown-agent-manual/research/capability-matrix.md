# Markdown Agent / manual command matrix

Checked 2026-10-13 against `genspark-ai/genoffice@480548fd55f1be3593ee0d8e316a734751d58309`, especially `apps/markdown/src/renderer/{ai/tools.ts,editor/ops.ts,components/Ribbon.tsx,components/TableMenu.tsx,components/SlashMenu.tsx}`. Mimir uses the same renderer package in browser and desktop (`apps/web/src/index.tsx`, `apps/desktop/src/renderer/index.tsx`), but **no physical two-end interaction run is recorded yet**. The source adaptation is `packages/office/src/agent/markdown-ops.ts`; the live handle is `markdown-agent.ts`. The fixed-version code is Apache-2.0; Mimir's adapted file includes provenance.

## Eight model tools

| Upstream tool | Writes? | Mimir entry and execution path | Real verification | Status / failure |
| --- | --- | --- | --- | --- |
| `get_document_context` | no | Catalog → live Tiptap handle `getContext()` | `markdown-agent.test.ts` reads manually changed, unsaved text | Implemented; physical browser/desktop run pending |
| `read_blocks` | no | Catalog → block serializer on same Tiptap doc, 24k pages | Unsaved block read and continuation offset test in `markdown-agent.test.ts` | Implemented; physical browser/desktop run pending |
| `apply_ops` | yes | Catalog → validated `runOps` on same Tiptap doc; 15 rows below | 15 operation tests, stale-version/partial-batch/undo tests | Implemented; selection mapping across multiple structural calls and end-to-end save pending |
| `write_document` | yes | Authenticated Markdown route → TanStack chat model → returned Markdown → live Tiptap `insertContent`/`replaceBlocks` | Server and renderer typecheck; no configured model call | Implemented without upstream visible streaming draft; model/live browser test pending |
| `image_search` | no | Brave search as server-executed model tool when configured | Shared Brave search implementation has existing tests; no live credential test here | Conditional; unavailable when Brave setting absent |
| `insert_image` | yes | Authenticated route reuses DNS-pinned, private-address-blocking `fetchDocxImage`; uploaded through note media path, then image op | Auth/non-note route test; no public image+save readback | Conditional on reachable public image; abort/version checks prevent late canvas insertion |
| `generate_image` | yes | Conditional catalog → generic image provider via existing `generateDocxImage` → note media upload → image op | Typecheck; no configured provider call | Conditional on generic image settings; failure returned as tool failure |
| `read_frontmatter` | no | Server projects indexed note metadata and reads custom YAML fields from the vault; YAML never appears in Tiptap body | Server custom-field save/reopen test, handle metadata test | System identity/time fields remain reserved; physical browser/desktop run pending |

## Fifteen `MdOp`s

All Agent ops execute through `runOps` after `validateOps`. `markdown-agent.test.ts` runs each against Mimir's actual `createExtensions()` and reads `editor.getMarkdown()`; tests do not prove a persisted browser/desktop roundtrip. Manual controls use the same live Tiptap document, but some still call Tiptap commands directly (not `uiOp`), as marked below. Two-end reachability is by shared renderer source only; physical verification is open.

| Upstream op | Manual entry in Mimir | Agent execution | Readback evidence | Gap / failure behavior |
| --- | --- | --- | --- | --- |
| `insertContent` | typing/paste and `/` menu for 11 schema-backed block commands plus image upload | `runOps` parses Markdown into Mimir schema | operation test; slash H1 and `/image` real-dialect tests | Math/Mermaid/WaveDrom remain absent; `/image` physical browser/desktop run pending |
| `replaceBlocks` | select and type/paste | `runOps` | operation test | Manual structured replace menu absent |
| `deleteBlocks` | block menu “删除块” via `uiOp` | `runOps` | operation test | Agent preserves at least one paragraph |
| `replaceText` | ordinary selection editing and new shared `FindReplaceBar` | exact-match `runOps`, keeps marks; manual find adapter writes the same Tiptap document | operation test, cross-mark find/highlight and find-to-save test | Manual search has whole-word/case options; physical two-end run pending |
| `setStyle` | bold/italic/strike/code buttons via existing Tiptap commands | `runOps` mark range | operation test | Existing manual and Agent paths differ in targeting semantics |
| `setLink` | link panel via existing Tiptap commands | `runOps`, URL protocol guard | operation test | Agent allows HTTP(S), mailto and internal `/doc/` only |
| `setBlockType` | paragraph-style menu | `runOps` | operation test | Manual style path predates adapted DSL |
| `toggleList` | bullet/ordered/task buttons | `runOps` | operation test | Existing manual task-list whole-list behavior retained |
| `moveBlocks` | block menu “上移块/下移块” via `uiOp` | `runOps` | operation test | Edge menu items disabled with reasons |
| `duplicateBlocks` | block menu “复制块” via `uiOp` | `runOps` | operation test | — |
| `insertTable` | table grid picker | `runOps` | operation test | Existing manual picker calls Tiptap directly |
| `insertHorizontalRule` | separator button | `runOps` | operation test | Existing manual button calls Tiptap directly |
| `insertImage` | local file upload button | `runOps`; direct op accepts only uploaded Mimir media URL | operation test | Remote URL must use safe `insert_image` tool; actual media readback open |
| `editTable` | table menu (row/column/delete/alignment) | `runOps` | operation test | Column alignment is a Mimir manual extension, outside fixed GenOffice op list |
| `setFrontmatter` | new “属性” YAML panel | standalone metadata update through locked `updateNote`, vault file before DB; client supplies its YAML baseline and stale writes return 409 | custom YAML field survives normal body save/reopen; manual rename conflict and concurrent body save test; handle rollback test | Cannot mix this op with body ops in one batch; physical two-end run pending |

## Manual command classification

GenOffice `Ribbon.tsx` includes save/save as, undo/redo, block style, bold/italic/strike/code, links, bullet/numbered/task lists, table, horizontal rule, image, frontmatter, outline, find, spellcheck and AI presets. `TableMenu.tsx` covers row/column/header/delete; `SlashMenu.tsx` includes block insertion shortcuts. Mimir already has save/autosave status, undo/redo, styles (including H1–H6), inline marks including underline, links/internal-note picker, lists/indent, table grid/row/column/alignment, image upload, separator, code language, spellcheck and outline. This pass adds block move/duplicate/delete, frontmatter, find/replace and `/image` manual paths. The find bar uses the same shared Office shell control as DOCX/HTML/PPTX, and a Markdown ProseMirror decoration keeps searching out of the saved body. The existing first-row header command is exercised through the visible table menu and checks the Tiptap table node. The `/` menu now covers 11 schema-backed block commands and the existing image upload flow; save-as and AI preset interactions need separate comparison. View-only outline/spellcheck and external AI preset actions are classified separately from document writes.

The fixed `editor/slashCommand.ts` contains 14 always-present items and optional image: paragraph, H1–H3, bullet/ordered/task lists, quote, code block, table, horizontal rule, math, Mermaid diagram, WaveDrom waveform, and image. Mimir's `markdown-slash.ts` uses the same `@tiptap/suggestion` lifecycle and calls `uiOp` after deleting `/query` for the first 11 items. It now exposes `/image` only when the current editor schema and upload callback support images; choosing it opens the existing file picker, then deletes the query and inserts the uploaded image into the same Tiptap document. Cancel, upload failure and stale editor content leave the query untouched. `markdown-slash.test.ts` verifies H1 and `markdown-slash-image.test.tsx` covers seven real-dialect upload/abort cases. Math and rendered Mermaid/WaveDrom remain missing. Physical browser/desktop image menu, save/reopen and accessibility checks remain open.

## Cross-reference

The project-required WeKnora check is pinned to `Tencent/WeKnora v0.8.2`: `internal/agent/tools/definitions.go` defines knowledge/Wiki tools such as `search_knowledge`, `read_document`, `wiki_write_page`, `wiki_replace_text`. This informs tool permission boundaries, but not Markdown/Office toolbar operations. Evidence and applicability are recorded in the parent task's `research/reference-check.md`. File editing source of truth here is the fixed GenOffice commit above; Office web and Google Docs remain manual-interaction comparison references.
