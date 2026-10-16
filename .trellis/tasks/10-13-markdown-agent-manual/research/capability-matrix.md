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
| `insertContent` | typing/paste and `/` menu for 14 schema/renderer-backed block commands plus image upload; toolbar inserts rendered math, Mermaid and WaveDrom blocks | `runOps` parses Markdown into Mimir schema | operation test; slash H1/image/math/diagram/waveform; toolbar advanced-block Agent edit + save/reopen; real browser Mermaid/WaveDrom save/reopen | Desktop interaction remains pending; invalid diagrams retain their source and show the actual drawing error |
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

GenOffice `Ribbon.tsx` includes save/save as, undo/redo, block style, bold/italic/strike/code, links, bullet/numbered/task lists, table, horizontal rule, image, frontmatter, outline, find, spellcheck and AI presets. `TableMenu.tsx` covers row/column/header/delete; `SlashMenu.tsx` includes block insertion shortcuts. Mimir has save/autosave status, undo/redo, styles (including H1–H6), inline marks including underline, links/internal-note picker, lists/indent, table grid/row/column/alignment, image upload, separator, code language, spellcheck and outline. Additions include block move/duplicate/delete, frontmatter, find/replace, `/image`, math and both diagram types. The find bar uses the same shared Office shell control as DOCX/HTML/PPTX, and a Markdown ProseMirror decoration keeps searching out of the saved body. The existing first-row header command is exercised through the visible table menu and checks the Tiptap table node. View-only outline/spellcheck and external AI preset actions are classified separately from document writes.

The fixed `editor/slashCommand.ts` contains 14 always-present items and optional image: paragraph, H1–H3, bullet/ordered/task lists, quote, code block, table, horizontal rule, math, Mermaid diagram, WaveDrom waveform, and image. Mimir's `markdown-slash.ts` uses the same `@tiptap/suggestion` lifecycle and calls `uiOp` after deleting `/query`. `/math` inserts a distinct `mathBlock` node using `$$` fences; both the live editor and `MarkdownBody` use the host's `createExtensions()` parser, serializer, KaTeX renderer and bundled font assets. Invalid formulas display their source text. The toolbar uses the same `insertContent` operation; `math-block.test.ts`, `markdown-save.test.tsx` and `MarkdownBody.test.tsx` verify entry, editing, save/reopen and read-only rendering. Web and desktop production builds include KaTeX fonts. `/image` appears only when the schema and upload callback support images; cancel, upload failure and stale editor content leave the query untouched (`markdown-slash-image.test.tsx`).

### 2026-10-16 continued implementation

- Mermaid and WaveDrom retain the fixed upstream's `codeBlock` + `language` fenced Markdown semantics. `DiagramCodeBlock` preserves lowlight for ordinary code and adds lazy diagram preview, editable ProseMirror source, explicit drawing errors and stale-render/disposal guards. `diagram-render.ts` uses Mermaid strict mode and JSON5 parsing without evaluation; SVG sanitization removes active content and external references, keeps required fragment-only `<use>` references, and displays the result as an isolated image so WaveDrom skin styles cannot affect the application. Read-only `MarkdownBody` uses the same extension and hides source only after successful drawing. `diagram-block.test.ts` exercises actual WaveDrom drawing, actual Mermaid generation with jsdom SVG text-measurement stubs, sanitizer behavior, slash insertion, edits, undo and reopen. `MarkdownBody.test.tsx` verifies read-only preview and recoverable errors. `markdown-save.test.tsx` verifies toolbar → Agent edit → shared dirty/save → reopened fenced node. Physical desktop interaction is still open.
- The 笔记 tab exports the current live Markdown body plus current saved YAML properties (including custom fields) as a `.md` download. This is the browser/desktop renderer's counterpart to upstream file-system save-as; it does not switch the vault note's path. Export snapshots the body on click and preserves later edits and dirty state; failures are visible in the action status. `markdown-export.test.ts` verifies downloaded bytes, safe filename and URL cleanup; `markdown-save.test.tsx` verifies the live unsaved snapshot and concurrent editing.
- The 审阅 tab has 问 AI：总结全文 / 润色 / 整理排版. Like upstream, these open and prefill the existing AI composer; they do not claim a model result. Summarize targets the whole note, polish/tidy target the current selection when present and the whole note otherwise. The same live Agent handle supplies unsaved context when the user sends. Existing selection-question quoting remains unchanged. `markdown-save.test.tsx` verifies prompt scope and that pressing presets does not modify/save the body. A configured-model execution and desktop interaction remain open.

Browser evidence reported by the coordinating session using `admin@example.com`: in note `Yq_oK_fOnCdkPDRs` (工具栏验收样本-20261016), inserted Mermaid, changed `Start` to `开始验收` in the editable source and saw the diagram update; inserted WaveDrom and saw actual clock/data/req waveforms and head/body/tail labels. After autosave completed and the page refreshed, both diagrams rendered again (natural sizes 495×124 and 320×90). With 问 AI open, the approximately 586px editor column displayed both diagrams and both insertion commands. Screenshot: `/tmp/mimir-markdown-diagrams-reopened.jpg`. No chat model was configured, so this evidence does not claim actual model execution. Desktop, physical image/math interaction and full accessibility checks remain open. Export/AI-preset browser evidence is tracked separately when available.

Additional browser evidence: 笔记 → 导出 Markdown downloaded `/Users/admin/Downloads/工具栏验收样本-20261016.md`; an independent Python read confirmed YAML title/tags/status/folder, the Chinese Mermaid source and both `mermaid`/`wavedrom` fences. 审阅 → 问 AI：总结全文 opened the existing sidebar with `总结这篇文档的主要内容和要点` in the composer, without changing note content. The sidebar explicitly showed that the chat model was unconfigured; no model request was sent. Browser interaction did not establish an unsaved-export race (covered by the component test) or custom-YAML UI editing.

## Cross-reference

The original project-required WeKnora check was pinned to `Tencent/WeKnora v0.8.2` in the parent task's `research/reference-check.md`. The 2026-10-16 toolbar audit checked its public site and source again at `v0.8.3`, commit `3e22822c1d2397be730c458c7539d0eb8c113a24`; `internal/agent/tools/definitions.go` defines knowledge/Wiki tools such as `search_knowledge`, `read_document`, `wiki_write_page`, `wiki_replace_text`. This informs tool permission boundaries, but not Markdown/Office toolbar operations. Evidence and applicability are recorded in `10-16-genoffice-editor-capability-audit/research/toolbar-assessment.md`. File editing source of truth here is the fixed GenOffice commit above; Office web and Google Docs remain manual-interaction comparison references.


## 2026-10-16 真实增量草稿补全

`write_document`改走NDJSON增量传输，服务端要求真实`RUN_FINISHED`再发done；不把传输EOF当成功。MarkdownEditor在正文外显示临时草稿，完成后走原runOps/版本守卫；停止或失败后可保留部分/丢弃，部分结果明确complete:false，切文档/外部取消解除挂起选择。预览不进入自动保存，整轮回退恢复原正文与dirty基线。保持当前方言、保存及原有块工具。

Web真实组件受控流夹具（非真实模型、未写知识库）证明逐段内容先显示、正文仍保留；停止后两个动作可达，420px无预览水平溢出，Enter可保留部分内容并变为正式标题/正文。宽/窄截图位于本会话可视化目录markdown-writing-wide.jpg与markdown-writing-narrow.jpg；该夹具与临时标签将清理。后续发现键盘保留后焦点落BODY，已补显式部分应用回正文、停止按钮到部分选择及离开预览的焦点恢复，修复后复验另记。未配置聊天模型，不将受控生成器写为真实模型或桌面验收。

焦点修复复验：真实浏览器420px夹具中以Enter触发“停止笔记写作”，activeElement为“丢弃笔记草稿”；再Enter触发“保留部分内容”，正文变为结构化标题/段落且activeElement为contenteditable DIV。没有把焦点留在BODY。
