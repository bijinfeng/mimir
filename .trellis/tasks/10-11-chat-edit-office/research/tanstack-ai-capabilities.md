# TanStack AI 能力调研：DOCX 对话编辑

调研时间：2026-10-11。以仓库当前安装源码为主：`@tanstack/ai@0.55.0`、`@tanstack/ai-openai@0.22.8`、`@assistant-ui/react-ag-ui@0.0.63`。`@tanstack/ai` 包内 `skills/ai-core/` 文档标注 `library_version: 0.42.0`，可解释 API 意图，具体能力与细节以 0.55.0 的 `src/` 为准。以下是源码/现有 Mimir 代码核对结论，尚未做真实模型的端到端工具实验。

浏览器侧 `@tanstack/ai-react` 是否迁回的独立评估见 `research/chat-runtime-assessment.md`；不能把 TanStack 核心 agent 的选型等同于 React UI 运行时的选型。

## 结论与选型

TanStack AI 已提供本任务需要的**模型工具循环**。首版应让它负责编排模型迭代、工具调用、AG-UI 事件和客户端工具续轮；GenOffice 的 `AgentLoop` 不作为 Mimir 的第二套模型循环引入。GenOffice 仍用于固定 36 个 DOCX 工具的名称、参数、语义、提示词及编辑原语。Mimir 自己负责文档版本、快照、保存和服务配置。

## 已确认的能力

| 能力 | 0.55.0 证据 | 本任务用法/限制 |
|---|---|---|
| 工具定义与服务端工具 | `src/activities/chat/index.ts` 的 `tools`；`skills/ai-core/tool-calling/SKILL.md` 的 `toolDefinition().server()` | `web_search`、`image_search` 等可由服务端执行；36 个工具的输入须以 Zod/JSON Schema 校验，不能信任模型参数 |
| 客户端工具 | `chat/index.ts` 对无 `execute` 工具产生 `ClientToolRequest`；`chat-params.ts` 的 `mergeAgentTools`；assistant-ui 的 `useAssistantTool`、`addToolResult` 是另一套 AG-UI 工具路径 | DOCX 模型在浏览器内，正文与附加结构工具用客户端执行。不要无过滤地合并请求里的任意 `params.tools`，服务端只暴露当前 DOCX 的白名单；两种客户端工具路径须显式适配，见 `research/chat-runtime-assessment.md` |
| 续轮/中断 | `chat/index.ts` 的 `resume`、client tool result、interrupt 处理；`chatParamsFromRequestBody` 返回 `resume/threadId/runId/parentRunId` | TanStack 0.55 的 client tool 以 `RUN_FINISHED.outcome=interrupt` 终结，无持久化续轮需要 `resume` 和 `parentRunId`。assistant-ui 普通 `addToolResult` 自动续轮不足以满足该合同；必须做协议桥或迁移客户端并实测 |
| Agent 循环与预算 | `chat/index.ts` 默认 `maxIterations(5)`；`agent-loop-strategies.ts` 说明限制的是模型轮数，不是工具调用数；middleware 有 `onBeforeToolCall`/`onShouldContinue` | 完整 DOCX 操作可能超过五轮，要显式设合理轮数上限，并另设工具调用、时间、输出和媒体预算。一个模型轮可包含多个工具调用；写入要串行或拒绝陈旧目标 |
| 流与状态 | `toServerSentEventsResponse()` 输出 AG-UI；`TOOL_CALL_START/ARGS/END/RESULT`、`RUN_FINISHED.outcome` 等 | 可直接沿现有 ChatPanel 展示工具进度；消息 part 与历史恢复要验证包含每次工具结果 |
| 审批与中间件 | `needsApproval`、`onBeforeToolCall`、`onAfterToolCall`、`onUsage`，支持中断/恢复 | 用户已选择 GenOffice 的直接编辑交互，因此不把每次改动做审批门；中间件用于鉴权、限额、追踪、失败分类。回退是产品层动作，不是 TanStack 审批 |
| 图片生成 | `@tanstack/ai` 导出 `generateImage`；`@tanstack/ai-openai` 导出 `openaiImage` | 可用 SDK 的图片活动，不需单独手写图像 API。provider 插件需新增图片适配与配置，用量/失败仍要进入 Mimir 记账 |
| 多模态输入 | 核心 `chat()` 接收 `ImagePart`、`AudioPart`、`VideoPart` 类型；OpenAI 兼容适配器裸模型默认声明 `['text','image']`（`compatible/types.ts`） | SDK 的通用类型不等于当前配置模型实际支持。图片/音频/视频分析须按具体适配器和模型验证；音视频不可依赖当前 generic chat 模型自动可用 |
| Provider 原生工具 | `chat()` 支持 provider tools；OpenAI 包含 `webSearchTool` | 该工具依赖特定 provider/API，不是 GenOffice 的 provider 无关 `web_search`。首版仍需独立可配置文本/图片检索服务，再封装为 TanStack server tools |

## Mimir 当前差距

- `apps/server/src/services/model.ts` 的 `ModelCallOptions` 只传 `messages/systemPrompts/modelOptions/stream`，没有 `tools`、`threadId`、`runId`、`resume`、`agentLoopStrategy`。新增 agent 能力应扩展这条统一入口和 provider 插件，而非新建绕过记账的模型调用。
- 当前用量跟踪只取 `onFinish.info.usage`。TanStack 包内 middleware 文档与源码显示 `onUsage` 对每次模型用量事件触发；多轮 agent 和独立长文写作应逐次记账/汇总，不能把终局一轮当成整轮总消耗。
- `apps/server/src/services/assistant-stream.ts` 自己发外层 `RUN_STARTED/RUN_FINISHED`，且把 TanStack 模型流的同名事件剥掉。现在问答正确，但客户端工具的 `RUN_FINISHED.outcome.type === 'interrupt'`、中断 ID 和续轮信息也会被剥掉。DOCX agent 路径必须保留 TanStack 的中断合同，同时维持 AG-UI 一个 run 只有一组合法生命周期事件；不能仅将工具定义塞进当前 `streamModelChat`。
- `assistant-stream.ts` 当前单篇上下文从数据库已保存正文取；DOCX agent 要从画布快照/读取工具获取当前未保存状态。服务端不得从用户提供的 `forwardedProps` 直接覆盖 `adapter/tools/role`，当前 DOCX 身份需鉴权。
- `@assistant-ui/react-ag-ui` 源码确认前端工具注册与 `addToolResult`、`resume` 路径存在，但普通工具结果和 TanStack 的 interrupt 是不同状态分支；仅注册 `useAssistantTool` 不会自动满足后者。首个端到端实验要验证 `outcome`、`resume`、`parentRunId` 和 Mimir 外层 run 生命周期。

## 实施前技术验证（不改变产品范围）

1. 使用当前 provider 接缝和真实 AG-UI 流做 `get_document_context`（客户端读）→ 工具结果 → 最终回答，再做 `insert_content`（客户端写）→ 续轮；检查 `RUN_FINISHED.outcome`、`resume`、`parentRunId`、工具在同一聊天轮中只执行一次，失败/停止不重放。协议桥若不可靠，则迁移浏览器运行时到兼容 TanStack React 并复测原交互。
2. 分别验证服务端 TanStack 工具 `web_search` 与客户端工具在同一轮共存、调用顺序、`RUN_FINISHED.outcome`、历史恢复及用量 `onUsage`。
3. 对配置的模型做 function calling 能力探测。`openaiCompatible` 的默认类型声明不能替代真实探测；不支持工具调用的模型在侧栏给出可操作的设置错误，不允许生成“已修改”虚假回答。
4. `generateImage()` 用实际配置的图片模型验证输出字节、有效期和用量；媒体分析对图片、音频、视频分别验证所选 TanStack 适配器/模型。若一类缺口需要转录/抽帧，转换后仍经 `model.ts` 的 TanStack 调用分析。
