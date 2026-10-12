# 实施计划：完整 DOCX 对话编辑

本任务按阶段实施，但只在全部 36 顶层工具和 `apply_ops` 15 操作可用、通过验收后视为交付。先读 `prd.md`、`design.md`、`research/docx-agent-inventory.md`、`research/tanstack-ai-capabilities.md`、`research/chat-runtime-assessment.md` 及 manifests 所列规范；实施前再核对固定上游源码与当前依赖版本。

## 顺序清单

2026-10-12 进度：工具目录与来源、受控画布句柄、31 个 Office 本地执行器、15 个原子操作及附加结构保存重开已有实现和测试；真实多节纸张与双栏夹具的浏览器几何也已验证，逐项证据在 `research/implementation-tracker.md`。完整验收仍缺真实模型、第三方服务调用及浏览器模型轮，因此下列清单保持未勾选，不把局部完成误记为整项通过。

1. [ ] 建立工具合同清单：固定上游 36 工具、15 子操作的名称、参数、是否写入、附加状态和可用条件；保留来源 commit，给每个工具对应验证用例。核对上游 AI 模块的许可、依赖闭包和同步方式，遵守 vendor 不手改。
2. [ ] 先验证 TanStack AI 核心接缝：扩展 `model.ts` 接受工具、`threadId/runId/parentRunId/resume` 与 `agentLoopStrategy`；以现有 assistant-ui 运行时试做 TanStack client-tool interrupt 协议桥，真实执行读工具、写工具、server tool 与 client tool 同轮，核对 `RUN_FINISHED.outcome`、全量 `resume` 及 `parentRunId`。确认未保存画布上下文、当前文档引用、工具恰好执行一次、结果/错误可被模型读取、停止、排队、历史重载、原问答和 `onUsage` 多轮记账。为 DOCX agent 建合法生命周期路径，不直接沿用旧问答剥掉模型 `RUN_FINISHED` 的逻辑；若桥无法通过这些硬门槛，迁移浏览器运行时到兼容当前核心的 TanStack React，并复测 D-099 的消息/队列交互，再接其余工具。
3. [ ] 给 `DocxEditor` 建受控 agent 句柄：当前文档与版本绑定、读取当前画布、冻结选区、逐工具执行、异步结果落地前重验、首次修改前快照、整轮回退。将句柄经 `OfficeSourceEditor` 传到同页侧栏；主视图和其他格式没有写句柄。
4. [ ] 接入完整本地工具：正文/格式与 `apply_ops`、长文流式写作、修订、批注、脚注/尾注、图表、页面/节、样式、水印、文本框、图片、页眉页脚。按工具合同逐项完成执行和错误回传，不允许静默成功。
5. [ ] 扩展 DOCX 附加状态与补丁式保存：把各工具改的非正文结构接入 `DocxSession.save`，对每类准备真实 DOCX fixture，保存后独立重开解析并比较目标结构，检查未改动 ZIP 部件保留。确保 dirty、失败重试、保存基线与索引更新正确。
6. [ ] 实现外部服务配置：加密存储凭据、按能力探测；落地真实网页与图片搜索、TanStack AI `generateImage()` 图片生成、TanStack AI `chat()` 图片/音频/视频分析，以及安全媒体下载/临时上传。实际验证适配器与模型的输入模态；不支持音视频直接输入时补转录/抽帧。为每类至少打通一个服务；未配置或失败时输出明确诊断。将外部工具可用性逐轮反映给模型与侧栏。
7. [ ] 实现 `create_document` 四格式：生成可打开的初始文件字节，经知识库上传/解析/索引后导航。对 DOCX、PDF、Markdown、HTML 分别验证打开与内容；创建失败不得留下错误成功提示。
8. [ ] 完成交互：同一侧栏保留现有单篇问答/引用，展示工具进行中与结果；工具名称/参数/结果合同由单一清单产生或核验，历史重载能看到不含敏感正文的真实执行摘要；提供 AI 修订开关、长文中断保留/丢弃、整轮安全回退；切文档和停止时取消挂起工具。补文案、键盘与无障碍状态。
9. [ ] 完整验收：36 工具与 15 子操作矩阵、恶意/失效参数、异步人工编辑冲突、文档切换、断流、回退、保存失败、不同配置状态的端到端回归。逐项勾选 `prd.md` A1–A11，并记录实际浏览器与真实服务验证结果。

## 验证命令与实际效果

- `pnpm --filter @mimir/office test`：工具执行、OOXML 补丁、保存重开与回退。
- `pnpm --filter @mimir/chat test`、`pnpm --filter @mimir/renderer test`：AG-UI 工具事件、侧栏、旧问答回归与交互。
- `pnpm --filter @mimir/server test`、`pnpm --filter @mimir/plugin-provider test`：鉴权、配置/密钥、服务适配、失败分类、用量。
- `pnpm check`：全仓 lint、格式、类型和测试门槛。
- 实际浏览器验证：在 DOCX 里先手动改动但不保存，再发选区与整篇指令，观察逐步执行、未保存提示、回退、修订与保存后重开；对四种新文件和外部服务分别实际打开/调用。真实第三方服务验证需要使用者配置的测试凭据；无凭据时不能把 mock 通过写成外部能力已验证。

## 风险文件与回退点

- `packages/office/vendor/` 与 `packages/office/src/docx.ts`：上游同步和保存差异的主要风险；提交前核对 `UPSTREAM.json`、未修改部件保真、保存两次不回滚。
- `packages/office/src/editors/DocxEditor.tsx`、`packages/renderer/src/components/document/OfficeSourceEditor.tsx`：编辑实例身份、dirty/保存句柄、切文档清理。
- `packages/chat/src/runtime/`、`apps/server/src/services/assistant-stream.ts`、`apps/server/src/services/model.ts`：AG-UI 生命周期、工具续轮和用量；不可破坏现有单篇及库级问答。
- 新外部服务配置/抓取端点：密钥不出服务端，私网地址和重定向不得绕过校验。出错回退为“能力不可用且本地编辑照常”，不能禁用整个 DOCX 侧栏。

## 启动前核对

- Trellis 规划摘要经用户在摘要之后明确批准；再运行 `task.py start`。
- `implement.jsonl`、`check.jsonl` 有真实 spec/research 路径；不把 `/tmp/genoffice-source` 当作持久任务材料。
