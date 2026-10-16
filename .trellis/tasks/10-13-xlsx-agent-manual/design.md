# 设计：XLSX Agent 与手动编辑

## 2026-10-16 本地闪填与格式刷语义补齐

最小缺口在 `xlsx-manual.ts` 的闪填规划和 `xlsx-manual-ops.ts` 的执行范围：单格闪填应从紧邻左列向下探测连续非空数据，含起点最多1000行，遇空即停；多格选区仍以显式范围为准。推断读取原始值而非数字显示格式，已有值和公式的原XML保留。格式刷选单格目标时按源矩形尺寸展开，仍受边界/2000格预算；多格目标按源样式重复，内容不变。控件只补短说明和目标范围反馈，保持开始5组、320px具名菜单，不新增表单。

证据：GenOffice `480548fd55f1be3593ee0d8e316a734751d58309` 的 `ribbon-actions.ts:1657–1725`；其 lock 固定 Univer 0.25.1，`sheets-ui` 的 `FormatPainterController._collectSelectionRangeFormat/_getUndoRedoMutationInfo` 只收集基础样式并在单格目标展开；`core Styles.getStyleByCell` 只读 `s/interceptorStyle`，`sheets handleStyle/mergeRichTextStyle` 在清除/刷格式时移除目标字符覆盖。源多run字符格式不在固定版格式刷范围，不能作为已知缺口继续误记。保留所选CF清除的锚点平移修复；不扩展复杂合并、表样式、链接或验证的清除语义。WeKnora v0.8.3（`3e22822c1d2397be730c458c7539d0eb8c113a24`）的既有核对沿用主任务调研，知识库/Agent适用，Office格式刷与闪填不适用。

固定上游 13 个顶层工具和 `workbookOperationSchema` 55 种操作。以同一工作簿编辑会话承载上游 `xlsx-gateway` 的计划/应用语义，手动网格命令与 Agent 的 `propose_operations` 走同一 `ChangePlan`。保留格式、公式、工作表关系和复杂 OOXML；原有只写内联字符串的轻量路径仅可用于经过验证的兼容场景，不能继续覆盖用户格式。工作簿选择按发送时 A1 范围和 sheet ID 冻结，不能在模型等待时跟随实时光标。

Univer 网格负责交互与当前状态展示；需要 Rust/`ironcalc` 的导入、公式重算和复杂写回由 Mimir 宿主服务会话提供，浏览器与桌面本地/远端使用同一 HTTP 合同。服务端执行必须给出实际修订号、变更摘要、读回公式值和可回退状态；上游可能的部分批次提交不能伪装为原子成功。超大工作簿、只读 sheet 和公式/透视限制以能力状态和明确失败呈现。保存成功后更新会话基线，保存失败维持 dirty；独立解析器确认公式、样式、图表、透视及未改条目。
