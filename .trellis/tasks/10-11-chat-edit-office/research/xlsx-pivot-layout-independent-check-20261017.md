# XLSX 已有透视布局：独立检查

2026-10-17。正式 trellis-check，按批准的 `xlsx-pivot-edit-plan-20261017.md`、实施报告和当前实际执行路径检查。只复核本片；整个所有工具任务仍未完成。以下生产修改已冻结，供 root 统一构建与真实浏览器验收。

## Findings (fixed)

1. `packages/office/src/xlsx-pivot-editability.ts`：关联对象检查用 `includes('!'+pivot.name)`，把 `原有销售透视布局验收另一张` 错判为 `原有销售透视布局验收` 的关联透视图，使无关原件导致错误只读。改为 trim 后完整末尾对象名匹配。新增 raw chart XML 回归：有前缀及默认命名空间的真实目标引用仍拒绝；仅有相同名称前缀的其他对象允许编辑，chart part 字节精确保留。失败前证据 `/tmp/pivot-layout-check-chart-prefix-before.log`。
2. 同文件全包关系反向检查：标准 `xl/pivotTables` 外的 consumer 使用 `%31` 等编码别名指向所选 cache/records，原来的 raw target resolve 不会识别，资格会错误为 true。新增只用于诊断的 URI 解码与反斜线归一，发现指向所选资源的非规范别名即拒绝；不把别名接受成合法关系，也不重写原件。独立 cache/records 两例修复前均失败，证据 `/tmp/pivot-layout-check-alias-before.log`；修复后 inspect 和真实 host 同样拒绝，输入 bytes 不变。该回归证明 Mimir 的保守原件资格边界，不宣称该非规范包已在 Excel 实测。

只改了上述 helper 和 `apps/server/src/test/xlsx-pivot-layout-edit.test.ts`。未修改其他人的 DOCX/PDF、vendor、Agent 上游 DSL 或保存/history 接口。

## Actual-path review

- 本地 strict schema 仅允许目标 sheet/path 和有序行/列/值/五聚合；host 单项分流，拒混批/图片。server 从当前 bytes 重新检查，不能以 UI eligible 作为授权。
- UI helper 仅构造只读语义树；未导入 gateway writer。server 独立与真正 writer 比较完整原生 baseline。General/default、来源成员、缓存记录、namespace、未知属性、扩展、关系、类型、保护和共享依赖均在真实原件上判断。
- `applyXlsxPivotLayoutEdit` 固定来源/目标/name/cacheId/原 part 及 rel ID；一次 relayout，无 additions。生成后独立完整 inventory 对比，目标外部件原字节保持，workbook/关系/类型仅允许既定计算状态副作用。records 清零且 refreshOnLoad=1 是固定 gateway 实际行为，未宣称预填完整 records 或第三方 Office 兼容验收。
- writes 是新输出全部地址加旧输出减新输出；实际 union 去重并限2000格。目标角落原文字、公式及自定义样式的回归通过；new-minus-old 有内容整项拒绝，不走 max rectangle 清空。
- 原生 seed 顺序/平均值等聚合真实回显；未变化禁用，取消按钮有可见文字，编辑态不泄漏无法保存的 numFmt/show-as/分组/筛选。body 内滚、footer 单一 primary 和同行 secondary，未加第二条整行表单。
- 真实 mounted Editor + host 验证一次发布/version/history，保存→Undo/save→Redo/save 全非目录 ZIP entry 恢复；失败保留草稿，关闭或取消后迟到结果不能发布；A→B→A 旧资格不会复活。
- 最初怀疑 `pivotSource/name` 文本未被识别，已用 raw XML 证伪：parser 将文本保存在 `#text.attrs.value`，原递归检查可捕获；保留两例回归，没有据错误推断改实现。未添加不属于 Worksheet schema 的 pivotParts 节点。

## Findings (not fixed)

- `.trellis/spec/shared/contract/xlsx-agent.md:28` 仍说现有透视全部只读，本地扩展列表也尚未登记 `edit_pivot_layout`。这是本片新合同需要 root 在规范更新阶段同步的内容，已向 root 报告；checker 按角色边界没有代改共享规范。应写出严格 raw baseline、固定身份、实际 union、records0/refreshOnLoad1 和明确只读边界，不只删除旧句。
- 真实1280×720/420×500、最终构建保存与下载验收由 root 负责。本检查未操作浏览器，不能将 CSS/DOM 测试冒称最终视觉通过。当前不调用真实模型，Desktop 按用户指示自验。
- 本片没有发现尚未修复的生产逻辑问题。复杂透视原件仍须按已有明确原因只读，不能据本片称任意 Excel 透视可编辑。

## Verification

全部最终命令 exit0：

| 门禁 | 结果 | 日志 |
| --- | --- | --- |
| Office PivotControls/Editor.pivot/helper 三文件 | 26/26 | `/tmp/pivot-layout-check-office-tests-final.log` |
| Server layout-edit + agent-pivots 两文件 | 38/38（原33 + 本次5） | `/tmp/pivot-layout-check-server-tests-final.log` |
| Office typecheck | pass | `/tmp/pivot-layout-check-office-types-final.log` |
| Server typecheck | pass | `/tmp/pivot-layout-check-server-types-final.log` |
| 本片12 TS/TSX oxlint | pass，无 diagnostic | `/tmp/pivot-layout-check-oxlint.log` |
| 本片13文件 oxfmt --check | pass | `/tmp/pivot-layout-check-format.log` |
| check-style-backticks | pass | 实际命令返回“样式模板里没有多余的反引号” |
| 本片 git diff --check | pass | 实际命令 exit0 |

未跑全套/Web build；root 统一负责。全仓480项技能 lint 既有失败基线没有重复运行或冒称全仓通过。没有暂存、提交、归档或删除文件。
