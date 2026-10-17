# DOCX 表格设计 / PDF 画布绘图独立复核 · 2026-10-17

## 范围

复核固定切片的实际保存、版本、取消、当前态与 UI 接缝。沿实现者已经记录的 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 与 WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 证据；没有另做竞品研究。主会话独占构建和真实浏览器，本 reviewer 不构建、不部署、不提交或归档。

## Findings (fixed)

1. `DocxTableDesignControls.tsx` / `docx-table-design.css`：主会话真实 `docx-table-design-wide.png` 显示六个 tblLook 开关各占一整行。根因是直接位于 property group，统一跨列样式将其展开。新增局部三列 grid，六开关为两行，保留按下态与可访问名称；原应用 footer 不变。
2. `DocxTableDesignControls.tsx`：stale/optionsChanged 仅禁用 fieldset，Antd Select 仍可弹出和改草稿。给六个 Select 显式传入 locked；完整 Editor 回归在外部修改后逐一按触发入口验证无法打开。最终提交已有原子过期拒绝，本次补齐交互禁用。
3. `PdfLocalPanel.tsx`：主会话真实 `pdf-drawing-wide.png` 中，画布自由笔旁始终展示独立新建矩形的默认尺寸和另一添加动作，容易被误认为草稿当前值。原精确编辑保留到默认收起的 Antd `精确数值绘图` 区域，说明其新建/已应用对象语义与画布草稿独立；打开后组件保留原草稿。更新旧测试以实际展开入口后操作，未用隐藏字段替代可见交互。
4. `PdfDrawingCanvas.tsx`：旧对象移动草稿后，透明命中层仍停在原件位置，且轻点同一对象清掉草稿。命中 Shape 改用该对象草稿几何，同对象选择保留草稿；新增完整 Editor 回归在新位置轻点、第二次拖移、单次应用，并由真实 pdf-local 读取最终几何。

## 实际代码路径复核

- 表格5预设、六 look、冻结 CellSelection 的10类边框、四边距/对齐/AutoFit 汇入一个 closeHistory 事务。无改动不加历史；选区之外单元格、paragraph XML、caption/noWrap、斜边线及未改 border 属性保留。
- 稳定结构保存先从 native text save plan 接续，差量补 tblPr/grid/tcW/fill/borders；未把条件 CSS 写进模型。原生 vMerge 继续格保留，修改列宽时只更新对应宽度。条件条纹读取有界原件 styles.xml、basedOn 和主题 tint，实时 look 只影响视图。
- PDF pending 裁剪/纸型/旋转先沿 buildPdfWorkingCopy 物化，readPdfPages 提供实际 CropBox 尺寸；PdfSheet 的 bytes/index/rotation/width 渲染完成身份匹配后才挂手势。真实 mounted 延迟 render 回归验证准备期间无 SVG。
- 手势只准备草稿，显式应用沿原 runManualContentTool/handle expectedVersion/signal 写一次；own busy 不改变绑定，不自取消。切页/源/版本/模式取消绑定请求，迟到结果不增加 dirty/version/history。自由笔点列、逆向线/箭头、移动与八手柄 resize 均沿现有 native local writer。

## Findings (not fixed)

没有发现本片需阻断的额外缺陷。以下为已有明确边界，不扩大实现：表格浮动定位/环绕 UI、结构改变后的未知 XML 全保真、原生未建模的角条件/复杂段落条件/更多边框；PDF 只编辑 MimirDrawings，自由笔最多2000点，原件任意矢量/橡皮擦/任意旋转手柄/文本拖插不在本片。真实模型无配置未验，Desktop由用户自验。真实宽屏/420px新构建视觉结果归主会话补充，不把本报告组件门禁当浏览器结果。

## Verification

- 独立 Office Vitest：11文件 **77/77**。含 docx-table-design、DocxTableDesignControls、docx、DocxEditor.picture-history、PdfEditor.drawing-canvas、pdf-drawing-canvas、PdfEditor.local/content/forms/images/pending-forms。日志 `/tmp/mimir-table-pdf-review-tests.log`。与实施者既有切片重叠，不能累加。
- Office `tsc --noEmit` exit0：`/tmp/mimir-table-pdf-review-types.log`。
- 目标14 TS/TSX Oxlint exit0：`/tmp/mimir-table-pdf-review-lint.log`。
- 目标16文件 Oxfmt check exit0：`/tmp/mimir-table-pdf-review-format.log`。
- `pnpm lint:styles` exit0：`/tmp/mimir-table-pdf-review-styles.log`；`git diff --check` exit0。
- Antd lint 对 PdfLocalPanel、PdfDrawingCanvas、DocxTableDesignControls 分别0 issues。第一次尝试多文件参数被 CLI 拒绝，随后按单文件重跑全部通过。
- 全仓 pnpm check 未重跑；主会话已实际记录480项 bundled Impeccable 技能脚本 lint 失败，不冒报全仓绿。
- 本次将表格条件显示/保存分离、PDF草稿命中和独立数值入口合同同步到 editor pitfalls。
