# DOCX floating table — browser preflight finding

2026-10-17 root, localhost:5173 development build; frozen table controls, other modules still implementing. This is **not** final production acceptance.

- Native fixture `/tmp/mimir-docx-table-position-20261017.docx`, document `__br7BqHopVpfAsa`, uploaded in KY635Y. First section narrower than second, first table initially inline.
- Actual1280×800: select “嵌入表格1-1” → 表格 → 表格设计与属性 → “文字在右侧（表格靠左）” → Apply. Paragraphs really wrap beside the table, but the table is shifted **120px left** relative to this section's intended margin.
- DOM evidence: ProseMirror width864/left148 is centered for maximum section width. First section paragraphs carry `--col-w:624px; --page-cx:120px` and their content begins268px. Newly floating table is no longer `doc-col-block`; it has `doc-table-float-left`, left148px and marginLeft0, missing section centering offset120px. It is not sufficient to prove XML X=0 while the visible table is displaced.
- Screenshot `docx-table-position-left-preflight-1280.jpg` actually viewed. This slice's browser acceptance remains failed/pending. Owner notified to fix after current DV work freezes; no concurrent table edits requested.
- Actual420×500 Inspector x100/top141/width320/bottom473.359; primary x306.3125/y437.359/101.688×24/bottom461.359. Internal body clientHeight206/scrollHeight1361. Screenshot `docx-table-position-preflight-420.jpg`. Footer/layout passes this preflight; actual positioning does not.
- Undo restored first table's `doc-col-block` inline class. Dirty badge remains until reload per existing PM dirty lifecycle; no Save was performed. Reload restored library source. Read-only authenticated fetch `/tmp/mimir-docx-table-preflight-original-20261017.docx` is whole-file cmp exact3479-byte fixture: library not modified.

Required correction: section-aware floating rendering/positioning in Mimir-owned adapter/DOM decoration, preserving raw native X/Y, anchors, four independent text distances and native saved shape. Do not modify vendor. Recheck left/right/numeric position in narrow/wide sections, margin/page/text anchors and current native keyword originals, suppressed tall table, at1280 and420. Need actual native save/history + final production build acceptance after correction. Independent unit26/26 does not cover this DOM regression.
# 2026-10-17 修复预检增量（仍待最终生产/原生保存）

Root dev5173、1280×800，同原件 `__br7BqHopVpfAsa`。实际选择cell名称为“嵌入表格 1-1”（含空格），表格→表格设计与属性→文字环绕。

- 左浮动 Apply：table x268/width241/right509，后续paragraph x268/width624/right892；table恢复 `doc-col-block`、`--page-cx:120px`。原120px偏移已消除，实际截图已看文字在右绕流。
- 再选右浮动 Apply：table x651/width241/right892，paragraph x268/width624/right892，computed marginRight240；实际截图已看文字在左绕流，右边缘与本节内容一致。
- 图目录 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51`：`docx-table-position-left-fixed-preflight-1280.jpg` / `docx-table-position-right-fixed-preflight-1280.jpg`，均已实际查看。
- 关闭Inspector、实际Undo两次回嵌入后reload，未点击Save。只读原件回读 `/tmp/mimir-docx-table-preflight-postfix-unchanged-20261017.docx` 3479bytes，与此前原件cmp整文件精确。此处不计production、第二节/负坐标/双次保存/原生UndoRedo通过，独立checker与root最终验收仍需完成。下方原失败记录保留。
