# XLSX 固定版能力矩阵（实施中）

上游 GenOffice commit：`480548fd55f1be3593ee0d8e316a734751d58309`（2026-10-13 核对；Mimir 工具栏与专项测试于 2026-10-16 复核）。Agent 工具来源 `apps/sheets/src/renderer/ai/tools.ts`；55 种 DSL 来源 `packages/xlsx-gateway/src/domain/workbook-dsl.ts:903`；手动入口主要在 `apps/sheets/src/renderer/ribbon-actions.ts:195` 和 `App.tsx`。Mimir 使用共享 `XlsxEditor`，宿主为鉴权 HTTP `/api/conversations/xlsx-agent/apply-ops`，两端入口相同；**尚未进行真实浏览器及桌面实测**。WeKnora v0.8.3 的站点、源码与适用性证据见 `.trellis/tasks/10-16-genoffice-editor-capability-audit/research/toolbar-assessment.md`，文件编辑以本固定版 GenOffice 为主参考。

“已接”只表示当前代码和专项测试覆盖；不表示该格式验收完成。独立读回证据：`apps/server/src/test/xlsx-agent-host.test.ts` 使用 GenOffice 样本，检查共享字符串、样式索引、两次保存、未触及 ZIP 条目；`packages/office/src/editors/XlsxEditor.test.tsx` 检查手动工具栏操作后的画布、保存字节和重开。公式**没有** Rust sidecar 重算；画布把文件缓存结果与无可显示结果分别标明，缓存仍可能旧。

## 13 个 Agent 顶层工具

| 上游工具 | 模型可调 | Mimir Agent | Mimir 手动入口 | 状态及证据 |
| --- | --- | --- | --- | --- |
| `get_workbook_context` | 上游 yes | 已接 | 工作表页签 | 共享画布句柄；详见专项测试 |
| `read_range` | 上游 yes | 已接 | 网格 | 共享画布句柄；详见专项测试 |
| `aggregate_range` | 上游 yes | 未接 | 未接 | 未接，目录不得暴露 |
| `load_guide` | 上游 yes | 未接 | 未接 | 未接，目录不得暴露 |
| `read_formats` | 上游 yes | 未接 | 未接 | 未接，目录不得暴露 |
| `read_sheet_features` | 上游 yes | 未接 | 未接 | 未接，目录不得暴露 |
| `read_cells` | 上游 yes | 已接 | 网格 | 共享画布句柄；详见专项测试 |
| `find_cells` | 上游 yes | 已接当前画布值／公式、正则、公式错误、跨表和单表查找；公式值取缓存 | 当前表查找与 Agent 共用 `findXlsxCells`，工具栏只提供普通文字查找 | 固定版 `tools.ts:396–431,1105–1157` 核对参数及默认 50／上限 200；`xlsx-find.test.ts`、`xlsx-agent.test.ts` 验证未保存状态、截断、版本冲突；两端实测待做，手动高级查找选项待接 |
| `select_range` | 上游 yes | 未对模型开放 | 单格选中；范围输入仅供加粗命令使用 | 当前 Agent 仅返回目标范围，未改变画布选区；没有通用多格选区 |
| `trace_precedents` | 上游 yes | 未接 | 未接 | 未接，目录不得暴露 |
| `trace_dependents` | 上游 yes | 未接 | 未接 | 未接，目录不得暴露 |
| `propose_operations` | 上游 yes | 已接部分操作 | 单格编辑/清空、行列插删 | 写入白名单见下表；其余 DSL 预拒绝 |
| `create_document` | 上游 yes | 未接 | 未接 | 未接，目录不得暴露 |

## 55 种工作簿 DSL 操作

| 上游操作 | 是否改文档 | 上游执行/手动来源 | Mimir 手动 | Mimir Agent/共用执行器 | 两端/原件读回/失败状态 |
| --- | --- | --- | --- | --- | --- |
| `set_cell` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 格子编辑行 | 宿主网关已接 | 共享 HTTP 已接；专项读回通过；两端实测待做 |
| `set_formula` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 格子编辑行输入 = 开头 | 宿主网关已接 | 共享 HTTP 已接；专项读回通过；两端实测待做 |
| `clear_cell` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 清空按钮（等价 set_cell 空串） | 宿主网关已接 | 共享 HTTP 已接；专项读回通过；两端实测待做 |
| `set_range` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 宿主网关已接 | 共享 HTTP 已接；专项读回通过；两端实测待做 |
| `clear_range` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 单格清空（等价），多格未接 | 宿主已接，≤2000 格 | 定向测试读回；更大范围预拒绝，两端实测待做 |
| `fill_range` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 当前格向下填充三格 | 宿主已接，≤2000 格 | 定向测试读回相对/绝对公式引用；两端实测待做 |
| `copy_range` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 当前格复制到右侧 | 宿主已接，≤2000 格；筛选变体未接 | 定向测试读回相对/绝对公式引用；两端实测待做 |
| `convert_to_values` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `format_range` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 当前格加粗；输入 A1 或 A1:B5 范围后“范围加粗” | 与 Agent 共用宿主普通样式补丁，≤2000 格；图案/渐变及部分清除变体未接 | `XlsxEditor.test.tsx` 验证 A2:B2 预览、两格即时加粗、范围外不变、保存 OOXML 和重开；`xlsx.test.ts` 验证 `cellXfs → fontId` 解析。完全不在轻量网格中的范围被禁用，部分未显示格会提示；其他样式未画出，两端实测待做 |
| `sort_range` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 固定版 `workbook-dsl.ts:1618–1650`：≤展开阈值的排序经 `computeSortChanges` 转成仅有 `value`／`expectedValue` 的 `set_cell`，没有源公式和样式；较大排序保留范围操作，而当前宿主无范围级执行器。不能把这种值覆盖说成保真排序；白名单继续预拒绝。含公式、样式、合并、隐藏行的安全排序与真实两端读回均待实现 |
| `merge_cells` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | “范围操作”输入完整 A1 范围后合并；目标须完整显示、与现有合并不重叠、非锚点格无内容 | 与 Agent 共用结构网关 | `XlsxEditor.test.tsx` 验证点击后 `colSpan` 即时变化、保存 `<mergeCell>`、重开；会隐藏有内容格的范围在工具栏预拒绝。宿主 Agent 仍可请求更广范围，浏览器/桌面实测待做 |
| `unmerge_cells` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | “范围操作”输入现有合并的精确范围后取消 | 与 Agent 共用结构网关 | `XlsxEditor.test.tsx` 验证点击后网格分开、保存删除目标 `<mergeCell>`、再次重开；精确范围由解析器 `mergeRef` 判定，两端实测待做 |
| `set_row_height` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 宿主网关已接 | 尚未独立读回验收 |
| `set_col_width` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 当前列 180px 预设 | 宿主结构网关已接 | `XlsxEditor.test.tsx` 验证网格即时宽度、`<col width>` 和保存重开；实际浏览器/桌面视觉待验 |
| `edit_chart` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `add_chart` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `add_shape` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `edit_shape` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `add_image` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `add_table` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `add_table_row` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `add_table_column` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `delete_table_row` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `delete_table_column` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `add_pivot` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `set_rows_hidden` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 宿主网关已接 | 专项测试读回行隐藏属性；手动及两端待验 |
| `set_cols_hidden` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 宿主网关已接 | 尚未独立读回验收 |
| `set_hyperlink` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `protect_sheet` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `set_filter` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 不在宿主 `SUPPORTED_OPS`；需先建立筛选状态与行可见性、保存读回，再开放手动入口 |
| `clear_filter` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 不在宿主 `SUPPORTED_OPS`；参数解析前拒绝，原件不变 |
| `set_filter_criteria` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 不在宿主 `SUPPORTED_OPS`；参数解析前拒绝，原件不变 |
| `add_conditional_format` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `clear_conditional_formats` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `set_data_validation` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `add_defined_name` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `delete_defined_name` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `set_page_setup` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `set_freeze` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `set_note` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `refresh_pivot` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `insert_rows` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 行列菜单 | 宿主网关已接 | 手动菜单写入并保存读回 A2→A3；两端待验 |
| `delete_rows` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 行列菜单 | 宿主网关已接 | 手动菜单写入并保存读回 C3→C2；两端待验 |
| `insert_cols` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 行列菜单 | 宿主网关已接 | 手动菜单写入并保存读回 A2→B2；两端待验 |
| `delete_cols` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 行列菜单 | 宿主网关已接 | 手动菜单写入并保存读回 B2→A2；两端待验 |
| `add_sheet` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | “新工作表名称”输入及“新增”按钮，创建后切到新页签；空 A1 可编辑 | 与 Agent 共用宿主 `SheetEditPlan`，只接受名称；上游可选 rows/columns 当前显式拒绝 | `xlsx-agent-host.test.ts` 验证新表 ID、空 A1、原 sheet XML 不变、再次写 A1 后两张表均保留；`XlsxEditor.test.tsx` 验证禁用原因、即时页签、空 A1 写入和保存重开；真实浏览器／桌面待验 |
| `delete_sheet` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `duplicate_sheet` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `set_sheet_hidden` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `move_sheet` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `rename_sheet` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | “工作表名称”输入及“改名”按钮；同名、重复名和非法字符给禁用原因 | 与 Agent 共用宿主 `SheetEditPlan` 写回，单项提交 | `xlsx-agent-host.test.ts` 验证跨表公式随改名更新、未触及 ZIP 条目保真、第二次写入不回滚；`XlsxEditor.test.tsx` 验证页签即时变化、未保存状态、保存重开。真实浏览器／桌面实测待做 |
| `delete_visual` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `delete_table` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `find_replace` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |
| `add_sparkline` | 是 | `workbook-dsl.ts`；Ribbon/App 按命令映射 | 未接 | 未接 | 调用预拒绝，原件不变 |

## 上游手动命令入口（非 DSL 的代表项）

`ribbon-actions.ts:314–1000` 包括查找、复制/剪切/粘贴、插入工作表、格式刷、条件格式/数据验证、保护、组合/分级、填充、清空、筛选、自适应行列、错误检查、导入 CSV、批注、缩放、冻结、显示公式、公式追踪、插入/删除行列；`:1249–1730` 包括字体/对齐/边框/合并、排序、超链接、闪填、迷你图。部分命令直接调用 Univer 或 App 回调，不可凭 DSL 接入推断已对齐。Mimir 当前接网格选择、查找、公式定位、复制、单格编辑/清空、单格及 A1 范围加粗、合并与取消合并、行列插删菜单、列宽预设和工作表新增／改名；排序、筛选、工作表删除／复制／显隐／移动、常见范围样式的其余命令及完整多格选区仍待接入并逐项验证。

## 当前错误矩阵

| 条件 | 当前行为 |
| --- | --- |
| 未知/未接 DSL 操作 | 宿主在修改前拒绝，画布与原件不变 |
| 工作表 ID 失效或 expectedValue/expectedFormula 冲突 | 拒绝，要求重读 |
| 取消或画布版本冲突 | 拒绝，当前批次不应用；客户端续轮须重读 |
| 共享字符串与已有样式 | GenOffice 网关写内联字符串，保留样式索引；专项测试读回 |
| 公式编辑 | 写入公式并可重开读回；公式缓存尚未重算，不宣称结果已刷新 |
| 非当前宿主操作的复杂原件结构 | 未触及条目按网关清单验证；图表、透视等还没有操作验收 |
| 空工作表 | 预览保留空 sheet，并提供可编辑的 A1；手动写入保存读回测试通过。完整空表视图仍待验 |
| 范围格式目标完全不在轻量网格中 | 工具栏禁用，说明无法在当前画布核对；部分目标不可见时执行后明确提示。Agent 宿主可处理的范围比手动可见网格更广，这条限制尚未消除 |
| 合并目标有非锚点内容、现有合并或不可见行列 | 手动工具栏预拒绝，避免把内容隐藏在合并格下或承诺无法核对的画布变化；`merge_cells` 宿主本身没有同等内容保护，Agent 调用仍须单独读回判断 |
| 排序、筛选或除新增／改名外的工作表管理操作 | 虽在固定版上游 DSL 中，Mimir 宿主 `SUPPORTED_OPS` 与 Agent catalog 均未开放；工具栏不显示无法执行的按钮，须先建立宿主执行及画布同步 |
| 工作表改名 | 校验非法、空白、未变化和与另一张表大小写等价的名称；`SheetEditPlan` 修改工作簿并改写跨表引用。画布通过重开宿主结果刷新页签；专项测试通过，真实两端待验 |
| 新增工作表 | 校验空白、重复、非法名称，拒绝自定行列尺寸；固定版网关追加空 worksheet、关系和内容类型。宿主读回新 ID 与名称，画布立即切到新页签；专项测试通过，真实两端待验 |
| 超大表、部分批次、Rust sidecar 不可用 | 尚未接会话式读取/重算；本批次上限 50 操作，当前不暴露其余工具 |
