# 检索过程 UI 来源与用户反馈

2026-10-19。用户在 CHAT-005.user 标注过程块，反馈「这个我觉得很丑，是 ag-ui 协议里的交互吗，assistant-ui 有提供这种交互吗」。本次只核查来源和选项，未改产品或冻结 HTML。

## 已确认事实

- AG-UI 定义事件/消息/运行生命周期，不规定卡片底色、图标、间距或展开布局。官方事件文档 HTTP200：<https://docs.ag-ui.com/concepts/events>，可见 Run/Step、Tool Call、Reasoning、Activity 和 Custom 类型。当前在线文档不是项目安装的旧 SDK 版本升级依据。
- Mimir服务端 `apps/server/src/services/assistant-stream.ts:299` 发送 `CUSTOM / mimir.trace`，共享名见 `packages/shared/src/conversations.ts:173`。其数据是 Mimir 检索记录，不是协议强制提供的可视控件。
- `packages/chat/src/parts/MessageItem.tsx:158` 手工挂载 `TraceDisclosure`；`packages/chat/src/parts/TraceActivity.tsx:173` 自己维护开合并绘制 Brain、文案、耗时、检索细节。注释说参考官方 Reasoning，不能据此称为直接使用官方组件。
- `apps/server/src/services/retrieval-preparation.ts:98` 的 `finishTrace(steps, 1, result.hits.length ? 2 : 1, startedAt)` 表明现行 rounds/tools 是检索管线提供的统计；不能当成模型真实推理轮次或 Agent 工具调用计数。原型“2轮/3工具/4.8s”只是明确标注的fixture。
- 项目安装 `@assistant-ui/react 0.15.28`、`@assistant-ui/react-ag-ui 0.0.68`、`@ag-ui/client 0.0.59`，见 packages/chat/package.json。已安装 react 包 index.ts:328 导出 ChainOfThoughtPrimitive；其 root 源码声明组合 reasoning/tool-call 的折叠容器。样式化组件来自官方registry源码，不等同于安装react包就自动获得全部外观。

## 官方已有交互

GitHub tree API HTTP200 固定 `assistant-ui/assistant-ui` 提交 `a587b2838f2d644549d216098d54cfbeedfac522`；以下源码均 HTTP200。官网旧 `/docs/ui/reasoning` 连接重置、`/docs/ui/tool-fallback` 超时，因此改读同一官方仓库固定版本，不假称已实测在线demo。

1. [Reasoning 官方文档源](https://github.com/assistant-ui/assistant-ui/blob/a587b2838f2d644549d216098d54cfbeedfac522/apps/docs/content/elements/reasoning.mdx)：模型 reasoning 的独立可折叠轨道；流式提示、滚动正文、用户手动展开保持。`ReasoningRoot` 有 outline/ghost/muted 变体，ghost 无框无底色。官方还提供标题步骤式 `ReasoningPanel`。这两种形态可参考，但不能将检索统计伪装成模型思维。
2. [Tool fallback 官方文档源](https://github.com/assistant-ui/assistant-ui/blob/a587b2838f2d644549d216098d54cfbeedfac522/apps/docs/content/elements/tool-fallback.mdx)：实际 tool-call 的折叠摘要、状态、参数和结果。Mimir已有专用Agent中断桥，不能因此移植上游审批语义。
3. [Chain of thought 官方指南源](https://github.com/assistant-ui/assistant-ui/blob/a587b2838f2d644549d216098d54cfbeedfac522/apps/docs/content/docs/guides/chain-of-thought.mdx)：组合过程/工具的另一官方入口；与本地已安装primitive交叉验证。未据此声称当前版本的全套样式组件已接线。

## WeKnora 交叉参考

本次官网重新GET200，标题「WeKnora — 帮你找到答案，并将知识付诸实践」，明示v0.8.3，响应SHA256仍为 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`。固定公开源 `2c0d8384398ca756ee414eef01b71caf91e2caa6` 的 AgentStreamDisplay.vue 重新HTTP200：62起 thinking 分支有pending/card/header展开正文。这证明可把过程与答案分层，不要求Mimir采用它的卡片。沿语雀方向建议更轻的折叠行，保持此前可恢复状态合同。详细版本与适用边界见 weknora-reference.md。

## 待用户选择的视觉方向

建议轻量ghost折叠行：使用“正在检索知识库 / 查看检索过程”等符合真实数据的标签，弱化完成耗时，把召回通道、分词与计数放在展开细节；模型思考和实际工具调用各自命名。另一选项是官方ReasoningPanel的步骤面板，过程可见度更高，也占用更多正文空间。

这是建议，尚未选择或实施。v1冻结稿继续保留，后续若修订另存版本并重新审阅。用户此条反馈不是v1实施批准。
