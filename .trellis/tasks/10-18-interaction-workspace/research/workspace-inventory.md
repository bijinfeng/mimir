# Research: 工作区导航与账户菜单全状态盘点

- Query: 第二模块全部真实页面/入口/浮层/状态、保留项和具体交互缺口是什么，HTML 应如何完整覆盖？
- Scope: mixed（源码与测试为主，WeKnora 固定证据复核；真实浏览器取证由主会话负责）
- Date: 2026-10-18
- Active task: `.trellis/tasks/10-18-interaction-workspace`；本稿不是产品实现授权。

## Findings

当前侧栏是 **D-079 顶层知识库平铺列表**，不是树。源码仍有旧 tree 命名/注释，不能据此在对比稿画回侧栏子树、拖拽或新建子目录。深层 `folder:技术/前端` 只点亮“技术”；打开笔记时该库是 `aria-current=location`，最近笔记才是 page（FolderSection:15、279、508）。

### Files found

| 文件 | 作用 |
|---|---|
| `packages/renderer/src/components/NavSidebar.tsx` | 共享导航编排、路由guard、读取分支、展开/折叠/Drawer |
| `packages/renderer/src/components/NavSidebar.style.ts` | 侧栏/行/最近/账户与主题菜单样式 |
| `packages/renderer/src/components/nav/FolderSection.tsx` | 平铺知识库、行菜单、创建入口、重命名与删除 |
| `packages/renderer/src/components/nav/AccountRow.tsx` | 身份、云本地模式、主题级联、账号/统计/设置/登出 |
| `packages/renderer/src/components/nav/RecentNotes.tsx` | 最近6条note，折叠标题与位置 |
| `packages/renderer/src/components/nav/NavigationAction.tsx` | 共享Button入口、focus、紧凑Tooltip、aria-current |
| `packages/renderer/src/components/nav/menu-items.tsx` | route key、最多12会话、单组与相对时间 |
| `packages/renderer/src/components/nav/folder-ops.ts` | 路径末段/父级/拼接/完整子树判断 |
| `packages/renderer/src/components/nav/folder-icons.tsx` | 13个图标与未知键fallback |
| `packages/renderer/src/lib/recent-documents.ts` | 每用户localStorage 12 ID、GET真相过滤与跨页刷新 |
| `packages/renderer/src/lib/unsaved.tsx` / `components/UnsavedGuard.tsx` | 手动三选与自动保存两选守卫，失败不放行 |
| `packages/renderer/src/routes/_app.tsx` | 256/52网格、折叠偏好、overlay状态、搜索/收集宿主边界 |
| `packages/renderer/src/lib/nav-collapse.ts` / `platform.tsx` | 880px首帧matchMedia；桌面平台Context，不能用desktop推localMode |
| `packages/renderer/src/theme/appearance.ts` | auto/light/dark唯一清单、本地偏好与系统跟随 |
| `packages/renderer/src/components/KnowledgeBaseCreateModal.tsx` / `confirm-danger.tsx` | 基础v1已完成创建/删除共享交互，作为保留项 |
| `packages/renderer/src/components/NavSidebar.test.tsx` | 级联收起、入口唯一、Drawer焦点/退出/滚动锁、guard取消与获准 |
| `packages/renderer/src/components/nav/menu-items.test.ts` / `folder-ops.test.ts` | route key/分组/相对时间、路径准确性 |
| `packages/renderer/src/lib/recent-documents.test.ts` / `platform.test.tsx` | 存储隔离/容量/损坏降级，平台判别 |
| `apps/server/src/services/folders.ts:145` | 子树count累计，侧栏顶层计数的语义证据 |

### Session absence and recent recovery details

- 根路由 `routes/__root.tsx:14` 在渲染工作台前直调 `api.auth.session`，null重定向登录、异常进入RootError；它没有把结果填入React Query。导航自身 `AccountRow:32` 和AppShell:119又独立query，因此侧栏短时缺席仍可能发生。但不能在HTML把“彻底未登录”画成可继续工作的假身份，更不能为局部账户加载状态重写根鉴权。
- 最近记录现有GET `api.documents.get` 能抛 `ApiRequestError(status,code,message)`（`lib/api.ts:110`），无需新端点。可设计仅前端hook结果 `{items, unavailableCount, retryableFailureCount}` 或等价查询错误契约；404/403属于不可显示，网络/5xx属于暂时读取失败；401应依现行鉴权处理，不显示历史标题。部分成功只显示此次获准GET成功项，错误文案不包含失败项标题。用refetch再次读取本地ID集。这里只建议契约，不固定代码类型。

### Concrete deltas worth presenting

1. **重命名**：`FolderSection.tsx:412–460,531` 仍用全局message校验/失败，Modal未连接mutation pending，按钮无busy/防重/退出锁，输入无显式label/error关联。对齐已批准基础v1，保留失败草稿与路径后缀跟随，不改服务端move合同。
2. **登出**：`AccountRow.tsx:204` 关闭菜单直接void异步，绕过unsaved且失败没有catch/反馈；`api.ts:1340` 只有请求成功才整页登录跳转。加入已有guard、busy及原处错误重试，保持成功整页清缓存，无需新后端。干净内容不凭空新增确认步骤。
3. **最近笔记假空态**：`recent-documents.ts:49` allSettled吞所有reject，`RecentNotes.tsx:34` 无loading/error分支。网络失败会像“从没打开”。提案区分暂时错误与真实404/403，部分成功仍保留成功项，既有GET/refetch足够；单改UI读isError无效。
4. **会话历史读取**：`NavSidebar.tsx:125` 初次loading不展示状态；error有可点重试但无重试中反馈；`menu-items.tsx:94` 前12条使当前旧会话可能不可见。建议骨架/恢复状态与当前项定位；旧项只从已返回数据定位，不加分页接口/虚构更多入口。
5. **账户模式未知**：`AccountRow.tsx:41` 未知config默认false云端，会短暂露出本地不应有的邮箱/登出；session无user时整行含设置全消失（:65）。提案用真实已知模式控制危险动作，加载/失败可解释并重试，保持可用设置入口。
6. **触摸/键盘细节**：账户/主题菜单`NavSidebar.style.ts:422` 行32px未设窄屏44px；KB更多与主动作已有44px不能当新增。主题/账户Esc分层、长名完整可发现、外点关菜单回焦是否抢新目标，需要浏览器证据，列为验收风险而非确证bug。

### Preserve/current-correct

- 基础v1创建内联校验/保留草稿/pending锁（KnowledgeBaseCreateModal:163）、删除保留文档并原处重试（FolderSection:437、confirm-danger:13）已完成，不重复算新增。
- 账户主题**级联形态已由用户拍板**（AccountRow:67）；受控openKeys+flushSync先关子层（:197），勾选extra尾对齐，重复选当前值有效无操作。不得改回平铺。
- Drawer 进入X、首尾Tab循环、Esc/遮罩/X回trigger、获准导航再关，已有测试；取消/保存失败应原位保留。
- navSelectedBg/Text已经中性，当前字段是细边，不能用过时粗边作Before。全套保持token与独立focusRing。
- 云本地模式由config.localMode，不由desktop壳推断；设置是独立入口，账户菜单没有第二个“设置”。

### HTML state coverage and interaction contract

以下场景与 `workspace-scenes.json` 一一对应。每个state是可复现fixture/交互，并非要求状态全交叉笛卡尔积。当前/提案同数据同尺寸，预览控制同步，业务操作各自独立本地模拟；异步明确可切成功/失败，禁止真实API/登出/创建删除/偏好写入。用简单“通用提示”替代缺失的表单、菜单或Guard不能算覆盖。

#### shell · 展开工作区与滚动

来源：`packages/renderer/src/components/NavSidebar.tsx:157`；`packages/renderer/src/components/NavSidebar.style.ts:73`；`packages/renderer/src/routes/_app.tsx:69`。

**状态**：shell-01 浏览器256px展开；shell-02 桌面宿主隐藏重复品牌标记；shell-03 长内容区滚动/底部账户固定；shell-04 顶部主动作区/48px分栏头部；shell-05 窗口变窄再变宽保留偏好；shell-06 低高度横向不溢出。

当前：展开侧栏256px；头部48px；主动作固定，列表独立滚动，账户固定。桌面hideTopBar只改变品牌标记/文字，不属于本轮原生窗口控件。

提案：保留几何与语雀中性选中角色；校准三组文字/图标基线与滚动边界，不扩大工作台功能。

键盘：Tab顺DOM；按钮Enter/Space；保留可见focus。

退出/恢复：折叠由应用壳保存到mimir.nav-collapsed；不请求服务端。

#### rail · 52px折叠栏

来源：`packages/renderer/src/components/NavSidebar.tsx:267`；`packages/renderer/src/components/NavSidebar.style.ts:19`；`packages/renderer/src/components/nav/NavigationAction.tsx:22`。

**状态**：rail-01 默认折叠与图标Tooltip；rail-02 知识库选中；rail-03 新建/历史对话所属选中；rail-04 设置选中；rail-05 头像/账户Tooltip；rail-06 展开后恢复列表上下文。

当前：折叠栏有展开/知识库/新建对话/搜索/收集/设置/账号，紧凑按钮38px；窄屏44px；chat任一页亮对话入口。

提案：保留全部入口；统一hover/focus可见度与Tooltip名称；折叠态不添加知识库弹出树。

键盘：可Tab到所有图标；Enter/Space打开；Tooltip不拦操作。

退出/恢复：宽屏展开修改长期偏好，窄屏仅打开临时Drawer。

#### drawer · 窄屏临时抽屉

来源：`packages/renderer/src/components/NavSidebar.tsx:159`；`packages/renderer/src/components/NavSidebar.tsx:325`；`packages/renderer/src/routes/_app.tsx:335`；`packages/renderer/src/components/NavSidebar.test.tsx:170`。

**状态**：drawer-01 收起52px栏；drawer-02 打开280px或100vw抽屉；drawer-03 首次焦点到关闭按钮；drawer-04 Tab/ShiftTab首尾循环；drawer-05 X关闭与回焦；drawer-06 Escape/遮罩关闭与回焦；drawer-07 点击目的地后关闭；drawer-08 未保存确认叠层；drawer-09 低高度滚动保持账户可达。

当前：≤880px强制折叠，不覆盖长期偏好；Drawer背景inert/锁滚动；X/Escape/遮罩回触发器；获准导航后关闭而非回抢焦点。已有行为测试覆盖。

提案：保留；重点验收账户/主题/行菜单独立portal在抽屉内的Escape逐层收起，不预先宣称现有有bug。

键盘：已有手动Tab环+AntD trap；pending时让UnsavedGuard接管焦点。

退出/恢复：dismiss恢复展开按钮，action关闭不回抢焦点；Guard取消保持抽屉。

限制：账户/主题菜单的Escape需浏览器核实；不可把未证实风险画成事实。

#### actions · 主入口与目的地

来源：`packages/renderer/src/components/NavSidebar.tsx:83`；`packages/renderer/src/components/NavSidebar.tsx:199`；`packages/renderer/src/routes/_app.tsx:269`。

**状态**：actions-01 快速搜索与平台快捷键；actions-02 知识库根视图；actions-03 新建对话空id；actions-04 收集弹层；actions-05 账号资料目的地；actions-06 数据统计目的地；actions-07 设置默认目的地。

当前：搜索按钮⌘K/CtrlK取真实平台；打开搜索/收集只叠层不离开，选搜索结果才guard；知识库/chat/settings导航runGuarded，统一scope=all。

提案：保持动作语义，仅展示目的地边界和回焦，不在此评审搜索结果/收集表单/设置内容。

键盘：快捷键真实支持Meta/Ctrl+K；入口均Button；不编造额外快捷键。

退出/恢复：搜索/收集由宿主弹层关闭；窄屏发起时先关Drawer；目的地触发前guard。

#### selection · 路由与位置层次

来源：`packages/renderer/src/components/NavSidebar.tsx:208`；`packages/renderer/src/components/NavSidebar.tsx:229`；`packages/renderer/src/components/nav/FolderSection.tsx:279`；`packages/renderer/src/components/nav/FolderSection.tsx:508`；`packages/renderer/src/components/nav/menu-items.tsx:44`。

**状态**：selection-01 知识库总览；selection-02 根知识库选中；selection-03 深层目录映射根知识库；selection-04 笔记打开根知识库location；selection-05 最近笔记page高亮；selection-06 历史对话id高亮；selection-07 新对话无id；selection-08 设置高亮；selection-09 标签scope无伪知识库行选中。

当前：知识库主入口docs时active；知识库行page，笔记id存在时变location弱上下文；嵌套activePath映射根；最近笔记id匹配page。

提案：保留父位置与当前页强弱分层；避免把location伪装成当前笔记；长标题完整名可发现。

键盘：aria-current语义page/location保留；当前项hover不抹选中。

退出/恢复：导航后按真实route更新；不乐观伪选中。

#### libraries · 知识库列表读取

来源：`packages/renderer/src/components/nav/FolderSection.tsx:15`；`packages/renderer/src/components/nav/FolderSection.tsx:486`；`packages/renderer/src/components/nav/folder-icons.tsx:57`；`apps/server/src/services/folders.ts:145`。

**状态**：libraries-01 顶层列表及文档累计数；libraries-02 空知识库数量0；libraries-03 长知识库名截断；libraries-04 13种图标及未知键回退；libraries-05 首次loading骨架；libraries-06 读取失败/重试；libraries-07 重试中；libraries-08 成功恢复列表。

当前：只显示response.items顶层；children不渲染，无树展开/拖拽/新建子目录；数字包含子树总数；已有loading/empty/error/retry。

提案：保留全部状态，重试中给就地反馈与防重复；长名称完整可发现；失败不伪装空库。

键盘：行button及独立⋯Button；无tree角色/方向键树契约。

退出/恢复：重试保持当前scope，不清空位置。

限制：来源路径的server项请去掉renderer前缀；这是跨层语义证据而非允许修改server。

#### library-menu · 知识库行菜单

来源：`packages/renderer/src/components/nav/FolderSection.tsx:182`；`packages/renderer/src/components/nav/FolderSection.tsx:253`；`packages/renderer/src/components/nav/FolderSection.tsx:275`。

**状态**：library-menu-01 默认数字可见；library-menu-02 hover显示更多数字隐去；library-menu-03 键盘focus-within显示更多；library-menu-04 菜单展开保留更多；library-menu-05 触屏/窄屏更多常显；library-menu-06 重命名/危险删除；library-menu-07 菜单Escape与回焦；library-menu-08 点击菜单不导航。

当前：数字与⋯同槽，hover/focus/menu-open切换；触摸常显⋯；菜单只有重命名/删除；Escape已显式回焦，菜单操作不冒泡成导航。

提案：保留，打磨触摸目标和长名称上下文；不加移动/建子目录/复制等不存在项。

键盘：Tab到行与独立⋯；Enter/Space开；菜单Esc回⋯；菜单方向键依AntD。

退出/恢复：外点/选择/Escape关闭；重命名转Modal；删除转confirmDanger。

#### create · 侧栏创建入口（基础v1保留）

来源：`packages/renderer/src/components/nav/FolderSection.tsx:474`；`packages/renderer/src/components/nav/FolderSection.tsx:522`；`packages/renderer/src/components/KnowledgeBaseCreateModal.tsx:163`。

**状态**：create-01 新建空表单；create-02 名称/描述/13图标可取消选中；create-03 空白禁用/非法斜线错误；create-04 提交锁定；create-05 请求失败保留草稿/重试；create-06 取消清草稿与回焦；create-07 成功进入新库。

当前：共享Modal已完成内联校验/错误、草稿保留、提交guard/禁关闭/禁取消；成功invalidate并onSelect新path。

提案：作为本模块入口串联和回归展示，不重复列为新增设计；同已验收基础v1。

键盘：初始名称焦点、字段label/错误描述；Input已有IME Enter抑制。

退出/恢复：非pending可取消；成功进入新库；pending不离开。

#### rename · 知识库重命名

来源：`packages/renderer/src/components/nav/FolderSection.tsx:379`；`packages/renderer/src/components/nav/FolderSection.tsx:412`；`packages/renderer/src/components/nav/FolderSection.tsx:448`；`packages/renderer/src/components/nav/FolderSection.tsx:531`。

**状态**：rename-01 打开预填旧名称；rename-02 空白禁提交；rename-03 未改名提交直接关闭；rename-04 斜线非法；rename-05 重名/服务端失败；rename-06 提交中；rename-07 失败保留输入重试；rename-08 取消恢复原名与回焦；rename-09 成功保持嵌套位置。

当前：现有name.trim校验；非法及请求失败仅message；无pending loading/取消锁/按钮防重；无label/id/error关联；成功followActivePath保留后缀，失效folders/documents/document。

提案：对齐基础v1：可见标签、就地校验及请求错误、失败保留草稿、pending只提交一次并锁退出；保留未改名直接结束与原路径子树跟随。

键盘：名称初始焦点、Enter有效提交/IME不误交、非法回字段；取消回⋯或知识库入口。

退出/恢复：取消/X/Escape/遮罩只在未提交时可关；完成回原行或语义fallback；成功若重命名当前子树保留后缀。

#### remove · 删除知识库（基础v1保留）

来源：`packages/renderer/src/components/nav/FolderSection.tsx:425`；`packages/renderer/src/components/nav/FolderSection.tsx:437`；`packages/renderer/src/components/confirm-danger.tsx:13`。

**状态**：remove-01 空库删除说明；remove-02 含文档删除保留文档/清指派说明；remove-03 取消默认焦点；remove-04 删除中锁退出；remove-05 失败原处重试/取消；remove-06 成功移出当前scope。

当前：confirmDanger已保留对象/错误/重试，pending禁取消/Escape；删除知识库保留文档回库根；当前子树删除成功onSelect空path。

提案：保留合同，展示基础v1复用；不可称删除文档、不可加撤销或假后台回收站。

键盘：默认取消焦点；失败alert；AntD promise控制loading与保留。

退出/恢复：取消不删；成功才关闭，当前scope失效则到知识库总览。

#### history · 对话历史

来源：`packages/renderer/src/components/NavSidebar.tsx:48`；`packages/renderer/src/components/NavSidebar.tsx:125`；`packages/renderer/src/components/nav/menu-items.tsx:84`；`packages/renderer/src/components/nav/menu-items.test.ts:67`。

**状态**：history-01 单组列表/相对时间；history-02 空标题回退新对话；history-03 长标题与时间并存；history-04 空列表说明；history-05 首次loading；history-06 读取失败/重试；history-07 重试中；history-08 超过12条；history-09 当前id在12条以外。

当前：单组对话，slice(0,12)，不按日期分；空态有说明；error一行菜单可重试；loading没有骨架/文本；active超过12条不出现在侧栏。

提案：加轻loading/重试中反馈和长标题完整名；建议维持最多12条并让已返回的当前旧会话可定位（替换列表末条或附当前位置需主方案定），不新增分页/更多会话接口。

键盘：Menu方向键/Enter；选中aria-current；Esc语义由菜单宿主。

退出/恢复：点击历史runGuarded后去/chat?scope=all&id=...；失败留现页面。

限制：列表API返回范围以现有响应为准，不能凭空取得未返回的旧会话；若不做active可见修复应明确限制。

#### recent · 最近笔记正常态

来源：`packages/renderer/src/components/nav/RecentNotes.tsx:17`；`packages/renderer/src/lib/recent-documents.ts:6`；`packages/renderer/src/lib/recent-documents.test.ts:6`；`packages/renderer/src/routes/_app.tsx:244`。

**状态**：recent-01 展开标题与aria-expanded；recent-02 折叠后保留分组头；recent-03 只列note前6条；recent-04 长名称和原路径title；recent-05 当前笔记选中；recent-06 空本地记录；recent-07 已删除/无权限记录排除；recent-08 重开移动最前/账号隔离。

当前：本地每账号存12文档ID、再按GET真相排除失败、只显示前6个note；收起状态是组件内存不承诺跨设备；行title有完整名与folder。

提案：保留容量/过滤/排序/账号隔离/折叠；不增加全局最近文档页或云同步。

键盘：组头Enter/Space，aria-expanded；笔记Button；保留title补充但非唯一名称。

退出/恢复：打开笔记runGuarded；取消保持原笔记与Drawer；开成功只按真实id高亮。

#### recent-recovery · 最近笔记读取恢复

来源：`packages/renderer/src/components/nav/RecentNotes.tsx:34`；`packages/renderer/src/lib/recent-documents.ts:44`。

**状态**：recent-recovery-01 有本地ID但首次loading；recent-recovery-02 全部暂时请求失败；recent-recovery-03 部分成功部分暂时失败；recent-recovery-04 重试中；recent-recovery-05 重试成功；recent-recovery-06 全部404/403真实不可显示。

当前：当前Promise.allSettled把所有reject静默丢掉且query整体成功，UI未消费isLoading/isError，因此网络失败可显示成无最近笔记。

提案：区分首次读取/暂时错误/真实空；保留已成功项，局部说明+重试；404/无权限继续不显示；利用既有GET和refetch，不新建端点。

键盘：重试Button+status/alert，焦点保持重试/当前行；折叠不强制展开。

退出/恢复：失败不自动离开；重试不清空当前打开笔记。

限制：需要实现时对ApiRequestError.status分类并保持隐私；不能只在UI读取isError，hook现在吞错不会置error。

#### identity · 账户身份与模式

来源：`packages/renderer/src/components/nav/AccountRow.tsx:32`；`packages/renderer/src/components/nav/AccountRow.tsx:65`；`packages/renderer/src/components/nav/AccountRow.tsx:93`。

**状态**：identity-01 云端头像/名称/邮箱；identity-02 本地用户且无登出；identity-03 无头像字母fallback；identity-04 长名称邮箱截断；identity-05 session尚未返回；identity-06 session读取失败；identity-07 config未返回；identity-08 config读取失败。

当前：无user整个AccountRow不渲染（连设置入口）；localMode=data?.localMode??false，因此未知时按云端出邮箱/登出；身份group非可点击标题。

提案：保留身份结构；未知模式不展示云端专属危险动作，loading/error轻占位及就地重试；可用设置入口不因身份请求临时失效消失。

键盘：头像Button完整aria-label；菜单身份不可当重复账号动作；长名称可完整发现。

退出/恢复：session/config重试已有API；本地模式判服务端事实，与desktop壳区别。

#### account-menu · 账户菜单与目的地

来源：`packages/renderer/src/components/nav/AccountRow.tsx:132`；`packages/renderer/src/components/nav/AccountRow.tsx:155`；`packages/renderer/src/components/NavSidebar.style.ts:393`。

**状态**：account-menu-01 展开态点击账号；account-menu-02 折叠态头像菜单；account-menu-03 账号资料入口；account-menu-04 数据统计入口；account-menu-05 外点关闭与回焦；account-menu-06 Escape逐层关闭；account-menu-07 窄屏边缘弹层/44px触达。

当前：topRight受控Dropdown，destroyOnHidden；account/stats通过父回调guard；设置是独立底部按钮不在菜单；主题级联；行min-height32，尚无窄屏44覆写。

提案：保留菜单IA及独立设置；窄屏菜单触达统一44、边缘避让、键盘焦点清楚；明确Escape回触发器；避免外点关闭时抢新目标焦点。

键盘：Enter/Space头像；Menu方向键；Esc优先当前菜单/子菜单，需实际浏览器核对当前；不关闭整个Drawer。

退出/恢复：选择目的地guard；取消未保存回原入口/菜单上下文；外点/ESC收起并清子菜单。

#### appearance · 主题级联

来源：`packages/renderer/src/components/nav/AccountRow.tsx:67`；`packages/renderer/src/components/nav/AccountRow.tsx:170`；`packages/renderer/src/theme/appearance.ts:39`；`packages/renderer/src/components/NavSidebar.test.tsx:123`。

**状态**：appearance-01 主题父项与级联箭头；appearance-02 跟随系统选中；appearance-03 浅色选中；appearance-04 深色选中；appearance-05 点当前项无多余变化；appearance-06 选择后全部层收起；appearance-07 重开显示最新勾；appearance-08 系统变化auto跟随；appearance-09 窄屏级联不出界。

当前：级联形态是用户既有拍板；THEME_MODES唯一清单；extra尾勾对齐；受控openKeys+flushSync先关子层防残留；本地偏好非账号云同步。

提案：保留已正确行为及选项顺序/文案；拟为父项增加当前值提示、触摸安全区/边缘避让与主题选择语义，不能改回平铺。

键盘：方向键进入/返回子层；Esc分层；当前项不disabled；勾不成为唯一可及选择状态。

退出/恢复：选择先关子层再关父层再切外观；无需guard/网络保存；偏好受限存储时本次仍生效。

#### signout · 云端登出

来源：`packages/renderer/src/components/nav/AccountRow.tsx:123`；`packages/renderer/src/components/nav/AccountRow.tsx:204`；`packages/renderer/src/lib/api.ts:1340`。

**状态**：signout-01 云端登出可用；signout-02 本地不出现；signout-03 脏内容选择登出；signout-04 guard取消；signout-05 guard保存成功再登出；signout-06 登出请求中；signout-07 登出失败原处恢复；signout-08 重试成功至登录。

当前：当前关闭菜单后直接void api.auth.signOutAndLeave；没有runGuarded/pending/错误反馈；成功才window.location.href到/login整页清内存。

提案：接入已有unsaved合同；请求期间单次busy，失败保留账号与错误说明/重试，成功仍整页离开；不新增普通干净登出的强制确认页。

键盘：guard取消回账户入口；busy不可重复；错误alert/可聚焦重试。

退出/恢复：失败不跳登录、不假装退出；本地无动作；保存失败不发登出；成功才重载清缓存。

#### unsaved · 导航未保存边界

来源：`packages/renderer/src/components/NavSidebar.tsx:83`；`packages/renderer/src/lib/unsaved.tsx:75`；`packages/renderer/src/components/UnsavedGuard.tsx:43`；`packages/renderer/src/components/NavSidebar.test.tsx:239`。

**状态**：unsaved-01 manual继续编辑；unsaved-02 manual丢弃改动；unsaved-03 manual保存并离开；unsaved-04 保存中锁定；unsaved-05 保存失败不放行；unsaved-06 auto正在保存无丢弃；unsaved-07 auto已保存后离开；unsaved-08 Drawer保留直到获准。

当前：已guard知识库/新建历史对话/设置/资料/统计/最近笔记。manual三选，auto无丢弃；失败保持原位置。搜索/收集打开不guard因为未离开；选结果才guard。

提案：保留现有Guard，不重写Office/自动保存算法；将云端登出作为当前未覆盖离开入口补齐；删除/重命名导致scope导航仍沿父onSelect guard。

键盘：pending时Drawer暂停自身trap/键盘关闭，Modal独占；取消回触发导航项。

退出/恢复：仅获准才closeAfterAction并navigate；取消/失败不改route与原抽屉；保存必须调用原注册save。

#### stress · 状态组合与适配

来源：`packages/renderer/src/components/NavSidebar.style.ts:152`；`packages/renderer/src/components/NavSidebar.style.ts:393`；`packages/renderer/src/components/nav/FolderSection.tsx:124`；`packages/renderer/src/theme/customToken.ts:31`。

**状态**：stress-01 浅色桌面键盘；stress-02 深色桌面键盘；stress-03 390×844窄屏触摸；stress-04 低高度长列表；stress-05 长中英混排与大计数；stress-06 reduced-motion/禁用态。

当前：现有中性navSelectedBg/Text、细字段边框、focusRing、触摸44目标已局部建立。

提案：同一数据双栏对比、同尺寸/主题切换；只修具体不一致；保留token体系，不引入页面字面量色/第二provider。

键盘：全程键盘、hover与focus可独立检查；不得移除focus outline来追求细边。

退出/恢复：全部异步本地模拟、明确成功/失败模拟；无真实登出/删除/偏好写入。

## External references

本轮按 AGENTS 必查 WeKnora 官网及公开源。已读取父任务归档 `research/reference-review.md`、`reference-fetch.json`、`weknora-official.html`、release JSON 与 theme CSS，并读取本子任务主会话当日新取 `research/reference-recheck.json`。三URL均HTTP200，固定 **v0.8.3**（release published 2026-10-14T07:53:24Z），源码SHA **3e22822c1d2397be730c458c7539d0eb8c113a24**；不声称最新。

- 官网：https://weknora.weixin.qq.com/ ，取证hash见reference-recheck.json。官网只能验证公开品牌/能力，不能证明私人工作台行为。
- 固定release：https://github.com/Tencent/WeKnora/releases/tag/v0.8.3 。
- 固定公开源码：https://raw.githubusercontent.com/Tencent/WeKnora/3e22822c1d2397be730c458c7539d0eb8c113a24/frontend/src/assets/theme/theme.css 。父证据 `weknora-theme.css:195–210`：聚焦字段保留细边/无shadow，selection背景安静、文字中性、小指示品牌色。适用于本模块保持中性导航选择、可见focus；Mimir现有token已同向，不需要全局改主题。
- WeKnora CSS没有提供Mimir的云本地账户、unsaved、每用户最近笔记/知识库删除合同，因此这些以Mimir真实代码为准，不照搬或声称其提供了恢复模式。其Markdown工具栏与本模块无关，更不能代替Office模型。
- 主视觉沿用户认可的语雀适配，Obsidian仅工作区连续性/布局参考；本研究未重新登录检查语雀私人工作台，不作像素级来源断言。

## Related specs

- `.trellis/workflow.md`：Phase1.2研究持久化；本次只规划，HTML版本审批后再Phase2。
- `.trellis/spec/project/product.md`：两栏+知识库D-079、未保存manual/auto契约。
- `.trellis/spec/project/design.md`：256/52与880断点、token与焦点规则。
- `.trellis/spec/renderer/frontend/index.md`、`conventions.md`：共享renderer平台Context、localMode服务端事实、相对导入、antd-style与React Compiler。
- `.trellis/spec/renderer/frontend/forms.md`：基础v1明确保存/失败保留/开关回滚/IME及pending规则，重命名应复用同语义。
- `.trellis/spec/renderer/frontend/theme/conventions.md`：主题唯一来源、细字段边与独立键盘焦点。

## Caveats / Not Found

- 根路由session失败页面属全局连接/鉴权模块，此轮只覆盖已进入工作台后的导航独立请求状态。
- 仅源码+已有测试研究，未运行浏览器交互或测试；主会话补真实截图/DOM证据，不把现有测试说明当本轮重新通过。
- 不存在侧栏目录树/新建子目录/拖拽；这些不是缺失功能。LibraryView内部嵌套编辑属后续模块。
- 无当前“更多会话”UI；不能借12条上限编造分页。若主稿不纳入当前旧会话定位，明确保留限制即可。
- 最近请求reject分类需谨慎：权限/删除必须继续隐藏，网络/5xx不应当空；不能泄漏已失权文档标题。
- 虚构HTML账号只用admin测试身份；既有recent单测alice/bob仅隔离键fixture，研究未新建任何账号，后续新验收不沿用为登录账号。
- 研究未修改产品、spec、task元信息或冻结基础v1原型；未进行任何Git操作。
