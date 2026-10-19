# Research: 文档阅读与共享文档流程源码盘点

- Query: 刷新第六模块全部阅读、整理、媒体、助手宿主、保存和离开交互；为 HTML 前后对比提供稳定 ID 和真实能力边界。
- Scope: mixed（以当前 workspace 源码为主要事实；外部材料仅作适用性复核）
- Date: 2026-10-18
- Authorization: 仅规划/HTML；未获本模块具体 HTML 冻结版本实施认可；本研究不改产品代码。

## Findings

本次刷新形成 **78 组、422 个设计状态枚举**。机器可消费清单为 `research/document-scenes.json`。这些是源码/原型覆盖枚举，**不是 422 项 GUI 测试，也不是本轮实施验收通过**。尚未在真实浏览器执行本模块交互。每项 `current_states` 是已有分支，`proposal_states` 是研究提出的恢复/保护分支；`gap` 与 `target_behavior` 不等于已实施。原型路径统一 `#scene=DOC-xxx.<state>`，当前/打磨后必须同内容、同视口比较。`current_states/proposal_states`区分已有/新提案呈现，网络失败/无命中等底层状态可能原本就存在但没有相应UI反馈。

## Files found

| 文件 | 作用 |
| --- | --- |
| `packages/renderer/src/components/DocumentPanel.tsx` | 文档查询、布局、标题/标签/目录/AI摘要、引用大纲、助手与命令宿主 |
| `packages/renderer/src/components/document/DocumentHeader.tsx` | 返回/路径/保存状态/下载/问AI/更多 |
| `packages/renderer/src/components/document/DocumentTitle.tsx` | 笔记标题就地编辑与更新时间 |
| `packages/renderer/src/components/document/doc-menu.tsx` | 标签、目录、付费AI整理菜单唯一动作表 |
| `packages/renderer/src/components/document/DocumentFooter.tsx` | 站内出链与被引用；并非原网页来源 |
| `packages/renderer/src/components/document/headings.ts` / `MarkdownBody.tsx` | 正则标题抽取与只读Tiptap渲染 |
| `packages/renderer/src/components/document/FilePreview.tsx` | 原件/正文/下载/无源降级，图片/音视频 |
| `packages/renderer/src/components/document/OfficeSourceEditor.tsx` | 五种原件编辑器io、主题、dirty与Agent句柄适配 |
| `packages/renderer/src/components/NoteEditor.tsx` | 自动保存、选区AI、内部链接与Markdown编辑器交接 |
| `packages/renderer/src/components/document/DocChatSidebar.tsx` | 完整ChatPanel容器和能力状态/导航交接 |
| `packages/renderer/src/components/document/DocChatGuide.tsx` / `DocxCapabilityStatus.tsx` | 直接发送的快捷问题、DOCX修订开关与能力读取 |
| `packages/renderer/src/components/document/DocumentCommandModal.tsx` | 模块3已有rename/move/find和只读恢复合同 |
| `packages/renderer/src/components/UnsavedGuard.tsx` / `lib/unsaved.tsx` | 手动/自动保存离开保护与pending action |
| `packages/renderer/src/routes/_app.docs.tsx` / `_app.tsx` | 详情/库切换，主对话引用、返回和收集交接 |
| `packages/renderer/src/lib/api.ts` / `lib/office-source-filename.ts` | 读取/更新/AI/源文件URL与同文件名写回 |
| `packages/shared/src/documents.ts` / `files.ts` | 字段边界、文件分派；实际代码优先于滞后注释 |
| `apps/server/src/routes/documents.ts` | 404/409、统计建议/付费AI、摘要12000字截断真实端点 |

## Code patterns and decisive contracts

1. **活编辑器保留优先**：`DocumentPanel.tsx:638` 只有无缓存doc才整页错误；`:726`缓存读错保留正文。`:278`重命名精确刷新而非整对象覆盖；但`:307` tags patch 仍set整对象缓存。后者应视潜在快照覆盖风险，不能未经执行宣称已丢稿。
2. **元数据不触发离开保护**：改标题/标签/目录属于当前篇；跨篇页脚/笔记内链/返回经过guard。`DocumentPanel.tsx:685`助手跨篇引用目前直接导航，漏guard；应做宿主一致性修复提案。
3. **当前空folder不是“知识库根”**：`documents.ts:81`空串明确移出目录；创建合同`:68`说明未指派文档仅搜索/标签可达。菜单移动toast、命令Select仍写“知识库根”，需纠正文案。
4. **付费与自动行为必须如实**：摘要/AI建议都显式POST产生用量；结果只当前内存；AI标签生成不自动加。助手快捷问题直接发送，而选区/预设只是预填，这两条不能合并。
5. **真实原件与提取正文不同**：`FilePreview.tsx:87`由viewerFor决定。无“正文/原件”切换；TXT/CSV/JSON保原样pre；原件可看不证明可检索；body空时问AI禁用。
6. **Office保存限制是现状，不是理想化三按钮**：`OfficeSourceEditor.tsx:129`注册canSave=false，现通用guard仍显示“保存并离开”但handler永远false，只提示去工具栏；不能通过HTML承诺代存。capture guard已有canSave-aware路径，需避免退化。工具栏保存现位于标签左侧quickAccess，旧“右端保存到库”说明已滞后。
7. **不宣称全路径防丢**：renderer未找到useBlocker/popstate统一拦截；MarkdownEditor:790有beforeunload。Office浏览器后退/关页及Electron关闭仍须真实宿主核对，原型不能证明。
8. **布局判据不同**：大纲依据viewport≤880隐藏；助手依据document容器≤880覆盖。Office内部toolbar/画布不在本模块重设计，需保留实际中栏测量和高度链。
9. **来源准确命名**：Footer.links.sources是站内出链；DocumentDetail.url虽存在但本页当前无原网页按钮。若增加原网页入口，必须标明前端提案而非声称已有能力。
10. **标题inline合同比命令弹窗弱**：inline Enter/blur先关且无IME/等待/失败草稿；模块3命令已有busy ref、IME、保留草稿和写成读错只重读。二者应共享语义而非复制弱行为。

## Tests inspected (not executed)

- `DocumentPanel.test.ts:4`：重复片段/Markdown归一化/目标不存在不选别次命中。
- `DocumentPanel.commands.test.tsx:39`：元数据刷新失败仍保活编辑器和命令草稿，恢复不再写入。
- `document/DocumentHeader.test.tsx:87`：各kind共享头部、保存反馈、标题单提交/Escape、菜单动作与回焦。**未覆盖inline标题IME/网络失败保留草稿。**
- `document/DocumentCommandModal.test.tsx:113`：空白/同值、IME/等待封锁、晚回包、目录失败重试、查找门槛、refresh-only。
- `document/MarkdownBody.test.tsx:8`：StrictMode、body更换后的锚点；数学/WaveDrom只读渲染及失败保源。
- `document/DocxCapabilityStatus.test.tsx:30`：修订开关、缺模型设置、读取失败重试、加载无教程。
- `editor/markdown-save.test.tsx:98`：自动保存、未保存导出、预填、Agent共用dirty链路、连续修改串行flush、保存失败不离开、内链交接。
- `lib/office-source-filename.test.ts:6`：原始文件名保留与Unicode回退。
- `NavSidebar.test.tsx:268`、`:409`：dirty导航取消/登出保护；不能代替浏览器Back或原生关闭验证。
- 未发现独立 `FilePreview.test`、`DocumentTitle.test`、`DocumentFooter.test`、`DocChatSidebar.test`、`UnsavedGuard.test`；相关行为部分在上层测试覆盖，不能据此认定零测试或全部已测。

## External references (versions and applicability)

按AGENTS研究要求，2026-10-18重新HTTP读取官网与固定源码（不是仅复制旧总结）：

- 官方 https://weknora.weixin.qq.com/ ：HTTP200，113529 bytes，SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`。官网证据表述“知识问答、Agent推理与Wiki整理”“回答附带来源引用，可打开原文核对”。适用：问答/执行/来源核验应区分；不证明Mimir有Wiki、协作、公开分享。
- 公开源码固定 commit `2c0d8384398ca756ee414eef01b71caf91e2caa6`；已保存release证据最新稳定 `v0.8.3`，published `2026-10-14T07:53:24Z`（研究日复读既有JSON，不宣称再次检查latest API）。新读 URL https://raw.githubusercontent.com/Tencent/WeKnora/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/views/knowledge/components/DocumentActionMenu.vue ：HTTP200，5628 bytes，SHA256 `b9367e771406894508121326dd1178be06609ef01c66c4ac86783b430e987ba2`。
- 具体源码：DocumentActionMenu.vue:44 原件下载受canDownload和文档kind控制；:54 manual才编辑；:96 目录移动受canMutateKnowledge控制；:34 按真实解析状态决定动作。适用：按真实能力显示入口与错误，不照搬其重建/取消解析/权限/批量功能，因为Mimir此模块没有对应合同。
- 可追溯既有证据目录 `.trellis/tasks/10-18-interaction-library/research/reference-evidence/`：`weknora-site-visible-text.txt:41`、`DocumentActionMenu.vue:44`、`source-map.json`、`weknora-latest-release.json`。HTTP返回与既有固定源码哈希一致；此研究没有执行登录后的WeKnora界面。
- 主视觉/阅读布局依AGENTS使用Obsidian，已有帮助仓库版本 `08ef563f07b78dd589f19b1583d089c1e2d2377c` 的Workspace/Tabs/Tags证据可复用；本盘点未重新做Obsidian截图或宣称具体像素。详细本模块外部调研由同任务reference研究补齐。
- Office toolbar主参考仍Office for web/Google Docs/GenOffice，绝不借WeKnora Markdown editor改写Office工具栏；本模块Office仅宿主交接和保存限制。

## Related specs

- `.trellis/spec/renderer/frontend/document/conventions.md`：共享文档头部/源文件与命令恢复合同。
- `.trellis/spec/renderer/frontend/document/pitfalls.md`：标题Typography特异性；不可按旧注释假定正确字号。
- `.trellis/spec/renderer/frontend/editor/conventions.md`：编辑方言/外壳在Office，不另造Markdown渲染。
- `.trellis/spec/office/frontend/shell/conventions.md`：保存quickAccess、内部滚动/焦点/中栏和窄屏合同。
- `.trellis/spec/shared/contract/document-agent.md`：真实句柄/文档/格式/版本/续轮身份，截图显式发送，不以draftAgent授执行权限。
- `.trellis/spec/renderer/frontend/search-parity.md` / `capture-parity.md` / `library-parity.md`：复用模块3–5的命令/守卫/源文件边界，不重造。

## Complete source-to-scene inventory

### DOC-001 阅读路由与返回范围

- 归属：`module5+module6`；类型：`current`。
- 依据：`packages/renderer/src/routes/_app.docs.tsx:20`；`packages/renderer/src/routes/_app.tsx:285`。
- 当前行为：/docs 无 id 渲染 LibraryView；有 id 进入详情，返回库保留 scope；openDocument 清 cameFromChat。
- 缺口/待验证：未发现独立能力缺口；仍需按批准稿校对视觉、可达性和恢复细节。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：库中打开沿用 module5；详情返回由 Header 调用守卫。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`library`、`note`、`file`、`capture`、`direct-id`。
- 路径：`#scene=DOC-001.<state>`。

### DOC-002 未选文档组件空态

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:626`；`packages/renderer/src/routes/_app.docs.tsx:29`。
- 当前行为：组件 documentId 未定义显示“选一条开始看”；正常 docs 路由无 id 时显示库，不触发此空态。
- 缺口/待验证：不可把组件备用态作为真实 /docs 首页。
- 提案或保留合同：HTML 单独标明组件防御态；主入口展示库。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`component-empty`、`route-library`。
- 路径：`#scene=DOC-002.<state>`。

### DOC-003 首次读取与骨架

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:82`；`packages/renderer/src/components/DocumentPanel.tsx:648`。
- 当前行为：GET document query 按 ID 独立；无 doc 且未失败显示 6 行 Skeleton。
- 缺口/待验证：未发现独立能力缺口；仍需按批准稿校对视觉、可达性和恢复细节。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：请求结束后进入对应正文；骨架不可代表文档确实为空。
- HTML状态：`loading`、`resolved`、`slow`。
- 路径：`#scene=DOC-003.<state>`。

### DOC-004 初次加载失败/不存在

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:638`；`apps/server/src/routes/documents.ts:57`。
- 当前行为：无缓存时只显示“文档加载失败”；服务端 404 文档不存在；当前 UI 无重试或返回入口。
- 缺口/待验证：网络失败和404混在一起；整页没有可用恢复按钮。
- 提案或保留合同：提案：清晰错误原因、重试读取与返回库；不从失败状态推断笔记能力。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`network-error`、`not-found`、`retry-pending`、`recovered`。
- 路径：`#scene=DOC-004.<state>`。 其中仅提案新增状态：`retry-pending`、`recovered`。

### DOC-005 缓存刷新失败保留活内容

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:726`；`packages/renderer/src/components/DocumentPanel.commands.test.tsx:39`。
- 当前行为：有缓存且 docQuery.isError 保留正文/编辑器，显示“暂时无法刷新文档，已保留当前内容。”及重试刷新。
- 缺口/待验证：未发现独立能力缺口；仍需按批准稿校对视觉、可达性和恢复细节。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：重试仅读 GET；同一编辑器节点、未保存正文与命令草稿保留。
- HTML状态：`cached`、`refreshing`、`refresh-error`、`retry`、`recovered`。
- 路径：`#scene=DOC-005.<state>`。

### DOC-006 文档种类/失败标记

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:807`；`packages/renderer/src/components/document/DocumentHeader.tsx:79`；`packages/renderer/src/components/DocumentBadges.tsx:1`。
- 当前行为：note→NoteEditor，file→FilePreview，其余→只读Markdown；仅 failed 显示异常状态徽标。
- 缺口/待验证：不要依据旧注释宣称全部上传件只读，实际Office支持编辑。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`note`、`web`、`wechat`、`github`、`file`、`failed`。
- 路径：`#scene=DOC-006.<state>`。

### DOC-007 共享紧凑标题栏

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/DocumentHeader.tsx:54`；`packages/renderer/src/components/document/DocumentPanel.style.ts:35`。
- 当前行为：笔记显示目录末段/标题路径，主标题在画布；其他格式 h1 在头部；动作按能力显示。
- 缺口/待验证：窄屏时返回、保存状态、问AI、更多需测真实宽度，不能挤出主动作。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`note-path`、`readonly-title`、`long-title`、`narrow`。
- 路径：`#scene=DOC-007.<state>`。

### DOC-008 返回库/返回对话

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/DocumentHeader.tsx:56`；`packages/renderer/src/routes/_app.tsx:295`；`packages/renderer/src/routes/_app.tsx:400`。
- 当前行为：来自主对话引用有“返回对话”，同时可有返回库；均经 runGuarded；lastConversationId 仅当前壳内保存。
- 缺口/待验证：未发现独立能力缺口；仍需按批准稿校对视觉、可达性和恢复细节。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Enter/Space 返回；取消守卫应回到原入口。
- 失败/恢复：dirty 留下/失败时仍在原文档；刷新页面不承诺恢复 cameFromChat。
- HTML状态：`to-library`、`to-chat`、`dirty`、`cancel`、`leave`。
- 路径：`#scene=DOC-008.<state>`。

### DOC-009 笔记主标题与更新时间

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/DocumentTitle.tsx:29`；`packages/renderer/src/components/document/DocumentPanel.style.ts:128`。
- 当前行为：标题在编辑正文外；hover/focus-within 铅笔出现；窄屏/粗指针40px常显；真实 updatedAt 格式化显示。
- 缺口/待验证：不要向正文写入第二个主标题或虚构“刚刚更新”。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`idle`、`hover`、`focus`、`long-title`、`narrow`。
- 路径：`#scene=DOC-009.<state>`。

### DOC-010 标题就地编辑提交/取消

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/DocumentTitle.tsx:17`。
- 当前行为：Input underlined max200；Enter提交、blur提交、Escape取消；settledRef避免Enter+blur双提交；空白静默退出不写。
- 缺口/待验证：空标题缺字段反馈；编辑结束早于网络结果，缺明确等待。
- 提案或保留合同：提案：显式确认/取消；Enter排除IME后确认、Escape取消、blur留稿不自动提交；空白阻止确认并说明。等待单飞与草稿保留按DOC-011/012。
- 键盘/退出：Enter/blur保存；Escape取消；Enter/Escape后回铅笔。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`edit`、`enter`、`blur`、`escape`、`unchanged`、`blank`、`limit-200`、`confirm`、`cancel`、`blur-draft`。
- 路径：`#scene=DOC-010.<state>`。 其中提案新增呈现：`blank`校验、`confirm`、`cancel`、`blur-draft`。

### DOC-011 标题IME与同步单飞

- 归属：`module6`；类型：`proposal`。
- 依据：`packages/renderer/src/components/document/DocumentTitle.tsx:41`；`packages/renderer/src/components/DocumentPanel.tsx:278`。
- 当前行为：当前 inline 标题未检查 isComposing/229；仅本轮 finish 去重，不锁 mutation 在途重复编辑。
- 缺口/待验证：中文确认可能提前提交；等待期可再次开改名并产生并发。
- 提案或保留合同：提案补 IME 保护和同步 busy；编辑值在途仍可读；等待不重复写。
- 键盘/退出：组合输入确认不能保存或取消。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`ime-enter`、`ime-escape`、`pending`、`double-submit`。
- 路径：`#scene=DOC-011.<state>`。 其中仅提案新增状态：`ime-enter`、`ime-escape`、`pending`、`double-submit`。

### DOC-012 标题请求失败与读取恢复

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:278`；`packages/renderer/src/components/document/DocumentTitle.tsx:21`。
- 当前行为：renameTitle PATCH成功后精确invalidate，读取失败抛 DocumentCommandRefreshError；inline标题先退出，只通过 message 报错；命令弹窗已有保留草稿和只重读。
- 缺口/待验证：inline与命令宿主错误恢复不一致；inline丢失未保存的改名草稿。
- 提案或保留合同：提案沿用模块3已保存/读取失败分离语义；不覆盖活编辑正文。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`write-error`、`draft-retained`、`saved-read-error`、`retry-read`、`success`。
- 路径：`#scene=DOC-012.<state>`。 其中仅提案新增状态：`draft-retained`、`retry-read`。

### DOC-013 笔记保存状态反馈

- 归属：`module6+office-shell-reuse`；类型：`current`。
- 依据：`packages/renderer/src/components/document/DocumentHeader.tsx:103`；`packages/renderer/src/components/DocumentPanel.tsx:715`；`packages/renderer/src/components/NoteEditor.tsx:63`。
- 当前行为：note保存反馈区分未保存/保存中/已保存/保存失败；标题rename在途覆盖为saving；error tooltip 指向工具栏保存重试。
- 缺口/待验证：error不是标题改名失败的可靠持久状态；需要明确状态来源但不可假报保存成功。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`idle`、`pending`、`saving`、`saved`、`error`、`reduced-motion`。
- 路径：`#scene=DOC-013.<state>`。

### DOC-014 新建笔记一次性正文焦点

- 归属：`module3+module6+office-reuse`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:820`；`packages/renderer/src/components/NoteEditor.tsx:55`；`packages/renderer/src/routes/_app.tsx:316`。
- 当前行为：newNoteFocusId 传 focusOnReady，消费后清空；来自现有新建链路，不额外自动改标题。
- 缺口/待验证：未发现独立能力缺口；仍需按批准稿校对视觉、可达性和恢复细节。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`created`、`editor-ready`、`focused`、`consumed`。
- 路径：`#scene=DOC-014.<state>`。

### DOC-015 逐文档滚动恢复

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:102`；`packages/renderer/src/components/DocumentPanel.tsx:1006`。
- 当前行为：Map按文档ID存scrollTop；note用.me-scroll，其余优先内滚；20次100ms等布局；仅内存不跨刷新。
- 缺口/待验证：恢复值与新引用定位先后需真实浏览器验证，不能声明跨会话持久化。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：滚动容器不应使工具栏/保存状态脱离视口。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`readonly-scroll`、`note-scroll`、`source-scroll`、`return`、`delayed-layout`。
- 路径：`#scene=DOC-015.<state>`。

### DOC-016 大纲显示条件与归属

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:137`；`packages/renderer/src/components/DocumentPanel.tsx:683`；`packages/renderer/src/components/DocumentPanel.tsx:827`；`packages/renderer/src/components/DocumentPanel.tsx:880`。
- 当前行为：≥2个标题、无能显示原件、视口非≤880、侧栏未开才显示；note在EditorShell.bodySide；只读在面板aside。
- 缺口/待验证：宽度判据现为视口，AI面板覆盖判据为实际容器，两者不能混用。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`two-headings`、`one-heading`、`note`、`readonly`、`source-hidden`、`ai-hidden`、`narrow-hidden`。
- 路径：`#scene=DOC-016.<state>`。

### DOC-017 大纲层级/锚点/联动

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/headings.ts:15`；`packages/renderer/src/components/DocumentPanel.tsx:477`；`packages/renderer/src/components/DocumentPanel.tsx:528`；`packages/renderer/src/components/document/DocumentPanel.style.ts:620`。
- 当前行为：h1/h2压成二级，h3–6压为三级；按钮按DOM顺序匹配；点击滚最近可滚容器；IntersectionObserver联动aria-current=location。
- 缺口/待验证：标题文本直接保留Markdown记号；没有持久展开折叠能力。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab定位各标题，Enter/Space跳转；active不应仅靠颜色。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`idle`、`hover`、`focus`、`active`、`deep-level`、`long-heading`、`jump`、`scroll-follow`。
- 路径：`#scene=DOC-017.<state>`。

### DOC-018 大纲代码围栏/动态正文边界

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/headings.ts:17`；`packages/renderer/src/components/DocumentPanel.tsx:973`；`packages/renderer/src/components/document/MarkdownBody.tsx:34`。
- 当前行为：正则会把围栏内#误识别，注释已承认DOM顺序错位；body取服务端doc，不直接订阅笔记未保存标题。
- 缺口/待验证：HTML不能把现存错位描述成正确能力；修复是否纳入需明确。
- 提案或保留合同：提案对围栏和动态DOM重挂做准确映射；正文内部编辑算法归Office/Markdown复用。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`fenced-heading`、`duplicate-text`、`dom-replaced`、`no-target`。
- 路径：`#scene=DOC-018.<state>`。

### DOC-019 引用进入与高亮定位

- 归属：`module3+module6`；类型：`current`。
- 依据：`packages/renderer/src/routes/_app.tsx:295`；`packages/renderer/src/routes/_app.tsx:302`；`packages/renderer/src/components/DocumentPanel.tsx:551`。
- 当前行为：主对话引用携snippet/start/end/matchedBy进入文档；搜索命中同样构造Citation；activeCitation prop优先。
- 缺口/待验证：未发现独立能力缺口；仍需按批准稿校对视觉、可达性和恢复细节。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：引用入口键盘沿用来源组件；定位不应把焦点抢到无操作正文。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`chat-citation`、`search-hit`、`same-doc`、`new-doc`、`highlighted`。
- 路径：`#scene=DOC-019.<state>`。

### DOC-020 引用重复正文与Markdown归一化

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:1015`；`packages/renderer/src/components/DocumentPanel.tsx:1031`；`packages/renderer/src/components/DocumentPanel.tsx:1071`；`packages/renderer/src/components/DocumentPanel.test.ts:4`。
- 当前行为：小写/去空白/Markdown记号，原始start确定重复次数；全文→40→20字符前缀降级；短于4字符不匹配；跨文本节点Range。
- 缺口/待验证：不保证所有复杂渲染都能定位；不能把原始Markdown偏移当DOM偏移。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`repeat-first`、`repeat-later`、`markdown-noise`、`cross-node`、`truncated-snippet`。
- 路径：`#scene=DOC-020.<state>`。

### DOC-021 引用无命中/不支持高亮API

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:594`；`packages/renderer/src/components/DocumentPanel.tsx:1083`；`packages/renderer/src/components/DocumentPanel.tsx:1140`。
- 当前行为：先清旧高亮；异步挂载20次150ms重试；找不到只打开、不高亮错位；无CustomHighlight仍滚动定位。
- 缺口/待验证：无命中没有可见解释；提案可温和说明“已打开文档，未定位到原片段”。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`no-match`、`short-snippet`、`no-highlight-api`、`detached-range`、`timeout`。
- 路径：`#scene=DOC-021.<state>`。 其中仅提案新增状态：`no-match`。

### DOC-022 引用连续定位与生命周期

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:580`；`packages/renderer/src/components/DocumentPanel.tsx:588`；`packages/renderer/src/components/DocumentPanel.tsx:621`。
- 当前行为：新引用先删除旧CSS高亮；成功/超时消费context或本地引用，cleanup取消异步尝试。
- 缺口/待验证：仅effect取消，没有引用失败状态UI；需要验证旧高亮不会残留下一文档。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`same-doc-next`、`consume-once`、`switch-document`、`stale-range`。
- 路径：`#scene=DOC-022.<state>`。

### DOC-023 更多菜单打开/键盘/回焦

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/DocumentHeader.tsx:40`；`packages/renderer/src/components/document/DocumentHeader.tsx:161`；`packages/renderer/src/components/document/DocumentPanel.style.ts:259`。
- 当前行为：Dropdown click/ArrowDown打开并autoFocus；Esc关闭并回触发；动作后统一closeMenu；portal子菜单沿用样式。
- 缺口/待验证：外点关闭不应无条件抢焦点；子层Esc是否逐层由AntD实际行为验证。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab至更多；ArrowDown打开；方向键导航；Escape关闭当前层并回焦。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`closed`、`open`、`submenu`、`keyboard`、`escape`、`outside`、`action-focus`。
- 路径：`#scene=DOC-023.<state>`。

### DOC-024 已有标签/删除/清空

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/doc-menu.tsx:70`。
- 当前行为：标签子菜单显示建议和已有，已有逐项“－”，支持清除全部；父行显示数量；无内容禁用“还没有标签”。
- 缺口/待验证：只管理已有和建议；没有任意标签输入控件，不能悄悄新增自定义编辑表单。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`existing`、`remove`、`clear`、`no-tags`、`long-tag`。
- 路径：`#scene=DOC-024.<state>`。

### DOC-025 统计建议标签读取

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:434`；`packages/renderer/src/components/document/doc-menu.tsx:66`；`apps/server/src/routes/documents.ts:126`。
- 当前行为：按documentId及tags key GET suggested-tags；排除已有；当前loading/error都退化为空候选。
- 缺口/待验证：读取失败被当成没有建议；无独立重试。
- 提案或保留合同：提案在子菜单区分读取/失败/无建议，重试只读且不受目录错误阻断。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`suggested`、`all-added`、`empty`、`loading`、`error`、`retry`。
- 路径：`#scene=DOC-025.<state>`。 其中仅提案新增状态：`loading`、`error`、`retry`。

### DOC-026 标签写入与正文缓存保真

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:307`；`packages/renderer/src/components/document/doc-menu.tsx:80`。
- 当前行为：PATCH tags成功setQueryData整DocumentDetail，刷新documents/folders/tags/counts；失败只message。
- 缺口/待验证：无同步单飞和行等待；整对象body快照有覆盖活笔记缓存的风险；需按重命名模式收敛。
- 提案或保留合同：提案同步锁+可见等待/错误重试，精确刷新元数据且保留同一编辑器、正文草稿。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`adding`、`removing`、`clearing`、`pending`、`error`、`success`、`retry`。
- 路径：`#scene=DOC-026.<state>`。 其中仅提案新增状态：`pending`、`retry`。

### DOC-027 标签字段/容量边界

- 归属：`module6`；类型：`current`。
- 依据：`packages/shared/src/documents.ts:76`；`packages/renderer/src/components/document/doc-menu.tsx:77`。
- 当前行为：后端tags最多20个，每项trim后1–50字；候选点击直接数组追加，无前端容量提示。
- 缺口/待验证：上限时仍可点击并依赖400；AI候选长度/重复需按实际结果校验。
- 提案或保留合同：提案上限禁用新增并解释；已有删除可用；不添加新后端能力。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`20-tags`、`over-capacity`、`long-tag`、`duplicate`。
- 路径：`#scene=DOC-027.<state>`。 其中仅提案新增状态：`over-capacity`。

### DOC-028 目录菜单与当前路径

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/doc-menu.tsx:119`；`packages/renderer/src/components/DocumentPanel.tsx:665`；`packages/renderer/src/components/document/folders.ts:1`。
- 当前行为：递归flatten全部路径；当前目录禁用；有当前folder且folders非空才提供移出目录；无目录禁用“还没有其它目录”。
- 缺口/待验证：这不是可新建目录树；不把KB根和folder=null混为一谈。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`paths`、`current`、`rootless`、`long-path`、`no-folders`。
- 路径：`#scene=DOC-028.<state>`。

### DOC-029 目录加载/失败/恢复

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:435`；`packages/renderer/src/components/DocumentPanel.tsx:665`；`packages/renderer/src/components/document/doc-menu.tsx:119`。
- 当前行为：folderQuery加载/失败未传菜单，data??[]直接伪装空目录；有缓存时仍可选择。
- 缺口/待验证：目录菜单与已做的命令移动弹窗状态合同不一致。
- 提案或保留合同：提案目录子菜单局部loading/error/retry，真实空态明确；目录错误不阻断标签与AI。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`loading`、`error`、`cached-error`、`retry`、`empty`、`loaded`。
- 路径：`#scene=DOC-029.<state>`。 其中仅提案新增状态：`loading`、`error`、`cached-error`、`retry`。

### DOC-030 菜单移动/移出目录

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:319`；`packages/renderer/src/components/document/doc-menu.tsx:132`；`packages/shared/src/documents.ts:81`。
- 当前行为：PATCH {folder}，空串移出；当前同值直接return；成功刷新document/documents/folders；失败message。
- 缺口/待验证：菜单动作无等待锁；空串提示“知识库根”错误：它是未指派文档，只能搜索/标签找。
- 提案或保留合同：提案明确“移出目录（文档保留）”；保留失败上下文和已写入/读取失败区分。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`move`、`current-noop`、`remove`、`pending`、`error`、`saved-read-error`。
- 路径：`#scene=DOC-030.<state>`。 其中仅提案新增状态：`pending`。

### DOC-031 移动8秒撤销

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:340`。
- 当前行为：message success持续8秒，按钮PATCH回旧folder并刷新；目标ID捕获在闭包。
- 缺口/待验证：撤销按钮无同步单飞；后续新移动后点旧撤销可能覆盖更新，需绑定当前移动上下文。
- 提案或保留合同：提案保留真实8秒时长；撤销等待/失败明确，不宣传历史版本或批量恢复。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`toast`、`undo`、`pending`、`undo-success`、`undo-error`、`expired`。
- 路径：`#scene=DOC-031.<state>`。

### DOC-032 AI整理入口与费用说明

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/doc-menu.tsx:167`；`packages/renderer/src/components/DocumentPanel.tsx:388`；`packages/renderer/src/components/DocumentPanel.tsx:411`。
- 当前行为：菜单底部分组AI/产生用量；摘要与AI建议标签无正文禁用；共享aiSummaryLoading，忙时两项均“AI正在读…”。
- 缺口/待验证：busy依赖state非同步ref，不充分阻止同帧双触发；无取消能力。
- 提案或保留合同：提案同步singleflight；说明付费动作；不虚构流式/停止摘要。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`ready`、`no-body`、`busy`、`cost-label`。
- 路径：`#scene=DOC-032.<state>`。

### DOC-033 AI摘要展示/临时性

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:215`；`packages/renderer/src/components/DocumentPanel.tsx:388`；`packages/renderer/src/components/DocumentPanel.tsx:756`；`apps/server/src/routes/documents.ts:162`。
- 当前行为：POST summary，服务端只取body前12000字；usedModel=true显示文本和model；只当前内存不落库；换篇不显示旧摘要。
- 缺口/待验证：不得显示完整超长正文已全读或承诺永久保存；无收起/删除摘要控件。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`generate`、`ready`、`regenerated`、`leave`、`reopen`。
- 路径：`#scene=DOC-033.<state>`。

### DOC-034 AI摘要缺模型/失败

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:388`。
- 当前行为：无模型warning返回result.text，不伪造摘要；请求失败message；忙结束后可重新点；长摘要pre-wrap。
- 缺口/待验证：生成失败没有贴近正文的持久反馈；不可把重试说成免费。
- 提案或保留合同：提案局部等待和错误，保留已有成功摘要，新调用仍显式产生用量。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`pending`、`no-model`、`request-error`、`retry`、`long-result`。
- 路径：`#scene=DOC-034.<state>`。

### DOC-035 AI候选标签生成

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:411`。
- 当前行为：POST suggested-tags/ai，usedModel=false提示模型设置路径；零标签info；有候选单独AI块，生成不自动挂载标签。
- 缺口/待验证：设置路径只是文字无按钮；结果不持久化，不承诺重新打开仍保留。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`pending`、`no-model`、`empty`、`candidates`、`error`、`retry`。
- 路径：`#scene=DOC-035.<state>`。

### DOC-036 AI候选应用/失败恢复

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:763`。
- 当前行为：候选按钮PATCH tags后立即从本地候选移除；patch失败不会还原；全部选完本地空数组使整块消失，“都加上了”分支常无法呈现。
- 缺口/待验证：请求未成功先移除导致失败后候选丢失；并发点击可能用旧tags数组。
- 提案或保留合同：提案单飞/成功后移除/失败保留候选；全加上明确完成态；不丢正文草稿。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`candidate`、`apply`、`pending`、`success`、`failure`、`remaining`、`all-added`。
- 路径：`#scene=DOC-036.<state>`。 其中仅提案新增状态：`pending`、`failure`、`all-added`。

### DOC-037 AI结果文档ID与迟到结果

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:215`；`packages/renderer/src/components/DocumentPanel.tsx:388`；`packages/renderer/src/components/DocumentPanel.tsx:411`；`packages/renderer/src/components/DocumentPanel.tsx:658`。
- 当前行为：结果带documentId渲染过滤；但loading是跨文档共享boolean，旧请求直到结束仍影响新篇入口。
- 缺口/待验证：仅结果隔离不等于请求生命周期隔离；同ID返回时也需防过期结果覆盖新请求。
- 提案或保留合同：提案document+request token界定等待/结果；无需后台取消端点。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`switch-pending`、`late-summary`、`late-tags`、`new-document`。
- 路径：`#scene=DOC-037.<state>`。

### DOC-038 只读正文排版/复杂块

- 归属：`module6+office-markdown-reuse`；类型：`current`。
- 依据：`packages/renderer/src/components/document/MarkdownBody.tsx:14`；`packages/renderer/src/components/ContentTypography.style.ts:1`；`packages/renderer/src/components/document/MarkdownBody.test.tsx:41`。
- 当前行为：只读Tiptap共用createExtensions；表格/代码/数学/WaveDrom等沿用同一方言；body变化重建只读editor；复杂图失败保留源。
- 缺口/待验证：不能假造阅读编辑切换；抓取内容只读。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`paragraph`、`table`、`code`、`image`、`math`、`diagram`、`diagram-error`、`empty`。
- 路径：`#scene=DOC-038.<state>`。

### DOC-039 正文内部链接交接

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/NoteEditor.tsx:184`；`packages/renderer/src/components/DocumentPanel.tsx:822`；`packages/renderer/src/editor/extensions.ts:30`；`packages/renderer/src/components/document/MarkdownBody.tsx:21`。
- 当前行为：笔记internal-note明确回调runGuarded；只读MarkdownBody不传导航处理，extensions设置openOnClick=false。
- 缺口/待验证：只读正文链接是否可点击、默认新标签行为不能仅凭锚点存在宣称已实现；需浏览器验证。
- 提案或保留合同：提案仅修复宿主链接可达性，内部ID经守卫、外部真实链接明确；不新增Wiki能力。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`note-internal`、`dirty`、`cancel`、`readonly-link`、`external-link`。
- 路径：`#scene=DOC-039.<state>`。

### DOC-040 抓取原网页来源入口

- 归属：`module6`；类型：`proposal`。
- 依据：`packages/shared/src/documents.ts:96`；`packages/renderer/src/components/document/DocumentFooter.tsx:25`；`packages/renderer/src/components/document/DocumentHeader.tsx:54`。
- 当前行为：doc有url字段，但当前Header/Footer未显示原网页URL；Footer“来源”只是站内出链。
- 缺口/待验证：原网页查看不是现成入口，原型若添加必须标提案。
- 提案或保留合同：建议提案：抓取文档显示原网页域名/外链；使用已有url，不称公开分享，不新增后端。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`source-url`、`no-url`、`external-open`。
- 路径：`#scene=DOC-040.<state>`。 其中仅提案新增状态：`source-url`、`no-url`、`external-open`。

### DOC-041 来源/被引用双链内容

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/DocumentFooter.tsx:24`；`packages/shared/src/documents.ts:138`。
- 当前行为：服务端links.sources/backlinks为站内文档；任一非空才显示；button标题文本，没有计数折叠和分页。
- 缺口/待验证：不要将“来源”误当URL；多链接长标题布局需覆盖。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`none`、`sources`、`backlinks`、`both`、`long-title`、`many-links`。
- 路径：`#scene=DOC-041.<state>`。

### DOC-042 双链打开/守卫/失效文档

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:867`；`packages/renderer/src/components/document/DocumentFooter.tsx:35`。
- 当前行为：双链回调runGuarded→onOpenDocument；目标被删后进入读取失败。
- 缺口/待验证：失效目标无专门恢复文案；回焦与旧滚动位置需抽验。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：每个来源/被引用是button，Tab/Enter/Space可达。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`activate`、`dirty`、`cancel`、`open`、`missing-target`。
- 路径：`#scene=DOC-042.<state>`。

### DOC-043 文件实际分派矩阵

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/FilePreview.tsx:77`；`packages/shared/src/files.ts:144`。
- 当前行为：hasSource+viewer非none优先原件；否则有body显示正文；否则有源下载卡；无源Empty。
- 缺口/待验证：禁止恢复“正文/原件”切换；viewerFor是唯一分派源。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`source-viewer`、`source-no-viewer`、`body-only`、`no-source`。
- 路径：`#scene=DOC-043.<state>`。

### DOC-044 提取原因/可检索性

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/FilePreview.tsx:103`；`packages/shared/src/documents.ts:134`。
- 当前行为：parseError优先；有body无提示；planned说明后续提取、暂无可检索正文；其他空说明无可提取文字；不遮原件。
- 缺口/待验证：部分unsupported文案可能与planned不同；以parseSupport真实结果为准；原件可看不等于AI能引用。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`parse-error`、`planned`、`empty-text`、`has-body`、`source-visible`。
- 路径：`#scene=DOC-044.<state>`。

### DOC-045 图片预览/原始大小

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/FilePreview.tsx:189`；`packages/renderer/src/components/document/FilePreview.tsx:381`。
- 当前行为：图片不放大，最大100%按比例；可点新标签打开原件实际大小；alt doc.title；onError下载降级。
- 缺口/待验证：真实新标签/原件鉴权由宿主验；HTML只能模拟。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab到a，Enter打开原件；焦点环明确。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`loaded`、`small-image`、`large-image`、`hover`、`focus`、`open-original`、`broken`。
- 路径：`#scene=DOC-045.<state>`。

### DOC-046 音频原生播放器

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/FilePreview.tsx:218`。
- 当前行为：audio controls src同源原件URL，onError下载降级；不提供自定义转录按钮。
- 缺口/待验证：本模块不重绘原生播放器；不同浏览器外观不同，不能用HTML假播放器证明宿主通过。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：原生controls键盘与媒体可用性需实际宿主验。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`loading`、`ready`、`playing`、`paused`、`ended`、`error`。
- 路径：`#scene=DOC-046.<state>`。

### DOC-047 视频原生播放器

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/FilePreview.tsx:224`。
- 当前行为：video controls src同源原件URL，max-height70vh；不等于后台视频内容可检索。
- 缺口/待验证：全屏/播放/编解码/Range需宿主验证；不添加本模块分析视频能力。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：沿原生controls；播放/全屏快捷键由浏览器。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`loading`、`ready`、`playing`、`paused`、`seek`、`fullscreen`、`error`。
- 路径：`#scene=DOC-047.<state>`。

### DOC-048 查看器失败下载降级

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/FilePreview.tsx:90`；`packages/renderer/src/components/document/FilePreview.tsx:115`。
- 当前行为：按doc.id记录失败；失败卡“这个浏览器打不开这种格式”+mime/size+下载；换文档不继承失败。
- 缺口/待验证：同一文档没有重试预览入口；若原型增加则标提案。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：保留原件下载可用，不以空白代替失败，不自动重新上传。
- HTML状态：`image-error`、`audio-error`、`video-error`、`fallback`、`next-document`。
- 路径：`#scene=DOC-048.<state>`。

### DOC-049 原样文本预览

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/FilePreview.tsx:235`；`packages/renderer/src/components/document/FilePreview.tsx:315`；`packages/renderer/src/components/document/FilePreview.tsx:351`。
- 当前行为：text/*（除markdown/html）与application/json用pre等宽、pre-wrap、break-word；有内滚max70vh，保持换行/#。
- 缺口/待验证：yaml映射application/yaml，不走isPlainText；不可把所有代码格式宣称已按pre渲染。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`txt`、`csv`、`json`、`code`、`long-lines`。
- 路径：`#scene=DOC-049.<state>`。

### DOC-050 提取正文回退

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/FilePreview.tsx:244`；`packages/renderer/src/components/document/FilePreview.tsx:262`。
- 当前行为：无可看原件但有body，非纯文本走MarkdownBody；isExtracted仅openxml MIME提示版式不同。
- 缺口/待验证：注释称旧doc版式说明，但application/msword并不命中isExtracted；原型不能宣称旧doc已有提示。
- 提案或保留合同：提案在实际提取格式明确版式差异；不虚构原件可编辑。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`legacy-doc`、`extracted-markdown`、`parse-warning`。
- 路径：`#scene=DOC-050.<state>`。

### DOC-051 无查看器但有原件

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/FilePreview.tsx:268`。
- 当前行为：说明卡格式无在线预览或提取失败；原件已保存可下载；主按钮下载原件。
- 缺口/待验证：窄屏卡片横排图标/文字/主按钮需防挤压，不能省略真实下一步。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`unsupported`、`parse-error`、`download`、`narrow-card`。
- 路径：`#scene=DOC-051.<state>`。

### DOC-052 无原件/无正文

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/FilePreview.tsx:297`。
- 当前行为：无源不给下载，避免404假动作；显示格式无在线预览或提取失败。
- 缺口/待验证：缺少可操作恢复路径，提案仅返回库/说明，不能凭空提供重新提取端点。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`missing-source`、`parse-error`、`empty`。
- 路径：`#scene=DOC-052.<state>`。

### DOC-053 下载原件入口

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/DocumentHeader.tsx:130`；`packages/renderer/src/components/document/FilePreview.tsx:129`；`packages/renderer/src/lib/api.ts:858`。
- 当前行为：头部仅kind=file且sourceKey存在显示下载；下载卡同端点?download=1；浏览器处理下载，不经blob全量复制。
- 缺口/待验证：没有浏览器下载完成回执，不能显示“已下载成功”；Office有dirty时下载端点仍是上次已保存原件。
- 提案或保留合同：提案明确“下载已保存原件”语义；当前未保存导出属于Office内部。
- 键盘/退出：键盘激活原生a；不触发离开守卫，不暗示自动保存。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`file-source`、`readonly-no-download`、`downloading`、`native-error`。
- 路径：`#scene=DOC-053.<state>`。

### DOC-054 Office宿主五格式交接

- 归属：`module6-host+office-reuse`；类型：`current`。
- 依据：`packages/renderer/src/components/document/OfficeSourceEditor.tsx:34`；`packages/renderer/src/components/document/FilePreview.tsx:148`；`packages/renderer/src/components/document/FilePreview.tsx:177`。
- 当前行为：五格式统一OfficeSourceEditor，flush/io/appearance/onDirty/Agent句柄透传；笔记Markdown另由NoteEditor适配同一Office shell。
- 缺口/待验证：不重做格式内Ribbon、画布、格式专属弹窗；本模块只示意交接与真实宿主边界。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`docx`、`xlsx`、`pptx`、`html`、`pdf`。
- 路径：`#scene=DOC-054.<state>`。

### DOC-055 原件载入/保存/错误边界

- 归属：`module6-host+office-reuse`；类型：`current`。
- 依据：`packages/renderer/src/lib/office-source-filename.ts:32`；`packages/renderer/src/components/document/OfficeSourceEditor.tsx:59`。
- 当前行为：io.load按原件URL带cookie取字节，HTTP错误抛；io.save替换同文档原件，保留原始文件名；解析/保存UI由Office执行。
- 缺口/待验证：宿主io保存忽略FileUploadResponse详情；不能宣称已对parseError、缓存刷新做额外验证。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：Office保存失败保持dirty；具体格式恢复由Office既有实现，不用HTML模拟替代。
- HTML状态：`loading`、`ready`、`load-error`、`dirty`、`saving`、`save-error`、`filename-preserved`。
- 路径：`#scene=DOC-055.<state>`。

### DOC-056 Office无法守卫代存

- 归属：`module6-host+office-contract`；类型：`current`。
- 依据：`packages/renderer/src/components/document/OfficeSourceEditor.tsx:84`；`packages/renderer/src/components/document/OfficeSourceEditor.tsx:129`；`packages/renderer/src/components/UnsavedGuard.tsx:93`。
- 当前行为：注册manual save handler但canSave=false；当前通用守卫仍显示保存并离开，调用只提示并return false；capture guard则隐藏不可用代存。
- 缺口/待验证：旧提示“工具条右端保存到库”与现行保存快捷区在标签左侧冲突；不可承诺保存并离开可存Office。
- 提案或保留合同：提案无代存时明确“继续编辑并保存”；仍提供真实丢弃；不改Office API实现代存。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：无法代存必须留在原件，现有工具栏保存成功dirty=false后再导航。
- HTML状态：`dirty`、`guard`、`save-at-toolbar`、`save-from-guard-blocked`。
- 路径：`#scene=DOC-056.<state>`。

### DOC-057 编辑器AI预设/选区问答交接

- 归属：`module6-host+office/chat-reuse`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:241`；`packages/renderer/src/components/DocumentPanel.tsx:822`；`packages/renderer/src/components/document/OfficeSourceEditor.tsx:174`；`packages/renderer/src/components/NoteEditor.tsx:153`。
- 当前行为：问AI空草稿；选区预填截200字、换行合并；instruction优先；不自动发送。Note inline rewrite独立服务，失败返回null不替换正文。
- 缺口/待验证：不能混淆“预填问答”与“直接应用AI改写”；格式内控件保留现有。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`whole-doc`、`selection`、`preset`、`no-model`。
- 路径：`#scene=DOC-057.<state>`。

### DOC-058 PPTX截图草稿交接

- 归属：`module6-host+office/chat-reuse`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:257`；`packages/renderer/src/components/document/OfficeSourceEditor.tsx:219`；`.trellis/spec/shared/contract/document-agent.md:1`。
- 当前行为：snapshot只接收匹配documentId，预填同文档侧栏；预览/移除/显式发送和版本复核由Chat/Office合同控制。
- 缺口/待验证：不把snapshot入口当自动编辑或自动发送；本模块仅展示宿主交接不枚举全部生成工具。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`snapshot-ready`、`wrong-document`、`preview`、`remove`、`explicit-send`、`stale-target`。
- 路径：`#scene=DOC-058.<state>`。

### DOC-059 文档助手开启/布局

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:231`；`packages/renderer/src/components/DocumentPanel.tsx:241`；`packages/renderer/src/components/DocumentPanel.tsx:913`；`packages/renderer/src/components/document/DocumentPanel.style.ts:525`。
- 当前行为：同文档草稿和open状态；桌面400px侧栏；实际容器≤880覆盖并宽min(400,100%-40)；展开时隐藏大纲。
- 缺口/待验证：窄屏留40px正文不代表焦点隔离已完成；没有遮罩/焦点圈定和Esc关闭逻辑。
- 提案或保留合同：提案覆盖模式焦点/退出明确且读写不中断；不将整Chat重新实现。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`closed`、`open`、`desktop`、`overlay`、`narrow`、`long-title`。
- 路径：`#scene=DOC-059.<state>`。

### DOC-060 关闭助手保留流式与回焦

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:902`；`packages/renderer/src/components/DocumentPanel.tsx:924`；`packages/renderer/src/components/document/DocChatSidebar.tsx:130`。
- 当前行为：关闭只是宽0，保持挂载；aria-hidden+inert移除Tab/可及树；关闭requestAnimationFrame回触发或问AI；换doc不显示旧sidebar。
- 缺口/待验证：重新打开askAi会set新draft；Chat内部是否保持未发草稿需实际验证；overlay当前无Escape。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：关闭按钮Enter/Space；提案Esc关闭覆盖层；折叠态不得Tab进隐藏内容。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`close`、`streaming-hidden`、`reopen`、`tab-hidden`、`focus-return`、`document-switch`。
- 路径：`#scene=DOC-060.<state>`。

### DOC-061 助手引用同篇/跨篇导航

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/DocumentPanel.tsx:685`；`packages/renderer/src/components/document/DocChatSidebar.tsx:189`。
- 当前行为：同篇引用本地高亮；跨篇直接onOpenDocument（未guard）。Chat保存为笔记后onOpenNote已走runGuarded。
- 缺口/待验证：跨篇引用可绕开dirty保护；与页脚双链和保存为笔记不一致。
- 提案或保留合同：提案跨篇引用统一runGuarded，同篇不触发离开；仅此宿主缺口。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`same-doc`、`cross-doc`、`dirty`、`cancel`。
- 路径：`#scene=DOC-061.<state>`。 其中仅提案新增状态：`dirty`、`cancel`。

### DOC-062 DOCX能力/AI修订开关

- 归属：`module6-host+chat-agent-reuse`；类型：`current`。
- 依据：`packages/renderer/src/components/document/DocChatSidebar.tsx:84`；`packages/renderer/src/components/document/DocxCapabilityStatus.tsx:25`。
- 当前行为：有docx真实画布+handle才查询capabilities；显示AI修订开关；读取中aria-busy，无教程；缺模型设置入口；读取错误重试。
- 缺口/待验证：开关不等于模型/句柄可执行；availableDocxAgent负责过滤；不允许仅靠开关解锁写入。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`loading`、`ready`、`revision-off`、`revision-on`、`no-model`、`error`、`retry`。
- 路径：`#scene=DOC-062.<state>`。

### DOC-063 其他格式助手能力状态

- 归属：`module6-host+chat-agent-reuse`；类型：`current`。
- 依据：`packages/renderer/src/components/document/DocChatSidebar.tsx:91`。
- 当前行为：按format查询document capabilities；executorReady+modelReady+匹配format才activeAgent；状态区区分不可编辑/需要聊天模型/画布不可用；失败可重试。
- 缺口/待验证：非docx loading无显式文案；不能伪称所有格式Agent工具相同。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`loading`、`ready`、`executor-unavailable`、`model-unavailable`、`canvas-unavailable`、`error`、`retry`。
- 路径：`#scene=DOC-063.<state>`。

### DOC-064 助手设置/保存笔记后跳转

- 归属：`module6-host+module2/chat-reuse`；类型：`current`。
- 依据：`packages/renderer/src/components/document/DocChatSidebar.tsx:102`；`packages/renderer/src/components/document/DocChatSidebar.tsx:123`；`packages/renderer/src/components/document/DocChatSidebar.tsx:190`。
- 当前行为：模型/网络设置、io打开文档、保存为笔记后打开均runGuarded；不把侧栏会话写进URL高亮。
- 缺口/待验证：侧栏会话id由Chat持有，不代表一定不落库；composer容量不查询此会话。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`model-settings`、`dirty`、`cancel`、`new-note`、`open-note`。
- 路径：`#scene=DOC-064.<state>`。

### DOC-065 助手ChatPanel承载状态边界

- 归属：`module6-host+chat-reuse`；类型：`current`。
- 依据：`packages/renderer/src/components/document/DocChatSidebar.tsx:182`；`packages/chat/src/ChatPanel.tsx:1`。
- 当前行为：复用完整ChatPanel承载流式/停止/错误/重试/引用/存笔记；showReasoningControl=false；当前文档draft作用域。
- 缺口/待验证：本模块只覆盖容器与交接，完整聊天气泡、工具审批/续轮恢复在Chat模块；不能宣称已逐工具验收。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`empty`、`draft`、`streaming`、`stop`、`failed`、`retry`、`citation`、`saved-note`。
- 路径：`#scene=DOC-065.<state>`。

### DOC-066 助手快捷提问

- 归属：`module6-host+chat-reuse`；类型：`current`。
- 依据：`packages/renderer/src/components/document/DocChatGuide.tsx:7`；`packages/renderer/src/components/document/DocChatSidebar.tsx:63`。
- 当前行为：空对话不放教程；输入框上方速读本文/提出要点/解释细节；点快捷问题直接ask发送，与选区预填不同。
- 缺口/待验证：HTML必须清楚区分直接发送和仅预填；无模型/发送失败由Chat处理。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Enter直接发送完整预置问题，需文案准确。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`empty`、`quick-read`、`quick-points`、`quick-details`、`sent`。
- 路径：`#scene=DOC-066.<state>`。

### DOC-067 命令重命名弹窗复用

- 归属：`module3-reuse+module6-parity`；类型：`current`。
- 依据：`packages/renderer/src/components/document/DocumentCommandModal.tsx:77`；`packages/renderer/src/components/document/DocumentCommandModal.tsx:116`。
- 当前行为：仅笔记rename；预填标题，trim空报错；同值无写关闭；max200；写失败保留value；读取失败refreshOnly。
- 缺口/待验证：不要在本模块更多菜单再加重复改名入口；命令路径复用module3。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`open`、`blank`、`unchanged`、`limit-200`、`pending`、`error`、`retry`、`saved-read-error`。
- 路径：`#scene=DOC-067.<state>`。

### DOC-068 命令移动弹窗复用

- 归属：`module3-reuse+module6-copy`；类型：`current`。
- 依据：`packages/renderer/src/components/document/DocumentCommandModal.tsx:133`；`packages/renderer/src/components/document/DocumentCommandModal.tsx:237`。
- 当前行为：全格式move；Select已有路径+空串“知识库根”；目录读取/失败/重试明确；同值关闭无写。
- 缺口/待验证：“知识库根”文案同样错误，应改未指派而非虚构根层归属；不新增目录创建能力。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`open`、`folders-loading`、`folders-error`、`retry`、`selected`、`unchanged`、`pending`、`error`。
- 路径：`#scene=DOC-068.<state>`。

### DOC-069 命令当前笔记查找

- 归属：`module3-reuse`；类型：`current`。
- 依据：`packages/renderer/src/components/document/DocumentCommandModal.tsx:121`；`packages/renderer/src/components/DocumentPanel.tsx:691`。
- 当前行为：仅note；trim至少2字；首个匹配定位；没找到保留query给错误；无下一处/替换（Office内部另有查找替换）。
- 缺口/待验证：HTML不可把命令查找做成完整搜索工具；保留 module3 原型行为。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`open`、`too-short`、`ime`、`no-match`、`match`。
- 路径：`#scene=DOC-069.<state>`。

### DOC-070 命令等待/IME/回焦/晚回包

- 归属：`module3-reuse+module6-integration`；类型：`current`。
- 依据：`packages/renderer/src/components/document/DocumentCommandModal.tsx:51`；`packages/renderer/src/components/document/DocumentCommandModal.tsx:97`；`packages/renderer/src/components/document/DocumentCommandModal.tsx:209`；`packages/renderer/src/components/DocumentPanel.tsx:957`。
- 当前行为：busy ref同步防重；组合输入不提交/不关；等待禁取消/关闭/Esc/遮罩；阻止Cmd/Ctrl+K叠层；doc.id key防晚回包；成功后回有效trigger否则更多。
- 缺口/待验证：只读恢复不能再次PATCH；所有适配保留既有合同。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Enter提交非move；IME不提交；等待禁退出；Esc可取消空闲；Cmd/Ctrl+K不另开搜索。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`ime-enter`、`ime-escape`、`pending`、`escape-blocked`、`palette-blocked`、`error`、`retained`、`late-result`、`refresh-only`、`focus`。
- 路径：`#scene=DOC-070.<state>`。

### DOC-071 未保存手动格式离开

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/UnsavedGuard.tsx:62`；`packages/renderer/src/lib/unsaved.tsx:86`。
- 当前行为：clean直接执行；manual dirty三选择继续编辑/丢弃/保存并离开；通用guard无X/遮罩/Esc；resolve discard只清dirty并执行pending action。
- 缺口/待验证：必须按canSave能力呈现真实动作；Office不可代存见DOC-056；不要承诺所有格式均可一键保存离开。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`clean`、`manual-dirty`、`continue`、`discard`、`save`。
- 路径：`#scene=DOC-071.<state>`。

### DOC-072 自动保存笔记离开

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/UnsavedGuard.tsx:93`；`packages/renderer/src/lib/unsaved.tsx:104`；`packages/renderer/src/components/NoteEditor.tsx:83`。
- 当前行为：auto没有丢弃：已写入版本不可撤销；自动完成时守卫可保留“改动已自动保存/离开”；手动点save等flush完成再执行导航。
- 缺口/待验证：不显示“丢弃改动”撤销已经落库的笔记。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`auto-dirty`、`saving`、`auto-saved`、`stay`、`leave`。
- 路径：`#scene=DOC-072.<state>`。

### DOC-073 守卫保存失败/连续修改

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/lib/unsaved.tsx:119`；`packages/renderer/src/components/UnsavedGuard.tsx:168`；`packages/renderer/src/editor/markdown-save.test.tsx:369`。
- 当前行为：savingRef同步锁resolve；save false或throw保留guard及原文档；error显示；Markdown继续编辑串行保存最新正文后才离开。
- 缺口/待验证：当前generic guard缺IME处理且canSave=false仍提供主保存；新模块补齐不能破坏capture专用guard。
- 提案或保留合同：提案共享视觉和能力判定，保存失败可重试或返回编辑；等待期不退出。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`pending`、`false-result`、`thrown-error`、`retry`、`continue`、`newer-edit`。
- 路径：`#scene=DOC-073.<state>`。

### DOC-074 浏览器后退/刷新/关闭宿主边界

- 归属：`module6-boundary+runtime/office`；类型：`current`。
- 依据：`packages/office/src/editors/MarkdownEditor.tsx:790`；`packages/renderer/src/components/document/OfficeSourceEditor.tsx:123`；`packages/renderer/src/routes/_app.tsx:1`。
- 当前行为：仅发现MarkdownEditor beforeunload dirty原生提示；renderer无useBlocker/popstate统一拦截；Office卸载清dirty。
- 缺口/待验证：当前自绘guard覆盖主动runGuarded路径，不证明browser back/forward或Office关页有保护。
- 提案或保留合同：规划需主会话定边界：至少明确未验，不在HTML声称原生已实现；通用路由拦截若纳入另核设计。
- 键盘/退出：浏览器/系统退出不能用普通Esc/假HTML弹窗替代实际宿主验证。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`browser-back`、`route-bypass`、`reload`、`tab-close`、`desktop-close`。
- 路径：`#scene=DOC-074.<state>`。

### DOC-075 390px/中栏/低高度布局

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/DocumentPanel.style.ts:44`；`packages/renderer/src/components/document/DocumentPanel.style.ts:251`；`packages/renderer/src/components/document/DocumentPanel.style.ts:426`；`packages/renderer/src/components/document/DocumentPanel.style.ts:546`。
- 当前行为：header600缩gap，500隐藏动作文本；只读≤880用16边距；大纲≤880隐藏；AI依真实container≤880覆盖；Office高度链min-height0。
- 缺口/待验证：多返回按钮+保存状态可能挤标题；低高度叠AI块/页脚可能挤编辑器；需要同内容同宽比较。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`desktop`、`390`、`mid-column`、`low-height`、`overlay`、`nav-rail`。
- 路径：`#scene=DOC-075.<state>`。

### DOC-076 浅深/焦点/hover不抖动

- 归属：`module1-reuse+module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/DocumentPanel.style.ts:16`；`packages/renderer/src/components/document/DocumentPanel.style.ts:349`；`packages/renderer/src/components/document/FilePreview.tsx:332`。
- 当前行为：组件用theme token；按钮边框透明占位；返回focus ring；spin/宽度transition尊重reduce；媒体背景共享容器色。
- 缺口/待验证：修复后输入框颜色/边框粗细遵循module1；不能借全局覆盖Office .ant-*破坏内部组件。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`light`、`dark`、`hover`、`focus`、`active`、`reduced-motion`。
- 路径：`#scene=DOC-076.<state>`。

### DOC-077 长正文/大纲/摘要/双链滚动

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/DocumentPanel.style.ts:391`；`packages/renderer/src/components/document/DocumentPanel.style.ts:397`；`packages/renderer/src/components/document/DocumentPanel.style.ts:606`；`packages/renderer/src/components/document/DocumentPanel.style.ts:717`。
- 当前行为：只读面板滚；note/Office.me-scroll内部滚；大纲单独滚；AI结果放正文前；双链末尾按内容高度。
- 缺口/待验证：AI块位于flex列上方可侵占有界编辑器高度；需实际长内容低高度核对工具栏/保存状态仍可达。
- 提案或保留合同：保留真实能力与数据合同；只调整阅读层级、间距、状态反馈和操作可达性。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`long-body`、`long-outline`、`long-summary`、`many-links`、`low-height`。
- 路径：`#scene=DOC-077.<state>`。

### DOC-078 弹层层级/焦点恢复整体

- 归属：`module6`；类型：`current`。
- 依据：`packages/renderer/src/components/document/DocumentHeader.tsx:161`；`packages/renderer/src/components/document/DocumentCommandModal.tsx:209`；`packages/renderer/src/components/DocumentPanel.tsx:924`；`packages/renderer/src/components/UnsavedGuard.tsx:77`。
- 当前行为：菜单和命令回焦已有路径；侧栏关闭回触发；capture guard主动聚焦继续；通用guard交给AntD默认。
- 缺口/待验证：覆盖式助手无focus trap/inert底层；普通guard与capture风格/键盘不一致；需明确主层级先于装饰。
- 提案或保留合同：提案准确的层级、回焦及焦点可见；不让新恢复入口抢走用户后来选择的控件。
- 键盘/退出：Tab/Shift+Tab；Enter/Space 激活可聚焦按钮。
- 失败/恢复：失败保留当前文档上下文；具体写入失败不可伪装成功。
- HTML状态：`menu-to-dialog`、`sidebar-to-settings`、`guard-cancel`、`modal-error`、`focus-visible`。
- 路径：`#scene=DOC-078.<state>`。

## Planning alignment

已复读本任务design.md与implement.md（主会话本轮补齐）：标题提案明确确认/取消、Enter排除IME、Escape取消、blur留稿；Office守卫不代存；当前侧必须保留现状，不能提前拿修复稿冒充当前实现。与源码盘点无冲突。

## Critical decisions for main session

1. 推荐纳入本模块：初次失败恢复、inline标题IME/等待/失败草稿、tags并发与候选恢复、菜单目录读取反馈、准确移出文案、侧栏跨篇引用guard、覆盖助手焦点/退出、Office不可代存的真实动作表达；均可主要在宿主完成，不新增后端。
2. 原网页url入口目前不存在。若采用DOC-040前端提案，冻结稿应明确包含；不用“来源双链已支持”替代原网页证据。
3. 通用浏览器back/forward拦截与Office原生beforeunload尚未形成合同，是否纳入需单独确认技术边界。最低要求在HTML能力声明/验收中诚实列为宿主未验，不可画一个假弹窗就算解决。
4. 大纲围栏误识别/未保存标题动态更新是既有算法边界；规划可列准确修复提案，但不能通过纯CSS冒充已修。
5. Office/Chat内部工具栏、复杂格式编辑器弹窗、全部Agent工具及聊天完整消息细节属于复用模块；本清单覆盖交接页面与宿主状态，不承诺这些独立模块全工具重设计。

## Caveats / Not Found

- 只允许研究文件写入；未改产品源码、spec、脚本或git；未读取implement/check manifests（research角色隔离）。
- 这里的行号是2026-10-18当前workspace快照，其他会话可并发改动。实施前需复核，不用旧父任务行号硬套。
- 未运行GUI、后端写入、原生媒体/下载/文件选择、OS IME、读屏或Electron；所有“待验证”保留，不冒充测试通过。
- 源码中仍有“PDF iframe”“XLSX/PPTX只读”“右端保存到库”“目录由派生树”等滞后注释；以实际分支、共享schema与现行规范为准。
- 本研究没有新增分享/协作/权限/回收站/分页/全文阅读模式/自动保存Office/摘要流式取消能力。
