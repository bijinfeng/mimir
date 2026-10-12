# Research: document editor toolbar patterns

- Query: How do Office for the web, Google Docs and GenOffice organize file-editing commands at constrained widths, and which pattern fits Mimir's DOCX editor?
- Scope: mixed (official product documentation, pinned GenOffice source, required WeKnora relevance check, current Mimir code)
- Date: 2026-10-12

Reference roles confirmed by the user: **WeKnora for knowledge-base Agent**, **Obsidian for page layout and visual style**, and **Office for the web, Google Docs and GenOffice for file editing**. WeKnora is checked in every research task, but its Markdown editor is not the design authority for a DOCX toolbar.

## Findings

### WeKnora (required applicability check, not the DOCX toolbar model)

- **Version/evidence:** [WeKnora public site](https://weknora.weixin.qq.com/) described itself as v0.8.2 when fetched on 2026-10-12 (HTML `Last-Modified: Thu, 24 Sep 2026 07:18:16 GMT`). Public source was inspected at commit [`e5f9f9deab36898676fe85a9fda6b3e6f00288fa`](https://github.com/Tencent/WeKnora/commit/e5f9f9deab36898676fe85a9fda6b3e6f00288fa), committed 2026-10-12 03:57:53 UTC. The public site is a product site; the interaction evidence below comes from source, not an authenticated live session.
- Its [manual knowledge editor](https://github.com/Tencent/WeKnora/blob/e5f9f9deab36898676fe85a9fda6b3e6f00288fa/frontend/src/components/manual-knowledge-editor.vue#L358-L436) defines four semantic groups: inline formatting, headings, lists, and insertion. Common actions (bold, italic, lists, link) are direct icon buttons; heading levels and less common block inserts are named dropdowns. Source comment explicitly says separate icons for one-per-document block choices cost more toolbar room than they earn (lines 358–361).
- The [toolbar template](https://github.com/Tencent/WeKnora/blob/e5f9f9deab36898676fe85a9fda6b3e6f00288fa/frontend/src/components/manual-knowledge-editor.vue#L1013-L1080) renders groups with dividers; icon buttons have tooltip and `aria-label`, while dropdown triggers show a text label and caret. View mode and shortcut help have a separate right-hand zone.
- The [layout CSS](https://github.com/Tencent/WeKnora/blob/e5f9f9deab36898676fe85a9fda6b3e6f00288fa/frontend/src/components/manual-knowledge-editor.vue#L1282-L1344) uses 6px/8px padding, 28px buttons, one row by default, horizontal overflow for formatting, and wrap only at a narrow fallback. The 620px narrow cutoff and 820px split-view cutoff are computed from actual editor width (lines 90–113). This supports compact grouping and measuring the *editor pane*, relevant to Mimir's three-column layout. The hidden horizontal scrollbar is weaker for command discovery and should not be copied blindly.
- **Applicability limit:** WeKnora's manual editor edits Markdown in a textarea. It does not offer Mimir's full DOCX font, paragraph, revision, and table commands. Its code confirms that width-aware grouping is feasible, but its inventory, four groups and 28px sizing must not drive Mimir's DOCX design. Its more relevant role in this project is knowledge-base Agent behavior.

### Google Docs

- Google's [keyboard-shortcut documentation](https://support.google.com/docs/answer/179738?hl=en), fetched 2026-10-12, documents a menu-based command taxonomy (File, Edit, View, Insert, Format, Tools), a **Tool finder / Search the menus** shortcut (`Alt+/` or `Option+/`), and a **Hide the menus (compact mode)** shortcut (`Ctrl+Shift+F`). It also documents direct shortcuts for common text and paragraph operations. This is documentation evidence, not a live toolbar measurement.
- Implication: command search and shortcuts keep the entire feature set discoverable without forcing every command into the visible toolbar. Mimir could expose its existing commands in a searchable, keyboard-operable “更多” menu; the visible row should retain high-frequency formatting and the current state.

### Microsoft Word for the web

- Microsoft's [Show or hide the ribbon in Office](https://support.microsoft.com/en-us/office/foundations-experiences/show-or-hide-the-ribbon-in-office), fetched 2026-10-12, explicitly documents web **Classic Ribbon** and **Single Line Ribbon**. The latter is described as a more compact version that takes less space. It also documents “Show tabs only,” automatic reveal, and keyboard routes to the ribbon. This is official documentation rather than a measured Word web session.
- Implication: the single-line presentation is a first-class density mode even for a full word processor. Mimir should avoid wrapping its full command inventory into multiple tall rows; preserve access through named menus/overflow and keyboard paths.

### GenOffice DOCX editor

- The pinned source is [`genspark-ai/genoffice@480548fd55f1be3593ee0d8e316a734751d58309`](https://github.com/genspark-ai/genoffice/tree/480548fd55f1be3593ee0d8e316a734751d58309). Its DOCX [Ribbon tab inventory](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/docs/src/renderer/components/Ribbon.tsx#L316-L400) includes Home, Insert, Layout, References, Review and View, plus contextual table, picture and shape tabs. [ReviewTab](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/apps/docs/src/renderer/components/ribbon-tabs.tsx#L670-L1052) subdivides review actions into labeled groups, rather than placing every action in one undifferentiated row.
- Its shared [ribbon-collapse behavior](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/packages/ui/src/ribbon-collapse.tsx#L1-L12) retains the tab row while hiding the command band; choosing a tab temporarily reveals the band above the document. The [hook](https://github.com/genspark-ai/genoffice/blob/480548fd55f1be3593ee0d8e316a734751d58309/packages/ui/src/ribbon-collapse.tsx#L109-L163) persists collapsed state and supports tab press, double-click and keyboard toggle. This is pinned source evidence, not a live measurement of its layout.
- Implication: task categories and contextual table/review commands are appropriate for the full DOCX set. Mimir's center pane is narrower than a standalone office window, so copying GenOffice's full multi-row ribbon would recreate the current height problem. A compact command row with named task menus and reliable overflow takes the command taxonomy from GenOffice and the density mode from Word for the web; exact controls and thresholds require Mimir browser validation.

### Current Mimir and actionable recommendations

- [Design contract §8](../../../spec/project/design.md) already says group the top toolbar by format, paragraph, insert, and find, put low-frequency commands in overflow, and keep save in the footer. [Product contract](../../../spec/project/product.md) requires the DOCX toolset and the common document header. The visible screenshot shows the current DOCX bar occupying three command rows below the 48px document header.
- [Mimir shell CSS](../../../../packages/office/src/shell/shell.css#L160-L230) gives `.mimir-editor__tools` `flex-wrap: wrap`, so the full inventory spills into extra rows; at widths ≤880px it caps height and enables vertical scrolling. [DOCX toolbar](../../../../packages/office/src/editors/DocxEditor.tsx#L1472-L1884) places Undo/Redo, paragraph style, two font controls, size, many character commands, paragraph controls, lists, table, insert, paragraph movement, find, revision, and spelling controls in that flow. Group captions are visually rendered below each group by [shell CSS](../../../../packages/office/src/shell/shell.css#L601-L625), increasing density and producing repeated small labels.
- **Recommended hierarchy:** follow Office/GenOffice command categories. Keep one stable, compact visible row for paragraph style, size and bold/italic/underline; expand font, alignment, list, undo/redo and find when pane width allows. Put advanced character effects, color/shading, bidirectional text, exact line spacing/indent controls, paragraph movement, revision, spellcheck and table detail actions in named task menus. Keep an explicit “更多” trigger for overflow; preserve every existing command and state, with no dead items.
- **Recommended layout behavior:** collapse whole low-priority groups as the editor pane narrows, retain a stable toolbar height, and surface overflow with visible text labels. Do not use silent horizontal scrolling or a vertical command scroller as the primary narrow-width solution. Account for Mimir's center-pane width rather than viewport width alone. The 48px shared document header and bottom save/status line remain separate.
- **Discoverability and accessibility:** icon-only commands need meaningful tooltip, accessible name, active/disabled state, and shortcut only when implemented. Give named menu triggers text plus caret; group menus by user task. Avoid showing a label under every icon cluster if it forces additional height. A searchable command menu is a possible second pass, not a prerequisite for the compact layout.

## Files found

| Path | Description |
| --- | --- |
| `packages/office/src/editors/DocxEditor.tsx` | DOCX toolbar command inventory and grouping, especially lines 1398–1884. |
| `packages/office/src/shell/EditorShell.tsx` | Shared editor toolbar primitives and shell slots; lines 75–183. |
| `packages/office/src/shell/shell.css` | Current wrap, narrow-width scroll, and visible group captions; lines 160–230 and 601–625. |
| `.trellis/spec/project/design.md` | Present design contract for toolbar/header/status, lines 166–168. |
| `.trellis/spec/project/product.md` | DOCX capability and save-status product requirements, lines 415, 437, 486. |
| `.trellis/spec/office/frontend/shell/conventions.md` | Shared Office shell conventions. |
| `.trellis/spec/office/frontend/shell/pitfalls.md` | Known overflow, sticky, keyboard, and accessibility pitfalls. |

## Caveats / Not Found

- Google Docs and Word web editor surfaces were not authenticated or measured live; their findings above come from official help pages. Exact pixel heights and current overflow behavior were therefore not asserted.
- GenOffice interaction findings come from pinned source, not a running GenOffice editor. Its full ribbon structure is evidence for categories and contextual commands, not evidence that Mimir should copy its height or pixels.
- WeKnora's public landing page is not its authenticated editor UI. The source at the pinned commit is concrete interaction evidence, but a deployed instance may differ.
- This research does not prescribe the exact Mimir breakpoint or final control order. Those require a browser check at the actual center-pane widths (including the AI sidebar open) and keyboard/tooltip validation after implementation.
