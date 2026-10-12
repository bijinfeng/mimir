# DOCX agent 工具与 Mimir 接缝盘点

2026-10-11 规划证据。上游固定版本：`genspark-ai/genoffice@480548fd55f1be3593ee0d8e316a734751d58309`，主要入口 `apps/docs/src/renderer/ai/tools.ts`、`skill.ts`、`protocol.ts`、`doc-writer.ts`、`page-setup.ts`、`floating-ops.ts`、`style-ops.ts`、`ops.ts`，通用循环 `packages/agent-core/src/loop.ts`。本地临时核对副本在 `/tmp/genoffice-source/`，不是产品依赖。Mimir vendor 固定同一 commit，但 `UPSTREAM.json` 跳过 AI 应用层。

## 36 个顶层工具

| 组 | 工具 | Mimir 实施接缝 |
|---|---|---|
| 当前状态与正文 | `get_document_context`, `read_blocks`, `insert_content`, `write_document`, `replace_blocks`, `replace_selection`, `apply_ops` | 活的 ProseMirror 文档、冻结选区、长文流式写入；`apply_ops` 涵盖 15 个操作定义，需按上游 `opNames()` 逐项核对 |
| 修订 | `read_revisions`, `accept_changes`, `reject_changes` | 已有修订扩展与 Review 面板，需接 AI 修订开关和保存后读回 |
| 批注 | `read_comments`, `reply_comment`, `resolve_comment`, `add_comment`, `delete_comment` | 批注数据与 OOXML 保存接缝 |
| 注释 | `insert_footnote`, `insert_endnote`, `delete_note`, `edit_note`, `read_notes` | 正文引用、定义及分页/保存同步 |
| 查找与生成媒体 | `web_search`, `image_search`, `analyze_media`, `insert_image`, `generate_image` | 服务端第三方服务适配、下载与媒体输入安全、图片尺寸和 MIME 验证 |
| 图表与页眉页脚 | `insert_chart`, `edit_chart`, `set_header_footer` | DOCX 图表及页眉页脚附加状态的读写回存 |
| 页面、样式与浮动对象 | `set_page_setup`, `insert_section_break`, `define_style`, `list_styles`, `set_watermark`, `insert_text_box`, `insert_picture` | 七个从上游子模块导入的工具；涉及节、样式、媒体和浮动对象保存参数 |
| 新文件 | `create_document` | 上游支持 `docx/pdf/md/html`，Mimir 应走知识库新文件创建路径 |

除“页面、样式与浮动对象”一组外，其余 29 个工具均在 `tools.ts` 内联定义；七个导入定义加起来为 36 个。`apply_ops` 在固定版本的 `ops.ts` 含 `setFont`、`setMatchedFont`、`setParagraphFormat`、`setHeadingLevel`、`findReplace`、`deleteBlocks`、`moveBlocks`、`setList`、`clearList`、`setImageProperties`、`insertToc`、`setParagraphAttrs`、`setOutlineLevel`、`stepIndent`、`stepHangingIndent`。

## 现有代码证据

- `DocChatSidebar.tsx` 复用 `@mimir/chat`，当前侧栏走单篇问答；`assistant-stream.ts` 从已保存 `getDocument()` 取上下文，所以未保存的画布改动不会进入回答。
- `DocxEditor.tsx` 拥有 Tiptap `Editor`、dirty 状态和保存动作，`EditorIo` 只含字节 `load/save`。需要一个与当前文档 ID/编辑版本绑定的工具句柄，宿主不能直接构造另一份编辑器。
- `docx.ts` 的 `DocxSession.save(edited)` 只收正文 JSON；上游工具还会更新样式、节、页眉页脚、批注、脚注等附加结构。必须扩充保存计划且保持补丁式保存，不允许转成全量重建。
- `OfficeSourceEditor.tsx` 经 `api.documents.replaceSource` 保存；服务端 `PUT /api/documents/:id/file` 重算正文和哈希。新文件可复用 `POST /api/documents/files` 的上传/解析/索引约束，但新 DOCX/PDF 初始字节还需生成。
- `@assistant-ui/react-ag-ui` 当前安装版本支持前端工具，但 TanStack 0.55 的客户端工具会以 `RUN_FINISHED.outcome=interrupt` 终结，普通 `useAssistantTool` / `addToolResult` 的自动续轮并不等价。必须按 `research/chat-runtime-assessment.md` 建显式协议桥并实测，或迁移浏览器运行时。
- `apps/server/src/services/model.ts` 是 TanStack AI 模型调用与用量记账收口；`plugins/provider` 负责模型适配器。不能在浏览器或新路由直连模型密钥。

## 外部服务依赖

上游 `tools.ts` 对 `window.desktop.webSearch`、`imageSearch`、`analyzeMedia`、`aiGenerateImage`、`fetchImage`、`createDocument` 直接调用。Mimir 没有这些服务。服务端需提供可配置适配器：文本/图片检索、图片生成、图片/音频/视频分析、受控媒体抓取；凭据由现有加密设置保存。实施时至少为每一类选择并打通一个真实第三方实现，而不是只定义接口。模型不可用或对应服务未配置时，前端隐藏不可用工具并解释原因；工具在执行中遇到错误要回传明确失败，不能报告空搜索结果。媒体 URL 和用户上传文件需做大小、MIME、超时和地址安全校验，服务端禁止读取模型提供的任意本机路径。

## 设计影响与待验证技术点

- 上游长文 `write_document` 是独立流式写作请求；草稿实时落画布，完结再按普通编辑提交。Mimir 要把这条请求继续交给 `model.ts` 记账。
- 上游一次工具轮首次修改前快照，整轮结束给回退；Mimir 需要额外检查后续人工编辑版本，以免回退覆盖新内容。
- 上游当前 DOCX `create_document` 支持四种文件类型。Mimir 的编辑范围仍只限当前 DOCX，新文件创建可沿用知识库上传路线。
- `@assistant-ui/react-ag-ui` 的工具调用与 AG-UI interrupt API 已从安装包源码验证，但和 TanStack client-tool interrupt 的直接互通**未成立**。实施首步以一个读取工具、一个修改工具、一次包含 `outcome` / `resume` / `parentRunId` 的续轮做契约实验；协议桥失败则迁移 TanStack React 客户端并重建现有消息行为，不削减工具覆盖。
