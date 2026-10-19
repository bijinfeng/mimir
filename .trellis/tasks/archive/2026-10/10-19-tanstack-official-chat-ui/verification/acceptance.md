# 官方 Headless UI 接入验收

2026-10-19，规划提交 `c6d6c42` 后，经用户“可以”批准实施。实施、独立复核与质量门已完成。

## 交付结果

产品主对话与文档侧栏使用模块级 `createChatUI`，同一个真实 `useChat` host 注入官方 Provider；官方 Messages、Message、Part 与 TextPart 承担列表、选择、内容分发和 Markdown。官方 Input 注册原输入组件，保留批准的 Mimir 外观及模型/实际推理等级/知识库范围。

删除旧 NativePart/keyedParts 通用分派。连续工具仅保留布局适配，工具结果关联使用官方公开 selector；关联结果不重复，孤立结果和未知历史工具仍可见。稳定组合树保持流式更新时的展开状态与焦点。

独立 FIFO、不可变发送意图、临时附件、canonical 保存和原文档 Agent 守卫没有迁移到第二套状态。安装的 ai-client 将 `client-tool-execution` 排除在公开 ChatInterrupt 之外，因此原 onChunk 与 DocxInterruptBridge 继续作为唯一执行/续传通道；未新增泛化审批。

## 需求与证据

| 标准 | 结果 | 证据 |
| --- | --- | --- |
| AC1 / R1 官方封装真实参与、主/侧栏共用 | 通过 | `packages/chat/src/ui/` 与实际 ChatPanel/ChatThread；独立复核 |
| AC2 / R2 保留 v7 视觉与交互 | 通过本次迁移验证 | 冻结原型不变；迁移前后历史、浅深主题、窄屏、菜单焦点、代码与图片 GUI；错误/流式持久状态由测试补足，非全状态 GUI 认证 |
| AC3 / R3 单状态源、发送快照/队列/保稿/取消 | 通过 | 真实 HTTP/SSE 回归；GUI 正常出队与停止后第二问只回填草稿 |
| AC4 / R4 附件/Agent/canonical 行为 | 通过 | ChatPanel/DocxInterruptBridge/媒体取消/截图回归及 Renderer 宿主回归；GUI 真上传、历史、预览、保存 |
| AC5 / R5 全仓、构建、独立检查与记录 | 通过 | `quality-gate.json`、`command-summary.txt`、`independent-review.md`、`browser-qa.md` |

## 检查结论

- `pnpm check` exit 0：lint、样式守卫、格式、全工作区类型与测试通过；共 **4866 项通过**，Storage 原有 2 项跳过单列，不算通过。
- Chat **8 文件 / 87 项**，新增 3 项真实 SDK 组合回归；Renderer 完整 **75 文件 / 581 项**。独立 reviewer 重新执行 Chat 检查，未发现未解决项。
- Web 与 Desktop 生产构建均 exit 0。原有非阻塞警告保留，未调整规则、超时或产品排除项。
- 全仓检查启动后，GUI 发现代码框接缝依赖同等 CSS 特异性的注入顺序；修正 selector 后补跑局部 lint/format/Chat typecheck，浅/深主题实测接缝为 0。未声称该 CSS 后又完整重跑所有测试。
- 仅改 Chat 产品代码及本任务的测试、规范、记录；无依赖/锁文件、服务端、数据库协议或冻结原型改动。

GUI 采用真实产品、隔离服务与本地流式供应商。Agent 写入/中断及分支失败等由回归测试证明，未全部手动重演；原生 Electron/IME/读屏及付费模型不在本轮认证范围。细节见 [GUI 记录](browser-qa.md)。

提交标识由任务归档后的 `task.json.commit` 与开发日志记录，避免在本提交内嵌入自身哈希。回滚可整体回退本次 Chat UI 接线，无需回退数据或删除附件。
