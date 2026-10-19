# Core implementation handoff

批准稿 document-review-v1 SHA256 `2a3aafb4277c37bd06e38ae94ecec085e0f31a062b88e25a000042e5cbdb220d`。只修改产品实施文件，冻结稿未改。以下状态由完整 document-scenes.json 程序化消费，状态数不是执行测试数。

## 变更与边界

- 标题显式确认/取消、blur留稿、IME保护、同步锁、失败保稿、已写入只重读；无额外斜线禁用。
- 标签/目录仅合并真实写入字段，绝不用元数据响应的整对象覆盖活正文；读取失败保留编辑器。标签/目录读取中/失败/空态、容量20/长度50、移出任何知识库的真实语义和8秒撤销单飞/失败重试。
- AI生成与采用分开；请求文档和token隔离，切文档清临时结果与等待，新文档不受旧请求阻断，旧结果不能套回同ID重开。候选真实成功后才滤除，失败保留；摘要可关闭；缺模型可交接真实设置。
- 大纲只取正文ProseMirror节点，不再把画布主标题当第一个heading；实时MutationObserver同步笔记标题与DOM替换，围栏/缩进代码排除。引用精确/相近/未找到/不支持高亮/原件提取位置边界有实际反馈。
- 只读内链经guard；助手跨篇引用经guard，同篇留原地；覆盖助手按容器宽度测量、mask/inert/焦点环/IME Escape保护/关闭回原触发。关闭重开保留原草稿，流式组件保持挂载。
- 经主会话授权最小新增MarkdownEditor contentFooter宿主插槽，NoteEditor透传，笔记双链处于正文末尾同滚动列且在可编辑正文外。内部Ribbon/编辑算法不改。
- 样式、Header/Footer/FilePreview/完整Chat相关文件由visual worker负责；Guard/commands及OfficeSourceEditor owner绑定由guard worker负责。此报告不替代主会话GUI验收与全仓门。

## 验证

最终范围内运行：

- `vitest run --root packages/renderer` 指定 DocumentPanel.core/commands/test、DocumentTitle、headings、MarkdownBody、MarkdownHostSlots、DocumentHeader：**8 files / 26 tests passed**（21:50:27开始，13.40s）。
- oxlint上述13个产品/测试文件：零诊断；oxfmt --check同13文件：通过；git diff --check限定同文件：通过。
- antd lint DocumentTitle、doc-menu、DocumentPanel：issues=[]，partial=false。
- Renderer tsc只剩既有范围外 `agent-media.check.test.ts:12 TS2550 Promise.withResolvers`；本次文件无TS诊断。
- 扩展关联markdown-save.test.tsx曾出现7失败和1 unhandled（并发guard改动重注册契约），已完整告知guard worker与主会话；guard worker正在修复并负责最终回归。本次最小slot测试独立通过。

新增 meaningful regressions: Title 3、headings 2、Panel core 5、MarkdownBody新2、host slot1；已有引用/命令/真实Markdown保存链一并回归。无真实业务AI、下载、播放、Electron、读屏验证声明。

## Owned / shared handoff mapping

| 分组 | 完整枚举状态 | 产品落点（组件相对 renderer/src/components，另注除外） | 自动/静态证据及真实边界 |
|---|---|---|---|
| DOC-001 阅读路由与返回范围 | `library`, `note`, `file`, `capture`, `direct-id` | DocumentPanel existing host handoff preserved | 源码逐项核对，父流程/Office内部行为由其模块测试，未伪称执行全部状态 |
| DOC-002 未选文档组件空态 | `component-empty`, `route-library` | DocumentPanel existing host handoff preserved | 源码逐项核对，父流程/Office内部行为由其模块测试，未伪称执行全部状态 |
| DOC-003 首次读取与骨架 | `loading`, `resolved`, `slow` | DocumentPanel query/updateTags/moveDocument + metadata notice | DocumentPanel.core.test.tsx / DocumentPanel.commands.test.tsx（正文/节点身份/GET-only） |
| DOC-004 初次加载失败/不存在 | `network-error`, `not-found`, `retry-pending`, `recovered` | DocumentPanel query/updateTags/moveDocument + metadata notice | DocumentPanel.core.test.tsx / DocumentPanel.commands.test.tsx（正文/节点身份/GET-only） |
| DOC-005 缓存刷新失败保留活内容 | `cached`, `refreshing`, `refresh-error`, `retry`, `recovered` | DocumentPanel query/updateTags/moveDocument + metadata notice | DocumentPanel.core.test.tsx / DocumentPanel.commands.test.tsx（正文/节点身份/GET-only） |
| DOC-009 笔记主标题与更新时间 | `idle`, `hover`, `focus`, `long-title`, `narrow` | document/DocumentTitle.tsx + DocumentPanel renameTitle | DocumentTitle.test.tsx（IME/blur/singleflight/error/read-only-retry） |
| DOC-010 标题就地编辑提交/取消 | `edit`, `enter`, `blur`, `escape`, `unchanged`, `blank`, `limit-200`, `confirm`, `cancel`, `blur-draft` | document/DocumentTitle.tsx + DocumentPanel renameTitle | DocumentTitle.test.tsx（IME/blur/singleflight/error/read-only-retry） |
| DOC-011 标题IME与同步单飞 | `ime-enter`, `ime-escape`, `pending`, `double-submit` | document/DocumentTitle.tsx + DocumentPanel renameTitle | DocumentTitle.test.tsx（IME/blur/singleflight/error/read-only-retry） |
| DOC-012 标题请求失败与读取恢复 | `write-error`, `draft-retained`, `saved-read-error`, `retry-read`, `success` | document/DocumentTitle.tsx + DocumentPanel renameTitle | DocumentTitle.test.tsx（IME/blur/singleflight/error/read-only-retry） |
| DOC-013 笔记保存状态反馈 | `idle`, `pending`, `saving`, `saved`, `error`, `reduced-motion` | DocumentPanel existing host handoff preserved | 源码逐项核对，父流程/Office内部行为由其模块测试，未伪称执行全部状态 |
| DOC-014 新建笔记一次性正文焦点 | `created`, `editor-ready`, `focused`, `consumed` | DocumentPanel existing host handoff preserved | 源码逐项核对，父流程/Office内部行为由其模块测试，未伪称执行全部状态 |
| DOC-015 逐文档滚动恢复 | `readonly-scroll`, `note-scroll`, `source-scroll`, `return`, `delayed-layout` | DocumentPanel liveHeadings/headingNodes/jumpTo + document/headings.ts + MarkdownBody | headings.test.ts / MarkdownBody.test.tsx；实际滚动/观察器布局留主会话GUI |
| DOC-016 大纲显示条件与归属 | `two-headings`, `one-heading`, `note`, `readonly`, `source-hidden`, `ai-hidden`, `narrow-hidden` | DocumentPanel liveHeadings/headingNodes/jumpTo + document/headings.ts + MarkdownBody | headings.test.ts / MarkdownBody.test.tsx；实际滚动/观察器布局留主会话GUI |
| DOC-017 大纲层级/锚点/联动 | `idle`, `hover`, `focus`, `active`, `deep-level`, `long-heading`, `jump`, `scroll-follow` | DocumentPanel liveHeadings/headingNodes/jumpTo + document/headings.ts + MarkdownBody | headings.test.ts / MarkdownBody.test.tsx；实际滚动/观察器布局留主会话GUI |
| DOC-018 大纲代码围栏/动态正文边界 | `fenced-heading`, `duplicate-text`, `dom-replaced`, `no-target` | DocumentPanel liveHeadings/headingNodes/jumpTo + document/headings.ts + MarkdownBody | headings.test.ts / MarkdownBody.test.tsx；实际滚动/观察器布局留主会话GUI |
| DOC-019 引用进入与高亮定位 | `chat-citation`, `search-hit`, `same-doc`, `new-doc`, `highlighted` | DocumentPanel citation effect/highlightSnippet/findPreferredSnippetPosition | DocumentPanel.test.ts（重复/归一化）+源码检查；Range几何/高亮API留主会话GUI |
| DOC-020 引用重复正文与Markdown归一化 | `repeat-first`, `repeat-later`, `markdown-noise`, `cross-node`, `truncated-snippet` | DocumentPanel citation effect/highlightSnippet/findPreferredSnippetPosition | DocumentPanel.test.ts（重复/归一化）+源码检查；Range几何/高亮API留主会话GUI |
| DOC-021 引用无命中/不支持高亮API | `no-match`, `short-snippet`, `no-highlight-api`, `detached-range`, `timeout` | DocumentPanel citation effect/highlightSnippet/findPreferredSnippetPosition | DocumentPanel.test.ts（重复/归一化）+源码检查；Range几何/高亮API留主会话GUI |
| DOC-022 引用连续定位与生命周期 | `same-doc-next`, `consume-once`, `switch-document`, `stale-range` | DocumentPanel citation effect/highlightSnippet/findPreferredSnippetPosition | DocumentPanel.test.ts（重复/归一化）+源码检查；Range几何/高亮API留主会话GUI |
| DOC-024 已有标签/删除/清空 | `existing`, `remove`, `clear`, `no-tags`, `long-tag` | document/doc-menu.tsx + DocumentPanel updateTags/moveDocument/UndoMoveAction | DocumentPanel.core.test.tsx / DocumentHeader.test.tsx；八秒toast实际交互留GUI |
| DOC-025 统计建议标签读取 | `suggested`, `all-added`, `empty`, `loading`, `error`, `retry` | document/doc-menu.tsx + DocumentPanel updateTags/moveDocument/UndoMoveAction | DocumentPanel.core.test.tsx / DocumentHeader.test.tsx；八秒toast实际交互留GUI |
| DOC-026 标签写入与正文缓存保真 | `adding`, `removing`, `clearing`, `pending`, `error`, `success`, `retry` | DocumentPanel query/updateTags/moveDocument + metadata notice | DocumentPanel.core.test.tsx / DocumentPanel.commands.test.tsx（正文/节点身份/GET-only） |
| DOC-027 标签字段/容量边界 | `20-tags`, `over-capacity`, `long-tag`, `duplicate` | document/doc-menu.tsx + DocumentPanel updateTags/moveDocument/UndoMoveAction | DocumentPanel.core.test.tsx / DocumentHeader.test.tsx；八秒toast实际交互留GUI |
| DOC-028 目录菜单与当前路径 | `paths`, `current`, `rootless`, `long-path`, `no-folders` | document/doc-menu.tsx + DocumentPanel updateTags/moveDocument/UndoMoveAction | DocumentPanel.core.test.tsx / DocumentHeader.test.tsx；八秒toast实际交互留GUI |
| DOC-029 目录加载/失败/恢复 | `loading`, `error`, `cached-error`, `retry`, `empty`, `loaded` | document/doc-menu.tsx + DocumentPanel updateTags/moveDocument/UndoMoveAction | DocumentPanel.core.test.tsx / DocumentHeader.test.tsx；八秒toast实际交互留GUI |
| DOC-030 菜单移动/移出目录 | `move`, `current-noop`, `remove`, `pending`, `error`, `saved-read-error` | DocumentPanel query/updateTags/moveDocument + metadata notice | DocumentPanel.core.test.tsx / DocumentPanel.commands.test.tsx（正文/节点身份/GET-only） |
| DOC-031 移动8秒撤销 | `toast`, `undo`, `pending`, `undo-success`, `undo-error`, `expired` | document/doc-menu.tsx + DocumentPanel updateTags/moveDocument/UndoMoveAction | DocumentPanel.core.test.tsx / DocumentHeader.test.tsx；八秒toast实际交互留GUI |
| DOC-032 AI整理入口与费用说明 | `ready`, `no-body`, `busy`, `cost-label` | DocumentPanel runAi + aiDocument/request token + result blocks | DocumentPanel.core.test.tsx（失败留候选/旧请求隔离/真实成功完成）；无真实模型调用 |
| DOC-033 AI摘要展示/临时性 | `generate`, `ready`, `regenerated`, `leave`, `reopen` | DocumentPanel runAi + aiDocument/request token + result blocks | DocumentPanel.core.test.tsx（失败留候选/旧请求隔离/真实成功完成）；无真实模型调用 |
| DOC-034 AI摘要缺模型/失败 | `pending`, `no-model`, `request-error`, `retry`, `long-result` | DocumentPanel runAi + aiDocument/request token + result blocks | DocumentPanel.core.test.tsx（失败留候选/旧请求隔离/真实成功完成）；无真实模型调用 |
| DOC-035 AI候选标签生成 | `pending`, `no-model`, `empty`, `candidates`, `error`, `retry` | DocumentPanel runAi + aiDocument/request token + result blocks | DocumentPanel.core.test.tsx（失败留候选/旧请求隔离/真实成功完成）；无真实模型调用 |
| DOC-036 AI候选应用/失败恢复 | `candidate`, `apply`, `pending`, `success`, `failure`, `remaining`, `all-added` | DocumentPanel runAi + aiDocument/request token + result blocks | DocumentPanel.core.test.tsx（失败留候选/旧请求隔离/真实成功完成）；无真实模型调用 |
| DOC-037 AI结果文档ID与迟到结果 | `switch-pending`, `late-summary`, `late-tags`, `new-document` | DocumentPanel runAi + aiDocument/request token + result blocks | DocumentPanel.core.test.tsx（失败留候选/旧请求隔离/真实成功完成）；无真实模型调用 |
| DOC-038 只读正文排版/复杂块 | `paragraph`, `table`, `code`, `image`, `math`, `diagram`, `diagram-error`, `empty` | document/MarkdownBody.tsx + guarded host internal link | MarkdownBody.test.tsx（StrictMode/数学/图形/空态/围栏/内部链接） |
| DOC-039 正文内部链接交接 | `note-internal`, `dirty`, `cancel`, `readonly-link`, `external-link` | document/MarkdownBody.tsx + guarded host internal link | MarkdownBody.test.tsx（StrictMode/数学/图形/空态/围栏/内部链接） |
| DOC-057 编辑器AI预设/选区问答交接 | `whole-doc`, `selection`, `preset`, `no-model` | DocumentPanel existing host handoff preserved | 源码逐项核对，父流程/Office内部行为由其模块测试，未伪称执行全部状态 |
| DOC-058 PPTX截图草稿交接 | `snapshot-ready`, `wrong-document`, `preview`, `remove`, `explicit-send`, `stale-target` | DocumentPanel existing host handoff preserved | 源码逐项核对，父流程/Office内部行为由其模块测试，未伪称执行全部状态 |
| DOC-059 文档助手开启/布局 | `closed`, `open`, `desktop`, `overlay`, `narrow`, `long-title` | DocumentPanel compactPanel + sidebar wrapper/closeAssistant/openSidebarCitation | DocumentPanel.core.test.tsx（跨篇guard）；overlay focus trap/inert/回焦留真实GUI |
| DOC-060 关闭助手保留流式与回焦 | `close`, `streaming-hidden`, `reopen`, `tab-hidden`, `focus-return`, `document-switch` | DocumentPanel compactPanel + sidebar wrapper/closeAssistant/openSidebarCitation | DocumentPanel.core.test.tsx（跨篇guard）；overlay focus trap/inert/回焦留真实GUI |
| DOC-061 助手引用同篇/跨篇导航 | `same-doc`, `cross-doc`, `dirty`, `cancel` | DocumentPanel compactPanel + sidebar wrapper/closeAssistant/openSidebarCitation | DocumentPanel.core.test.tsx（跨篇guard）；overlay focus trap/inert/回焦留真实GUI |
| DOC-075 390px/中栏/低高度布局 | `desktop`, `390`, `mid-column`, `low-height`, `overlay`, `nav-rail` | DocumentPanel compactPanel + sidebar wrapper/closeAssistant/openSidebarCitation | DocumentPanel.core.test.tsx（跨篇guard）；overlay focus trap/inert/回焦留真实GUI |
| DOC-076 浅深/焦点/hover不抖动 | `light`, `dark`, `hover`, `focus`, `active`, `reduced-motion` | DocumentPanel existing host handoff preserved | 源码逐项核对，父流程/Office内部行为由其模块测试，未伪称执行全部状态 |
| DOC-077 长正文/大纲/摘要/双链滚动 | `long-body`, `long-outline`, `long-summary`, `many-links`, `low-height` | NoteEditor contentFooter -> MarkdownEditor host slot + existing scroll map | MarkdownHostSlots.test.tsx（同scroller、正文外、正文之后） |
| DOC-078 弹层层级/焦点恢复整体 | `menu-to-dialog`, `sidebar-to-settings`, `guard-cancel`, `modal-error`, `focus-visible` | DocumentPanel compactPanel + sidebar wrapper/closeAssistant/openSidebarCitation | DocumentPanel.core.test.tsx（跨篇guard）；overlay focus trap/inert/回焦留真实GUI |
