# DOCX 标题大纲独立检查

日期：2026-10-17。角色：trellis-check，检查 root 已批准的 `docx-outline-plan-20261017.md` 与实际实现。生产代码已冻结；未运行全 Office / Web build / 浏览器，未上传、删除、暂存、提交或归档。浏览器及重型门禁由 root 统一负责，本文不把专项检查当作全任务完成。

## Findings (fixed)

### 1. 原生属性补丁丢失未知属性 / 误改属性值中的文字

- 文件：`packages/office/src/docx-outline-save.ts`。
- 问题：原件 `pStyle` / `outlineLvl` 使用合法单引号和等号两侧空白时，原双引号正则不识别，整节点重建会丢掉同节点未知属性。首次窄修再以真实原件验证，发现未知属性值中合法的 `w:val='untouched'` 文字会被简单搜索误认为目标属性。
- 修复：按完整属性 token 遍历，仅更新属性名精确为 `w:val` 的值，保留原引号、等号空白、命名空间与未知属性；新值同时转义单双引号。不改 vendor，不整体解析重写 pPr。
- 证据：`docx-outline.test.ts` 对实际 ZIP 中 pStyle / outlineLvl 分别改层级→session.save→openDocx，未知属性精确保留且重开层级为 3。before-red 日志 `/tmp/mimir-docx-outline-attributes-before-20261017.log`（2 fail），以及 `/tmp/mimir-docx-outline-attribute-token-before-20261017.log`（2 fail）；最终 12/12 通过。未知属性值含伪 w:val，证明没有误改其内容。

### 2. 当前样式提升的段落不能改回正文

- 文件：`packages/office/src/agent/docx-agent.ts`。
- 问题：真实 `define_style` 将原普通段落的样式基于 Heading3 后，活样式提取器正确列出标题，但 PM 节点仍是 docParagraph。选择“正文”时，原 no-op 条件仅比较类型与 `level ?? 0`，错误跳过清除标题样式。
- 修复：level 0 仅在 styleId 为空时允许该 no-op；其他原有条件和真实原件标题样式门控保持。
- 证据：实际 `DocxEditor` + 原生样式 ZIP 流程先失败（`/tmp/mimir-docx-outline-live-style-before-20261017.log`），修后选择正文正确消失于大纲，保存重开为正文；一次 undo 恢复原 PM JSON，再保存重开恢复真实 3 级标题。独立测试同时确认无 styleId 的普通正文重复应用 0 不推进 version/history，no-op 保存原件全部非目录 ZIP 条目精确。

### 3. 模型工具说明仍标为标题 0–6

- 文件：`packages/shared/src/docx-office-tools.ts`。
- 问题：执行层本片已支持原件真实样式 0–9，给模型的 level 属性描述仍写 Heading 0–6。
- 修复：经 root 批准仅同步说明为 Heading 0–9，并明确 1–9 需要原件已有 native heading style；schema 形状及工具接口没有扩大。

## Reviewed contracts

- `docx-outline.ts` 的 frozen target 包含 document/session/editor/handle/version/保护 epoch/PM doc/node/position；selection-only 不改目标，edit→undo 和来源/策略变化不复活旧草稿。
- `DocxViewPanel.tsx` 当前值与禁用原因、编号标题的真实范围、正文原位编辑和单事务 closeHistory 边界；当前正文完整可见，只有原主 EditorContent，不用纯文本重建标题或 CSS 隐藏正文。
- 实际 Antd Select 回归：第一次 Escape 只关闭层级 popup，Inspector 保持；第二次 Escape 关闭 Inspector。未因此增加 UI 生产代码。组件环境的焦点路径不替代 root 420 / 短高浏览器验收。
- 保存链仍先 `protection.assertSave`，只读 no-op 返回私有原件；outline hook 在 list save plan 后，原有 design / ink / 引用等保存链保留。P0 真实 Editor 及既有 native/Agent 测试回归通过。
- 0/2/7/8/9 实际样式、显式 outline 2→3 与正文、富文本/链接/中文空格、未知 pPr、第二次保存、单步 undo / redo、非目标 ZIP 保留均有原生回归。
- Engine 既有标题保存规范增加属性 token 保真的具体要求；无新产品边界或架构决策。
- 主参考仍为 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`；WeKnora 官网与 v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 证据及适用性沿已审阅的 outline plan，只适用能力如实门控，不作为 Office 工具栏外观依据。本次没有另做竞品研究或声称运行上游 GUI。

## Findings (not fixed)

没有遗留的已确认代码缺陷。以下是本片明确边界与后续验收，不能冒充全功能通过：

- 编号标题层级、复杂内联/修订结构的层级调整保持明确禁用，文字通过原编辑器原位编辑；没有章节树重排或 Word 全量大纲模式。
- 实际 1280 / 420 / 420×500、固定 footer、长重复标题与原生下载由 root 续验；此 checker 未运行浏览器。
- 无真实模型配置，不宣称真实模型编辑验证；Desktop 依用户决定自行验收。
- 全仓 `pnpm check` 的既有技能 lint 基线和全任务剩余能力不由本片关闭。

## Verification

- Tests：**7 文件 101/101 pass**，最终日志 `/tmp/mimir-docx-outline-check-final-20261017.log`。
  `pnpm --filter @mimir/office test src/editors/docx-outline.test.ts src/editors/DocxEditor.outline.test.tsx src/editors/docx-view.test.ts src/editors/DocxEditor.protection.test.tsx src/editors/DocxEditor.views.test.tsx src/agent/docx-agent.test.ts src/docx.test.ts --maxWorkers=2`
- TypeCheck：Office 与 shared 均 **exit 0**，日志 `/tmp/mimir-docx-outline-check-tsc-20261017.log`、`/tmp/mimir-docx-outline-check-shared-tsc-20261017.log`。Office 首轮曾被并行 PDF 签名的 server input.color 未收窄错误阻断，已通知 root，由签名 owner 修复后此处重跑通过；checker 未改该 server 文件。
- Lint：目标 11 文件 **exit 0**，日志 `/tmp/mimir-docx-outline-check-lint-20261017.log`；保留 Agent 四个既有 no-map-spread warning，无新增 error。
- Format：目标 12 代码/CSS文件 **exit 0**，日志 `/tmp/mimir-docx-outline-check-format-20261017.log`。
- Styles：目标 Inspector / CSS / Editor 检查 **exit 0**，日志 `/tmp/mimir-docx-outline-check-styles-20261017.log`。
- `git diff --check`：目标文件通过。

本片自修文件：`src/docx-outline-save.ts`、`src/agent/docx-agent.ts`、`src/editors/docx-outline.test.ts`、`src/editors/DocxEditor.outline.test.tsx`、shared 工具说明，以及 engine 既有规范。其余生产实现保持原 owner 的更改。

## 浏览器回报后的主动作文字修复

root 实际生产浏览器发现 footer 主动作含两份文字：“应用层级 应用标题层级”。原因是共享 `ToolbarButton primary` 自带 label 显示，而 `DocxViewPanel` 又在 children 传入文案。按 impeccable context / polish / craft-floor 的现有界面精修要求，仅移除这份 children，主按钮现在只显示“应用标题层级”，原 aria-label、disabled / disabledReason、单一主动作和执行路径保留。复核本片其他按钮：编辑标题、前后页、关闭和标题条目均为非 primary，children 是其唯一可见内容，没有同类重复；没有扩大风格调整。

已在现有实际 Editor 回归中增加主按钮 textContent 精确一次、无目标时禁用原因“请先选择一个标题”、同级原因“层级未变化”的检查。`DocxEditor.outline.test.tsx` **6/6 pass**，两文件 lint / format / styles / diff 全绿。日志 `/tmp/mimir-docx-outline-label-{check,lint,format,styles}-20261017.log`。本次按 root 要求未重跑 101 项或全 Office；上文 101 项与 types 是此前最终 native 版本的记录。本次生产改动仅 `DocxViewPanel.tsx`，已再次冻结供 root 最终浏览器确认。

## 全套回报后的列表保存链修复

root 全 Office 记录为 177 文件 / 1842 项，1839 pass / 3 fail，日志 `/tmp/mimir-office-full-protection-outline-signature-20261017.log`。其中 outline label 是 root 已定位的并发旧实现/新测试加载时序；另外两项 `DocxListControls.test.tsx` 保存失败在 checker 定向运行中稳定复现，不能归因于等待时限。

真实错误是“标题结构已变化，无法可靠保存大纲层级”（诊断日志 `/tmp/mimir-docx-list-outline-save-error-20261017.log`）。kitchen-sink 首段原为 docHeading；改为列表后，`docxListSavePlan` 已以 `kind:xml` 保真补丁写入 numPr 并保留 heading pStyle。后续 outline hook 却只凭 heading→list 类型变化判断为大纲修改，强制要求 generated 后抛错。

经 root 同意，生产仅在 `docx-outline-save.ts` 增加涉及 docListItem 时跳过该 hook 的 guard：列表转换由既有列表保存计划负责；真正标题层级命令本已拒绝编号目标。没有放宽生成器校验、跳过实际标题层级保存或改写列表计划。

`DocxListControls.test.tsx` 保留原等待预算，失败时输出真实 notice；新增两段保存重开后的 docListItem 类型、numId 与原 styleId 保留检查。原测试的两次真实保存、undo/redo 全部非目录 ZIP entries 精确对比继续通过。engine 标题保存段同步列表/大纲补丁的归属边界。

最终定向 **5 文件 51/51 pass**：`src/editors/DocxListControls.test.tsx src/editors/docx-lists.test.ts src/editors/docx-outline.test.ts src/editors/DocxEditor.outline.test.tsx src/docx.test.ts --maxWorkers=2`。日志 `/tmp/mimir-docx-list-outline-check-final-20261017.log`。Office tsc、两文件 lint / format / styles / diff 均通过，日志同前缀 `-tsc`、`-lint`、`-format`、`-styles`。未跑全 Office / build，生产再次冻结，交 root 统一最终全套重跑；不把本次 51 项绿改写为此前全套已绿。
