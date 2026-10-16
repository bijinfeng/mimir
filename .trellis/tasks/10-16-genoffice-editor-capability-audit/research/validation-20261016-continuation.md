# 工具栏持续补全验收（2026-10-16）

本记录接续既有能力矩阵，不代表原始工具清单全部完成。

## HTML 自定义 CSS

- 测试文档：`xDRLJB-Qsq04_tfu`，独立验收库。
- 输入 `color: blue; font-size: 40px;` 时画布临时预览，源码仍为红色，保存禁用。
- 取消预览后标题恢复红色，输入清空。
- 再次输入并应用，源码变为 `color: blue; font-weight: 700; font-size: 40px`，未改的加粗声明保留。
- 保存、刷新后蓝色与字号仍保留；下载 `/Users/admin/Downloads/mimir-html-toolbar-fixture.html` 独立读取确认。
- 演示页已验证；新窗口创建成功，但浏览器工具禁止绑定 blob URL，未绕过策略。

## 当前代码生产构建

- Web `vite build`、Desktop `electron-vite build`、Server `vite build` 成功。
- 仍有 React Compiler 跳过部分组件、第三方 WaveDrom eval、较大 chunk 等构建警告；不能据此声称零警告。
- 构建期间仍有实现代理工作，后续改动需要最终重新构建。

## Desktop 本地模式 XLSX

- 从本仓库 `apps/desktop` 启动当前构建（Electron 44.7.0），进程内生产宿主 `127.0.0.1:52190`。
- 既有测试文件 `xlsx-fixture.xlsx`（本地文档 `LbYD8qC6zAJnKx6W`）。
- “范围写入与复制”中将 D1:E2 写为两行 TSV：`桌面批量 / 42`、`保留中文 / TRUE`。
- 网格立即扩展到 E 列，中文、数字与布尔值正确显示。
- 保存到库、返回知识库再打开后四值保留，原有姓名、部门、公式缓存与行隐藏仍在。
- 截图：`/tmp/mimir-desktop-xlsx-batch-reopened.png`。

## PDF 表单真实连续编辑发现

- 测试文档 `5JImP9mvURcvsemJ`，源 `/tmp/mimir-pdf-forms-toolbar-fixture.pdf`。
- 文本 name 写中文、agree 勾选成功；第三次 color=blue 时 fontkit CFFSubset 空 glyph 编码抛 RangeError，并退出开发服务。
- 已交实现代理优先修复并补连续操作/空值回归。此项尚未通过，修复前不计验收完成。
- 服务已重新启动，待修复后重跑全部字段、保存、重开与独立 PDF 读回。

### 修复后读回与样式复核

- 修复 radio/checkbox 不必创建字体、空文本预置 glyph 与异步编码错误传播后，真实页面连续写入 name=`中文表单验收`、agree=true、color=blue、country=China，保存、下载并刷新成功。
- `/Users/admin/Downloads/mimir-pdf-forms-toolbar-fixture.pdf` 经独立 pdf-lib 读回四值及两页均正确；Poppler 渲染 `/tmp/mimir-pdf-forms-browser-readback.png` 已目视确认中文、勾选、单选和下拉值，原有 KEEP ORIGINAL 保留。
- PDF 表单改为300px右侧 Inspector，宽区并排、窄编辑区覆盖并内部滚动；已实测1440px与420px视口。证据 `/tmp/mimir-pdf-form-inspector-wide.jpg`、`/tmp/mimir-pdf-form-inspector-narrow.jpg`。
- 正常读取完成后 Escape 已真实验证返回“交互表单”按钮；读取中立即 Escape 发现 disabled 触发器的回焦时序问题，已交实现代理修复并补回归，尚待修后真实复验。
- DOCX“页面与节”使用共享可见字段标签、单位和分组。默认及420px下查看，菜单内部滚动、两列字段均可达，画布页眉虚线不再穿过菜单；此轮未修改正文。证据 `/tmp/mimir-docx-property-form.jpg`、`/tmp/mimir-docx-property-form-narrow.jpg`。
- 共享 Shell 与 DOCX AdvancedControls 定向回归2文件123项通过，Office `tsc --noEmit` 通过；不代表六格式完整验收。

## 依赖例外

用户已明确授权仅 `@ironcalc/wasm-xlsx@0.9.0` 的成熟期例外。`minimumReleaseAge: 1440` 保留，exclude 精确匹配该版本，未扩大到其他依赖。

## 本轮工具栏样式与交互验收

- PPTX：主题面板由单列12个颜色代码改为基础色、强调色、链接色三组两列色块，保留当前颜色代码和任意颜色短弹层；标题/正文的字体输入单独成组。
- 浏览器1440px时workspace1146px，Inspector为static并排；问AI打开后workspace746px，Inspector为absolute覆盖。420px时保留关闭、分组标签和内部滚动。证据 `/tmp/mimir-pptx-theme-inspector-wide.jpg`、`/tmp/mimir-pptx-theme-inspector-with-ai.jpg`、`/tmp/mimir-pptx-theme-inspector-narrow.jpg`。此轮未改主题或保存。
- PPTX真实放映已能打开，退出按钮Space确实退出；发现深色背景上的工具文字对比不足和退出回焦到旧主题按钮，独立check正在局部修复，修后需复验。
- XLSX：真实页面在没有操作范围时进入数据分类，复现 `XlsxRangeControls` 的 null.endColumn 崩溃；修除闭包非空断言后真实复验不再崩溃。写入/复制子分页签、当前范围、标签/说明/禁用在420px可达，Escape回触发器。证据 `/tmp/mimir-xlsx-range-tools-narrow.jpg`。此轮未写入文件。
- 独立检查发现并修复本批XLSX原件风险：自闭合definedName保留、宿主展开范围的Excel边界校验、打印只提交修改字段、取消冻结后当前数值；最终回归尚在复跑，不能提前记通过。
- PDF批注侧面板的内容/位置标签已真实查看；表单点击刷新后立即Escape发现刷新按钮disabled导致焦点BODY且面板未关闭，独立check继续修该场景。普通读取完成后的Escape已通过。

### 独立检查与修后实测

- PDF刷新表单后立即Escape现已真实关闭面板，activeElement为“交互表单”BUTTON；正常关闭及不抢用户后续焦点由组件回归覆盖。批注面板补可见内容/坐标标签，添加为主动作，无选中时不再堆四个禁用按钮，选中后显示修改/回复和危险删除确认；最终截图 `/tmp/mimir-pdf-annotations-inspector-final.jpg`。
- XLSX打印页面缩放输入110草稿后切页眉页脚，未编辑的“应用打印页眉页脚”保持disabled，且明确说明未编辑部分保留；本轮未应用或保存。冻结无改动按钮状态新增回归59项通过。
- 独立check修复PPTX放映Space/Tab和明确触发器回焦、暗背景操作对比度；PDF/PPTX最新3文件34项，XLSX专项Office93项与Server39项及冻结59项通过（含重叠用例，不累计为唯一总数）。Office/Renderer/Server类型检查通过。
- 全仓oxlint仍480错误，均在无关Impeccable脚本；本批定向lint通过。Office verify指向缺失脚本；sync固定commit的--check有31个格式差异，归一化两侧后语义差异0，但原命令exit1，不记通过，未手改vendor。日志 `/tmp/mimir-toolbar-review-vendor.log`、`/tmp/mimir-toolbar-review-vendor-diff.log`、`/tmp/mimir-toolbar-review-vendor-normalized.log`。
- 本轮未提交、不归档任务；原始六格式全工具清单、真实模型与最终两端逐工具验收仍未全部完成。

### 最终构建与界面复验

- 最新冻结代码 Web/ Desktop/ Server 生产构建均exit0；保留React Compiler、第三方eval和动态/静态导入提示，不能称零警告。日志 `/tmp/mimir-toolbar-style-{web,desktop,server}-build.log`。
- XLSX冻结0/0时两个按钮在真实浏览器均禁用并有原因，未改文件。
- PPTX放映暗背景操作文字已清晰可见；退出按钮Space回到“从当前页放映”，演讲者视图Escape回到“演讲者视图”，真实activeElement检查通过。截图 `/tmp/mimir-pptx-presentation-style-final.jpg`。
- 重启本仓库当前Desktop构建（私有宿主49376），打开原本地xlsx样本；无选区进入数据分类与写入面板，分组、标签/说明、禁用和Escape回触发器均通过。此前保存的D1:E2中文/数字/布尔保留；本轮只查看不改文件。截图 `/tmp/mimir-desktop-xlsx-tool-style-final.png`。
- 最终PDF效果与宽/中/窄截图已保存到 `/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51/`，主图 `pdf-toolbar-after.jpg`。

## 继续补全与样式实测（本次续接）

- Markdown 写作服务/NDJSON route、Renderer流读取和临时草稿分开；真实模型结束事件缺失、迟到错误和用户停止不得误报完成。定向Renderer3文件29项、server写作2文件6项通过；受控真实组件浏览器验证已在Markdown矩阵记录，不冒充真实模型E2E。
- `create_document` 新JSON和单工作表multipart路径：server创建3文件9项通过，含保留原始Markdown/完整HTML、PDF来源、XLSX当前未保存显示值导出、精确上传字节与源原件不变；Chat桥9项通过。DOCX/PDF富格式生成仍有已知边界，不能计完整对齐。
- XLSX设备图片经`imageFile`→`imageBlob`→宿主`image`接通，MIME/真实签名/解码与8MiB限制。新增authenticated multipart回归通过：实际图片入ZIP、MIME错配/空图拒绝、原件未被此请求持久化。Server/Renderer当时类型检查通过（PPTX后续素材接缝尚在实施）。
- 真实文档`RPXy3ORlulEbxuou`可见“数据”表：A2:C5插柱图“工具栏图表验收”，E18插设备PNG，保存/下载。`/Users/admin/Downloads/xlsx-fixture (1).xlsx`用Python标准库独立ZIP/XML确认chart title、PNG精确字节、两张表及原有公式保留；刷新后手动选择“数据”可见图表和图片。
- XLSX实际验收发现并修复空白对象按钮、六类标签横向截断、长位置标签挤压、窄屏Inspector半透明使网格透出。修后宽屏和420px截图：`xlsx-object-inspector-wide.jpg`、`xlsx-object-inspector-narrow.jpg`；420px document/body均无横向溢出，Inspector x100/w320，Ribbon clientWidth=scrollWidth=352。Escape关闭并回到“图表、形状与结构化表”。重开默认选择隐藏表的问题已交owner修复，需最终刷新确认。
- DOCX新增专用夹具保存于独立验收库：`mQKq1s3dI7AJ76jG`分节脚注/长尾注，`nQJjWOaUbAe0mwKn`超长脚注。真实浏览器发现同锚点续页倒序；PM widget排序修复不足以覆盖尾注内部DOM插入，后者修复后实际脚注1分片按y升序transform为0、-250.039、-545.992，图像看到1–11→12–24→25–36。内部页间隙已扩至完整600px；扩宽后脚注文字贴纸边的问题已反馈并修，待最后x364复量。原夹具省略w:footnoteRef所以按原件语义不画脚注序号，不判为产品丢号。
- 当前PDF表单确认300px Inspector、字段标签/当前值/未变化禁用态，截图`pdf-toolbar-current.jpg`。当前所有图像位于本任务Codex visualizations目录；旧全宽堆叠表单不再作为交付界面。

### 样式与交互修正后的最终补验

- DOCX最后缩进复量通过：纸张x304/width600，脚注1各分片x364/width480；续页顺序保持。滚动至续页后更新`docx-footnote-continuation-fixed.jpg`。
- XLSX刷新默认`aria-selected`为可见“数据”，图表/设备PNG自动可见。A2:C5实际插入结构化表：蓝色表头、隔行底色、原有黄色显式填充均可见。保存下载`xlsx-fixture (2).xlsx`，独立ZIP/XML断言Table1 ref=A2:C5、tableStyleInfo、旧公式与原PNG精确字节保留。截图`xlsx-native-table-inspector.jpg`。保存后的成功提示统一为“已应用”，保存状态仍由底部dirty提供。
- PDF图片夹具经真实UI上传到同一专用库，文档`I56PIa071_MpP1ts`；原图240×160pt，x80/y140。首次发现数字草稿80→110直接点应用会错误保留80，根因共用动作按钮阻止blur。修复后同一路径首击应用、保存、下载`mimir-pdf-images-toolbar-fixture (1).pdf`，独立pdf.js算子矩阵`[240,0,0,160,110,350]`且原KEEP ORIGINAL文字保留。截图`pdf-image-inspector.jpg`。
- 共用Ribbon独立检查修复并经真实420px页面验证：组名不再挤成多行；全部折叠仍不足时仅命令条横滚；Tab从“对象”组进入“插入文本框”；内层图表菜单Escape只关闭内层并回到“插入图表”，再Escape关闭外层。文档width/body scrollWidth均420。窄屏截图`pptx-formula-inspector-narrow.png`；临时viewport/CDP尺寸已恢复。
- PPTX真实插入原生公式、音频并保存。素材HTTP响应最初漏传data，导致媒体插入后未自动选中；route/API补齐后自动显示“媒体播放”Inspector。原生audio readyState4、duration0.5，点击播放后paused=false；保存会重建播放器，未把此证据扩写为完整放映媒体验收。下载`01_standard_business (1).pptx`独立ZIP确认两次验收插入的WAV均与本地字节相同，原生oMath和原标题保留。成功反馈去掉过时“尚未保存”，避免与底部“已保存”冲突。
- 本次独立Trellis检查15文件206项通过，覆盖流写作/创建/上传及共用菜单，后续首击数字提交已补Shell回归。XLSX定向Office134/server61通过，PPTX Office100/server27通过；后续反馈修正的已有Editor回归分别66/21通过。Office/server/renderer/chat类型检查通过；新增PPTX素材HTTP测试通过。
- Server、Desktop生产build通过；Web首次build发现WaveDrom ambient声明不随源码导入可达，补类型引用后Web typecheck/build通过。全仓`pnpm check`仍在lint阶段失败：480项来自本次任务外Impeccable技能脚本。新增PPTX服务测试的5项lint已修，4/4测试及server类型检查通过；最终`pnpm lint`复跑确认只剩技能脚本480项错误。不能宣称全仓质量门通过，也不把当前新增执行入口数量等同全部GenOffice手动工具完成。

## 后续本地工具批次（2026-10-16）

- 根会话接通 PDF `local` multipart → strict schema → working-copy service → Renderer API → `PdfEditor.hostLocal`。当前文件与可选导入文件各50MiB，解析前101MiB总请求预算，安全整数版本并保留加一空间；只有修改字节推进版本，属性读取和选页导出保持版本。真实route测试与原PDF route共2文件10项通过，覆盖未保存副本、metadata写入、输出字节、导入页、源原件未变、鉴权、错误格式/JSON/schema/页码/版本/文件大小预算。root定向lint/format与Server、Renderer tsc通过；此时独立check仍在进行。
- 固定commit的flash-fill/cutout两入口通过sync脚本添加；正常oxfmt后再次`sync --from /tmp/mimir-genoffice-html-git --check`为0差异。未直接改vendor实现。
- 新增官方npm精确依赖`@google/model-viewer@4.4.0`用于PPTX本地3D预览，发布时间2026-10-09，沿用minimumReleaseAge，无新增等待期例外；模型面板仍在收尾，未声称真实预览通过。
- 真实XLSX文档`RPXy3ORlulEbxuou`选A2:C5，布局→尺寸与分级→适应列宽→保存。下载`/Users/admin/Downloads/xlsx-fixture (3).xlsx`独立ZIP/XML读回：sheet1列A/C宽6.142857142857143、B宽17.428571428571427，原SUM(1,2)公式及table1部件保留。截图`xlsx-autofit-saved.png`。
- 初版新增菜单使XLSX开始分类达11组、出现两个不可分辨“工作表…”；已纠正为字体/剪贴板/工作表/单元格/查找5组。714px编辑区命令带client=scroll=698，字体控件直接显示；420px视口body无横溢出，368px编辑区命令带352/360，仅5×72px最小分组造成极窄局部8px滚动。宽/中/窄截图`xlsx-toolbar-five-groups-{wide,middle,narrow}.png`。窄屏剪贴板和内层剪切/格式刷均可展开；Escape最后复验被并行HMR重置中断，尚未计通过。
- 新PDF本地工具Inspector第一轮实机发现Segmented选中底板仅包文字、动作过矮、同组字段间距过大；已反馈owner改两列等宽32px具名tabs/同组10px与组间20px/32px动作/成功简化“已应用”。修后真实截图与保存读回待本批稳定后集中复验。保持总任务未完成。

### 本地工具批次实机复验

- PPTX GLB 面板修复文件按钮无文字、预览过高与主动作落在折叠区域：真实加载自包含 `local-tetrahedron.glb`，WebGL 预览可见。已保存的 `/Users/admin/Downloads/01_standard_business (2).pptx` 中 GLB 与夹具字节一致，并含 PNG 封面；这是附件与封面，不是 PowerPoint 原生 am3d。最终面板截图 `pptx-model-inspector-corrected.png`。
- PPTX 视图→导出与打印，当前第1页 PDF 真实下载 `/Users/admin/Downloads/slides.pdf`；独立 pdf-lib 确认1页、959.976×540pt、图像资源存在。前次等待超时未复现，未把静态栅格 PDF 误记为可选择文字输出。
- PDF 中文水印实际应用保存下载 `(1).pdf`，pdf.js 确认两页含“工具栏样式验收”，KEEP ORIGINAL 保留，pdf-lib 确认四个 AcroForm 值。旧工具栏旋转曾被严格保存白名单阻断；现复用 local 安全页面计划后，真实完成旋转90°→保存→撤销→保存→重做→保存。下载 `(2).pdf` 独立读回旋转90°、文本 name=中文表单验收、agree=true、color=blue、country=China 及两页水印全部保留。未放宽全局旧保存守卫。
- PDF 表单 Inspector 在1280与420px实机可达，宽300px；420px body.scrollWidth=innerWidth=420。截图 `pdf-form-inspector-final-{wide,narrow}.png`。窄屏 textarea Escape关闭后焦点落BODY，已反馈owner修复折叠组回焦，尚未计通过。
- XLSX420px实机嵌套剪贴板菜单：内层 Escape 仅关“剪切、格式刷与清除格式”并回同名按钮，外层保留；再Escape关外层并回“剪贴板”。body宽度420无页面横溢出。此轮未改文件。
- 独立检查发现清除部分范围条件格式时拆分 sqref 会改变公式锚点，已补相对/绝对/大小写/字符串/工作表名/整行列迁移及实际保留区样式回归。Server本批4文件31项通过；Office/Renderer tsc通过，Server最终tsc待rich创建批次收尾。

### 窄栏焦点修复复验

- PDF折叠组入口卸载时，关闭Inspector按同一文档与data-section-key找回具名组触发器；不再回BODY。真实420px从“表单”组进入，textarea Escape关闭及点击关闭按钮均确认activeElement为aria-label“表单”的BUTTON。独立组件回归覆盖原触发器卸载、busy延迟与用户已转移焦点。
- 为便于对照用户原截图，最终主图选中country字段、显示当前China，样本恢复0°并保存；新图 `pdf-form-inspector-final-wide.png`。图中字段由右侧300px Inspector承载，保留左侧文档上下文；未改表单值。

### 本地批次独立检查与构建

- 独立checker修复并复核：XLSX小写公式剪切迁移、条件格式拆分后的公式锚点；PPTX格式刷字号物理尺寸换算；PDF抽页/删除/替换后对象隔离、表单保留和窄栏回焦。该冻结批无已知未修代码缺陷，完整上游能力/参数与桌面模型验收边界仍保留。
- Server4文件31/31，Office主矩阵9文件179/179、另3文件9/9、PDF最新2文件19/19通过；部分重叠不累计。31目标文件lint零警告，Office/Server/Renderer类型检查、format、diff检查通过。Rich创建后续批次不在此报告范围。
- 最新本地工具前端生产构建Web、Desktop均exit0，日志 `/tmp/mimir-toolbar-local-{web,desktop}-build.log`；仍有React Compiler/第三方eval/动态静态导入警告。Server等待rich字体公共修复冻结后重建。全仓pnpm check既有技能脚本基线失败仍未消除，不能记全仓通过。

### 选页输出与富内容视觉检查

- 表单PDF第1页抽取为新PDF，生成后从面板输出文件按钮下载 `/Users/admin/Downloads/extracted-pages.pdf`。独立pdf-lib确认1可视页/1个Page间接对象、4字段值保留，原件仍干净。结果区位于长面板底部不易发现，下一PDF切片处理输出可见性。
- 根会话已目视检查rich创建 `/tmp/mimir-rich-page1.png` 与 `page4.png`：首屏中文标题/加粗斜体/链接、嵌套列表、合并表格、代码段完整；第4页61–65行与末尾“内容完整”保留，无表格跨出纸张。图片同步到本线程visualizations `create-document-rich-page{1,4}.png`。尚不将此视为所有HTML/CSS兼容；独立checker正在处理justify显式拒绝、单元格段落对齐、blockquote样式与列表顺序合同。

### Rich创建独立检查收口

- 独立checker修复嵌套列表后续段落保序（含子列表在首位的父marker）、表格单元格原生标题/链接、单元格和引用字形/对齐继承及显式覆盖。PDF尚不支持justify则明确拒绝，未静默当left。公共CFF字体适配新增既有表单同串跨FD逐字真实光栅化回归。
- 根会话目视 `/tmp/mimir-rich-review.png`：右对齐蓝色引用、列表父子顺序/后续段落、右对齐单元格标题与左对齐覆盖、合并表头/跨行单元格、链接均可见；复制为 `create-document-rich-independent-review.png`。
- 最终Server相关5文件31/31、Server类型检查、10目标文件lint、6文件格式及diff检查通过。`pnpm lint:styles`通过。其余复杂HTML/PDF公式/超页合并组边界仍详见rich矩阵。
- 真实模型配置核对：测试账号设置模型页显示“暂无供应商”。已向用户异步请求在设置中配置测试模型，未请求在聊天发密钥；代码/界面工作继续，未把mock记真实模型验收。

### 下一页面与格式刷切片实测（仍在检查）

- forms PDF旧菜单“四边裁10pt”+单页A5+缩略图复制→保存，3可视页；下载 `(3).pdf` 独立读回A5页419.53×595.28、两页原文/中文水印、四表单值和重复widgets保留。此时context却有8个Page间接对象，反馈后owner确认水印重绘临时Page未统一GC；新增flush deferred embeds→root reachability GC及3=3回归，真实重存复核尚待。
- XLSX源A1:B3含合并时格式刷明确拒绝，无dirty。无合并源A2:B3→目标D5，菜单明确预览D5:E6，应用并保存成功。下载事件监听超时，但实际Downloads已生成 `xlsx-fixture (4).xlsx`；独立标准库ZIP/XML读回D5/E5默认style0、D6/E6与A3/B3同style3，SUM公式与table1保留。成功后文档版本变化却提示“源已更改”的误导文案已交独立checker，现改为“文档已更新，请重新拾取格式”。
- Desktop原生窗口枚举遇Mac已锁屏，已异步请用户手动解锁，未尝试绕过；浏览器DOM验收继续。

### XLSX闪填最后实机与独立检查

- 独立checker修复闪填将隐藏显示但实际存在数字改写为文字的问题，现按原始类型保护0、7、false、空缓存公式；仅真实空值接受推断。格式刷及剪切的版本失效提示改为文档已更新，要求重新拾取格式/范围，未降低版本守卫。Office3文件81/81、Server无DB1文件19/19；Office/Server tsc、定向lint/format/diff通过。
- 真实工作簿在A10=张三/B10=员工：张三、A11=李四/B11空、A12空的条件下，选择B10→数据→填充与闪填→快速填充→应用，实际第11行显示员工：李四。保存到库并下载`/Users/admin/Downloads/xlsx-fixture (5).xlsx`；独立标准库ZIP/XML确认B10示例保留、B11推导正确、B12不存在，旧SUM(1,2)公式和table1部件保留。截图`xlsx-flashfill-saved.png`。下载监听超时但实际文件已生成，未重复触发下载。

### PDF页面历史、未保存输出及输出列表实机修复

- 当前3页基线真实复制第2页→保存4页→撤销保存3页→重做保存4页。下载`mimir-pdf-forms-toolbar-fixture (5).pdf`独立pdf-lib确认4可视=4间接Page；name/agree/color/country当前值保持，前三种控件各3/3/6个widgets及choice3个。最终再次撤销并保存恢复3页；截图`pdf-page-duplicate-history-saved.png`。
- 未保存四边裁20pt后直接抽第1页，原件保持dirty；初次输出按钮在DOM存在但下载无效。真实计算样式发现结果列表在长flex列中压为height0，按钮被overflow裁切。修正outputs与其button为不收缩，仍保留220px结果内部滚动。修后列表高32px、按钮可见可点，真实下载`extracted-pages (1).pdf`独立1可视=1间接Page、CropBox379.53×555.28、四字段保留。撤销后原件恢复干净3页，证明抽页未静默保存pending几何。截图`pdf-pending-crop-output-top-fixed.png`。
- 旧工具栏导入普通图片PDF后保存，下载`mimir-pdf-forms-toolbar-fixture (6).pdf`独立4可视=4间接Page，导入页500×650、KEEP ORIGINAL - PDF IMAGE TOOLS文字与原表单四值保留；撤销保存恢复3页基线。
- 按每份1页拆分生成3文件，420px真实输出列表高112px，各动作32px可见；body.scrollWidth=innerWidth=420。截图`pdf-multi-output-narrow.png`；临时viewport已恢复。未启动真实打印对话框。

### 带书签表单与pending页面组合验收收口

- 新显式preserving forms adapter沿local守卫，纯字段调用原writer、含页面混批复用local的书签映射/清理；旧严格表单writer默认行为未放宽。根会话将forms HTTP路由接入该适配，并为原鉴权/hash/dryRun/未持久化回归加入原生Outlines；pdf.js独立确认中文写后书签标题与目标页仍正确，HTTP9/9通过。
- checker修复复制drawing稳定ID及再次复制避碰、-90/270等价角度误拒绝、其他local入口绕过绘图几何边界、dryRun假设info误覆盖当前Inspector缓存，补写盘失败保留dirty/history。最终Office6文件36/36；Server5文件28/28及route9/9，最后local15/15重复复跑；Office/Server tsc、18文件lint零warning、11文件format/diff通过。此前PDF8文件65/65和服务专项10/10存在重叠，不累计。绘图页面几何变换仍明确未实现，不把拒绝算完整能力。
- root真实forms样本建立两条原生书签“工具栏表单验收”→1页、“原件末页”→3页并保存；随后第1页四边裁20pt但不保存→表单Inspector读取四字段→name填写“书签裁剪验收”→应用→保存。下载`mimir-pdf-forms-toolbar-fixture (7).pdf`独立pdf-lib/pdf.js确认3可视=3间接Page、CropBox379.53×555.28、两书签title/page正确、name新值、agree=true/color=blue/country=China、原KEEP ORIGINAL文字与复制widgets保留。
- 同一浏览器保存后撤销字段恢复“中文表单验收”且pending裁剪保留；保存后重做恢复“书签裁剪验收”，再次保存成功。最终刷新打开Inspector，仍为4字段、新中文值、380×555pt且保存禁用，证明持久化及重开可编辑。最终宽图`pdf-form-preserving-final-wide.png`。本段是实际手动UI证据，不冒充真实模型工具续轮。
- 新冻结代码Web、Desktop、Server生产build均exit0，日志`/tmp/mimir-toolbar-preserving-{web,desktop,server}-build.log`；仍有React Compiler/第三方eval/动态静态import等警告。styles lint与diff检查通过。全仓pnpm check仍有既存无关技能脚本lint阻塞；没有把定向通过记全仓通过。原生Desktop窗口因Mac锁屏、真实模型因账号暂无供应商仍未完成，未重复请求用户。

### 用户样式反馈后的表单对照复验

- 再次核对用户原截图：全宽字段选择与输入横铺工具栏下方，文档上下文被挤压。当前表单改为300px右Inspector，标题内刷新/关闭，字段选择、类型与去重页码、具名输入与应用状态分层。实际截图`pdf-form-inspector-current.png`，没有仅依据CSS推断成品。
- 420px视口选择country，当前China与“下拉选项 · 第1、2页”可见；body.scrollWidth=innerWidth=420，面板300px，左侧保留文档上下文。截图`pdf-country-inspector-420.png`。嵌套选项第一次Escape仅关闭下拉，第二次关闭Inspector且焦点回到折叠“表单”组；未修改原件，临时viewport已恢复。
- HTML Inspector改造过程中新增CSS import先于文件落地，引起Vite错误缓存；文件存在后重启既有Web dev并恢复页面，未改产品配置或清理用户数据。后续HTML/PPTX实际验收等待对应实现冻结，避免热更新重置编辑历史。

### HTML Inspector与图表独立验收续接

- HTML实际13种HtmlOps均经右侧320px Inspector执行：set_text/set_attr/set_style/set_tag/str_replace/set_text_node/wrap_text/unwrap/insert_html/set_inner_html/replace_element/move/remove。暂存CSS红色加粗预览后切分类恢复蓝色；预览不解锁保存。最终保存、撤销删除并保存、重做并保存及重开均已验证；下载`mimir-html-toolbar-fixture (2).html`独立读回最终h2及空section，临时预览属性不入原件。详细步骤见HTML矩阵。
- HTML宽图`html-inspector-final-wide.png`、420×880图`html-inspector-final-420.png`；窄屏body420/面板320，底部32px主操作保持可达。嵌套Escape后回到折叠工具组已实际确认，临时viewport恢复。独立复核4文件53/53、Office类型及目标lint/format/styles/diff通过。
- PPTX真实slide3插入“工具栏图表验收”，三类别值12/20/16；应用宽柱50、网格、月份/营收（万元）轴标题、暖色方案；分类草稿和当前方案可见。保存→切换行列→保存，下载`01_standard_business (3).pptx`独立ZIP/XML确认3系列[12]/[20]/[16]、gap50、网格与双轴标题。转置后原单系列色被复制为3个ED7D31，未声称生成三色。
- 图表Inspector最终宽图`pptx-chart-inspector-final-wide.png`与420×880图`pptx-chart-inspector-final-420.png`；窄屏336px面板、固定底部应用、可见当前系列和标签。已执行保存后撤销转置→保存→重做→保存；reload后最终回显仍待本段后续确认。录屏只完成mock生命周期及真实WebM上传/双保存，未启动系统采集。
- 独立图表/录屏复核Office4文件109/109、上传noDB6/6，Office与Server类型检查及定向lint/format/styles/diff通过。PPTX96回调矩阵中的其他真实缺口保留；不因图表切片通过而改记全部工具完整。

### PDF绘图几何读回与发现的回显问题

- 实际第3页添加蓝色箭头x40/y60/w120/h60，右转90°→四边裁10pt→A5→保存。下载`mimir-pdf-forms-toolbar-fixture (8).pdf`独立读回稳定drawing ID `29784073-205f-441f-938a-eeb362b31d44`、变换后x441.1634210526315/y33.12078947368421/w66.24157894736845/h132.48315789473685，rotation90、thickness2.2080526315789473、head13.248315789473683。
- 仅改色至#DC2626后保存下载(9)，独立严格比较证明仅color改变，所有精确几何与ID不变，四字段保留。数值显示改为六位有效数字，但显示近似值重新输入/聚焦失焦不改原始精度；独立local17/17及Office类型/目标门禁通过。
- 点击undo后Inspector仍红，但保存下载(10)已恢复蓝色，确认是草稿显示缺陷而非历史字节错误。实现者已定位旧草稿sourceKey回环复活，将修复为源变化时永久清除旧草稿并补蓝→红→保存→撤销/重做回归；此时不记真实浏览器历史回显验收通过。
- 新Web/Desktop生产build已exit0，日志`/tmp/mimir-toolbar-inspector-{web,desktop}-build.log`；Server此前build exit0。PDF草稿最终修复后需重建前端。仍有既存React Compiler/第三方eval/混合import警告；全仓pnpm check既存无关技能lint阻塞未消失。

### PDF草稿回环修复与重开收口

- 根因是`sourceKey === selectedKey`仅隐藏旧草稿，源A→应用B→undo A时旧B草稿重新匹配。实现仅在PdfLocalPanel源身份变化时永久丢弃旧草稿；同源刷新保留未应用输入，不改服务端或历史字节路径。先新增实际Editor输入回归复现，再修复；独立checker补同源刷新/回环/ID与精确宽度断言。最终local18/18、Office类型、两文件lint/format、Antd lint0项、diff检查通过。
- root实际tab7修后redo→undo：Inspector从红同步蓝、底部回到已保存；再次redo同步红、保存成功。reload→第3页→绘图→选择1.箭头后仍为红色，rotation90与精简几何数值正确，保存禁用。最终下载`mimir-pdf-forms-toolbar-fixture (11).pdf`，独立严格deepEqual与(9)红色绘图缓存完全相同，3页/4字段保留。首次下载后立即reload未产出文件，后续只在确认无文件后下载一次成功，未把点击当读回证据。
- 最终实际图`pdf-drawing-inspector-saved-final.png`（1280×880），已目视数值/分组/已保存/选中对象；临时viewport已恢复。新增同类缺陷合同至office/frontend/editors/pitfalls.md。
- PPTX重开后第3页“工具栏图表验收”、月份/营收（万元）、转置后的营收类别与一月/二月/三月系列均在，保存禁用，图表持久化闭环完成。

- 同类草稿风险只读复核：HTML setDocument/undo版本递增，stale控件禁用及CSS卸载清预览；PPTX restore/undo/redo递增revision，普通Inspector按active:selected:version重建。未发现PDF式内容key回环复活，不扩散修改或重复测试。
- PPTX下一片表格改造首次实际1280×720发现行列选择各占整行、首屏预设露出不全；已反馈实施者并改并排/压缩间距，待冻结后一次宽窄确认。固定上游TableStyleEdit及Ribbon实际只提供all/none，旧矩阵“六档边框为上游缺口”判断错误，实施者负责更正；不根据审计误记扩充虚假接口。

### PPTX表格原生格式、历史与首次成品确认

- 实机逐项应用8预设：蓝/灰交替行，以及无样式、浅色网格、深蓝标题行、橙色标题行、简洁无边框、完整边框；每次当前样式与选中态正确。reload排除旧HMR后应用保留样式分类。完整边框保存下载`01_standard_business (4).pptx`独立XML确认9格各四边000000/12700EMU(1pt)，原9格文字保持。
- 在最终冻结代码reload后，实际橙色标题行→选择第2行2列→RTL→浅绿A9D08E底纹/蓝2E75B6边框2.5pt→应用并保存。下载(5)独立XML确认custom style000004、tblPr rtl=1，仅2/2格有直接fill与四边31750EMU，其余8格tcPr为空；所有原文字和图表保留。
- 保存后undo回LTR/混合边框0.75pt，保存→redo回RTL/2.5pt→保存；全程保留样式分类/第2行第2列。首次代码热更新导致历史重置的状态未计入产品结论，最终在UI冻结后重跑。
- 独立checker修复durable组件外部version变化不清草稿，以及迟到成功清新草稿；最终Table13+Editor68=81/81、Office tsc、四TS lint/五format/styles/diff通过。新增合同见pitfalls.md。
- 最终成品宽图`pptx-table-inspector-final-wide.png`（1280×880）、窄图`pptx-table-inspector-final-420.png`（420×880）。8预设完整可见、行列并排、当前选中高对比、应用按钮固定底部；窄屏body=innerWidth=420，按钮311×24。临时viewport恢复。实机嵌套Escape第一下关闭行选项正确，第二下关闭面板但focus=BODY，已交checker补回焦，不把此项记通过。
- 下一形状片首次实机能搜索“星”并插入五角星、保存成功，但标签挤断/主按钮重复文案/插入未选中新对象已反馈独立checker，尚未验收成品。109项/32预设测试不等同真实视觉通过。

### 表格窄屏键盘回焦完成

- 真实420px从“属性与位置”折叠组→对象与幻灯片操作→编辑表格，行Select第一Escape仅收选项，第二Escape关闭Inspector；修复后AX与DOM均确认焦点回到aria-label=属性与位置的BUTTON，不再是BODY。临时viewport已恢复。
- 根因是原子菜单入口关闭后卸载，原aria-label/ref不再可用；Editor记录现有data-section-key来源，关闭时在本编辑器找真实可见组trigger回焦，不改共享壳。独立Table13+Editor69=82/82、Office tsc/目标lint/diff通过；纯空白format待与形状最后冻结统一执行。


### 形状库真实交互与原件读回（本片续验）

- 修正后的图库已真实确认图标/标签纵向、主按钮单一文案；搜索“星”插入六角星后自动选中新对象，检索保留。紫色虚线组合样式应用完成后显示准确当前值，保存→撤销同步自定义→保存→重做同步紫色虚线→保存通过。
- 下载`/Users/admin/Downloads/01_standard_business (6).pptx`独立标准库ZIP/XML确认Shape5为star6、fill FFFFFF、stroke7030A0/12700EMU及dash。再通过图库更改七角星并保存下载(7)，同一creationId保持、仅prst变star7，填充/描边及几何保持；reload→第5页→点击真实对象→打开图库仍识别七角星，保存禁用。
- 宽图`pptx-shape-gallery-final-wide.png`与420×880图`pptx-shape-gallery-final-420.png`确认四列具名预览、固定底部操作、内部滚动。临时viewport已恢复。检索后清空时分类保留，未声称自动跳转当前形状分类。
- 真实验收发现两个额外交互问题并交checker修复：快速fill+Enter提交四个几何字段后原生文件仅x/height正确，旧源完整box覆盖y/width；Apply后立即Save可使宿主版本守卫报错。拟于手动写边界增加同步busy锁及禁用相关写控件/保存，不能把测试动作放慢作为产品修复。另外图库打开后切Ribbon分类，再Escape关闭面板会失去来源入口并掉焦BODY，需要可见当前tab回焦后备。尚未将这两项记为通过。
- Web/Desktop生产build日志`/tmp/mimir-toolbar-final-{web,desktop}-build.log`均已消费最终exit0（6.72s/8.14s）；含已有第三方eval和PDF混合import警告。随后renderer箭头及busy修复会使该构建不再是最终代码，修复后再构建一次。全仓check既存无关技能lint阻塞保持。


### PPTX连续提交、跨分类回焦与箭头补验

- checker以同步ref锁覆盖手动写事务与保存，pending期间禁用两套位置/尺寸、Save、Undo/Redo，含可见“正在应用修改…”和原因；不把旧target/旧box静默排队。延迟宿主、同tick拒绝、失败解锁/重试及当前源逐次读回回归通过，3文件94/94。首次并行tsc的gradient angleDeg缺失由renderer checker已补并最终Office tsc通过，不是保留类型错误。
- root重新载入冻结代码→插入双箭头→依次提交left120/top330/width360/height60；实际AX在处理期间明确禁用全部四字段、保存、撤销/重做并显示等待状态。Save自然等待可用后保存，再应用紫色虚线、保存下载`01_standard_business (8).pptx`。独立ZIP/XML确认creationId6912DA45-70BE-4455-B6C0-5BED4A2794D0、x1524000/y4191000/cx4572000/cy762000EMU（四数均精确对应）、stroke7030A0/12700/dash、headEnd/tailEnd均triangle/med/med。未再丢前面字段。
- root实际从插入打开Gallery后切到对象分类、在组合样式Tab按Escape关闭：DOM/AX均确认焦点回到selected对象Tab BUTTON，未再落BODY。窄屏同分类折叠组回焦后续继续确认。
- renderer最小修复消费headEnd/tailEnd并保留五类端点/旋转/曲线；独立checker补渐变stop alpha，避免fallback首stop透明度整体二次相乘。最终专项10/10、Office tsc、目标lint/format/diff通过。真实画布DOM已含两个独立namespaced marker及start/end引用，画布1pt紫色虚线两端4px三角形；缩略图另有独立namespace。实际已见端点，不仅验证原生XML。
- 另发现原生connector应用紫色虚线后Gallery当前样式显示自定义，尽管XML格式正确；已交图库checker查解析源差异并补回显回归，尚未将该当前值验收记通过。


### 形状当前值和最终视觉收口

- 原生parseConnector将shape fill强制读为none，现仅对连接线的真实stroke颜色+dash能唯一匹配预设时显示名称；紫色虚线可识别，同stroke的彩色描边/浅填充仍自定义，避免臆造不可见填充。已知直/折/曲连接线改中文名称，不泄漏straightConnector1等内部标识。Gallery14+Extended匹配8共22/22专项通过、Office tsc及3文件lint/format/diff通过。两文件全41项中媒体保存状态用例失败已另交checker，不声称41/41。
- root最终reload→第5页→点击持久cxn_1k→插入/形状库：当前形状为“直线连接线”；切组合样式后显示“当前样式：紫色·虚线描边”，已选同名、radio checked、重复应用禁用，保存禁用。此为保存重开后的真实状态。
- 最终图`pptx-shape-style-saved-final-wide.png`1280×880与`pptx-shape-style-saved-final-420.png`420×880：四列预览/具名分类、当前值、固定底部主操作，窄屏body=viewport=420无横溢出。截图已目视，临时viewport恢复；六个验收tab均标记handoff。
- 窄屏实际分类Select第一Escape关闭选项、第二Escape关闭Gallery，回到aria-label形状库BUTTON。跨Ribbon分类回焦当前对象Tab也已真实通过。
- 冻结后的Web/Desktop构建exit0（5.27s/5.97s），日志`/tmp/mimir-toolbar-interaction-final-{web,desktop}-build.log`。仍有既存第三方eval/PDF混合import等警告。目标diff检查通过；全仓check基线、真实模型及原生Desktop限制未消失，不将此片通过记总任务完成。


### 保存等待态收尾修复

- 媒体完整回归确定复现：新busy helper保存开始用等待状态覆盖已有“已插入音频”，结束时清null，使完成提示丢失。checker保留原断言并修正helper仅在状态仍为本次pending文案时恢复原状态；期间若有新状态则保留。exact case修前失败/修后1/1，未弱化断言，产品已再次冻结。最终四文件回归与重建结果待追加。

- 最终独立Editor/Extended/Table/Gallery四文件126/126通过，Office tsc及目标lint/format/diff通过，媒体完成状态回归保留且等待态退出；renderer专项另10/10，不累计为全仓通过。状态修复后已再消费Web/Desktop最终构建exit0，日志沿上一段同名文件；全仓既存技能lint阻塞继续保留。任务及总目标保持in_progress/active，不归档、不暂存、不提交。


### 新一轮PPTX补齐与DOCX独立复验

上一目标轮分类为progress：真实修复并读回连续几何、连接线端点及当前值；未将局部测试记总完成。本轮继续PPTX原审计中三组缺口：绘图工具、四种工作视图、形状/背景渐变及固定纹理。实施者分模块工作、Editor单独整合，之后独立check和实际宽窄屏验证；没有缩小全部工具目标。

DOCX长脚注刷新复验：文档nQJjWOaUbAe0mwKn纸张x304/w600，四脚注区x364/w480，左右均60；实际滚动见1–11→12–24→25起，截图`docx-footnote-indent-final.png`。关闭旧矩阵脚注缩进待验，不改原件。AX包含裁剪续片的完整文本，读屏逐片语义仍需后续处理，未因视觉通过宣称无障碍全过。

### 用户样式反馈的同字段对照

- 再次读取原截图后，实际打开 PDF「交互表单」并选择同一 `country` 字段：右侧300px面板依次显示字段选择、类型/去重页码、当前China及一致状态；应用在无改动时禁用。没有修改原件。
- 新截图 `pdf-form-style-user-feedback-final.png`（1280×880）保留工具栏、文档和右面板上下文。临时viewport已恢复。此证据仅关闭原全宽表单布局问题，不代表PPTX本轮新工具或全部编辑能力已验收。
- 后续功能继续遵守同一验收：紧凑Ribbon、复杂设置右Inspector、当前值与标签明确、操作可达、窄屏无横溢出、Escape/回焦、pending和晚到异步结果保护。PPTX绘图/填充/视图正在整合，冻结后独立check及真实页面验证。

### 本轮用户验收范围追加

用户明确：先完成代码与界面验收；原生Desktop由用户自行验收，本轮只验收浏览器。测试模型配置不再作为当前代码/浏览器收口的依赖，不将手动链路冒充真实模型调用。

### PPTX视图与绘图真实操作

- 浏览视图选择Agenda和Key Results，后移一位并保存；下载`01_standard_business (9).pptx`独立ZIP确认presentation关系顺序为slide1/slide4/slide2/slide3/slide5，两个选择的相对顺序保持。一步undo保存恢复旧序、redo保存恢复新序，reload后仍为新序；纯视图与阅读翻页不dirty。
- 排序宽图`pptx-sorter-final-wide.png`、420图`pptx-sorter-final-420.png`已目视，轻纸边界、双列窄屏、body=420。阅读预检宽/420保存`pptx-reading-precheck-{wide,420}.png`：344×193.5幻灯片与41px底部操作可见，ArrowRight翻页、Escape回普通并回焦折叠模式组。
- 第5页实际指针绘制蓝笔和黄荧光笔；pending明确禁用Save/Undo/Redo及绘图工具并显示处理状态。下载`01_standard_business (10).pptx`独立ZIP确认两张新增PNG 324×81与438×24、两个aislides-ink picture、descr各7采样点/颜色0070C0或FFFF00/宽2或10；已有部件仅slide5.xml及其rels改变，原文字/形状/媒体保持。
- 橡皮擦命中蓝笔整笔后计数2→1，保存；undo恢复2；清本页2→0，保存→undo保存2→redo保存0→undo保存2；reload仍2。宽/420设置菜单截图`pptx-ink-final-{wide,420}.png`，240px菜单与十色、宽度清晰可达，窄屏body420；Escape关闭参数并回到真实“笔迹设置”按钮。

### 填充实机发现与修复追踪

- 初次渐变Inspector实际apply按钮y1171落屏外，四列预设名出现孤字换行。checker已修新两个data-panel的flex高度链与固定footer、两行tone/direction标签；并修色标排序后当前点映射，待最终宽/420确认。
- 第5页星形新增50%紫色#7030A080，45°；保存下载`01_standard_business (11).pptx`独立XML确认3色标0/50000/100000、7030A0 alpha50196、lin ang2700000。不是仅预览。
- 真实木纹应用失败：状态`PPTX 操作 setImageFill 不对 Agent 开放`，原件保持渐变且save仍disabled。之前直接runTxn的组件测试未覆盖真实handle守卫，不能当整合通过。已交原fill实现者沿受限manual图片链修复shape/背景/批量当前图片，保持模型apply_ops白名单；完成后独立check与实际下载继续。


### PPTX 视图/填充/绘图独立检查（2026-10-16）

- 独立复核四视图排序/阅读及Editor接缝、填充/背景Inspector与八原图资源窄同步、绘图pointer→schema→宿主→原生PNG+v1 descr保存与取消/版本路径；没有手改vendor、全量同步或修改其他格式。
- 修复填充卡片样式选择器：ToolbarButton实际为`.me-tb`，原`.me-btn`未命中，使纹理/渐变预览卡片没有预期56/62px最小高度。仅修本片两处选择器，实际宽/420px视觉仍由root复验。
- 修复过期纹理读取失败仍发布到当前版本的错误：catch与成功分支统一校验原epoch仍存活。新增迟到reject在版本改变后不显示旧错误、当前失败仍显示并可重试回归，保留原有版本/卸载不提交回归。
- 同步唯一跨格式合同document-agent.md，明确manual_ink专属手动动作、PNG+aislides-ink/v1 descr、只擦当前页可识别笔迹、混合非法目标原子拒绝和单笔历史/取消；未注册为模型工具，不宣称InkML。
- 最终`pnpm --filter @mimir/office exec vitest run src/editors/PptxEditor.workspace-views.test.tsx src/editors/PptxFillControls.test.tsx src/editors/PptxInkCanvas.test.tsx src/editors/PptxInkControls.test.tsx src/pptx-ink.test.ts src/agent/pptx-agent.test.ts src/editors/PptxEditor.test.tsx src/editors/PptxEditor.extended-tools.test.tsx`：8文件130/130。日志`/tmp/pptx-three-slice-check-tests-final.log`。
- `pnpm --filter @mimir/server exec vitest run --config /tmp/pptx-three-slice-vitest.config.mjs src/test/pptx-manual-ink.test.ts`：1文件5/5。临时配置仅node/fileParallelism=false、无DB global setup，documents依赖mock；原生ZIP/XML/双保存和route合同为真实字节，不等同已登录真实浏览器。日志`/tmp/pptx-three-slice-server-tests.log`。
- Office/Server/Shared `typecheck`均exit0；Office修复后再跑exit0。21个TS/TSX/MJS目标Oxlint零诊断、25文件Oxfmt、五组件分别Antd lint零项、styles守卫与目标diff check通过。Antd CLI首次多文件参数报错后改逐文件执行，未把报错写成功。
- 八PNG `sync-upstream --asset <已声明资源> ... --check` exit0，核验固定commit480548fd55f1be3593ee0d8e316a734751d58309；未重写清单或触碰既有脏vendor。
- 未发现本片其他需修代码问题。原复杂多色标/路径背景直接保真复制仍为明确禁用的能力边界，需后续专片；本片不扩此设计。root继续实际宽/420px、绘图实拖、下载与历史闭环。全仓pnpm check既有无关技能lint阻断、全部编辑工具目标均未由本片关闭。


### PPTX 实机反馈后的检查修复与纹理阻塞（2026-10-16）

- root宽1280×880实测形状填充body为block/overflow auto，fieldset979px导致主操作y1171超出视口。修复为形状填充/设置背景两个data-panel明确flex:1、column、min-height:0、overflow:hidden、padding:0；只有content滚动，actions独立且flex-shrink:0。新增真实Editor挂载并载入实际CSS的整合回归核对两个面板布局链和footer兄弟关系；浏览器几何由root复验。
- root截图确认八渐变卡片“浅色·向下”孤字折行。改为可见“浅色”/“向下”两行，每行两字且nowrap，卡片72px，预览纵排，完整aria-label仍为渐变：浅色·向下。整合测试核对全部八卡片的两行标签。
- root三色标原生下载正确，但apply后的排序使当前stopIndex从50%紫色跳到100%白色。成功提交后按所选stop在排序数组的位置重映射index；真实原生保存测试断言apply后仍选中色标2·50%及原绿色，保留双保存/undo/redo。
- 最终本片Office8文件131/131、Office tsc、四TS Oxlint零诊断、五文件Oxfmt、Fill Antd lint零项、目标diff通过。产品已freeze，未改Editor实现。
- **新发现的未修阻塞**：root实际木纹应用被拒绝“PPTX 操作 setImageFill 不对 Agent 开放”；Fill原测试直接runTxn，未覆盖真实handle白名单。背景image bytes/mediaPath同属此接缝风险，不能因上述门禁称纹理端到端通过。root将交原fill实现者沿受控manual upload/专用manual动作修复批量背景及原图片模式，不放宽模型apply_ops白名单；checker后续独立复验真实Editor→handle→宿主链。


### manual_fill 执行接缝独立复核（2026-10-16）

- 独立检查新增严格shared schema、host action enum/export、Editor applyPanelFill→runManualTool→真实活句柄、manual_fill宿主分派与专属adapter。current没有可注入路径字段，宿主只读取当前目标原生image fill及本ZIP媒体；texture只接受八固定ID与精确PNG SHA-256；背景all由实际页集合构造一个atomic事务。
- 真正模型apply_ops白名单保持；集成测试明确验证setImageFill仍拒绝。专属action与其他手动服务动作共享版本、lifetime signal、响应后取消/当前版本重验、重解析与历史路径。原有fetch后的epoch守卫以及version/unmount不调applyFill回归保留；没有改动此前footer/卡片/色标修复。
- `pnpm --filter @mimir/office exec vitest run src/editors/PptxEditor.fill-host.test.tsx src/editors/PptxFillControls.test.tsx`：2文件11/11。覆盖真实Editor→createPptxAgentHandle→实际applyPptxOpsOnHost，八种形状纹理、当前图片拉伸/平铺、背景all及current all、一次undo、双保存ZIP逐条一致、精确PNG与未改theme/master/layout。文档记录查询为mock，无关model service禁止调用；不等同浏览器/网络模型验收。
- Office/Server/Shared typecheck均exit0；10个目标文件Oxlint零诊断、Oxfmt、目标diff检查和Fill Antd lint零项通过。日志`/tmp/pptx-manual-fill-independent-tests.log`及`/tmp/pptx-manual-fill-check-{office-tsc,server-tsc,shared-tsc,lint}.log`。
- 本次未发现需修产品问题，checker没有修改产品文件，继续freeze供root实机木纹/背景all/保存下载验收。未重跑全131项或全仓check；原复杂背景复制、全部工具缺口及全仓既存技能lint限制保持。


### PPTX 背景原生读回与最终浏览器验收收口

- 用户明确浏览器验收优先、原生Desktop自行验收；真实模型调用待配置，本轮未进行，不再以锁屏/供应商配置阻断代码和界面验证。
- 下载`/Users/admin/Downloads/01_standard_business (14).pptx`，独立Python ZIP/XML确认五张slide均为原生bg/blipFill/tile，内部image11.png SHA-256均为纸张原图`c91102652bf97632c2dd4e3dfc84aac3e6022e59d521557750eaed6e1944e158`；两笔aislides-ink及chart1.xml保留。
- 隐藏背景图形→保存→下载(15)，仅slide1含showMasterSp="0"，五页自定义背景仍在。重置本页→保存→下载(16)，仅slide1的p:bg移除、showMasterSp="0"保留，其余四页背景不动；重置背景没有意外恢复独立的图形可见性。两次undo恢复纸张平铺及显示背景图形，保存reload后Inspector当前值准确且无未保存改动。
- 最终渐变草稿（未应用到原件）宽1280×880与窄420×880截图`pptx-background-inspector-final-wide.png`、`pptx-background-inspector-final-420.png`已目视：八卡片两行完整标签、预览与设置分组、面板content独立滚动、footer固定。宽屏操作y785/817、窄屏同y且bottom841<880；body宽分别1280/420，无页面横溢出。第一Escape仅收起渐变类型Select，第二关闭Inspector，焦点回到窄屏真实“背景”BUTTON。草稿随关闭丢弃，原件仍纸张平铺。临时viewport已清除。
- 冻结后的`pnpm --filter @mimir/web build`与`pnpm --filter @mimir/server build`均已消费exit0，日志`/tmp/mimir-pptx-final-{web,server}-build.log`；Web包含已有第三方eval和PDF混合import警告。此前专项131/131及manual_fill接缝11/11为定向证据，不累计为全仓通过；全仓pnpm check既存技能脚本lint阻塞仍保留。
- 原截图PDF交互表单修后实图`pdf-form-style-user-feedback-final.png`已再次目视：紧凑Ribbon、300px右Inspector、country=China和无变化禁用状态。关闭的是原全宽裸表单布局问题。全部工具目标仍in_progress，复杂多色标/路径背景保真复制、更多放映/Zoom和复杂动画等剩余矩阵项继续保留；不提交、不暂存、不归档。

### PPTX 放映/Zoom/复杂背景独立 checker

详见 `10-11-chat-edit-office/research/pptx-show-20261016.md` 的独立checker段。本次修复Inspector放映启动按钮显式ref及安全回焦、`changed:false`不创建虚假对象撤销round。定向Office8文件71/71；追加no-op专项后受影响3文件44/44（重叠不累计）；Server2文件8/8；Office/Server/Shared tsc、目标lint/format/Antd/styles/diff通过。产品已再次freeze交root做reload后history/focus和最终宽/420实际验收，checker未将组件/原生字节回归冒充浏览器。全仓门禁仍按既存技能lint阻断单列，不宣称完整工具或全仓完成。


PPTX checker追加实机样式修复：Show/Zoom三主按钮原children短文字与primary自动label重复；现只传lucide图标并保留单一完整label，pending沿LoaderCircle/aria-busy。2文件15/15、Office tsc、目标lint/format/Antd/diff通过，产品再次freeze，root接最终宽/420截图。root回报reload后排练完整save/undo/save/redo/save与BUTTON回焦通过，下载21/23逐条目相同，未再复现实机history问题；独立checker不以此宣称整体全工具完成。

### PPTX 放映 / 三类缩放导航 / 复杂背景 / 占位符重置最终浏览器证据

- 用户已明确只验浏览器、Desktop自行验收；模型无配置，按用户要求先完成代码与界面。没有调用真实模型，不继续追问配置或解锁。
- 固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`：show-actions为具名localStorage列表+真实排练advTm；zoom-actions为PNG picture+内部slide跳转、summary建页及p14 sections，不是PowerPoint原生Zoom扩展。WeKnora固定v0.8.3/3e22822c1d2397be730c458c7539d0eb8c113a24的definitions知识检索工具不提供Office Ribbon语义；本次站点HEAD无成功响应，不记成功。
- 主文稿dAKf3a4GLfeyoVMt的原五页顺序为slide1/4/2/3/5。新建“客户演示验收”列表顺序Agenda→Q3，真实播放1/2·幻灯片3至2/2·幻灯片1；保存刷新并插入摘要后仍按path找到现第4页Agenda。显式播放按钮ref修复退出BODY掉焦，最终实际activeElement为BUTTON/播放自定义放映；排练结束因原按钮不再出现，焦点落可用的丢弃排练计时。
- 首次排练保存下载(17)：slide1 advTm17000、slide4 advTm8000。其后undo/save时redo被HMR干扰禁用；独立checker完整保存链未复现。产品冻结后reload再排练，实际记录13/5秒，(21)slide1 advTm13000、slide4 advTm5000；undo/save下载(22)移除advTm、保留原本空transition；redo/save下载(23)与(21)全部ZIP entry字节一致。最终实机redo可用，未更改history实现。
- Slide Zoom：选原第3页Agenda，保存下载(18)：slide1新pic_9r、rId12→native slide2.xml，PNG640×361；实际从头放映点击pic_9r跳到3/5·Agenda。
- Summary Zoom：选原第3/5页，成功新增摘要页并自动选第3页，总6页。下载(19)原生sections摘要节261/Agenda257+258/Thank you260；新增slide6两pic有ppaction://hlinksldjump，关系到slide2/slide5。Section Zoom读取默认节/摘要节/Agenda/Thank you，选Agenda首页插入当前摘要页，下载(20)slide6新增rId7→slide2.xml，原两关系保留。普通幻灯片缩放不dirty的选择草稿在关闭后丢弃。
- 复杂背景夹具上传到专用库“编辑器工具栏验收-20261016”，ID Ex5kzJMIzAh2jMom，文稿名mimir-complex-background-fixture。第一页面板准确显示“路径渐变·4个色标·本页自定义”，有明确“应用到全部会完整保留”提示。真实all→save下载mimir-complex-background-fixture.pptx，独立标准库ZIP/XML确认五页均保留4stops、alpha50000、rect path、tileRect(-5000,6000,7000,8000)。undo/save下载(1)与上传原件全部entry一致；redo/save(2)与应用结果全部entry一致。重复all不dirty；checker修changed:false不得更新manualUndoRound，专项修前失败修后通过。测试文档保留在专用库，不进行永久删除。
- 占位符reset：首次在未移动标题上执行reset没有文件内容变化，不以此证明恢复位置。再真实选择Title 1，位置面板左54→84pt，save下载(4)含原生off x1066800；reset/save下载(5)移除该placeholder explicit xfrm。仅slide1.xml变化，全部a:t文字及非占位符对象逐项相同，theme/master/layout原entry未改。
- 独立checker先修Show/Presentation安全回焦，后修changed:false虚假对象undo。Office8文件71/71、后受影响3文件44/44；Server2文件8/8，三包tsc、目标lint/format/Antd/styles/diff通过。重叠测试不累计。root额外route3/3覆盖manual_zoom独立8m envelope、普通action仍1m、401；extended28/28含真实reset保存/undo/redo/重开。
- 最终视觉又发现primary按钮children短文字和自动label重复（“播放列表 播放自定义放映”等）。仅新Show/Zoom组件替换为lucide图标+单一完整label，pending图标/aria-busy保留；2文件15/15与Office tsc及目标门禁通过，不改共享ToolbarButton合同。最终截图1280×880与420×880：pptx-show-inspector-final-{wide,420}.png、pptx-zoom-inspector-final-{wide,420}.png；复杂背景同名pptx-complex-background-final-{wide,420}.png。目视标题/当前值/目标选中态清晰，content独立滚动，Show footer bottom843.36、Zoom footer809.36/841.36、复杂背景819.36；body.scrollWidth=420，无页面横溢出。Show/Zoom均先Escape收Select，再Escape关Inspector并分别回焦“放映”/“缩放导航”BUTTON。
- 最终图标修复后的Web生产build exit0：/tmp/mimir-pptx-show-zoom-final-web-build.log；Server本片冻结后build exit0：/tmp/mimir-pptx-show-zoom-final-server-build.log。Web仍有已有第三方eval/混合import警告。全仓pnpm check此前无关技能脚本lint阻断保持，不宣称全仓门禁通过。
- 六格式验收tab已重新markHandoff，临时viewport已清。未提交、暂存、归档或标整体完成；动画/文本/形状/输出等剩余矩阵继续，历史段落中的本片旧限制已在当前矩阵更新。

### 2026-10-17 PPTX 动画 / 字符范围 / 副本与讲义浏览器收口

- 继续既有用户授权：仅代码和浏览器，Desktop及系统打印由用户自行验收；模型供应商未配置，未调用真实模型。主文稿仍dAKf3a4GLfeyoVMt，专用“编辑器工具栏验收-20261016”库保留11文档，不永久删除。
- 文字：真实Home+ShiftRight两次选Q3，仅该范围加粗。下载mimir-range-unsaved-copy.pptx独立XML确认Q3 b=1、余下Business Review无b。保存reload后collapsed末尾点加粗只改pending marks，不启用保存。再Q3斜体，下载mimir-range-final-copy.pptx后dirty与undo仍可用；undo→save下载01_standard_business (24).pptx仅保留b，redo→save下载(25)与未保存副本每个ZIP entry字节完全一致。undo仅slide1.xml变化，文字、未知run属性/链接/field/段落保真详见专项回归。
- 动画：标题Gallery淡入→弹跳实际替换后1项并保存；第4页Agenda原path slide2.xml正文三段，选真实SVG text后按段落淡入产生3项，再追加圆形路径成为4项。时间线预览实际第1个WAAPI target paragraph0、500ms；后续动画按setTimeout到时创建，初始只有一个getAnimations是预期。下载(26)原生pgRg段落0/1/2与完整animMotion cubic C/Z/E路径均在。效果/时间线/切换/备注四分类及固定操作区在宽1280和420实测。
- 切换全部：真实淡入应用6页并保存，下载(26)每页p:fade，原slide1 advTm13000/slide4 advTm5000仍在。manual_animation专属宿主不放宽模型apply_ops的50条门槛；helper逐ZIP entry判断changed，重复no-op不增version或history。
- Gallery聚焦预览最终专验：用Shift+Tab落“替换为淡入动画”，等待停止预览入口后保持原焦点立即pressKey(null,Escape)。实际running=0、panel=true、focused=淡入；第二Escape关闭且回真实BUTTON“备注与放映”。先前用停止按钮locator.press会先blur Gallery从而提前停止，不将其作为Escape故障。原始CDP Input不受支持，未继续调用；键盘由CUA实际执行。
- 输出：整份当前未保存原生PPTX自定文件名副本、取消/过期/失败与同步写锁回归；副本只session.save，不调用source.save/commit。打印full/notes/handout2/3/6、方向/边框、已应用备注与首页实际版面。实机6幻灯片/每纸3张显示2张纸；420px完整3缩略图与讲义横线。iframe边框导致的1px内部滚动以高度余量+16修正，实际clientHeight=scrollHeight=371；只保留Inspector body外层滚动。没有实际打开系统打印窗口。打印实现已独立补等待SVG image decode，不以document.images误判所有媒体加载完成。
- 最终截图目录/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51：pptx-text-range-final-{wide,420}.png、pptx-animation-final-{wide,420}.png、pptx-output-final-{wide,420}.png、pptx-print-final-{wide,420}.png及pptx-print-final-420-preview.png。目视无全宽裸表单、文件名整行、单一标签、固定操作；body.scrollWidth=420。输出关闭回BUTTON“导出与打印”。临时viewport已清，六格式tab本turn重新markHandoff。
- 专项证据：动画服务6/6及Office动画/SVG16/16；文字helper/组件14/14；输出checker4文件14/14；独立checker11文件首次119/120，修旧workspace selector后该文件8/8，其余10文件先前通过，不混作单次全绿。HTTP动画route4/4含401/拒客户端XML/保模型51条限制。Editor notes异步等待修后单项动画保存回归通过。
- Office/Server/Shared tsc均exit0；最终+16预览高度变更后组件4/4、目标Oxlint/Oxfmt与全树diff check通过。Web最终build exit0日志/tmp/mimir-pptx-complete-final-web-build.log；server冻结build exit0为/tmp/mimir-pptx-complete-server-build.log。Web仍有既有eval/混合import警告。全仓pnpm check既存技能脚本lint阻断保持，未宣称全仓通过。
- 96回调当前矩阵同步真实字符范围/动画/输出状态，并纠正形状渐变已接。整体目标仍in_progress，不提交、不暂存、不归档；AI快捷预设、拖绘/组内多选、主题gallery、局部段落/bullet和拖裁切等后续缺口仍显式保留。


### 2026-10-17 PPTX 主题图库 / 局部段落 / 形状拖绘（浏览器收口中）

- 继续用户确认的代码与浏览器范围；Desktop自行验收，模型无供应商暂不验真实模型。固定GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 与 WeKnora v0.8.3/`3e22822c1d2397be730c458c7539d0eb8c113a24` 的具体源码、站点查询和适用边界记录在本批三个research，Office Ribbon仍以GenOffice为主。
- 八主题二列缩略图库、真实12色/标题正文字体匹配、点击仅草稿、固定footer明确整份应用；原自定义保留。浏览器应用前保存disabled，应用后dirty，保存下载`01_standard_business (27).pptx`，独立Python ZIP/XML核对theme1 clrScheme name=Midnight、全部12色、Calibri Light/Calibri。面板内Escape回真实BUTTON“主题”。420×880 DOM内宽/scrollWidth均420，完整截图`pptx-theme-gallery-final-420.png`目视固定footer可达。
- 第4页Agenda真实textarea按键选Product updates15字符，Inspector显示第2段；右对齐应用并保存下载(28)，原生slide2.xml仅该段新增algn=r，另外Financial results/Roadmap及标题pPr未改。实机发现成功后范围回整框3段，已交独立checker修复并补重解析中间渲染回归；此处不将先前组件通过当作该问题已通过。
- 真实形状库选择箭头→在画布绘制→从(1050,500)拖到(780,340)。保存下载(29)原生cxnSp xfrm flipH=1/flipV=1，off=(4813753,2721569)、ext=(4247429,2517058)。单次undo/save下载(30)与(28)全部ZIP entry相同；redo/save下载(31)与(29)逐entry相同。420绘制Escape取消不dirty、退出绘制且回BUTTON“形状库”；图库宽1280/窄420截图`pptx-shape-draw-final-{wide,420}.png`，body.scrollWidth=420、固定主动作与直接插入可达。
- 窄屏截图注意：IAB默认截图可能输出缩放画面，fullPage偶发无法捕获；采用CUA截图clip=(0,0,420,880)获取真实尺寸。CDP仅用于临时viewport，最终清除，不修改页面DOM。
- 独立checker本批最初11文件去重92项全部通过，三包tsc/目标lint/format/Antd/styles/diff通过；真实浏览器发现的范围竞态另追加修复，最终数字待冻结后更新。Web/server冻结前build exit0日志`/tmp/mimir-pptx-batch-final-{web,server}-build.log`，最终Editor修复后须重建Web；已有eval/混合import警告及全仓既存技能lint阻断保持。
- 整体任务继续in_progress，不提交、暂存、归档或宣称全部工具已齐。
