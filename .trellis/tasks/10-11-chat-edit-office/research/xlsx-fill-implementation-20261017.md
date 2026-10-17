# XLSX 完整填充工具（2026-10-17）

## 依据与范围
- GenOffice 固定版本 `480548fd55f1be3593ee0d8e316a734751d58309`：`workbook-dsl.ts` 的 fill、`domain/style-color.ts` 的 18 pattern / 主题 tint / 2–10 stops / linear 与 path，以及 `gateway/xlsx-styles.ts` 原生序列化。
- Office 文件工具采用紧凑入口与 320px Inspector；保留字体和对齐菜单。面板内部滚动、主动作固定底部，实际编辑区 420px 仍可操作。
- WeKnora 官网本次 HTTP 200（113529 bytes）；公开源码 v0.8.3 固定 commit `3e22822c1d2397be730c458c7539d0eb8c113a24` 的 `internal/agent/tools/definitions.go` HTTP 200（13533 bytes）。其工具权限与真实执行边界可参考，不提供 Office 填充参数或工具栏范式，不作为本工具 UI 主依据。

## 实现约束
- Agent 与手动共用 `format_range` 原生 fill。省略保持不变，null 显式清除；主题色保存引用而非烘焙 RGB。
- 原生样式池会重建 xf 的部分元数据；本地补丁从原 xf 派生，仅替换实际改动的类别，保留未知属性、保护、alignment 扩展及无关 ZIP 条目。清除写 applyFill=1，阻止意外继承父样式填充。
- 读取保留完整 fill spec、直接/继承来源及不支持的原件色型提示；CSS 预览不进入 Agent 模型。
- 草稿显式应用；失败保留；同轮事务进入现有版本/历史路径，切源/切范围关闭取消。

## 验证
实施结束补充具体结果。

## 完成与门禁
- Production freeze：完整 reader / native host / catalog / 320px Inspector / canvas 已接入，保留字体对齐及原solid快捷色。任意HEX输入随草稿校验；无效不能Apply。
- Server：`xlsx-fill-host`24项、既有`xlsx-agent-host`17项及`xlsx-pivot-grouping-refresh`13项，3文件54项通过；server tsc通过。
- Office：填充4文件40项通过：27纯读取/预览、2图层、9面板、2真实host mounted历史/取消。另 format/reader/table回归及pivot mounted已通过（前一轮7文件84项仅最后取消测试模拟宿主对abort过于配合而失败；修正为模拟晚到返回后，2 mounted均通过）。
- Office tsc通过。全部触及TS/TSX oxlint、3个工具组件Antd lint、`pnpm lint:styles`通过。
- 读取并修复的具体风险：native xf 重建丢quotePrefix/pivotButton/扩展、清除填充后父样式复现、仅改字体丢填充继承、richfill被table band覆盖。各有独立XML或图层断言。
- 浏览器验收由根会话统一进行，本worker未声称完成实机。入口：开始→选择格或输入“操作范围（A1 或 A1:B5）”→填充；验证320px面板/420px覆盖、固定Apply与长色标滚动、对象面板互斥、颜色/图案/两渐变显示、Apply/保存/重开/undo/redo。
