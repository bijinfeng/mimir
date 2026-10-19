# 接入 TanStack 官方 Headless UI

## 目标与用户价值

用户要求“使用官方的封装”：采用 `@tanstack/ai-react/ui` 提供的 Headless UI 来组织聊天渲染与交互，减少自建通用代码，并保持上一轮已批准的 Mimir 外观与业务能力。

## 背景与已知事实

- 2026-10-19 用户先批准本任务“创建并规划”，再以“可以”批准最终规划摘要，进入实施。
- 当前产品已安装 `@tanstack/ai-react@0.30.4`，发布包包含 `/ui` 子路径、`createChatUI` 与 `createChatHook`。现有产品使用底层 `useChat`，自行遍历消息和内容。
- 前轮交付：TanStack/Mimir 对话、供应商分组模型与实际推理等级、临时附件、独立 FIFO、停止保稿、Agent 守卫与精确回答保存；验收见 `../archive/2026-10/10-18-interaction-chat/verification/implementation/acceptance.md`。
- 用户之前要求模块视觉改动须先交付 HTML 对比稿并获认可；本次保留 v7 已批准外观，接入官方无样式封装，不新增设计方向。

## 需求

- R1：官方 UI 封装必须参与真实主对话与文档侧栏的消息/内容组织，不能仅导入或包一层空 Provider。
- R2：保留 v7 视觉、输入框内模型/推理等级/范围、Markdown/代码/推理/工具/媒体和消息动作。
- R3：保留不可变发送意图、独立队列、停止/失败恢复与草稿不丢失；保持单一聊天状态源。
- R4：临时附件、真实 canonical 消息 ID、分支可见回答保存及文档 Agent 目标/版本/轮次/截图/缓存续传合同不变。
- R5：对官方接口缺口明确记录业务适配边界，以行为回归和真实浏览器验证迁移。

## 验收标准

- AC1（R1）：真实产品以官方 UI 工厂和消息/内容分发接入，模块级稳定实例；主视图与侧栏共用。
- AC2（R2）：冻结 v7 不修改；迁移后浅深主题、主/侧栏及窄屏对照没有有意的视觉变化，焦点/滚动/菜单/错误恢复保持。
- AC3（R3）：真实 HTTP/SSE 验证发送快照、自动出队、停止保稿、准备取消和迟到结果，避免第二套 queue/runtime。
- AC4（R4）：附件历史/原件、Agent 原目标/版本/已执行结果续传、纯工具轮次与当前可见回答保存回归通过。
- AC5（R5）：受影响包、全仓检查、独立复核、实际 GUI 抽验通过；未测能力如实记录；提交与规范同步。

## 排除范围

不重做视觉，不更换后端协议、不新增工具审批业务、不改变附件服务或文档权限、不加入其他 UI 库、不改冻结 v1–v7 原型。不因官方默认队列或输入行为覆盖已批准的保稿合同。

## 技术决策与证据

- 采用官方 `createChatUI` 接入现有唯一 `useChat` host。已安装版本支持该入口，无需增加依赖或升级：`packages/chat/node_modules/@tanstack/ai-react/src/chat-ui/create-ui.tsx:47`、`:515`；现有 host 位于 `packages/chat/src/runtime/use-mimir-runtime.ts:193`。高层 `createChatHook` 的逐实例 override 不支持现有 transport/onChunk/onError，依据同包 `create-chat-hook.tsx:20`、`:78`，本轮不迁移连接生命周期。
- 消息和内容选择由官方封装承担，保留 Mimir 展示组件与业务上下文。连续工具分组、用户纯文本和未知工具使用官方公开组合入口；不得因未注册工具静默隐藏历史，不得为展示授权工具执行。证据为同包 `create-ui.tsx:597`、`:697` 与 `packages/chat/node_modules/@tanstack/ai-client/src/ui/selectors.ts:94`。
- 使用官方 TextPart 并接原代码组件；思考内容采用官方 slot 接原 Mimir 展示，保留已批准外观。证据为同包 `text-part.tsx:82` 与 `thinking-part.tsx:55`。官方新增 wrapper、自动工具结果关联、组件稳定性和中断位置在实施时做真实回归，不能仅靠类型检查证明等价。
- 研究核查 WeKnora 官网及固定公开源码版本，结论仅用于知识库/Agent动作门控，不用于定义 TanStack API 或替换已批准风格。远端请求成功与超时、安装包版本和哈希均在 [research/evidence.json](research/evidence.json) 如实记录；详细边界见 [research/official-ui-boundary.md](research/official-ui-boundary.md)。

## 规划收敛状态

规划已获用户批准并完成实施。官方封装、真实 HTTP/SSE 回归、主/侧栏 GUI 抽验、全仓检查、Web/Desktop 构建和独立复核均已完成；结果与未执行边界见 [verification/acceptance.md](verification/acceptance.md)。本次沿用 v7，没有新增视觉设计。后续若需要有意改变可见交互，仍先提交独立 HTML 对比并等待认可。
