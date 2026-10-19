# Research: Full official Thread feature mapping

- Query: 将现有 Mimir 对话 71 组 / 379 个规划状态映射到完整 assistant-ui 官方 Thread 默认组件，禁止自定义消息/parts/composer/样式覆盖，同时保留引用、存笔记、范围、模型、队列、截图和文档 Agent 安全合同。
- Scope: mixed（本地业务与运行时源码；固定 assistant-ui 官方源；WeKnora 版本及业务参考）
- Date: 2026-10-19

## Findings

### 结论和当前阶段

完整官方 Thread 可以覆盖基础对话显示和输入，但现有业务并非都包含在默认 Thread 中。本报告是规划映射，**不是 379 项 GUI 测试通过，也不是产品已可实施结论**。v1/v2 是历史冻结审阅稿，本轮不修改；新的完整官方方案仍应在独立 v3 HTML 中真实构建和审阅，获认可再改产品。

本次“全官方”严格指 `AssistantRuntimeProvider` 下直接 `<Thread autoFocus={...} />`，省略 `components`。禁止 Thread components overrides、registered dataUI/toolUI、自绘 parts/消息/输入框、后代 selector/aui/data-slot 样式覆盖、Mimir theme vars 注入，以及把旧样式手译为官方。仅使用固定原件及其原依赖、官方 theme/CSS。宿主可保留 Thread 外部导航、上下文、依据、队列、恢复和文档任务业务区域；这些区域不能复制一份自定义消息流规避约束。

完整默认会带来明确变化：英文欢迎/提示/tooltip、官方尺寸/布局/图标/动效、用户 Edit、助手 Reload/Export、可能在失败或停止的非空正文上出现 Copy/Export。业务动作必须诚实提供 capability；不支持的回调省略，保留官方禁用外观。不能以未实现分支/编辑/重生成的假回调换取按钮“可点”。

### 固定来源与文件

| 文件 / 来源 | 作用 |
| --- | --- |
| `research/chat-package-inventory.json` | 46组、250状态；逐状态原标签、代码位置、交互/边界来源 |
| `research/chat-host-inventory.json` | 25组、129状态；Renderer宿主来源 |
| `research/full-official-thread-contract.md` | 本轮完整官方闭包、默认功能/样式/缺失类型、安装API精核；与本报告配套 |
| `research/vendor-full-thread/` | 固定上游闭包35份原件、manifest、LICENSE、API证据、WeKnora复查 |
| `packages/chat/src/ChatPanel.tsx:73–100` | Provider/文档interrupt桥/当前自绘主体和发送前prepare钩子 |
| `packages/chat/src/parts/MessageItem.tsx:87–233` | 现有trace/引用/失败/Agent数据、空消息等待与成功动作门控 |
| `packages/chat/src/parts/AnswerActions.tsx:11–40` | search-only复制snippet+来源；保存只取最后落库助手/幂等 |
| `packages/chat/src/runtime/history.ts:48–89` | 持久化trace/citation/failure/agent转data part，历史不含完整reasoning/tool记录 |
| `packages/chat/src/runtime/use-mimir-runtime.ts:255–293` | prepareDocxSend冻结选区/版本/轮ID与截图目标，再写runConfig |
| `packages/chat/src/runtime/agent.ts:151–173` | 已有发送前冻结合同；派发时fallback不能替代入队前冻结 |
| `packages/chat/src/runtime/pptx-snapshot.ts:11–90` | 来源活性、PNG/尺寸/版本/页、最多4份注册表、完整attachment、排队防篡改 |
| `packages/renderer/src/lib/api.ts:818–834,1036–1043` | 文件永久导入KB、URL抓取API，不是临时chat附件 |
| `apps/server/src/routes/files.ts:35–69` | multipart文件POST调用uploadFile |
| `apps/server/src/services/upload.ts:74–96,235–275` | Markdown建笔记，其他文件写原件/meta/documents/分块嵌入 |
| `apps/server/src/services/capture.ts:234–262` | URL抓取ingest到知识库documents |
| `apps/server/src/services/assistant-stream.ts:187–252` | 文档Agent分流；普通chat拒绝image；用户消息持久化text |
| installed core `src/runtimes/external-store/external-store-adapter.ts:195–247` | 公共onNew/queue/attachments adapter接口 |
| installed core `src/runtimes/external-store/external-store-thread-runtime-core.ts:1132–1207` | 先初始化barrier，再queue.steer/enqueue；无队列才onNew |
| installed core `src/runtime/queue/external-thread-queue-adapter.ts:14–51` | 公共enqueue/steer/move/edit/remove；internal派发钩子不作为Mimir扩展点 |
| installed core `src/runtime/base/base-composer-runtime-core.ts:438–518,732–784` | send事件晚于handleSend；MessageNotSentError回填；complete attachment与File适配差异 |
| installed core `src/adapters/attachment.ts:9–49` | 标准AttachmentAdapter与SimpleImageAdapter；不等于后端支持 |
| installed product AGUI `src/useAgUiRuntime.ts:124–158,329–362` | 内部私有queueController、直接core.append、callbacks/extras所有权 |
| installed product AGUI `src/runtime/types.ts:79–129` | 仅unstable_enableMessageQueue布尔，未提供beforeSend/queue injection |

“installed core”来自隔离原型 `/tmp/mimir-chat-official-v2/official-deps/node_modules/@assistant-ui/core`，实际 **0.3.29**；React **0.15.29**。产品仍是 React **0.15.28** / core **0.3.27** / react-ag-ui **0.0.68**（含恢复interrupt的补丁）/ ag-ui client **0.0.59**。固定 registry 源为 **a587b2838f2d644549d216098d54cfbeedfac522**，MIT/2026 AgentbaseAI Inc.；不能把新原件在旧SDK的兼容性作为已证事实。精确原件与安装API SHA 见配套manifest/evidence。

### 数据与宿主边界

1. **Thread显示真实canonical parts。** 正文、真实reasoning、真实tool-call、image/file使用默认组件；不从retrieval trace造思考/工具。不注册dataUI。source/legacy audio等默认switch缺case，引用在外部依据区；legacy audio等价转真实file仍需验证，不得直接丢弃。
2. **外部区域按真实会话/消息/轮绑定。** 使用服务器消息ID与乐观ID映射定位“当前所选轮次”的依据、恢复/文档任务，切换时同步状态；不能始终用thread最后一问去处理旧失败。历史任务摘要可以选择真实轮次，不能重画自定义消息transcript。
3. **范围/强度/模型/usage在外部。** 范围last20+单篇、全局模型两项只读与设置入口、侧栏standard及真实token数据合同不变。入队后改当前范围/画布选区不得改变已冻结请求。
4. **安全保存留外部。** 非空、已结束、非incomplete/失败/Agent pending/cancelled/failed；按宿主现取最后落库助手并幂等。普通官方Copy/Export不等于可保存或工具执行成功。search-only复制外部真实snippet+来源，不能把sentinel当检索结果。
5. **分类恢复/队列/文档任务在外部。** 超时/限流/截断/网络/连接按轮恢复；已执行文档工具只重传缓存结果。原interrupt/resume[]、幂等、匹配文档/版本/轮次/dirty、不自动保存、未保存导航守卫继续存在。普通tool result/approval不能替代它们。
6. **宿主壳只控制其容器。** 主/侧栏、导航、真实宽度覆盖、显隐保活、Escape顶层次序/焦点在外部；Thread内部只官方默认。产品嵌入可同文档但要防CSS污染；原型可用iframe隔离，不能在运行时塞假Thread消息HTML。

### 实施前技术验证：发送前冻结与队列

**公共seam已证明，现有AGUI集成尚未证明。** core ExternalStoreAdapter允许外部queue；实际append在 `external-store-thread-runtime-core.ts:1155–1167` 调用公共`queue.steer(message)`/`queue.enqueue(message)`。因此可在这两个函数代理入口、delegate前把原文档/页/版本/选区/截图/roundID写入即将入队的AppendMessage.runConfig。无队列分支的`onNew`也可在transport前冻结。不能只包AGUI core.append或onNew：排队期间会晚到。不能用composer的send事件：`base-composer-runtime-core.ts:486`已经handleSend，`:515`才发send事件。

需注意core在入队前可能await threadList初始化(`:1132–1145`)。若新设计引入异步初始化，queue入口读“当前选区”可能已晚于用户点击。应保持既有会话初始化由Mimir transport处理，或另外证明公开seam能在任何异步gap前捕获不可变上下文；未验证前不能承诺原发送瞬间快照。附件异步add/send同样要验证捕获时机。现有PPTX complete附件没有新的上传延时，但不能据此忽略未来普通File路径。

现有`useAgUiRuntime`在内部createMessageQueue并直接core.append，options仅布尔开关，没有注入queue adapter或beforeSend。公开ExternalStore方案原则可行，**如何在保留AGUI extras、恢复补丁、工具所有权和queue busy/idle边沿时接入现有应用，仍是实施阻断技术验证**。本研究不推荐私有_core/queueController monkeypatch、不克隆自绘composer，不把“外层再套一个runtime”的未验证架构当完成。若采用显式external-store adapter，必须验证只有一个发送/工具执行所有者与一条busy/idle释放链。

验证必须覆盖：正在生成时连续两次入队各自原范围/选区；队列保留后切文档/版本；停止不自动派下一项；仅一次notifyIdle推进；cached-results resume失败再次恢复；过期PNG拒绝保留第一排队草稿；用户已输入新稿时旧失败不覆盖。拒绝时公共MessageNotSentError可让同一send generation回填(`:497–498`)，普通异步throw不保证回填；宿主错误提示与新稿保护仍须实测。不得通过改incomplete为running骗隐藏动作。

### 实施前产品冲突：完整默认“+”与现有附件范围

完整Thread原件无隐藏附件props，默认Attachment AddAttachment无条件挂载；实际core hook只以thread disabled/composer editing判断，**无附件adapter时仍可打开系统文件选择，随后unsupported**。Thread不能用CSS、components、dataUI或禁用整线程来悄悄隐藏“+”。标准adapter有`accept/add/remove/send`，SimpleImageAttachmentAdapter只是把File读成dataURL，不会赋予后端新能力。

现有三条能力不能混同：

| 已有能力 | 数据寿命/语义 | 能否直接当完整官方+的普通临时附件 |
| --- | --- | --- |
| `api.documents.upload(File)` | 永久原件+meta+documents+搜索/向量索引；md建正式笔记 | **不能**；会暗中新增KB导入，且回document ID并非自动喂给当前模型的附件 |
| `api.capture.run(url)` | URL抓取入KB、去重/索引 | **不能**；不是File adapter也不是临时上下文 |
| PPTX宿主截图 | 仅当前文档/页/版本登记的PNG，4份有界内存注册表；视觉documentAgent执行，过期拒绝 | 可经`composer.addAttachment(CreateAttachment)`在无上传adapter时用官方展示；**不等于**允许系统文件选择任意图片 |
| 文档Agent媒体分析/生成 | 绑定真实文档任务、格式/模型、系统选择服务与来源校验 | **不能**当主对话任意文件/多模态服务 |

`assistant-stream.ts:201–208`对普通chat image明确422 IMAGE_AGENT_REQUIRED；只有此前documentAgent/docxAgent分流路径处理截图。普通用户持久消息`:250`是text。未找到通用临时文件存储/回收/解析、普通chat多模态附件合同。音频视频也不能靠官方媒体视觉推定模型已接收。

因此必须明确选择新增业务范围，或找到有真实官方配置的上游变体后再讨论是否符合“完整默认”。可评估的产品方案是“明确导入知识库并把真实文档引用加入本轮范围”，或单独设计临时chat附件/多模态能力；两者均超出现有纯组件替换，**本研究不自行批准/实现**。不能接受正常点+后必然报错作为最终完成，也不能静默永久导入。v3中如果展示附件交互，只能明确标为真实fixture adapter/PNG既有路径，通用上传标为未闭合的产品边界。

### 其他必须在v3可见的差异/门槛

- 默认Copy/Export只检查非running+非空text，不含原“成功且最后一条”判断，且unstable_capabilities.copy不是可靠隐藏开关。失败/停止正文可能仍有动作；安全保存与执行门控继续独立。此前严格动作验收若还要求保留，完整默认无法同时满足，需明确新决策。
- 默认代码copy无缺API/权限拒绝可见错误或execCommand fallback；此前R7不能凭成功截图认定满足。主答案Copy也仅成功显示勾。
- 官方Edit/Reload/BranchPicker视觉存在不等于Mimir线性持久层具备分支/历史重写。缺capability保持disabled；若接onReload必须按target原上下文安全retry/缓存resume，不能重执行已写画布工具。
- 默认ImagePreview有loading/ImageOff/zoom；attachment缩略图error不等同完整ImagePreview；copy/download子件未挂入默认ImageImpl。默认audio/source缺case须按本报告处理。
- 默认英文标题/tooltip、44rem等官方尺寸不做中文/主题覆盖。字体/间距/透明度/边框/hover/focus/动效均以官方原件实际计算值审阅，不能沿用旧Yuque细节再称全官方。
- native剪贴板/文件选择/输入法、真实网络/服务端落库/文档执行不是规划fixture可证明的结果。新v3构建、浏览器可交互验证和之后产品验收分开记录。

### 全量状态映射

每个状态仅给一个**主要归属**，不表示跨层约束消失：`official`=完整默认组件负责视觉/交互（不承诺旧精确样式或门控）；`host-external`=Thread外部的Mimir业务入口/信息；`removed`=仅已批准移除的retrieval trace；`boundary`=adapter、后端、原生、安全合同或未闭合冲突，不能由HTML假成功。

表中后缀与第一列ID组合得到完整state ID；每个原inventory状态恰好出现一次。

| 主要归属 | 规划状态数 |
| --- | ---: |
| official | 71 |
| host-external | 179 |
| removed | 7 |
| boundary | 122 |
| 合计 | 379 |

| 组 / 状态数 | 全部状态的主要归属（后缀） | 推荐及必须保留的合同 / 真实差异 |
| --- | --- | --- |
| CHAT-001 主对话空态 (4) | **official**: `idle`, `overflow`, `sent`<br>**host-external**: `document` | 欢迎语、居中输入与消息切换改为官方默认；针对本文的范围说明移至宿主，不覆盖官方英文欢迎。 |
| CHAT-002 文档侧栏指南与快捷问 (5) | **official**: `actions`, `answered`<br>**host-external**: `guide`, `snapshot`, `standard` | 快捷问可通过真实 runtime suggestions 使用官方 Trigger send；业务指南在 Thread 外，截图存在时清空 suggestions；侧栏有效强度仍为 standard。 |
| CHAT-003 宿主草稿一次消费与范围 (5) | **boundary**: `prefill`, `context`, `repeated`, `replacement`, `snapshot-rejected` | 宿主一次消费草稿、scope 与截图校验继续走公开 runtime API；预填只 setText，不发送；replacement 必须按 draft 身份去重。 |
| CHAT-004 历史加载与适配 (5) | **official**: `loading`, `new`<br>**boundary**: `loaded`, `missing`, `rejected` | 官方 loading skeleton 和空态；历史转换保留正文与真实身份，引用/失败/Agent 供外部宿主消费，不注册 dataUI。missing/rejected 不伪装空会话。 |
| CHAT-005 消息列与回复动作门控 (6) | **official**: `user`, `assistant`, `placeholder`, `empty-settled`<br>**boundary**: `last`, `blocked` | 用户/助手/等待点交给完整 Thread。旧“最后成功回答才有动作”不等于官方门控：失败/停止非空正文仍可能 Copy/Export；安全保存另在宿主，冲突明确披露。 |
| CHAT-006 消息滚动与回到底部 (5) | **official**: `bottom`, `away`, `return`, `focus`, `divider` | 使用官方 Viewport/ScrollToBottom，不复刻旧分隔线或滚动钩子；距底与用户上滚行为须真实浏览器验收。 |
| CHAT-007 输入框编辑与键盘 (8) | **official**: `empty`, `focus`, `typed`, `multiline`, `enter`, `escape-idle`, `narrow`<br>**boundary**: `ime` | 输入、尺寸、Enter、空态发送均为官方。实际 .15.29 textarea Escape 仅 composer.canCancel 时取消；idle 不清空草稿。IME 仍需真实输入法验证，原型按键不能冒充系统输入法。 |
| CHAT-008 发送与建会话 (6) | **official**: `ready`, `running`, `completed`<br>**boundary**: `creating`, `create-failed`, `guard-rejected` | 发送/生成视觉用官方；会话真实建立、发送前安全冻结、拒绝后回填由 adapter；不能先清空再用假成功占位掩盖拒绝。 |
| CHAT-009 本轮范围下拉 (7) | **host-external**: `all`, `menu`, `loading`, `error`, `empty`, `dismiss`, `keyboard` | 完整 Thread 无范围菜单；Thread 外保留全部文档/单篇范围、最近20篇、数据三态、键盘与关闭。范围写入真实 runConfig。 |
| CHAT-010 单篇范围标签与替换 (5) | **host-external**: `selected`, `long`, `replace`, `remove`<br>**boundary**: `queued` | 选中文档标签、替换和移除在外部上下文区；队列在入队时冻结所属范围，之后换标签不能改变已排队请求。 |
| CHAT-011 主对话思考强度 (5) | **host-external**: `standard`, `menu`, `deep`, `hidden`, `dismiss` | standard/deep 控件移外部；主对话读取全局 chat/reasoning role，侧栏强制有效 standard；不能仅隐藏控件仍沿用 deep 参数。 |
| CHAT-012 全局模型绑定只读菜单 (7) | **host-external**: `chat`, `reasoning`, `menu`, `missing`, `same-name`, `long`, `manage` | 两项全局模型绑定只读、缺失提示、长同名区分和管理入口留外部；不伪装本次临时切换模型。 |
| CHAT-013 上下文容量 (5) | **host-external**: `hidden`, `known`, `unknown-input`, `popover`, `close` | 真实 token 容量/已知输入/unknown 状态由宿主数据展示；不编百分比，不塞入官方 composer。 |
| CHAT-014 生成中追问队列 (6) | **host-external**: `queued`, `multiple`, `retrieve`<br>**boundary**: `auto`, `stop`, `failed` | 官方完整 Thread 没队列行；外部队列列表/取回联动公开 queue adapter；自动派发、取消暂停、失败归还首项必须保留文字和PNG。 |
| CHAT-015 停止生成 (5) | **official**: `stop`, `partial`, `empty`, `after`<br>**host-external**: `failure-distinct` | 官方 Stop/部分正文/结束状态；分类失败说明在宿主。停止不能变成成功保存，也不能取消后自动冲走队列。 |
| CHAT-016 检索过程折叠 (7) | **removed**: `waiting`, `live`, `manual`, `done`, `search`, `scroll`, `absent` | 按已批准决定移除全部自绘 retrieval trace；不从 trace 合成 reasoning/tools。首次等待由 CHAT-005 官方 indicator 承接，内部检索和真实引用继续存在。 |
| CHAT-017 模型思考折叠 (5) | **official**: `live`, `toggle`, `done`, `empty`, `long` | 使用官方默认 reasoning group/开合/滚动；仅真实 reasoning part，空内容不造思考。旧历史没有推理记录时不补写。 |
| CHAT-018 流式Markdown与正文长内容 (5) | **official**: `complete`, `partial`, `code`, `links`, `wide` | 默认官方 MarkdownText/GFM/code/链接与横向溢出行为；保持官方原件、依赖和 CSS，不复制旧 MarkdownPart 或 Shiki 外观。 |
| CHAT-019 代码块复制 (5) | **official**: `idle`, `copied`, `hover-focus`<br>**boundary**: `failure`, `fallback` | 官方代码复制成功可显示勾；缺 Clipboard API 或 reject 被吞掉，无旧失败提示/execCommand降级。此前 R7 要求未被完整默认满足，属于明确验收冲突。 |
| CHAT-020 工具调用消息折叠 (6) | **official**: `running`, `complete`, `failed`, `collapsed`, `expanded`, `long` | 真实 tool-call → 默认 ToolFallback/ToolGroup，原生 args/result/error/collapse；不注册自定义 toolUI，不把文档 interrupt 伪装成普通 tool approval。 |
| CHAT-021 引用来源与原文跳转 (6) | **host-external**: `list`, `channels`, `preview`, `hover`, `focus`, `empty` | 每轮真实 citation 数据迁至外部“本轮依据”，按真实源消息ID选定、保留 snippet/渠道/预览/跳转/空态；不可画第二份消息流。 |
| CHAT-022 回答存成笔记 (6) | **host-external**: `idle`, `saving`, `saved`, `open`, `error`, `hidden` | “保存回答/打开笔记”留独立宿主动作，继续 last-successful、非空、非running、非incomplete/Agent pending/cancelled/failed 门控；重取最后落库助手行并幂等。官方 Export 不替代此动作。 |
| CHAT-023 复制回答与检索结果 (5) | **official**: `idle`, `success`, `ordinary`<br>**host-external**: `search-only`<br>**boundary**: `failure` | 普通正文使用官方 Copy；只检索仍由外部依据区提供“复制检索结果”（snippet+来源），不是复制 sentinel。官方复制失败无原错误反馈，不能宣称已满足。 |
| CHAT-024 模型请求受限失败卡 (5) | **host-external**: `card`, `recover`, `history`, `unavailable`<br>**boundary**: `snapshot` | 限流分类说明/安全重试/仅检索恢复留外部，并绑定本条失败前一问；历史回放同样不丢。带截图禁止降级成丢图检索。 |
| CHAT-025 请求超时失败卡 (5) | **host-external**: `card`, `recover`, `history`, `unavailable`<br>**boundary**: `snapshot` | 超时分类恢复留外部；原问题、原范围、当前合法模型和原截图共同校验，不能简单官方 Reload 重跑已执行文档工具。 |
| CHAT-026 回答被截断失败卡 (5) | **host-external**: `card`, `recover`, `history`, `unavailable`<br>**boundary**: `snapshot` | 截断说明/恢复留外部，保留部分答案和真实失败；非空部分答案的默认官方 Copy/Export 门控变化须披露。 |
| CHAT-027 网络不可达失败卡 (4) | **host-external**: `card`, `recover`, `history`<br>**boundary**: `snapshot` | 网络错误外部恢复区按原问题/截图恢复；默认 MessageError 仅负责其真实 status.error，不承担全部业务出路。 |
| CHAT-028 连接中断恢复 (5) | **host-external**: `card`, `retry`, `refill`<br>**boundary**: `queued`, `zero` | 连接中断 retry/refill 为外部按轮动作；零正文/已排队/新草稿保护不可误保存上一轮或覆盖用户新输入。 |
| CHAT-029 历史重试与上一问定位 (5) | **boundary**: `previous`, `current-config`, `search-scope`, `running`, `history-mode` | 按源消息回溯对应上一问与快照；不是 thread 最后用户消息。标准重试、search-only、历史模式与忙碌状态分别校验；不以通用 onReload 替代。 |
| CHAT-030 AG-UI 来源pill (4) | **host-external**: `url`, `document`, `fallback`, `hover-focus` | 默认 Thread assistant switch 无 source case；真实 source 迁外部依据，保留安全URL/站内定位/fallback；不注册 part renderer补回。 |
| CHAT-031 文件附件chip (4) | **official**: `file`, `safe`, `focus`<br>**boundary**: `unsafe` | 真实 file part/完整附件由官方 File/Attachment；URL和MIME安全边界继续校验。默认下载/媒体呈现可能与旧 chip 不同，按原件展示而非改样式。 |
| CHAT-032 图片part原图链接 (4) | **official**: `image`, `open`, `broken`, `narrow` | 官方 ImagePreview/zoom/加载/失败占位与窄容器；原 broken 文案和重试不承诺相同。默认 ImageImpl 未挂其导出的 copy/download 子件。 |
| CHAT-033 音频part与MIME图标 (3) | **boundary**: `mp3`, `wav`, `other-mime` | 默认 Thread 没有 legacy audio case。真实 audio 数据不能丢；可评估按真实 MIME/URL 等价转换 file part由官方媒体文件呈现，但 mp3/wav/other语义和安全验证尚未完成，不能凭 fixture 宣称支持。 |
| CHAT-034 Agent执行与续轮进度 (6) | **host-external**: `execute`, `resume`, `failed`<br>**boundary**: `invalid-round`, `unsupported`, `dedupe` | 进度/失败解释迁外部文档任务区；执行轮次/格式/去重和显式 resume[] 留原桥。普通 addToolResult 不能替代中断续轮。 |
| CHAT-035 Agent停止与已改画布 (5) | **host-external**: `stopping`, `stopped`, `cancel-error`, `draft`<br>**boundary**: `unmount` | 停止进度与已改草稿在宿主；实际中止工具、保留部分画布、卸载防旧句柄写入的安全合同保持。 |
| CHAT-036 工具结果续传失败与安全重试 (6) | **host-external**: `failed`, `ready`, `retrying`, `success`, `again`<br>**boundary**: `stale` | 外部“重传工具结果”只发送已缓存结果，不再执行工具；stale 版本/文档/轮身份继续拒绝。不得接普通 regenerate。 |
| CHAT-037 Agent媒体选择与分析 (7) | **host-external**: `processing`, `picker-cancel`<br>**boundary**: `choose-image`, `choose-audio`, `choose-video`, `document-image`, `stale` | 现有文档 Agent 媒体选择/分析服务独立于通用聊天附件；系统选择器/取消/过期/来源真实性需 native/service 验证。宿主可显示处理状态。 |
| CHAT-038 中断写作的部分草稿 (5) | **host-external**: `pending`, `keep`, `keep-error`, `discard`<br>**boundary**: `stale` | 中断草稿 keep/discard/错误留外部文档任务；继续真实 dirty/不自动保存，过期版本不得套用。 |
| CHAT-039 回退本轮画布修改 (4) | **host-external**: `available`, `success`, `failed`<br>**boundary**: `unsafe` | 本轮撤销及失败反馈留外部；只允许当前匹配版本和可安全回退的本轮修改，不替代全局编辑器 Undo。 |
| CHAT-040 Agent创建新文档交接 (6) | **host-external**: `created`, `open`, `stopped-after`<br>**boundary**: `autoopen`, `invalid`, `parse-error` | 创建完成与打开文档在宿主；真实新文档、跳转未保存守卫、stop-after不丢交接、错误与解析失败须真实 IO。 |
| CHAT-041 Agent历史中断摘要 (7) | **host-external**: `pending`, `open`, `cancelling`, `cancel-error`, `completed`, `failed`, `cancelled` | 历史 pending/open/cancel/终态摘要移外部按轮任务区；取消继续原持久化端点与幂等，不生成伪历史 tool-call。 |
| CHAT-042 PPTX截图草稿与消息附件 (5) | **official**: `draft`, `remove`, `sent`<br>**host-external**: `no-model`<br>**boundary**: `other` | 宿主生成真实 complete PNG attachment，官方负责草稿缩略图/移除/发送后展示；无视觉模型提示在外部。其他来源不能冒名已登记截图。 |
| CHAT-043 截图发送校验与错误 (7) | **host-external**: `dismiss`<br>**boundary**: `valid`, `target`, `vision`, `multiple`, `invalid`, `full` | 目标/视觉模型/仅1张/PNG签名尺寸/注册表上限/来源活性在发送前校验；错误显示与dismiss在外部，不能因官方附件视觉而删除守卫。 |
| CHAT-044 截图排队/取回与派发 (6) | **boundary**: `freeze`, `retrieve`, `dispatch`, `stale-empty`, `stale-new`, `tampered` | enqueue/steer前冻结原文档、页、版本、选区、PNG；取回/dispatch再验证；stale-empty只回原草稿，stale-new不得盖新稿；tampered拒绝。现有AGUI无公开队列注入，实施前技术门槛。 |
| CHAT-045 截图失败重试与附件错误隔离 (6) | **host-external**: `refill`, `remove-validation`, `remove-transport`<br>**boundary**: `retry`, `search`, `expired` | 原快照可重试、到期拒绝；仅检索不可丢图。外部回填/移除校验错误独立于transport错误，移除截图不能抹掉真实断网。 |
| CHAT-046 Agent跨格式工具与媒体原件错误 (7) | **boundary**: `read-write`, `image-generate`, `original-attachment`, `original-media`, `stream-writing`, `export-sheet`, `invalid` | 跨DOCX/PPTX/XLSX/PDF原工具读写、生成图、原件媒体、stream writing/export保持格式能力和来源校验；不把Thread支持tool UI等同全部文档执行已验证。 |
| HOST-001 主对话新建入口与聚焦 (4) | **official**: `fresh`<br>**host-external**: `nav`, `prefill`, `existing` | 新建路由/未保存导航/预填由宿主；官方空态与 autoFocus控制；已有会话不抢焦点。 |
| HOST-002 新会话真实ID建立与流保留 (4) | **boundary**: `new`, `created`, `streaming`, `failure` | 首问建立真实ID后 ownedId写URL但维持原runtime，不重挂载切断流；create失败绝不假称成功。 |
| HOST-003 历史会话加载与切换 (4) | **official**: `loading`<br>**boundary**: `loaded`, `switch`, `refresh` | 官方loading；历史寻址、切会话生命周期/刷新真实恢复由宿主。不得承诺后台跨会话继续生成。 |
| HOST-004 历史读取失败和恢复 (4) | **host-external**: `error`, `retry`, `recovered`, `again` | 外部读取错误/重试/恢复；失败不切新空态，不承诺必恢复，refetch真实结果。 |
| HOST-005 历史导航列表完整状态 (8) | **host-external**: `loading`, `empty`, `list`, `active`, `error`, `stale`, `retry`, `long` | 历史导航列表保留真实 loading/empty/stale/error/当前项/相对时间/长标题和retry；不为全官方消息流重做导航。 |
| HOST-006 窄屏对话导航及未保存离开 (5) | **host-external**: `wide`, `narrow`, `overlay`<br>**boundary**: `guard`, `cancel` | 主导航窄屏覆盖与正常宽屏布局在宿主；离开未保存文档和取消回原页通过原守卫，不受官方Thread内键盘替代。 |
| HOST-007 全局搜索问题交接 (5) | **host-external**: `empty`, `ready`, `blocked`<br>**boundary**: `guard`, `draft` | 搜索问题只预填，脏文档跳转守卫与askDraft寿命保持；阻塞不自动发送或丢用户原草稿。 |
| HOST-008 瞬时草稿寿命与清理 (4) | **boundary**: `memory`, `created`, `refresh`, `sidebar` | 内存草稿一次消费，建会话清理，刷新不暗增持久化；主/侧栏不能互相串稿。 |
| HOST-009 主对话引用与返回入口 (4) | **host-external**: `citation`, `plain`<br>**boundary**: `document`, `return` | 外部引用入口承接原导航IO与返回入口；plain对话不造来源；文档跳转/返回有真实路由语义。 |
| HOST-010 保存回答为笔记的宿主IO (6) | **host-external**: `none`, `success`, `open`, `failure`<br>**boundary**: `lookup`, `save` | 查最后落库助手/幂等保存继续原IO；无可保存消息不得存上一轮；外部展示成功/打开/失败，不能用导出MD冒充存笔记。 |
| HOST-011 输入上下文文档数据三态 (5) | **host-external**: `loading`, `empty`, `error`, `items`, `retry` | 范围数据loading/empty/error/items/retry迁外部上下文；真实列表last20，不造新搜索能力。 |
| HOST-012 模型绑定与容量数据 (5) | **host-external**: `bound`, `missing`, `usage`, `nousage`, `manage` | 全局模型只读绑定、缺失、真实usage与设置入口在宿主；不向官方Thread写自定义模型控件。 |
| HOST-013 主侧栏共同主题宿主 (4) | **host-external**: `main`, `sidebar`, `dark`, `narrow` | 主/侧栏容器和主题切换属于宿主；Thread只用官方默认浅/深主题，无Mimir token/selector覆盖；实际窄宽与高宽比需浏览器验收。 |
| HOST-014 文档助手入口、范围和空态 (5) | **official**: `empty`<br>**host-external**: `open`, `scope`, `reasoning`, `long` | 文档助手头部、scope/有效standard/长标题在宿主；完整Thread保持官方欢迎而不塞自定义guide。 |
| HOST-015 文档快捷问题直接发送 (4) | **official**: `idle`, `hover`, `focus`, `ask` | 文档快捷问作为真实 suggestions 数据使用官方建议组件；hover/focus/ask均默认；截图时无建议，发送继续前置冻结。 |
| HOST-016 文档选区与格式预设预填 (4) | **host-external**: `selection`, `preset`<br>**boundary**: `ready`, `reopen` | 文档选区/格式预设入口在宿主，setText只预填；ready/reopen保持身份消费与不自动发送。 |
| HOST-017 助手关闭、保活与重开 (6) | **host-external**: `opened`, `hidden`, `focus`<br>**boundary**: `streaming`, `reopen`, `switch` | 宿主显隐保活，关闭不销毁当前流/草稿；重开不重放预填；switch清理旧文档执行句柄。 |
| HOST-018 助手窄容器覆盖与键盘 (7) | **host-external**: `wide`, `compact`, `dialog`, `dismiss`, `motion`<br>**boundary**: `tab`, `escape` | 按真实容器宽度覆盖、遮罩、关闭/减弱动效在宿主；最高层弹窗优先Escape，textarea官方Escape与父侧栏关闭不能同时触发，Tab焦点需真实验收。 |
| HOST-019 侧栏引用定位与跨篇守卫 (4) | **boundary**: `same`, `cross`, `guard`, `cancel` | 同篇定位、跨篇跳转、脏文档守卫与cancel继续原callback，外部依据区调用，不靠改写markdown链接绕过。 |
| HOST-020 DOCX宿主能力和AI修订 (7) | **host-external**: `loading`, `error`, `nomodel`, `nocanvas`, `off`, `on`<br>**boundary**: `fallback` | DOCX capability/修订模式开关留宿主；fallback真实只检索/Agent分流，缺模型/画布不能伪执行。 |
| HOST-021 其他格式宿主Agent能力 (7) | **host-external**: `loading`, `error`, `unsupported`, `nomodel`, `nocanvas`, `retry`<br>**boundary**: `ready` | 其他格式能力/缺失/重试在宿主；ready必须真实对应格式agent+canvas+model，不能仅因Thread挂载判已可执行。 |
| HOST-022 执行句柄匹配与只读主对话边界 (6) | **host-external**: `readonly`, `draftonly`, `main`<br>**boundary**: `same`, `enabled`, `stale` | 主对话只读/预填边界保持；只有同文档且当前有效句柄才执行；stale文档/版本拒绝。 |
| HOST-023 PPTX截图草稿Chat交接 (6) | **official**: `draft`, `preview`<br>**host-external**: `blocked`<br>**boundary**: `incoming`, `stale`, `restore` | 官方附件展示真实截图，宿主交接target/registry/来源活性；restore保护新稿；blocked外部提示，不升级为通用文件上传。 |
| HOST-024 Agent服务宿主与媒体边界 (6) | **boundary**: `cancel`, `image`, `media`, `invalid`, `create`, `write` | Agent cancel/媒体分析/创建/写入走原认证IO，系统选择与文档身份/解析错误真实验证；不复用KB upload作临时附件。 |
| HOST-025 轮结束失效与外部编辑交替 (5) | **host-external**: `dirty`<br>**boundary**: `complete`, `stop`, `failure`, `manual` | complete/stop/failure统一失效旧执行轮次；dirty与手动编辑不暗存；手动更改后旧续轮/undo安全拒绝。 |

### 外部参考与适用性

本轮检查项目规定的[WeKnora官网](https://weknora.weixin.qq.com/)及[公开源](https://github.com/Tencent/WeKnora)，使用同日协作研究保存的可复核HTTP证据 `vendor-full-thread/weknora-reference-recheck.json`，未重复抓取。官网HTTP200，展示 **v0.8.3**，响应113529 bytes，SHA256 **6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe**。源固定 **2c0d8384398ca756ee414eef01b71caf91e2caa6**，frontend/package.json版本 **0.8.3**；官网部署SHA未证明。

固定源`frontend/src/views/chat/components/AgentStreamDisplay.vue:62–79`是自绘thinking卡；`:421–454`成功且非空才显示动作。此证据用于检查来源/恢复/保存动作的业务分层，不用于覆盖本次官方Thread；用户指定全官方优先。WeKnora仍是KB/Agent业务参考；页面布局/视觉按项目的Obsidian主参照规则与本轮更具体的官方Thread指令处理，不引入新风格研究；未用其Markdown编辑器作Office工具栏。详细来源见`weknora-reference.md`和`full-official-thread-contract.md`。

assistant-ui固定官方源、安装SDK版本和LICENSE详见本报告文件表及配套闭包报告；最新网络文档不能覆盖固定源中明确不存在的API。

### Related specs

- `.trellis/workflow.md`：规划/原型认可后实施；研究不写产品或spec。
- `.trellis/spec/chat/frontend/conventions.md`、`pitfalls.md`：真实parts、发送/队列/截图恢复、宿主IO、流中保活、AGUI interrupt补丁。
- `.trellis/spec/shared/contract/document-agent.md`、`docx-agent.md`：显式resume、匹配文档/版本/轮、幂等与安全执行。
- `.trellis/spec/renderer/frontend/document/conventions.md`：引用同篇定位、跨篇未保存守卫、窄侧栏/显隐生命周期。
- `.trellis/spec/project/research.md`、`rules.md`、`quality.md`：研究版本/证据、主参考、真实效果验证。

## Caveats / Not Found

- 379是原inventory规划状态数量，不是浏览器通过数量；本报告仅做源码研究与映射，不运行产品测试、不声称v3已构建或无遗漏验收通过。
- **两个实施阻断项**：既有AGUI中以公共seam在入队/异步gap前冻结上下文且保留bridge所有权，尚需技术验证；完整官方始终可见+与未具备通用临时chat附件之间的产品范围冲突，尚需明确解决。
- 代码copy失败反馈、旧成功动作门控、legacy audio转换、编辑/重生成/分支持久化不是默认Thread自动保证；表内boundary必须实证或作明确范围决策。
- 历史数据库只有trace/citations/failure/agent/text，不能补造reasoning/tool全记录；外部依据/任务历史须按真实消息与轮ID定位，避免误作用于最后一问。
- 本次只写此research文件；未改产品、spec、任务元数据、v1/v2，未进行git操作。原件来源获取/闭包文件由并行source研究负责，本报告读取其同日证据而不改写。

## 同日规划补记

用户已选择“一并规划聊天附件能力（推荐）”，原报告的范围冲突已收敛为独立10-19-chat-attachments子任务，具体政策随v3审阅。公开runtime facade接缝研究在本报告之后完成，见agui-official-thread-pre-send-seam.md及两版SDK各4项probe结果；原表的boundary保留，因为这些证据不是完整Thread/产品全链验收。分类71/179/122/7仍作为原379来源责任映射，新增ATT场景独立计算。

附件tile的准确默认行为见附件复核：document Attachment tile无下载，图片才有预览；原件读取/下载及失效说明留宿主。一般file消息part的File组件与Attachment tile是不同路径，不可互相冒称。
