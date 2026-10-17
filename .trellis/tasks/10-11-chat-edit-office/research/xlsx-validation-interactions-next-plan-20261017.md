# XLSX 原生数据验证交互补全计划

2026-10-17，root。沿用户“所有工具补齐”和“同时注意样式交互”已授权范围，先修真实确定差距；不是把所有复杂 Excel 文件都承诺支持。

## 已核对来源

固定 GenOffice checkout HEAD 实读为 `480548fd55f1be3593ee0d8e316a734751d58309`。`apps/sheets/src/renderer/data-validation-dropdown.tsx:49–67,119–176` 实现当前格列表下拉与输入提示；尊重 suppressDropdown、showInputMessage/title/prompt。`univer-sync.ts:6097–6202` 映射 stop/warning/information、showErrorMessage/errorTitle/error、公式/名称列表；list 的 formula2 不作为颜色误用，普通文本外观保留。复选框的 `"1,0"` 兼容映射也明确存在。

Mimir `xlsx-sheet-features.ts:27–36,112–125` 未读 showErrorMessage/errorStyle/errorTitle/showInputMessage/promptTitle/prompt/showDropDown；`xlsx-cell-effects.ts:276–355` 只返回错误字符串，所有无效值一概阻止。`xlsx-agent-host.ts:214–240` 对改变单元格统一 throw，warning/information/不显示错误均无真实语义。`XlsxEditor.tsx:431–445` 普通输入直接执行，当前网格不存在列表下拉、输入提示及警告确认。已有“设置数据验证”Inspector与规则 writer 不等于这些交互已齐。

按 AGENTS 已重新读 WeKnora 固定 v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24` 的缓存 `definitions.go:14–21,35–49,69–75`；官网 HTTP200 和固定源码 hash 沿 `pdf-local-ocr-next-plan-20261017.md` 本日证据。知识读取与 sandbox/wiki 能力门控适用于 Agent 可用性，不提供 Excel 数据验证交互，不作为 Office 视觉模板。

## 最小实施边界

1. 私有 native 规则读取完整属性并保留原始 XML；只读规则不重写，无操作导出精确。列表解析共用一个有界纯函数：inline、当前表/带引号表名范围、全局及正确作用域名称；保留顺序，明确不支持/预算原因。公式、跨表、空值、Unicode、转义及不可见来源须严格验证。
2. 当前格列表给小型原生下拉入口和键盘 Alt+Down/选择/取消，选值沿既有 commitCell→同一 host→一次版本/history。规则明确隐藏下拉时不显示；输入提示按原生开关显示有界可读区域。新复选框不以只有0/1的任意外来列表强行伪装；若按固定上游明确映射，必须记录该兼容语义及可切回数值。
3. 校验结果区分有效、stop、warning/information、明确不显示错误、无法可靠计算。stop 和未知/失败继续拒绝；disabled error 不应无条件阻止有效执行。warning/information 的手动输入在显式确认前零发布，确认只针对冻结文档/源 bytes/版本/格/输入及规则，取消/换格/改稿/保存/迟到不能复用许可。宿主独立重算当前规则，不能让任意 `allowInvalid:true` 绕过 stop 或未知类型。Agent 不可自行确认用户警告；遇需用户决定时如实返回，不能自动降级后称成功。
4. 同一校验语义须应用到写入来源；现有复杂粘贴/批量遇需确认可保守拒绝并解释，不能批次半写。保留现有保护/数组/合并/地址关联结构守卫。规则属性编辑入口可在既有320px数据验证Inspector补输入提示、错误样式与当前值；若当前规则不能无损编辑，不以空默认值覆盖。

## 预期文件与验收

Office `xlsx-sheet-features.ts`、`xlsx-cell-effects.ts`、独立列表/确认控件与最小 `XlsxEditor.tsx`、既有 PropertyControls；server `xlsx-agent-host.ts` 的校验语义；确需请求合同则 shared/xlsx-agent、conversations strict路由与 renderer API 最小字段。先明确所有权，避免与透视等共享接缝并写；不改 vendor、模型目录或全部范围重写。

真实 XLSX fixture 验证 inline/quoted cross-sheet/definedName 列表、suppressDropdown、prompt/error title/中英文、stop/warning/info/disabled error；服务器拒绝伪造 stop consent，过期 bytes/版本/格/规则失败，批次失败原子。实际 Editor 下拉/键盘/显式确认、取消/迟到与一次版本/保存历史精确字节；未操作 ZIP entry 和原规则 XML 保留。独立 check 后 root 统一构建与1280/420×500浏览器。320px内部滚动与固定单一主动作、逐层Escape/回焦；不引入宽表单。无真实模型，Desktop用户自验，禁止暂存/提交/归档/删件。

复杂形状预览与范围结构互操作仍须继续逐项审查，不因本片实施而整体标齐。
