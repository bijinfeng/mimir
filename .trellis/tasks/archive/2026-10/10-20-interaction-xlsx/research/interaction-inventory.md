# Research: XLSX 全入口与交互清单

- Query: 当前实际 XlsxEditor 所有交互界面、控件、状态、动态族，以及真实进入方式和 fixture 前提
- Scope: internal（外部参考见 references.md）
- Date: 2026-10-20

## Findings

### 证据结构与计数规则

完整机器索引在 [inventory.json](./inventory.json)。稳定ID由模块/语义标签产生，不依赖源码行号；源码位置与SHA256快照另存。分类为：

- `surfaces`：32 条源码索引记录。
- `controls`：242 条源码索引记录。
- `uiGroups`：63 条源码索引记录。
- `dynamicControlTemplates`：60 条源码索引记录。
- `states`：30 条源码索引记录。
- `dynamicFamilies`：20 条源码索引记录。

上述数量不能相加成为“所有按钮/已实测交互数”。uiGroups是容器和可访问名称，不是动作；控件可能是一个复合组件；dynamicControlTemplates是JSX动态label调用点，不能当成实例总数；dynamicFamilies包含源文档驱动和有界配置族，state是有前提的状态入口。本研究不生成“控件×hover×busy×主题×窗口”的笛卡尔积，也不把它称为覆盖率。`guiVerified:false`为本代理准确状态；主会话观察和自动化验证需在归档覆盖清单独立登记。

索引包含：

- `sourceSnapshots`：研究时生产TSX/helper/CSS/Shell/Agent的路径+SHA256；并行实施可能改变行号。
- `fixtures`：原件来源、导出函数、真实内容和浏览器构建前提。
- `surfaces`：分类入口/页面/Inspector/原生网格/宿主状态；各自列出进入步骤、fixture与来源。
- `controls`：静态label的Toolbar包装控件及静态菜单动作。
- `uiGroups`：字段组、分组、表单容器。
- `dynamicControlTemplates`：如第N级排序/透视值/色标/row或col/当前匹配结果等调用点，保留实际JSX label表达式。
- `states`：loading/error/retry、busy/identity、保护、选择/键盘/拖拽、公式缓存、原生DV、查找结果、对象空态/确认、fill、pivot、clipboard及窄短视口。
- `dynamicFamilies`：实际枚举、实例来源和展开规则；所有source-driven族不假定固定数量。

每个控件附 `entrySteps`、`fixtureIds`、`applicability` 和源码引用。入口步骤与内部mode/task分支需要一起使用；列表不是同时可见的控件集合。

### 全界面入口地图

| 稳定ID | 界面/范围 | 实际进入 | fixture | 来源 |
|---|---|---|---|---|
| XLSX-SURF-HOST | 宿主加载、读取失败/重试、解析失败 | 打开实际XLSX原件 → 加载失败时使用重试 | base | `packages/office/src/editors/XlsxEditor.tsx:630` |
| XLSX-SURF-TOOLBAR | 分类与quick access | 打开原件 → 点击开始/插入/数据/布局/公式/审阅/视图 → 窄工具栏从分类内溢出组进入 | base | `packages/office/src/editors/XlsxEditor.tsx:900` |
| XLSX-SURF-SHEETS | 工作表选择、命名与管理 | 开始→工作表 → 选择实际工作表或工作表管理 → 改名/新增/复制/移动/显隐/删除确认 | cross-sheet | `packages/office/src/editors/XlsxEditor.tsx:1069` |
| XLSX-SURF-GRID | 原生网格、范围选择、复制粘贴 | 点击单元格 → 拖拽或Shift+箭头扩选 → 在canvas上Ctrl/Cmd+C/X/V | base, validation | `packages/office/src/editors/XlsxEditor.tsx:1989` |
| XLSX-SURF-CELL-INPUT | 单元格编辑与验证反馈 | 选单格→底部输入框 → 编辑文本/公式并应用 → 验证触发时确认或取消 | validation | `packages/office/src/editors/XlsxEditor.tsx:1725` |
| XLSX-SURF-FORMULA | 公式显示、缓存、重算与追踪 | 选公式格C3 → 公式→重算/检查/前后公式 → 视图→显示公式 | base, pivot | `packages/office/src/editors/XlsxEditor.tsx:1235` |
| XLSX-SURF-VIEW | 缩放、十字高亮与冻结 | 视图→缩放/显示公式/十字高亮 → 冻结另见property-freeze | base | `packages/office/src/editors/XlsxEditor.tsx:1668` |
| XLSX-SURF-FORMAT | 范围快速格式与字体对齐菜单 | 选择范围→开始→字体与对齐 → 快速字体/字号或打开字体与对齐菜单 | base, fill | `packages/office/src/editors/XlsxFormatControls.tsx:69` |
| XLSX-SURF-MANUAL | 格式刷、填充、自动尺寸/分组 | 开始→格式刷/清除格式 → 数据→填充 → 布局→自动尺寸与分组。三个group是互斥入口 | base, pivot | `packages/office/src/editors/XlsxManualControls.tsx:74` |
| XLSX-SURF-RANGE | 批量写入、复制/填充、公式转值、行列尺寸显隐 | 选范围→数据→范围写入与复制 → 布局→行列尺寸与显示 → 再选子分类 | base, cross-sheet | `packages/office/src/editors/XlsxRangeControls.tsx:117` |
| XLSX-SURF-DATA | 多级排序、筛选、范围替换/清空Inspector | 选A1:F6→数据→范围数据操作 → 在面板切换排序/筛选/文字 | pivot | `packages/office/src/editors/XlsxDataControls.tsx:79` |
| XLSX-SURF-OBJECTS | 对象Inspector外壳与类型导航 | 插入→图表、形状与结构化表 → 点击类型分类 → 关闭按钮/Escape返回触发器 | pivot | `packages/office/src/editors/XlsxObjectControls.tsx:101` |
| XLSX-SURF-OBJECT-CHART | 从范围创建图表 | 选择包含标题的数据范围→插入→对象→图表 → 填锚点/类型/标题→插入 | pivot | `packages/office/src/editors/XlsxObjectControls.tsx:179` |
| XLSX-SURF-OBJECT-IMAGE | 设备与公网图片插入 | 插入→对象→图片 → 填有效锚点 → 选设备PNG/JPEG或填写http(s)图片URL→插入 | base | `packages/office/src/editors/XlsxObjectControls.tsx:228` |
| XLSX-SURF-OBJECT-TABLE | 结构化表创建 | 选含标题数据范围→插入→对象→表格 → 名称/原生样式/隔行底色→插入 | pivot | `packages/office/src/editors/XlsxObjectControls.tsx:267` |
| XLSX-SURF-SHAPE | 原生形状画廊与文本框 | 插入→对象→形状 → 搜索/分类/键盘选择形状 → 设置文字/锚点/填充→插入 | base | `packages/office/src/editors/XlsxShapeGallery.tsx:28` |
| XLSX-SURF-PIVOT | 透视表创建、原件回读、刷新、编辑布局 | 在汇总工作表→插入→对象→透视表 → 来源选销售源A1:F6 → 在字段/值/筛选配置 → 已有透视表需先创建或载入原件 | cross-sheet, pivot | `packages/office/src/editors/XlsxPivotControls.tsx:144` |
| XLSX-SURF-MANAGEMENT | 对象/结构化表管理与确认 | 先用真实操作创建chart/shape/image/table → 插入→对象→管理，或选中已有对象 → 选择任务/target | generated-objects | `packages/office/src/editors/XlsxObjectManagement.tsx:98` |
| XLSX-SURF-VISUAL-PROPERTIES | 图表属性/系列数据/颜色与形状属性 | 先创建图表或形状→管理→当前对象 → 图表子任务属性/系列数据/系列颜色 | generated-objects | `packages/office/src/editors/XlsxVisualProperties.tsx:26` |
| XLSX-SURF-CLIPBOARD | 原生范围剪贴板与外部HTML/CSV/TSV | 开始→范围剪贴板 → 复制/剪切范围或读取系统剪贴板/导入文本 → 选粘贴方式→粘贴 | base, pivot | `packages/office/src/editors/XlsxClipboardControls.tsx:126` |
| XLSX-SURF-FILL | 填充Inspector，主题/图案/渐变 | 选已有填充范围→开始→填充 → 填充类型切换无/纯色/图案/线性/路径 → 修改后应用 | fill | `packages/office/src/editors/XlsxFillControls.tsx:452` |
| XLSX-SURF-CELL-FEATURES | 链接、批注和工作表保护 | 选单格→审阅→单元格链接批注与保护 → 选择链接/批注/保护子分类 | base, cross-sheet | `packages/office/src/editors/XlsxCellFeatureControls.tsx:47` |
| XLSX-SURF-FIND | 高级查找与结果导航 | 开始→高级查找 → 输入文本或启用公式错误 → 选择范围/内容 → 搜索→结果按钮 | base, cross-sheet | `packages/office/src/editors/XlsxFindControls.tsx:13` |
| XLSX-SURF-INSPECT | 只读范围汇总与公式追踪 | 选择范围或单格→公式→检查 → 汇总/追踪引用/追踪依赖 | base, pivot | `packages/office/src/editors/XlsxInspectControls.tsx:10` |
| XLSX-SURF-PROPERTY-RULES | 数据验证、条件格式与迷你图 | 选范围→数据→数据规则 → 切换验证/条件格式/迷你图，填对应字段 | validation, pivot | `packages/office/src/editors/XlsxPropertyControls.tsx:167` |
| XLSX-SURF-PROPERTY-NAMES | 工作簿命名范围 | 公式→命名范围 → 新建名称+引用，或选择现有名称删除 | validation, cross-sheet | `packages/office/src/editors/XlsxPropertyControls.tsx:460` |
| XLSX-SURF-PROPERTY-PRINT | 页面、打印区域、重复标题、页眉页脚 | 布局→打印设置 → 选择页面/区域/页眉页脚对应分支并应用 | base | `packages/office/src/editors/XlsxPropertyControls.tsx:502` |
| XLSX-SURF-PROPERTY-FREEZE | 冻结窗格 | 视图→冻结设置 → 顶部行数/左侧列数→应用 → 有冻结时可取消 | base | `packages/office/src/editors/XlsxPropertyControls.tsx:645` |
| XLSX-SURF-VALIDATION-OPTIONS | 原件数据验证提示Inspector | 数据→验证提示 → 选择原件规则 → 设置输入提示/错误行为/下拉显示→应用 | validation | `packages/office/src/editors/XlsxValidationOptionsControls.tsx:17` |
| XLSX-SURF-VALIDATION-LIST | 单元格原生验证下拉 | validation fixture汇总A1/A2/A3/A4 → 点击下拉或Alt+Down，方向键/Home/End并Enter/Space → Escape/Tab返回 | validation | `packages/office/src/editors/XlsxValidationDropdown.tsx:15` |
| XLSX-SURF-OBJECT-LAYER | 网格中的图表/图片/形状选择 | 先创建真实对象 → 网格中点击图表/图片/形状叠层按钮 | generated-objects | `packages/office/src/editors/XlsxObjectLayer.tsx:12` |
| XLSX-SURF-STATUS | 保存、history、错误/忙态与原件身份 | 修改原件→保存/undo/redo → 通过fixture延迟IO或失败IO观察busy/error → 替换source验证取消旧请求 | base | `packages/office/src/editors/XlsxEditor.tsx:553` |

### 实际控件组织与行为合同

**分类/工作表/网格**

- XlsxEditor分类home/insert/data/layout/formulas/review/view；home合并为字体、剪贴板、工作表、单元格、查找五组。实际宽度决定直接显示或组溢出，不按viewport推断可用空间。quick access保存/撤销/重做独立于分类。`XlsxEditor.tsx:900–946,2731–2749`。
- 工作表选择由原件sheet数组与activeTab决定；隐藏/保护名称真实显示。重命名/新增31字符约束、复制、左右移动边缘禁用、隐藏保留至少1可见表、删除需确认且宿主引用校验。`XlsxEditor.tsx:1069–1232`。
- 网格实际物理坐标/合并anchor，非文本查询序号。键盘arrows/Home/End/PageUp/PageDown/Tab/Enter，Shift扩选；拖选只有启动指针能延伸，pointerup/cancel/windowblur终止。canvas复制/剪切/粘贴不劫持表单输入；外部HTML/纯文本失败提供真实状态/剪贴板回退。`XlsxEditor.tsx:195–213,1989–2470`。
- 源单元格格式/font/fill/条件格式、hidden/merge/filter、sparkline/notes/hyperlink/对象叠层均由原件派生。公式只有缓存或明确未计算，普通写入不能冒称自动重算。显式重算/显示公式/前后公式/汇总/引用和依赖均已有真实入口。

**范围、格式与规则**

- Format：快速字体/字号；完整字体、字号1–409、bold/italic/underline/strike、字体/底色、水平/垂直对齐、wrap、边框、方向、indent±1（0–250）、7numberpreset+custom。高级420px表单保留原件混合/默认值，不把unknown当成默认。
- Manual：home格式刷capture与workbook identity；source过期要重新capture；清除格式不删除内容/公式。data六种fill；flash读取左侧≤6列/≤1000行样例。layout基于canvas实际字体autosize，分组/取消/折叠/展开rows或columns。
- Range：批量Tab/换行解析，≤500行/100列/2000格；源工作表/范围复制、平铺、过滤复制为cachedvalue；公式转缓存值明确缺缓存；行高pt/列宽px及显隐保持native单位。
- Property：验证6type、条件格式8type、sparkline3type；命名范围只展示可管理全局name（过滤hidden/_xlnm）；页面方向/纸张/缩放/页边距、打印范围/重复标题、页眉页脚；freeze顶部行/左列。所有type动态字段分支在JSON applicability记录。
- CellFeature：link接受http/https/mailto/#internal；原生富批注不可冒充普通可编辑文本；保护/含密码不能取消保护为真实只读边界。未发现XlsxEditor通用readonly prop，不虚构“全局只读模式”；保护/unsupported/无宿主能力分别列状态。

**成熟Inspector**

- Data：1–8级排序且每列唯一，标题行/排序顺序/上下移动/删除；筛选启用/清除/值列表（空行=blank）；范围替换/清空。mode切换取消当前请求，body滚动+fixedfooter维持。
- Clipboard：native范围identity/capture/stale；cut只全部，external只全部或显示值；读取系统/HTML或≤1MiB CSV/TSV；其他native选择性格式/公式/列宽/除边框模式不伪装支持外部HTML。
- Fill：none/solid/pattern/linear/path，RGB/theme与tint，渐变2–10色标，mixed/unsupported明确原件；关闭/source/context abort。未知fill保留原件，不能只为了视觉清爽重写成白色。
- Shape：104原生预设+textbox共105；真实测试 `xlsx-shape-gallery.test.ts:24–26` 对照vendor whitelist，`XlsxShapeGallery.test.tsx:90`验证105radio。分类/search/4列roving/Home/End/方向键；anchor边界、≤1000字符文本、HEXfill；不带PPTX-onlylines。
- Pivot：source含hidden但保护源禁用，实际activeTab决定输出；字段/值/筛选；源标题非空且唯一、源≤2000格且包含至少一行数据、公式必须cached；已有原件回读/eligibility、刷新、允许布局编辑。5aggregate、4showAs、4grouping、6filter，values1–8、group/filter≤8、reportfields≤4是各自有界族。editing分支不新增group/filter，不等于从头重建任意透视表。
- Management：现有object/table target；图表properties/series/color、形状text/anchor/fill、结构化表row/col操作及转普通范围。task/source/selection身份和abort；内部confirmation先消费Escape；fixedfooter单primary。
- ValidationOptions：选择原件规则，inputprompt（32/255字符）、stop/warning/information/off、原生showDropDown反向语义；unsupported只读；pending/abort/重复请求保护、独立footer。

**原生验证与宿主状态**

- 原生验证下拉包括inline/crosssheet/global/scoped名称，literal001和=A1保持字符串。AltDown/arrow/HomeEnd/Enter/Space/Escape/Tab、hover、外部scroll/resize关闭；定位来自实际cell且列表不超viewport。
- inputprompt与errorprompt不同；stop拒绝，warning/information可确认或取消；切格/工具/保存/source变化必须失效旧确认。禁止复制旧确认去写新单元格。
- 保存先flush真实handle，再捕获version，source.save成功只在同handle/version标记saved。pending期间新draft/history不能被旧保存抹掉。读取失败/解析失败不是空表；本源码无独立“空workbook成功”界面，缺session/sheet走读取/解析状态；管理无对象和无验证规则才有明确empty入口。

### 精修边界与局部缺口

详见 [polish-findings.md](./polish-findings.md)：

1. 旧chart/image/table表单主动作在滚动内容中，390×400可越出panel；只整理这三类fixedfooter/body。成熟shape/pivot/edit保持既有结构。
2. 图片设备按钮原先只有图标和可访问名，补实际可见文字。
3. Find的请求/结果与source/sheet/version缺失身份失效；保留菜单，仅结果/状态/忙态局部打磨和生命周期防护。
4. 24个本地ToolbarSelect遗漏显式busy或protected锁，7组件；不扩展到底层Shell、不改变只读zoom。原生ColorPicker trigger/fieldset与AntdSelect分别对待。

### 真实fixture与最小验证

- 基础原件直接读取vendor XLSX；其C3缓存公式和中文/转义文本用于选择、格式、查找、formula、保存。
- pivot/crossSheet helper从真实ZIP改造：销售A1:F6、未知customXML、Z2缓存3；5sheet包括长中文apostrophe、默认汇总activeTab1、保留第三表、隐藏和保护源。隐藏/跨sheet/源身份必须用这个实际fixture，不用假DOM重命名标签。
- fill helper包含theme/tint/未知XF/ext、真实Calibri12bold与CF。
- validation helper覆盖literal列表和scope名称、隐藏下拉、input/errorprompt、warning/info/off/unsupported。
- 对象管理fixture从以上字节经真实宿主add操作产生chart/image/shape/table；不能假定base天生含对象。Node helper含node:fs，浏览器Demo需先构建/序列化bytes。
- 复用fill/pivot/clipboard/validation/sort/management-cancel现有真实测试，保留fullZIP save/undo/redo、异步取消、窄宽切换draft和source保护。新增测试聚焦changed behavior：Find staleversion/source/sheet/close、双Enter同步锁；Select protected/busy不得改草稿/提交操作；chart/image/table footer和visiblebutton由真实浏览器验收。

### Related specs and external versions

- `.trellis/spec/project/rules.md`：工作分工、用户批准边界；AGENTS要求完成后真实HTML前后对比与commit（本研究代理不执行git）。
- `.trellis/spec/office/frontend/editors/{conventions,pitfalls}.md`：真实宽度、Inspector、原件状态和身份取消。
- `.trellis/spec/office/frontend/shell/{conventions,pitfalls}.md`：复合控件disabled、可见字段名、嵌套popup/focus/短高视口。
- `.trellis/spec/office/engine/conventions.md`：vendor固定/原件保真/宿主能力。
- [references.md](./references.md)实查WeKnora官网、最新release v0.8.3及commit `3e22822c1d2397be730c458c7539d0eb8c113a24`；领域主参考Excel web、Google Sheets与GenOffice固定 `480548fd55f1be3593ee0d8e316a734751d58309`。HTTP不作为GUI观察证据。

## Caveats / Not Found

- 当前为源码入口库存，不等于完成全部GUI验收；每条记录标source-only。主题/viewport/hover/focus/busy均需有可到达前提，不能笛卡尔相乘来冒称覆盖。
- 母会话正在并行实施，sourceSnapshots哈希识别此研究快照；最终HTML sourceMap可按稳定ID更新行号。
- 未发现通用readonly属性或独立空workbook成功页面；真实只读边界为保护/密码/unsupported/宿主缺失，实际empty为对象/规则/查找/画廊等。
- 共享Shell菜单/色板内部按钮不重复计作XLSX独有新功能；nativegrid/DV/object按钮由surface/state/family显式列出，不能只拿Toolbarlabel列表当“所有交互”。
- 准确静态源码记录数量已单列；动态任意source实例、外部图片网络/系统剪贴板权限、Excel完整打印/渲染能力没有凭空补造。
