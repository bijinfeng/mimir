# 对话模型选择与能力

## 1. Scope / Trigger

主对话、文档助手及聊天附件发送。模型工厂仍只在 `plugins/provider` 构造；摘要、向量化、图片和转录保留各自工厂。

## 2. Signatures

- `GET /api/config/chat-models`（鉴权）→ `ChatModelCatalog`，按供应商实例分组。
- `forwardedProps.modelSelection: { providerId, modelId, reasoningEffort? }`；非流式 `AskInput` 同形。
- `ModelProvider.chatCatalog()` / `selectedAdapter(selection)`；shared 不依赖 AI SDK。
- `ProviderModel.capabilities?` 保存显式 reasoning/parameter、vision/tools 三态及 `contextWindowTokens?`。

## 3. Contracts

模型身份是 `(providerId, modelId)`。服务端检查供应商、密钥、模型存在与 chat 用途，再验证 effort；只提交支持集合里的原始值。省略 effort 表示供应商默认，unknown 不变成 unsupported/off。默认值必须在已声明集合内。新请求不由 effort/deepReasoning 选择角色；只有旧请求延续角色绑定。

本地编辑/再生成传 `forwardedProps.historyMessageIds?: string[]`，只引用当前会话中已持久化且按时间有序、不重复的消息 ID；显式空数组表示无旧上下文。服务端从存储恢复选定前缀，不能信任客户端改写的历史正文，也不能把已放弃的后续分支或其附件重新混入模型。`CUSTOM mimir.message {messageId,clientMessageId,role}` 在终局前关联实时 SDK 与持久化身份。此能力不新增持久化分支；文档 Agent 的 edit/regenerate 明确拒绝，仍走既有守卫重试/续传。

仅 HTTPS `api.openai.com/v1` 且 SDK 已登记模型使用原生 OpenAI adapter 及官方 reasoning/input metadata；tool/context facts 固定到 `native-tool-models.ts` 的 SDK 来源/hash，升级同步复核。任意兼容网关即使同模型名，也不继承原生能力；只有明确配置能力可供 UI/服务使用。兼容 reasoning 参数只允许 `reasoning_effort` 或 `thinking.type` 显式映射，不猜测供应商语义。

`services/model.ts` 是 SDK 调用与记账收口；显式选择的实际模型信息在调用前冻结用于记账。ai 0.69 非流式 `chat()` 返回 `ChatResult {text,chunks}`，必须提取并检查 `text` 再交给旧字符串业务接口，不能依赖 unknown adapter 泛型推导出的 never。

聊天附件使用服务端校验的正文/字节。文档 Agent 要求已确认 tools，图片要求已确认 vision；缺失能力不得静默改成检索。已知上下文容量按 UTF-8 文本字节保守预算并预留回答空间，超限在附件绑定前拒绝，绝不截断附件；图片最终 token 容量错误由供应商如实返回。无已确认容量时附件请求明确拒绝。

## 4. Validation & Error Matrix

| 输入 | 结果 |
| --- | --- |
| 合法 tuple + 合法 effort | 同一模型调用并映射参数 |
| effort 省略或 reasoning unknown | 不发送 effort |
| 模型删除/非 chat/非法 effort | 422，派发前拒绝 |
| tools/vision 未确认 | Agent/图片阻止，保留草稿 |
| 附件容量未知或超限 | 明确错误，不绑定、不静默截断 |

## 5. Good / Base / Bad

Good：同名模型按供应商分组，队列发冻结 tuple。Base：兼容网关能力未知可普通文本问答，不显示虚构等级。Bad：将 high 路由到 reasoning 绑定，或因模型名包含 GPT 就启用视觉。

## 6. Tests Required

`plugins/provider/src/chat-models.test.ts` 验证同名目录、未知/删除/非法等级与真实本地 HTTP 参数；原生 SDK 请求构造证明 off→none。`apps/server/src/test/chat-model-selection.test.ts` 验证鉴权、显式选择优先、旧请求兼容、ChatResult 字符串及真实 reasoning 事件历史。`chat-stream` / `docx-agent-stream` 验证生命周期和已有版本/重放守卫。

## 7. Wrong vs Correct

```ts
// Wrong: effort changes model identity; ChatResult becomes stored object.
role: effort === 'high' ? 'reasoning' : 'chat'
return await chat(options)
// Correct: validated explicit tuple, native/compatible mapping at provider boundary.
const selected = await provider.selectedAdapter(selection)
const result = await chat({ ...options, adapter: selected.instance })
return result.text
```
