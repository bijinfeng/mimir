# XLSX 范围继承样式独立检查（2026-10-17）

## 范围与结论

对 `xlsx-range-inherited-styles-20261017.md` 实现进行独立 Trellis check。只核 server 的 `xlsx-range-styles.ts`、`xlsx-agent-range.ts`、`xlsx-manual-ops.ts` 与专项测试；未改 Office、renderer、shared、vendor 或根会话 DOCX 文件，未运行全量 Office、Web build、上传或删除。

继承优先级为显式 `<c s>`（包括0）→ `customFormat=1/true` 的行样式→列style→0。复制/填充和移动在来源XML冻结后物化目标s，空洞写显式空格；同表重叠移动先冻结来源，避免读已覆盖目标。格式刷沿同一resolver，清格式维持默认0；原单元格类型、缓存与rich body沿原XML保留。原保护/2000格/边界/共享数组溢出公式/关联范围结构守卫未放宽。

发现并修复一处同边界真实保存问题：**格式刷的属性setter只删除双引号旧值**。合法原件 `<c r="F8" s='7'>` 应用来源继承样式3后会变为同时含 `s='7' s="3"` 的非法重复属性；独立DOM可能继续读到旧值。仅将 `xlsx-manual-ops.ts` 的属性删除模式改为同时接受单双引号，然后追加一次新值。未重新序列化单元格正文或样式表。

## 新增有效回归

`xlsx-range-styles.test.ts` 新增4项，原7项增至11项：

1. 同表 `fill_range`：A1:C6重复平铺至D8:I19，验证72个目标s，显式0、column继承、true/false customFormat、单引号属性、原不存在格和带样式self-closing空行；普通公式相对平移、绝对引用、rich-run主题tint保持。
2. 跨表同样填充，目标有不同的行列样式；目标cols原XML结构与row8属性/扩展保持，来源及其余ZIP entry逐字节不变。
3. 跨表筛选复制，来源第1、4行压缩至第8、9行，按原来源行解析继承样式，空洞仍有style，布尔类型与值保持；不会误取压缩后的行号或目标默认样式。
4. 单引号目标s格式刷，要求唯一s属性、原生值等于来源行继承的3，目标v=999保持。修复前稳定失败（11项中10过、1失败），修复后通过。

补充核对 gateway 的原有行为：`fill_range` 除目标sheet外会在workbook.xml设置fullCalcOnLoad。新增断言只允许这两个touched entry，并要求去掉calcPr后的workbook.xml精确相等；不能将该既有公式重算标记误判为资源漂移。styles/sharedStrings/theme/customXml等未触及原件仍逐字节保持。

## 运行证据

- 修改前基线3文件：**34/34**，`/tmp/mimir-xlsx-range-styles-check-baseline-20261017.log`。
- 新增保存bug回归的失败证据：**10过/1失败**，`/tmp/mimir-xlsx-range-styles-check-repro-20261017.log`。
- 最终5文件：**82/82**，包含range-styles、agent-range、manual-ops、agent-host、fill-host，`/tmp/mimir-xlsx-range-styles-check-tests-20261017.log`。
- 最终server `tsc --noEmit` exit0：`/tmp/mimir-xlsx-range-styles-check-types-20261017.log`。
- 6目标TS文件Oxlint零warning/error、Oxfmt通过，日志分别为 `/tmp/mimir-xlsx-range-styles-check-lint-20261017.log` 与 `/tmp/mimir-xlsx-range-styles-check-format-20261017.log`；目标git diff --check通过。

## 本检查实际修改

- `apps/server/src/services/xlsx-manual-ops.ts`：单引号目标属性替换修复一行。
- `apps/server/src/test/xlsx-range-styles.test.ts`：上述4条host/ZIP/独立DOM回归与小型解析辅助函数。
- 本检查报告。

## 交接边界

本切片server检查通过；并不证明Office画布已解析继承样式，也不证明HTML系统剪贴板已完整导入或跨文档样式资源已重映射。根会话继续负责Office剪贴板与浏览器真实history/save验收，Desktop按用户要求自验，真实模型配置缺失的限制不变。未提交、暂存、归档或宣称全仓完成。

可在后续规范整理时保留本次经验：读取支持单双引号而写入只删除双引号会生成重复XML属性，原生测试应独立检查属性唯一性和目标值，不能只搜索新值片段。本检查按分工将经验记录于此，未扩大到修改共享规范。
