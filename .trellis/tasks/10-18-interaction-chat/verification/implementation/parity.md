# v7 产品交互实现对照账本

2026-10-19。依据冻结v7、源盘点与实际产品代码。71组/379态和24附件态仅为**来源覆盖引用**，不是403条GUI通过数。机器版 `parity.json` 显式列出每个stateId；本表逐组给出代码与测试位置。测试文件的存在不表示其中每个来源状态都有独立断言；无专项测试、视觉/原生环境边界逐项注明。测试名使用可搜索片段。

## 证据层级

- 本审核者实际执行：chat7文件84/84、tsc、lint0/0；renderer宿主回归4文件9/9、tsc及lint通过；provider31/31及tsc；server model/stream11/11（之后后端改动的全套由主会话统一跑）；miniapp8/8+tsc+编译与产物检查。详见 `independent-review.md`。
- 后端所有者独立报告附件/model/stream33/33、Agent12/12；这属于实现者证据，不冒称审核者重复执行。
- 真实浏览器主/侧栏、浅/深、窄容器、hover边界与原生输入/文件/剪贴板由主会话单独记录。此账本**没有GUI全量验收结论**，冻结HTML的生成/哈希检查也不等于产品GUI通过。
- 旧source文案保留历史：CHAT-011/012与HOST-012/014按v6/v7批准的供应商分组/实际等级/主侧栏一致替换；CHAT-016按明确要求退役trace。这些不能照旧角色盘点回退实现。

## 71组产品来源

缩写 `chat:`=`packages/chat/src/`；`renderer:`=`packages/renderer/src/`；`backend:`=`apps/server/src/test/`；`provider:`=`plugins/provider/src/`。每组默认路径由“实现根”给出，跨包项显式前缀。

| ID/名称（来源态数） | 处置 | 实现根与代码 | 测试证据/待验边界 |
| --- | --- | --- | --- |
| CHAT-001 主对话空态 (4) | 保留 | `packages/chat/src/` ChatPanel.tsx; EmptyStage.tsx | ChatPanel.test.tsx: 从搜索带来的纯文本草稿预填输入框；主空态/单篇文案；短高几何待GUI |
| CHAT-002 文档侧栏指南与快捷问 (5) | 修订 | `packages/chat/src/` ChatPanel.tsx; renderer:DocChatGuide.tsx | renderer:DocChatGuide.test.tsx；快捷直接发送保留；侧栏模型/等级按v6/v7不再隐藏 |
| CHAT-003 宿主草稿一次消费与范围 (5) | 保留 | `packages/chat/src/` ChatPanel.tsx:applyIncomingDraft | ChatPanel.test.tsx: 已挂载时消费新草稿一次；同对象不覆盖编辑；新对象一次消费 |
| CHAT-004 历史加载与适配 (5) | 保留 | `packages/chat/src/` ChatThread.tsx; runtime/history.ts | runtime/history.test.ts: loads an empty new conversation；骨架、错误重试、新会话分支 |
| CHAT-005 消息列与回复动作门控 (6) | 保留 | `packages/chat/src/` parts/MessageItem.tsx | ChatPanel.test.tsx: 失败轮不显示; 首 token 前；成功/失败/停止动作互斥，canonical可存门控 |
| CHAT-006 消息滚动与回到底部 (5) | 保留 | `packages/chat/src/` ChatPanel.tsx:scroll/pinned; ChatPanel.style.ts | 无独立贴底几何测试，待GUI；离底不追滚；回底按钮；焦点样式 |
| CHAT-007 输入框编辑与键盘 (8) | 保留 | `packages/chat/src/` composer/Composer.tsx:onKeyDown/onComposition | ChatPanel.test.tsx: 画布版本已变时点击和Enter都不发送；Enter/Shift+Enter/IME229/Escape实现；原生IME待实机 |
| CHAT-008 发送与建会话 (6) | 保留 | `packages/chat/src/` runtime/transport.ts:ensureConversation; runtime/use-mimir-runtime.ts:dispatch | ChatPanel.test.tsx: 缺终态的完整 SSE; backend:chat-model-selection.test.ts；先建真实ID，固定URL，before-await冻结；迟到onCreated受live守卫 |
| CHAT-009 本轮范围下拉 (7) | 保留 | `packages/chat/src/` composer/ComposerMenus.tsx | ChatPanel.test.tsx: 主对话和侧栏共用模型、实际等级与范围控件；范围loading/error/empty/选项/键盘菜单 |
| CHAT-010 单篇范围标签与替换 (5) | 保留 | `packages/chat/src/` composer/ComposerMenus.tsx; runtime/use-mimir-runtime.ts:capture | ChatPanel.test.tsx: 第二问入队时冻结选区；单篇/全部、长标题和逐队列项冻结 |
| CHAT-011 主对话思考强度 (5) | 批准替换 | `packages/chat/src/` composer/ComposerMenus.tsx; runtime/model-settings.ts | ChatPanel.test.tsx: 供应商分组可切换模型；旧标准/深入及侧栏隐藏被实际模型支持等级替代 |
| CHAT-012 全局模型绑定只读菜单 (7) | 批准替换 | `packages/chat/src/` composer/ComposerMenus.tsx; provider:chat-models.ts | ChatPanel.test.tsx: 快捷提问发送实际模型与等级; provider:chat-models.test.ts；按供应商实例分组、providerId+modelId；未知能力如实显示 |
| CHAT-013 上下文容量 (5) | 保留 | `packages/chat/src/` composer/ComposerMenus.tsx:ContextUsageChip | 无新增独立容量交互测试，待GUI；真实计账、未知值、展开用量，不伪造侧栏容量 |
| CHAT-014 生成中追问队列 (6) | 保留 | `packages/chat/src/` runtime/use-mimir-runtime.ts:capture/updateQueue/restoreQueued | ChatPanel.test.tsx: 停止之后排队的那条; HTTP失败排队回归；Mimir一条FIFO；只归还首项，不覆盖新稿 |
| CHAT-015 停止生成 (5) | 保留 | `packages/chat/src/` runtime/use-mimir-runtime.ts:stop; parts/StoppedNotice.tsx | ChatPanel.test.tsx: 点停止; 停止在途截图后恢复；部分内容保留；停止与失败区分；停止click阻止默认submit，真实DOM回归断言队首只回填不发送 |
| CHAT-016 检索过程折叠 (7) | 批准删除 | `packages/chat/src/` runtime/history.ts; runtime/use-mimir-runtime.ts:observe | ChatPanel.test.tsx: 忽略旧 trace，成功正文和引用保留；旧检索过程/统计不再生产消费；未换成伪思考条 |
| CHAT-017 模型思考折叠 (5) | 保留 | `packages/chat/src/` parts/ReasoningPart.tsx; parts/MessageItem.tsx | parts/parts.test.tsx: reasoning; runtime/history.test.ts: round-trips real reasoning；真实thinking/reasoning帧，live展开、手动接管、长内容滚动 |
| CHAT-018 流式Markdown与正文长内容 (5) | 保留 | `packages/chat/src/` parts/MarkdownPart.tsx; parts/CodeBlock.tsx | parts/parts.test.tsx: 渲染 markdown; 流式半截; 半截的代码块；TanStack Markdown，自有code组件；长内容待GUI |
| CHAT-019 代码块复制 (5) | 保留 | `packages/chat/src/` parts/CodeBlock.tsx:CodeBar/plainTextOf | parts/parts.test.tsx: 渲染 markdown，代码块带上语言与复制按钮；成功2秒回位；失败提示；非纯文本退化；系统剪贴板待GUI |
| CHAT-020 工具调用消息折叠 (6) | 保留 | `packages/chat/src/` parts/ToolCallPart.tsx; parts/MessageItem.tsx | parts/parts.test.tsx: tool-call; a complete native error payload; pending call in stopped run；native输入状态、ok:false/error、停止取消真实映射；纯工具parentMessageId绑定sidecar，双轮来源及终态隔离回归 |
| CHAT-021 引用来源与原文跳转 (6) | 保留 | `packages/chat/src/` parts/CitationList.tsx | parts/parts.test.tsx: 命中通道翻成中文; 引用摘要展示 Markdown；原文定位交宿主；空数组无占位；hover/focus待GUI |
| CHAT-022 回答存成笔记 (6) | 保留且纠错 | `packages/chat/src/` parts/AnswerActions.tsx; runtime/use-mimir-runtime.ts:saveAsNote | renderer:chat-save-note.test.ts: saves the canonical visible branch answer；可见回答canonical ID，按消息保存；错误toast；打开笔记 |
| CHAT-023 复制回答与检索结果 (5) | 保留 | `packages/chat/src/` parts/AnswerActions.tsx:copyAnswerText | parts/parts.test.tsx: 只检索结果复制原文与来源链接; 普通模型回答；普通正文复制与只检索原文+链接语义分开 |
| CHAT-024 模型请求受限失败卡 (5) | 保留 | `packages/chat/src/` parts/FailureNotice.tsx:FAILURE_UI.quota | parts/parts.test.tsx: 每类失败的出路不同；可用检索出路；未实现出口真disabled；附件/Agent不错误降级 |
| CHAT-025 请求超时失败卡 (5) | 保留 | `packages/chat/src/` parts/FailureNotice.tsx:FAILURE_UI.timeout | parts/parts.test.tsx: 每类失败的出路不同；真实重试/只检索；缩小范围仍按批准边界disabled |
| CHAT-026 回答被截断失败卡 (5) | 保留 | `packages/chat/src/` parts/FailureNotice.tsx:FAILURE_UI.truncated | parts/parts.test.tsx: 每类失败的出路不同；部分回答可读；未接续写不假成功 |
| CHAT-027 网络不可达失败卡 (4) | 保留 | `packages/chat/src/` parts/FailureNotice.tsx:FAILURE_UI.offline | parts/parts.test.tsx: 每类失败的出路不同；重试/只检索；不声称附件支持search-only |
| CHAT-028 连接中断恢复 (5) | 保留 | `packages/chat/src/` parts/FailureNotice.tsx:StreamErrorCard; runtime/transport.ts | ChatPanel.test.tsx: 缺终态的完整 SSE; 停止之后排队的那条；网络失败保留原意图、队列先取回；零内容占位 |
| CHAT-029 历史重试与上一问定位 (5) | 保留且纠错 | `packages/chat/src/` runtime/use-mimir-runtime.ts:intentFor/retryTurn/branchFrom | ChatPanel.test.tsx: 编辑历史问题使用原分支前缀；当前/历史意图分开；历史Agent及user-only来源禁止普通重试；无工具历史身份由服务端可信标记保留 |
| CHAT-030 AG-UI 来源pill (4) | 兼容部件 | `packages/chat/src/` parts/MediaParts.tsx:SourcePart | parts/parts.test.tsx: source；HTTP(S)URL来源pill保留直接部件；AGUI无统一SOURCE事件，不把部件测试冒充服务端生产 |
| CHAT-031 文件附件chip (4) | 保留 | `packages/chat/src/` parts/MediaParts.tsx:FilePart/safeFileHref; composer/Composer.tsx:AttachmentTile | parts/parts.test.tsx: file; backend:chat-attachments.test.ts；协议document与受保护真实附件分开；危险scheme不提供下载 |
| CHAT-032 图片part原图链接 (4) | 保留 | `packages/chat/src/` parts/MediaParts.tsx:ImagePart/ImageDialog | parts/parts.test.tsx: image；预览/Escape/关闭回焦/损坏提示；GUI尺寸与原图实读待验 |
| CHAT-033 音频part与MIME图标 (3) | 协议兼容 | `packages/chat/src/` parts/MessageItem.tsx:NativePart; parts/MediaParts.tsx:renderMimeIcon | 无新增真实音频上传回归；协议路径源码核对；native audio/video用原生播放器；通用上传不含音视频，勿声称转录 |
| CHAT-034 Agent执行与续轮进度 (6) | 保留 | `packages/chat/src/` runtime/DocxInterruptBridge.tsx; runtime/use-mimir-runtime.ts:submit | ChatPanel.test.tsx: 等中断流彻底结束; 工具只执行一次；执行/缓存续传/无效轮/去重；不新增通用审批后端 |
| CHAT-035 Agent停止与已改画布 (5) | 保留 | `packages/chat/src/` runtime/DocxInterruptBridge.tsx:cancel; runtime/use-mimir-runtime.ts:stop | ChatPanel.test.tsx: 点停止; runtime/agent-media.check.test.ts；终止在途；已改画布保留真实dirty；切文档拒迟到 |
| CHAT-036 工具结果续传失败与安全重试 (6) | 保留 | `packages/chat/src/` runtime/DocxInterruptBridge.tsx:retrySubmission | ChatPanel.test.tsx: 工具只执行一次并用 raw result 续轮；只重送cached responses到原target；成功false视失败；不再执行工具 |
| CHAT-037 Agent媒体选择与分析 (7) | 保留 | `packages/chat/src/` runtime/DocxInterruptBridge.tsx:requestMediaSource/executeBridgeTool | runtime/agent-media.check.test.ts; runtime/DocxInterruptBridge.test.ts；本地选择、取消、abort与目标版本；原生选择/解码待平台GUI |
| CHAT-038 中断写作的部分草稿 (5) | 保留 | `packages/chat/src/` runtime/DocxInterruptBridge.tsx:commitInterruptedDraft | runtime/DocxInterruptBridge.test.ts: 流式失败时保留画布草稿；保留/丢弃明确，守卫版本，已保留与回退互斥 |
| CHAT-039 回退本轮画布修改 (4) | 保留 | `packages/chat/src/` runtime/DocxInterruptBridge.tsx:undoValidatedRound | runtime/DocxInterruptBridge.test.ts; 原有守卫源码；后续人工编辑时拒绝unsafe undo；画布集成待各Office格式验收 |
| CHAT-040 Agent创建新文档交接 (6) | 保留 | `packages/chat/src/` runtime/DocxInterruptBridge.tsx:createdDocId/autoOpenedRef | runtime/DocxInterruptBridge.test.ts: does not navigate after cancellation；创建真实文档后交接；失败/停止不伪造自动打开 |
| CHAT-041 Agent历史中断摘要 (7) | 保留 | `packages/chat/src/` parts/DocxAgentHistoryNotice.tsx; runtime/history.ts | ChatPanel.test.tsx: 重载后显示待处理工具；pending/open/cancel/status保留；工具元数据来自真实历史 |
| CHAT-042 PPTX截图草稿与消息附件 (5) | 保留 | `packages/chat/src/` composer/Composer.tsx; parts/MessageItem.tsx; runtime/pptx-snapshot.ts | ChatPanel.test.tsx: 无模型仍可预览; 显式发送真实PNG；草稿/移除/已发截图为真实PNG；非截图attachment独立 |
| CHAT-043 截图发送校验与错误 (7) | 保留 | `packages/chat/src/` runtime/pptx-snapshot.ts:assertSnapshotTarget; runtime/use-mimir-runtime.ts | runtime/pptx-snapshot.test.ts; ChatPanel.test.tsx: 替换了原件来源；真实来源/文档/页path/index/version/bytes/视觉校验；不默降级 |
| CHAT-044 截图排队/取回与派发 (6) | 保留 | `packages/chat/src/` runtime/use-mimir-runtime.ts:capture/restoreQueued; runtime/pptx-snapshot.ts | ChatPanel.test.tsx: 第二问入队; runtime/pptx-snapshot.test.ts；入队冻结、派发再验；有新稿不覆盖；篡改拒绝 |
| CHAT-045 截图失败重试与附件错误隔离 (6) | 保留 | `packages/chat/src/` runtime/use-mimir-runtime.ts:retryTurn/refillTurn/applySnapshotDraft | ChatPanel.test.tsx: 移除截图不清除; 停止在途截图后恢复；图文原目标恢复；专用图错误与transport错误隔离 |
| CHAT-046 Agent跨格式工具与媒体原件错误 (7) | 保留 | `packages/chat/src/` runtime/DocxInterruptBridge.tsx:executeBridgeTool; renderer:chat-io.ts | runtime/DocxInterruptBridge.test.ts: original PPTX; original audio/video; exports worksheet；各格式执行器/受控媒体IO；不扩展Office功能和通用音视频附件 |
| HOST-001 主对话新建入口与聚焦 (4) | 保留 | `packages/renderer/src/` routes/_app.chat.tsx; components/NavSidebar.tsx | chat:ChatPanel.test.tsx: 从搜索带来的纯文本草稿；新建聚焦、已有会话不强聚焦 |
| HOST-002 新会话真实ID建立与流保留 (4) | 保留 | `packages/renderer/src/` routes/_app.chat.tsx:ownedId/panelKey; lib/chat-io.ts | chat:ChatPanel.test.tsx; backend:chat-model-selection.test.ts；真实ID写URL不重挂载；unmount后不迟到导航 |
| HOST-003 历史会话加载与切换 (4) | 保留 | `packages/renderer/src/` routes/_app.chat.tsx; chat:runtime/history.ts | chat:runtime/history.test.ts；ID寻址/历史加载/切换；URL真实恢复待GUI |
| HOST-004 历史读取失败和恢复 (4) | 保留 | `packages/renderer/src/` chat:ChatThread.tsx; chat:runtime/use-mimir-runtime.ts:reloadHistory | chat:runtime/history.test.ts: rejects missing saved conversations；失败不当空会话，提供读取重试 |
| HOST-005 历史导航列表完整状态 (8) | 保留 | `packages/renderer/src/` components/NavSidebar.tsx | components/NavSidebar.test.tsx: 对话首次读取; 后台刷新失败；loading/empty/list/active/error/stale/retry/long |
| HOST-006 窄屏对话导航及未保存离开 (5) | 保留 | `packages/renderer/src/` components/NavSidebar.tsx; components/layout | components/NavSidebar.test.tsx: 窄屏; 未保存导航取消；窄导航/焦点循环/离开保护，既有文档模块无改动 |
| HOST-007 全局搜索问题交接 (5) | 保留 | `packages/renderer/src/` components/GlobalSearch.tsx; routes/_app.chat.tsx | chat:ChatPanel.test.tsx: 从搜索带来的纯文本草稿；只预填不自动发送；搜索模块按钮交接原合同 |
| HOST-008 瞬时草稿寿命与清理 (4) | 保留 | `packages/renderer/src/` store:askDraft; routes/_app.chat.tsx | chat:ChatPanel.test.tsx: 同一草稿重渲染不覆盖；瞬时草稿；创建真实会话清理；刷新不承诺内存草稿 |
| HOST-009 主对话引用与返回入口 (4) | 保留 | `packages/renderer/src/` routes/_app.chat.tsx:onOpenCitation; components/DocumentPanel.tsx | components/DocumentPanel.core.test.tsx: cross-document assistant citations；引用跳路由/原文定位；返回已落库对话 |
| HOST-010 保存回答为笔记的宿主IO (6) | 保留且纠错 | `packages/renderer/src/` lib/chat-io.ts:saveAsNote | lib/chat-save-note.test.ts；可见canonical成员资格验证；兼容无ID旧调用；错误传播 |
| HOST-011 输入上下文文档数据三态 (5) | 保留 | `packages/renderer/src/` lib/use-chat-composer-status.ts; chat:composer/ComposerMenus.tsx | chat:ChatPanel.test.tsx: 主对话和侧栏共用；文档loading/error/empty/loaded/refetch独立 |
| HOST-012 模型绑定与容量数据 (5) | 批准替换 | `packages/renderer/src/` lib/use-chat-composer-status.ts; lib/api.ts; backend:routes/config.ts | provider:chat-models.test.ts; backend:chat-model-selection.test.ts；旧角色绑定改模型目录；真实contextUsage仍仅主对话 |
| HOST-013 主侧栏共同主题宿主 (4) | 保留 | `packages/renderer/src/` components/chat/ChatThemeBridge.tsx; chat:ChatHostVars.tsx | 源码核对；浅/深/窄真实GUI由主会话另记；字体角色与gutter桥，不套新全局主题 |
| HOST-014 文档助手入口、范围和空态 (5) | 批准修订 | `packages/renderer/src/` components/document/DocChatSidebar.tsx; chat:composer/ComposerMenus.tsx | chat:ChatPanel.test.tsx: 主对话和侧栏共用；初始当前文档，可换单篇/全部；等级与主视图一致；Agent目标独立 |
| HOST-015 文档快捷问题直接发送 (4) | 保留 | `packages/renderer/src/` components/document/DocChatGuide.tsx | components/document/DocChatGuide.test.tsx；完整问题直接发送；hover/focus几何待GUI |
| HOST-016 文档选区与格式预设预填 (4) | 保留 | `packages/renderer/src/` components/DocumentPanel.tsx; components/NoteEditor.tsx | chat:ChatPanel.test.tsx: 草稿一次消费；选区/预设只预填；同文档重开不重设草稿 |
| HOST-017 助手关闭、保活与重开 (6) | 保留 | `packages/renderer/src/` components/DocumentPanel.tsx:sidebarMounted/sidebarOpen | 源码核对；真实隐藏继续流/回焦待GUI；关闭宽0/inert仍挂载；换文档卸载 |
| HOST-018 助手窄容器覆盖与键盘 (7) | 保留 | `packages/renderer/src/` components/DocumentPanel.tsx; components/document/DocumentPanel.style.ts | 既有文档focus/inert源码；无本轮全键盘GUI断言；实际容器880阈值、dialog焦点/Tab/Escape层级；减少动态 |
| HOST-019 侧栏引用定位与跨篇守卫 (4) | 保留 | `packages/renderer/src/` components/DocumentPanel.tsx:onSidebarCitation; DocChatSidebar.tsx | components/DocumentPanel.core.test.tsx: cross-document assistant citations；同篇定位；跨篇必须先runGuarded |
| HOST-020 DOCX宿主能力和AI修订 (7) | 保留 | `packages/renderer/src/` components/document/DocChatSidebar.tsx; DocxCapabilityStatus.tsx | lib/docx-agent-availability.test.ts; backend:docx-agent-stream.test.ts；能力加载/错/无模型/画布及revisionMode；实际选模型再校验tools/vision |
| HOST-021 其他格式宿主Agent能力 (7) | 保留 | `packages/renderer/src/` components/document/DocChatSidebar.tsx | backend:document-agent-core.test.ts；按格式真实executor/model/canvas；不因扩展名假就绪 |
| HOST-022 执行句柄匹配与只读主对话边界 (6) | 保留 | `packages/renderer/src/` components/document/DocChatSidebar.tsx; DocumentPanel.tsx; chat:runtime/transport.ts | chat:ChatPanel.test.tsx: 第二问入队; 画布版本; backend:document-agent-core.test.ts；主chat只读；目标文档/格式/来源/轮次/版本独立守卫 |
| HOST-023 PPTX截图草稿Chat交接 (6) | 保留 | `packages/renderer/src/` components/DocumentPanel.tsx; document/DocChatSidebar.tsx; chat:runtime/pptx-snapshot.ts | chat:runtime/pptx-snapshot.test.ts; chat:ChatPanel.test.tsx: 停止在途截图；真实PNG交接/显式发送/原来源恢复；Office准备能力独立验收 |
| HOST-024 Agent服务宿主与媒体边界 (6) | 保留 | `packages/renderer/src/` lib/chat-io.ts; lib/agent-media.ts | lib/agent-media.check.test.ts; chat:runtime/agent-media.check.test.ts；鉴权/取消/媒体/新文档/写作真实IO；非UI协议演示不能执行外部工具 |
| HOST-025 轮结束失效与外部编辑交替 (5) | 保留 | `packages/renderer/src/` lib/chat-io.ts:onTurnSettled; components/document/OfficeSourceEditor.tsx | chat:ChatPanel.test.tsx: stop/failure; 各Office版本守卫既有测试；正常/失败/停止刷新列表；dirty与用户保存保留，不新增自动存原件 |

## 24附件状态

以下 `server:`=`apps/server/src/services/`；`parser:`=`plugins/parser/src/`；`shared:`=`packages/shared/src/`。附件测试主要位于 `apps/server/src/test/chat-attachments.test.ts`、`chat-model-selection.test.ts` 和renderer `chat-attachments-api.test.ts`。浏览器原生选择、拖放、粘贴、下载/图片弹层焦点需另查GUI记录。

| 稳定ID | 产品实现 | 测试证据与实际边界 |
| --- | --- | --- |
| ATT-001.ready 准备完成 | composer/Composer.tsx:AttachmentTile; runtime/use-mimir-runtime.ts:addFiles | ChatPanel.test.tsx: 上传中的每个文件; chat-attachments.test.ts: auth exact conversation；真实API canonical ready卡 |
| ATT-001.uploading 准备中 | runtime/use-mimir-runtime.ts:addFiles; Composer.tsx | ChatPanel.test.tsx: 上传中的每个文件; StrictMode；逐件命名processing，临时项不lease；最终上传/取消及历史Agent保护随chat84/84独立通过 |
| ATT-001.failed 准备失败 | runtime/use-mimir-runtime.ts:addFiles catch; AttachmentTile | chat-attachments.test.ts: invalid UTF8/malformed; chat-attachments-api.test.ts；准备失败保留可移除项，不当ready发送 |
| ATT-001.send-pending 发送前准备 | runtime/use-mimir-runtime.ts:send/capture | ChatPanel.test.tsx: StrictMode; chat-attachments-api.test.ts；uploading阻塞发送且保稿 |
| ATT-001.send-failed 发送准备失败 | runtime/use-mimir-runtime.ts:dispatch catch/restoreQueued | ChatPanel.test.tsx: HTTP失败; chat-model-selection.test.ts: unknown capacity；服务端prepare失败保稿，队列首项优先 |
| ATT-001.unsupported 不支持的格式 | plugins/parser/src/attachment.ts; server:chat-attachments.ts | chat-attachments.test.ts: rejects unsupported；音视频、旧Office等明确拒绝 |
| ATT-001.oversize 超过拟定大小 | shared:chat-attachments.ts; server:chat-attachments.ts; parser:attachment.ts | chat-attachments.test.ts: multipart bytes; image dimensions；真实字节+扩展名/MIME/解码；文件限额 |
| ATT-001.expired 临时附件过期 | server:chat-attachments.ts:collectChatAttachments/readChatAttachment | chat-attachments.test.ts: leases protect queue; missing/tampered；到期不伪造可读原件 |
| ATT-001.image 图片附件 | Composer.tsx:AttachmentTile; parts/MediaParts.tsx:ImageDialog | chat-attachments.test.ts: PNG decoding; static WebP；图片真解码；缩略预览/Escape/回焦源码，GUI待验 |
| ATT-001.remove 移除附件 | runtime/use-mimir-runtime.ts:removeFile | ChatPanel.test.tsx: 先释放 lease 再删除；先release再delete；bound已发不能撤销 |
| ATT-001.cancel 取消准备 | runtime/use-mimir-runtime.ts:pendingFiles/removeFile | ChatPanel.test.tsx: 独立取消; chat-attachments.test.ts: late upload；逐件AbortController；迟到返回清理 |
| ATT-001.multiple 数量限制 | runtime/use-mimir-runtime.ts:addFiles/capture; server:chat-model-input.ts | chat-attachments.test.ts: enforces per-round budgets；最多4件，pending计数；取消状态切换回归 |
| ATT-001.sent 已发送附件 | parts/MessageItem.tsx; server:bindChatAttachments | chat-attachments.test.ts: binds canonical refs；用户消息绑定canonical资源；助手不重复卡片 |
| ATT-001.policy 拟定政策 | shared:chat-attachments.ts; shared contract chat-attachments.md | chat-attachments.test.ts; parser worker checks；工程政策已批准实施；并非原型本地模拟在生产运行 |
| ATT-001.attachment-only 仅文档附件 | runtime/use-mimir-runtime.ts:capture; server:chat-model-input.ts | chat-model-selection.test.ts: real uploaded attachment reaches model；默认问题与真实提取正文，无KB命中亦可 |
| ATT-001.image-only 仅图片附件 | runtime/use-mimir-runtime.ts:capture; server:chat-model-input.ts | chat-model-selection.test.ts: actual image model input；默认看图问题、真实图片字节，需visual能力 |
| ATT-001.no-vision 模型无视觉 | runtime/use-mimir-runtime.ts:capture; server:chat-model-input.ts | provider:chat-models.test.ts; chat-model-selection.test.ts；未知/不支持vision阻止派发，不降级 |
| ATT-001.search-only 只检索阻止 | runtime/use-mimir-runtime.ts:retryTurn/capture; server:assistant-stream.ts | chat-model-selection.test.ts: attachment search blocked；当前或相关历史附件均拒绝只检索，保留草稿 |
| ATT-001.total-size 合计容量限制 | shared:chat-attachments.ts; server:chat-model-input.ts/chat-attachments.ts | chat-attachments.test.ts: round/conversation budgets；每条20MiB、每会话200MiB真实服务约束 |
| ATT-001.context-limit 提取文本超限 | server:chat-attachment-prepare.ts; parser:attachment.ts | chat-attachments.test.ts: excessive text; chat-model-selection.test.ts: unknown capacity；单件12000/轮24000及上下文预算，超限拒绝不截断 |
| ATT-001.ttl 草稿过期 | server:chat-attachments.ts:lease/collect | chat-attachments.test.ts: stale candidate renewed; leases protect queue；draft24h、orphan/failed1h、active lease5min；同会话锁重读 |
| ATT-001.history 历史与生命周期 | runtime/history.ts; server:loadMessageAttachments; conversations.ts | chat-attachments.test.ts: ordered protocol; selected prefix; saving branch；原件受保护会话生命周期；回答引用实际使用refs；不导KB |
| ATT-001.audio-demo 独立WAV媒体模拟 | parts/MessageItem.tsx:NativePart audio/video | 协议兼容源码；无产品通用音视频上传测试；协议演示专属：不在通用附件支持列表，不声称OCR/转录/视频上传 |
| ATT-001.agent-block Agent禁用通用附件 | runtime/use-mimir-runtime.ts:addFiles/capture; server:docx-agent-stream.ts | chat-attachments.test.ts; docx-agent-stream.test.ts；通用附件与Agent/专用截图混用拒绝，专用截图仍走独立来源守卫 |

## AG-UI/SDK实际支持边界

- 产品固定 ai0.69.0、client0.39.3、react0.30.4、openai0.30.0。AGUI旧0.0.59的36事件与官方1.0.x31事件枚举是版本证据，不是产品新增36项业务功能。
- RUN_STARTED/RUN_FINISHED/RUN_ERROR、TEXT_MESSAGE_*、REASONING_*、TOOL_CALL_*由真实TanStack连接/reducer消费；旧THINKING事件在 `runtime/transport.ts` 转为对应reasoning别名。终态缺失抛断流错误，不凭EOF声称成功。
- STATE_SNAPSHOT/STATE_DELTA由 `runtime/protocol-state.ts` 存储非视觉状态；JSON Patch在私有clone原子应用并拒原型写。未知/RAW/非Mimir CUSTOM不执行payload、不造普通用户可见诊断卡，已生成内容继续可读。
- SDK支持的MESSAGES_SNAPSHOT、activity、structured-output、subagent或多媒体part由SDK归约，NativePart仅渲染已归约结果；当前普通业务服务主要生产文本/实际reasoning/工具与Mimir业务事件。activity/subagent原型样例不表示Mimir新增子Agent调度/审批/音视频服务。SourcePart为兼容部件，AGUI不存在通用SOURCE专用事件；不可将直接部件测试写成端到端流生产。
- 业务CUSTOM仅处理 `mimir.message` canonical身份、`mimir.citations`、`mimir.failure`、document/docx Agent结果。旧mimir.trace忽略，原数据库数据不破坏；不把检索计数伪装模型思考。
- 客户端工具仅执行宿主提供且匹配来源/格式/文档/版本/轮次的Agent工具；中断后的重试只复送原run的缓存tool result。通用工具审批协议、任意CUSTOM可执行代码、未授权工具均没有产品执行入口。
- 通用临时附件支持批准的UTF-8文本/代码、现代Office、PDF文字层、PNG/JPEG/静态WebP。音视频组件是协议部件展示；本轮未新增通用音视频上传、OCR、音视频转录、Office附件原版编辑或附件向量索引。

## 本次仍待关闭的复核项

1. 文档Agent路径 `docx-agent-stream.ts` 的历史元数据/真实protocolEvents持久化，以及无工具Agent问答的历史来源身份需后端补核对：目前canonical ID与terminal顺序已修，但独立复核发现append未带实际协议/选择元数据，可能刷新后退化纯文本并误放开普通分支。已通知主会话，未自行改跨层接口。
2. 上传临时项/StrictMode最终81测试变更待本审核者独立重跑（80项基线已实际通过）；最终全仓门与GUI以主会话记录为准。
3. `DocChatSidebar.tsx` / `availableDocxAgent` 仍按旧全局chat角色的modelReady/mediaKinds决定Agent句柄与snapshotVisionReady，输入框显式所选tools/vision模型尚不能启用被旧角色关掉的Agent/截图路径。已通知主会话处理所选能力与宿主执行门控的数据接缝；不能以mock ChatPanel具备agent就声称真实宿主可用。
4. 未执行真实付费供应商模型、原生Electron系统文件/IME/剪贴板和全读屏环境认证；这些不得由本地HTTP/SSE stub或原型演示替代。
