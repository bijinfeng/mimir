# Research: 知识库与目录浏览管理完整源码清单

- Query: 第五模块有哪些实际页面、交互、状态、API和跨模块归属？哪些是当前缺口而非现有能力？
- Scope: mixed（主要为当前工作区内部源码；补查 WeKnora 官网与固定公开源码）
- Date: 2026-10-18

## Findings

### 快速结论

- 当前无独立“全部文档”首页：`scope=all` 重定向第一个顶层库；无库才是首次创建引导。主区KB标题/描述/ID始终取根库，子目录位置在“文档 / …”面包屑。
- 目录查询**包含全部后代**，不是只显示直属文档；直接子文件夹先列，再列查询结果。列表固定`limit:100`、updatedAt降序，没有total、分页、排序控件或加载更多。头部`items.length`并非全部文档总数。提案不得画出未实现容量能力。
- 列表文档当前是整行打开按钮，**没有更多管理入口**；卡片更多菜单提供已有动作，但没有移动/重命名。补齐属于proposed前端入口。
- 标签视图只有URL维度；搜索仓库未发现站内标签浏览导航或`api.tags.list`消费。它没有上传目标，因此没有添加/新建/拖入；当前空态仍给上传提示，是真实缺口。
- 创建/编辑KB完整复用module2；文档重命名/移动沿module3；收集/上传/drop沿module4。本轮不重复设计已批准模块。

### 必须明确的真实后果/缺口

1. **删目录实际令文档`folder=null`**。`apps/server/src/services/folders.ts:436-464`同时清frontmatter/meta和DB归属，不是赋值为KB根路径。现主区文案“回知识库根”会误导，顶层库删除同样如此；由于all页退役，文档未分配后不在当前KB过滤列表中。提案必须说“文档保留，目录归属将清空”，不承诺保留在当前KB，也不添加后端迁移行为。
2. `LibraryView.tsx:344`只检测根库消失，不检测子目录失效；零库但旧folder scope也不触发该stale判断。不要把原型改进伪装成当前行为。
3. `createNote`无防重pending；子目录create/rename只有按钮loading，Enter及取消/关闭没有同步保护、没有IME保护、字段错误toast。需要对齐已批准基础表单的修改属于proposed。
4. 替换原件当前直接打开本机选择器，原生取消无自定义结果；请求无可见pending/重复锁，失败仅toast，成功忽略FileUploadResponse的parseError/charCount。OS原生选择器边界须标示，不在HTML假造。
5. 资料种类非file时当前删除确认一律使用笔记回收站文案，成功又按kind===note判断而对web/wechat/github显示“已删除文件与原件”；服务端deleteDocument对无path/sourceKey资料主要软删DB。原型须区分file/note/web真实后果。
6. 列表isError会覆盖已有缓存数据，与module2 FolderSection的“更新失败保留上次内容”不同；keepPreviousData切scope期间还可能显示前一scope条目。后续若改进，明确proposed。
7. 不增加目录拖移、批量、回收站UI、权限、分页、标签管理页。后端PATCH folders有移动能力，但当前KB与子目录UI仅借此改名，不代表已有任意移动工作流。

### 文件与路径

- `packages/renderer/src/components/library/LibraryView.tsx`：浏览主区、首次引导、身份、目录/文档列表卡片、子目录弹窗、替换、删除、拖入。
- `LibraryView.style.ts`：当前布局、断点、列表列位、状态和更多入口、焦点/hover。
- `routes/_app.docs.tsx:29-39`：无id浏览、有id详情；返回保留scope。
- `routes/_app.tsx:61-64`：scope字符串默认all，不严格枚举；id独立。
- `components/NavSidebar.tsx:219-269`：主入口、KB列表、重命名保留当前详情id。
- `components/nav/FolderSection.tsx`：顶层KB平铺，创建/编辑/删除与缓存错误恢复。
- `components/KnowledgeBaseCreateModal.tsx`：统一name+description表单、旧长描述与失败后按stable code校准。
- `components/list-helpers.ts`：scope参数、布局偏好、摘要、时间。
- `components/document/DocumentCommandModal.tsx`：已批准note-only改名/所有文档移动；等待、失败、重试读取合同。
- `components/document/doc-menu.tsx:119-154`：详情目录菜单与移出目录。
- `components/DocumentPanel.tsx:319-377`：移动和8秒撤销，以原folder回写，刷新失败不能重写。
- `components/confirm-danger.tsx`：取消默认焦点、pending锁、失败保持同对象可重试。
- `lib/api.ts:750-897`：列表/元信息/删除/上传/原件替换/目录和标签API。
- `apps/server/src/services/folders.ts`：树注册表、后代count、按中文名称排序、改名补偿、删除归属清空。
- `apps/server/src/services/documents.ts:567-604`：目录含后代+tag筛选+updated降序+offset/limit。
- `packages/shared/src/structure.ts:61-71`：目录路径最多200、不允许空段/..；UI子目录名max60。服务端整体路径仍可能拒绝很深的60字名字。

### 稳定覆盖台账（与 library-scenes.json 同源）

50项当前能力/缺口，8项可选提案；每项states在JSON中展开。`proposed`不等同已经批准或已实现。

| ID | 场景 | 分类/归属 | 证据 | 行为/边界 |
|---|---|---|---|---|
| LIB-001 | 知识库入口与首库重定向 | current / module2+module5 | packages/renderer/src/components/library/LibraryView.tsx:137, packages/renderer/src/components/NavSidebar.tsx:219 | /docs 无id且scope=all时导航至已排序folders第一个顶层节点，replace历史；没有全部文档首页。 |
| LIB-002 | 首次引导 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:1246 | 先创建一个知识库；统一创建弹窗成功后导航新库，取消回引导。 |
| LIB-003 | 统一创建/编辑知识库 | current / module2-reuse | packages/renderer/src/components/KnowledgeBaseCreateModal.tsx:64, packages/renderer/src/components/nav/FolderSection.tsx:503 | 名称+描述；无图标选择；完整沿用第二模块合同，500字新描述与旧长描述保留。 |
| LIB-004 | 知识库身份头部 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:335 | 根库名称/描述保持，进入子目录不替换为子目录身份；名称桌面省略，窄屏可换行。 |
| LIB-005 | 知识库ID复制 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:357 | 整块按钮复制六位短码；成功已复制知识库 ID，失败提示手动选中复制；无code隐藏。 |
| LIB-006 | 文档计数 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:458 | items.length计数，最大100；不是全库总数，包含后代。 |
| LIB-007 | 布局切换偏好 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:146, packages/renderer/src/components/list-helpers.ts:38 | 列表/卡片 Segmented，默认列表，mimir.library-layout持久化；存储异常不阻断当前切换。 |
| LIB-008 | 添加文档菜单 | current / module4-handoff | packages/renderer/src/components/library/LibraryView.tsx:842 | 上传文件/上传文件夹/网页抓取/直接编辑，前3项交给module4并带当前目录。 |
| LIB-009 | 新建文件/直接编辑 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:157 | 创建未命名笔记空正文+tags[]+当前folder，成功requestNewNoteFocus再打开；失败全局新建文件失败；目前无pending防重。 |
| LIB-010 | 新建文件夹入口 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:499 | 桌面单独按钮，窄屏新建下拉；无currentNode时禁用新建文件夹。 |
| LIB-011 | 新建文件夹表单 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:767 | 子目录仅名称，按钮创建；斜杠按钮toast但Enter静默不提交；新建失败toast保留草稿，取消清空；pending只有按钮loading，未锁取消和Enter。 |
| LIB-012 | 目录面包屑 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:541 | 文档回根，中间段可点，末段文字；根身份不变；长路径当前flex:none不截断。 |
| LIB-013 | 列表读取初次加载 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:593 | Skeleton五行；目录视图等folders，tag视图仍发folders请求。 |
| LIB-014 | 列表读取失败重试 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:598 | 文档列表读取失败；先于空态；仅重试当前失败query之一；缓存刷新失败也覆盖原列表。 |
| LIB-015 | 切换scope期间旧数据 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:124 | keepPreviousData导致新目录头部可能暂配旧文档，当前无isPlaceholderData明确提示。 |
| LIB-016 | 失效知识库 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:344 | 仅folders非空且kbRoot不存在触发这个知识库不存在；返回首库。全部库为空但scope仍folder时不进入此分支。 |
| LIB-017 | 失效子目录 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:119 | currentNode不存在但kbRoot存在时没有失效子目录提示；空列表落通用空态，新建文件夹禁用。 |
| LIB-018 | 空知识库/空目录 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:619 | 这里还是空的+拖文件或添加文档提示，上传文件/直接编辑带当前folder。 |
| LIB-019 | 标签视图 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:115 | scope=tag:name显示#name；无身份ID、添加、新建、拖入；横切所有目录，显示文档位置；当前无站内标签列表入口，URL可达。 |
| LIB-020 | 空标签真实现状 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:624 | 仍显示拖文件/右上添加文档文案，实际无对应入口；须在对比当前保留此缺口，提案纠正。 |
| LIB-021 | 文件夹列表与卡片 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:683, packages/renderer/src/components/library/LibraryView.tsx:1007 | 直接子目录排在文档前；名字按钮可键盘进入，鼠标整个容器可点；显示子树文档count。 |
| LIB-022 | 文件夹更多菜单 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:1054 | 重命名/删除，卡片与列表复用FolderRowMenu，阻止冒泡不意外进目录；目前无受控Escape焦点恢复逻辑。 |
| LIB-023 | 文件夹重命名 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:236 | api.folders.move，目标取被操作目录parentOf(from)，子树scope跟随；未变关闭；请求错误toast保留；pending未锁关闭与Enter；关闭尝试原trigger否则body首button。 |
| LIB-024 | 删除空文件夹 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:285 | 这是一个空文件夹，删除后不影响任何文档；使用confirmDanger。 |
| LIB-025 | 删除非空文件夹 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:285, apps/server/src/services/folders.ts:407 | UI说文档保留回知识库根，后端实际清空folder=null；不得演示确定留当前KB，见critical caveat。 |
| LIB-026 | 列表文档行 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:713 | 当前整行button仅打开；没有文档更多操作、下载、删除、移动；补齐属于proposed。 |
| LIB-027 | 卡片打开入口 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:1119 | 普通容器可鼠标打开，标题button可键盘打开，动作与标题同级，避免嵌套交互。 |
| LIB-028 | 卡片文档更多菜单 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:1201 | 打开；note与docx/xlsx/pptx编辑；file下载原件/替换原件；全部删除。隐藏直接图标，更多始终可见。无rename/move入口。 |
| LIB-029 | 文件格式图标与来源徽标 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:882 | 文件用当前后缀+格式语义图标，不重复格式徽标；非文件显示笔记/网页/公众号/GitHub。 |
| LIB-030 | 文件名称和后缀 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:894 | 显示时补fileExtension，已有忽略大小写不重复，长名只截主体保留后缀；title给全名。 |
| LIB-031 | 摘要/位置/文件大小 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:868, packages/renderer/src/components/list-helpers.ts:88 | file元信息大小，其他正文摘要；当前目录可省略，后代位置相对路径；非文件空正文显示还没有内容。 |
| LIB-032 | 就绪与提取失败 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:374, packages/renderer/src/components/library/LibraryView.tsx:1238, packages/renderer/src/components/DocumentBadges.tsx:40 | 卡片就绪为 quiet 文字，提取失败保留徽标；列表全ready隐藏状态列，有failed才启用，窄屏failed移到标题次行。不是异步导入processing进度。 |
| LIB-033 | 更新时间 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:737 | YYYY/MM/DD HH:mm；列表小容器隐藏时间，卡片仍有时间。 |
| LIB-034 | 打开/编辑交接 | current / module3-handoff | packages/renderer/src/components/library/LibraryView.tsx:655 | 卡片打开/编辑都open(doc.id)；编辑不是新模式切换，Office由详情能力决定；返回库保持scope。 |
| LIB-035 | 下载原件 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:1207 | 同源/api/documents/:id/file?download=1锚点，凭cookie；浏览器接管，当前无可验证下载完成UI。 |
| LIB-036 | 替换原件选择器 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:188 | 隐藏input，点击前存doc.id；change先重置input value+目标；原生取消没有自定义回调。 |
| LIB-037 | 替换原件请求 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:746 | PUT multipart后仅toast成功/失败；无替换pending/防重/重试文件保留，成功只invalidate documents/folders/counts，不显示charCount/parseError明细。 |
| LIB-038 | 删除笔记 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:172 | 笔记从库移除，文件保留回收站，无一键恢复；成功已移入回收站；confirmDanger默认取消焦点。 |
| LIB-039 | 删除文件 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:172 | 记录与原件都删除，明确不可撤销；成功已删除文件与原件。 |
| LIB-040 | 删除网页/公众号/GitHub | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:172 | 当前非file都走笔记回收站文案，但成功文案按kind===note判断，网页等会说已删除文件与原件；后端通常仅软删DB记录。是待澄清文案缺口。 |
| LIB-041 | 页面拖入文件 | current / module4-reuse | packages/renderer/src/components/library/LibraryView.tsx:388 | 目录视图整页drop overlay，带当前目录，claimUploadBatch同帧防重；不新增目录拖拽。 |
| LIB-042 | 页内导入结果 | current / module4-reuse | packages/renderer/src/components/library/LibraryView.tsx:421 | UploadPanel inline，完成刷list/folders/counts，逐项结果，清空恢复；完全复用module4。 |
| LIB-043 | 导航知识库行菜单 | current / module2-reuse | packages/renderer/src/components/nav/FolderSection.tsx:250, packages/renderer/src/components/nav/FolderSection.tsx:409 | 复用module2，不在module5重画全工作区；知识库编辑/删除仍由侧边栏触发，主区无编辑按钮。 |
| LIB-044 | 文档重命名命令 | current / module3-reuse | packages/renderer/src/components/command-palette/items.tsx:41, packages/renderer/src/components/document/DocumentCommandModal.tsx:83 | module3已批准命令仅笔记，需打开文档后命令面板调用；文件当前无相同命令。 |
| LIB-045 | 文档移动命令 | current / module3-reuse | packages/renderer/src/components/command-palette/items.tsx:52, packages/renderer/src/components/document/DocumentCommandModal.tsx:237 | module3已批准，打开文档后命令触发；目录 Select（flattenFolders 扁平路径选项），空值知识库根是folder清空，不是当前KB根。 |
| LIB-046 | 文档详情目录菜单与撤销 | current / module3-handoff | packages/renderer/src/components/document/doc-menu.tsx:119, packages/renderer/src/components/DocumentPanel.tsx:319 | 更多>目录，可移出目录；成功8秒撤销以同API回写原folder，真实已有；详情模块交接不重做阅读器。 |
| LIB-047 | 固定头部/列表滚动 | current / module5 | packages/renderer/src/components/library/LibraryView.style.ts:76, packages/renderer/src/components/library/LibraryView.style.ts:279, packages/renderer/src/components/library/LibraryView.style.ts:309 | 头部flex:none内容body滚动，边界随bodyScrolled显形；低高度+长描述可挤没body。 |
| LIB-048 | 小屏与触屏 | current / module5 | packages/renderer/src/components/library/LibraryView.style.ts:26, packages/renderer/src/components/library/LibraryView.style.ts:590 | 当前narrow新建合并、布局放sectionHead，list容器700隐藏详情/状态，480隐藏时间，更多40px；全场景均要可用。 |
| LIB-049 | 焦点/hover/pressed/disabled | current / module5 | packages/renderer/src/components/library/LibraryView.style.ts:327, packages/renderer/src/components/library/LibraryView.style.ts:619 | 现有hover只改背景/颜色/边框色不改变几何；列表/卡片focus结构各异，pending锁定不完整须显式提案。 |
| LIB-050 | 查询、排序与容量边界 | current / module5 | packages/renderer/src/components/library/LibraryView.tsx:124, apps/server/src/services/documents.ts:567 | GET documents folder包含后代，limit100，updatedAt降序，无total，无分页UI；直接子目录在前且也列出后代文档。 |
| LIB-P01 | 列表/卡片共享更多入口 | proposed / module5 | packages/renderer/src/components/library/LibraryView.tsx:713 | 建议列表增加卡片已有动作以免切换布局丢能力；当前列表没有，需标注新增前端入口。 |
| LIB-P02 | 目录新建/改名就地校验与等待锁定 | proposed / module5 | packages/renderer/src/components/library/LibraryView.tsx:767, packages/renderer/src/components/library/LibraryView.tsx:806 | 建议与已批准表单一致：字段就地错误、IME保护、Enter防重、pending锁取消/关闭；仅现有API。 |
| LIB-P03 | 目录定位失效与空标签文案 | proposed / module5 | packages/renderer/src/components/library/LibraryView.tsx:344, packages/renderer/src/components/library/LibraryView.tsx:624 | 建议显示真正缺失目录及返回有效库；空标签移除不存在的上传提示。 |
| LIB-P04 | 查询状态与100条上限说明 | proposed / module5 | packages/renderer/src/components/library/LibraryView.tsx:124, packages/renderer/src/components/library/LibraryView.tsx:458 | 建议真实说明正在切换/刷新失败保留内容/当前最多显示100条且包含子目录；不增加分页。 |
| LIB-P05 | 替换请求反馈及防重 | proposed / module5 | packages/renderer/src/components/library/LibraryView.tsx:746, packages/renderer/src/lib/api.ts:840 | 建议已选文件可见与pending锁、失败说明、结果如实区分原件保存和正文提取；无后端百分比或取消API。 |
| LIB-P06 | 删除准确后果说明 | proposed / module5 | packages/renderer/src/components/library/LibraryView.tsx:285, packages/renderer/src/components/library/LibraryView.tsx:172, apps/server/src/services/folders.ts:407 | 建议目录明确文档保留但归属清空，不承诺留当前KB；资料删除按真实kind表达，无恢复入口承诺。 |
| LIB-P07 | 长路径/描述与低高度布局 | proposed / module5 | packages/renderer/src/components/library/LibraryView.style.ts:293 | 建议路径收缩/可滚动、长描述可展开并保留正文视口；不改信息架构。 |
| LIB-P08 | 浏览页移动/重命名入口边界 | proposed / module5 | packages/renderer/src/components/library/LibraryView.tsx:1201, packages/renderer/src/components/document/DocumentCommandModal.tsx:83 | 若主设计拟增加浏览页移动或重命名，须显式新增前端入口并沿用module3合同；不得当成当前卡片已有；文件重命名当前命令不支持。 |

### API合同与刷新

- `GET /api/folders`返回FolderNode树，count含后代，空目录在注册表中独立存在，按中文名称稳定排序。
- `GET /api/documents?folder=<path>&limit=100`含目录自身+后代；`tag=<name>`横切全部目录；服务端支持offset但当前UI没使用，response仅items。
- `POST /api/folders {path}`创建子目录，已存在409 FOLDER_EXISTS；`PATCH {from,to}`对子树整体改名，根短码不变；错误可能FOLDER_UPDATE_FAILED附retrySafe恢复事实。子目录旧表单当前没有KB编辑那套失败状态校准。
- `DELETE /api/folders?path=...`返回cleared，删除树行、文档folder清空；不删文档，不提供撤销。
- `POST /api/documents/notes`空白note；`PATCH /api/documents/:id {title|folder|tags}`现有元信息写入。
- `PUT /api/documents/:id/file` multipart替换原件，保持标签/目录，返回FileUploadResponse（document/charCount/parseError）；最大FILE_MAX_BYTES在server验证（routes/files.ts:72-90）。
- `DELETE /api/documents/:id`软删，note文件尝试进回收站；file另删除upload原件。无恢复API。
- `LibraryView.invalidateList:151`刷新documents/folders/counts；删除文档额外recent-documents；当前替换不刷新已开detail。主页面仅browse时挂载。

### 已有测试与缺口

- `LibraryView.test.tsx:26-78`：后缀补齐、格式图形/语义色、文件不重复徽标。
- `LibraryView.test.tsx:110-165`：卡片空白/摘要/标题打开一次，更多与下载不打开，Escape回更多。
- `LibraryView.drop.test.tsx:86-126`：同帧drop一批、逐文件结果、刷新、非Files/空/tag忽略。
- `list-helpers.test.ts`：布局读写异常与摘要/时间等纯逻辑。
- `FolderSection.test.tsx:24`：后台刷新失败保留KB。
- `KnowledgeBaseCreateModal.test.tsx:60-280`：完整module2表单、IME、pending、失败草稿、stable code恢复、长描述、取消。
- `DocumentCommandModal.test.tsx:113-308`：module3绑定正确文档、IME/快捷键边界、等待防关闭、目录读取失败、失败草稿、只读刷新、不为file发note命令。
- `DocumentPanel.commands.test.tsx:39`：写成功读失败保持编辑器，重试仅读。
- `apps/server/src/test/folder-update.test.ts:52-280`：描述+改名、冲突、文件先写、补偿与不安全重试。
- 未发现完整LibraryView集成覆盖：初次/缓存错误、all重定向、子目录create/rename/delete、copy ID、替换pending/失败、tag空态、失效子目录、100条边界、面包屑长路径等。本次为research，不执行/新增测试。

### 外部参考（本研究亲自核验）

- 官网 `https://weknora.weixin.qq.com/` 2026-10-18 HTTP200，HTML 113529 bytes；meta描述标示“v0.8.3 新增画廊、多模态 Embedding、原文引用定位、附件按需读取和平台用户管理”。首页明文“查询资料用 RAG，处理多步任务用 Agent，整理知识用 Wiki。三种能力共享同一知识库”。官网是产品信息，不能据此推断Mimir API能力。
- 固定公开源码revision **`2c0d8384398ca756ee414eef01b71caf91e2caa6`**，GitHub commit timestamp `2026-10-17T15:25:02Z`，2026-10-18查询main得到。链接 `https://github.com/Tencent/WeKnora/tree/2c0d8384398ca756ee414eef01b71caf91e2caa6`。
- `frontend/src/views/knowledge/components/DocumentListView.vue:7`与`DocumentCardView.vue:8`均import共享`DocumentActionMenu`；其actions declarations list:74/card:75包含download/edit/move/move-folder/delete。可借鉴“切布局不丢现有管理动作”的一致性；Mimir列表补入口必须标proposed，WeKnora的批量/跨库向量移动/重解析不直接搬入。
- `DocumentActionMenu.vue:46-55`下载/编辑依据能力与类型显示，`97-103`move-folder/move受canMutateKnowledge限制；Mimir应沿自身note/Office/file能力判断，不抄权限体系。
- `KbFolderTree.vue:55-65`键盘Enter/Space操作；87-89改名Enter提交/Escape取消/blur提交。参考可见键盘入口，Mimir已批准显式提交优先，**不照搬blur自动保存**，也不改侧边栏回目录树。
- 完整外部视觉/功能比较由同任务`research/reference-review.md`补充；本文件仅列亲查依据，未用外部Markdown编辑器替代Office工具栏。

## Related Specs

- `.trellis/workflow.md`：任务目前planning，用户需先认可HTML具体版才执行。
- `.trellis/spec/project/rules.md`：不加目标外能力、React Compiler、文件先写、重要契约归属。
- `.trellis/spec/renderer/frontend/index.md`、`conventions.md`：共享renderer、相对导入、API和主题入口。
- `.trellis/spec/renderer/frontend/forms.md`：已批准KB编辑和confirmDanger，等待锁/失败草稿/恢复真实事实。
- `.trellis/spec/renderer/frontend/search-parity.md`、`capture-parity.md`：模块3/4交接边界。

## Caveats / Not Found

- 本轮为源码静态盘点，未运行产品测试、未执行真实删除/替换/创建；不能作为浏览器全流程通过证据。主会话已捕获当前GUI `verification/baseline/list.png`、`cards.png`、`card-menu.png`，像素匹配以该证据为准。
- 未读implement.jsonl/check.jsonl：研究角色按系统注入协议隔离，仅使用PRD、源码、相关规范。
- 未发现可用`trellis-agent-research/SKILL.md`路径；当前已是trellis-research role，不嵌套派agent。
- 待HTML制作选择拟采纳proposed项；本JSON是覆盖/缺口依据，不冒充最终设计scene manifest，也不批准任何产品改动。
