# DOCX 列表与 PDF 原文段落：浏览器验收

日期：2026-10-17。任务继续 `in_progress`，本文仅记录本切片，不代表六格式工具齐全。
用户选择代码与浏览器验收；Desktop 自验，未配置模型，本文没有真实模型调用。
参考沿用当前缺口矩阵固定版本：GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`；WeKnora v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 仅权限边界参考，不作为 Office Ribbon 视觉模板。

## PDF 原文段落移动

- 测试账号按 AGENTS.md；专用验收库内文件 `mimir-pdf-native-blocks-fixture.pdf`，文档 `vrHDBZU1lWQLtbf_`，测试文件保留。
- 原 fixture `/tmp/mimir-pdf-native-blocks-fixture.pdf`，3571 bytes，4 页 Rotate 0/90/180/270，MediaBox 600×800，CropBox (20,30,560,730)。包含双行混合 Helvetica/Helvetica-Bold 段落、独立未选段落、两处重复原文、PNG 与绿色线条。
- 编辑 → 原文段落，320px Inspector；从当前页真实文本选项选择双行段落，服务器核验整段，输入水平24/垂直18 pt。
- 实际1280与420视口分别检查：420px整页scrollWidth=420，固定footer可见，数值保持。420下应用/保存成功；Escape返回实际折叠的原文段落组。
- 保存 → 撤销保存 → 重做保存。基线 `/tmp/pdf-native-blocks-browser-baseline.pdf` 与 `/tmp/pdf-native-blocks-undo.pdf` 字节精确相等；移动 `/tmp/pdf-native-blocks-moved.pdf` 与 `/tmp/pdf-native-blocks-redo.pdf` 字节精确相等。
- 独立原件读取：首段全部3个PDF.js chunk 同移(24,-18 native)，第二段/两处重复原文和另外3页位置不变；字体/样式一致，文字宽度浮点差<1e-12 pt。实际 native 字体字典语义一致，PNG原压缩流SHA256保持 `ba76d6485672a709a7a3c87ad635e3153ba3da06f2ba28bdc62f498d9db03c82`。详见 `/tmp/pdf-native-blocks-resource-verification.json`，resourcesEqual、undoBytesExact、redoBytesExact均true。
- PDFium会对目标页字体资源去重、改字典键序/资源引用；不能据资源名字或原始字典字符串差异认定字体丢失。PDF.js fontName含文档序号，比较已归一化前缀。
- 补充真实画布点选：第2页Rotate90，在画布点中一处 `Repeated marker`，核验选择位置390,30pt，移动(-12,+9 display)并保存，再点选新位置378,39pt。另一处同名原文未移；其余文字仅有<0.00003pt的浮点序列化差异。原件 `/tmp/pdf-native-blocks-rotated-pointer.pdf`。
- UI独立检查两文件14/14，真实Editor→host→history/save、忙状态、切页/切源/关闭/Escape取消、迟到inspect及失败草稿/焦点守卫通过；报告 `pdf-text-blocks-ui-check-20261017.md`。
- 边界：整段移动，不等于段落重写/任意子串编辑；Agent重复片段须提供唯一定位，手动画布可按位置区分；未知Catalog/AcroForm/显式裁切流等既有严格写入拒绝保持。

截图目录 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51/`：

- `pdf-native-blocks-wide.png`
- `pdf-native-blocks-420.png`
- `pdf-native-blocks-rotated-pointer.png`

## DOCX 详细列表

- 测试文件 `/tmp/mimir-docx-lists-native-fixture.docx` 已上传专用验收库，文档 `HbA6Y2xnrlZWEgGC`，测试件保留。4段，前三同numId17，级别0/1/0；包含keepNext/suppressOverlap/rsidR、startOverride5、未知XML与编号字形/颜色/制表位。
- 真实键盘选中前两段后从开始→列表→列表设置进入。当前值准确显示2段/混合级别、现有列表17与起始5。只输入起始7后，应用按钮首击启用且生效，保存为新numId18；未选段仍17，所有段落原有attrs/pPr/runs保持，选中仅numId变化。
- 第一组 `/tmp/docx-lists-browser-{baseline,moved,undo,redo}.docx`：只变word/document.xml与word/numbering.xml，undo全部非目录ZIP entry精确等于baseline，redo精确等于moved。独立读取 `/tmp/docx-lists-browser-verification.json`。
- 最终构建中再选两段，库→多级列表→中文层级，格式文字“第%1章”、文字缩进54pt、悬挂18pt。1280→420未提交草稿保留，420应用并保存为numId19；级别0原生chineseCountingThousand/第%1章/left1080/hanging360，定义9级，段落ids19/19/17/无。画布显示第一章、(一)、未选原编号5。
- 第二组 `/tmp/docx-lists-browser-chinese{,-undo,-redo}.docx`：undo精确等于上一组moved，redo精确等于chinese，所有非目录ZIP entry比较；验证JSON同名前缀。
- 首轮视觉发现数值单位挤入相邻控件、级别与格式文字半宽；同一批修复为局部弹性数值框保留单位、长控件跨两列，一级引用提示也修正。最终第二轮1280/420截图确认单位独立/无整页横溢出/单一固定应用与重置，420 footer top776.36/bottom853.36/width319，document.scrollWidth420。Escape实际回到折叠列表组。
- 独立checker三项先红后绿：数值首击应用、清列表误降非列表标题、稀疏编号新增XML次序；列表helper26+UI4=30/30，10相关89/89及类型/静态通过；root视觉补丁后UI4/4复核。
- 证据 `docx-lists-20261017.md` / `docx-lists-check-20261017.md`；最终截图同目录 `docx-lists-wide.png`、`docx-lists-420.png`。`docx-lists-420-first.png`为修复前对照，不作为最终效果。
- 限制：复杂表格不能可靠映射的段落明确拒绝；未覆盖任意嵌套/合并结构。后续大小写仍在实施，正文排序已纠正为固定GenOffice禁用占位，不冒称其已有执行器。

## 最终门禁

- 最终Office全包：141文件 **1460/1460**，日志 `/tmp/mimir-toolbar-batch-office-final-20261017.log`，exit0。
- PDF相关Server3文件 **10/10**，`/tmp/mimir-toolbar-batch-server-final-20261017.log`，exit0。
- Shared/Server/Renderer/Office类型检查、Web build均exit0；日志 `/tmp/mimir-toolbar-batch-{shared-types,server-types,renderer-types,office-types,web-final}-20261017.log`。Web build有现存React Compiler跳过优化警告，构建成功不代表所有组件被优化。
- 最终目标oxlint/oxfmt与styles通过；独立checker的Antd0问题，布局9/9与DOCX134/134通过。全仓`pnpm check`仍受此前480项bundled技能lint阻断，未重复执行或声称通过。
- 用户要求的浏览器路径已执行；模型未配置未调用，Desktop用户自验。未暂存、提交、归档、删除fixture；任务继续in_progress，设计/视图、PDF段落重写/OCR/涂黑/签名等剩余项见当前矩阵。
