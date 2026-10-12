# 实施计划：完整 DOCX 对话编辑

本任务按阶段实施，但只在全部 36 顶层工具和 `apply_ops` 15 操作可用、通过验收后视为交付。先读 `prd.md`、`design.md`、`research/docx-agent-inventory.md`、`research/tanstack-ai-capabilities.md`、`research/chat-runtime-assessment.md` 及 manifests 所列规范；实施前再核对固定上游源码与当前依赖版本。

## 顺序清单

2026-10-12 进度：工具目录与来源、受控画布句柄、31 个 Office 本地执行器、15 个原子操作及附加结构保存重开已有实现和测试；真实多节纸张与双栏夹具的浏览器几何也已验证，逐项证据在 `research/implementation-tracker.md`。完整验收仍缺真实模型、第三方服务调用及浏览器模型轮，因此下列清单保持未勾选，不把局部完成误记为整项通过。

2026-10-12 通用设置复核：已移除“DOCX AI”分区，新增“网络搜索”与显式 Brave 网页搜索连接测试，图片生成、视觉输入、音频转录归“模型”；8 个旧键迁移和密钥不下发通过 SQLite 集成回归。浏览器确认旧 `docx-ai` 地址回落到“模型”，并可打开“网络搜索”面板。`pnpm check`、`pnpm build`、`git diff --check` 通过。Brave 连接测试目前只检查网页搜索接口，图片搜索权限、真实图片生成/转录调用、真实模型轮及 Postgres 集成仍待配置后的验收；此条不是 A7 整体通过记录。

2026-10-12 六格式工具栏复核：真实应用中的 DOCX 和 Markdown 分别检查了宽区、问 AI 打开后约 641px 的中栏与 420px 视口；DOCX 还检查了 985px 视口的三栏。XLSX、PPTX、HTML、PDF 先以各自真实编辑器组件和原格式样本挂在临时浏览器夹具中，量测 1000/640/420px 编辑区并在 420px 真实视口复测弹层；随后将五个 XLSX/PPTX/HTML/PDF 测试文件上传至本机“开始使用”知识库，逐一在真实文档页打开问 AI，确认四格式的实际中栏均约 641px、顶部工具栏均为 40px 单行，展开菜单右缘在中栏内且未被侧栏遮挡。空白 PDF 因无可提取文字而不能打开问 AI，补传含文字 PDF 完成该项复核。临时浏览器夹具已清理；按用户决定，五个测试文件保留，由用户自行处理。误建的空白“未命名笔记”已移入回收站。六种顶部栏无水平溢出，独立次工具栏及底部保存保留。DOCX 主面板及固定行距/颜色二级面板在三栏和窄屏均可点击，Markdown 和其他格式的菜单已验证可展开与滚动。命令生效、禁用原因、键盘、危险确认及保存由各编辑器现有与新增回归测试覆盖；本段记录布局与回归证据，不代替 A15/A16 逐命令真实操作验收，也不代替原任务 A1–A11 的真实模型与外部服务验收。

2026-10-12 知识库文件图标复核：按 `research/file-icon-competitors.md` 将初版折角纸微型字条替换为本地 Apache-2.0 Material Symbols Rounded 图形；DOCX、XLSX、PPTX、PDF、HTML、文本、媒体及未知格式分别映射形状，类别色由 Ant Design 主题 token 提供。真实“开始使用”库中，在深色模式检查列表、卡片及 420px 窄栏：可直接区分 PDF、HTML、PPTX、XLSX、DOCX 与笔记，长标题仍保留后缀，打开与卡片操作区域未被遮挡；媒体和未知格式的映射由组件测试覆盖，未在真实库上传样本。服务端上传/替换测试验证当前原件后缀，Renderer 299 项测试及 `pnpm check`、`pnpm format:check`、Web 构建、`git diff --check` 通过。浅色模式未做真实浏览器复核，颜色使用已有主题 token。截图存于本任务的 Codex 可视化目录 `file-icons-list.png`、`file-icons-card.png`。本项不代替原任务 A1–A11 的真实模型与外部服务验收。

2026-10-12 PDF 底部说明清理：移除正常浏览时占据画布高度的常驻技术说明；删除页的无撤销警告留在确认框，裁剪与纸型的简短说明留在操作菜单，失败提示仍可临时显示并关闭。页码、未保存状态和保存入口由独立状态行继续承载。针对性 PDF 渲染测试 16/16 通过，Office 类型检查、格式检查和 `git diff --check` 通过。

1. [ ] 建立工具合同清单：固定上游 36 工具、15 子操作的名称、参数、是否写入、附加状态和可用条件；保留来源 commit，给每个工具对应验证用例。核对上游 AI 模块的许可、依赖闭包和同步方式，遵守 vendor 不手改。
2. [ ] 先验证 TanStack AI 核心接缝：扩展 `model.ts` 接受工具、`threadId/runId/parentRunId/resume` 与 `agentLoopStrategy`；以现有 assistant-ui 运行时试做 TanStack client-tool interrupt 协议桥，真实执行读工具、写工具、server tool 与 client tool 同轮，核对 `RUN_FINISHED.outcome`、全量 `resume` 及 `parentRunId`。确认未保存画布上下文、当前文档引用、工具恰好执行一次、结果/错误可被模型读取、停止、排队、历史重载、原问答和 `onUsage` 多轮记账。为 DOCX agent 建合法生命周期路径，不直接沿用旧问答剥掉模型 `RUN_FINISHED` 的逻辑；若桥无法通过这些硬门槛，迁移浏览器运行时到兼容当前核心的 TanStack React，并复测 D-099 的消息/队列交互，再接其余工具。
3. [ ] 给 `DocxEditor` 建受控 agent 句柄：当前文档与版本绑定、读取当前画布、冻结选区、逐工具执行、异步结果落地前重验、首次修改前快照、整轮回退。将句柄经 `OfficeSourceEditor` 传到同页侧栏；主视图和其他格式没有写句柄。
4. [ ] 接入完整本地工具：正文/格式与 `apply_ops`、长文流式写作、修订、批注、脚注/尾注、图表、页面/节、样式、水印、文本框、图片、页眉页脚。按工具合同逐项完成执行和错误回传，不允许静默成功。
5. [ ] 扩展 DOCX 附加状态与补丁式保存：把各工具改的非正文结构接入 `DocxSession.save`，对每类准备真实 DOCX fixture，保存后独立重开解析并比较目标结构，检查未改动 ZIP 部件保留。确保 dirty、失败重试、保存基线与索引更新正确。
6. [ ] 实现通用外部服务配置：移除“DOCX AI”设置分区，将 Brave 文本/图片搜索归“网络搜索”，图片生成、视觉输入及转录归“模型”；迁移已保存的 `docx.*` 凭据且不泄露密钥。加密存储凭据、按能力探测；落地真实网页与图片搜索、TanStack AI `generateImage()` 图片生成、TanStack AI `chat()` 图片/音频/视频分析，以及安全媒体下载/临时上传。实际验证适配器与模型的输入模态；不支持音视频直接输入时补转录/抽帧。为每类至少打通一个服务；未配置或失败时输出明确诊断。将外部工具可用性逐轮反映给模型与侧栏。
7. [ ] 实现 `create_document` 四格式：生成可打开的初始文件字节，经知识库上传/解析/索引后导航。对 DOCX、PDF、Markdown、HTML 分别验证打开与内容；创建失败不得留下错误成功提示。
8. [ ] 完成交互：同一侧栏保留现有单篇问答/引用，展示工具进行中与结果；工具名称/参数/结果合同由单一清单产生或核验，历史重载能看到不含敏感正文的真实执行摘要；提供 AI 修订开关、长文中断保留/丢弃、整轮安全回退；切文档和停止时取消挂起工具。补文案、键盘与无障碍状态。
9. [ ] 完整验收：36 工具与 15 子操作矩阵、恶意/失效参数、异步人工编辑冲突、文档切换、断流、回退、保存失败、不同配置状态的端到端回归。逐项勾选 `prd.md` A1–A11，并记录实际浏览器与真实服务验证结果。
10. [x] 统一文档头部：抽取共用头部组件，所有文档采用笔记现有的返回、标题和右侧操作布局；按能力保留下载与改名。浏览器检查笔记、DOCX 的宽屏/窄屏布局与关键动作；其他文件和只读资料由共用组件的类型用例覆盖，完成 A12。
11. [x] 将 `EditorShell` 的保存动作移至底部状态行右端，去掉顶部固定操作列；更新外壳布局断言。复核笔记与 DOCX 的宽屏/窄屏视觉、保存入口和状态，六种编辑器的保存回归测试通过后完成 A13。
12. [x] 用共享尺寸令牌统一工作区、文档和问 AI 侧栏头部的 48px 高度与边界；浏览器量测三处下边界，复核窄屏标题和操作，完成 A14。
13. [ ] 按 `research/toolbar-competitors.md` 和设计第 12 条整理 DOCX 工具栏。先盘点现有命令、状态与快捷键，抽出直接控件和菜单共用的动作来源；再实现 DOCX 专属的单行自适应及“字体／段落／插入／表格／审阅／更多”入口。折叠使用编辑区实际宽度，逐组收纳并保持“更多”可见，不用高度受限的纵向命令滚动代替。修正文档页宽度足够时问 AI 侧栏绝对覆盖编辑区、造成工具栏测宽不等于可见宽度的接缝；空间不足时仍使用覆盖模式。验证所有命令、选区保持、当前值、禁用原因、键盘与弹层定位；浏览器在宽编辑区、问 AI 打开后的中栏和约 420px 视口截图并量测工具栏高度、溢出与操作可达性。通过 `pnpm --filter @mimir/office test`、`pnpm check` 与 `git diff --check` 后完成 A15；不要覆盖统一头部和底部保存的改动。
14. [ ] 按 `research/all-editor-toolbar-inventory.md` 和设计第 13 条逐项整理 Markdown、XLSX、PPTX、HTML、PDF。先为每种格式建立命令/状态/禁用/快捷键盘点和窄栏可达入口，再以编辑区宽度实现单行折叠。先完成已有长命令区的 PDF/PPTX/Markdown，再处理工作表 tabs 与查找布局的 XLSX，以及视图/设备/缩放的 HTML；每个格式做完即检查真实命令执行、当前值、禁用原因和危险确认。运行各编辑器已有测试、`pnpm --filter @mimir/office test`、`pnpm check`、`git diff --check`；浏览器在宽区、问 AI 中栏和约 420px 窄屏分别检查六格式高度、溢出、弹层、键盘、状态和底部保存。全部通过后完成 A16，不把 DOCX 单格式通过当作六格式完成。
15. [ ] 让知识库列表与卡片共用当前原件后缀和文件类型图标。后缀从已保存的当前原件信息提取并经共享响应合同传递；只给上传文件附加，避免重命名标题已有同后缀时重复。图标按 `research/file-icon-competitors.md` 选用许可明确、尺寸一致的类型图形与主题类别色，避免已被用户否定的微型字条。按 PDF、DOCX、XLSX、PPTX、HTML、文本及媒体格式检查图标可辨性，未知类型如实回退。验证原件替换后的后缀、笔记标题、长标题截断与两种视图的打开/操作行为；通过目标测试、`pnpm check` 和浏览器复核后完成 A17。

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
