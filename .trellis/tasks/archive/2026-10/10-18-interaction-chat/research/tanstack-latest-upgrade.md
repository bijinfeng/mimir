# Research: TanStack AI 最新稳定版与升级边界

- Query: “tanstack ai 有没有新版本，有的话也需要升级到最新版本”
- Scope: mixed；核验 npm 稳定版本、官方发布记录及发布包源码，盘点 Mimir 当前生产调用；本报告不修改产品依赖。
- Date: 2026-10-19（Asia/Shanghai）；registry 独立核验于 2026-10-19T08:49:53Z，完整性再核验时间见 `tanstack-latest-evidence/tarball-integrity.json`。

## Findings

### 1. 已发布的最新稳定版本

| 包 | 当前产品 / v6 原型 | npm latest | 发布时间（UTC） | 升级归属 |
| --- | --- | --- | --- | --- |
| `@tanstack/ai` | 产品与原型 0.68.0 | **0.69.0** | 2026-10-13T17:52:19.096Z | 产品 server/provider/renderer；新 v7 原型 |
| `@tanstack/ai-client` | 产品未直接使用；原型 0.39.2 | **0.39.3** | 2026-10-13T17:48:04.393Z | 新 v7 原型；后续正式迁移 |
| `@tanstack/ai-react` | 产品未直接使用；原型 0.30.3 | **0.30.4** | 2026-10-13T17:48:28.230Z | 新 v7 原型；后续正式迁移 |
| `@tanstack/ai-openai` | 产品 0.22.8；原型无此 provider 执行路径 | **0.30.0** | 2026-10-13T17:48:22.842Z | 后续产品 provider/server 同批升级 |

依据不是仓库 main 或预发布号：四份 `*-registry.json` 保留 `dist-tags.latest`、准确版本、dependencies/peers、tarball URL 和 registry `dist.integrity`。四个 latest tarball 均独立重新下载，计算 SHA-512 后与 registry integrity 相等（`tarball-integrity.json`）。未发现可用 `gitHead`，因此不伪造 npm 发布对应 commit；官方发布记录另存 `*-release.json`，其正文给出变更 commit 链接。

依赖兼容约束：ai-react0.30.4 peer `@tanstack/ai ^0.69.0`，依赖 ai-client`^0.39.3`；client0.39.3 依赖 ai`^0.69.0`。ai-openai0.30.0 peer ai`^0.69.0`。应按这套组合锁定，不能只升级 React 并留 core0.68.0。ai0.69.0 继续精确依赖 `@ag-ui/core 1.0.0`，本次没有 AG-UI 核心包版本跨越。

### 2. 本地代码盘点与受影响面

- `apps/server/package.json:36`、`plugins/provider/package.json:15`、`packages/renderer/package.json:21`：三处产品 manifest 均直接固定 ai0.68.0；server/provider 另固定 ai-openai0.22.8。生产 core 升级须覆盖这三处并同步统一 lockfile，不能遗漏 renderer。
- `packages/renderer` 当前源码/配置的 `@tanstack/ai` 精确字符串搜索仅命中上述 manifest，未找到直接 import 或 require；其实际对话 UI 通过 `@mimir/chat` 与宿主桥接。故本次 renderer 的已证实直接影响是依赖解析/锁文件，后续新增能力消费应单独核对，不为升级臆造运行时代码迁移。
- `plugins/provider/src/provider.ts:1`：`chat/embed/summarize`；`:2` 为 `@tanstack/ai-openai/compatible`；`:3` 为 embedding/summarize factories。`:60` 的 `buildChat` 使用 `openaiCompatible({name,baseURL,apiKey,models:[model]})(model)`，并非原生 `openaiText`。
- `plugins/provider/src/provider.ts:80`、`:84`：embedding/summarize 工厂使用 `(model,key,{baseURL})`；`:265` 的角色解析返回 `ModelAdapter.instance: unknown`，适配器构造仍在 provider 包。
- `plugins/provider/src/docx-image.ts:1`、`:39`：`createOpenaiImage`；`plugins/provider/src/docx-media.ts:1`、`:42`：`createOpenaiTranscription`。图片生成、转录必须纳入供应商回归，不能只验证文字。
- `apps/server/src/services/model.ts:40`、`:217`、`:285`：模型统一收口，目前有 `modelOptions`、`parentRunId/resume`，没有统一 `reasoning`；后续新增真实等级需要扩展此传递链。
- `apps/server/src/services/assistant-stream.ts:183`：`chatParamsFromRequestBody`；`:331` 仍按 deepReasoning 选角色。仅替换包不会自动得到会话模型选择和真实等级。
- `apps/server/src/services/docx-agent-stream.ts:147`、`:163`、`:194`：续轮由服务端从持久化中断推导 parent，明确拒绝客户端提交 parentRunId；升级不应放宽这个安全与幂等边界。
- `packages/shared/src/seams.ts:216`：ModelAdapter 是未知 SDK 实例接缝；不应将供应商运行时导入 shared。
- `packages/chat/src/runtime/history.ts` 和 `apps/server/src/services/assistant-stream.ts`：历史适配和落库是后续新消息元数据保真检查点。

相关规范：`.trellis/spec/chat/frontend/{index,conventions,pitfalls}.md`、`.trellis/spec/plugin-provider/backend/index.md`、`.trellis/spec/project/rules.md`。现行 chat 规范描述 assistant-ui 和只读角色菜单，用户最新要求覆盖未来实现；不要把现行已发布合同误写成已迁移完成。

### 3. 官方 reasoning API 正好覆盖本轮需求，但兼容供应商需要单独接线

ai0.69.0 新增 `src/reasoning.ts`：

- `ReasoningLevel = off | minimal | low | medium | high | xhigh | max`。
- `ModelReasoning = false | {levels: Partial<Record<ReasoningLevel,string>>,budget:boolean}`。
- `chat({reasoning})` 可以传等级或 `{level,summary?,budgetTokens?}`，省略时使用供应商默认；精确预算仅允许支持预算的模型。
- `supportedReasoningLevels` 根据模型数据返回真实支持等级；`clampReasoningLevel` 遇不支持值会先向上再向下寻找支持等级。
- **注意**：helper 对未知/false 都返回 `['off']`，对 Mimir 的“未知能力”产品状态不能直接当成已证实不支持推理。未知应保持 unknown，不能凭一个 helper 的兜底断言供应商实际能力。

ai-openai0.30.0 的官方 native adapters 已映射：`openaiText`/`azureOpenaiText` 发送 `reasoning:{effort,summary}`，`openaiChatCompletions` 发送 `reasoning_effort`。`src/model-meta.ts:3579` 的 `OPENAI_MODEL_REASONING` 是官方模型运行时映射；未知模型名不产生请求 reasoning 字段。现有 `(model,key,{baseURL})` 工厂和 compatible subpath 仍在，新 factory 签名无需机械改名。

**关键限制**：`src/compatible/adapter.ts` 没有模型 reasoning map override 或 reasoning capability 类型参数，只增加了 `delta.reasoning_text` 的接收兼容（仍支持 reasoning_content/reasoning）。Mimir 目前恰好走此 generic compatible adapter，因此“升级+传顶层 reasoning”不能证明任意网关真的发送了思考等级。后续须为已知协议建立可靠 capability 与 native option 映射，或采用对应官方 provider adapter；以供应商实例ID+模型ID识别，不凭模型名猜能力，也不以“对话/推理角色”替代等级。

实际 API breaking change：native OpenAI adapters 从 `modelOptions` 移除旧 `reasoning` 字段和 `OpenAIReasoningOptions/WithConcise` 类型，改用顶层 `chat({reasoning})`。本地生产当前未导入这些类型、未使用这些 native adapter 调用，未发现直接命中的删除符号；未来实现应从新 API 起步。参考 [PR1692](https://github.com/TanStack/ai/pull/1692) / [7532b2b](https://github.com/TanStack/ai/commit/7532b2b09188ebd1095a60a7c5df6ef08b06916c)。

### 4. 不可遗漏的行为变化与验证边界

1. **OpenAI SDK major**：ai-openai 从依赖 openai`^6.41.0` → `^7.30.0`；openai-base 从`^0.10.12` → `^0.14.0`。apiKey/baseURL/工厂仍在并不等于所有真实网关、文件上传和媒体请求已兼容。正式升级必须覆盖 chat stream/nonstream、embed、summarize、image、transcription、错误翻译、连接探测；不能将内存 UI demo 描述成供应商回归通过。
2. **截断工具不执行**（[PR1717](https://github.com/TanStack/ai/pull/1717)）：finishReason=length 的工具调用永不执行，也不进入客户端审批，生成错误 tool result。默认 agentLoopStrategy 变成 `combineStrategies([maxIterations(5),untilFinishReason(['length'])])`。产品文档 Agent 显式传 maxIterations 时也要验证 length 路径，确保不执行残缺参数、不重复写画布、不把截断当成功。
3. **消息顺序/来源**（[PR1698](https://github.com/TanStack/ai/pull/1698)）：保留 reasoning→tool→reasoning 等真实 block 顺序；新增 ModelMessage.blockOrder、wire `metadata.tanstack.continues`、source `{provider,api,model}`、responseId/stopReason。模型切换时 SDK 会剥离目标不支持的签名、转换可读思考、重写工具ID并配对结果，失败/停止批次不转发。自定义 history/持久化/AG-UI normalizer 不得重排或丢弃这些数据；保存历史与下一次请求的清理是两件事。
4. **错误**：上下文溢出统一 `RUN_ERROR.code='context_overflow'`，原 provider code 在 rawEvent。未发现本地匹配 context_length_exceeded 的生产分支；新演示和失败翻译仍需覆盖新 code。适配器早期失败现在也先 RUN_STARTED 再 RUN_ERROR，避免重复开始事件处理回归。
5. **重试**：`retry:{maxRetries,maxWaitMs?}` 默认关闭，仅按 provider retryAfterMs 且尚未输出时重试，默认上限60s；不应擅自开启改变本轮交互。
6. **缓存默认变化**：promptCache 默认 short；部分原生 adapter 加入缓存请求字段；mid-conversation channel 在 custom baseURL/fetch/client 时默认关闭。正式升级核对实际兼容网关请求，不能假设固定 header/body 完全相同。
7. **续轮**：client0.39.2→0.39.3 的33个 src 文件和 react0.30.3→0.30.4 的21个 src 文件逐文件 SHA-256 完全一致（`source-comparison.json`）；本次 client/react 是依赖递进，并不修复原有缓存/重试语义。核心有新路由输入恢复限制（router input 的 agent turn 不能 resume），本地没有采用该路由模式。原型已有 original thread/run target 的重试缓存和“不重放已执行工具”的合同必须保留；server parentRunId 管理仍需真实 HTTP 回归。

### 5. 官方证据与本地记录

- npm stable metadata：`https://registry.npmjs.org/@tanstack%2fai`，同路径 ai-client/ai-react/ai-openai；提取 stable 的旧/新版本，无需依赖 mutable main。
- [ai0.69.0 release](https://github.com/TanStack/ai/releases/tag/%40tanstack/ai%400.69.0)
- [ai-client0.39.3 release](https://github.com/TanStack/ai/releases/tag/%40tanstack/ai-client%400.39.3)
- [ai-react0.30.4 release](https://github.com/TanStack/ai/releases/tag/%40tanstack/ai-react%400.30.4)
- [ai-openai0.30.0 release](https://github.com/TanStack/ai/releases/tag/%40tanstack/ai-openai%400.30.0)
- `research/tanstack-latest-evidence/summary.json`：版本、发布时间、integrity 和 deps 汇总。
- 同目录 registry/release JSON：原始上游证据；tarball-integrity.json：实算哈希；source-comparison.json：逐文件源码哈希与变化列表；ai-source.diff/ai-openai-source.diff：发布包源码差异。只保留相关最新源码和旧/新 package.json，未整体 vendor SDK。

### 6. WeKnora 参考复核（复用当日不可变证据）

按项目规则检查既有同日 `research/vendor-full-thread/weknora-reference-recheck.json`：官网 `https://weknora.weixin.qq.com/` HTTP200，版本0.8.3；公开源码固定 commit `2c0d8384398ca756ee414eef01b71caf91e2caa6` 的 frontend/package.json 与 AgentStreamDisplay.vue 有取证哈希。此轮复用2026-10-19证据，**不声称重新请求官网**。

它支持知识库/Agent 产品交互参考（例如回答结束再开放动作），不是本项目 TanStack 包版本或 OpenAI SDK 兼容性的权威。最新版本和 API 迁移依据必须来自上面 registry 与 TanStack 官方发布源码；WeKnora 的 Vue 实现不能证明 React hook、AG-UI resume 或供应商原生 reasoning 参数兼容。

## Caveats / Not Found

- 这是 planning 阶段研究，未改产品 manifest/lock，未运行真实供应商请求；不要写“全产品已升级且兼容”。新原型升级由独立实现/检查负责。
- npm latest 是此次核验快照，实施前需要再核验稳定标签；精确 lockfile 决定实际 OpenAI SDK patch，而非本报告依赖区间。
- ai0.68.0 的 GitHub release endpoint 返回404；旧版基线使用 npm已发布tarball及manifest，不以main猜测。其余 release 与源码均成功取得。
- React/client源码一致只说明这些package没有直接src改变，传递依赖与core行为仍改变，不构成零风险结论。
- 未找到 arbitrary compatible endpoint 自动给出可信 reasoning capability 的保证；不得用 `/models` 的 ID 清单推导全部等级。
