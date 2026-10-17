# Research: DOCX 可编辑大纲的安全等效方案

- Query: 固定 GenOffice 的“大纲”实际提供什么；Mimir 能否用标题 Inspector 补齐，而不隐藏正文或误删隐藏内容？
- Scope: mixed；只读源码研究与实施计划。未运行上游 GUI，未修改生产代码、vendor、测试或构建。
- Date: 2026-10-17
- Task: `.trellis/tasks/10-11-chat-edit-office`

## Findings

### 1. 版本与主参考

主参考是 GenOffice commit `480548fd55f1be3593ee0d8e316a734751d58309`，本地 `/tmp/mimir-genoffice-full`；该目录的来源/固定版本沿根会话既有记录，本研究未执行 Git。下文上游路径均相对这个目录。Office 编辑语义采用此参考；页面布局沿 Mimir 当前 Inspector，并遵循项目 Obsidian 风格约定，不从 WeKnora Markdown 编辑器模仿 Ribbon。

按 AGENTS 要求检查 WeKnora 官网与公开源码，复用本任务已经取得的 HTTP 200 原始证据：

- 官网 `https://weknora.weixin.qq.com/` → `/tmp/mimir-group-flip-weknora-site.html`；本次读到标题 `WeKnora — 帮你找到答案，并将知识付诸实践`，页面包含知识库/Agent。官网页面本身不证明部署版本。
- 公开源码版本 **v0.8.3**，固定 commit `3e22822c1d2397be730c458c7539d0eb8c113a24`；`internal/agent/tools/definitions.go` → `/tmp/mimir-group-flip-weknora-definitions.go`。
- [固定源码](https://github.com/Tencent/WeKnora/blob/3e22822c1d2397be730c458c7539d0eb8c113a24/internal/agent/tools/definitions.go#L35) 35–49 行按真实 sandbox 文件 capability 注册写工具，45 行明确只做不起作用的 checkbox 是虚假能力；69–75 行 wiki 工具按实际 KB 范围开放。
- 适用 Mimir：标题编辑按钮按实际文档可写性/目标能力开放，执行层再次校验；保护原因不能只靠灰按钮。上述文件没有 DOCX 标题大纲/Word 原件写回证据，不能用作 Office 功能或外观模板，也不能据单文件断言 WeKnora 全库没有编辑能力。

### 2. GenOffice 的真实“大纲”能力

| 证据 | 实际行为 |
| --- | --- |
| `apps/docs/src/renderer/components/ribbon-tabs.tsx:1060` | `ViewMode = 'print' | 'web' | 'outline'`。 |
| 同文件 `:1159` | “大纲”按钮切换 `onViewMode('outline')`；再次点击回 print，没有独立编辑命令。 |
| `apps/docs/src/renderer/App.tsx:836,5966` | React viewMode state 与 `view-${viewMode}` class；没有另外生成大纲文档。 |
| `apps/docs/src/renderer/styles.css:9526` | 注释明确 `headings only, still editable`。9528–9529 用 `display:none` 隐藏 `.doc-page` 直属非 h1–h6 节点，9532–9578 修改缩进并加伪元素 `⊕`。 |
| `apps/docs/src/renderer/components/NavPane.tsx:19,35` | 标题导航收集后仅 `nodeDOM(...).scrollIntoView(...)`。没有表单改名、拖拽或章节级移动。 |
| `apps/docs/src/renderer/editor/headings.ts:29` | 除 docHeading 外，还识别 docParagraph/docListItem 的段落样式 `headingLevel`，尊重 `headingOutlineOff`；这是编号标题的重要路径。 |

**结论：**固定版的“大纲”是同一主编辑器的标题过滤显示，用户继续通过常规编辑与段落样式修改标题。没有发现专用大纲升降级、折叠整章、章节拖拽命令；不要凭 Word 常识把这些都列为固定版对标缺口。

不过，上游确有**通用块移动快捷键**：`editor/extensions.ts:1410` 的 Alt+Shift+Up/Down 调用 `editor/move-block.ts:12`，移动当前选区触及的块越过相邻块。这不是标题加全部子节的一揽子“章节重排”。Mimir Agent 已有 `moveBlocks`（`src/agent/docx-agent.ts:2704`），但本片不应另造章节树移动/级联重排并冒称来自上游。

### 3. 不能照搬 CSS 隐藏正文

`display:none` 只改变 DOM 画面，PM document、选区和跨块命令仍含全部正文。两个可见标题之间可能有正文/表格/批注锚点。键盘选区、跨块删除、全选替换或移动仍可能触及隐藏节点。源码足以证明这种模型/画面范围不一致；**本研究没有实际复现上游数据丢失，不能写成已确认上游 bug**。

Mimir 可直接规避此风险：正文持续完整显示，保留唯一主 `EditorContent` 及滚动容器；旁边面板只选择和定位标题，所有正文输入继续发生在主编辑器。无第二个 contenteditable、无同步两份富文本、无把大纲纯文本回灌正文。

### 4. Mimir 已有能力及具体复用点

| 文件/位置 | 当前能力与注意事项 |
| --- | --- |
| `packages/office/src/editors/docx-view.ts:6` | `DocxHeading { position, level, text }`；`:11` 的 `docxHeadings()` 只走直属 `docHeading`，漏掉由样式赋予标题级别的正文/编号标题。display text 使用 trim 并将空标题显示为“空标题”，不能拿这个值当可写原文。 |
| `editors/DocxViewPanel.tsx` | 已有页面导航、标题列表、320px Inspector 结构、Escape/关闭。标题条目只有 jump。 |
| `editors/DocxViewControls.tsx` | 视图/阅读条均有“导航”按钮；适合扩展同一入口，不另增加同级标题树面板。 |
| `editors/DocxEditor.tsx:1591` | `resolvedStyles` 是包含当前未保存样式的解析结果；`:1594` 同步列表样式存储。新提取器须用它而非只读原 session styles。 |
| `editors/DocxEditor.tsx:2184` | 唯一导航面板传入 `docxHeadings(liveDoc)`；`:2194` jump 用选区事务和真实 nodeDOM 滚动。导航操作不应变 dirty/version/history。 |
| `editors/DocxEditor.tsx:930` | `applyParagraphStyle()` 是 gallery 操作；会清 `borders/borderLines/indentLeft/kind/numId/styleId`。不适合作为只改大纲级别的保格式原语。 |
| `src/agent/docx-agent.ts:2328` | `apply_ops` 先计划全部操作，再单次 PM dispatch，复用 dirty/version/native history；`:880` expectedVersion 校验，`:892` 执行层 assertWrite。 |
| `src/agent/docx-agent.ts:2947` | `setHeadingLevel` 支持 0–6，验证原件 headingLevels，setNodeMarkup 保持 content/marks/其他 attrs，并清 styleId 使原生生成器选目标标题样式。它当前没有清 outlineOnly，不能直接用于显式大纲标题。 |
| `src/agent/docx-agent.ts:2914` | `setOutlineLevel` 支持0–9，只接受普通段落及 `outlineOnly` 标题，保留样式/字符格式并写直接大纲级别；明确拒绝 docListItem 和普通样式标题。 |
| `src/agent/docx-agent.ts:1488,1535` | `apply_style` 按实际 styleId 应用样式，支持保留 docListItem 类型。但不可据此宣称切换编号标题样式必然正确迁移 numId/ilvl；它保留旧 attrs，需要独立组合验证。 |
| `src/docx.ts:84,181` | `session.headingLevels` 来自原件真实标题样式，可达1–9；不能提供不存在的标题样式制造只在浏览器看似有效的级别。 |
| `vendor/packages/docx-engine/src/generate.ts:1732` | 原生写出支持1–9；outlineOnly 写 `w:outlineLvl`，其余标题用 `styleId ?? headingStyleIds.get(level)`。不要改 vendor。 |
| `editors/DocxAdvancedControls.tsx:36,49` | advanced context 的 execute 接 expectedVersion；useDocxAction 冻结初始 execute，成功更新内部 version。新可持续选标题的面板不能盲用打开面板时的旧 blockIndex，需每次“选择标题”明确捕获当前目标。 |
| `src/docx-protection.ts:26,249,275` | 进行中的保护切片已经提供 `getAccess(): {writable,reason,epoch,recommendedChoice}` 与 assertWrite；同意建议只读继续编辑增加epoch。此接口为研究时源码，等待保护实施/检查冻结后再接入。 |
| `editors/docx-protection.ts:25` | PM filterTransaction 拒绝不允许的 docChanged，且独立处理 NodeView DOM 手势，作为第二层保护。工具需主动查权限并显示原因，不能只让插件静默拒绝。 |
| `editors/docx-tools.css:15,39,48` | 320px 实色Inspector，body内滚，≤800px覆盖且保留32px上下文。固定actions应作为body兄弟，不能被长标题列表挤走。 |

### 5. 建议的最小诚实等效方案

**推荐：将现有“导航”扩为“文档导航 / 标题大纲” Inspector。提供标题列表、当前位置、层级修改和“编辑标题”定位按钮；不再添加 CSS outline 布局。** 这提供按标题编辑的工作流，同时正文始终可见。它是安全的大纲编辑替代，不应宣传为 Word 完整大纲模式或章节树重排。

#### 显示与选择

1. `docxHeadings(doc, styles)` 对直属 docHeading、样式标题 docParagraph/docListItem 采用上游同一判定；读取**当前** resolvedStyles，尊重 `headingOutlineOff`。保留空 docHeading（界面显示“空标题”），不把空标题文字写回；重复标题用 position/blockIndex+当前文档身份区分，不以文字作身份。
2. 标题引用新增 `blockIndex`、`kind: 'heading' | 'outline' | 'style' | 'numbered'`，原始 `textContent` 与显示标签分离；加当前实际样式/层级读值。只列正文直属标题；表格/opaque标题范围明确，不递归成假章节树。
3. 普通点击跳转，不自动修改；选中条目显示层级。控制只用一个当前目标，绝不把点击前的编辑器选区当写入目标。
4. 不造重排/删除/章节级联按钮。上游 `⊕` 是伪元素，不是已经实现的折叠手柄，不能据其外观补一个无保存证明的动作。

#### 改标题文字：优先回主编辑器

“编辑标题”验证当前引用后，将主编辑器光标置于对应标题可编辑文字处、滚到真实DOM并 focus。窄屏先关覆盖面板，使标题不被320px面板挡住；关闭面板的焦点恢复不得随后抢回导航入口。阅读模式可显式退出阅读后定位；受保护原件可跳转阅读，但编辑按钮禁用并说明原因。

标题文字直接在原节点内编辑，可保留原有字符格式、内联域、链接、批注、修订和 IME 交互。**不推荐首片提供“标题名称”纯文本覆盖框**：将 `textContent` 整段 replace 成 schema.text 会消失 mixed marks/内联对象，`replace_blocks('<hN>...')` 更会抛弃原锚点。若以后需要纯文本改名，必须单独规定混合格式映射与内联对象处理并有原生回归，不得以这一片顺手实现。

#### 改层级：两种已存在的语义不能混为一谈

- 普通样式标题：`apply_ops([{op:'setHeadingLevel',target:{blockIndexes:[frozenIndex]},level}])`，只显示当前真实可写的目标标题样式；同级提交应无操作。只改节点类型/级别/必要styleId，保留全部原 children/marks 和其他段落 attrs。
- 显式大纲标题 `outlineOnly`：`setOutlineLevel` 的0–9路径，不切换样式，不调用setHeadingLevel；级别0变正文。空白、字号、颜色、缩进、outlineOnly语义保持正确。
- 样式标题 docParagraph：展示和文字编辑可用，若用setHeadingLevel转换，须通过无列表、无特殊保护属性的窄预检。
- 编号标题 docListItem：首片完整列出和跳转/原位编辑文字；**层级修改不能直接转为docHeading**，否则numPr/list语义变化。保留当前层级并给“编号标题请通过列表与样式工具调整”的实际原因。若本次要求覆盖编号标题层级，需要另一个已证明保留numId/ilvl/编号定义及样式链的切片，不能将此窄边界隐藏掉。
- 当前Agent的样式标题级别只到6，而原件可到9。最小接入可以保留7–9标题导航/文字编辑并明确显示层级修改限制；推荐在保护agent文件冻结后，由一个所有者将 `setHeadingLevel` 验证范围窄扩为0–9（仍要求真实headingLevels），补原生7/8/9保存重开。生成器已有支持，无需改vendor或新增tool名。是否纳入此片由主会话决定；**本研究不把尚未改的0–9支持写成现状**。
- 文档级保护之外，目标含sdtShell、moveRevision、blockRevision、pPrChange、paraMarkDel、未知raw结构等，先按已有安全文字工具模式（`docx-case.ts:81,107`）制定窄预检，必要时层级只读，文字仍由主编辑器原有能力处理；不能默默重建受保护块。

### 6. 当前版本、history 与保护合同

新表单每次点击标题时捕获 `{documentId, session, editor, handle, contentVersion, protectionEpoch, blockIndex, position, node}`，选区变化不重定向。应用时重验全部身份、`handle.getVersion()`、getAccess().epoch/writable、nodeAt(position) 与 frozen node 类型/内容；旧来源A→B→A或编辑→undo不能复活旧表单。

正文/样式/外部Agent写入使当前待提交表单失效，保留用户可读输入并显示“文档已修改，请重新选择标题”；列表可继续刷新，但不得自动把旧草稿绑定到新位置。关闭、切文档、换session取消待处理请求。只读导航/当前值刷新不写历史、dirty、保存基线或版本。

应用显式层级通过 existing handle.execute + expectedVersion 走主编辑事务与单次 dirty/version更新，复用原生历史；对连续两次点击动作使用 closeHistory边界/已有manual round机制确保单步undo只撤销该次层级。不要另存React文档快照，不要用setContent替换正文。目标不变化时必须零历史、零版本、零dirty。

提交前主动 `session.protection.assertWrite()`；执行层既有 assertWrite 及PM filterTransaction继续兜底。阅读视图是呈现，不等于保护：用户明确点击编辑或应用时沿 `exitReadingForWrite` 退出阅读；保护没有许可时绝不能先退出读取状态再伪装可编辑。建议只读选择后的epoch变化要求重新选择标题。

### 7. 具体文件分工建议

| 文件 | 建议变更 |
| --- | --- |
| `editors/docx-view.ts` | 扩充标题引用与当前样式提取，保留原有 fit/resize 无关逻辑。 |
| 新 `editors/docx-outline.ts` | 纯目标捕获/可编辑能力与类型预检；不要放布局/生成HTML。 |
| `editors/DocxViewPanel.tsx` | 复用现有面板增加当前标题/层级/编辑标题入口，body内滚和固定单一应用footer。 |
| `editors/docx-views.css` | 局部选中态、最多浅层缩进、长标题换行、控件宽度、固定footer；禁止正文隐藏选择器。 |
| `editors/DocxEditor.tsx` | 主所有者串接resolvedStyles、getVersion、保护access、当前handle执行和精准focus；不改变EditorContent挂载树。保护切片在途，须待其冻结再整合，不由两个agent同时编辑。 |
| `src/agent/docx-agent.ts`（可选窄扩） | 如主会话选定，将setHeadingLevel范围0–6扩0–9，并验证现有保存链路；不得与保护实现并行改此文件。 |
| `editors/docx-view.test.ts` / 新 `docx-outline.test.ts` | heading/outlineOnly/style/numbered/bodyoff/空/重复提取与过期引用/权限预检。 |
| `editors/DocxEditor.views.test.tsx` 或新outline专项 | 实际主编辑器交互、跳转、原位输入保marks、层级native/history、readonly/reading和stale。 |
| `src/agent/docx-agent.test.ts`（仅扩级别时） | 7–9真实样式原生落盘和不存在级别拒绝。 |

无需修改server/shared/provider，也不需要模型配置、网络上传或新的文档存储协议。

### 8. 320 / 420 / Escape 交互验收要求

- 保留当前320px实色Inspector：标题栏与关闭固定；标题列表和字段body内滚；底部最多“应用层级”一个主动作，编辑标题为轻按钮。当前标题文本可换行，级别用紧凑原生/共享Select，不画九个巨按钮或深九层缩进。
- 真420px viewport 及420×500短高：page scrollWidth=420，Inspector≤320且保留32px正文上下文，文本输入/层级控件可收缩，应用动作始终可见。层级1–9缩进视觉应封顶以避免9级挤成竖列，真实级别仍用标签表达。
- 当前标题高亮、当前值、不可用原因可见；从具名折叠菜单进入前关闭该层菜单。Escape先关Select/popup，再关Inspector；回当前可见“导航”入口/折叠组/选中tab。明确点击“编辑标题”后将焦点留在主文档，不回抢入口。
- 不因列表每次更新重新focus面板，不在用户已经转移焦点后强行恢复；正在组合输入时不关闭/重建字段。

### 9. 最少必要验证

1. 真实富文本标题（粗体/颜色/超链接/双空格/中文）→编辑标题定位→原位输入，非目标marks、段落/正文/表格原样；Ctrl+A在正文仍看见所有真实内容，未设置任何outline隐藏class。
2. 普通Heading1→Heading2与显式outlineOnly2→3：各自原生pStyle/outlineLvl正确、字符格式与非目标ZIP部件保持；一次undo/redo还原；无操作导航导出精确。样式不存在/7–9未开放边界必须真实拒绝。
3. 编号样式标题出现且可跳转，层级不安全时真实禁用原因；不把它转换成失去编号的docHeading。headingOutlineOff不误列；新增/改未保存样式同步列表。
4. panel选择后正文变化、undo、文档切换A→B→A、保护epoch变化均拒绝旧提交；纯selection移动不误判版本变化且不改目标。受保护原件仍能导航，但任何层级写入零事务/dirty/version；无模型条件照常可用。
5. 唯一EditorContent/PM实例从打开导航、改级别、关闭始终保持，阅读显式编辑正常退出，Inspector当前值/单步历史一致。
6. 根会话真实浏览器1280/420/420×500，固定footer、长重复标题、9级、Escape/折叠菜单/焦点与原生下载均检查。组件mock不替代浏览器布局和DOCX下载读回。

## Related Specs

- `.trellis/workflow.md`：任务内持续执行、研究落盘、主会话派发implement/check；本角色只研究。
- `.trellis/spec/project/index.md` / `rules.md`：现行契约与研究证据责任。
- `.trellis/spec/office/frontend/editors/conventions.md`：“DOCX视图与原生表格缩放”已有合同明确导航不是可编辑大纲；实现替代后应精确更新，保留全文可见/唯一区域/无视图dirty约束。
- `.trellis/spec/office/frontend/editors/pitfalls.md`：styleId及patch式保存，不能只看画布级别。
- `.trellis/spec/office/engine/index.md` / `conventions.md`：原件补丁保存和未改部件保留。
- `.trellis/spec/office/frontend/shell/conventions.md`：具名组收缩、可见当前值/禁用原因。
- `.agents/skills/impeccable/SKILL.md` 与 `reference/operate.md`：读取context后按已有视觉系统细化操作界面，重视熟悉控件、状态与密度。此次仅规划，无UI修改及检测/视觉验收宣称。

## Caveats / Not Found

- 研究时保护代码正在变更，以上line为2026-10-17读取快照；具体权限接口以保护独立check冻结后的实现为准。
- 未运行GenOffice GUI；CSS隐藏造成的危险是模型级风险分析，未声称实际复现丢数据。
- 未发现专门的章节重排/升降级Ribbon；上游通用块移动确实存在，不能混淆为没有任何移动功能。
- 纯文本改名无法自动定义mixed marks/域映射；推荐原位编辑以保留真实编辑能力。若验收要求在面板中直接改名，这是后续明确设计/保真验证点。
- 编号标题、结构化标签、修订及复杂inline的层级修改必须具体证明；“全部可编辑大纲”不能只凭普通Heading测试宣告。安全范围与对标完整度应在当前能力矩阵如实标注。
- 未执行代码测试/构建/浏览器操作。本文件是实施建议，所有建议动作尚未实现。
