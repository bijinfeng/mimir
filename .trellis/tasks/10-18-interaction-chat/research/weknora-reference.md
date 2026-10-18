# Research: WeKnora 对话与 Agent 交互参考

- Query: 检查 WeKnora 官网和固定公开源码，提取对 Mimir 第七模块有实际意义的交互证据，不引入原产品不存在的能力。
- Scope: external / mixed
- Date: 2026-10-18

## Findings

### 版本、读取方式与证据强度

- 官网：<https://weknora.weixin.qq.com/>，首次 HEAD 请求超时，随后 GET 读取成功，HTTP 200，最终 URL 同上。正文 113529 bytes，SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`（动态网站的一次响应指纹，不是其永久版本号）。
- 官网标题：`WeKnora — 帮你找到答案，并将知识付诸实践`。
- 官网导航和 hero releaseLink 明示 `v0.8.3`。description 原文：`腾讯开源知识框架 WeKnora，集 RAG 问答、Agent 推理与自动 Wiki 于一体。v0.8.3 新增画廊、多模态 Embedding、原文引用定位、附件按需读取和平台用户管理；支持私有化部署。`
- 公开仓库：<https://github.com/Tencent/WeKnora>。本次通过 GitHub commits/main API 固定到 `2c0d8384398ca756ee414eef01b71caf91e2caa6`，committer 时间 `2026-10-17T15:25:02Z`。后续证据均通过该 SHA 的 raw URL 读取，未使用浮动 main 内容。
- 固定源码 `frontend/package.json:3` 的版本同为 `0.8.3`：[永久链接](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/package.json#L3)。这是包版本与官网展示交叉核对，不等于证明线上站点部署正好是此 commit。
- 本次为 HTTP 内容与源码研究，未登录 WeKnora、未跑它的实际 Agent 工具，也未据此声称其深色/窄屏/键盘实际全部通过。

### Files found

| 固定源码 | 研究价值 |
| --- | --- |
| `frontend/src/components/ChatReferenceSourceView.vue` | 引用原文面板的文件/网页分派、定位、加载及失效状态 |
| `frontend/src/views/chat/components/AgentStreamDisplay.vue` | 推理与工具进度、完成回答动作、引用浮层、工具交互种类 |
| `frontend/src/views/chat/components/PendingPromptDock.vue` | 等待动作集中在输入区附近、多个挂起提示选择、固定边框与禁用状态 |
| `frontend/src/views/chat/components/ToolApprovalCard.vue` | 提交互斥、失败反馈、批准/拒绝及参数区键盘边界 |
| `frontend/src/components/Input-field.vue` | 输入法保护、队列邻近输入框、停止的确认/失败反馈 |
| `frontend/src/views/chat/index.vue` | 主会话、历史读取、Agent steering与停止的宿主连接 |

### 参考1：把过程、结果、可操作动作分清

具体证据：

- [AgentStreamDisplay.vue:62–78](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/views/chat/components/AgentStreamDisplay.vue#L62)：thinking 有独立 action-card；pending状态绑定 `isThinkingActive`，header 点击展开，正文只在展开时呈现。
- 同文件 [421–454](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/views/chat/components/AgentStreamDisplay.vue#L421)：完成回答且内容非空才出现 answer-toolbar；复制和收藏是轻量按钮。
- 同文件 [613–629](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/views/chat/components/AgentStreamDisplay.vue#L613)：活动指示行独立于正文，引用浮层使用共用组件。

适用 Mimir：推理/检索过程用较轻的中性色、可展开行，正文保持阅读主次；“生成中”“已停止”“失败”明确区分，完整成功的回答才有保存/复制。继续沿 Mimir 既有显式顺序：过程→正文→引用→失败→停止→动作。不能照搬上游对话分叉、rewind或知识库收藏业务，因为 Mimir当前没有相同入口和协议。

### 参考2：引用看原文，保持当前阅读上下文

具体证据：

- [ChatReferenceSourceView.vue:3–55](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/components/ChatReferenceSourceView.vue#L3)：上部标题和定位/跳转操作，加载占位，文件走 DocumentPreview，网页走引用文本和打开来源。
- 同文件 [285–310](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/components/ChatReferenceSourceView.vue#L285)：来源 hash 过期或已编辑时把 locators/quotes 清空并标 unavailable；同一文件换引用保持预览挂载，只移动高亮；异步结果通过 loadVersion 拒绝迟到覆盖。

适用 Mimir：原文引用保留标题、片段和明确跳转；同篇引用原地定位、跨篇走未保存守卫，来源失效不能伪装定位成功。文档侧栏已经具备隐藏保活和同篇高亮，本轮需保真。Mimir的 citation 是自己的 documentId/start/end/snippet，不能直接复制 WeKnora 的 knowledge/chunk/source_hash 协议或再造一个来源预览器。主Chat的“返回对话”使用已有lastConversationId。

### 参考3：队列与输入框近邻，但保持 Mimir 自己的发送规则

具体证据：

- [Input-field.vue:2777–2800](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/components/Input-field.vue#L2777)：队列紧贴输入框上方，独立于输入框focus高亮；每项有文本、等待图标、失败重试或派发、移除；pending/promoting禁用相应操作。
- 同文件 [2464–2487](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/components/Input-field.vue#L2464)：组合输入 `isComposing`/`keyCode===229` 阻止快捷操作，mention开启时方向、Enter与Escape由其局部消费。
- 同文件 [2720–2743](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/components/Input-field.vue#L2720)：停止区分缺少会话/消息、发送stop、已确认、失败，存在不同事件和反馈。

适用 Mimir：队列用稳定行高和文本截断，放在输入框邻近位置；取回/停止/失败后输入仍可找回，不能把队列状态埋在消息正文。只借鉴视觉接近与状态清晰度。WeKnora有steer/inject/after能力；Mimir现有队列是assistant-ui队列，停止取回首条，不移植上游“立即注入当前轮”“优先派发”或其快捷键。Mimir发送按钮/Enter必须继续统一走composer.send；不能仅为美观改成鼠标生成中禁用但键盘可排队。

### 参考4：挂起操作固定位置、处理期间禁止重复提交

具体证据：

- [PendingPromptDock.vue:8–39](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/views/chat/components/PendingPromptDock.vue#L8)：挂起事项有前后切换、选中项、同一区域呈现对应卡片。
- 同文件 [172–181](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/views/chat/components/PendingPromptDock.vue#L172)：固定1px边框、background容器角色、聚焦只改边框颜色；避免状态变化改变尺寸。
- [ToolApprovalCard.vue:39–50](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/views/chat/components/ToolApprovalCard.vue#L39)：reject/approve在submitting时禁用；参数JSON无效也禁approve。
- 同文件 [353–395](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/views/chat/components/ToolApprovalCard.vue#L353)：提交互斥，成功后标resolved、必要时resume，错误单独反馈。
- 同文件 [399–405](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/views/chat/components/ToolApprovalCard.vue#L399)：局部键盘规则考虑参数textarea，避免普通回车误提交。

适用 Mimir：仅借鉴状态面板、按钮固定几何、处理中禁二次提交、清楚显示“继续”“撤销”“停止”的当前可用性。Mimir已有Agent中断桥按中断ID、文档/源/版本校验，续轮失败重送缓存结果不能重新执行工具。不得复制WeKnora的MCP参数JSON编辑、会话级授权、OAuth卡、AskUser、多挂起dock或审批协议：这些不是Mimir现有能力。HTML必须把所有执行写入标为模拟。

### 参考5：模型/Agent选项不是越多越好

官网宣传并在源码提供多Agent、嵌入授权、临时附件、Wiki、Browser/Sandbox等能力。它们是WeKnora当前产品范围的证据，不是Mimir需求。

Mimir模型来自全局chat/reasoning角色，菜单两项只读，“管理模型”去全局设置；文档侧栏不显示思考强度，标准强度参与真实发送参数。这些既有合同优先。不要因为外部有AgentSelector/网络搜索/通用附件就把入口加进本轮HTML；否则“还原打磨”变为未经批准的业务扩展。

## Related specs

- `.trellis/spec/project/rules.md`：参考需注明证据、时间、适用条件；不碰非目标。
- `.trellis/spec/chat/frontend/conventions.md`：主/侧栏共用组件、消息parts类型齐全、模型只读、侧栏标准强度、唯一发送路径和停止取回队列。
- `.trellis/spec/renderer/frontend/document/conventions.md`：同篇引用、实际容器窄侧栏、隐藏保活、未保存守卫。
- `.trellis/spec/shared/contract/document-agent.md`、`docx-agent.md`：执行/续轮/版本、原件dirty与真实保存边界。

## Caveats / Not Found

- 官网营销页不是已登录产品截图，不能据此声称真实产品的精确颜色、间距和动画测量；本次取用的是固定源码中可确认的状态与结构。
- 未获取WeKnora登录会话，无端到端实际浏览器行为验收；源码中appearance与keyboard处理不等于已实测。
- 固定commit的frontend版本为0.8.3，但没有证据证明此SHA就是线上部署版本；两条证据分开记录。
- WeKnora适用于知识问答与Agent的过程/依据/恢复参照。本轮不使用其Markdown编辑器作为Office工具栏主参照；Office工具栏按既有模块计划参考Office for the web/Google Docs/GenOffice。
- 视觉沿已批准的语雀方向与Mimir现有token，不照搬WeKnora营销页渐变、叙事块或整个信息架构。
