# Research: Renderer 对话宿主与 Agent 交接

- Query: 主对话/历史/搜索草稿/文档侧栏/笔记保存/Agent宿主的实际全部入口与恢复路径
- Scope: internal
- Date: 2026-10-18

## Findings

共 25 组、129 个来源语义状态。机器清单见同目录 chat-host-inventory.json；不是 GUI 通过次数。

### Files found

- `packages/renderer/src/routes/_app.chat.tsx`：主对话寻址、ownedId防重挂、历史失败。
- `packages/renderer/src/routes/_app.tsx`：跨栏瞬时草稿、引用返回与搜索交接。
- `packages/renderer/src/components/NavSidebar.tsx`、`nav/menu-items.tsx`：新建与12条历史、当前项、查询失败和标题tooltip。
- `packages/renderer/src/components/document/DocChatSidebar.tsx`：同篇ChatPanel、能力查询、Agent句柄与模型设置交接。
- `packages/renderer/src/components/DocumentPanel.tsx`：选区/预设/截图草稿、保活隐藏、窄侧栏焦点、同篇依据。
- `packages/renderer/src/lib/chat-io.ts`、`use-chat-composer-status.ts`：数据与动作边界。
- `packages/renderer/src/components/document/OfficeSourceEditor.tsx`：五种原件格式适配与真实保存边界；`NoteEditor.tsx`接Markdown。

### Code patterns and coverage

#### HOST-001 主对话新建入口与聚焦

来源：`packages/renderer/src/routes/_app.chat.tsx:47`；`packages/renderer/src/routes/_app.chat.tsx:134`；`packages/renderer/src/components/NavSidebar.tsx:112`

- `HOST-001.fresh` 新建对话：/chat?scope=all，无id；ChatPanel new实例；focusComposer=true。
- `HOST-001.nav` 导航新建：点击新建对话进入/chat，未保存守卫由导航宿主处理。
- `HOST-001.prefill` 预填入口：draft来自askDraft；不是自动发送。
- `HOST-001.existing` 已有会话：有id时不强制聚焦输入框。

控件：新建对话、输入框
转换：新建对话→空态→输入→显式发送
边界：问候、输入、发送及流式由packages/chat；宿主只寻址。

#### HOST-002 新会话真实ID建立与流保留

来源：`packages/renderer/src/routes/_app.chat.tsx:67`；`packages/renderer/src/routes/_app.chat.tsx:102`；`packages/renderer/src/lib/chat-io.ts:55`

- `HOST-002.new` 发送前：panelKey=new；服务端建会话。
- `HOST-002.created` 首问建会话完成：setOwnedId、清askDraft、把真实ID写入URL。
- `HOST-002.streaming` 保留正在生成内容：URL写入的是ownedId时仍key=new，不重挂载；避免过程/引用丢失。
- `HOST-002.failure` 建立失败：API rejection交给包运行时，不在宿主伪造已建成功。

控件：发送
转换：首问→POST建立→写URL→原ChatPanel继续流式
边界：真实建会话/API与失败交packages/chat运行时；HTML模拟，不伪造服务端落库。

#### HOST-003 历史会话加载与切换

来源：`packages/renderer/src/routes/_app.chat.tsx:69`；`packages/renderer/src/routes/_app.chat.tsx:83`；`packages/renderer/src/lib/chat-io.ts:59`

- `HOST-003.loading` 读取历史：非ownedId启用conversation查询；包内加载骨架。
- `HOST-003.loaded` 历史可读：io.loadConversation返回messages；保留实际消息类型。
- `HOST-003.switch` 切换另一会话：非ownedId按会话ID重挂载，读取另一历史。
- `HOST-003.refresh` 刷新URL恢复：会话ID在URL，刷新可寻址；草稿不持久。

控件：历史会话行
转换：会话A→会话B→B骨架→B历史
边界：切换卸载可能切断当前客户端流；原型不可承诺后台跨会话继续生成。

#### HOST-004 历史读取失败和恢复

来源：`packages/renderer/src/routes/_app.chat.tsx:117`；`packages/renderer/src/components/LoadError.tsx:29`

- `HOST-004.error` 会话读取失败：实际文案：会话读取失败 / 记录还在，重试一下就能打开。role=alert。
- `HOST-004.retry` 重试读取：重试调用conversationQuery.refetch；当前按钮没有显式loading prop。
- `HOST-004.recovered` 恢复历史：成功后重新呈现ChatPanel，不展示新对话空态。
- `HOST-004.again` 再次失败：保留错误区可再点重试，不自动宣称记录存在或必能恢复。

控件：重试
转换：读取失败→重试→历史或同一错误
边界：当前文案对记录完好与恢复过度保证；提出中性措辞属文案建议，非新增恢复能力。

#### HOST-005 历史导航列表完整状态

来源：`packages/renderer/src/components/NavSidebar.tsx:48`；`packages/renderer/src/components/NavSidebar.tsx:147`；`packages/renderer/src/components/NavSidebar.tsx:271`；`packages/renderer/src/components/nav/menu-items.tsx:81`

- `HOST-005.loading` 正在读取对话：独立role=status，不当成空列表。
- `HOST-005.empty` 暂无对话：暂无对话，点上方“新建对话”。
- `HOST-005.list` 可选历史：单一“对话”分组；最多12条、相对时间、空标题新对话。
- `HOST-005.active` 当前会话：aria-current=page；超过前12条的当前项替换最后一条保留可见。
- `HOST-005.error` 首次读取失败：对话读取失败+重试。
- `HOST-005.stale` 缓存后刷新失败：对话刷新失败+重试，同时保留旧行可打开。
- `HOST-005.retry` 重新读取：重试按钮按isFetching展示loading。
- `HOST-005.long` 长标题：省略，hover或菜单项键盘focus显示完整标题tooltip。

控件：会话行、重试、标题tooltip
转换：列表→选择→/chat?id；失败→重试→旧缓存或新列表
边界：导航模块已批准外壳保持；本模块覆盖对话内容与交接，不新增改名/删除/分页。

#### HOST-006 窄屏对话导航及未保存离开

来源：`packages/renderer/src/routes/_app.tsx:249`；`packages/renderer/src/components/NavSidebar.tsx:112`；`packages/renderer/src/components/NavSidebar.tsx:163`；`packages/renderer/src/lib/unsaved.tsx:1`

- `HOST-006.wide` 宽屏导航：长期折叠偏好。
- `HOST-006.narrow` ≤880px窗口：强制紧凑栏，临时导航抽屉不覆盖长期偏好。
- `HOST-006.overlay` 抽屉打开：Tab焦点限制；行动导航后关闭抽屉。
- `HOST-006.guard` 未保存离开：新建或选历史先runGuarded。
- `HOST-006.cancel` 继续编辑：不执行导航，保留原文改动；精确弹窗复用文档模块。

控件：展开导航、历史行、新建对话、离开弹窗
转换：窄导航→抽屉→选历史→守卫→目标对话
边界：守卫行为和窄导航已在前模块验收，Chat不改变真实保存能力。

#### HOST-007 全局搜索问题交接

来源：`packages/renderer/src/components/CommandPalette.tsx:359`；`packages/renderer/src/routes/_app.tsx:490`

- `HOST-007.empty` 没有问题：空值不渲染AI交接行。
- `HOST-007.ready` 带到新对话：只预填问题，不自动发送；带箭头。
- `HOST-007.blocked` 组合输入或等待：busy/composing时禁用。
- `HOST-007.guard` 离开保护：宿主runPaletteGuarded先确认，再关闭搜索、setAskDraft并导航。
- `HOST-007.draft` 新对话预填：保留当前scope；无id的新会话草稿，用户决定发送。

控件：带到新对话
转换：搜索输入→交接→必要离开保护→新对话草稿→显式发送
边界：搜索弹窗整体属于模块3；仅登记Chat交接终点，禁止点交接立即产生用量。

#### HOST-008 瞬时草稿寿命与清理

来源：`packages/renderer/src/lib/app-shell-context.ts:22`；`packages/renderer/src/routes/_app.tsx:211`；`packages/renderer/src/routes/_app.chat.tsx:102`

- `HOST-008.memory` 内存草稿：AskDraft包含text、可选documentId、snapshot；不写URL。
- `HOST-008.created` 会话创建完成：主视图onConversationCreated把askDraft清空。
- `HOST-008.refresh` 页面刷新：草稿消失，不能宣称自动持久化。
- `HOST-008.sidebar` 文档范围草稿：侧栏持有独立draft，不占主对话URL高亮。

控件：草稿输入
转换：交接→内存草稿→创建会话→清理
边界：文本编辑、发送后恢复、队列草稿归packages/chat；宿主不保证页面刷新恢复图片或未发文字。

#### HOST-009 主对话引用与返回入口

来源：`packages/renderer/src/routes/_app.tsx:295`；`packages/renderer/src/routes/_app.tsx:400`；`packages/renderer/src/routes/_app.chat.tsx:139`；`packages/renderer/src/components/document/DocumentHeader.tsx:58`

- `HOST-009.citation` 点击依据：保存当前会话id、cameFromChat与Citation，打开all范围文档。
- `HOST-009.document` 定位原文：文档模块消费snippet/start/end等定位，顶部显示返回对话。
- `HOST-009.return` 返回对话：导航回lastConversationId。
- `HOST-009.plain` 普通打开文档：openDocument会清cameFromChat。

控件：引用、返回对话
转换：回答依据→文档原文→返回原会话
边界：定位/无匹配反馈由文档模块；主对话原组件卸载，不能声称返回保留未落库流。

#### HOST-010 保存回答为笔记的宿主IO

来源：`packages/renderer/src/lib/chat-io.ts:80`；`packages/renderer/src/routes/_app.chat.tsx:140`；`packages/renderer/src/components/document/DocChatSidebar.tsx:213`

- `HOST-010.lookup` 读取已落库回答：按会话重新GET，toReversed选最后一条assistant，非传入界面乐观消息ID。
- `HOST-010.none` 没有可保存回答：throw没有可保存的回答；包动作条显示失败。
- `HOST-010.save` 写入笔记：POST saveAsNote(messageId)，服务端按消息ID幂等。
- `HOST-010.success` 笔记创建完成：返回noteId、失效会话query；包显示已保存/打开笔记。
- `HOST-010.open` 打开笔记：主对话进入all范围，侧栏走未保存守卫。
- `HOST-010.failure` API失败：原错误抛回包，不自行导航或伪称成功。

控件：存成笔记、打开笔记
转换：存成笔记→真实落库消息ID→POST→成功反馈→打开
边界：动作样式/复制/加载提示由packages/chat；现实现取最后助手，不能在原型宣称点击任意旧回答能精确保存其原文，需在方案标出语义现状。

#### HOST-011 输入上下文文档数据三态

来源：`packages/renderer/src/lib/use-chat-composer-status.ts:23`

- `HOST-011.loading` 读取可选文档：documents.isLoading独立传出。
- `HOST-011.empty` 没有文档：成功且items为空，不能与失败混淆。
- `HOST-011.error` 文档读取失败：isError独立传出，refetch可重试。
- `HOST-011.items` 可选文档：仅传id/title；取api.documents.list({})。
- `HOST-011.retry` 重试列表：由包菜单触发refetch。

控件：添加上下文、重试
转换：打开菜单→读取/失败/空/选项→重试或选择
边界：菜单与已选范围显示由packages/chat；此入口没有格式上传能力。

#### HOST-012 模型绑定与容量数据

来源：`packages/renderer/src/lib/use-chat-composer-status.ts:28`；`packages/renderer/src/routes/_app.chat.tsx:108`；`packages/renderer/src/components/document/DocChatSidebar.tsx:112`

- `HOST-012.bound` 两角色模型：从全局config.modelConfig.roles找chat/reasoning模型。
- `HOST-012.missing` 未配置：传undefined，包显示未配置；宿主未传config loading/error标志。
- `HOST-012.usage` 主对话容量：仅有conversationId才查context-usage。
- `HOST-012.nousage` 侧栏无容量数据：侧栏传undefined禁用用量query；usage=null，无记账不渲染。
- `HOST-012.manage` 管理模型：显式去/settings?scope=all&section=models；侧栏先守卫。

控件：当前模型、管理模型、上下文容量
转换：模型菜单→管理模型→设置；容量仅展示存在的数据
边界：模型项不可会话级切换；不能给侧栏补强度/容量入口或制造config重试能力。

#### HOST-013 主侧栏共同主题宿主

来源：`packages/renderer/src/components/chat/ChatThemeBridge.tsx:28`；`packages/renderer/src/components/document/DocChatSidebar.tsx:208`

- `HOST-013.main` 主对话：FONT_SIZE角色变量，共用宿主provider；默认gutter40px。
- `HOST-013.sidebar` 文档侧栏：同一桥只改gutter16px。
- `HOST-013.dark` 深色继承：继承既有主题，不新开带theme的ConfigProvider。
- `HOST-013.narrow` 窄容器：宽度与换行以实际容器，保持同字体角色。

控件：无独立动作控件。
转换：浅色↔深色；主对话↔侧栏
边界：颜色消费由包组件；避免逐页硬编码主题或覆盖全部Office。

#### HOST-014 文档助手入口、范围和空态

来源：`packages/renderer/src/components/DocumentPanel.tsx:335`；`packages/renderer/src/components/document/DocChatSidebar.tsx:140`；`packages/renderer/src/components/document/DocChatSidebar.tsx:62`；`packages/renderer/src/components/document/DocChatSidebar.tsx:209`

- `HOST-014.open` 问AI打开：文档助手头、关闭按钮、当前文档标题范围行。
- `HOST-014.empty` 首次空态：围绕这篇文档提问 / 回答限定在本文，可回到原文查看依据。
- `HOST-014.scope` 单篇范围：draft.documentId锁当前篇；不改主会话URL。
- `HOST-014.reasoning` 侧栏标准强度：showReasoningControl=false；不能只隐藏按钮却保留deepReasoning=true。
- `HOST-014.long` 长标题：title属性+省略；关闭按钮固定可见。

控件：问AI、关闭侧栏、输入框
转换：文档→问AI→单篇空态→提问
边界：消息功能复用完整ChatPanel；文档外壳已批准，不重新设计文档大纲。

#### HOST-015 文档快捷问题直接发送

来源：`packages/renderer/src/components/document/DocChatGuide.tsx:7`；`packages/renderer/src/components/document/DocChatGuide.test.tsx:6`；`packages/renderer/src/components/document/DocChatSidebar.tsx:223`

- `HOST-015.idle` 三枚建议：速读本文 / 提出要点 / 解释细节。
- `HOST-015.hover` 指针悬浮：细边框转主色，不改几何。
- `HOST-015.focus` 键盘聚焦：2px focusRing、offset2px。
- `HOST-015.ask` 点后发送：分别交完整问题给ChatPanel.ask，不只预填。

控件：速读本文、提出要点、解释细节
转换：快捷提问→发送同篇问题→正常流或包内错误
边界：不把快捷问题改为二次确认；普通选区和格式预设仍只预填，二者必须区分。

#### HOST-016 文档选区与格式预设预填

来源：`packages/renderer/src/components/DocumentPanel.tsx:334`；`packages/renderer/src/components/DocumentPanel.tsx:1237`；`packages/renderer/src/components/DocumentPanel.tsx:1266`；`packages/renderer/src/components/NoteEditor.tsx:241`

- `HOST-016.selection` 就这段提问：关于这篇里这段：加引用；换行压成空格，截前200字符。
- `HOST-016.preset` 编辑器预设：instruction全文成为draft.text。
- `HOST-016.ready` 可编辑草稿：打开当前文档侧栏，用户手工发送。
- `HOST-016.reopen` 不带选区再打开：同文档已建侧栏，只把open改true，不重设draft。

控件：就这段提问、格式AI预设、发送
转换：选区/预设→侧栏预填→手工修改→发送
边界：Office具体预设菜单属于各格式模块，只在Chat说明接入和预填终点。

#### HOST-017 助手关闭、保活与重开

来源：`packages/renderer/src/components/DocumentPanel.tsx:303`；`packages/renderer/src/components/DocumentPanel.tsx:312`；`packages/renderer/src/components/DocumentPanel.tsx:1342`

- `HOST-017.opened` 侧栏打开：同文档才挂载。
- `HOST-017.hidden` 关闭隐藏：open=false、宽0、aria-hidden/inert；Chat保持挂载。
- `HOST-017.streaming` 隐藏期间生成：未卸载运行时，流仍继续。
- `HOST-017.reopen` 再次打开：回到同一个Chat保留消息。
- `HOST-017.switch` 离开当前文档：sidebarMounted=false，实际卸载；不保证流跨文档存活。
- `HOST-017.focus` 关闭回焦：回原有效触发器，否则当前AI入口。

控件：关闭侧栏、问AI
转换：打开→生成→隐藏→重新打开→仍有当前内容
边界：隐藏不等于停止，不把关闭变成Cancel；离开文档仍受宿主未保存能力约束。

#### HOST-018 助手窄容器覆盖与键盘

来源：`packages/renderer/src/components/DocumentPanel.tsx:104`；`packages/renderer/src/components/DocumentPanel.tsx:322`；`packages/renderer/src/components/DocumentPanel.tsx:1333`；`packages/renderer/src/components/document/DocumentPanel.style.ts:767`

- `HOST-018.wide` 并排侧栏：侧栏400px，文档容器实际宽>880px。
- `HOST-018.compact` 覆盖态：≤880px实际文档容器宽，侧栏min(400px,100%-32px)，不只按viewport判断。
- `HOST-018.dialog` 覆盖聚焦：role=dialog aria-modal，初始focus关闭按钮，底层正文inert。
- `HOST-018.tab` Tab循环：限当前可见可用控件，不进隐藏区。
- `HOST-018.escape` Escape层级：组合输入、已处理事件、菜单/listbox/modal不抢先关闭助手。
- `HOST-018.dismiss` 关闭恢复：遮罩或关闭/Escape隐藏，回有效触发器。
- `HOST-018.motion` 减少动态：prefers-reduced-motion不做宽度transition。

控件：关闭侧栏、透明遮罩、Tab、Shift+Tab、Escape
转换：窄栏打开→循环聚焦→关闭→回焦→重新打开
边界：既有文档模块合同需保真；不能从截图把400px固定宽套到所有窄屏。

#### HOST-019 侧栏引用定位与跨篇守卫

来源：`packages/renderer/src/components/DocumentPanel.tsx:986`；`packages/renderer/src/components/document/DocChatSidebar.tsx:212`

- `HOST-019.same` 同篇依据：setSidebarCitation，原地定位高亮，不跳路由。
- `HOST-019.cross` 跨篇依据：runGuarded后onOpenDocument；离开原文档会卸载侧栏。
- `HOST-019.guard` 未保存：离开确认保留既有当前编辑内容。
- `HOST-019.cancel` 取消离开：留在当前文档和助手。

控件：依据引用、继续编辑、离开
转换：引用→同篇高亮或跨篇守卫→目标文档
边界：引用卡样式由packages/chat；原文定位失败反馈由文档模块。

#### HOST-020 DOCX宿主能力和AI修订

来源：`packages/renderer/src/components/document/DocChatSidebar.tsx:94`；`packages/renderer/src/components/document/DocxCapabilityStatus.tsx:28`；`packages/renderer/src/lib/docx-agent-availability.ts:5`

- `HOST-020.loading` 检测中：正在检测当前文档能力…；有documentAgent才启用DOCX能力query。
- `HOST-020.error` 检测失败：读取编辑能力失败。+重试检测。
- `HOST-020.nomodel` 模型未配置：尚未配置支持工具调用的模型。+配置模型。
- `HOST-020.nocanvas` 画布未就绪：原件画布尚未就绪，暂时不能编辑。
- `HOST-020.off` 直接更新：AI修订开关关，编辑会直接更新DOCX原件文案。
- `HOST-020.on` 保留修订：开关开，DOCX编辑结果保留待审阅。
- `HOST-020.fallback` 问答回退：availableDocxAgent只在capabilities.modelReady才传agent，否则普通文档问答。

控件：AI修订、重试检测、配置模型
转换：检测→就绪/失败/未配置/无画布；AI修订开关→下一轮参数
边界：DOCX审阅接受拒绝与格式工具属于Office模块；此开关不等于自动保存。现有无能力数据且canvasReady=true可能走直接更新文案，不可把它作为已核实可执行证据。

#### HOST-021 其他格式宿主Agent能力

来源：`packages/renderer/src/components/document/DocChatSidebar.tsx:101`；`packages/renderer/src/components/document/DocChatSidebar.tsx:169`

- `HOST-021.loading` 检测能力：正在检测当前文档能力…。
- `HOST-021.error` 读取失败：读取编辑能力失败。+重试检测。
- `HOST-021.unsupported` 无执行器：当前格式未提供可执行编辑工具。
- `HOST-021.nomodel` 无工具模型：尚未配置支持工具调用的模型。+配置模型。
- `HOST-021.nocanvas` 无匹配画布：原件画布尚未就绪，暂时不能编辑。
- `HOST-021.ready` 工具就绪：当前文档已连接可执行编辑工具。
- `HOST-021.retry` 重试检测：重新GET该文档能力，非重新执行工具。

控件：重试检测、配置模型
转换：格式识别→能力检测→明确就绪/不可用原因→恢复
边界：适用于markdown/html/pdf/xlsx/pptx；不能按扩展名就宣称所有工具可用。

#### HOST-022 执行句柄匹配与只读主对话边界

来源：`packages/renderer/src/components/DocumentPanel.tsx:1391`；`packages/renderer/src/components/document/DocChatSidebar.tsx:106`；`packages/renderer/src/components/document/DocChatSidebar.tsx:217`；`packages/renderer/src/components/document/OfficeSourceEditor.tsx:163`

- `HOST-022.same` 同篇句柄：只传documentAgentHandle.documentId===doc.id。
- `HOST-022.enabled` 执行就绪：非DOCX要executorReady/modelReady和format匹配；DOCX走availableDocxAgent。
- `HOST-022.readonly` 未就绪：Agent null，普通单篇检索仍可用。
- `HOST-022.draftonly` 只读draftAgent：只给截图来源检查，不能作为执行授权。
- `HOST-022.main` 库级主对话：主路由不传Agent句柄，保持只读。
- `HOST-022.stale` 版本或源过期：包桥/Office执行器拒绝过期写入，宿主不接纳其他文档句柄。

控件：发送、工具状态
转换：当前画布→同篇句柄→冻结上下文/版本→包中断桥→当前格式执行器
边界：工具中断、成功/失败/撤销/续轮重试卡由packages/chat；Office工具粒度和画布变更由格式模块。

#### HOST-023 PPTX截图草稿Chat交接

来源：`packages/renderer/src/components/DocumentPanel.tsx:354`；`packages/renderer/src/components/document/DocChatSidebar.tsx:219`；`packages/renderer/src/components/document/OfficeSourceEditor.tsx:219`；`.trellis/spec/shared/contract/document-agent.md:55`

- `HOST-023.incoming` 美化本页草稿：只接当前doc.id的snapshot.target.documentId。
- `HOST-023.draft` 图片文字预填：setAiSidebar draft{text,documentId,snapshot}，用户显式发送。
- `HOST-023.preview` 无模型可预览：draftAgent只读检查来源；snapshotVisionReady取mediaKinds image。
- `HOST-023.blocked` 无视觉或可执行句柄：不能只检索降级；包负责原因与保留草稿。
- `HOST-023.stale` 源页版本变化：原来源/页/版本失效后拒绝发送或迟到结果。
- `HOST-023.restore` 停止失败取回：包负责同一文字/PNG/目标恢复，不能重绑当前页。

控件：美化本页（Office入口）、移除附件（包）、发送（包）、停止（包）
转换：Office真实PNG→Chat缩略图与文字→显式发送→同源校验
边界：准备截图、幻灯片比例与原件工具属于PPTX模块；本轮只演示Chat交接，HTML图片不是原生截图能力证明。

#### HOST-024 Agent服务宿主与媒体边界

来源：`packages/renderer/src/lib/chat-io.ts:102`；`packages/renderer/src/lib/chat-io.ts:106`；`packages/renderer/src/lib/chat-io.ts:121`；`packages/renderer/src/lib/chat-io.ts:148`

- `HOST-024.cancel` 停止当前Agent轮：取消API后失效conversation详情；失败抛给包。
- `HOST-024.image` 生成/抓取图片：转给已鉴权文档API、aspectRatio和signal；不重造图片服务。
- `HOST-024.media` 分析本地媒体：File准备/有界视频和可选音轨；信号停止后拒绝迟到结果。
- `HOST-024.invalid` 图片数据校验失败：数据URL前缀不匹配抛文档图片数据无效。
- `HOST-024.create` 创建新文档：API成功后失效documents；返回新文档而非默改原件。
- `HOST-024.write` 文档写作流：API onDelta转交，完成判断由真实done协议。

控件：停止、工具动作结果
转换：Chat工具→宿主API/媒体处理→工具结果→包展示
边界：媒体选择、格式Inspector、图片确认与保留部分写作属于Office；不要为库级主Chat添加不存在的通用附件上传入口。

#### HOST-025 轮结束失效与外部编辑交替

来源：`packages/renderer/src/lib/chat-io.ts:45`；`packages/renderer/src/lib/chat-io.ts:66`；`packages/renderer/src/components/document/OfficeSourceEditor.tsx:76`；`.trellis/spec/shared/contract/document-agent.md:43`

- `HOST-025.complete` 正常完成：刷新conversations/documents和当前conversation详情。
- `HOST-025.stop` 停止结束：同样刷新列表，因为服务端开头已建会话。
- `HOST-025.failure` 失败结束：同样失效，不让新会话从历史丢失。
- `HOST-025.dirty` Agent写当前画布：推进version/dirty，真实保存仍由格式既有入口。
- `HOST-025.manual` 人工继续修改：不得由旧Agent结果覆盖，版本校验仍生效。

控件：停止、格式保存入口（交接）
转换：生成结束/失败/停止→刷新导航；工具改画布→dirty→用户原保存
边界：不新增Chat自动保存原件，不把刷新失败冒充写入失败；原型只展示现有通知面。

## Related specs

- `.trellis/spec/chat/frontend/conventions.md`：状态归Chat；宿主只io和composerStatus；两条模型只读；侧栏无思考入口。
- `.trellis/spec/renderer/frontend/document/conventions.md`：关闭保活、实际容器宽覆盖、引用守卫、选区只预填、快捷问题直接发。
- `.trellis/spec/shared/contract/document-agent.md`：主Chat只读，匹配文档/源/格式/版本，截图交接有界内存，真实dirty与用户保存。
- `.trellis/spec/shared/contract/docx-agent.md`：DOCX修订/中断/取消与不重放工具。

## External references

WeKnora 固定版本及官网证据单列于 `weknora-reference.md`，不把其独有业务能力带入Mimir。

## Caveats / Not Found

- 此清单为源码盘点，没有运行新的GUI或API写入测试。已有测试只是可用证据位置，不声称本轮执行通过。
- 主路由当前错误副文案对记录存在与能恢复过度保证，可在方案提出中性文案；没有后端“确认记录完好”接口。
- 保存笔记宿主取最后一条助手；不能把任何历史回答的“保存”画成必定精准保存当前那条，需保持/明确现状或另行批准语义变更。
- 模型config未暴露loading/error状态给composer；usage失败映射null。不得给当前列杜撰错误卡和重试入口。
- 未发现会话改名、删除、独立会话总览/全历史分页、会话级自由切模型、主Chat通用文件上传入口；不要从外部参考添加。
- 文档外壳/导航/搜索的已批准视觉需保持，只在本模块覆盖交接。Office格式Inspector、生成候选确认、真实本地媒体选择/解码/画布应用在各格式模块验收。
- 规划HTML必须将读写API、真实原件编辑、下载/本地媒体与Agent执行标为模拟或交接，不可按源码状态数宣称全部真实能力通过。
