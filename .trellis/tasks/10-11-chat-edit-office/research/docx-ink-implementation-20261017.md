# DOCX 原生段落墨迹实现交接

日期：2026-10-17。生产代码冻结，交 root 真实浏览器与独立 checker；本报告不表示全部编辑工具已完成。

## 本片实现

- `src/docx-ink-model.ts`：严格 GenOffice v1 向量、透明 PNG 光栅、逐笔几何与命中；坐标、宽度、颜色、点数、画布预算均有界。
- `src/docx-ink-save.ts`：初始化 PM 根 stroke/段落 anchor，验证 native run 与资源所有权；修改时经最终 SaveBlock 映射传 `SaveOptions.inks`；未修改时保持 `inks=undefined`，正文再生成后恢复完全相同的原 run、关系和媒体。
- `src/editors/docx-ink.ts`：原生事务、逐笔 history、原段身份跟随移动；分裂/复制只保留原 owner，删除/undo 沿 PM history。控制器只存 UI 当前值，不存 document history。
- `DocxInkOverlay.tsx`：唯一 EditorContent 外的 SVG 层，实际 nodeDOM 和 column 坐标，50–200% 缩放重测；笔/荧光/真实逐笔选择和擦除；pointercancel、文档/工具/缩放/滚动等变化取消手势。
- `DocxInkControls.tsx`、`docx-ink.css`：紧凑绘图分类、笔/荧光独立颜色与宽度、320px 既有 Inspector、内部滚动与固定删除/清除动作。清除显式确认且为一次历史。
- `DocxEditor.tsx`、`docx.ts`：最小入口/保存接缝；保持既有设计、列表、引用、图表、导出与唯一 editor/agent 句柄。Agent round 快照采用 `editor.getJSON()`，恢复采用 `setContent(round.content)`，包括根 attrs。
- 新专项：`src/docx-ink.test.ts`、`src/editors/DocxEditor.ink.test.tsx`。

## 严格保真边界

- 只识别精确已知键集合的 v1 payload；PNG bounds 必须匹配向量。native run 必须与既有 id/rId 的 canonical run 完全一致，未知 native 字段不会被重建时吞掉。
- 共享普通/页眉图片资源、无法解释的 reserved ink media、opaque 或额外键 payload、外部改变的原层均禁用整个文档的 ink 写入；普通未知段落仍以原 PNG 只读显示。
- root 明确批准 table-owned ink 保留但不伪造坐标。画布不显示该复杂层，状态行明确提示：**表格内复杂墨迹暂未显示；原件完整保留，绘图已禁用**。通过真实 Tiptap 的 table anchor/no-op 全 ZIP entry 保真专项。
- 段落复制抢占 docxIndex 时按 PM-only 稳定 anchor 归还原 run；保存映射前检查 body/plan 数量与一对一身份。未经验证的映射明确失败。
- 真实 vendor API 是 `SaveOptions.inks?: NewInkImage[]`，不存在旧研究名称 `saveNewInkImages/removeInkIds`。修改为全层重发；未动层恢复不能略过资源验证。

## 依据

- GenOffice 固定 `480548fd55f1be3593ee0d8e316a734751d58309`，本地 `/tmp/mimir-genoffice-html-git`：`editor/ink.ts`、`InkOverlay.tsx`、`ribbon-tabs.tsx:1413`。
- 实际 vendor：`docx-engine/src/patch.ts:231,616,1079` 的 inks 合同，`ink.ts` 的 column/paragraph anchor、docPr vector，`parse.ts:526,883` 的 ink 排除，`resource-cleanup.ts` 的原媒体清理行为。
- WeKnora v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`：沿 `xlsx-structured-clipboard-plan-20261017.md` 的固定证据，只适用能力如实门控；不提供 DOCX ink 或 Office Ribbon 合同。

## 检查结果

- 新 ink 两文件 **21/21**；连原件保存、Agent、视图、导出、图片 history **7 文件 90/90**。命令及日志 `/tmp/mimir-docx-ink-regression.log`。
- Office `tsc --noEmit` exit 0（`/tmp/mimir-docx-ink-typecheck.log`）。目标 oxlint 清洁，10 个生产/测试文件 oxfmt check 全通过，`pnpm lint:styles` 通过，`git diff --check` 清洁。
- 覆盖全 ZIP entries no-op、正文变更原 run/media/rels、原生新 ink/reopen/erase、量化边界二次保存、move/delete/undo、copy-before-original/split owner、table 原层、共享资源/未知字段守卫。
- UI 覆盖真实 Editor 指针/选择/擦除/清除确认/history、独立当前值、取消、50/75/100/150/200% 几何与实际 150% 第二段/节绘制、阅读禁止。
- **Canvas raster 在组件测试中被 mock，不声称已做真实 PNG 像素验收。** 未跑 full Office/Web build，由 root 统一。

## 可复用夹具与浏览器入口

夹具保留，不覆盖已上传原件：

| 路径 | root 已上传 document ID |
| --- | --- |
| `/tmp/mimir-docx-ink-plain-20261017.docx` | `Qg_gCPF9XTxC4hXS` |
| `/tmp/mimir-docx-ink-original-20261017.docx` | `lSXLxbEnwTkbd0dH` |
| `/tmp/mimir-docx-ink-opaque-20261017.docx` | 尚无 |
| `/tmp/mimir-docx-ink-table-20261017.docx` | `VLEQvuJkJB7V6oxq` |

初始 native fixture 的 PNG 是有效 1×1 透明图配真实 vector；用于结构/history，不证明像素外观。root 应在浏览器真实绘制/保存，再检查透明 PNG 与 reopen 外观。

UI：**绘图** → `笔`、`荧光笔`、`选择笔迹`、`逐笔擦除`、`笔迹设置`、`退出绘图`。Inspector 为 `笔迹设置面板`，字段 `笔颜色/笔宽度/荧光笔颜色/荧光笔宽度`，操作 `删除选中笔迹`、`清除全部笔迹` → `确认清除笔迹`。

root 浏览器重点：100/150% 滚动后实际第二段/节/column 坐标；真实笔画 PNG、选择/擦除/undo/redo/保存重开；宽/420 当前值/live count/内部滚动/固定 footer；未知原 PNG 与 table 可见提示；原件未动全 ZIP 精确。

checker 提前关注 Escape：shell native listener 与 React Inspector Escape 的层级/回焦，尤其切分类后原 pen trigger 可能卸载。此窄修复由 checker 接手；实现者冻结后不再改生产。独立报告目标 `research/docx-ink-check-20261017.md`。

无暂存、提交、归档、上传或删除测试件。后续 PDF 混合批次目前只读方案，未经 root 批准不写生产。
