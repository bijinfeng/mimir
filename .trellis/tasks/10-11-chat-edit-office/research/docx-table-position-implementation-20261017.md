# DOCX 浮动表格位置实施（2026-10-17）

范围：批准的 `office-crop-remaining-plan-20261017.md` §4 B。实现者不改共享 DocxEditor/session/protection/vendor，不上传、删除、提交或暂存；真实浏览器和重型门禁由 root 统一安排，独立 check 尚待执行。

## 参照与边界

- 文件编辑主参照沿固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，本次直接只读 `/tmp/mimir-genoffice-html-git/apps/docs/src/renderer/components/Ribbon.tsx:1205–1264` 及本仓同版 convert/parse/generate/extensions。
- 按 AGENTS 复用同日 WeKnora 官方站点和固定公开源码证据：v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`，具体缓存路径、哈希与适用性见上面批准的研究 §3。未声称本片重新 HTTP 检查；WeKnora 用于真实能力门控思路，不能作为 Office 工具栏或原生几何模型。
- 这是表格属性定位，沿已有真实 CSS float 和分页机制，不增加自由拖表格或第二编辑器。

## 文件与行为

1. `packages/office/src/editors/docx-table-design.ts`
   - 原 draft 增加 wrap、原始 integer twips X/Y、原件 XSpec/YSpec、四个独立距正文。
   - 当前 `tblFloatSource` 优先，suppressed float 不伪装成原件 inline。
   - 通过表格 docxIndex 选择真实所属节内容宽；新选 right 且未自填 X 时求当前右边缘，原件 right 的真实 X=0 不自行移动。
   - 新 float 缺省 margin anchors；既有 page/margin/text 与默认缺省不重写。高表保留/生成 suppressed 状态。
   - AutoFit、table attrs、cell/grid 在同一次原 PM transaction 内；最终 PM filter 拒绝须报错，不能发布成功。文档或实时表格目标改变均拒绝；纯同表光标移动不取消。
2. `DocxTableDesignControls.tsx` + `docx-table-design.css`
   - 仍是原320px Inspector、独立滚动 body 与同级固定单 primary。
   - 清晰环绕名称：left=表靠左/正文在右，right=表靠右/正文在左。
   - 原件关键字显示当前对齐；显式切到数值才替该轴 spec。数值正负厘米，四边距正文独立，不统一不对称值。
   - 原始 twips 保存在草稿，只在用户提交相应输入时以1440/2.54舍入。显示两位小数不回写未触碰属性。
   - 缺少可靠原生映射、未知 w 定位属性/坏数值/复杂内容有具体原因；其他样式工具仍可操作并保留原件定位。
   - 新 right 的自动边缘预设有就地说明，用户自填 X 可覆盖。suppressed 原件说明分页流式显示事实。
3. `packages/office/src/docx-table-save.ts`
   - XSpec/YSpec/FloatWidth 纳入自有适配变化集合。
   - 对原 tblpPr 仅补实际改变的轴/轴 spec/anchor/四边距，保留其他属性格式、外部命名空间、注释及另一轴。
   - 不再由 vendor 生成节点替整块 tblpPr/tblOverlap。never-overlap 不变；回 inline 只去 tblpPr，独立 overlap 保留。
   - 后续插行触发原生结构生成时先从生成输入隔离浮动差量，再对生成后的原件定位局部补丁，避免重新丢失关键字/扩展。
4. `docx-table-design.test.ts` + `DocxTableDesignControls.test.tsx`
   - 真实 PM/Inspector、草稿零写入、真实 float 类、负坐标/不对称边距、原件关键字/扩展/注释/never-overlap精确保留。
   - 两次保存、save→Undo/save→Redo/save 非目录 ZIP 全entry精确恢复。
   - 高表 suppression、无变化、过期/换目标、PM filter 拒绝、后续插行定位保留。

## 原生语义注意

DOCX tblpPr 没有独立的 wrap side 属性。固定 parser 从 XSpec=right/outside 或 numeric X>4680 推断 right，其他为 left。显式 side 预设写相应 XSpec，并给 right 计算 raw X；自填数值时明确清该轴 spec，重开 side 依固定原生 parser 的实际位置推断。未发明不属于 OOXML 的持久 side 标记，也不将该固定阈值推断宣传为任意 Word 几何完全兼容。

## 专项与门禁

- 最终 targeted 日志：`/tmp/mimir-table-position-final-20261017.log`**2 files /22 tests，exit0**。
- Office `tsc --noEmit`：11:38:42一轮exit0。最终11:40:34重跑日志 `/tmp/mimir-table-position-types-20261017.log` exit1，全部为并行PDF text owner进行中的文件：pdf-text-glyphs.ts `_FPDFPage_SetRotation`类型、PdfTextInsertPanel.tsx不存在ToolbarToggle/缺refresh属性/textarea及textfield disabled/confirm description。没有自有6文件TS诊断；未改其他owner文件，最终整体类型门禁仍需待该owner完成后由root确认。
- 自有6文件 oxlint、oxfmt check；Antd `DocxTableDesignControls.tsx` lint issues=[]。
- 早期测试修正：真实 native width是399px（逐列解析舍入），不是测试假设400px；测试改用实际 width。组件 primary 用实际 ant-btn-primary 类；原生插行用真实 PM addRowAfter，而非不存在的 editor.commands 方法。没有因此放宽生产断言。
- 未跑 full Office、server、Web build、浏览器、Desktop或真实模型；不能把专项通过算作这些门禁。

## Root 浏览器夹具

- `/tmp/mimir-docx-table-position-20261017.docx`，3479B。
- 生成器 `/tmp/mimir-docx-table-position-fixtures-20261017.py`，纯 stdlib Zip。
- 4×3首张嵌入表，后随长中文观察 wrap；原生 page/text + center/bottom + signedY +31/57/113/229不对称 +外命名空间/注释/never-overlap；第二节更宽纸张上的嵌入表；末尾60行真实 suppressed 原件。
- 保留 custom sentinel。未上传。
- 入口：选中表格正文 → 表格 → 表格设计与属性 → 文字环绕与位置。应用仍是“应用表格设计”。
- Root实际1280与420×500应核内部滚动、固定单primary、负值单位/Select Escape层级及回焦、真实正文环绕和宽节right preset；下载原生读回两次保存与UndoRedo。

## 待同步规范

建议独立 checker 在 `office/frontend/editors/conventions.md` 的 DOCX 原生表格段及 engine conventions 同步这一有限契约：保留 raw twips/独立距离/关键字，浮动差量增量补丁，suppressed 事实及单事务。实现者没有与其他 owner 并写公共 specs。
