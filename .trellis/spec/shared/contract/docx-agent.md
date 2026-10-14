# DOCX 对话编辑合同

多格式共用通道、能力查询和续轮验证见 [document-agent](./document-agent.md)；本页记录 DOCX 专有工具与旧入口兼容。

## 1. Scope / Trigger

仅在已打开、已鉴权的 DOCX 文档页提供写工具。`packages/shared/src/docx-agent.ts` 与
`docx-office-tools.ts` 是模型可见的 36 个工具及 `apply_ops` 15 种操作的名称、
参数目录；`packages/office/src/agent/docx-agent.ts` 是画布执行与写入校验边界。
新增或调整工具时必须同时检查这两端、侧栏能力状态和固定 GenOffice 版本清单。

## 2. Signatures

- `POST /api/chat`：AG-UI 流。DOCX 轮从 `forwardedProps.runConfig` 传
  `documentId`、`docxRoundId`、`docxVersion`、`docxContext`；续轮使用
  TanStack 的 `resume[]`，`parentRunId` 由服务端查持久中断记录后填写。
- `GET /api/conversations/docx-agent/capabilities?documentId=…`：按当前 DOCX 和
  已配置供应商返回 `modelReady`、`availableTools`、`unavailableTools`、`mediaKinds`。
- `POST /api/conversations/:id/docx-agent/:runId/cancel`：取消未处理的客户端工具轮。
- `DocxAgentHandle.execute(tool, args, { expectedVersion, roundId, signal })`：只对
  当前编辑器执行；`getContext()` 返回未保存画布，`freezeSelection(roundId)` 固定选区，
  `undoRound(roundId)` 只在后续编辑未改变画布时回退。
- `docx_agent_runs`（PostgreSQL 与 SQLite 同步迁移）：只保存关联 ID、工具名、
  状态、过期时间和消费时间；不保存工具参数或文档正文。

## 3. Contracts

TanStack AI `chat()` 是模型工具循环。需要画布的调用以 `RUN_FINISHED.outcome`
中断，由 `DocxInterruptBridge` 执行并提交全部 `client_tool_<toolCallId>` 结果，
服务端按会话、文档、轮次和中断 ID 消费一次，再以 `parentRunId` 续轮。
工具结果以 `{ ok, summary, changed, version, error?, data? }` 返回；实际失败需让
模型看到 `ok: false`。浏览器不上传整份原件作为服务端真相，保存仍走原有
`PUT /api/documents/:id/file`，并由用户手动触发。无聊天模型时，单篇普通检索问答
仍走原路径；DOCX 写工具不可用。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| 非 DOCX、无当前句柄、句柄已销毁 | 拒绝写入；不得落到其他文档 |
| 发送后画布版本变化、停止或切文档 | 拒绝迟到工具结果，提示重新读取 |
| `apply_ops` 任一操作参数无效 | 整批拒绝，不部分修改 |
| `resume` 中断集合不匹配、重复或过期 | `DOCX_AGENT_RESUME_INVALID` / `DOCX_AGENT_STALE`，不重复执行 |
| 模型或外部服务未配置 | 能力状态给出原因；外部失败不得伪装空结果 |
| 长文草稿未完成 | 保留或丢弃由用户选择；活动草稿计入未保存离开守卫 |

模型的 JSON Schema 只会传给供应商，不能代替 Office 执行层校验。图片抓取和
媒体输入还须在服务端验证地址、类型、大小与超时。

## 5. Good / Base / Bad Cases

- Good：用户先手动改字但不保存，再让 agent 修改；读取来自画布，写入触发 dirty，
  手动保存后 DOCX 重开仍含正文和附加结构。
- Base：只有检索问题或未配置模型；旧单篇问答保留，侧栏明确标出编辑工具不可用。
- Bad：搜索图片期间人工改动；下载返回后版本不符，工具报告失败且不插入图片。

## 6. Tests Required

- `packages/office/src/agent/docx-agent.test.ts`：逐工具/操作验证参数失败不部分写入，
  修订、批注、注释、图表、分节、样式、媒体等保存并独立重开；回退不覆盖后续手动编辑。
- `apps/server/src/test/docx-agent-stream.test.ts`、`docx-agent-runs.test.ts`：
  `outcome → resume → parentRunId`、中断只消费一次、鉴权与能力状态。
- `packages/chat/src/ChatPanel.test.tsx`：真实 HTTP/SSE 的工具结果续轮、停止、
  排队与历史；`packages/renderer` 测试侧栏和未保存守卫。
- 实际浏览器核对 DOCX 页入口、画布 dirty、离开提示、保存重开；真实模型及外部
  服务必须用配置凭据另行验证，不能把模拟测试记成真实调用。

## 7. Wrong vs Correct

```ts
// Wrong: 把模型给出的块索引直接应用到可能已被用户编辑的旧画布。
await agent.execute(tool, args)

// Correct: 将发送时版本贯穿异步调用，在实际写入前由句柄再次验证。
await agent.execute(tool, args, { expectedVersion, roundId, signal })
```
