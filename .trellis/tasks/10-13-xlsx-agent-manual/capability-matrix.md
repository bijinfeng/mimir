# XLSX 固定版能力矩阵（55 DSL入口已接，完整对标验收未完成）

> 2026-10-17 最终补齐状态（覆盖本文历史待办时点）
>
> XLSX：R1/R2a/R2b及六模式R3特殊粘贴/平铺已实施并原生浏览器保存/history验收，CDATA显示/真实复制/reload已用新构建结清。数据有效性、透视、多级排序、复杂显示、对象管理及320px窄屏工具见最新专报。两旧测试粘贴入口与fakeHost已按现行唯一粘贴/真实special adapter修正，不删native/history断言。
>
> 总范围与逐项证据见 `10-11-chat-edit-office/research/all-tools-final-scope-independent-check-20261017.md`；最终源码质量门见同目录 `final-quality-check-20261017.md`（root第三轮原样pnpm check：4606通过/2既有跳过、exit0，最终Web构建exit0，1764输入起止不变；不沿用旧4231）。用户已选代码/浏览器优先：真实provider未配置，新密码和Desktop自行验收；旧“待两端/待Desktop”不构成本轮新增阻断。明确支持子集与原生复杂结构拒绝仍保留，不宣传任意Office原件全兼容。


上游 GenOffice commit：`480548fd55f1be3593ee0d8e316a734751d58309`（2026-10-13 核对；Mimir 工具栏与专项测试于 2026-10-16 复核）。Agent 工具来源 `apps/sheets/src/renderer/ai/tools.ts`；55 种 DSL 来源 `packages/xlsx-gateway/src/domain/workbook-dsl.ts:903`；手动入口主要在 `apps/sheets/src/renderer/ribbon-actions.ts:195` 和 `App.tsx`。Mimir 使用共享 `XlsxEditor`，宿主为鉴权 HTTP `/api/conversations/xlsx-agent/apply-ops`，两端入口相同；**浏览器已有下述代表性实测，真实桌面仍待验**。WeKnora v0.8.3 的站点、源码与适用性证据见 `.trellis/tasks/10-16-genoffice-editor-capability-audit/research/toolbar-assessment.md`，文件编辑以本固定版 GenOffice 为主参考。

“已接”只表示当前代码和专项测试覆盖；不表示该格式验收完成。独立读回证据：`apps/server/src/test/xlsx-agent-host.test.ts` 使用 GenOffice 样本，检查共享字符串、样式索引、两次保存、未触及 ZIP 条目；`packages/office/src/editors/XlsxEditor.test.tsx` 检查手动工具栏操作后的画布、保存字节和重开。显式公式重算已接官方 `@ironcalc/wasm-xlsx@0.9.0` 隔离worker；仅回写原件公式缓存，未引入Rust sidecar。普通编辑不自动重算，画布仍明确提示旧缓存；详见 [重算证据与限制](research/formula-wasm.md)。


## 当前结论（2026-10-16 最后补全批次）

- 55/55 DSL均已有真实执行入口；“入口已接”包含明确的保护/预算/复杂原件拒绝合同，**不等于所有参数、原件或全部上游手动功能完全兼容**。
- 13个顶层工具中12个由本地画布句柄执行，`create_document`走共享宿主创建桥。8份指南已开放；对象、表格、透视元数据读取已接。XLSX/CSV单表导出读取当前未保存显示值，不含公式/样式。
- 新对象工具为320px持久Inspector；宽区为侧栏，≤800px编辑区覆盖显示，内部滚动。图标入口、3×2类型tabs、位置分组、实色背景、Escape及焦点返回经过主会话真实浏览器复验；420px视口panel x100/w320，body与Ribbon无水平溢出。桌面及真实模型续轮尚未验。
- 手动网格已有二维键盘/Shift扩选/鼠标拖选、全字节撤销重做、剪贴板文本与CSV/TSV预览导入、高级查找、缩放与显示公式。本轮新增本地手动剪切/引用迁移、格式刷/清除格式、自动尺寸、分级、四向填充/等差序列/快速填充，具体语义与未齐边界见下节；不以55 DSL或入口数量替代完整对标验收。

## 后续本地手动补全（2026-10-16）

固定DSL不增加，新增共享严格schema和本地手动执行器；沿已有JSON operations传输，无新增HTTP接缝。入口分为开始“剪切与格式刷”、数据“填充”、布局“尺寸与分级”，均具名320px短菜单；对象属性继续右侧Inspector。实机反馈开始分类11组过密后，本轮收拢为5组：格式、剪贴板、工作表、单元格、查找；格式提供直接粗/斜/下划线、当前字体和字号，缩短组名以避免窄栏截字。共享壳按宽度折叠，未更改通用布局。剪切/格式刷显示源表和范围，源工作簿快照变化后禁用旧源；结果用“已应用”，底部负责保存状态。

| 能力 | 本批支持 | 仍未齐/验收边界 |
| --- | --- | --- |
| 真正剪切 | 同表重叠/跨表原格移动，普通相对/绝对A1和完整矩形引用、其他表从属、命名范围及图表数据引用迁移，跨表公式保留原表外部依赖 | 部分相交范围引用、共享/数组/溢出公式、关联结构相交移动拒绝；没有剪切键盘快捷键/系统剪贴板结构载荷，不能声称Excel完全兼容 |
| 格式刷/清除格式 | 源样式索引及行列继承，单格目标按源矩形展开，多格目标重复样式；实际目标范围在菜单预览，越界禁用。目标内容/公式保留、字符覆盖清除；清除基础样式、富文本字形、所选CF并保留范围外规则；首个sqref锚点改变时平移相对公式，未选单元格效果保持 | 源多run不采集与固定版上游一致；相交合并/扩展CF局部清除拒绝；表格样式/语义链接和验证保持，不是“清除全部” |
| 自动尺寸 | canvas实字体测量整行/列显示文本、换行行高，一次原子写回；最多500行列，合并格不参与 | 不等同Excel字体测量金标；复杂旋转/多run测量仍有限，真实浏览器与桌面待验 |
| 分级/组合 | 行列创建/取消一层、嵌套最多7层、折叠/展开、原件outline与summary属性、预览层级和隐藏 | 与现有筛选/复杂分级组合仍待验；没有Excel完整边缘分级栏 |
| 填充/快速填充 | 四向内容格式/相对公式填充，前两数字等差序列；固定上游flash-fill左侧6列/3示例拼接，读取原始数值而非显示格式，仅填空格，输出按文字写入；单格沿紧邻左列连续数据向下探测（含起点最多1000行、遇空停止、限定工作表尾） | 未支持子串/大小写推断（固定上游同范围）；显式范围仍2000格预算；公式/已有值保留原XML |
| 对象高级控件 | 图表分类/数值轴标题及系列实际显式颜色，主题色明确显示说明；新表可选60内置样式与隔行底色 | 高级透视grouping/filter/pageFields/多值仍只有Agent参数，完整手动面板未齐；复杂图表原件未完整验收 |

保存测试覆盖原始typed值、公式迁移与绝对标记、同表重叠/跨表、命名范围、calcChain失效、格式/CF局部清除、嵌套层级与折叠恢复、字面`=`快速填充和不相交表格保真。组件真实点击覆盖剪切/格式刷/清除/分组折叠恢复/四向填充/快速填充/字体测量/保存重开及坐标轴标题。最终Office定向5文件109/109、server定向4文件44/44通过；最终两边tsc均通过（并行PDF类型问题已消除），focused lint零诊断、改动格式检查和diff检查通过；最后5组合并后Office组件/填充2文件72/72通过。此前主会话已实机确认刷新默认可见“数据”、新表Table1的A2:C5蓝表头与条纹（原黄色显式填充保留），保存ZIP保留原公式及PNG原字节。本轮新手动入口与5组布局的浏览器/桌面实机证据由主会话补验，不提前记通过。

独立检查追加：剪切公式现覆盖小写A1引用，保留函数名称、字符串和跨表源依赖。条件格式拆分新增5项回归，覆盖首锚点下移/右移、离散范围、混合绝对引用、整行列、工作表名和字符串，并比较清除前后未选格的真实条件样式。最新server四文件31/31与Office九文件179/179通过，focused lint零诊断；Office/Server/Renderer类型检查通过；全仓门槛仍由主会话汇总并行批次。主会话420px实机确认内层菜单Escape回到内层按钮，再关闭外层回到“剪贴板”组，body宽420无横向溢出；其余本批工具的实际执行与桌面验收仍按各项记录。

## 13 个 Agent 顶层工具

2026-10-16 单格闪填/矩形格式刷独立检查：修复隐藏数字格式（如`;;;`）下的已有数值被误当空格改写为文字，增加真实OOXML回归覆盖隐藏0/7、false、空缓存公式、显式空字符串和缺格；已有格原XML保持，仅空目标写入。格式刷文档版本更新后的禁用提示改为“文档已更新，请重新拾取格式”，不再误称源被修改。补组件回归覆盖无效选区、陈旧快照、宿主拒绝后保留源供重试；预算覆盖1000行、表尾、2000格临界。Office3文件81/81，server无DB配置1文件19/19，两包tsc、focused lint、格式检查及diff检查通过；真实浏览器证据由主会话另记，未计桌面验收。

| 上游工具 | 模型可调 | Mimir Agent | Mimir 手动入口 | 状态及证据 |
| --- | --- | --- | --- | --- |
| `get_workbook_context` | 上游 yes | 已接 | 工作表页签 | 共享画布句柄；详见专项测试 |
| `read_range` | 上游 yes | 已接 | 网格 | 共享画布句柄；详见专项测试 |
| `aggregate_range` | 上游 yes | 已接，最多100万格，返回非空/空白/不同值/频数/数字统计，公式值为缓存 | “公式→检查→汇总范围数据” | `xlsx-agent.test.ts` 读当前画布；范围汇总使用原始数值，非重算结果。两端实测待验 |
| `load_guide` | 上游 yes | 已接writing/formatting/structure/data/formulas/charts/table/pivot八份当前指南 | 工具说明 | 具体参数、预算和拒绝条件与执行器同源核对；xlsx-agent.test.ts |
| `read_formats` | 上游 yes | 已接，≤200格，读取当前显式样式 | 字体与对齐面板显示单值/混合值 | `xlsx-format.test.ts`、`xlsx-agent.test.ts`；主题tint、字体/填充/边框/对齐/数字格式解析；图案/渐变未接 |
| `read_sheet_features` | 上游 yes | 已接OOXML特征及可用图形/图表/结构化表/透视/迷你图/批注元数据；不返回SVG或图片大字节 | 各任务面板与对象管理 | 元数据计入32K响应预算；固定ID供后续修改，不能把不支持的导入对象当已还原 |
| `read_cells` | 上游 yes | 已接 | 网格 | 共享画布句柄；详见专项测试 |
| `find_cells` | 上游 yes | 已接当前值/公式/正则/公式错误/跨表与单表查找 | 公式→高级查找，可选择范围/查找内容/正则/公式错误，并定位实际格 | xlsx-find.test.ts/xlsx-agent.test.ts；取当前缓存，默认50/上限200；真实高级查找两端待验 |
| `select_range` | 上游 yes | 已接真实画布回调，≤2000格 | A1范围、鼠标拖选、方向键/Home/End/Page/Tab/Enter、Shift扩选 | xlsx-agent.test.ts及XlsxEditor.test.tsx；合并格按真实坐标跳过隐藏行列，pointercancel/up/blur结束拖选 |
| `trace_precedents` | 上游 yes | 已接静态A1、跨表和整行/列引用；命名/动态/外部引用不展开并返回限制 | “公式→检查→追踪引用” | `xlsx-agent.test.ts`；显示当前公式缓存，未重算 |
| `trace_dependents` | 上游 yes | 已接全工作簿静态A1从属公式，返回截断及未解析数 | “公式→检查→追踪从属” | `xlsx-agent.test.ts`；命名/动态/外部引用不展开，与工具结果一起说明 |
| `propose_operations` | 上游 yes | 55 DSL均有入口；重算独立operations:[],recalculate:true | 各任务分类及对象Inspector | 同一FIFO、版本/取消/dirty/保存/轮次回退；各操作具体边界见下表 |
| `create_document` | 上游 yes | 共享创建桥已接DOCX/PDF/Markdown/HTML及当前单表XLSX/CSV导出 | 当前任务未另设新建入口 | xlsx-export.test.ts验证未保存显示值、单表、无公式样式、中文CSV；共享上传/权限/切文档由宿主测试覆盖，真实创建续轮待验 |

## 55 种工作簿 DSL 操作

| 上游操作 | 是否改文档 | 上游执行/手动来源 | Mimir 手动 | Mimir Agent/共用执行器 | 两端/原件读回/失败状态 |
| --- | --- | --- | --- | --- | --- |
| `set_cell` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 格子编辑行 | 宿主网关已接 | 共享 HTTP 已接；专项读回通过；两端实测待做 |
| `set_formula` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 格子编辑行输入 = 开头 | 宿主网关已接 | 共享 HTTP 已接；专项读回通过；两端实测待做 |
| `clear_cell` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 清空按钮（等价 set_cell 空串） | 宿主网关已接 | 共享 HTTP 已接；专项读回通过；两端实测待做 |
| `set_range` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 数据→写入与复制→写入；Tab分列、换行分行，输入预览待应用 | 宿主网关已接，保持数字/布尔/公式类型 | 手动两次保存重开测试通过；主会话桌面D1:E2中文/数字/TRUE写入并保存返回重开通过，截图/tmp/mimir-desktop-xlsx-batch-reopened.png |
| `clear_range` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 数据菜单清空范围内容 | 宿主已接，≤2000格 | 定向测试读回；更大范围预拒绝，两端实测待做 |
| `fill_range` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 数据→写入与复制→复制；可配置源表、源范围与目标范围 | 共用原始XML范围执行器，≤2000格；格式、富文本、类型和相对公式保留 | xlsx-agent-range.test.ts独立XML读回；共享/数组公式及关联结构相交预拒绝 |
| `copy_range` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 数据→写入与复制→复制/筛选复制 | 共用原始XML范围执行器，≤2000格；跨表复制与按缓存值筛选复制已接 | typed缓存、源样式、共享字符串、富文本、相对公式、目标行属性与范围外部件两次保存测试通过 |
| `convert_to_values` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 数据→写入与复制→公式转值 | 共用范围执行器，只移除公式，保留原缓存类型与样式 | 数字/布尔/空串/错误缓存测试与手动保存通过；建议先重新计算，无缓存拒绝 |
| `format_range` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 范围字体与对齐菜单：字形切换、字体/字号、字体及填充颜色、水平/垂直对齐、换行、边框、文字方向、缩进、数字格式与自定义格式 | 共用宿主样式补丁，≤2000格；图案/渐变及部分清除变体未接 | `XlsxEditor.test.tsx` 验证当前值、切换、画布及保存重开；`xlsx-format.test.ts` 验证样式链、主题tint及数字/日期显示；两端实测待记 |
| `sort_range` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 数据菜单的升/降序，明确排序列与标题行 | 自有范围执行器搬移完整单元格XML（原始类型、富文本、样式），用上游translateSharedFormula平移普通相对引用，保留绝对引用 | `xlsx-agent-host.test.ts` 验证公式与样式跨行、范围外格和目标行属性保留、两次保存。shared/array公式，以及合并/超链接/批注/表格/CF/DV/已有筛选预拒绝，原件不变；公式排序键无缓存拒绝。尚不算复杂排序完整对齐 |
| `merge_cells` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | “范围操作”输入完整 A1 范围后合并；目标须完整显示、与现有合并不重叠、非锚点格无内容 | 与 Agent 共用结构网关 | `XlsxEditor.test.tsx` 验证点击后 `colSpan` 即时变化、保存 `<mergeCell>`、重开；会隐藏有内容格的范围在工具栏预拒绝。宿主 Agent 仍可请求更广范围，浏览器/桌面实测待做 |
| `unmerge_cells` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | “范围操作”输入现有合并的精确范围后取消 | 与 Agent 共用结构网关 | `XlsxEditor.test.tsx` 验证点击后网格分开、保存删除目标 `<mergeCell>`、再次重开；精确范围由解析器 `mergeRef` 判定，两端实测待做 |
| `set_row_height` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 布局→行高与列宽→行，显示当前首行值与待应用状态 | 共用宿主结构网关，磅 | 手动行高36pt→网格48px、两次保存XML读回通过 |
| `set_col_width` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 布局→行高与列宽→列，显示当前首列值与待应用状态 | 共用宿主结构网关，像素 | 已有宽度测试与行列显隐两次保存读回通过 |
| `edit_chart` | 是 | `workbook-dsl.ts`；固定上游Ribbon | 管理→图表标题/类型/图例/标签/排列，系列名称/数据/颜色 | 按chartPath补丁；Agent另支持axisTitles | UI图表标题改后即时SVG及两次保存读回；主会话原件XML确认标题 |
| `add_chart` | 是 | `workbook-dsl.ts`；固定上游Ribbon | 插入→对象与表格→图表，九种图表类型/标题/锚点 | 原生图表引用+实际系列缓存；9类SVG可见 | xlsx-agent-objects.test.ts九类创建/编辑/删除与未改ZIP；主会话浏览器已创建中文图表并保存下载 |
| `add_shape` | 是 | `workbook-dsl.ts`；固定上游Ribbon | 插入→形状，当前6种高频形状/文字/填充/锚点 | 原生preset；Agent接受上游形状枚举 | 原件及画布测试；复用PPTX presetPath/presetPolygon，未支持的preset仍有预览边界 |
| `edit_shape` | 是 | `workbook-dsl.ts`；固定上游Ribbon | 管理→形状文字/填充/位置 | 按持久visualId修改，保留原文字run格式和描边填充 | xlsx-agent-objects.test.ts独立XML守护；原生渐变/主题/复杂文字样式画布未完整还原 |
| `add_image` | 是 | `workbook-dsl.ts`；固定上游Ribbon | 插入→图片，设备PNG/JPEG≤8MiB或公开URL PNG/JPEG/GIF | 用户选文件经同宿主imageBlob；MIME+签名+解码/像素预算；拒绝本机路径 | 真实浏览器PNG创建/保存/下载，主会话独立ZIP确认媒体字节完全一致；失败/取消测试 |
| `add_table` | 是 | `workbook-dsl.ts`；固定上游Ribbon | 插入→表格，默认样式；Agent可指定style/bandedRows | 非空唯一标题/至少两行/不与表格或合并格相交 | 原生表定义、默认表头及隔行主题色实际画布；60内置族/自定义dxf样式解析有定向测试，全部Excel视觉非逐族实测 |
| `add_table_row` | 是 | `workbook-dsl.ts`；固定上游Ribbon | 管理→结构化表→插入数据行，确认后执行 | 表内相对行号/count，实际移动所在整行 | 四种表结构操作连续保存/元数据/标题读回；计算列/汇总行拒绝 |
| `add_table_column` | 是 | `workbook-dsl.ts`；固定上游Ribbon | 管理→结构化表→插入表格列及新列名，确认后执行 | 实际移动整列，新标题同步原件表列定义 | 连续保存/标题/表范围读回；至少保留一列；复杂计算列拒绝 |
| `delete_table_row` | 是 | `workbook-dsl.ts`；固定上游Ribbon | 管理→结构化表→删除数据行，确认后执行 | 实际移动所在整行，至少保留一数据行 | 四种表结构操作连续保存读回；其他地址关系由网关迁移 |
| `delete_table_column` | 是 | `workbook-dsl.ts`；固定上游Ribbon | 管理→结构化表→删除表格列，确认后执行 | 实际移动整列与关联元数据，至少保留一列 | 连续保存及至少一列边界测试，真实两端结构变体待验 |
| `add_pivot` | 是 | `workbook-dsl.ts`；固定上游Ribbon | 插入→透视，行/列/值字段、汇总、目标和名称 | 复用buildPivotLayout，真实汇总单元格+原生pivot/cache；Agent另有groupings/filters/pageFields | 多级/列布局/缓存和实际总值测试；源/其他pivot/表格/验证/内容冲突及保护拒绝 |
| `set_rows_hidden` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 布局→行高与列宽→行，隐藏/显示当前范围行 | 共用宿主结构网关 | 手动画布立即隐藏与按保留范围恢复，保存两次读回通过 |
| `set_cols_hidden` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 布局→行高与列宽→列，隐藏/显示当前范围列 | 共用宿主结构网关 | 手动画布col数量变化和恢复，保存两次读回通过 |
| `set_hyperlink` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 审阅→链接、批注与保护→超链接，设置/打开/删除 | 共用特征执行器；http/https/mailto/#表!A1 | 外链与内部链接两次保存、更改、删除及未触及部件测试通过；现有范围超链接按单格修改拒绝 |
| `protect_sheet` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 审阅→链接、批注与保护→保护，显示当前状态；受保护表禁用内容输入 | 共用特征执行器，切换无密码保护，宿主对保护表内容写入拒绝 | 保护→拒绝内容写入→取消→可写测试通过；含密码保护禁止取消；不创建密码 |
| `set_filter` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 数据菜单启用范围筛选，显示当前筛选范围 | 共用宿主set_filter，≤2000格 | `xlsx-agent-host.test.ts` 写回autoFilter；画布隐藏状态从原件读回；两端实测待记 |
| `clear_filter` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 数据菜单清除筛选，未启用时禁用 | 共用宿主clear_filter | 读回移除autoFilter并恢复范围数据行可见性 |
| `set_filter_criteria` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 绝对列字母+每行一个允许值，空行表示空值；可清除此列；未启用时禁用 | 共用宿主值筛选，保留其他已支持列值条件；现有复杂筛选要求先清除 | `xlsx-agent-host.test.ts` 验证隐藏行、保留公式与清除恢复；数据面板在执行/保存中禁用 |
| `add_conditional_format` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 数据→验证与条件格式→条件格式，数字/文字/空白/重复/前N项/公式/色阶/数据条 | 共用属性执行器；保留现有规则追加，支持上游8类规则与字体/填充格式 | 原件CF/dxf、原规则、范围与未触及部件测试通过。面板列出现有规则；当前网格显示数字/文字/重复/空白/top10/安全条件公式/色阶/数据条真实效果；复杂条件公式明确标注未支持 |
| `clear_conditional_formats` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 数据→验证与条件格式→条件格式，带确认清除本表全部规则 | 共用属性执行器；只清普通CF，保留单元格原格式 | 宿主真实调用写回测试通过；含扩展CF时拒绝整体清除 |
| `set_data_validation` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 数据→验证与条件格式→数据验证，普通列表/范围引用/数字/日期/0或1/公式及清除 | 共用属性执行器；保留范围外规则，精确范围替换或删除 | 六种规则写回与两次保存测试通过；部分交叠、扩展规则、列表特殊字符、1904或1900年3月前日期预拒绝。宿主对单格/批量/清空/查找替换做写后差异校验，违规整批拒绝；复杂条件公式不支持时拒绝；导入warning/info规则当前严格处理，非Excel交互完全对齐 |
| `add_defined_name` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 公式→命名范围，填写名称与引用 | 共用属性执行器；新增普通工作簿级名称 | 未改名称及内置打印名称原字节保留；UI当前列表/引用、保存两次读回通过；同名/工作表级/隐藏/内置名称拒绝改写 |
| `delete_defined_name` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 公式→命名范围，选择现有普通名称后删除 | 共用属性执行器；保留其他名称的原XML | 宿主删除读回及缺失名称拒绝通过；工作簿快照保留definedNames已修复 |
| `set_page_setup` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 布局→打印设置，页面/打印范围/页眉页脚分页签；只提交更改的页面字段 | 共用属性执行器；Agent可设置纸张/方向/scale或fit/页边距/打印区域/标题/页眉页脚/分页 | 多项打印设置、内置名称、冻结后再保存保留测试通过；当前不是分页预览，手动页眉页脚明确整组替换为居中 |
| `set_freeze` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 视图→冻结窗格，显示当前顶部行/左侧列数量，支持取消 | 共用属性执行器与真实网格sticky，最多100行/列 | DOM真实固定位置、原件pane、打印设置保留、两次保存重开通过；浏览器滚动视觉仍待主会话验 |
| `set_note` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 审阅→链接、批注与保护→批注，作者/正文/设置/删除；网格标记批注 | 共用特征执行器，保留其他普通批注及作者 | 中文与XML转义、另格批注保留、删除、手动两次保存重开通过；富文本/线程批注预拒绝 |
| `refresh_pivot` | 是 | `workbook-dsl.ts`；固定上游Ribbon | 透视→刷新本表透视 | 当前缓存重算；新增成员同步原生definition/cache与输出位置 | 连续两次刷新含新增成员总值115测试；自动扩展遇自定义数值格式/总计/ext属性、值行布局、选中报告筛选拒绝以保留原件 |
| `insert_rows` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 行列菜单 | 宿主网关已接 | 手动菜单写入并保存读回 A2→A3；两端待验 |
| `delete_rows` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 行列菜单 | 宿主网关已接 | 手动菜单写入并保存读回 C3→C2；两端待验 |
| `insert_cols` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 行列菜单 | 宿主网关已接 | 手动菜单写入并保存读回 A2→B2；两端待验 |
| `delete_cols` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 行列菜单 | 宿主网关已接 | 手动菜单写入并保存读回 B2→A2；两端待验 |
| `add_sheet` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | “新工作表名称”输入及“新增”按钮，创建后切到新页签；空 A1 可编辑 | 与 Agent 共用宿主 `SheetEditPlan`，只接受名称；上游可选 rows/columns 当前显式拒绝 | `xlsx-agent-host.test.ts` 验证新表 ID、空 A1、原 sheet XML 不变、再次写 A1 后两张表均保留；`XlsxEditor.test.tsx` 验证禁用原因、即时页签、空 A1 写入和保存重开；真实浏览器／桌面待验 |
| `delete_sheet` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 工作表管理的带后果说明确认框 | 共用SheetEditPlan | 专项测试保存读回；最后一张表、其他表仍引用时拒绝；全字节撤销/重做可恢复，界面提示已更新 |
| `duplicate_sheet` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 工作表管理→复制当前表 | 共用SheetEditPlan，以原始源部件复制 | 专项测试原始公式和数据复制；复杂图形/透视关系仍须专项保真验收 |
| `set_sheet_hidden` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 工作表管理隐藏/取消隐藏；隐藏表在Mimir页签注明并可选 | 共用SheetEditPlan | 专项测试state读回；导致没有可见表的操作拒绝 |
| `move_sheet` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 工作表管理左移/右移，边界禁用 | 共用SheetEditPlan，单项提交 | 专项测试页签顺序与后续隐藏/删除；两端实测待记 |
| `rename_sheet` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | “工作表名称”输入及“改名”按钮；同名、重复名和非法字符给禁用原因 | 与 Agent 共用宿主 `SheetEditPlan` 写回，单项提交 | `xlsx-agent-host.test.ts` 验证跨表公式随改名更新、未触及 ZIP 条目保真、第二次写入不回滚；`XlsxEditor.test.tsx` 验证页签即时变化、未保存状态、保存重开。真实浏览器／桌面实测待做 |
| `delete_visual` | 是 | `workbook-dsl.ts`；固定上游Ribbon | 管理→删除对象，确认 | 持久visualId删除原生drawing对象，单元格保留 | chart/shape原件与关系连续读回；无sheetId时按所属表核对保护 |
| `delete_table` | 是 | `workbook-dsl.ts`；固定上游Ribbon | 管理→转换为普通区域，确认 | 移除table定义/关系/内容类型，单元格保留 | 存在结构化公式引用拒绝；xlsx-agent-objects.test.ts独立原件测试 |
| `find_replace` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 数据菜单范围文字替换，支持大小写及全格选项 | 上游expandToPrimitiveOps读取真实原始类型后共享单格网关 | 专项测试只改文字，公式与数值类型保留；范围≤2000；未命中时显式提示无变更 |
| `add_sparkline` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 数据→验证与条件格式→迷你图，源为当前范围，目标起点/类型/颜色可设 | 共用属性执行器，每个数据行一个迷你图，保留原extLst追加 | 原件x14组/目标/源引用、已有目标重复拒绝、冻结后再保存保留通过；当前网格以真实源值绘制line/column/winloss SVG，跨表/空值/单点有测试；完整Excel格式选项未全部覆盖 |

## 上游手动命令入口（非 DSL 的代表项）

`ribbon-actions.ts:314–1000` 包括查找、复制/剪切/粘贴、插入工作表、格式刷、条件格式/数据验证、保护、组合/分级、填充、清空、筛选、自适应行列、错误检查、导入 CSV、批注、缩放、冻结、显示公式、公式追踪、插入/删除行列；`:1249–1730` 包括字体/对齐/边框/合并、排序、超链接、闪填、迷你图。部分命令直接调用 Univer 或 App 回调，不可凭 DSL 接入推断已对齐。Mimir 当前手动覆盖见本页“当前结论”及55行表；仍缺剪切引用迁移、格式刷/完整清除格式、自动适应行列、分级/组合、闪填及部分高级参数面板。手动导入、缩放和显示公式已接；不能据DSL数量声称上述非DSL入口完成。

## 当前错误矩阵

| 条件 | 当前行为 |
| --- | --- |
| 未知/未接 DSL 操作 | 宿主在修改前拒绝，画布与原件不变 |
| 工作表 ID 失效或 expectedValue/expectedFormula 冲突 | 拒绝，要求重读 |
| 取消或画布版本冲突 | 拒绝，当前批次不应用；客户端续轮须重读 |
| 共享字符串与已有样式 | GenOffice 网关写内联字符串，保留样式索引；专项测试读回 |
| 公式编辑 | 普通写入后缓存可能过期；显式手动/Agent重算刷新数字、字符串（含空串）、布尔与引擎错误缓存。未支持函数/1904/共享数组/外链等明确拒绝，原件不变 |
| 非当前宿主操作的复杂原件结构 | 图表/形状/表格/透视已有专项原件操作测试；未触及ZIP按清单保留，导入复杂结构仍按具体边界拒绝 |
| 空工作表 | 预览保留空 sheet，并提供可编辑的 A1；手动写入保存读回测试通过。完整空表视图仍待验 |
| 范围格式目标完全不在轻量网格中 | 工具栏禁用，说明无法在当前画布核对；部分目标不可见时执行后明确提示。Agent 宿主可处理的范围比手动可见网格更广，这条限制尚未消除 |
| 合并目标有非锚点内容、现有合并或不可见行列 | 手动工具栏预拒绝，避免把内容隐藏在合并格下或承诺无法核对的画布变化；`merge_cells` 宿主本身没有同等内容保护，Agent 调用仍须单独读回判断 |
| 排序、筛选与工作表管理操作 | 当前55种DSL均有对应入口；复杂排序关联结构预拒绝。隐藏后默认切最近可见表，隐藏表入口仍可发现并可取消隐藏；最后可见表隐藏/删除在控件预禁用并由宿主再次校验 |
| 工作表改名 | 校验非法、空白、未变化和与另一张表大小写等价的名称；`SheetEditPlan` 修改工作簿并改写跨表引用。画布通过重开宿主结果刷新页签；专项测试通过，真实两端待验 |
| 新增工作表 | 校验空白、重复、非法名称，拒绝自定行列尺寸；固定版网关追加空 worksheet、关系和内容类型。宿主读回新 ID 与名称，画布立即切到新页签；专项测试通过，真实两端待验 |
| 超大表、部分批次、Rust sidecar 不可用 | 未接Rust；本批次上限50操作。显式WASM重算限2MiB压缩/8MiB解压/500部件/20000格/2000公式，单worker与20秒硬终止；WASM线性内存没有部署级硬限制，仍未完成会话式大表与全部功能 |

## 2026-10-16 本轮补全与冻结验证

本轮按固定上游落实55/55 DSL入口、13个顶层工具目录和8份指引；这只说明列出的入口已有实现和对应测试，不代表全部参数、导入原件或非DSL手动工具完全兼容。新增能力至此冻结，后续集中独立检查与真实效果验收。

- Office定向10文件134/134通过；server定向9文件61/61通过。覆盖对象/表格/透视写回、范围/保护/DV校验、真实重算、导出、历史保存基线、活跃工作表、合并导航、指针取消、CSV预览和表格样式。
- Office及server的`tsc --noEmit -p tsconfig.json`均通过；XLSX实现与测试的focused oxlint零诊断；本轮57文件oxfmt成功，`git diff --check`通过。完整命令及结果由主会话独立检查复核，不以这些定向检查代替全仓门槛。
- 主会话真实浏览器在文档`RPXy3ORlulEbxuou`创建中文图表并插入用户设备PNG，保存下载后独立ZIP/XML确认图表标题、PNG媒体字节完全一致，两张表与原公式保留。
- 对象工具改为320px持久Inspector，宽区为画布留位，窄区覆盖；六分类为3×2布局，位置字段有可见标签，面板使用实色主题背景。420px真实量测面板宽320px，编辑区与命令带均无水平溢出；Escape关闭后焦点返回触发按钮。截图`xlsx-object-inspector-wide.jpg`和`xlsx-object-inspector-narrow.jpg`由主会话保存。
- 由真实刷新发现的隐藏首表默认打开问题已修复：有效可见`activeTab`优先，否则首张可见表。可见/隐藏/越界/非法值四例组件回归通过；真实页面刷新复验仍交主会话。表格主题色、60个内置样式族及自定义dxf、可见行条纹有解析和画布测试，真实浏览器样式仍待补验，未逐族与Excel做视觉金标对照。

后续本地手动批次已补入剪切及引用迁移、格式刷/清除格式、自动尺寸、分级/组合、填充/闪填，系列颜色控件也已读取显式颜色；当前语义和边界以上方“后续本地手动补全”表为准。剩余包括部分相交范围/复杂公式剪切、相交合并格式刷、扩展CF局部清除、复杂文字尺寸金标与高级透视手动参数。复杂导入形状仍可能矩形回退，复杂条件公式与跨表语义受限，导入warning/info验证当前严格拒绝而非Excel警告后继续；透视扩展遇自定义格式/总计/扩展属性等明确拒绝。桌面端和真实模型工具续轮尚待验收，主任务仍未完成。

## 历史实施快照（以下计数与未接描述仅反映当时，现状以上表为准）

### 2026-10-16 前批次继续实施证据与剩余边界

12个本地Agent工具已有可执行入口；`create_document`仍待宿主跨格式创建路径。新增基础格式的即时可见画布与当前值，数字按明确格式显示（包括日期/百分比），编辑框保留原始值/公式；手动标量输入支持有限数字、TRUE/FALSE，单引号前缀强制文本。数据/格式面板在完整工具执行及保存期间禁用，句柄仍以FIFO串行化，避免快速连续命令丢失。

本轮定向Office七文件105项通过，server XLSX两文件24项通过（含5项真实WASM引擎测试）；focused oxlint零诊断，oxfmt已执行，Office类型检查通过。server生产build通过，直接导入构建后的`dist/services/xlsx-recalc.js`调用真实worker成功；Python XML/ZIP独立读回B1=70、I1=93、H1带空串类型，源公式全部相同，仅工作簿计算属性与目标sheet条目改变。server最新typecheck仅被并行PDF测试`pdf-forms.test.ts:91`的TS2769阻断，已通知对应owner。新增日期系统测试覆盖同序列在1900/1904显示差异、原始值保留、纯时间/时长/数字不偏移以及按原值选择条件格式分段。重算测试故意把70缓存改为999，确认计算并回写70；覆盖依赖链、文本、错误、布尔、空串、未改ZIP部件、两次保存、取消/超时和单worker槽释放。

主会话2026-10-16真实浏览器文件 `RPXy3ORlulEbxuou`：A3:B3斜体、黄色填充、居中有即时画布/当前值/dirty/保存反馈；下载字节用Python独立XML读回 `<i>`、`FFFFC000` 和center，未改C3公式及缓存1001保持。随后复制工作表→选复制表→左移→隐藏→再次保存完成；该后续保存字节、刷新重开与上述两项UI修复的浏览器复验由主会话继续核对，不能据此声称桌面或全部工具通过。

剩余主缺口：全部Excel函数、1904与早期1900日期兼容、自动重算与大表；复杂排序关联结构；图表/形状/图片、表格/透视及删除图形/表格等14种DSL尚未接入；已接属性类的完整画布渲染与高级手动变体仍待补；剪切粘贴/格式刷/通用撤销重做/完整网格选择与键盘导航。不能据12个本地工具的存在声称55种DSL或全部上游手动工具完成。

### 真实浏览器重算、排序与筛选补验

2026-10-16，独立验收库中的 `mimir-xlsx-recalc-browser.xlsx`（文档 `6Rxj2R-onQJfqzTW`）：手动“公式 → 重新计算公式”将B1旧缓存999改为70，保存；随后人工把A1从23改50，再重算得到B1=151、I1=201，第二次保存并下载、刷新。Python标准库独立ZIP/XML断言A1/B1/I1值、H1空串 `t=str`、F1文本 `#N/A` 与E1错误 `#DIV/0!` 类型不同、全部原公式相同、`customXml/untouched.xml` 原字节保留。

同一真实文件在“范围数据操作”指定A3:B5、关闭标题行、按A列升序，画布3/1/2变成1/2/3；再设置范围筛选、A列只保留3，首行标题保留且row4隐藏。再次保存下载和刷新后，独立XML断言B3/B4/B5公式分别平移为A3/A4/A5*10、筛选范围及值3、row4隐藏、旧151计算结果与customXml保留。截图 `/tmp/mimir-xlsx-recalc-sort-filter-reopened.jpg`。

验收发现H1空字符串被误标“未计算”，独立check已修复并由浏览器确认空串显示缓存；保存同版本后计算标记与旧将来时提示亦已反馈修复。默认不换行显示仍在独立check复核；桌面及真实模型续轮尚未验。

### 范围与审阅工具补全（2026-10-16）

当前宿主白名单33/55。新增“数据”“布局”“审阅”分类，操作范围常驻subbar；每个360px弹层按具体任务切换，复用共享ToolbarPropertyForm显示label和分组，使用共享最大高度/滚动/Escape/焦点恢复。批量内容和尺寸有待应用状态，宿主操作结果保留成功/失败反馈。此处是源码与DOM操作验证；改版后真实浏览器/桌面视觉、键盘及内部链接跳转仍由主会话验收，未据DOM测试声称视觉通过。

本批次Office七文件115项、server四文件35项通过；server typecheck通过，Office typecheck仅并行PDF图片测试BlobPart类型错误阻断。xlsx-agent-range.test.ts覆盖公式缓存筛选键、原始类型及样式/富文本/公式复制、空表目标、缓存转值、两次保存和未触及部件；xlsx-agent-features.test.ts覆盖链接/批注/保护、关系和内容类型写回、拒绝条件；XlsxEditor.test.tsx有对应真实手动入口→保存→重开验证。布局检测无发现，真实效果须补验。

### 数据规则和布局属性补全（2026-10-16）

当前宿主白名单41/55，新增属性批次8种DSL全部单项提交。数据规则面板与打印面板按任务tabs拆分，360px宽，复用ToolbarPropertyForm、可见label、当前规则清单、待应用与执行回执。冻结顶部/左列实际使用sticky，表头高度从真实DOM量取，保存重开继续固定；仅有迷你图的空目标按有限预览预算物化占位，不写原件。CF、DV、迷你图保真写回已有专项读回，但当前轻量网格未渲染CF和迷你图，也未强制DV；面板明确说明，不能计为完整视觉/交互对齐。

Office七文件117项通过、server五文件39项通过（随后补普通批注原作者与XLSX转义字符串回归）；Office/server typecheck通过；focused lint无诊断，布局detect[]，oxfmt/diff check通过。新宿主测试实际经applyXlsxOpsOnHost验证白名单、规则映射、保留原件及两次保存。真实浏览器空range开数据tab崩溃已修：删除范围op闭包中的bounds非空断言，先生成安全标量；新增无选区、中文非法、XFE1、A0切换全部范围子面板/行列回归。改版后浏览器与桌面视觉由主会话继续验，尚未宣称通过。

### 本批冻结与浏览器复验

主代理要求本轮固定41/55交独立检查，暂不扩剩余14种DSL，原全量子任务未完成。最终Office七文件117/117，server五文件39/39后新增普通批注原作者与XLSX转义回归5/5通过（合计当前40项）；Office与server类型检查均通过，focused lint已清最后一个测试变量shadow，diff check通过。主代理真实浏览器确认空range进入“数据”分类已不崩溃、写入/复制子tabs与可见label、范围/禁用入口可达；截图/tmp/mimir-xlsx-range-tools-narrow.jpg。属性类新增8项的真实两端视觉、弹层键盘和滚动行为仍交独立验收。

### 2026-10-16 单格闪填与格式刷语义复核

固定GenOffice的 `package-lock.json` 将 `@univerjs/core`、`@univerjs/sheets` 和 `@univerjs/sheets-ui` 固定0.25.1；本次仅下载研究tarball，未添加项目依赖。`FormatPainterController._collectSelectionRangeFormat`只收集`Styles.getStyleByCell(cell)`（`s/interceptorStyle`），不读取`p.body.textRuns`；`_getUndoRedoMutationInfo`先清目标`s`再应用基础样式，单格目标按源矩形展开。`sheets handleStyle/mergeRichTextStyle`清除目标字符覆盖。故源多run不复制与该固定版一致，撤销此前“源混合富文本刷未齐”的错误归类；合并复制仍有差距，当前预拒绝相交合并且不修改原件。闪填源证据为`ribbon-actions.ts:1657–1725`，`FRange.getValues()`读原始值。本轮补单格向下探测与原始值推断，保留已有值/公式原XML。WeKnora版本与适用边界沿用本页顶部证据。

专项验证：Office helper/真实菜单点击2文件10测试；server无DB专项18测试，覆盖单格闪填展开/遇空停止/字面结果及公式、格式刷矩形展开/多run目标清除而源保留/实际基础样式/越界及合并原子拒绝，已有CF锚点平移实际效果回归保持。两包tsc和focused lint通过。新交互的浏览器/桌面实机验收仍由主会话补充，不以组件测试替代。

### 单格闪填与格式刷独立检查及真实浏览器

独立检查补充原始值保护：隐藏格式`;;;`下实际0/7、false及空缓存公式不能被闪填当空格覆盖；版本变化后的格式刷/剪切提示明确为文档已更新并要求重新拾取。Office3文件81/81、Server无DB1文件19/19，Office/Server类型与定向lint/format/diff通过。

主会话真实工作簿`RPXy3ORlulEbxuou`：源A2:B3刷到单格D5，预览D5:E6并应用保存，下载`xlsx-fixture (4).xlsx`独立OOXML确认目标样式与源相同，旧公式/表格保留。A1:B3相交合并时预拒绝且不dirty。又在A10/B10示例“张三/员工：张三”和A11=李四下，以B10单格快速填充得到B11=员工：李四，A12空则停止；保存下载`xlsx-fixture (5).xlsx`独立XML确认B10未改、B11正确、B12不存在、旧SUM/table1保留。截图及完整证据见审查任务`research/validation-20261016-continuation.md`。420px剪贴板嵌套菜单Escape逐层关闭并回正确触发器，body无横溢出。以上仍不代表桌面/真实模型、全部复杂合并和其他剩余语义通过。
