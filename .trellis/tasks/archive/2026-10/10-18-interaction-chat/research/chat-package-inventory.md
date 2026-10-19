# Research: packages/chat 交互与源码完整盘点

- Query: 第七模块对话与 Agent 的实际可见入口、状态、恢复及宿主/原生边界，作为 HTML 当前/打磨后对比稿依据。
- Scope: internal（外部 WeKnora 固定版本核验由本任务独立外部调研承担，见同目录外部参考成果；不把依赖 README 当互联网调研）。
- Date: 2026-10-18
- Deliverable: `chat-package-inventory.json`，**46 组 / 250 个源码状态 / 44 个包文件**。这是规划覆盖清单，不是 250 次 GUI 验证，也不代表测试已运行。

## Findings

### 范围及公开合同

`ChatPanel` 为主对话和文档侧栏共用的真实运行时。包只接受宿主数据 `composerStatus` 和动作 `ChatIo`，不 import renderer 路由/查询。`types.ts:100` 的 conversationId 需以宿主 key 切换历史；自己新建的真实 ID 回推不能重挂切断流。`ChatPanel.tsx:51` 使用 `documentAgent ?? docxAgent`，兼容旧 DOCX，但图文草稿的只读 `draftAgent` 不能成为执行工具桥。

主空态居中“向知识库提问”或“针对本文提问”；侧栏空态是宿主指南、固定底部输入和快捷问。主对话保留标准/深入；**侧栏隐藏思考强度并强制标准发送**。模型菜单只展示全局两绑定，名称后有当前勾选，两个项均 disabled；**只有“管理模型”可点击**，没有会话级切换。

本轮可调整视觉层级、留白、控件几何、对齐、focus 和微反馈。不能借打磨创造文件上传、低中高 effort、模型独立切换、Agent审批、停止后继续生成等业务能力。生成中输入可编辑，Enter 进入队列，鼠标同一键位仍是停止。

### 稳定分组索引

每个分组 JSON 都有 `id/title/source[]/entry/states[]/controls[]/transitions[]/boundary`，每个状态有稳定 `CHAT-xxx.slug`、中文标签和该分支独有描述。对比稿应使用这些 ID，后续新增只递增，避免实现验收丢失对应。

| 分组 | 内容 |
|---|---|
| CHAT-001–004 | 主空态、侧栏指南、一次消费草稿、历史加载/空/异常边界 |
| CHAT-005–008 | 消息顺序/动作门控、滚动回底、输入键盘、发送/建会话 |
| CHAT-009–013 | 范围加载/失败重试/空、选篇标签、强度、只读模型绑定、真实用量 |
| CHAT-014–015 | 多项队列只露首条、取回/自动派发、停止/部分输出 |
| CHAT-016–020 | 检索过程、模型思考、流式 Markdown、代码复制、工具消息 |
| CHAT-021–023 | 原文引用、保存/打开笔记、回答复制（含检索结果） |
| CHAT-024–029 | 四类模型失败、连接中断、历史失败重试与上一问定位 |
| CHAT-030–033 | URL来源pill、文件chip/下载、图片、音频退化chip |
| CHAT-034–040 | Agent执行/停止、缓存结果续传、原媒体选择、部分草稿、回退、新文档交接 |
| CHAT-041 | 历史Agent状态、打开原文档、取消未处理工具及错误 |
| CHAT-042–045 | PNG草稿预览/移除、发送目标校验、排队取回、失败重试与错误隔离 |
| CHAT-046 | 跨格式共用桥的真实工具/媒体原件/创建导出错误，不展开Office专用工具栏 |

### 保留真实语义的重点

1. **发送/停止统一入口**：`composer/Composer.tsx:315` Input 的 `submitMode=enter`、`cancelOnEscape=false`；非 composing Enter 先 guard，Shift+Enter 换行；非 composing Escape 只在 canCancel 时停止。`Composer.tsx:424` 只有 Send/Cancel 之一，无两颗常驻按钮。
2. **本轮范围不等于通用上传器**：`ComposerMenus.tsx:129` 仅列最近 20 篇。加载 `加载中…`、失败可点 `读取失败，点此重试`、空 `知识库还没有文档` 三分支不能合并。选篇可移除回全库。
3. **容量数字来自真实用量**：`ComposerMenus.tsx:279`，无 totalTokens 不显示按钮，不用 0 代替未知。只展示最近一次请求模型、输入、输出和合计，不发明容量比例。
4. **排队保留冻结设置**：`Composer.tsx:278` 将范围/强度放 runConfig；`use-mimir-runtime.ts:229` 停止/错误/取回恢复文字和 PNG 后移除 queue[0]。UI仅首条，不添加队列排序/全部清空。普通显式取回 `setText` 会覆盖现输入；**派发截图拒绝时的新草稿保护**是另一个特定分支，不能混为一谈。
5. **消息顺序显式**：`MessageItem.tsx:149` 过程→正文/其他parts→Agent摘要→引用→失败/中断→停止→动作。不要 CSS order 造成 Markdown 外边距折叠变化。
6. **停止与失败区分 reason**：`MessageItem.tsx:220` 仅 incomplete/cancelled 显示停止，error 走错误。failure 和 incomplete 都不给成功保存/复制。0 parts 助手仅运行中最后一条显示检索占位，停止后无空气泡。
7. **保存/复制门控**：`AnswerActions.tsx:147` 要非空正文、非running、activeId；父层还要消息列最后一条且Agent非pending/failed/cancelled。保存按宿主 `saveAsNote` 幂等；成功才变“打开笔记”，失败恢复可点。只检索复制 citation snippet 和来源链接，不复制占位句或data JSON。
8. **四类失败出路是能力清单**：quota 可用只检索；timeout 可用重试/只检索；truncated 可用只检索；offline 可用只检索/重试。换模型、充值、缩小当前文档、接着生成、只要结论仍真实 disabled，Tooltip 为“暂不可用”。不能把这些禁用项画成可用。
9. **工具续传绝不重跑画布工具**：`DocxInterruptBridge.tsx:707` 检查文档/格式/中断集/轮次/画布版本，然后重送缓存 responses。后台原子消费仍可能拒绝重复。UI loading 和 disabled=running 必须保留。
10. **停止不撤销也不保存**：`DocxInterruptBridge.tsx:675` 中止工具并告知画布上修改仍未保存；有流式草稿则保留/丢弃选择。回退本轮仍经 `undoRound` 安全校验，后续人工修改时应拒绝。
11. **媒体选择真实边界**：`DocxInterruptBridge.tsx:764` Upload 只是交给本轮工具，不展示通用上传列表；原生选择取消无事件回调，仍待用户“停止工具”。原件媒体分析与写入执行器隔离，过期/取消结果不落画布。
12. **截图仅内存**：`pptx-snapshot.ts:4` registry 最多 4 份，保护排队/在途；目标严格核源寿命、文档、页路径、页索引、版本；真实 PNG ≤5MiB、≤1280×1920、像素总数≤2457600。缺视觉/模型或 scope=search 不能丢图降级。关闭提示不绕过下次校验，移除截图不能清其他传输错误。

### 当前几何与样式证据（对比稿当前列）

| 面 | 当前源码事实 | 锚点 |
|---|---|---|
| 主内容 | 内容最大850，默认gutter40；宿主可覆写 | `ChatPanel.style.ts:34`, `:146` |
| 消息 | gap36；用户 max min(85%,620)，padding11×15，正文14/1.7；助手14/1.8 | `ChatPanel.style.ts:159` |
| 回底 | 40×40圆钮居中，bottom10；贴底visibility:hidden | `ChatPanel.style.ts:86` |
| 输入 | 1px colorBorderSecondary，10px内边距，focus-within变colorPrimaryBorder，默认阴影boxShadowTertiary | `Composer.tsx:74` |
| 发送 | 32×32、borderRadiusSM、主色、focus细环；禁用opacity.4 | `Composer.tsx:162` |
| 底栏 | flex-wrap，gap6×10，左右组也wrap | `Composer.tsx:124` |
| 范围 | Tag最大160，文字125，移除图标保留 | `Composer.tsx:145` |
| 模型 | 名称136截断，菜单最大min(240,100vw-96)，勾选flex:none | `ComposerMenus.tsx:84` |
| 范围触发 | min-height30、hover/focus浅底、active scale(.96) | `ComposerMenus.tsx:40` |
| 回答动作 | 24×24；active scale(.9)；保存禁用无spinner；复制成功2秒 | `AnswerActions.tsx:69`, `:130` |
| 检索过程 | fit-content，填充色，padding2×9，note字号，展开max256 | `TraceActivity.tsx:35` |
| 模型思考 | 完整描边盒padding8×12，trigger max-width75%，body字号，active scale(.98) | `reasoning-shell.tsx:26` |
| 工具调用 | 默认收起，Running/Used/Failed tool英文标签，pre max240 | `ToolCallPart.tsx:220` |
| 引用 | 通栏按钮padding8×10，透明底hover，2px内焦点环，摘要2行 | `CitationList.tsx:108` |
| 附件 | 图max320、文件名max320；截图max96×64 | `MediaParts.tsx:104`, `:137`, `PptxSnapshotAttachment.tsx:21` |

“将所有 hover/focus/pressed 做成固定几何”是提案目标，当前存在若干 scale；**不要**用提案理想样式覆盖当前列。配色取宿主token和局部主题语义；不能根据包的回退字号猜renderer实际字号。浅深主题/窄屏/键盘应在原型壳统一可切，但原生IME、剪贴板、下载、系统选择器仍明示边界。

### 已读规范

- `.trellis/workflow.md`：本轮规划，不启动实施、不改产品。
- `.trellis/spec/project/rules.md`：范围约束、React Compiler、文档职责。
- `.trellis/spec/chat/frontend/index.md`、`conventions.md`、`pitfalls.md`：包内运行时、两宿主、模型只读/侧栏强度、消息parts、队列归还、续轮补丁、截图来源寿命。
- `.trellis/spec/shared/contract/document-agent.md`：库级对话只读；已鉴权文档能力与当前画布才允许写；工具冻结版本、续轮原子消费、停止不保存、媒体/新文件边界。
- `.trellis/spec/shared/contract/docx-agent.md`：DOCX兼容入口、工具中断/续轮、版本变化拒绝、安全回退、历史只存摘要。

### 文件全清单与职责

| 文件（packages/chat/ 下） | 职责/主分组 |
|---|---|
| `package.json` | 实际依赖版本、test/typecheck脚本 |
| `src/index.ts` | 公开 ChatPanel/ChatHostVars/types，未暴露内部部件 |
| `src/types.ts` | ChatDraft/PNG目标/只读draftAgent/执行Agent/宿主Props |
| `src/custom-token.d.ts` | 宿主surfaceContent、tint、inlineCode token类型 |
| `src/ChatHostVars.tsx` | 宿主传字体阶梯和gutter，包内不新建主题 |
| `src/ChatPanel.tsx` | 两宿主、草稿一次消费、scope/strength、滚动、运行时组装（001–008） |
| `src/ChatPanel.style.ts` | 列宽、消息排版、空态、骨架、回底、停止 |
| `src/ChatThread.tsx` | 先loading再empty再消息，三态互斥（004–005） |
| `src/EmptyStage.tsx` | 全库/本文空态中文（001） |
| `src/composer/Composer.tsx` | 输入/键盘/队列/附件、send/cancel（007–015,042–045） |
| `src/composer/ComposerMenus.tsx` | 范围三态、强度、只读模型菜单、用量（009–013） |
| `src/hooks/use-scrolled.ts` | 滚动捕获与data-scrolled边界（006） |
| `src/parts/MessageItem.tsx` | 显式顺序、所有parts挂号、空助手/错误/动作门控（005,015,024–029） |
| `src/parts/TraceActivity.tsx` | 服务端检索过程与独立秒钟（016） |
| `src/parts/reasoning-shell.tsx` | 模型思考的外壳与独立秒钟（017） |
| `src/parts/ReasoningPart.tsx` | 思考流live跟随/用户开合（017） |
| `src/parts/MarkdownPart.tsx` | 流式Markdown扩展+代码pre（018） |
| `src/parts/CodeBlock.tsx` | 纯文本提取/语言头/复制（019） |
| `src/parts/CodeBlock.style.ts` | 代码头与pre接缝、图标同格交换（019） |
| `src/parts/ToolCallPart.tsx` | 工具fallback、Args/Result/状态/耗时（020） |
| `src/parts/CitationList.tsx` | 摘要去Markdown、原Citation跳转（021） |
| `src/parts/AnswerActions.tsx` | 保存、打开笔记、复制回答/只检索原文（022–023） |
| `src/parts/FailureNotice.tsx` | 四类能力化失败出路与连接中断（024–028） |
| `src/parts/StoppedNotice.tsx` | 主动停止中性提示（015） |
| `src/parts/MediaParts.tsx` | source/file/image/audio parts（030–033） |
| `src/parts/DocxAgentHistoryNotice.tsx` | 仅状态摘要、打开/取消待处理（041） |
| `src/parts/PptxSnapshotAttachment.tsx` | composer可移除/message只读PNG（042） |
| `src/parts/data-parts.ts` | trace/citation/failure/通用与旧DOCX agent读取 |
| `src/runtime/use-mimir-runtime.ts` | 唯一引擎入口、队列、截图、ask/stop/refill（008–015,029,042–045） |
| `src/runtime/agent.ts` | 真实会话ID、每轮冻结与实际HTTP边界重验（008,034,044） |
| `src/runtime/chat-context.tsx` | 包内动作、上一问/对应截图查找（029） |
| `src/runtime/history.ts` | 持久message→data+text同形；无客户端重复写库（004,041） |
| `src/runtime/DocxInterruptBridge.tsx` | 跨格式执行/取消/续传/媒体/草稿/回退/新文件（034–040,046） |
| `src/runtime/pptx-snapshot.ts` | 有界PNGregistry、真实性/来源目标校验（043–045） |
| `src/ChatPanel.test.tsx` | 真HTTP/SSE集成（见下）；此次未运行 |
| `src/parts/parts.test.tsx` | 展示件/Markdown/所有AG-UI part静态契约 |
| `src/runtime/history.test.ts` | 转换/空/不存在/摘要/仓库往返 |
| `src/runtime/DocxInterruptBridge.test.ts` | 冻结版本、流式草稿、取消、原件媒体、跨格式创建导出 |
| `src/runtime/agent-media.check.test.ts` | 停止时丢弃迟到媒体结果、不落写执行器 |
| `src/runtime/pptx-snapshot.test.ts` | document/page/version/bytes绑定、有界保护与对应用户截图 |
| `src/test-dom.ts` | happy-dom观测器/rAF/matchMedia/act垫片 |
| `vitest.config.ts` | 测试环境/同源配置 |
| `tsconfig.json` | 类型检查配置 |

### 测试证据位置（只读检查，未执行）

- `ChatPanel.test.tsx:315` 侧栏强度隐藏、主视图强度、只读模型绑定、同名/缺失、隐藏后标准。
- `:507` 通用格式工具真实HTTP续轮；`:714` 等SSE结束再执行；`:802` DOCX只执行一次和raw结果续轮；`:912` 同批后续过期写拒绝。
- `:1015` 重新加载待处理历史；`:1076` 排队时选区冻结；`:1156` 搜索/文档草稿一次消费不覆盖。
- `:1231` 检索真实整轮耗时与live；`:1293` 停止返队列；`:1331` 停止提示无动作；`:1364` 失败不伪停止；`:1406` 思考/工具帧都渲染。
- `:1486` 截图移除不清连接错误、无模型仍可改、不降级、真实PNG发送、过期点击/Enter不发；`:1654` 停止/取回图文目标、自动派发实际HTTP路由、过期保护新草稿；`:1827` 失败重试带图、只检索不得吞图。
- `parts/parts.test.tsx:22` Trace、`:71` citation去标记/通道、`:122` 复制检索结果、`:146` 失败禁用能力、`:185` 流式半截Markdown、`:236` reasoning/tool/source/file/image。
- `runtime/DocxInterruptBridge.test.ts:17` 图片下载/生成冻结版本；`:96` 流式草稿；`:208` 跨格式新文件/工作表导出/创建后停止；`:307` 图片比例校验；`:342` PPTX原附件名和来源；`:384` 原音视频分析。
- `runtime/agent-media.check.test.ts:38` 停止读取不派发；`:60` 停止后迟到分析不写。
- `runtime/pptx-snapshot.test.ts:27` 精确目标；`:42` 4份保护；`:59` 字节不符拒绝恢复；`:75` 只找对应失败上一问截图。

### External references / versions

本包当前锁定声明：`@assistant-ui/react` **0.15.28**、`@assistant-ui/react-ag-ui` **0.0.68**、`@ag-ui/client` **0.0.59**、`@tanstack/markdown` **0.0.13**（`package.json:23` 起）。这些是项目已用技术事实，不等价外部最新版本。AG-UI 0.0.68 的中断恢复有项目补丁；更换版本不能默认为无行为差异。

WeKnora 官网与公开仓库固定版本证据由本任务外部研究独立文件负责。对本盘点的适用判断：可以借其 Agent 过程/来源解释、问题输入与结果层级做视觉参考；不能把它的模型选择、工具能力或权限语义直接移植到 Mimir。Mimir 两只读全局绑定、库级只读、当前画布版本、只检索恢复、PNG有界草稿均由上述源码/规范决定。

## Caveats / Not Found

1. **注释不是行为**。`TraceActivity.tsx:23` / `MessageItem.tsx:156` 说正文一出收起，实际 `MessageItem.tsx:158` 传 `expanded={running}`，所以run结束才跟随收起。模型思考用了 `reasoning-shell`，检索过程已自有轻填充样式，二者注释“同皮”也不是完全相同CSS。
2. **历史思考提示和真实发送不完全一致**。失败卡提示“重试将使用标准模式”（`FailureNotice.tsx:195`附近），但 `use-mimir-runtime.ts:345` 的ask读取composer当前runConfig，用户当下选深入会继续带深入。sentHere仅api.ask置true，普通发送路径未显式更新。对比稿须区分真实当前行为与提案修正，实施前主任务明确取舍。
3. **只检索范围现状**。`MessageItem.tsx:198` 通过 `askOptionsFor(failure.kind,null)` 在只检索路径显式传 `documentId=null`；不能写成“保留原单篇”已有行为。`ask`会写composer runConfig，后续scope覆盖时机应在实施真实请求检查。
4. **零parts错误卡**。`MessageItem.tsx:140` 空助手非running就null，所以不是所有创建/HTTP异常都一定可见连接中断卡。历史load异常也没有包内重试UI；这两点应由宿主方案与真实UI实测确认，不能用原型掩盖。
5. **复制两套错误反馈不同**。回答复制失败toast；代码复制失败catch空（`CodeBlock.tsx:105`），且代码按钮当前没有专门focus-visible样式，仅浏览器默认焦点。若精修增加显式错误/焦点，要把新增状态画在打磨列。
6. **当前边界未完善的面**。图片没有onError恢复/骨架；ImagePart只max320无max100%，文件名也max320，极窄栏是否挤压需实际GUI。Agent桥状态区域目前无专门样式、位于正文面板之前；部分草稿提交/回退无loading防重入专门UI。
7. 本轮未运行测试、未改产品/规范/任务元数据、未执行真实模型/创建/保存/下载/媒体/系统IME。机器清单的状态数不可当成浏览器验收数。
