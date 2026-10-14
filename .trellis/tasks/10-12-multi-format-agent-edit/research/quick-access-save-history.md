# Research: Save, Undo, and Redo beside ribbon tabs

- Query: Put Save, Undo, and Redo at the far left of the ribbon tab row, as in the user's fixed GenOffice reference, across six document editors and both hosts.
- Scope: mixed (Mimir code, pinned GenOffice source, existing WeKnora public-source check)
- Date: 2026-10-14

## Findings

### Reference and host boundary

- Pinned GenOffice is `genspark-ai/genoffice@480548fd55f1be3593ee0d8e316a734751d58309` (`packages/office/vendor/UPSTREAM.json:18-21`). Its Slides ribbon puts Save/Undo/Redo before the tabs and separates them (`/tmp/mimir-genoffice-pinned/apps/slides/src/renderer/components/Ribbon.tsx:1793-1848`); PDF does likewise (`apps/pdf/src/renderer/App.tsx:6152-6182`). Markdown and HTML put these controls in the same tab row (`apps/markdown/src/renderer/components/Ribbon.tsx:259-305`; `apps/html/src/renderer/components/Ribbon.tsx:199-245`). The supplied screenshot shows the same arrangement. These references do not make GenOffice's history implementation available inside Mimir.
- WeKnora public site and `Tencent/WeKnora@v0.8.2` source were checked in `research/reference-check.md:8-15` (site HTTP 200 on 2026-10-12; `internal/agent/tools/definitions.go` defines knowledge and Wiki tools). That evidence applies to Agent capability gating; it has no Office quick-access row, undo stack, or original-file save contract. GenOffice is the primary file-editing reference here. No new live network claim is made.
- The five original-file editors render via `packages/renderer/src/components/document/OfficeSourceEditor.tsx:32-41,131-142`; Markdown uses the shared Office `MarkdownEditor`. The six editor components and `EditorShell` are shared between browser and desktop rendering (`.trellis/spec/office/frontend/{editors,shell}/conventions.md`). One shared UI change covers both, but real visual and save/reopen validation is still needed on each host.

### Current structure

- `CompactToolbar` currently owns the tab strip (`packages/office/src/editors/CompactToolbar.tsx:64-88`) and the horizontally scrollable group band (`:89-109`). It has no quick-access slot. All six formats call it; DOCX owns a separate `DocxToolbar` child before the shared component (`DocxEditor.tsx:1290-1300,1895-1932`). The tab strip itself scrolls at narrow width (`compact-toolbar.css:18-25`), so permanent Save/Undo/Redo should be a **non-scrolling leading segment**, while only tabs scroll.
- `EditorShell` places format toolbar in sticky chrome and `toolbarActions` in the bottom status row (`EditorShell.tsx:75-90,140-185`). Existing tests assert that specific bottom location (`shell/EditorShell.test.tsx:480-565`); those assertions must change if Save moves. Keep status text and count in the bottom row. Do not add a second Save button: duplicate entries imply different save semantics and clutter the UI.
- Shared `ToolbarButton` gives accessible label, disabled reason, focus-preserving pointer behavior, and antd small control sizing (`EditorShell.tsx:300-339`). Shared `SaveIcon`, `UndoIcon`, and `RedoIcon` already exist. A quick-access prop on `CompactToolbar` is the smallest layout boundary; existing `ToolbarButton` callbacks/state remain owned by each format. Render quick access before the tab scroll container, then a divider, and preserve keyboard tab navigation (`CompactToolbar.tsx:51-61`).

### Format command inventory

| Format | Current Save | Current Undo / Redo | Safe quick-access implication |
| --- | --- | --- | --- |
| DOCX | `DocxEditor.tsx:1234-1248,1302-1319`: `session.save` then `source.save`; mark saved and clear dirty only for same Agent handle/version. Disabled during load, clean, saving. | Tiptap/ProseMirror undo/redo depths in toolbar state (`:603-604`); buttons invoke `runCommand` (`:1471-1489`). History group currently on Home (`:1905-1907`). | Move these exact controls to fixed leading row; remove duplicate Home history group. Preserve disabled reasons. |
| XLSX | `XlsxEditor.tsx:342-353,773-785`: Agent handle `flush`, `source.save`, `markSaved`, update view and clear dirty; disabled clean/saving. | No general manual Undo/Redo button or stack in editor. Agent `undoRound` restores a version-matched snapshot for one round, then removes it (`agent/xlsx-agent.ts:309-321`); `markSaved` clears rounds (`:330-333`). | Save can move now. General Undo/Redo require a real history engine and transaction boundaries; do not wire quick-access Undo to `undoRound` or call it general history. |
| PPTX | `PptxEditor.tsx:1033-1047,1937-1953`: `session.save`, `source.save`, `session.commit`, clear dirty; disabled clean/saving. | One manual object operation gets `manualUndoRound` (`:1149-1167`); menu can undo only that version-matched round (`:1686-1699`; `agent/pptx-agent.ts:497-503`). No redo or complete edit history. | Save can move. The current one-step object rollback is not a global Undo. A full shared history, including text and slide operations, must precede an enabled global pair. |
| Markdown | `MarkdownEditor.tsx:674-709,841-859`: `saveNow` coalesces in-flight saves and loops through newer versions; autosave also calls it. | Tiptap commands gated by subscribed toolbar state (`:1105-1133`); platform shortcut labels via `shortcut-label.ts`; Agent round rollback separate (`agent/markdown-agent.ts:394-408`). | Move existing Save/Undo/Redo controls from status/Home to leading segment; retain save retry/error state and autosave. |
| HTML | `HtmlEditor.tsx:846-856,1248-1265`: serializes source envelope and saves; only clears dirty if canvas version unchanged. | CodeMirror handle `undo()/redo()` and `canUndo()/canRedo()` reflected by `history` state (`:1025-1056`; `:334`). | Move exact buttons; remove Home duplicate. Keep source/preview history synchronization. |
| PDF | `PdfEditor.tsx:705-797,1778-1789`: saves current bytes/page edits with saved-byte baseline and in-flight mutation protection; disabled clean/saving/content busy. | No user-facing general Undo/Redo in editor. Agent `undoRound` only restores an unchanged version checkpoint (`agent/pdf-agent.ts:424-429`); no redo. | Save can move. Full manual PDF history must be implemented before enabling these icons; deleting a page currently has a destructive confirm, not an undo guarantee. |

### Keyboard and validation

- DOCX and HTML labels hard-code `Ctrl+Z` / `Ctrl+Shift+Z` (`DocxEditor.tsx:1474-1485`; `HtmlEditor.tsx:1033-1050`), whereas Markdown uses platform labels (`MarkdownEditor.tsx:1114-1125`; `shortcut-label.test.ts:4-13`). Tiptap/CodeMirror supply editor-focused history shortcuts; there is no shared document-scoped Ctrl/Cmd+S handler in the six editor files (search on 2026-10-14). Do not advertise a Save shortcut without implementing and testing it. Quick-access clicks must preserve editor focus; `ToolbarButton` already prevents pointer mousedown (`EditorShell.tsx:334-335`).
- `CompactToolbar.test.tsx:45-91` tests tab switching and keyboard arrows; extend it for fixed controls before a scrollable tab strip and focus order at narrow widths. Change shell assertions that specifically demand bottom Save (`EditorShell.test.tsx:480-565`). Format tests should click moved controls and verify same callback/disabled/dirty/save bytes; use DOCX toolbar tests, XLSX and PPTX editor tests, Markdown renderer tests, HTML editor tests, and PDF toolbar/content tests. Save races need attention especially XLSX/PPTX, whose current handlers clear dirty after awaiting save without a final version comparison (`XlsxEditor.tsx:342-353`; `PptxEditor.tsx:1033-1047`); moving controls must not silently worsen this.

### Proposed safe increment

1. Add a `quickAccess` slot to `CompactToolbar` and CSS for a fixed leading icon group + divider beside horizontally scrolling tabs. Keep the command band as is.
2. Lift existing Save callbacks and disabled states into that slot for all six; lift actual Tiptap/CodeMirror Undo/Redo in DOCX, Markdown, HTML. Keep bottom status facts, remove duplicate bottom Save and Home history buttons. For XLSX, PPTX, PDF, show Undo/Redo disabled with honest per-format reason if visual consistency requires three icons, or omit until real history exists; never connect them to Agent round rollback.
3. Treat full XLSX/PPTX/PDF history as separate engine work under this parent task. Add save/undo/redo keyboard handling only with scoped tests; then validate browser and desktop against the same files, including saving/reopening and an edit during an in-flight save.

## Caveats / Not Found

- No browser interaction was performed: the original tab has unsaved changes and previous access was rejected. Screenshot and source are the available visual evidence. No live desktop visual result is claimed.
- The pinned sparse GenOffice copy did not include a DOCX ribbon or the XLSX ribbon component; the cited GenOffice quick-access evidence is Slides/PDF/Markdown/HTML. An exact six-format upstream parity claim needs those sources and actual execution checks.
- No general Mimir history stack for XLSX, PPTX, or PDF was found. Agent `undoRound` is version-bound rollback of one round, not general Ctrl/Cmd+Z with redo.
