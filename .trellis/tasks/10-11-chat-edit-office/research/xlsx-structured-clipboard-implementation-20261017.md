# XLSX structured clipboard 实现交接（2026-10-17）

## 状态与所有权

客户端已冻结，待根会话独立checker和统一build／真实浏览器验收；未运行full Office、web build、上传、暂存、提交或归档。实现以同目录 `xlsx-structured-clipboard-plan-20261017.md` 的固定GenOffice480548…／实际Univer0.25.1／WeKnora v0.8.3研究为依据。

本实现者改动：

- 新 `packages/office/src/xlsx-clipboard.ts`、`.test.ts`：冻结原件bytes/document/handle/version/sourceSheet/range；内原生操作、HTML/plain、bounded HTML、系统读写、source stale和取消。
- `XlsxClipboardControls.tsx`、新 `xlsx-clipboard-controls.css`：稳定Editor body的320px Inspector，源／目标、内部／系统粘贴、CSV/TSV和主动values-only；内部滚动，底部主粘贴固定。
- `XlsxManualControls.tsx`、`.test.tsx`：移走独立cut缓存，仅保留格式刷／清除等现有能力。
- `XlsxEditor.tsx`、`.test.tsx`、新 `XlsxEditor.clipboard.test.tsx`：统一cache、网格原生copy/cut/paste事件、输入框不拦截、范围标记、同一Agent历史／手动保存、版本／源／目标取消；普通单格“复制文字”明确取消旧范围缓存。
- `implement.md`仅新增本片所有权段；未改server/shared/vendor。原文件上既有复杂fill、对象、历史等他人改动全部保留。

服务端行列继承样式由另一实现者负责，本片不覆盖其代码。接口保持：单项 `copy_range` 或 `move_range`，参数 `{sheetId:targetSheet,sourceSheetId,source,target:anchor}`；`handle.execute('propose_operations',{operations},{expectedVersion,signal})`。不新增公共DSL。

## 验证结果

- Office专项六文件 **98/98通过**：`xlsx-clipboard.test.ts`、`XlsxManualControls.test.tsx`、`XlsxEditor.clipboard.test.tsx`、`XlsxEditor.test.tsx`，以及相邻 `XlsxEditor.fill.test.tsx`／`XlsxEditor.pivot.test.tsx`。命令 `pnpm --filter @mimir/office exec vitest run <上述6文件> --maxWorkers=2`；日志 `/tmp/mimir-xlsx-clipboard-final-tests.log`。
- `pnpm --filter @mimir/office typecheck`通过：`/tmp/mimir-xlsx-clipboard-types.log`。早期其他实现中DOCX测试报错已由其所有者修复，最终日志仅正常tsc，无本片类型问题。
- 目标8个TS/TSX文件oxlint零警告／错误：`/tmp/mimir-xlsx-clipboard-lint.log`；9个文件format check通过：`/tmp/mimir-xlsx-clipboard-format.log`。
- `pnpm lint:styles`通过：`/tmp/mimir-xlsx-clipboard-styles.log`；目标tracked diff check通过。

真实宿主组件测试确认：grid复制零dirty/history，plain+HTML双MIME；普通相对／绝对公式复制、真实跨表cut引用迁移及一次历史；保存→undo/save→redo/save全部ZIP entry精确；HTML `=1+2`以真正文本写入，bold／#123456／14pt原生重开生效；不支持border明确拒绝，主动values-only后前导零保留；pending宿主切范围取消，pending系统读取切Inspector不复活；原输入框事件不被截获。构造ClipboardEvent和mock Clipboard API是组件合同证据，不冒称OS键盘或外部Excel互操作验收。

## 根会话实际验收入口

Ribbon可见“剪贴板”，按钮aria为 **范围剪贴板**。Inspector的 **复制所选范围／剪切所选范围** 冻结当前范围，换表后在范围框选择目标。固定footer在有内部源且无外部payload时名为 **粘贴工作簿内范围**，否则 **粘贴已读取内容**。**读取系统剪贴板**读取后仍需确认粘贴。失败保留源／payload；**仅粘贴显示值**是显式次要动作。

原生copy/cut/paste事件仅在grid td作用域接管；Ctrl/Cmd+C/X/V由浏览器发这些真实事件，keydown不再重复读取／执行。选区标记为虚线；Escape清源；Inspector Escape关闭并回入口，关闭本身保留范围cache。

## 明确边界与后续

- 内部原生仅同文档／同句柄／有效源版本；切表／选区保留源，其他字节mutation／undo/redo失效。每次成功粘贴显式消耗cache并提示重复制，未伪装支持反复copy paste或源修改后快照重导入。
- 单格目标按源尺寸展开，多格必须同尺寸；不重复平铺。不改合并／共享数组公式／保护／表格等既有host拒绝边界；cut仍单次原子move，失败不清源。
- **系统HTML只导出网格已解析的基础格式子集**，复制反馈明确显示“基础格式子集”。浏览器reader未解析的行列继承、主题原生语义、复杂填充、rich runs等不可声称完整外部保真；内部raw路径仍由server保留。
- 外部HTML支持单普通table、literal文字／换行、明确的bold/italic/underline、字号pt/px、HEX文字／底色、水平／垂直对齐、换行CSS。未声明的格式保持目标现有值。class／样式表／行列样式、border、mso／专有公式属性等普通粘贴明确拒绝，可主动选择values-only；合并、多表、图片／链接／嵌套表仍拒绝。≤1MiB／500行／100列／2000格、≤50operations；文字前导等号以set_cell保证literal，不误执行公式。plain沿现有CSV/TSV标量／公式推断。
- 根会话用已上传 `P51sn7n1D3bIq_fX` 双表夹具验宽／420、真实OS或浏览器Clipboard API、跨表D8复制与G2剪切、两级保存history／ZIP读回。独立checker和最终规范／缺口矩阵同步由根会话统一协调，当前不宣称完成该浏览器门禁。
