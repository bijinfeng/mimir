# DOCX 大小写与 XLSX 形状库：浏览器验收

2026-10-17。沿用当前任务和固定参考：GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`，WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 仅参考权限门控，不作Office工具栏视觉模型。用户选择代码与浏览器验收；无真实模型执行，Desktop用户自验。整体in_progress。

## XLSX 形状库

- 复用既有验收文档 `RPXy3ORlulEbxuou`，无新增上传/删除。
- 真实插入入口现有105项（104宿主白名单+textbox）。搜索heart选择心形，设置D10与“工具栏验收”，保存；搜索“标注”命中四项，真实ArrowRight从矩形标注选到圆角矩形标注，再英文cloudCallout选择云形标注，J12与“云形标注验收”插入保存。
- 下载原件独立读取确认heart anchor(col3,row9)、cloudCallout(col9,row11)，文字正确。两次插入仅更改`xl/drawings/drawing1.xml`；图表、图片及其他全部非目录部件保持。
- 连续两级撤销保存、两级重做保存，每一级全部非目录ZIP entry分别精确等于相应基线/心形/双形状结果。证据 `/tmp/xlsx-shapes-browser-verification.json`；文件 `/tmp/xlsx-shapes-browser-{baseline,heart,cloud,undo-cloud,undo-heart,redo-heart,redo-cloud}.xlsx`。
- 1280与真实420px已实查，420整页scrollWidth420、面板320px；固定搜索/分组/底部单一插入动作，图库独立滚动。宽窄变化保留心形/D10参数，展开更多设置仍可操作。Escape关闭后焦点回“图表、形状与结构化表”。截图目录 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51/`，`xlsx-shape-gallery-wide.png`、`xlsx-shape-gallery-420.png`。
- 首轮视觉发现原生D10正确但画布偏上：实际table行高被字体/内边距/边框撑开，ObjectLayer仍按默认20px与24px表头累加。已交实现者修复预览定位，不改native anchor；最终已重建并复核：100%时心形top444.78125与row10完全相等；75%均376.6875、150%均580.875；420px均455.78125。云形标注top504.875与row12完全相等。按真实col/tr轨道测量并归一缩放，观察器回归与独立检查通过；未改原件锚点。布局证据 `/tmp/xlsx-shapes-browser-layout-verification.json`。最终菜单截图使用420×720、宽屏1280×720，覆盖首轮文件。
- 独立检查7文件97/97；真实Editor切文档/切表取消迟到结果、错误版本保留草稿重试、复杂原件未操作XML精确保留。详见`xlsx-shape-gallery-check-20261017.md`。复杂adj/rotation/fill/text/customGeom仍有明确预览限制，不将图库数量等同任意Excel原件全保真。

## DOCX 大小写

- 复用列表fixture文档 `HbA6Y2xnrlZWEgGC`，保留前三段列表与编号，将末段准备为粗体 `hello WORLD. straße İSTANBUL 😀` 后保存基线；未新增上传。
- 真实键盘选中末段，通过开始→更多字形→大小写，依次应用并保存四模式：`HELLO WORLD. STRASSE İSTANBUL 😀`、`hello world. strasse i̇stanbul 😀`、`Hello World. Strasse İstanbul 😀`、`Hello world. Strasse i̇stanbul 😀`。连续菜单操作使用保留的实际编辑选区，Unicode扩长后后续模式仍完整作用于末段。
- 每次下载独立读取：仅word/document.xml变化，前三段序列化XML精确不变，末段粗体保留。句首转换单步撤销保存精确等于词首结果，重做保存精确等于句首结果，全部非目录ZIP entry比较。证据 `/tmp/docx-case-browser-verification.json`；文件 `/tmp/docx-case-browser-{baseline,upper,lower,title,sentence,undo,redo}.docx`。
- 真实正文Shift+F3三次依次得到全部小写→全部大写→每词首大写，选区跨Unicode长度变化保持；最后保存词首结果。Escape关闭子菜单后焦点回“大小写”入口。
- 1280×720和真实420×720截图实查：四条动作+示例可见，菜单304px，420时left101/right405，整页scrollWidth420；轻量即时菜单，无额外表单/Inspector。截图同目录`docx-case-menu-wide.png`、`docx-case-menu-420.png`。
- 实现28专项、8文件134/134；独立checker无生产修复，报告`docx-case-implementation-20261017.md`、`docx-case-check-20261017.md`。既有toolbar测试Harness补真实DocxListsExtension/原生编号初始化，保留bullet断言并核原生numFmt；不是生产列表回归。
- 保存走既有原生writer，已证rawRPr/链接/批注/普通列表表格、修订及受保护内容拒绝，不新增任意未知w:p/w:r开标签精确保留承诺。未执行真实模型。

## 最终门禁

- 最终Office全包：141文件 **1460/1460**，日志 `/tmp/mimir-toolbar-batch-office-final-20261017.log`，exit0。
- PDF相关Server3文件 **10/10**，`/tmp/mimir-toolbar-batch-server-final-20261017.log`，exit0。
- Shared/Server/Renderer/Office类型检查、Web build均exit0；日志 `/tmp/mimir-toolbar-batch-{shared-types,server-types,renderer-types,office-types,web-final}-20261017.log`。Web build有现存React Compiler跳过优化警告，构建成功不代表所有组件被优化。
- 最终目标oxlint/oxfmt与styles通过；独立checker的Antd0问题，布局9/9与DOCX134/134通过。全仓`pnpm check`仍受此前480项bundled技能lint阻断，未重复执行或声称通过。
- 用户要求的浏览器路径已执行；模型未配置未调用，Desktop用户自验。未暂存、提交、归档、删除fixture；任务继续in_progress，设计/视图、PDF段落重写/OCR/涂黑/签名等剩余项见当前矩阵。
