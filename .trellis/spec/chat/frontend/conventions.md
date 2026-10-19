# packages/chat — 对话面板

`@tanstack/ai-react` 的 `useChat` 管理消息与流；`@tanstack/ai-react/ui` 官方 Headless UI 负责消息与内容分发，注册 Mimir 展示组件保留外观与业务交互。宿主只通过 `ChatIo` 和 `ChatComposerStatus` 提供动作、目录与状态。组件不得 import renderer 的 api、router 或 queryClient。

## 运行与展示入口

- `runtime/use-mimir-runtime.ts`：唯一运行入口；草稿、FIFO、发送快照、附件租约与取消。
- `runtime/transport.ts`：固定 SSE URL、真实会话 ID、最终 HTTP 参数与 Agent 目标守卫。
- `runtime/history.ts`：旧消息兼容和 `protocolEvents` 经同版 SDK reducer 重放。
- `runtime/DocxInterruptBridge.tsx`：原中断目标、画布工具执行和缓存续传。
- `runtime/runtime-context.tsx`：原生 `UIMessage`、以消息 ID 关联的 `MessageSidecar`、发送意图与中断目标。
- `ChatPanel` / `ChatThread`：历史加载、空态、消息列表、滚动与输入布局。
- `ui/`：模块级 `createChatUI` 接同一真实 `UseChatReturn`，官方 Messages/Message/Parts/Part 组织内容；官方 TextPart 接现有代码组件。不能另建运行实例或伪造 SDK queue 来适配独立 FIFO。
- `parts/MessageItem.tsx`：消息壳与相邻工具布局保留批准稿；内容通过官方公开组合入口展示，引用、失败、停止、附件和动作从该消息 sidecar 读取。
- `composer/Composer.tsx` / `ComposerMenus.tsx`：原生输入、IME、附件，以及框内模型、等级、范围菜单。

## 主题与几何

使用宿主 antd token 和 `createStyles`，不创建额外主题 provider。字号消费 `var(--mimir-chat-font-*, fallback)`，值由 renderer `ChatThemeBridge` 从 `FONT_SIZE` 注入；gutter 主视图 24px、侧栏 16px，消息列上限 808px、输入区域上限 856px。

正文使用 `reading` 字号角色。`MarkdownPart` 只在官方 `TextPart` 根上提供标题、列表、表格与行内代码排版；不要在消息壳上对所有 `p/pre/code` 写后代规则，否则思考、工具 JSON、提示和动作会被正文样式污染。代码框自行管理头部与正文边框，表格和长代码提供带可访问名称、可键盘聚焦的局部滚动区。

思考与工具折叠共用 `parts/Process.style.ts`，披露按钮以稳定 `aria-controls` 关联详情；只读协议内容使用 `ProtocolData`，不将载荷执行为页面。消息动作统一为 30px，间距由外层动作条管理，`AnswerActions` 不重复增加上边距；hover/focus 不改变几何。已存笔记的颜色须在常态、hover 和 focus 保持宿主链接角色，不能被外层 `button` 规则覆盖。

回答“更多操作”使用宿主 Ant Design Dropdown 的 body 浮层与自动边界避让，不在消息滚动区内绝对定位。菜单只列业务动作，不单列关闭按钮；点击外部、Escape、Tab 及动作完成均能收起，键盘关闭和导出完成后保留合理焦点。

输入框边界读取宿主 `fieldBorder/fieldBorderHover/fieldBorderFocus`，renderer 的这些角色复用同一 `FIELD_COLOR`，与基础表单保持一致；不要在对话包再造绿色或聚焦粗边。输入工具区按 Composer 容器宽度适配窄栏：左侧为附件、范围，右侧为模型、实际等级、发送，保持单行且 DOM/Tab 顺序与视觉顺序一致。模型触发器按内容收缩，长名称截断但保留完整 title/aria，范围可缩成“当前文档/本篇”；不要因窗口宽而忽略文档侧栏的真实容器宽。模型和范围菜单按内容收缩并受容器宽度上限约束，等级菜单更紧凑；选中标记预留空间，菜单不叠加外围内边距，键盘聚焦描边内收。上下文用量独立为辅助信息行。

`createStyles` 中消费 `var(...)`，不要声明 `--*` 自定义属性；变量声明由 `ChatHostVars` 承担。样式类必须挂到实际祖先节点，不能只定义而漏掉消费点。

遵守宿主 React Compiler 约定：不手写 memo/useMemo/useCallback、不关闭 hooks 规则、不在 render-prop 中定义内联组件。异步状态等待真实完成信号，测试不靠固定延时。

## 1. 发送、队列与历史

### Scope / Trigger

主对话与文档助手共用，按钮、Enter、建议问题、重试和队列派发遵守同一条发送合同。

### Signatures

`SendIntent` 包含 `id/text/documentId/modelSelection/scope/attachments/snapshot/config`。`ChatIo.createConversation()` 返回真实 `{id}`；`loadConversation(id)` 返回落库消息或 null。

### Contracts

1. 任何 await 之前冻结文字、模型、实际推理等级、范围、附件和文档目标。FIFO 每项独立，不在真正派发时读取新菜单或新草稿。
2. 原生输入在 IME composition 期间不提交；Shift+Enter 换行。生成期间可继续输入与排队。
3. 停止/失败保稿并取回队首，不覆盖用户已经输入的新稿；失败意图仍可显式重试或取回。
4. 首次请求先 await 真实会话创建。最终 HTTP 的 `threadId` 和 `forwardedProps.conversationId` 相同；新建 URL 更新不重挂，主动切换到另一会话才重挂。
5. 历史加载与失败分开，null 不能解释成空会话；原生协议事件经 SDK 重放，引用/失败/Agent/附件以消息 ID 关联。旧 trace 忽略。
6. 复制和存笔记只对实际成功回答可用；停止、失败及连接中断不能误存上一轮回答。`CUSTOM mimir.message` 将客户端消息 ID 映射到真实落库 ID，收到映射才允许保存，宿主按当前可见回答的确切 ID 读取。
7. 编辑与重新生成的分支只保存在当前内存中。最终请求传当前分支的 `historyMessageIds` 有序前缀，由服务端核对原会话消息并读取可信内容，不能带入已放弃尾部。文档 Agent 不开放分支重放，仍走原目标工具缓存续轮。
8. `STATE_SNAPSHOT/STATE_DELTA` 通过 `protocol-state.ts` 保留非视觉共享状态；RFC 6902 在私有副本上整批验证、原子提交，失败保留上次状态并记录诊断，不执行任何 payload。

### Validation & Error Matrix

| 条件 | 行为 |
| --- | --- |
| 模型目录未就绪、模型删除、推理等级失效 | 阻止普通模型发送并保留草稿；给可操作原因 |
| 仅检索 | 不调用模型，查询仍用原问题；不得混入聊天附件或专用截图 |
| 新会话创建或 HTTP 失败 | 显示连接中断和重试/取回；不伪造成功 |
| 主动停止 | 停止态；不得同时显示模型失败卡 |
| 历史失败 | 显示加载失败与重试，不落入空态 |

### Good / Base / Bad

Good：先选 A 模型发问，等待期间切到 B，第一轮和队列中的旧快照仍使用 A。Base：旧无协议元数据历史正常展示文本。Bad：发送前清空草稿，异步失败后无法找回，或新会话 URL 更新导致 SSE 中断。

### Tests Required

真实 HTTP/SSE 测试断言请求体、真实 ID、快照/队列/停止/失败与历史往返；不能 mock 掉 SDK 再声称验证运行时。展示测试检查 reasoning、工具、媒体、引用、失败互斥及动作状态。

### Wrong vs Correct

```ts
// Wrong: 异步后从当前菜单读取，污染已经点击发送的那一轮。
await createConversation()
const selection = currentSelection
// Correct: 先冻结意图，再进行异步准备和最终目标复核。
const intent = structuredClone(sendIntent)
await prepare(intent)
```

## 2. 模型、推理与附件

模型以 `{providerId, modelId}` 寻址，按配置供应商分组，不显示“对话模型/思考模型”分区。等级只读取所选模型 `reasoning` 能力；不支持或未知时不造 low/high 等选项、不按角色换模型。设置入口与会话内选择分开，主视图与侧栏都保留框内控件。

附件动作从 `ChatIo` 注入。上传/解析状态如实呈现，成功取得的 `{id,sha256}` 进入冻结意图；队列与在途期间维持租约并续约，删除/取消/卸载正确释放。重载历史的原件链接经宿主 transport 映射，携带真实鉴权。限额与服务端合同只维护在[聊天附件合同](../../shared/contract/chat-attachments.md)。

## 3. 文档 Agent 与专用截图

文档格式、来源寿命、文档 ID、页、画布版本和轮次在读取、真正派发、执行与续轮前后复核。不能将通用聊天附件冒充文档编辑输入。

`RUN_FINISHED.outcome=interrupt` 走显式 resume；普通 `addToolResult` 不能代替续轮。执行后续传 HTTP 失败，桥保留完整缓存结果及原 `threadId/runId`，只重传缓存，绝不重执行画布工具。SDK 返回 fulfilled false 也按失败处理。版本变化、来源切换或服务端拒绝需重新发指令。详见[文档 Agent 合同](../../shared/contract/document-agent.md)。

`ChatDraft.snapshot` 仍是有界内存中的真实 PNG，来源校验函数不能序列化；发送时转为原生图片 content part，bytes 不放入提示词或 Agent context。失败或停止保留文字、图片和目标；恢复不得覆盖新草稿。截图不是通用持久化聊天附件，刷新后不冒充可恢复。

## 测试入口

`pnpm --filter @mimir/chat test`。`history.test.ts` 验证真实 SDK 历史重放，`parts.test.tsx` 验证展示，`ChatPanel.test.tsx` 使用本地真实 HTTP/SSE 服务验证行为。DOM 垫片在组件 import 前安装；异步测试必须结算自身创建的链再卸载。
