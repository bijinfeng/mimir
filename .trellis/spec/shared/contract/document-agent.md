# 多格式文档 Agent 通道合同

## 1. Scope / Trigger

适用当前文档页的 Agent 读取与画布编辑。`docx`、`xlsx`、`pptx`、`markdown`、`html`、`pdf` 是格式判别全集，**不是**已接入的工具全集。只有格式执行器、服务端目录和当前画布句柄都就绪时才能提供写工具。库级对话保持只读。DOCX 具体工具与修订行为另见 [docx-agent](./docx-agent.md)。

## 2. Signatures

- `packages/shared/src/document-agent.ts`：`documentAgentFormatOf(document)`、`documentAgentCanvasSupported(document)`、`documentAgentRoundSchema`、`documentAgentToolResultSchema`、`DocumentAgentCapabilities`。
- `GET /api/conversations/document-agent/capabilities?documentId=…`：读取该已鉴权文档的模型与执行器能力；格式尚未接入时 `executorReady=false`、`availableTools=[]`。
- `POST /api/chat`：`forwardedProps.runConfig` 中的 `documentAgent=true`、`agentFormat`、`documentId`、`agentRoundId`、`agentVersion`、`agentContext` 由服务端解析，并按已鉴权文档验证；旧 DOCX 字段仍兼容。
- `POST /api/conversations/:id/document-agent/:runId/cancel`：取消未消费的当前工具轮；旧 DOCX 路由暂留兼容。
- `POST /api/conversations/html-agent/{plan-page,write-document}`：按已鉴权 HTML 文档产生规划或完整页面草稿，草稿经当前画布版本与人工确认后才应用；请求形状在 `htmlPlanPageInputSchema`、`htmlWriteDocumentInputSchema`。
- `POST /api/conversations/pptx-agent/apply-ops`：接收当前未保存 PPTX 字节、文档 ID、画布版本及操作批次，由服务宿主运行固定上游操作并返回新字节、记录及版本；只接受已鉴权 PPTX 文档，不自动保存原件。
- `GET/PUT /api/conversations/markdown-agent/frontmatter`：读取与写入笔记属性。PUT 必须携带 `expectedYaml` 基线；过期返回 409，系统 `id/createdAt/updatedAt` 不可编辑，自定义 YAML 字段随普通正文保存保留在 vault。
- `ChatDocumentAgent`：`{ format?, documentId, getVersion, getContext, freezeSelection, execute, undoRound }`；`format` 省略仅兼容旧 DOCX 句柄。
- `docx_agent_runs`：原表保留，PostgreSQL 与 SQLite 均增加 `format`、`version`，旧行按 DOCX 解释。该表存关联 ID、工具名、状态和时限，不存原件正文或工具参数。

## 3. Contracts

服务端从已鉴权文档重新判别格式并确认存在可编辑视图，以 `documentAgentCatalog(format)` 选择固定工具目录，不能使用客户端提供的任意工具定义。未注册的格式返回不可用，不能因为 schema 允许该格式就宣称可写。`DocumentPanel` 把当前编辑器的句柄送到 `ChatPanel.documentAgent`；发送时冻结版本、选区和上下文，客户端仅对匹配文档、格式与轮次的句柄执行。工具结果符合 `{ ok: boolean, changed?, version?, summary?, error?, data? }`。画布修改须推进版本并保持 dirty；保存仍由用户按格式的既有路径触发。

模型可见的批量编辑工具如果接收异构 `ops`/`operations`，每项 schema 必须显式要求真实执行器使用的操作判别字段，并列出已开放的操作名、关键字段及至少一个完整调用示例。不能只声明 `items: {type:'object'}`，再依赖模型从说明文字猜测 `op`/`type`。验证失败应返回项序号与首个无效字段，且在写入前拒绝；支持范围必须与实际宿主执行器一致。真实模型调用仍需验证此合同，单元测试不能代替。

TanStack AI 负责 `RUN_FINISHED.outcome → client_tool_* → resume → parentRunId`。服务端将中断集合、格式、文档、轮次及版本持久化；续轮时校验每个结果和版本推进，并原子消费一次。失败必须以 `ok:false` 进入模型续轮。取消、切文档或后续人工修改不能把旧结果落到当前画布。

续轮 HTTP 失败时，桥接层保留已经计算的完整工具结果，提供“重试续传工具结果”；重试前再次核对当前文档、格式、轮次及画布版本，且不得重新执行画布工具。`@assistant-ui/react-ag-ui` 的项目补丁在失败后恢复同一待处理中断；若首次请求其实已到服务端，服务端原子消费会拒绝重放。版本变化或服务端拒绝时提示重新发送指令，不假称续轮成功。

首轮发出 `POST /api/chat` 前，`packages/chat/src/runtime/agent.ts` 的 `onRunInitialized` 必须经 `ChatIo.createConversation()` 建立真实会话，并将返回的同一个 ID 同时写入 `params.agent.threadId`、请求 `threadId` 和 `forwardedProps.conversationId`；续轮继续沿用该 ID。AG-UI 自行生成的临时线程 ID 不能充当已落库会话。服务端 `docx-agent-stream.ts` 在首轮和续轮都要求 `getConversation(conversationId)` 存在，并校验 `threadId === conversationId`。这样工具首次中断后的续轮可以找到会话，也阻止伪造或已删除会话的写入。

浏览器、桌面本地模式和桌面远端模式经相同的文档服务合同访问需要 Node、Rust 或 PDFium 的执行器；不能把格式工具只挂在 Electron IPC。各格式编辑器/宿主能力和两端实测另由格式任务证明。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| 未登录、无权读取文档、格式与原件不符 | 拒绝工具请求，不返回可写目录 |
| 格式可识别但当前视图没有真实编辑画布 | `executorReady=false`，不发起写轮 |
| 格式尚无注册目录或当前句柄 | 保持单篇只读问答，能力状态说明未接入 |
| 中断 ID 重复、集合不符、已消费或过期 | 拒绝续轮，不重复执行 |
| 首轮或续轮缺少真实会话、会话已删除 | `409 DOCX_AGENT_STALE`；不发写工具 |
| `threadId` 与 `forwardedProps.conversationId` 不一致 | `400 DOCX_AGENT_RESUME_INVALID` |
| 结果 `ok` 非布尔、`changed=true` 无推进版本、只读结果版本不符 | 拒绝或转为失败续轮，不宣称修改成功 |
| 异步期间切文档、停止、手动修改或会话失效 | 旧轮拒绝写入；dirty 和后续人工修改保留 |
| Markdown frontmatter 基线过期 | 返回 409；不覆盖人工改名、正文或属性修改 |
| 从旧版升级时仍有未消费的 DOCX 中断，迁移无法还原其画布版本 | 旧轮按过期拒绝续轮；历史仍可读、可取消，用户在当前画布重新发送指令 |

## 5. Good / Base / Bad Cases

- Good：打开有执行器的文件，先人工改动但不保存；Agent 从未保存画布读取并修改，用户保存重开仍准确。
- Base：打开尚未注册执行器的格式，侧栏仍能进行单篇问答，并明确显示编辑不可用。
- Bad：模型等待期间用户切换文档，随后迟到的工具结果或伪造的 `resume` 到达；文档不变，续轮返回过期/无效。

## 6. Tests Required

- `apps/server/src/test/document-agent-core.test.ts`：格式鉴权、工具白名单、能力目录、HTTP/SSE 续轮、错误结果、重复/过期消费及 SQLite/PostgreSQL 迁移。
- `packages/chat` 与 `packages/renderer`：当前句柄路由、格式匹配、选区/版本冻结、取消和 DOCX 回归。
- 首轮无现成会话时断言先调用 `createConversation()`，两处线程 ID 等于落库 ID；首轮工具中断后续轮沿用该 ID，已删除会话或线程 ID 不一致由服务端拒绝。
- 每个真实格式任务须补 Agent 与手动操作交替编辑、dirty、保存两次、独立读回、浏览器与桌面实测；假执行器仅验证通道，不能证明格式能力完成。
- `pnpm check` 与 `git diff --check`；第三方模型与媒体服务需使用真实配置单独验证。

## 7. Wrong vs Correct

```ts
// Wrong: 只看请求里的 format 就加载写工具。
const catalog = await documentAgentCatalog(request.format)

// Correct: 从已鉴权文档确认格式和真实画布，再选已注册目录。
const format = documentAgentFormatOf(document)
if (!format || !documentAgentCanvasSupported(document)) return unavailable()
const catalog = await documentAgentCatalog(format)
```
