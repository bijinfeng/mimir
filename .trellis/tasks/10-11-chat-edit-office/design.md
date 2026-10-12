# 设计：DOCX 对话编辑

## 架构与边界

1. **文档页宿主**：`OfficeSourceEditor` 为当前 `DocxEditor` 提供按文档 ID 绑定的 agent 句柄；句柄只暴露读取上下文、冻结选区、执行工具、捕获/回退快照、获取编辑版本与保存状态，不把 Tiptap 对象暴露给服务端。切文档或卸载立即使句柄失效并取消未完成工具。
2. **TanStack AI 编排**：以仓库当前 `@tanstack/ai@0.55.0` 的 `chat({ tools, agentLoopStrategy, resume })` 作为唯一模型工具循环；不引入 GenOffice 的 `AgentLoop` 作为第二套循环。服务端用有验证模式的工具定义注册白名单：纯联网检索工具可由 TanStack server tool 执行；需要当前画布的 DOCX 工具由 client tool 请求交给浏览器。显式设置模型轮数、工具调用数和运行时长预算，避免默认五轮截断完整编辑。详细依据见 `research/tanstack-ai-capabilities.md`。
3. **侧栏与续轮**：同一 `DocChatSidebar`/`ChatPanel` 显示问答与编辑轮。先以现有 assistant-ui 消息运行时实现 TanStack client-tool interrupt 协议桥：按统一工具合同执行画布操作，回传真实结果，提交覆盖全部待处理 `client_tool_<toolCallId>` 的 AG-UI `resume`，并由受控服务端状态关联、核验 `parentRunId`。`useAssistantTool`/`addToolResult` 只负责其已验证的工具展示与结果路径，不能误当成 TanStack interrupt 的自动续轮。当前 `assistant-stream.ts` 会剥掉 TanStack 的 `RUN_FINISHED`；DOCX agent 路径须保留 `outcome`/中断 ID，并保证 AG-UI 每个 run 只有合法的一组生命周期事件。旧问答的外层生命周期不能直接套在 agent 路径上。
   浏览器消息/UI 运行时先保留 assistant-ui；首个垂直实验若不能保证不重复执行、正确续轮和停止语义，应迁到与当前核心兼容的 TanStack React 客户端，并重做 D-099 的历史/实时消息关联与队列草稿行为。`@tanstack/ai-react` 兼容版本具备工具、续轮和队列能力，但其 `CUSTOM` 仍通过回调而非通用消息 part 进入 Mimir。对照、版本约束和判断门见 `research/chat-runtime-assessment.md`。不并行维护第二套浏览器消息引擎。
4. **模型服务与权限**：只在已鉴权的当前 DOCX 单篇上下文提供 36 工具白名单与 DOCX prompt；忽略请求中未经许可的额外工具定义，主视图和非 DOCX 文档维持原问答权限。DOCX 问答上下文取发送时画布快照或实时读取工具，不再把数据库已保存正文当成唯一真相；引用仍指向当前文档的可定位内容。扩展 `services/model.ts` 统一入口以承载 TanStack 的工具、续轮、线程 ID 与循环策略；通过 `onUsage` 对多轮模型调用逐次记账。`plugins/provider` 仍构造适配器。模型是否真正支持 function calling 需能力探测，不能依赖 OpenAI 兼容适配器的乐观默认类型。
5. **DOCX 工具层**：以固定上游 36 工具和 15 个 `apply_ops` 操作为合同，复用已 vendored 的引擎与 ProseMirror 原语。缺失的上游 AI 模块按 `UPSTREAM.json` 固定版本引入或在 `packages/office/src/agent/` 保留来源映射与适配，遵守 vendor 文件不得手改的规则。上游硬编码 `window.desktop` 的操作通过 Mimir 注入的宿主服务接口适配，不在产品浏览器中伪装全局 Electron 对象。GenOffice 只作为工具语义和文档编辑实现来源。
6. **附加结构保存**：扩展 `DocxSession` 的编辑状态和 `save` 参数，覆盖样式、节/页面设置、水印、页眉页脚、批注、脚注/尾注、图表与媒体等工具会改的结构。以原件和原始块为补丁基底；保存成功才提交新基线，保存失败维持 dirty。每类工具用 DOCX 保存后重新解析，检查 OOXML 与画布一致；未改动的 ZIP 部件仍原样保留。
7. **服务设置与外部能力**：服务端新增可配置的服务适配器与健康状态。首个可实施组合为 Brave Search 的文本/图片检索、TanStack AI `generateImage()` 的 OpenAI 图像适配、经 TanStack AI `chat()` 多模态模型适配的媒体分析；音频/视频若适配器不直接支持，先在服务端转录/抽帧，再把结果交给 TanStack 模型调用。`web_search`/`image_search` 可是 server tool；`generate_image`/`analyze_media` 需结合当前画布插图或读取文档媒体，因此由 client tool 调用受控服务端能力并完成画布动作。图片适配器经 `plugins/provider` 构造，调用在 `model.ts` 统一记账。凭据使用现有加密设置存储，前端只见可用状态与可读错误，不见密钥。无配置时对应工具从本轮模型可用列表移除并给出配置提示；服务执行失败时返回失败结果，不伪造空结果。
8. **新文件**：`create_document` 在浏览器或服务端生成 DOCX/PDF/Markdown/HTML 字节，复用知识库文件上传与解析索引通路，成功后打开新文档页。新文件独立于当前 DOCX 的整轮回退；创建结果须明确告知文件位置与已保存状态。

## 关键数据流

```text
DOCX 画布当前状态 + 冻结选区
  → 侧栏发送用户消息、文档/会话/编辑版本
  → 已鉴权 AG-UI 服务端调用 TanStack AI agent loop（仅当前文档的工具白名单）
  → server tool 在服务端执行；client tool 中断由侧栏注册工具执行
  → TOOL_CALL_* 状态 / 画布更新 / 真实结果 → AG-UI resume → TanStack AI 续轮
  → 最终回答 + 整轮快照回退入口
  → 用户点现有“保存到库” → DOCX 补丁式字节 → PUT /api/documents/:id/file
  → 服务端重算正文、哈希、索引
```

`write_document` 走独立的流式写作请求，模型仍经 `model.ts` 记账。草稿事务不进入普通 undo/AI 修订；生成完成后作为一次正式修改落地。中断时显示部分内容的保留/丢弃选择；不把截断内容伪称完整。

## 一致性与回退

- 发送时记录选区与编辑版本；每次按块索引写入前重新核对文档身份、版本及目标。下载、搜索或生成图片等异步工具在网络返回后再次核对；不匹配时拒绝落地并提示模型重新读取。
- 每轮首次真实修改前捕获正文及附加结构快照，记录该轮完成版本；整轮回退仅在此后无额外手动/其他轮编辑且原文档仍打开时可执行。否则禁用并说明原因，避免上游直接 `setContent(snapshot)` 覆盖后续编辑。
- 服务端会话与工具事件保留真实成功/失败/停止状态。断流后已经落地的编辑仍是未保存改动，侧栏明确列出；用户可回退或手动保存。停止请求不能在后台继续把迟到结果落画布。
- AI 修订开关只决定正式 AI 编辑是否进入修订扩展，默认关闭。读工具与写作草稿不制造修订。
- 对外媒体抓取只接受 HTTP(S) 并做私网/回环地址防护、重定向逐跳检查、体积与 MIME 限制、超时；本地媒体通过用户选择文件上传到受控临时存储，分析后按既有清理策略释放。禁止模型传本机路径直接读服务器文件。

## 兼容与迁移

- `EditorIo` 的字节 `load/save` 保持原用途；另加可选 DOCX agent 句柄/宿主服务接缝，不影响 XLSX、PPTX、HTML、PDF 编辑器。
- 主视图对话与非 DOCX 侧栏不注册写工具。已有单篇检索、引用、历史消息和失败卡仍用当前 AG-UI 消息 part 路径。
- 不新增文档真相存储。DOCX 原件及既有知识库记录仍是持久化来源；未保存的画布状态只存在当前编辑会话。
- 若用户未配置外部服务，本地 DOCX 工具照常使用；界面标出相关外部能力不可用的原因，不能宣称“完整工具已可用”。

## 重要取舍与实施风险

- **完整范围一次交付**：本任务不能以“先接文本工具”为完成标准。实施可按垂直切片递进，但最终需通过 36 工具与 15 子操作矩阵。
- **上游同步**：工具层的功能依赖比现有 vendor 多，先用固定 commit 建立来源映射和差异检查，禁止手工修改 vendor 或让保存退化成全量重建。
- **TanStack AI 接缝**：安装包源码提供内建 agent loop、client tool 中断/续轮、`generateImage` 与多模态输入，但 Mimir 的模型包装尚未暴露工具参数，问答流还会剥掉 `RUN_FINISHED.outcome`。将读取/写入/续轮及多轮用量的端到端实验放在实施第一步，实验结果决定具体适配位置，产品行为与工具范围不变。
- **浏览器运行时选择**：现有 assistant-ui + AG-UI 对检索问答合理，对 TanStack client-tool interrupt 尚不完整。首个实验必须覆盖 `outcome`/`resume`/`parentRunId`、工具只执行一次、结果/错误续轮、停止、排队和历史重载；协议桥失败时迁到 TanStack React 并补齐既有交互。36 工具的输入/输出合同须单一来源，避免两端定义漂移。
- **外部供应商**：参考供应商与模型可能有地区、额度或输入格式限制。配置页应检测各能力，给出明确状态；测试要区分适配器契约测试与真实凭据的效果验证。
