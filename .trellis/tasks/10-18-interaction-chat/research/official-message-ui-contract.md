# Research: 使用 assistant-ui 官方消息交互并移除自绘检索过程

- Query: 用户要求完全去掉自绘检索过程，只采用 AG-UI / assistant-ui 实际提供的消息交互；核查固定官方源码、现有依赖兼容性、HTML 预览办法和最小未来移除链。
- Scope: mixed；本轮为 v2 规划研究与独立 HTML 原型输入，未批准产品实现。
- Date: 2026-10-19

## Findings

### 决策与语义边界

用户要求取代了 `trace-ui-origin.md` 最后一节中“保留轻量 ghost 检索行”的旧建议。v2 不再绘制自定义检索行、进度步骤、轮次数或工具统计，不将 `mimir.trace` 改名冒充 reasoning 或 tool-call。此前 v1 保留为审阅历史，不修改其冻结结果。

AG-UI 是事件与消息生命周期协议，本身不规定视觉组件。Mimir 的 `CUSTOM / mimir.trace` 是检索诊断数据；真正的 `REASONING_*` 才对应模型推理，真正的工具调用消息才交给官方 ToolFallback。`retrieval-preparation.ts:95` 的 `finishTrace(steps, 1, result.hits.length ? 2 : 1, startedAt)` 是检索管线构造的计数，不能作为模型实际推理轮数或工具调用数展示。适配器 `packages/chat/node_modules/@assistant-ui/react-ag-ui/src` 中的 event-parser 分别处理 reasoning 与 CUSTOM，二者没有自动语义转换。

### 版本、来源和授权

| 项 | 本地已安装 / 固定上游证据 | 结论 |
| --- | --- | --- |
| `@assistant-ui/react` | 本地 `0.15.28`；上游固定 ref 包版本 `0.15.29` | registry 源码稍新，不能宣称完全相同版本 |
| `@assistant-ui/react-ag-ui` | 本地 `0.0.68`；上游 `0.0.70` | 不因样式研究升级适配器或丢掉本地中断补丁 |
| `@assistant-ui/core` | 本地 `0.3.27` | 已核实 GroupedParts indicator 分支 |
| `@ag-ui/client` | 本地 `0.0.59` | 不以在线协议新功能推断旧 SDK 全部支持 |
| 官方源码 ref | `a587b2838f2d644549d216098d54cfbeedfac522` | 所有 vendored 源码固定到这一提交 |
| 授权 | 根 `LICENSE` 为 MIT；copyright (c) 2026 AgentbaseAI Inc. | substantial copies 保留 copyright 与 permission 文本 |

来源：<https://github.com/assistant-ui/assistant-ui/tree/a587b2838f2d644549d216098d54cfbeedfac522>。通过 GitHub Contents API 对固定 ref 获取，HTTP 200，base64 原样解码；部分 raw GitHub 请求超时，因此不声称所有 raw URL 获取成功。

已获取并核查 22 份未重写的源码/元数据，经原型作者确认闭包后保留其中 17 份到 `vendor-official/`；删除了无依赖的 reasoning.aui、Markdown 和 docs/ui globals 等 5 份重复参考原件。逐文件路径、大小、来源 URL、SHA256 和 retained 标记见 `vendor-official/source-manifest.json`。保留资产是原型消费的固定来源与复核证据，不是从产品运行目录生成的临时缓存。

### Files found：官方真实组件闭包

以下路径均相对官方仓库；保留的原件在 `vendor-official/` 中维持同样目录，已清理的参考项仅在 manifest 保留来源和指纹：

| 路径 | 内容与使用边界 |
| --- | --- |
| `packages/ui/src/components/react/assistant-ui/elements/reasoning.tsx` | 官方无运行时 props-driven disclosure；流式预览、渐隐、三种变体、手动开合接管 |
| `packages/ui/src/components/react/assistant-ui/elements/reasoning.aui.tsx` | 已核查后清理原件；official runtime wrapper，加入 scroll-lock 与 MarkdownText；完整使用需继续引入 Markdown 闭包 |
| `packages/ui/src/components/react/assistant-ui/elements/tool-fallback.aui.tsx` | 官方工具摘要、参数、结果、错误与审批组件；仅向真实工具事件绑定 |
| `packages/ui/src/components/react/assistant-ui/elements/collapsible-root.tsx` | **Base UI** `@base-ui/react/collapsible` 包装，不是 Radix |
| `packages/ui/src/components/react/assistant-ui/utils/useIsomorphicLayoutEffect.ts` | reasoning 的布局 effect 依赖 |
| `packages/ui/src/lib/utils.ts` | 精确为 `export { cn } from "cn";`，不要替换成另一套 class 合并实现 |
| `packages/ui/src/components/react/ui/base/button.tsx`、`textarea.tsx` | ToolFallback 的官方通用控件依赖；button 还依赖 Base UI button |
| `packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx` | 官方完整 Thread 中的 GroupedParts 与等待 indicator 源码；提取小段不等于移植整个 Thread |
| `packages/ui/src/components/react/assistant-ui/elements/markdown-text.tsx` | 已核查后清理原件；完整 reasoning.aui 的 Markdown 依赖入口，含 react-markdown、remark-gfm、copy、tooltip 等二级依赖 |
| `apps/registry/src/registry.ts` | registry 真正声明的组件依赖、CSS imports、state variants 与 keyframes |
| `apps/registry/app/globals.css` | 官方 Tailwind theme 映射、开合 variants/keyframes、默认浅深色示例 |
| `packages/tw-shimmer/src/index.css`、`package.json` | 官方 `tw-shimmer 0.4.14` 原件，Tailwind v4 utility，不是手绘动画 |
| `apps/docs/styles/globals.css`、`animate.css` | 已核查后清理原件；官网样式环境对照证据，不能把整站 CSS 注入 Mimir 产品 |
| 根 `LICENSE` 和三份包 `package.json` | 许可证及依赖/版本证据；另保存 registry 与 shimmer 包元数据 |

### 依赖和 CSS 不能漏接

`packages/ui/package.json` 明示 `@base-ui/react ^1.8.0`、`class-variance-authority ^0.7.1`、`cn ^0.4.0`。源码直接使用 lucide-react。Reasoning/Tool 本身不需要 motion 包。

`apps/registry/src/registry.ts:1465` 的 `elements-reasoning` 直接声明 lucide-react/CVA/**tw-shimmer**，并声明 `@import "tw-shimmer"` 和共享 collapsibleStateCss；`:1739` ToolFallback 同样需要 shimmer 和开合 CSS，另依赖 button/textarea。`:7` 的共享 CSS 定义兼容 `[data-state="open"]` 与 Base UI `[data-open]` 的 `data-open`/`data-closed` variants，开合高度读取 `--collapsible-panel-height`（含 Radix fallback）。遗漏会导致按钮能点、视觉动画失真。

`packages/ui/src/globals.css` 仅有 `@import "tailwindcss"`，单独导入它不足以复现交互。官方 registry 环境 `apps/registry/package.json:24,41` 使用 Tailwind `^4.3.3`。shimmer `0.4.14` 的 peer 是 `tailwindcss >=4.0.0-0`，但这不等于证明所有 registry 新 utility 在任何 v4 小版本都已生成；原型若使用不同小版本需检查生成 CSS 和真实浏览器 computed style。尤其是 `animation-duration-(--animation-duration)`、自定义 data-open variant、shimmer、`wrap-anywhere`。

原型应复制/导入官方原件，经真实 Tailwind 编译，在独立预览作用域填 theme variables。允许 alias 解决 `@/` 和模块解析；如改了原件，需明确记录 diff。不能把 Tailwind class 手译成近似 CSS 再称“直接使用官方组件”。后续产品需将主题变量映射到已有宿主 token，不额外创建 ConfigProvider，也不将官方默认主题整站覆盖到 Mimir。

### 官方组件行为与无后端预览办法

- `reasoning.tsx:26–37`：默认 outline；ghost、muted 是真实官方变体。`:78–107` streaming 时保持打开，第一次手动切换后由用户接管；未经手动操作结束后回到初始 defaultOpen。`:172–217` Trigger 文案写死为 `Reasoning`，传 children 不会替换固定子节点；不应在不改源码时承诺中文标题。Content 包含上下渐隐、max-height、ResizeObserver 驱动的流式跟随和用户上滚暂停。
- `reasoning.tsx` 的 `ReasoningRoot/Trigger/Content/Text` 可以直接以 fixture props 组合，官方 registry 自己描述其“no runtime required”。这足以验证真实开合与样式；正文可明确标为示例文本。不要自造第二套 Reasoning 状态机。
- `tool-fallback.aui.tsx:55–100` Root 默认折叠，使用真实 useScrollLock；`:141–207` Trigger 使用真实 toolName/status/responseDeliveryStatus。原文状态包括 Running tool / Used tool / Failed tool / Cancelled tool / Waiting on tool，queued 为 Reply queued, not sent yet。
- ToolFallbackDuration 调用本地 `useToolCallElapsed`，该 hook 使用 `s.optional.part`，没有 part scope 或 timing 时返回 undefined；静态 fixture 不需要伪造耗时。可直接使用官方 Root/Trigger/Content/Args/Result/Error 组合预览。完整 ToolFallback 的审批支路需要真实支持的 approval 事件；不能给 Mimir 现有自动执行的 document interrupt 凭空加 Allow/Deny。
- 本地 react `src/index.ts:355,358` 确认导出 useScrollLock/useToolCallElapsed；也导出 toolApprovalAcceptsText、ToolApproval types、ReasoningGroupComponent 和 ToolCallMessagePartStatus。说明直接 import 的 API 名称已存在；这仍是源级核对，实际类型构建与浏览器结果由原型验收。
- 上游原件使用 useCallback/memo，这些属于 vendored 第三方原件。不能为迎合 Mimir first-party React Compiler 规则擅自改写后仍声称字节完全一致；隔离 third-party 边界与记录来源比手改状态机更可靠。

### 首次回复前必须使用官方等待行为

`thread.aui.tsx:704–713` 的真实 indicator：

```tsx
<span
  data-slot="aui_assistant-message-indicator"
  className="animate-pulse font-sans"
  aria-label="Assistant is working"
>{"●"}</span>
```

它由 **MessagePrimitive.GroupedParts** 产生的 `indicator` part 分支渲染，不是一个新检索状态行。已安装 core `src/react/primitives/message/MessageGroupedParts.tsx:63–77,164` 有 `never/empty/no-text/always` 模式；默认 `no-text`：仅消息 running，且末尾 part 既非 text 也非 reasoning 时出现。空消息、只有 tools 或 data 可得到等待点；已有真实 text/reasoning 时按其分支呈现。必须让 running 的空助手消息进入对应官方 GroupedParts 路径，不能继续 early-return TraceDisclosure，也不能删掉过程后留成无反馈空白。

原型允许从固定 Thread 原文摘录此 indicator 分支，接入本地已安装引擎，以真实 running/parts fixture 验证；应标明“官方 Thread 分支摘录”，不宣称完整使用所有 Thread 功能。业务 data 仍需显式跳过 generic renderer，避免 citation/failure/Agent UI 重复。

### 最小未来产品移除链（现在不实施）

| 接缝 | 现状证据 | 后续计划 |
| --- | --- | --- |
| 自绘 UI | `packages/chat/src/parts/MessageItem.tsx:21,90,144,158`；`TraceActivity.tsx` | 移除 import/hook/两处挂载，重新接官方等待；确认无引用后移除自绘文件及仅用于 trace 的 shell 分支 |
| 数据读取 | `packages/chat/src/parts/data-parts.ts:44` | 仅移除 useTracePart，保留 citations/failure/Agent 读取 |
| 历史转接 | `packages/chat/src/runtime/history.ts:54–56` | 不再把持久化 trace 映射成 UI part；老数据库 trace 仍能按既有 nullable schema 读出但不显示 |
| 实时生产 | `apps/server/src/services/assistant-stream.ts:299,412,433` | 停发三处 CUSTOM/EVENT_TRACE，保留运行生命周期、引用、正文与失败事件；不要误删 RUN_FINISHED 缓冲/中断排序逻辑 |
| 新记录保存 | 同文件 `:486–502` | 若产品范围决定停存 trace，删除仅为其服务的整轮耗时包装，appendMessage 用既有 null/省略语义；保留旧记录存储兼容 |
| 非流式入口 | `apps/server/src/services/assistant.ts:46,59,70` | 仍会持久化 trace。若要求“停止新增 trace”需同步处理，不能只改 stream 后声称所有生产者已移除 |
| 内部检索 | `retrieval-preparation.ts:28,95,169` | 检索算法、引用和上下文准备保持；trace 目前也被非流式 ask 使用，不能在未盘清调用点前删除共享类型/计算 |
| 共享兼容 | `packages/shared/src/conversations.ts:92,173,189`；server `conversations.ts:54,175,205` | 老字段/schema 可保留；EVENT_TRACE 与 payload 类型按全仓使用者盘点后收口，不做数据库破坏性清理 |

这条链只清理用户拒绝的检索过程。mimir.citations、mimir.failure、conversation 创建事件、documentAgent/docxAgent、真实 source/file/image/audio、保存笔记/复制、PNG 草稿、队列恢复、失败后取回、客户端文档工具和显式 resume[] 桥全部保留。`DocxInterruptBridge` 的执行去重、版本/源寿命校验、停止中止与续轮失败恢复不能替换成普通 addToolResult 或上游 approval。

建议未来验证包含：首次 send 到首 token 的官方等待点；真实 reasoning 流式/结束/手动切换；真正 tool running/complete/error/cancelled；只有 citations 的检索降级；历史含 trace 时无过程块但正文/引用/失败保真；停止/断流不冒出成功动作；PPTX 草稿和 document interrupt 按现有合同恢复。每个观察断言应证明用户可见语义，避免只匹配自造 class。

### WeKnora 版本与应用边界

按项目要求核对官网和公开源。2026-10-19 本任务 `trace-ui-origin.md` 已重新获取官网 HTTP 200：标题“ WeKnora — 帮你找到答案，并将知识付诸实践”，展示 v0.8.3，响应 SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`。公开源固定 `2c0d8384398ca756ee414eef01b71caf91e2caa6`，`frontend/package.json:3` 为 0.8.3；官网部署 SHA 未证实，二者分开记录。

`AgentStreamDisplay.vue:62` 的 thinking/card/header 表明 WeKnora 有自行绘制的展开过程 UI，`:421–454` 成功且非空回答才有动作条。它适合验证“过程、答案、可操作动作按真实状态分层”与来源/恢复边界；**不适合本次作为检索卡形态模板**，用户已经决定不用自定义过程块。主依据应为 assistant-ui 固定官方原件与本地 AG-UI 能力；未借用 WeKnora Markdown 编辑器作 Office 工具栏参照。外部精确链接与证据限制见 `weknora-reference.md`。

### Related specs

- `.trellis/spec/chat/frontend/conventions.md`：宿主主题、parts 类型不漏接、业务 data 显式位置、队列与发送、中断桥；其中检索过程现状条款需在未来实施完成后由主会话按已批准新需求更新。
- `.trellis/spec/chat/frontend/pitfalls.md`：AG-UI 中断恢复补丁、消息排版祖先样式、流中重挂载。
- `.trellis/spec/shared/contract/document-agent.md`、`docx-agent.md`：文档执行、版本、显式续轮合同。
- `.trellis/spec/renderer/frontend/document/conventions.md`：引用跳转、窄侧栏与未保存守卫。
- `.trellis/spec/project/rules.md`、`research.md`、`quality.md`：固定来源、研究可追溯和真实效果验证。

### 本轮写入与基线

本研究仅写 `research/official-message-ui-contract.md` 与 `research/vendor-official/**`；未修改产品或 spec、v1、任务元数据，未执行任何 git 操作。重新按 `research/product-baseline-hashes.json` 计算 SHA256：**47 / 47 个产品来源均未变化，变化 0 个**。没有运行产品测试或冒称全仓检查通过。原型自己的构建/交互报告由其作者独立提供。

## Caveats / Not Found

- 固定上游与本地 SDK 小版本不同。已确认所需导出存在，未由本研究独立证明整套 Thread/Markdown/审批 UI 与本地版本全量兼容；完整闭包安装和浏览器结果仍须验收。
- 未将远端真模型推理或真工具执行接入 HTML；官方组件里的内容/状态可使用明确标识的 fixture，但不能称真实模型生成或真实写入。
- 官方英文文案与最终产品中文化需要明确的后续源码 diff；不得通过无效 children props 或 CSS 伪文本悄悄替换。
- `vendor-official` 中 registry CSS 是来源证据，docs CSS 已清理；整站样式不能直接用于产品。原型只需选取官方声明的依赖与 CSS，并保留源文件复核。
- 老历史持久化没有完整真实 reasoning/tool 事件记录时，不得按旧检索 trace 合成历史思考或工具。保留正文、引用、失败与已有 Agent 紧凑结果即可。

### 原型兼容性最终补记（主会话）

原型作者完成实际类型检查后确认：产品0.15.28缺少官方新组件需要的responseDeliveryStatus；因此v2运行/类型均使用临时隔离0.15.29，仓库依赖不变。最终原型构建、类型、lint、artifact及主会话代表GUI通过，证据见planning-acceptance-v2.md。这仅证明原型必要组件闭包，不是现有react-ag-ui0.0.68与产品Agent全量兼容声明；未来最小SDK升级及回归已纳入执行计划。
