# 对话运行时评估：TanStack AI React 与 assistant-ui AG-UI

调研时间：2026-10-11。范围是浏览器对话运行时与 DOCX 工具执行的关系；模型编排仍由 TanStack AI 承担。依据为当前 Mimir 代码、D-099，以及 npm 发布包 `@tanstack/ai-react@0.24.1` / `@tanstack/ai-client@0.31.1`（兼容当前 `@tanstack/ai@0.55.0`）的源码与类型。另核对最新 `@tanstack/ai-react@0.30.3` / `@tanstack/ai-client@0.39.2`，它们要求核心 `^0.68.0`，不能直接混装到当前仓库。未完成真实模型的端到端协议实验。

## 结论

**现有组合适合当前检索问答，但不能原样承担 TanStack DOCX 客户端工具循环。建议先保留 `@assistant-ui/react` + `@assistant-ui/react-ag-ui` 的消息/UI 运行时，实施一个明确的 TanStack interrupt 协议桥，并把真实续轮实验设为进入 36 工具实现的硬门槛。** TanStack AI 继续作为唯一模型与工具编排核心。若协议桥无法可靠完成一次读工具、一次写工具及混合工具的续轮，应迁移整个 `@mimir/chat` 的浏览器运行时到与核心匹配的 TanStack React 客户端，连同消息映射一起重做；不允许通过伪造成功结果绕过。

这不是对 TanStack React 能力的否定。兼容版本已有自动客户端工具执行、`addToolResult`、interrupt/resume、FIFO 消息队列以及持久化选项；D-099 里“旧 `useChat` 没有队列”的描述不应再当作当前能力判断。选型理由是**当前 Mimir 数据契约和迁移成本**，而不是 TanStack 包不支持工具。

## 对照证据

| 关注点 | TanStack React 0.24.1 + client 0.31.1 | Mimir 当前 assistant-ui 0.15.23 + AG-UI 0.0.63 | 结论 |
|---|---|---|---|
| 客户端 DOCX 工具 | `useChat({ tools, context })` 自动执行 client tools；返回 `addToolResult`、`resumeInterrupts` | `useAssistantTool` 注册执行；运行时能分别处理工具结果和 AG-UI interrupt | **两种续轮路径并不自动等价**，见下文 |
| 消息队列 | 默认成功后 FIFO；错误、停止会丢弃待发队列（client `types.ts`） | 当前 Mimir 启用队列，并在取消时将首条待发文本放回输入框（`use-mimir-runtime.ts`） | 迁回需重做“停止后保留草稿”语义 |
| 历史消息 | `initialMessages` 仍在 `useMemo` 构造 client 时一次读取；新增持久化/服务端 hydrate 选项，但需适配 Mimir 的服务端历史接口 | 现有 history adapter `load()` 将落库记录映射为同名 data parts，异步加载由运行时管理 | 迁回需另写历史 hydrate 与状态映射 |
| 检索、引用、失败 | `CUSTOM` 交给 `onCustomEvent` 回调；`UIMessage.parts` 没有通用 data part 类型（client `types.ts`） | 当前 `mimir.trace`、`mimir.citations`、`mimir.failure` 与正文同属消息 part；实时和历史同形 | D-099 的双轨关联问题仍是实际迁移负担 |
| 组件与无障碍 | `createChatUI` 提供 typed UI 组合件，可构建新界面 | `ChatPanel`、`MessageItem`、`Composer`、队列与焦点行为已在 assistant-ui primitives 上实现和测试 | 迁移是组件包重构，不只是换 hook |
| 版本兼容 | 0.24.1 的核心 peer 为 `^0.54.0`；最新 0.30.3 要 `^0.68.0` | 当前版本已锁在仓库中 | 不能用最新客户端而保持 0.55 核心 |

## 当前方案的真实问题

1. `assistant-stream.ts` 为检索问答自行包装 AG-UI 生命周期，剥掉 TanStack 模型流的 `RUN_FINISHED`。一旦复用该逻辑给 DOCX client tool，就会丢掉 `outcome` 和续轮线索。问题在服务端协议边界，换 React hook 不会修复。
2. **发现具体协议差异**：TanStack 0.55 对 client tool 发 `RUN_FINISHED.outcome.type='interrupt'`，其中 interrupt ID 是 `client_tool_<toolCallId>`；无持久化的续轮还要求 `parentRunId` 定位原 run（核心 `chat/index.ts` 的 `build...Interrupts` 与 `applyEphemeralInterruptResume`）。assistant-ui AG-UI 0.0.63 将这种终局标成 `requires-action/interrupt`；`addToolResult` 的自动续轮只在 `requires-action/tool-calls` 路径触发（`run-aggregator.js`、`AgUiThreadRuntimeCore.js`），而它的普通 `startResumeRun` 不自动携带 TanStack 需要的 `resume` 与 `parentRunId`。因此仅注册 `useAssistantTool` 加 `addToolResult` **不足以证明可续轮**。
3. 可行的局部桥是统一执行 DOCX 工具、记录真实结果，并用 assistant-ui 的 `useAgUiSubmitInterruptResponses` 交回匹配的 interrupt payload；同时在传输/服务端保存并核验 `parentRunId`，将 TanStack 需要的 `resume` 交给 `chat()`。必须实验验证工具 UI part 与结果写入不会触发第二次续轮或重复执行。若无法保证这些不变量，就采用 TanStack 原生客户端，避免继续堆协议补丁。
4. assistant-ui 的工具注册或上述协议桥与 TanStack 的工具 schema 需由单一合同生成或校验，避免 36 个名称与参数分别维护。服务端仍须按身份/文档授权白名单，不信任前端上报的工具。
5. 当前历史消息 schema 只有文本、检索过程、引用与失败；DOCX 多轮工具记录要有可重放的结果摘要/状态，不能只留临时前端 part，也不能把大块文档正文或密钥落入聊天历史。

## 实施判断门

在接入其余工具前做最小垂直实验：同一文档中的 `get_document_context` → client result → 模型续轮，再做 `insert_content` → 保存前 dirty → 最终回答；另外覆盖 server tool 与 client tool 混用、停止和历史重载。确认 AG-UI 每次 run 的生命周期合法、`RUN_FINISHED.outcome`、`resume`、`parentRunId` 连贯、客户端工具只执行一次、result/错误可被模型读到、排队消息与原问答不回归。若现有 assistant-ui 协议桥做不到，应迁移到兼容版本的 TanStack React 客户端，并补齐 D-099 要求的历史/实时 part 关联与停止草稿行为；不要并行维护两套浏览器消息运行时。
