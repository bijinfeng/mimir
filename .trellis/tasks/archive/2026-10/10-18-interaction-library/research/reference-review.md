# Research: 知识库与目录管理外部参考

- Query: 知识库首页、目录/文件列表与卡片、标签、菜单、危险操作、长名称及微交互应借鉴什么，哪些不能直接移植？
- Scope: mixed（官方公开站点 + 固定版本公开源码 + Mimir 现行实现）
- Date: 2026-10-18

## Findings

### 版本、方法与证据范围

已检查用户要求的 [WeKnora 官网](https://weknora.weixin.qq.com/) 与 [Tencent/WeKnora 公开源码](https://github.com/Tencent/WeKnora)，均 HTTP 200。

- 官网当日标注 **v0.8.3**；GitHub latest release 为 [v0.8.3](https://github.com/Tencent/WeKnora/releases/tag/v0.8.3)，发布时间 **2026-10-14T07:53:24Z**。
- 本次代码研究固定 **main 的 2c0d8384398ca756ee414eef01b71caf91e2caa6**，提交时间 **2026-10-17T15:25:02Z**。这是发布后 main 快照，**不声称全部代码等同于 v0.8.3 tag**。
- Obsidian 帮助官网三个原始链接可达，但返回重定向后的应用壳，未把壳当作内容。补读 [官方 obsidianmd/obsidian-help 仓库](https://github.com/obsidianmd/obsidian-help)，固定文档 commit **08ef563f07b78dd589f19b1583d089c1e2d2377c**，时间 **2026-10-11T21:19:01Z**。这是文档版本，不能推导 Obsidian 应用版本。
- 所有原始响应和选取的源码存于 [reference-evidence/](reference-evidence/)，URL、字节数、SHA256 见 [source-map.json](reference-evidence/source-map.json)。源码快照保留原行号。官网文字是过滤 script/style 后的 HTML 文本，便于复核产品描述；不是可见性或像素测量证据。
- 本研究没有进入 WeKnora 登录应用，没有执行真实创建/移动/删除，未做外部产品运行时可用性验收；下面区分代码事实与建议。

### 参考优先级

1. 用户已经批准的**语雀视觉方向**优先：本模块延续上一模块的表面、字体、输入框边框、焦点与按钮系统，不引入第三套配色、TDesign 或 Obsidian 主题。
2. **WeKnora**作为知识库功能组织和状态展示参考。
3. **Obsidian**作为内容周围的低干扰工作区、目录定位及上下文操作参考，不移植桌面专属能力。

现行约束依据：本任务 `prd.md:7-17`；父任务 `module-map.md:24-38`（独立 HTML 同场景同尺寸对比、具体版本批准、系统原生能力另验）。

### WeKnora 证据与 Mimir 应用

以下源代码链接全部固定到上述 commit，可据本地同名快照逐行复核。

| 编号 | 具体证据 | 可用于 Mimir 的打磨 | 不照搬的边界 |
|---|---|---|---|
| WK-01 | 官网提取文本 `weknora-site-visible-text.txt:39-50`：RAG、Agent、Wiki 共享知识库；检索回答附原文引用。`75-96`：图库/图文检索/来源定位。 | 知识库页优先回答“此库是什么、内容在哪、如何进入”；名称/描述与正文列表层级清晰，来源信息可追溯。 | 不把营销主页当应用列表的像素标尺；本轮不新增图库、Wiki、图谱或 Agent 能力。 |
| WK-02 | [DocumentListView.vue:47-60](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/views/knowledge/components/DocumentListView.vue#L47-L60)、`:289-309`：同一列表中子目录先于文档，目录使用相同列网格，不填无意义状态；跨目录筛选时才需要文件路径。 | 列表/卡片保持相同顺序与对象，不为目录伪造文档标签/日期；目录层级与结果来源明确。Mimir 标签视图应保留来源位置，普通目录减少重复。 | Mimir 已有 folder-first，属于精修，不应包装为新增业务；不新增筛选/排序/批量勾选。 |
| WK-03 | [DocumentListView.vue:320-341](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/views/knowledge/components/DocumentListView.vue#L320-L341)：名称、来源/大小/更新时间分层，跨目录路径单列在名称下；`:365-375` 状态文字+图标。`:138-186` 源码区分 queued/processing/stalled/finalizing/failed/cancelled/draft/completed。 | 名称是首要阅读锚点，类型、位置、更新时间做次级层；状态不能只有颜色。卡片与列表使用同一对象状态及动作集合。 | 只展示 Mimir 实际解析状态，不新增 WeKnora 的 stalled/取消队列/生成摘要状态。本地是否存在对应状态必须查共享合同。 |
| WK-04 | [KbFolderTree.vue:422-483](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/views/knowledge/components/KbFolderTree.vue#L422-L483)：名称 `min-width:0 + ellipsis`；尾部计数/菜单固定占位；菜单通过 opacity 在 hover、focus-within、菜单已开时显现，尺寸不切换。`:60-69` 展开按钮 Enter/Space 和 aria-expanded。 | 长目录与菜单预留固定空间，hover 不挤文字、不改变布局；焦点态与菜单展开态持续可见；图标/计数垂直对齐。 | 不因此给 Mimir 新增一套侧边树或折叠结构。不要只把 `opacity:0` 当完整无障碍方案；需检查 Tab 顺序与焦点可见。 |
| WK-05 | [DocumentActionMenu.vue:43-124](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/views/knowledge/components/DocumentActionMenu.vue#L43-L124)：按类型/能力显示下载/编辑/处理/移动等，操作点击 stop；删除确认带对象名和明确取消。 [DocumentListView.vue:380-418](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/views/knowledge/components/DocumentListView.vue#L380-L418)：菜单与移动目录选择器在同一 popup 中切换，可返回。 | 卡片/列表按同一能力规则出菜单；点击操作不触发行打开；对象名进入确认；失败保留对象与重试上下文。 | WeKnora 大量菜单项用 div，不能照抄其键盘语义；Mimir 继续 AntD Dropdown/Menu。源码局部不能证明远程失败恢复，必须独立设计和验证。Mimir 库页现有文件菜单没有移动项，不能因参考有就默认为当前能力。 |
| WK-06 | [FolderPickerMenu.vue:8-35](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/views/knowledge/components/FolderPickerMenu.vue#L8-L35)：目录层级缩进，当前目录有勾选与路径 title；`:163-169` 新建行后聚焦输入。 | 已有移动流程应清楚区分当前位置与目标；长路径可查完整内容；子面板取消回到原菜单/原对象。 | 本轮不新增目录移动、内联新建、后台能力；现有文档移动由已批准模块/后续阅读模块负责时只做入口交接。 |
| WK-07 | [KnowledgeTagFilter.vue:26-46](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/views/knowledge/components/KnowledgeTagFilter.vue#L26-L46) 汇总已选标签；`:74-106` 加载骨架、带计数标签、无匹配空态与加载更多。 | 标签是横向筛选而非目录容器：标题使用 `#标签`，在结果中保留文档所属库/目录；无结果与读取失败分开。 | Mimir 现有 `scope=tag:x` 是单标签页面，不能移植多选/搜索/分页标签管理；hover 才出现的清空入口不作为可访问性模板。 |
| WK-08 | [KnowledgeBaseList.vue:47-59](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/views/knowledge/KnowledgeBaseList.vue#L47-L59) 骨架；`:208-225` 名称描述内容和数量/处理状态分层；`:598-632` 初始空、收藏空、最近空、共享空分情况。 | 首次无库、库内无内容、标签无结果、请求失败、路径失效各有准确语义和可行下一步；描述为空时不制造大块空洞。 | 收藏/最近/共享/组织权限均不在 Mimir 本轮范围；不可为了多状态造出不存在的主页分组。 |

### Obsidian 官方布局与目录参考

官方稳定帮助页：[File explorer](https://help.obsidian.md/plugins/file-explorer)、[Workspace](https://help.obsidian.md/workspace)、[Tags](https://help.obsidian.md/tags)。本次实质引用来自固定文档源码，避免把动态应用壳视为正文。

| 编号 | 证据 | 应用与边界 |
|---|---|---|
| OB-01 | [Workspace.md:10-23](https://github.com/obsidianmd/obsidian-help/blob/08ef563f07b78dd589f19b1583d089c1e2d2377c/en/User%20interface/Workspace.md#L10-L23)：主内容中央、左右侧栏可收起、文档更多菜单归属文档。`:25-34` 移动端是不同载体组织。 | 保持 Mimir 已批准的左侧导航/中央内容关系；主区不要重复一套侧栏。窄屏明确聚合次要动作并保持触达。不能据文档推导颜色、圆角、字体大小；不移植分屏/Tab/手势。 |
| OB-02 | [File explorer.md:17-42](https://github.com/obsidianmd/obsidian-help/blob/08ef563f07b78dd589f19b1583d089c1e2d2377c/en/Plugins/File%20explorer.md#L17-L42)：在特定文件夹内新建，名称 Enter 确认。`:73-99` 删除确认、重命名、移动到目录选择。 | “当前目录”应在新建、上传交接中始终可见；新建目录/重命名共享字段校验，Enter 提交、Escape 取消、关闭回焦点；具体行为继续服从 Mimir 合同。拖动目录/批量操作不在本轮范围。 |
| OB-03 | [File explorer.md:101-140](https://github.com/obsidianmd/obsidian-help/blob/08ef563f07b78dd589f19b1583d089c1e2d2377c/en/Plugins/File%20explorer.md#L101-L140)：上下文菜单按文件/目录及桌面/移动载体区分。 | 目录与文件动作不能混淆；保留 Mimir 现有文件格式能力；手机上点击可打开更多菜单，不依赖 hover。Obsidian 的文件系统/默认应用/版本历史/发布能力不移植。 |
| OB-04 | [Tags.md:22-38](https://github.com/obsidianmd/obsidian-help/blob/08ef563f07b78dd589f19b1583d089c1e2d2377c/en/Editing%20and%20formatting/Tags.md#L22-L38)：标签用于查找笔记，另有嵌套标签语义。 | 借鉴“标签为查找入口”认知，保留 Mimir 横切结果与来源；不把 `/` 自动解释为嵌套标签，不移植 Obsidian 的标签格式/大小写规则。 |

### 与 Mimir 现行实现的契合与冲突

- `packages/renderer/src/components/library/LibraryView.tsx:73-97`：知识库是容器，`scope=all` 重定向首库，无库才创建引导；标签是横切过滤；添加/拖放带当前目录。**本轮不能为了仿参考重建“全部文档”首页。**
- `LibraryView.tsx:336-343`、`:444-480`、`:544-584`：身份区始终是顶层知识库，目录位置在“文档”面包屑，不把子目录名取代库名。保留已拍板的信息结构，只修间距、截断、键盘/焦点、状态。
- `LibraryView.tsx:204-218`、`:239-269`：目录只问名字，错误保留草稿；重命名必须取被操作目录的父级，并同步当前子树 URL。WeKnora `KbFolderTree.vue:217-224` 在 emit rename 前先退出编辑态，**不作为 Mimir 失败保留表单的范本**。
- `LibraryView.tsx:272-293` 的成功提示/确认文案称文档“移回库根”；但 `apps/server/src/services/folders.ts:436-464` 实际移除笔记 frontmatter / 上传 meta.json 的目录指派，并把 `documents.folder` 设为 `null` 后删除目录记录。文档保留，**不能据此承诺仍在当前知识库根中可见**。这是前端文案与服务端语义的歧义，本轮提案必须明确真实后果和可达性；也不能移植 Obsidian 的本地文件夹删除语义。
- `LibraryView.tsx:173-185`：文件删除包含原件且不可撤销；笔记文件保留回收站但应用无一键恢复入口。不得把两个动作都写成“可恢复”。
- `LibraryView.tsx:594-643`：加载、错误、失效目录、真空状态已有优先级。标签空态当前还会出现目录上传提示（同一 Empty 文案），可在本轮提案明确修正文案，不能把它当已实现的当前能力。
- `LibraryView.tsx:1203-1219`：文件更多菜单现有打开、条件编辑、下载/替换、删除，没有移动/重命名文件。若跨模块存在文档命令入口，应按实际源码盘点归属，只复核交接。

### 本模块可执行的建议

1. 信息层级延续现有身份区/工具条/面包屑；名称与主动作清楚，描述/ID/数量安静但可读。窄屏不要同时挤压所有操作。
2. 列表/卡片一致的数据与菜单语义；目录先行；稳定操作占位，hover/focus/菜单打开都不跳；图文垂直对齐，目标至少与已批准基础组件一致。
3. 展示长名称/路径/描述真实极限，保留完整信息查看；不能只展示好看的短文本。
4. 新建目录、重命名、替换、删除逐项覆盖等待、错误保留、重试、取消与回焦点。保留真实数据后果，不制造恢复承诺。
5. 区分无库/空目录/标签无匹配/路径失效/失败，准确下一步；首次创建复用模块二统一名称+描述弹窗（无图标选择），收集入口复用模块四。
6. HTML 明示模拟状态和原生边界，当前/提案同数据同尺寸；WeKnora/Obsidian 是参考依据，不能覆盖用户已批准的语雀样式与业务边界。

## Files found

- `reference-evidence/weknora-site.html` — 官方首页响应快照。
- `reference-evidence/weknora-site-visible-text.txt` — 不含脚本样式的正文文本摘录，行号引用。
- `reference-evidence/weknora-head.json` / `weknora-latest-release.json` — 固定 commit 与发布版本证据。
- `reference-evidence/DocumentActionMenu.vue` — 按类型/权限的文档操作与对象确认。
- `reference-evidence/DocumentCardView.vue` / `DocumentListView.vue` — 同数据的卡片/列表组织与目录、状态、操作。
- `reference-evidence/KbFolderTree.vue` — 长名称截断、固定尾部、hover/focus/menu-open 和 rename 逻辑。
- `reference-evidence/FolderPickerMenu.vue` — 当前目录标识、目标层级、新建行焦点。
- `reference-evidence/KnowledgeTagFilter.vue` — 筛选摘要、标签计数与加载/空状态。
- `reference-evidence/KnowledgeBaseList.vue` — 首页身份、描述与数量、状态分层。
- `reference-evidence/obsidian-*.md` / `obsidian-head.json` — 官方文档固定版及元信息；`obsidian-*.html` 是已检查但未当正文使用的站点壳。
- `reference-evidence/source-map.json` — 外部来源 URL、版本及所有证据文件 SHA256。
- `packages/renderer/src/components/library/LibraryView.tsx` — Mimir 现行库页及目录/文件/标签边界，只读。

## Related specs

- `.trellis/workflow.md` — Phase 1 research 与具体方案批准。
- `.trellis/spec/project/rules.md` — 非目标清单、证据和适用条件、无依据不改合同。
- `.trellis/spec/renderer/frontend/index.md` — Renderer 规范入口。
- `.trellis/tasks/10-18-interaction-library/prd.md` — 本模块范围/AC1–AC5。
- `.trellis/tasks/10-18-modular-interaction-polish/module-map.md` — 模块归属与原型先审规则。

## Caveats / Not Found

- 没有外部登录 UI 截图或实时行为证据；本报告不主张参考站点的实际 hover、焦点回归、失败重试均已验证。
- 官网版本与源码快照分别标识，不冒充 release tag 一致。
- Obsidian 的官方文档证实结构/命令，不能证明其像素风格或 Web 响应式实现，也未固定桌面安装包版本。
- 外部产品的多租户、分享权限、批量操作、目录拖动、Wiki/图谱、资料源同步均不纳入本轮。
- 本报告只给参考与约束；最终场景完整性、当前 UI 精确还原、API 能力以独立源码清单和浏览器取样为准。
