# DOCX 浮动表格跨节定位修复 — 实施冻结

2026-10-17；接续 `toolbar-docx-table-position-preflight-20261017.md` 的真实120px偏差及已批准 `office-crop-remaining-plan-20261017.md` §B。当前仅专项与开发浏览器预检通过；独立check、最终生产浏览器及原生保存/history由root继续。

## 复现与原因

- root原开发浏览器1280：共享ProseMirror left148/width864，窄节正文left268/width624；left浮动table却left148，无`doc-col-block`和`--page-cx:120px`。原件未保存，3479B源文件cmp精确，详原预检报告。
- 修复前新增真实PM回归失败：`liveColumnPlacements`对窄节表格返回undefined，预期pageDx120/contentWPx624。2026-10-17 12:23:51，1文件1失败，直接失败于缺失placement。
- 固定vendor `pagination-sections.ts:449+` 的sectionWidthSpecs跳过floated；Mimir之前原样传入。右浮动另外以完整864px共享流的右边缘布局，不能仅补视觉translate；否则实际float排斥区域仍在错误位置。

## 自有文件

1. `packages/office/src/pagination-geometry.ts`：仅在sectionWidthSpecs的输入副本把floatTable的floated标记移除，使真实浮动表格获得所属节的contentWPx、独立左右margin、dx和pageDx。原始BlockBox不变，分页/columnLayoutSpecs仍读取真实floated，表格不获得强制段落widthPx。
2. 新 `packages/office/src/docx-floating-table-layout.ts`：`setLiveColumnLayout`沿已有vendor decoration通道，右浮动另保留原引擎margin-right表达式到私有临时DOM变量。与vendor NodeView补丁一样暂停/恢复PM DOM observer；清空分页或回inline时移除标记/变量。无PM属性、原生定位、dirty、version或history写入。
3. `packages/office/src/pagination.ts`：四处沿原有顺序调用自有adapter，包括cleanup；不改DocxEditor或保护共享接缝。
4. `packages/office/src/editors/editors.css`：右浮动真实margin增加`max(0px,100% - --doc-content-w)`，同时保留原native-X margin表达式，实际wrap先按正确逻辑位置排版，之后表格和段落共享section transform。`.doc-table-float-flow`排除额外margin；原paginator `--tblp-dy`不受影响。无新增Inspector/控件或视觉样式体系。
5. 新 `packages/office/src/docx-floating-table-layout.test.ts`：13项专项。

未修改vendor、DocxEditor、原生writer或已冻结DV所有者文件；无上传、删除、暂存、提交或归档。

## 证据与门禁

- 最终4文件 **49/49，exit0**：新增13、pagination geometry10、既有表格原生/控件26。日志 `/tmp/mimir-docx-table-section-targeted-20261017.log`，12:26:33，4.34s。
- 新增覆盖624/864及第三960内容宽、不同左右margin、page/margin/text锚点、负X/Y、非对称四距离、native关键字center/right/outside/left/inside、paginatorY保留、重复分页不叠加、right gap和inline清理、suppressed/flowed高表、真实ZIP原生no-op返回完整原bytes、PM文档对象/JSON/history不变。
- HappyDOM不执行真实CSS布局，亦不能完整解析引擎复杂max/calc margin表达式。测试不会把固定BlockBox当真实浏览器wrap证据；实际坐标/环绕由root读取下述浏览器。
- Office `tsc --noEmit` 初轮与最终均exit0；最终日志 `/tmp/mimir-docx-table-section-types-20261017.log`。
- 4自有TS oxlint零诊断，5文件oxfmt check通过。初轮测试样式fallback预期修正：HappyDOM复杂margin表达式为空时adapter使用原CSS默认0px，未修改生产表达式或放宽浏览器门槛。
- 未运行full Office/server/Web build/Desktop/真实模型。

## root实际开发浏览器预检（非最终production验收）

- root回报5173/1280，左表x268、width241；后续正文x268/width624；`doc-col-block`、`--page-cx120`已恢复，实际截图正文在右绕流。`docx-table-position-left-fixed-preflight-1280.jpg`。
- 右表x651/right892/width241；后续正文x268/width624/right892；computed marginRight240，实际截图正文在左绕流。`docx-table-position-right-fixed-preflight-1280.jpg`。
- root已关闭Inspector、Undo两次并reload，无Save；源库未改。原先420×500 Inspector预检布局保留，最终生产窄屏/数字与原件关键字/原生保存和history仍待root。

## 参照与后续

文件编辑参照沿任务固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，直接依据本仓同版sectionWidthSpecs、ColumnLayoutExtension、table renderHTML和FloatVShifts；保留其原有锚点/范围钳制及高表策略，不把signed原始数值保留宣传为任意Word几何完全兼容。WeKnora沿同日既有v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24`官方站点/公开源码缓存证据与适用性（见已批准office-crop研究§3），本片未声称重新HTTP取证；它不提供Office浮动表格几何参考。

实现已冻结交root独立check；正式check可独占修复此5文件。后续门槛：最终构建1280/420真实left/right/数值/锚点/关键字与suppression，原生两次保存重开及Undo/Redo；不能以本片49项或开发预检替代。
