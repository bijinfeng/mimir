# DOCX 标题大纲安全编辑实施

日期：2026-10-17。状态：生产代码冻结，等待 root 统一浏览器与独立检查。范围依据 `research/docx-outline-plan-20261017.md` 与 implement.md 中 root 批准段落；不宣称全工具任务完成。

## 实施结果

- 复用视图→文档导航 Inspector，显示当前标题、真实层级、样式、段落位置；直属 docHeading、显式 outlineOnly、样式 docParagraph 与编号 docListItem 用当前 resolvedStyles 判定，尊重 headingOutlineOff。保留原始文字和双空格，显示标签单独处理空标题；重复标题按 position/blockIndex 区分。
- 当前目标文字在原编辑器原位置编辑，保留富文本/超链接；正文始终完整可见，唯一 EditorContent 与稳定 Agent 句柄不替换。阅读显式编辑先退出；≤800px 关闭覆盖导航面板，preventScroll focus 留正文，不触发关闭回焦。
- 普通标题沿 apply_ops/setHeadingLevel 支持真实原件样式 0–9，写真实目标 styleId 使 data-style CSS 对应原件。显式 outlineOnly 沿 setOutlineLevel，保留原段落样式。编号标题仍可原位编辑文字，层级调整明确拒绝并指向列表/样式工具；修订、受保护结构及特殊 inline 层级禁用，不把它们改成丢信息的普通标题。
- 每次选择冻结 documentId/session/editor/handle/version/保护 epoch/position/node/document。纯 selection 不重定向；内容编辑、undo 或身份/策略变更使旧草稿失效并保留用户选择的级别。执行前主动 assertWrite，再由现有 handle/PM 保护层兜底。正常应用单次事务，closeHistory 隔离连续应用，no-op 零版本/历史/dirty。
- 面板沿 320px 实色 Inspector，body 内滚、固定单一应用 footer，9 级缩进最多 24px；当前目标/禁用原因靠前，选择列表项后回面板顶部。成功后读回新层级与样式；正文改动后再次选择目标。
- root 浏览器发现的已加载只读文档“添加批注”错误禁用原因，已改为实际 protectionReason，真正加载时保留原 fallback。

## 原生 before-red 与修复

新 native 回归先复现：原件显式大纲 2→3，PM 为 3，但 session.save→openDocx 仍为 2。固定 vendor convert.ts 的 applyRawPPr 把同 type/style/list 视为结构相同，忽略 outlineOnly 级别，因此沿用旧 w:outlineLvl。

经 root 批准增加最小 `docx-outline-save.ts`，在 list save plan 后、design/ink 之前修正实际变更的 pStyle/outlineLvl；其余 pPr（包括 cnfStyle）、内联文字及非目标部件保留。显式大纲变正文写 outlineLvl9，避免继承标题复活。原件 no-op 不进入该适配。没有修改 vendor。

## 文件

生产：

- `packages/office/src/editors/docx-view.ts`
- `packages/office/src/editors/docx-outline.ts`（新）
- `packages/office/src/editors/DocxViewPanel.tsx`
- `packages/office/src/editors/docx-views.css`
- `packages/office/src/editors/DocxEditor.tsx`（最小集成、发布 handle 的 React 状态与批注原因）
- `packages/office/src/agent/docx-agent.ts`（层级 0–9、真实样式 ID、no-op/编号守卫）
- `packages/office/src/docx-outline-save.ts`（新）
- `packages/office/src/docx.ts`（保存计划一处接缝，保留 protection.assertSave 顺序）

验证：新 `docx-outline.test.ts`、`DocxEditor.outline.test.tsx`、`docx-outline-test-fixture.ts`。
现行合同同步：Office frontend editors 与 engine conventions。

## 已运行验证

1. 最终目标组合 **6 文件 83/83**：
   `src/editors/docx-outline.test.ts src/editors/DocxEditor.outline.test.tsx src/editors/DocxEditor.views.test.tsx src/editors/DocxEditor.protection.test.tsx src/agent/docx-agent.test.ts src/docx.test.ts --maxWorkers=2`。
2. 本片新用例 **14 项**：真实样式 0/2/7/8/9、rich marks/link 保留、native reopen、cnfStyle、非目标 ZIP 部件、第二次 no-op 保存、undo→原件全部非目录 ZIP 条目精确；显式 outline 2→3 与 2→正文；同级 no-op；不存在样式限制；选择移动不重定向、编辑→undo/身份/epoch 失效；真实 Editor 层级 UI、编号/空/重复、阅读→原位编辑、保护下零写入。
3. Office tsc exit 0。11 个修改代码/CSS文件 oxfmt --check 通过；git diff --check 通过。
4. 目标 oxlint exit 0；docx-agent.ts 1036/1134/2000/2030 的四处既有 no-map-spread warning 保留，本片无新增 warning/error。styles 检查通过。Impeccable hook 对面板未报确定性问题；这不等同实际视觉验收。

## 浏览器夹具与后续

仅在 /tmp 准备 `/tmp/mimir-docx-outline-browser-20261017.docx`（2884 bytes），未上传。含 1–9 级富标题、中文双空格、超链接、重复/空标题、编号从 5 起、headingOutlineOff 正文及显式大纲。它是浏览器专项夹具，内容比测试夹具更长用于 420 窄屏。

root 负责实际 1280 / 420 / 420×500、当前值/固定 footer/折叠菜单/Escape/正文焦点与真实下载读回。独立 checker 尚待派发；没有运行 full Office、Web build、真实模型或 Desktop，也未暂存、提交、归档、删除任何测试文件。

## 参考适用范围

GenOffice 固定 `480548fd55f1be3593ee0d8e316a734751d58309` 的标题判定与既有编辑原语沿研究报告，未照搬 CSS 隐藏正文；不是 Word 全量章节树/级联移动。WeKnora 官网及公开源码 v0.8.3 / `3e22822c1d2397be730c458c7539d0eb8c113a24` 的具体证据与能力门控适用性见同一研究报告；不作为 Office 大纲外观模板。
