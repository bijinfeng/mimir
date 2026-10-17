# XLSX 现有透视表布局编辑实施

日期：2026-10-17。执行批准的 `research/xlsx-pivot-edit-plan-20261017.md`。本片生产代码已冻结，交主会话独立检查与最终浏览器保存/history验收。整个「所有工具补齐」任务仍未完成；本报告只证明本片。

## 已实现

- 增加本地 strict `edit_pivot_layout` 手动合同，目标由当前输出 sheetId + pivotPath 定位；只接受行字段、列字段、五种聚合的值列表。来源、范围、名称、输出起点和缓存身份均由原件派生。固定上游 Agent catalog 不增加工具，不改 vendor。
- 当前工作字节绑定 handle/version 后读取资格。浏览器安全的只读 helper 检查默认 SpreadsheetML 命名空间、有序 XML AST、未知属性/节点、关系、内容类型、缓存/记录独占、原字段/成员、输出格式及结构、来源与目标保护。AST基线只构造内存语义树，不生成XML、不导入gateway writer。Server再次从bytes检查，并和实际固定writer的完整原生输出进行独立语义比较。
- Server 专用 adapter 在通用 manual 分流处处理。无变化、无效维度、共享缓存、未知原件、保护、输出冲突和预算超限原子拒绝。来源公式使用当前已计算缓存。
- 构造真实新区域全部格 + 旧区域减新区域空格的集合；去重、并集最多2000格，避免高窄/矮宽转换时写入外角。通过一次gateway relayout保留name/cacheId/table/cache/records路径和关系ID；零新透视part，一次结果、一版本、一history发布。
- 生成后独立比较完整非目录部件inventory：仅目标worksheet、指定table/cache/records及受约束计算状态可变；其它entry字节精确。workbook只允许fullCalcOnLoad变更；关系/内容类型只允许已知calcChain清理。再次读回字段、缓存、输出ref和每个矩阵格，并验证范围外原格XML。
- Inspector 显式「编辑布局」进入草稿，回显原字段顺序和实际聚合；位置与名称只读。编辑态隐藏数字格式/显示方式及新增分组筛选，防止输入被忽略。未变化禁用应用。固定footer仅一个primary「应用布局」，可见的次动作「取消编辑」与其同行；长错误在footer内滚动。
- 选择器Escape只关闭下拉；下一次取消草稿并回编辑入口，再次关闭Inspector回可见Ribbon入口。取消、关面板、切表/文档/版本及过期资格读取废弃旧请求。自身成功发布不自取消。失败保留草稿和真实原因。视口变化保留草稿。

## 文件

- `packages/shared/src/xlsx-agent.ts`：strict manual schema/type。
- `packages/office/src/xlsx-pivot-editability.ts`：只读原件资格/安全结果及输出范围格式检查。
- `packages/office/src/editors/XlsxPivotControls.tsx`、`xlsx-pivot-controls.ts`、`xlsx-pivot-controls.css`：显式编辑模式、真实值、取消/提交及布局。
- `packages/office/src/editors/XlsxObjectControls.tsx`、`XlsxEditor.tsx`：绑定当前工作bytes/版本的资格读取接缝。
- `apps/server/src/services/xlsx-pivot-layout-edit.ts`：专用原件adapter。
- `apps/server/src/services/xlsx-agent-host.ts`、`xlsx-manual-ops.ts`：本地分流、取消/preflight及范围工具独立类型守卫。
- `packages/office/src/editors/XlsxPivotControls.test.tsx`、`XlsxEditor.pivot.test.tsx`、`apps/server/src/test/xlsx-pivot-layout-edit.test.ts`：专项验证。
- `research/xlsx-pivot-next-plan-20261017.md`：更正worksheet关系术语，见下节。

## 验证证据

最终命令均exit0：

| 验证 | 结果 | 日志 |
| --- | --- | --- |
| Office `exec vitest run src/editors/XlsxPivotControls.test.tsx src/editors/XlsxEditor.pivot.test.tsx src/editors/xlsx-pivot-controls.test.ts --maxWorkers=1` | 3文件26/26 | `/tmp/pivot-layout-ui-target-final.log` |
| Server `exec vitest run src/test/xlsx-pivot-layout-edit.test.ts src/test/xlsx-agent-pivots.test.ts --maxWorkers=1` | 2文件33/33 | `/tmp/pivot-layout-native-target-final.log` |
| Office typecheck | 通过 | `/tmp/pivot-layout-office-types.log` |
| Server typecheck | 通过 | `/tmp/pivot-layout-server-types.log` |
| 本片12个TS/TSX文件oxlint | 无diagnostic | `/tmp/pivot-layout-oxlint-final.log` |
| 本片13文件oxfmt --check + check-style-backticks | 通过 | 当前tool exit0 |

专项证明包含：

- 真实add_pivot原生基线，平均/求和→有列单值→无列多值，多次编辑后刷新。核总计150和原身份、源表/第三表/customXml/styles/sharedStrings字节保留。
- 高窄→矮宽和反向，外角文字/公式/自定义样式XML精确保留；新增区有内容拒绝；changedCells集合无重复。
- raw XML独立变体拒绝：numFmt2/164、style/caption/总计、自定义/未知属性、extLst、隐藏项、分组、公式、报告筛选、filters、重复节点。另测External records、重复关系、unknown records、来源成员变化及输出自定义样式。
- 来源/目标真实保护、共享cache、跨sheet路径绑定、额外source/target/cacheId、混批、no-op及abort均拒绝，输入bytes不变。
- 真实挂载Editor→真实host一次应用/版本/history，save→Undo/save→Redo/save全部非目录entry精确比较；重新进入回显保存后的聚合。
- 资格A→B→A迟到结果弃用、取消pending、关闭Inspector后迟到有效host结果不发布。

主会话已报告5173真实浏览器预检（不是本片最终保存验收）：fixture文档 `j3Uv7JN14w6XKVnp`，1280/420×500原生字段和平均/求和回显、长来源换行；修复前cancel空白和额外一行，修复后次动作/primary同行、底部缩短32px；Select/Escape逐层回焦正确。最终生产构建、真实保存/下载/native/history及截图由主会话记录，不能以本报告代替。

## 稳定验收fixture

- `/tmp/mimir-xlsx-pivot-layout-supported-20261017.xlsx`：长中文带空格和引号来源，现有「原有销售透视布局验收」，行区域→部门、平均金额+求和成本，General/default原生基线。
- `/tmp/mimir-xlsx-pivot-layout-readonly-20261017.xlsx`：同原件增加未知extLst，编辑入口须拒绝并说明未知原生扩展。
- fixture由专项测试实际writer生成。测试重跑会再写本地fixture；浏览器已上传实例的精确原件应以该实例自身下载/取回bytes作baseline，不以整份ZIP压缩字节的时间戳变化推断内容变化。

## 原件兼容边界与剩余功能

- 本片支持可证明的General/default简单现有透视布局，**不代表任意Excel透视均可编辑**。自定义样式/数字格式/标题/总计、分组/筛选/报告字段/计算字段、隐藏成员、特殊值行、共享cache、关联slicer/timeline/pivotChart及未知扩展仍只读并给具体原因。这是保真资格，不把这些理由一律算作GenOffice功能缺口；若要扩大兼容须逐项增加原生writer与验证。
- 使用固定gateway真实合同：编辑后records清空，recordCount0、refreshOnLoad1。Mimir原生定义与网格已更新；没有宣称预填完整records，也没有实测Excel/LibreOffice效果。
- 未新增迁移来源、范围、输出起点或名称的操作；没有绕过保护或允许跨任意路径写入。
- 全任务仍有其它高级工具待补，继续按主会话ledger推进。未调用真实模型，Desktop由用户自行验收。

## Worksheet pivotParts 推断更正

初次看到vendor只写worksheet→pivotTable relationship时，曾推断缺少pivotParts登记；进一步权威核对表明该推断错误，**不向原件添加无效节点**，也没有修改add_pivot生产路径。

- Microsoft Open XML SDK `Worksheet` 3.0.1 官方文档完整 `ChildElementInfo` 列表包含TableParts，未包含PivotParts/PivotTableParts。URL：`https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.worksheet?view=openxml-3.0.1`；缓存 `/tmp/mimir-worksheet-openxml-reference-20261017.html`，SHA256 `4ba0ea74c5f37475187ce62a92740538bff7f1a8d1518ab69b4f74a6912c5444`。
- Openpyxl **3.1.3** stable文档实际 `ExcelWriter._write_worksheets` 对 `ws._pivots` 逐项写part，并创建`Relationship(Type=p.rel_type, Target=p.path)`加入`ws._rels`；没有worksheet pivotParts节点。URL：`https://openpyxl.readthedocs.io/en/stable/_modules/openpyxl/writer/excel.html`；缓存 `/tmp/mimir-openpyxl-excel-writer-20261017.html`，SHA256 `160ed12ae0e11c0b219c96d04e86304db02c72031d1af679e49fce61a2dcaf57`。
- `xlsx-pivot-next-plan-20261017.md`原「目标pivotParts关系」措辞更正为worksheet→pivotTable relationship，避免后续误加节点。

主要实现参考仍为GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的固定domain layout和gateway relayout。AGENTS要求的WeKnora核对沿批准研究报告证据：官网+公开v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`，用于明确能力门控及只读原因，不作为Office布局/保存模型；本片未另作WeKnora新版本研究。
