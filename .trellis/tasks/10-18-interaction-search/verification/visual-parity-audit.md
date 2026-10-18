# 搜索模块 v1 还原差异审计（修正前）

2026-10-18；依据冻结 prototype/main.tsx、review.css，review.html SHA256 `0e8a90da0c37c509f8fcda8027c9f01bac5f58607c45db83f10d41f8fb950535`。用户指出 2b3b6b3 未忠实还原，此表在本轮产品代码修改前写入。152 项是交互覆盖项，不是 152 个独立页面；以下按原 16 组逐一查源码。浏览器同内容同尺寸证据由主会话补充。冻结稿不修改。

| 组 | 已实现与必须保留 | 确认偏差 / 本轮实施 |
| --- | --- | --- |
| entry | 初空、取消回可见入口、交接由宿主关闭 | 搜索头 padding10/12、gap4；原稿16/18、gap10。移出 Input prefix，输入直接无边框，焦点只表达在整行1px底线 |
| recents | 12ID中的note，403/404过滤、401错误、部分失败重试 | 状态无图标、尺寸12px；按稿11px+18行高、加载/告警图标，未知账号真实说明 |
| input | trim2字、500上限、IME不误执行 | 组合提示/500计数错误放AI行；按稿独立组合条、counter条，正文输入14px/21行高 |
| query | queryKey隔离、原词retry、pending统一锁 | 加载/空/失败只有AI footer文字；按稿在列表中央140px反馈图标+标题+说明+重试，缓存刷新/失败独立inline条 |
| hits | 6chunk、顺序/原偏移、重复命中序号 | 标题13.5 vs13，path11.5 vs10、缺Folder，图标28 vs26、垂直居中、detail在top。按稿hit最小88、顶部对齐、snippet12/19、path10/16、bottom ChevronDown；计数加入section |
| selection | 稳定key、键鼠Tab一致、真实button | 选中底色派生token非原稿；focus1px vs2px、kbd合并上下箭头；按稿中性底、2px内焦点、独立kbd |
| new-note | guard→单飞→成功导航、失败保留draft、response-lost如实提示 | 创建pending/error混在列表末；按稿列表外pending/错误条，图标/左文案/右操作/帮助一致 |
| capture | 实际收集入口交接、保持现文档 | 仅搜索行样式同步；不重做收集模块弹窗，原稿明确handoff边界 |
| context | note/file能力正确，类型未读到不猜 | 状态在操作之后且无图标；按稿放操作前inline feedback |
| rename | 目标ID、IME、pending/失败草稿、刷新只读恢复 | 标题“重命名当前笔记”vs“重命名笔记”；缺当前笔记、标签新标题vs名称、按钮重命名vs保存，宽520 vs480。按稿480/24、上下文11px、label12、input13、helper层级 |
| move | 目录真实、pending/草稿、8秒Undo | 缺当前文档上下文；label目标目录vs移动到、目标vs所选目录；目录加载错误仍留Select。按稿读取反馈边框面板/重试、恢复后真实Select、完整路径 |
| find | >=2字执行、首个真实定位、无next/replace | 提交按钮未按>=2字禁用，缺当前笔记上下文；按稿门槛一致、helper文案一致 |
| open-hit | citation全部字段、guard、原定位算法 | 完整信息错误做成内联展开；按稿独立480px模态，title/path/full snippet/返回搜索/打开这处命中，底层暂停、退出只恢复搜索焦点 |
| ai | 独立动作、预填不发、保scope、guard | 计数+居中AI+重复说明代替原稿；按稿左Sparkles16+单条说明“只预填问题，不自动发送”，右动作+ArrowRight13 |
| guard | manual三选/auto双选/Office不可代存不变 | 已有共享guard是宿主边界，保持其真状态语义；详情层交接时移除自身但保留palette以支持取消guard |
| layout | 620/top14vh、窄/低高内部滚动 | 无list440上限；footer9px vs10px，字号11.5 vs10；阴影/深浮层/hover/AI色差。局部固定批准稿尺寸和色角色，不触碰foreign全局tokens；窄屏44px/390内无横溢 |

## 原稿色值与全局角色冲突

精确相同的文字/分隔线/焦点/错误色继续消费token。surface使用colorBgContainer（浅白/深#202225），不使用colorBgElevated（深#26282b）。批准稿专有角色集中为模块局部令牌：nav浅#f7f9f8/深#242629，hover浅#f4f5f5/深#303337，selected浅#eff0f0/深#34383c，field浅#e7e9e8/深#454b47。阴影浅0 12px 32px rgba(0,0,0,.16)，深0 16px 40px rgba(0,0,0,.36)。主会话同步局部合同例外；不改全局tokens或字号扫描守卫。

## 执行与证据

集中修正 CommandPalette / command-palette/*、DocumentCommandModal及必要回归。保持全局动作/保存/后端算法原合同。先相关组件回归、lint/AntD检查和类型，再由主会话同稿同内容桌面浅深/390/低高对照。真实文档标题/路径/片段来自API，不注入prototype假资料。完整信息动作及二层焦点、loading/empty/error结构由组件回归锁定；像素值由主会话真实浏览器computed/screenshot核查。

## 集中修正后的实现映射

| 组 | 已落实的产品证据 | 验证方式 / 保留边界 |
| --- | --- | --- |
| entry | `CommandPalette`独立Search图标/无边框Input、整行focus底线；取消有效入口回焦原合同保留 | 组件取消/交接回焦回归；主会话量输入区54px |
| recents | `RecentFeedback`图标、11px状态；`recent-documents`增加只读storageUnavailable，失败不再画成真空 | 最近12ID/授权/部分失败/401/坏存储/存储恢复回归；不改导航6篇规则 |
| input | `searchInput`14/21、组合条、500字符时独立计数 | IME/500/重开清空回归；真实操作系统选字仍需原生宿主 |
| query | `SearchFeedback`中心加载/空/失败与原词重试，缓存刷新独立行 | 可控promise回归含queryKey隔离与恢复焦点 |
| hits | section实际处数、13/20标题、12/19两行摘要、10/16 Folder路径、26px图标栏、右下详情入口 | 重复chunk顺序/引用字段回归；主会话computed实际尺寸已核对 |
| selection | 中性selected固定角色、2px焦点、两枚方向kbd | 稳定key增删/键鼠统一pending锁回归 |
| new-note | `NewNoteFeedback`list外错误和pending条；宿主createNoteRetryable明确区分确定失败与结果不明 | 单飞/等待/guard/失败草稿/不确定结果不显示快捷retry回归；不承诺POST幂等 |
| capture | 搜索行与焦点交接继续既有宿主路径 | 不替换下模块的完整收集流程 |
| context | `CommandFeedback`在操作前，图标+真实loading/error重试 | note/file/加载未知/错误能力回归 |
| rename | host480/24、当前笔记、名称/保存、pending保存中文字、字段13/1.75、失败草稿保留 | 原IME/文档ID/单飞/刷新仅GET回归；关闭中文按钮自动插空格 |
| move | 同一host、当前文档、移动到、所选目录；目录读取状态替换不可用Select；实际AntD6 root字段样式 | 目录等待/错误/重试/保留路径回归；原8秒Undo逻辑未改 |
| find | 同一host、当前笔记、原稿helper、按钮与执行均>=2 | IME/不足2字/未匹配/成功文档ID回归；不加next/replace |
| open-hit | `ResultDetail`独立480px完整信息层，标题/path/full snippet、返回/打开两动作，底层inert暂停 | 新组件回归：双dialog、完整文本纯文本、返回搜索焦点、原Citation交给host、guard取消保留query |
| ai | 左Sparkles16+单条只预填说明；右动作+ArrowRight13；AntD link border归零 | 显式AI/无结果Enter不默认AI回归；主会话核对47.39px高度 |
| guard | 既有宿主守卫协议不改；底层Palette在interactionSuspended时暂停焦点陷阱 | AppShell取消/保存/新建/AI回归；Office不能代存边界保留 |
| layout | 620/6、list max440、fixed approved局部色/尺寸；窄屏44目标、14vh顶部、48px底留白、极低高度12px回退 | 主会话统一桌面浅深/390/低高截图和computed，产品无prototype假资料；AntD窄屏8px外边距由独立checker校准 |

### 本代理检查

- `pnpm --filter @mimir/renderer exec vitest run src/components/CommandPalette.test.tsx src/components/document/DocumentCommandModal.test.tsx src/components/DocumentPanel.commands.test.tsx src/routes/-app-shell.test.tsx src/lib/recent-documents.test.ts src/components/nav/RecentNotes.test.tsx`：6文件40项通过。
- Renderer `tsc --noEmit`：通过；目标文件oxlint/oxfmt、AntD扫描及样式反引号门见主会话最终合并记录。
- 独立HTML SHA256仍为冻结值。源码布局核对与组件测试不能代替真实浏览器像素比对；实际截图/计算样式由主会话统一保存在verification/parity/。
- 没有修改搜索API、排序/分块/引用定位、Office引擎、global tokens或冻结原型。准确语义字段/服务端路径保持真实，原稿host mock不注入产品数据。
