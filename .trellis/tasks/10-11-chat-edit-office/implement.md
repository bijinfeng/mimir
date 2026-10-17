# 实施计划：完整 DOCX 对话编辑

## 2026-10-17 当前范围与验收入口

用户已将本任务扩展为固定GenOffice六格式Agent/手动工具与完整参数，以及PDF本地临时OCR；当前PRD与research/all-tools-final-scope-independent-check-20261017.md为现行范围。以下早期DOCX-only设计和未勾清单保留历史时点，不用于缩小后续已授权工作。最后参数缺口、R3、图片符号实际SVG、逐页生成、原音视频codec和320px面板已完成专项；第三轮原样 `pnpm check` 已 exit0（4606通过、2既有跳过、0失败），最终Web生产构建exit0；1764个源码/配置起止哈希无变化。最终证据见 `research/final-quality-check-20261017.md`。

用户明确代码与浏览器先行：真实provider未配置，新密码和Desktop自行验收。本轮不暂存、提交、归档或删除测试件。


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

### 2026-10-16 用户追加的样式与交互门槛

用户在真实 PDF 交互表单截图中明确否决全宽堆叠表单。新增能力必须同时完成视觉和交互验收，不能以执行器或组件测试通过替代成品界面。

- PDF 表单、图片和批注采用文档区右侧紧凑 Inspector；窄编辑区改覆盖式面板，内容内部滚动，保留文档上下文。
- 面板有清晰标题、可理解的字段标签和辅助信息、合理控件宽度、明确主操作；刷新/关闭使用既有图标系统和可访问名称。
- 字段选择与页码联动；只读、无字段、加载、失败、未修改、应用成功均有明确反馈；重复页号去重。
- XLSX、PPTX、DOCX、HTML 本轮新增面板一并复查层级、分组、当前值、关闭/键盘行为和窄栏表现。工具按任务放入相应 Ribbon 分类，避免持续堆到“开始”一行。
- 沿用当前产品字体、主题 token 和 antd 组件体系。短暂操作用紧凑弹层，持久编辑用侧面板；禁止裸表单横铺整页或用任意嵌套卡片补救层级。
- 用真实页面截图同时检查宽区与问 AI 中栏/窄区，集中修复后复验一次；将截图、具体执行和保存重开记录到对应能力矩阵。

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

### 当前补全：Markdown 真实流式草稿

最小缺口：Markdown `write_document` 等服务端积攒全文后才返回，用户看不到进度，也不能在中断后选择保留部分内容。沿用 HTML 的 NDJSON 草稿路径，服务端、共享 schema、Renderer API 和 Office 草稿组件分别负责生成、合同、传输和临时展示；正文仅在完成或用户选择保留后经原有版本守卫写入。预期改动限于 markdown-agent-writing、conversations 路由、document-agent schema、api/NoteEditor、MarkdownEditor 与独立草稿组件及针对性测试。保留当前保存、方言和整轮回退实现；不引入第二条持久化路径。

### 当前补全：跨格式新文件创建

当前四格式生成服务和桥仅允许DOCX来源，且把Markdown/完整HTML扁平化为段落；固定上游PDF/XLSX也有create_document，XLSX导出指定工作表显示值。沿既有上传/索引、ChatIo与新文件链接路径扩展来源和multipart单表导出，不改当前画布。共享schema统一文字创建/表格导出字段；服务保留md/html源文本，XLSX句柄提供当前未保存表的值导出，桥负责版本和取消校验。DOCX/PDF复杂格式保真仍独立记录，未验证前不宣称完整。

### 当前补全：PPTX 手动素材上传接缝

媒体、图片填充/背景与导入幻灯片需要用户选取的二进制文件。共享 schema 与 PPTX 服务/界面由 PPTX implement 代理维护；根会话只接 conversations multipart 路由、Renderer API 和 OfficeSourceEditor prop。请求在解析前按原件50MiB、素材32MiB、可选海报8MiB及1MiB边界预算限制；服务负责文档鉴权、类型/签名/解码、取消与原件补丁。沿现有画布版本门控和手动保存，不接收任意本机路径或原始XML；GLB待真实预览能力具备后再接入。

### 2026-10-16 命令带窄栏纠正

真实 DOCX 690px 编辑中栏的开始分类出现长命令带裁切。根据用户追加样式门槛，共用 CompactToolbar 改按实际编辑区宽度逐组压缩为各自具名菜单：从右侧低频组开始，保留分类、高频直接控件和所有组入口；不以水平滚动或总“更多”承载命令。控件只挂载一份，查找快捷键需在折叠时仍打开对应输入。690px 与 420px 的六格式实际布局、弹层和查找焦点由主会话验收，不以组件测试替代。

### 2026-10-16 DOCX 本轮收尾

原生图表保存同步嵌入工作簿引用格；新增原生段落/字符/表格样式管理与作用域实时CSS；脚注固定纸高、超长富文本续页与节尾/文末尾注视图；高级工具320px Inspector、窄栏覆盖、关闭/Escape/焦点返回与样式底部动作；共用Ribbon实际宽度具名分组折叠及折叠查找快捷键。9文件88/88、定向lint与diff检查通过；Office tsc此前通过，最终重跑被并行新增PptxAssetControls.tsx类型错误阻断，已通知主会话/PPTX所有者。真实浏览器已确认675px命令带无横滚、超长脚注顺序和600px灰带；最后的脚注左右缩进与420px/六格式视觉由主会话接续。详情与未验组合见research/docx-manual-capability-matrix.md，不勾选全部能力完成。

### 后续补全：剩余本地工具与交互

上一批新增工具与样式修正已通过定向检查和实际文件读回，整体对标仍未完成。继续按现行矩阵逐项消除本地能力缺口：PDF页面抽取/插入/替换/拆合、绘图/静态表单/水印/页眉页脚/属性及输出；XLSX剪切与引用迁移、格式刷/清除格式、自动尺寸、分级/组合、填充与剩余日常编辑；PPTX输出/打印、视图辅助、图标、图片去背景、格式刷、母版/动画及媒体剩余工具。各格式实现代理负责自身editor、服务、共享格式schema、测试和矩阵，根会话负责跨格式HTTP/API接缝、真实浏览器验收与独立检查调度。不得修改其他格式或手改vendor；需要新vendor文件时只更新固定commit同步清单并执行同步。长编辑采用既有右侧Inspector，短动作具名菜单，避免把新表单堆入Ribbon。每项需实际生效、保存重开、失败状态和窄栏可达性；结构不支持时明确列出缺口，不能用入口数量或保守拒绝替代最终对标。

### PDF 剩余本地工具执行边界

新增共享严格 local operation 合同、pdf-local 宿主与客户端执行桥；页面抽取/拆分/拼版/选页替换及导入、矢量绘图/静态勾叉、可替换水印/六槽页眉页脚、metadata/书签与当前工作副本输出。宿主保留原文档对象结构、不写存储；中文文字复用既有表单字体子集适配。UI沿既有PDF右Inspector并保留当前值、失败反馈和关闭回焦。根会话维护multipart/API接缝及实机验收，代理不改共用壳/vendor。

### 后续补全：新文档富内容生成

已确认`docx-create-document.ts`将DOCX/PDF的restricted HTML扁平化，表格/行内字形/链接被丢弃；固定上游create_document明确沿insert_content的HTML语义。最小修复在创建字节服务及独立rich转换适配，不改入库/索引/导航/旧md完整html保留路径。DOCX优先复用vendored blank/generate等引擎API，PDF保留富文本/表格的实际版式并以独立读取器和真实渲染验证。实现代理仅负责服务与专项测试/矩阵，不改跨格式路由/Editor/当前PDF/PPTX/XLSX，也不手改vendor；无法保真的语法需明确拒绝或记录真实边界，不能继续静默扁平化。既有100k输入与字体缺字/创建失败清理门槛保持。

### PDF 单页几何与页面复制保存补全

变更边界：shared PDF local schema、pdf-local及独立page-layout适配、Office工作副本构建/Editor和专项测试；移动PdfLocalPanel输出块。复用严格Catalog守卫、当前手动菜单和既有历史，不改shell/routes/font adapter/vendor。先以本地临时字节追加已选普通来源页，再保留原对象执行最终布局；纸型缩放内容及annotation并用MediaBox原点居中。回归须覆盖form+watermark+outline混合、复制控件可再填、导入/裁剪/纸型保存两次及保存后撤销重做，失败保留画布。实机交由主会话，不将单元测试等同真实浏览器。

PDF本轮已接保留结构layout与统一工作副本；旧导入即时local执行、失败不落pending，输出置顶/220px结果滚动，Inspector按未保存布局读属性。pdf-local15/15、Office7文件62/62、Office tsc通过，目标lint最后复查中。主会话实机裁10pt+A5+复制保存成功，独立下载发现水印临时Page残留后，统一local save增加flush+root GC，组件已核3可视=3间接Page；修复后实机下载由主会话接续。checker负责复制绘图ID稳定/归一角度最终复核。详细限制和验收见10-13-pdf-agent-manual矩阵；不勾选整体任务完成。

### 下一PDF切片：带书签AcroForm继续填写

当前local混批已用显式Catalog守卫验证原生Outlines+普通AcroForm，但表单Inspector/Agent的普通setFormValue仍走旧严格表单路由。后续复用已验证local preserving适配，使手动/Agent字段写共享当前工作字节、字段快照、版本/停止与历史，不扩旧全局白名单；补书签+watermark+duplicate后继续填/清空、保存两次及撤销重做。先待本片checker/主会话真实历史复验结束，不在当前HMR期间改此接缝。


### 带原生书签表单的显式保留适配

最小缺口是表单Inspector/Agent普通字段写仍拒绝已由local保留的Outlines。抽出pdf-local原有Catalog守卫至pdf-preserving-guard，不改允许项；新增pdf-preserving-forms显式adapter，纯字段复用原writer，含页面批次复用local已验证书签映射/删除清理，再返回同字段快照。旧applyPdfFormOperation默认严格路径不变；根会话切换forms路由并负责HTTP回归。此次先改server服务/测试，不改Editor、不动page-layout绘图ID；覆盖原生GoTo书签、连续中文/选项填写、页面后再填、控件/原文保留、dryRun/原子拒绝及签名/未知Catalog。


带书签表单服务适配+pending页面表单接缝已实现：preserving与旧forms两文件10/10；PDF八文件65/65、Office/server tsc及目标lint/format通过。root负责forms HTTP route并已独立构建成功，checker路由9/9；新read背景刷新不占Agent写锁，字段cache绑定bytes/layout，成功写一次history。UI已冻结交root实机Outlines+pending裁剪+填写+保存/undo/redo；checker另外修local dryRun假设属性误缓存，不由本代理改动。


### 自有绘图随页面几何保持可编辑

最小gap：页面Rotate/CropBox/等比纸型会自然变换绘图内容流，但MimirDrawings仍为旧显示空间坐标，现用拒绝阻止后续update错位。修改仅限shared drawing schema、pdf-local/page-layout、独立pdf-drawing-geometry及专项服务/Office回归、必要Inspector坐标min/朝向回显；不改routes/vendor/其他格式。用旧显示左上pt→原PDF用户空间→纸型等比scale→新显示左上pt映射所有bbox角和ink点，线宽同比缩放；保留drawing ID并复用复制避碰。现shape需可选局部rotation四分之一周（默认0）以精确保留line/arrow/check朝向；crop后页外路径需signed x/y，绝不clamp或矩形近似。派生几何只验证finite/positive，资源预算仍500对象/2000点/1000页/50MiB，不让原用户侧0.25pt/14400上限拒绝缩放后的真实缓存。

固定GenOffice HEAD已核480548fd55f1be3593ee0d8e316a734751d58309；save-pdf.ts333–418将Ink paths、rect/ellipse、from/to line/arrow保留实际几何，644–670纸型scaleContent+scaleAnnotations。Mimir采用显示空间缓存与用户空间转换，不照搬其annotation存储。2026-10-16再取WeKnora v0.8.3 definitions.go成功：工具仍属知识检索/wiki/sandbox，非PDF绘图/页面变换模型；站点HEAD本次20s超时，沿已记录上轮200证据，不把超时写成功。

回归先比较几何变换后的旧流和按缓存重新绘制的真实光栅像素，覆盖0/90/180/270、非零CropBox、非对称arrow/check与ink折线、边缘裁剪及A5；再pending→两次保存→update/delete、复制稳定ID/调序/undo。成功后冻结交root实机，checker独立复核；未完成前不删矩阵旧限制。


绘图几何切片已实现并冻结UI：pdf-drawing-geometry统一local/page-layout坐标，shared支持局部rotation/arrowHeadLength与signed/finite派生几何，Inspector回显派生坐标/方向并将草稿绑定当前源绘图。server几何6+local15共21/21；Office PDF八文件49/49，追加同页裁剪后坐标即时刷新与undo回显后local14/14再通过；Office/server tsc、目标Oxlint/Oxfmt/Antd lint、diff检查通过。逐形四旋转真实光栅像素交并比>97%，覆盖offset CropBox/A5、边缘裁剪、超旧限派生几何、复制调序和update/delete；pending→保存两次→再次编辑/undo/redo组件通过。合同§10及PDF矩阵已替换旧几何拒绝边界。根会话接真实浏览器与独立checker，不将组件或服务验证当实机/模型验收。

### 2026-10-16 PPTX 四工作区视图

实施范围：PptxWorkspaceViews.tsx、pptx-workspace-views.css、PptxViewControls.tsx、PptxEditor.tsx及独立workspace-views组件集成测试。模式隔离到documentId；普通沿原ThumbnailSidebar，大纲与同一stage组合，浏览多选原序排序，阅读在当前工作区适配宽高。编辑器唯一整合者同时接入各自负责代理产出的填充/背景Inspector与绘图tab/overlay，不修改它们的实现文件。

目标验证：纯切视图不dirty/增版本；大纲改字即时同步并保存重开；排序save→undo/save→redo/save原生页序；浏览范围/全选/Enter；阅读局部键盘/Escape回焦；绘图异步请求切阅读后signal abort且迟到changed:true不改版本/dirty/history。宽屏/420实机由主会话统一验收，单元测试不记作实机。整体任务保持未完成，不归档或提交。

### 2026-10-16 PPTX 绘图原生保存接缝

最小缺口是没有笔迹采样、预设、可重开的笔迹元数据和只作用于笔迹的橡皮擦。实现范围为独立PPTX ink helper/控件/Canvas/样式/测试，加shared `manual_ink`合同、Agent action arm及server专属adapter/dispatch；Editor整合归views所有者，不改vendor、渲染器和其他格式。沿固定上游透明PNG `p:pic`+`descr` v1矢量点列、atomic addPicture/deleteElement及现有字节/版本/保存/历史合同。服务5/5、Office定向15/15、server tsc与目标lint/format通过；实拖、宽/420px和下载重开由根会话接续，不宣称整体补全完成。详情在PPTX ribbon-local-audit末段。


### 2026-10-16 后续PPTX工具完整性切片

按固定96回调清单继续三条独立实施线：从头/自定义子集/排练计时放映，Slide/Section/Summary Zoom，当前复杂背景保真应用全部。根会话统一Editor/shared导出/action/route接线。另补已存在引擎的无layout参数setSlideLayout重置入口：行为位于原生resetSlideLayout，移除占位符explicit transform，保留文字和其它对象，不以重新套用当前layout替代。仅改DeckControls与其Editor整合回归，验证默认几何、undo/redo/两次保存及未改theme/master/layout。全部新工具仍按紧凑Ribbon/右Inspector/固定操作/420宽/当前值/取消版本守卫验收，不修改vendor。

本片浏览器收口：Show具名列表持久化/path定位及回焦，真实排练13/5秒advTm保存→undo/save→redo/save逐entry恢复；Slide/Section/Summary Zoom实际PNG640px/内部关系/新增摘要页/原生sections；复杂路径4stops/alpha50000/tileRect复制五页及原件undo/redo；标题54→84pt后reset移除显式xfrm且保留文字/其他对象。最终新Show/Zoom primary按钮重复文案已修为图标+单一label；1280/420×880目视、固定footer、分层Escape/回焦通过。Web/Server build exit0，专项门禁与全仓既存lint限制详见审计连续日志；整体目标仍in_progress，不提交或归档。后续仍有动画hover/预览/gallery/自动逐段与transition全部、rich cursor字形、拖绘/组内多选、输出/讲义等缺口。

### 2026-10-17 PPTX 动画、富文本与输出剩余工具

下一切片按当前真实矩阵继续：动画gallery替换/追加/清除、五路径预设、逐段拆分、hover与编辑画布预览、切换全部；文字从元素整段格式扩至真实字符范围，同时保留未选范围与原run；输出当前工作PPTX副本、讲义/备注打印。行为分别归独立动画控件/预览适配、字符范围适配/编辑控件、输出构建与Inspector；根会话唯一修改PptxEditor整合三条接口，worker不互改Editor。沿原setText/runTxn/专属manual动作、版本/取消/保存/历史，禁止手改vendor或放宽模型白名单。文字范围必须真实可选/当前态，不能用字符数字表单替代；动画预览不dirty、不保存演示态；输出只读快照且pending/过期结果不得下载旧文稿。实现者先核对固定上游及WeKnora参考，记录证据与适用边界，再写自身实现与专项测试。根会话完成跨接缝、独立checker、实际浏览器宽420与保存下载，保留全目标未完成状态。

本片最终实机收口（2026-10-17）：真实Q3选区加粗/斜体与caret pending、未保存PPTX副本及undo/save/redo/save原生entry闭环通过；三段淡入+圆形路径、Gallery替换与聚焦预览Escape、六页fade/advTm保留通过；讲义3张/纸完整420预览，修掉iframe1px内滚动且固定footer。Office/Server/Shared tsc与独立checker、HTTP route4/4、目标lint/format/diff通过；最后+16高度后组件4/4和Web build exit0。实际截图/下载/逐项边界在审计连续日志2026-10-17段，96回调矩阵已同步。系统打印/Desktop用户自验、真实模型未配未验，全仓既存lint阻断不冒报通过。整体仍in_progress，不提交/暂存/归档。

### 下一PPTX切片：主题图库、段落范围与拖绘

在已冻结的动画/字符范围/输出基础上继续现行96回调矩阵：固定GenOffice八主题可见预览与原生theme应用；真实字符选区映射到段落范围、对齐/方向/列表详细参数；形状图库点击/拖绘在画布确定几何。三个实现边界分别为DeckControls/主题纯数据、ObjectControls/段落纯适配、ShapeGallery/插入Canvas纯适配；root唯一整合PptxEditor，不能互改。沿现有runTxn/版本取消和原生保存，不改vendor或通用模型限额。宽/420样式、当前态、固定动作与分层Escape为共同门槛。各实现定向验证后独立checker，root做实际浏览器/下载。整体不提交或归档。


本片最终收口（2026-10-17）：八主题图库、真正局部段落/完整列表参数与形状点击拖绘完成代码和浏览器验收。实机发现并修复host重解析临时ID/未发布版本、首次creationId升级，以及保存commit推进revision导致选区丢失；新增真实未经预处理Agenda与异步中间刷新/延迟select/删除undo/换目标/失败保存等回归。最终连续apply和save后继续第2段编号3→5均保留15字符范围。主题32/33/34、拖绘29/30/31、编号37/38/39原生ZIP逐entry历史恢复通过。宽屏/420截图及分层Escape回BUTTON通过；最新独立checker5文件125项、三包类型检查、目标lint/format/Antd/styles/diff和最终Web/Server build通过。具体证据与截图在审计连续日志及96回调矩阵。仍有组内多对象、AI快捷预设、拖裁切等边界，整体in_progress，不提交/暂存/归档；Desktop用户自验、真实模型无配置暂未验，全仓既存技能lint阻断不记作通过。


### 2026-10-17 下一批：图片拖裁切、完整轮廓与图标库

当前缺口分别位于图片画布操作、setStroke参数入口、图标图库数据与检索，不改vendor。新增独立CropCanvas/几何适配，以原生setPictureSrcRect及box保持缩放/位置；新增Outline Inspector显示当前线条并明确应用；图标按固定上游实际28项恢复完整图形与搜索/键盘。root唯一整合PptxEditor，另将图表插入的3类补至已有引擎12类，图片补任意不透明度与90度旋转入口。各实现遵循既有主题、固定主操作和420px约束，版本/切目标/取消/失败不覆盖当前画布。当前普通图片仅顶层对象；组内与多对象、AI预设等继续保留在总清单。完成后独立check及真实浏览器下载/保存/历史证明；不提交、暂存或归档整个任务。


本批代码与浏览器已收口：28项固定图标真实PNG、12类插入/双系列组合图、八手柄指针/键盘裁切、37%/90°、完整单对象轮廓均已保存/下载原生回读，裁切两条及轮廓history逐entry恢复。修掉outline类名碰撞、Inspector横挤、缺可见标签及窄屏裁切条遮挡；AI快捷命令仅准备自然中文草稿，八语言入口已验，无截图附件/无真实模型执行。最终Office/目标门禁通过，Web build exit0，独立checker199及修后130/AI18均为独立重叠切片不累计。全仓仍有bundled技能lint/并行ProviderForm阻断。详见横向连续日志与PPTX96项矩阵。本任务in_progress，不提交/暂存/归档。

### 2026-10-17 当前切片：统一多选与组合成员编辑

最小缺口：画布仅保存单一顶层选择，排列面板另存自己的集合，批量字形/段落/填充/轮廓没有共同目标，组内对象无法从画布继续编辑。root唯一维护PptxEditor集成：持久ID集合、修饰键/框选、对象树和选择反馈；implement代理负责独立选择纯适配、紧凑批量格式Inspector及定向回归。宿主已有固定上游group参数，单层组内编辑沿其既有白名单与事务，不手改vendor、不把不支持的操作自动降级。字符范围保持原单对象流程；多对象明确显示作用对象数与混合值、显式应用、原子一次历史。分组变更/切页/源变更/迟到响应受现有版本与取消守卫约束。各文件所有权在代理任务中明示；独立check后根会话浏览器宽/420及原生下载保存/撤销重做。未支持深层组合、模型实际执行、Desktop仍明确记录边界，整体保持in_progress。

本片代码与浏览器收口：统一画布/对象树/排列多选、真实空白框选、组合直接成员格式与文字草稿已验。双对象加粗52→undo53=51→redo54=52，组合批量填充/轮廓/居中57→undo58=56→redo59=57，成员文字61→undo62=60→redo63=61，均为全部ZIP entry独立比较；保存64保留Q4与caret25，refocus追加!正确后取消。最终生产构建后浏览器Escape确认面板关闭且activeElement为真实“打开对象选择与格式”按钮。宽1280/窄420截图、固定footer与无横溢出通过；成员文字改显式应用解决快速输入丢字，保存范围恢复不抢外部焦点。独立9文件124/124，末次2文件14/14为重叠追加回归；Office tsc、目标门禁及Web build通过。全仓pnpm check实际仍因480项bundled Impeccable脚本lint失败。详细证据见连续验收日志及checker研究；整体in_progress，不提交/暂存/归档。

### 下一切片：批量详细格式、组成员几何和新批注

最小缺口在现有统一选择的参数编辑：多对象仍只提供段落对齐/轮廓颜色宽度，直接组成员没有位置尺寸与形状预设入口，新批注缺单独聚焦入口。选择实现者独占SelectionControls/selection纯适配及其测试，扩展现有原生段落与轮廓参数，保留各对象未改参数、混合值和一次事务。组实现者独占新的SelectionGeometry组件/纯适配与必要group宿主回归，先核固定引擎的父坐标契约，不把绝对画布坐标直接写入子坐标。root唯一改Editor接线和Deck批注聚焦，复用现有Inspector、固定底部动作与原生历史。单层组/顶层目标可写，深层组仅可读；不改vendor、不拓宽模型白名单、不改其他格式。每条需当前态/取消/失败、原生保存和未改属性保真；独立checker后根会话真实浏览器宽/420及保存历史。整体不提交/归档。

本片收口：详细批量段落/非图片列表/完整轮廓、组成员局部几何及独立新批注完成代码/浏览器验收。实机65段落参数原生读回；66→undo67=65→redo68=66；69几何→undo70=68→redo71=69，全部ZIP entry独立比较；72原生批注与保存保留草稿/快捷键聚焦/Escape回实际来源通过。宽1280/420截图、固定footer及无横溢出已验，ISO时间显示已修。独立9文件58/58、server2/2、旧专项5/5、末次批注14/14为重叠证据；两包tsc/目标lint/format/styles/Web build通过。全仓check480项技能脚本错误仍阻断，整体in_progress不提交/归档。

### 下一PPTX切片：组内flip宿主修复与复杂批量样式

现有裸Agent group flipElements修改内存却未flush父XML，不能以模型拒绝代替补全。宿主实现者独占server host及独立私有适配/测试，在原runTxn事务内沿原生flip后实际transform刷新组child，保留公共操作名/权限与非组路径，覆盖flip→结构操作及原子失败；不改vendor/Editor。选择实现者继续独占SelectionControls/Fields/helper及测试，补真实渐变与32组合样式批量，沿现有接口/混合态/一次事务/固定footer，图片纹理若需受控manual_fill先协调接缝，不拓宽白名单。root统一跨层接缝、独立check与浏览器收口；图片符号批量/深层组/广泛图片与剪贴板等继续列真实缺口。


### 下一PPTX切片：统一选择的复杂填充与组合样式

最小缺口为统一多选仅可纯色/无填充，现有渐变与32组合预设仅有单对象入口。选择实现者独占SelectionControls/FormatFields/selection及新增填充纯适配/控件/CSS/测试，复用pptx-fill-presets和shape-presets数据与几何预览。草稿按对象原值合并，角度/路径/色标局部变化保留各自未改色标和原生fillTo/tileRect/scaled；组合预设显式改填充、描边颜色和dash，保留线宽/箭头/其它线参数。沿固定setFill/setStroke+group一次原子事务，不改Editor/vendor/shared/server、不拓宽模型白名单。纹理setImageFill为not-ai-callable且manual_fill仅单顶层对象，先提出严格批量接口，不伪造降级或多次写入。根会话浏览器宽/420与下载历史；本片先完成无上传渐变和32预设的native真实host、两次保存和history。整体继续in_progress，不提交/暂存/归档。

本片收口：复杂渐变/32组合样式/八纹理与各自原图批量、裸组内flip已完成代码和浏览器闭环；实机75渐变、76→undo77=75→redo78=76、79木纹→80拉伸→undo81=79→redo82=80，均独立ZIP entry核对。四列样式挤字已改图上名单行下，宽1280/420生产构建目视通过；详细证据见横向连续日志及selection-fill独立复核。全仓480项技能lint仍失败，整体in_progress。

### 后续两条独立边界：DOCX 图片/目录与 PPTX 选择剪贴板

DOCX实现者独占DocxEditor及新图片/目录控件/helper/CSS/tests，先复用原生image属性、replace/crop模型和insertToc；图片编辑冻结实际PM节点与版本，异步解码后复验，单次事务/原件保真/两次保存与历史。紧凑右Inspector、真实预览、固定应用，420验收；目录诚实说明分页页码由Word更新，不能冒称已回填。无需vendor/server/public schema改动。

PPTX实现者独占ClipboardControls、选择clipboard纯适配、shared clipboard arm及manual-clipboard服务/专项测试；root唯一整合PptxEditor。按研究pptx-selection-clipboard-plan-20261017.md，旧elementIds保持兼容，新targets明确直接父组合；组内成员保留父变换包装为独立组合，UI说明，连接引用等未迁移结构整批明确拒绝。先完整验证后一次cut/paste/history，清timing/孤立资源、保留共享media；signal/expectedVersion/目标绑定及成功新refs回选。系统剪贴板/外部图片另片，不将内部ref等同系统载荷。两线冻结后独立checker与root浏览器验收，不提交/归档整体任务。

本片浏览器已验证DOCX真实替换240×160、四边25%裁至120×80、去背景alpha0、原生TOC字段；crop和TOC save/undo/save/redo/save所有ZIP entry精确恢复。PPTX选择copy/paste与cut历史全entry精确恢复，原组保留connector、粘贴独立2子对象组且自动回选。详见research/docx-pptx-toolbar-browser-20261017.md。窄屏实机补修目录固定footer与共用Ribbon72px单行分组，独立8/8及11/11，尚待统一新build真实复验；不以源码/测试代替视觉。

### 当前下一切片：DOCX表格设计与XLSX高级透视

DOCX表格实现者独占DocxEditor与新TableDesignControls/Preview/helper/save适配及测试，复用固定上游5预设/六tblLook/完整边框/属性，必须避免条件样式显示值烘成直接格式，原生文本/单元格/合并结构保真，浮动定位未证实则明列边界。XLSX实现者独占ObjectControls、新PivotControls/helper/CSS/tests及XlsxEditor透视接缝，复用现有add_pivot的多values/groupings/filters/pageFields，同表新建高级配置；既有复杂native定义真实只读+刷新，因无edit_pivot不冒称可原地编辑。两者沿320pxInspector、内部滚动/固定单一操作、当前值/取消/版本和历史，一次事务；root统一独立check与浏览器宽420及HTTP原件回读。不提交或归档全任务。

### HTML规划问题最小修复（root所有）

已声明HtmlClarificationQuestion.multi但HtmlAgentPrompt一律ToolbarSelect，且questions/brief放subbar满宽表单。root独占HtmlAgentPrompt.tsx、HtmlEditor.tsx、html-inspector.css、agent/html-agent.ts及独立prompt/句柄回归；复用320px现有Inspector布局，问题/brief内容独立滚动与固定动作、Escape明确取消与回焦，元素Inspector暂时让位，源码/预览保持挂载。多选保持字符串数组，结果保留旧answers摘要并仅在有multi时附结构化selections；旧single回调结果不变。只修既有multi契约及呈现，不扩plan brief/pin/restyle写入语义或真实模型验收。参考现行固定GenOffice ask_clarification multi映射与WeKnora权限边界证据见remaining-tools研究；不改vendor/server/publicschema。

### 2026-10-17 HTML 页面规划交互收口（续）

- `ask_clarification.multi` 已用真实 Checkbox.Group 多选；按原选项顺序返回数组，保持原 `answers` 摘要和旧单选响应兼容。合法原型同名 question ID 的读取显式使用 own-property，避免继承属性使面板崩溃。
- 问答/提纲复用320px右侧 Inspector，源码与预览保持挂载；固定底部动作、20px分区间距，单选仅显示一次字段标签。代码目标38/38通过；独立checker继续核对取消接缝。
- 无模型配置，浏览器用 `/tmp/mimir-html-planning-harness` 导入实际 `HtmlAgentPrompt` / `EditorShell` / CSS，页面明确标“真实组件验收·示例数据，不调用模型”。420px宽时面板320px、整页scrollWidth420、footer固定802–855；1280px宽时面板320px、整页无横向溢出。多选提交数组及编辑提纲返回值实际验证。该证据仅说明组件及交互，不冒充真实模型调用。
- 截图：`/Users/admin/.codex/visualizations/2026/10/16/01a142b8-e543-7780-8181-44e1e0f94f51/html-planning-420.png`、`html-planning-wide.png`、`html-brief-420.png`、`html-brief-wide.png`。首轮发现单选重复标题并修复，第二轮已确认；取消守卫修复不再开展可选视觉打磨。


### 2026-10-17 表格设计、画布绘图、透视与规划界面收口

- DOCX：5表格预设、六look/10边框范围/四边距/AutoFit已接。真实4×3表应用蓝条纹只改document.xml、12格文字保留，undo/redo全部ZIP entry精确恢复。最终look为3列×2行，320px Inspector/固定footer/420无整页横溢出/Escape回真实入口通过；浮动定位仍未接。
- PDF：真实自由笔6点新增、移动、8手柄缩放、连续两次草稿拖移已验；两次拖移一次应用，保存→单步撤销→重做原始字节精确恢复，AcroForm前两页各5annotations和第三页原arrow保留。旧精确数值默认折叠，最终宽/420截图通过，仅支持自有绘图手势。
- XLSX：高级透视新建支持多values/aggs、报告字段、分组/筛选，已有定义只读+刷新。实机发现自闭合cell吞后继，修复row/c；独立检查另修shared-si空项错序，非vendor。真实原生两部门470/440、总计910；源新增研发部/2028后刷新470/280/260、总计1010，新建和刷新历史均全ZIP entry精确恢复。最终构建reload结果仍正确；无edit_pivot/跨表新建，Excel刷新分组存在已明示边界。
- HTML：实际Checkbox.Group多选数组、停止/切源/过期结果守卫，47/47；真实组件示例数据harness在宽/420提交与brief编辑通过，无模型调用。目录固定footer最终420按钮bottom841.359，Ribbon最后AI组真实展开、72px局部横滚且无整页溢出通过。
- 独立DOCX/PDF77/77；XLSX最终Office61/61、Server14/14；相关两包tsc/目标lint/format/styles/diff通过。最终Web build exit0：/tmp/mimir-toolbar-final-accepted-web-build-20261017.log；既有构建警告和全仓480项技能lint阻断均未冒称消失。
- 完整证据、native文件名及截图见 `10-11-chat-edit-office/research/toolbar-browser-acceptance-20261017-final.md`；当前缺口矩阵已同步，整体继续in_progress。未暂存/提交/归档，Desktop用户自验，真实模型未配置未验。


### 持续补齐：引用、复杂填充、外部剪贴板与 PDF 页面图像

用户要求直到所有工具补齐，保留完整矩阵，不把本批完成等同整体完成。DOCX实现者独占References新控件/纯适配/DocxEditor与docx.ts最小sources保存接缝，补原生TOC更新/SEQ题注/CITATION+BIBLIOGRAPHY/sources/XE+INDEX/通用域；XLSX实现者独占复杂fill读取/原生patch/host验证/格式Inspector与必要Editor网格接缝，补pattern/theme/tint及linear/path gradient；PPTX实现者独占Editor/Clipboard与shared/server clipboard，补真实系统图片/文件drop/快捷键与多页复制。均复用原生历史、版本、取消守卫且不改vendor。root独占PDF页面图像导出：新只读Inspector、原件工作副本物化、页范围/72/150/300dpi PNG，单页PNG/多页ZIP，真实图像预览、显式下载，源变化与取消不得下载旧结果。核心行为在pdf-render/独立export纯适配与PdfEditor快照接缝，复用现有PdfInspector/CSS，不改server或模型目录。UI同320px/内部滚动/固定动作/420；专项检查+独立复核后根会话浏览器/原件验收。整体不提交/暂存/归档。


### 下一切片：DOCX 列表详细工具与 PDF 原文段落移动

引用/复杂填充/系统剪贴板/页面图像批次通过独立检查，根会话收口最终浏览器证据。继续当前缺口矩阵：DOCX实现者独占DocxEditor与新增列表Controls/helper/CSS/tests，复用原生numbering定义补项目符号/编号库及多级列表详细参数，当前值/混合状态与冻结选区、一次PM事务和补丁保存；文字大小写/排序若不能同片可靠保真则明确保留。PDF实现者独占pdf-content-agent、新block对象映射/私有writer、server pdf-agent-host/catalog及相应shared/renderer host接缝与测试；按pdf-original-block-next-boundary研究先真实原文段落移动，多对象矩阵同偏移，保留字形/字体和非目标对象，不用覆盖重绘。root独占PdfEditor及新手动block Inspector集成，先由实现者给出稳定的选择/工具接口后接入。两个实现者不互改文件，不改vendor，不解除AcroForm/未知Catalog等已有结构拒绝。紧凑Ribbon/320pxInspector、内部滚动/固定动作、当前值/版本取消、真实420和原件history仍是门槛。完成各自专项后交换独立checker；全任务in_progress，不提交、暂存或归档。


2026-10-17 四工具批次已收口：DOCX原生TOC更新/SEQ题注/来源与引文、XLSX18图案/theme/tint/多色标渐变、PPTX系统图片及多页复制剪切粘贴、PDF工作副本页面图像导出均完成代码、独立复核、真实浏览器和原件验证。最终Office128文件1359/1359、Web build exit0、目标静态/类型/Antd/styles/diff门禁通过；全仓check既有480技能lint仍阻断。首轮真实视觉发现来源空按钮/填充侧栏随折叠卸载/primary重复文案，均修复后再次1280/420截图；XLSX237°未应用草稿保留、Escape回格式，DOCX可见次要按钮与fullwidth来源，PDF单一生成/下载文字和6px图文间距，PPTX340px内部滚动/固定粘贴均实查无整页溢出。PPTX三页夹具复制两页→五页、原生备注/互链/media保留，undo仅17空ZIP目录差其余部件精确、redo所有entry相等；系统图像、DOCX、XLSX其余历史精确。完整native文件、截图、结构限制在research/toolbar-four-tools-browser-acceptance-20261017.md，矩阵已同步。不将此批完成等同所有工具完备；下一DOCX列表/PDF原文段落移动已开始。未暂存/提交/归档，测试件保留，无模型调用，Desktop用户自验。

### 接续小切片：XLSX 完整可插入形状库

现有形状宿主已使用固定GenOffice `xlsx-gateway/shared/shape-types.ts` 的 ADDABLE_SHAPE_TYPES 白名单，手动入口仅6项；画布已有presetPath/presetPolygon但未知形状静默画矩形。PDF宿主实现者冻结后独占XlsxObjectControls、新XlsxShapeGallery/纯适配/CSS/tests、XlsxObjectLayer必要几何与相应测试；不改XlsxEditor/renderer/server/shared/vendor，不扩宿主白名单。复用现有PPTX形状分组中文标签与真实几何，按XLSX白名单过滤，额外保留textbox；库可搜索/按组浏览/当前选择明确，复用320px Inspector/内部滚动，插入仅一次真实operation。未知/复杂原件预览必须诚实提示，不再静默矩形假象；新支持形状须实际几何和原生保存/history证据。源/选表变化与版本取消遵循现有对象面板合同，若发现需跨Editor接缝先报告再由root处理。root在当前DOCX/PDF批次收口后做宽420/原件浏览器；独立checker随后审查，不提交/暂存/归档。研究沿用缺口矩阵固定版本与WeKnora权限证据，Office工具以GenOffice/Office为主。

### DOCX 接续：选区大小写转换（正文排序证据纠正）

只读研究已确认固定GenOffice的DOCX正文排序是disabled/NotSupported占位，旧矩阵声称有执行器不准确；排序不按确定对标缺口实施。大小写有四模式与Shift+F3真实实现，才是本片确定缺口。原列表实现者独占新增docx-case.ts/DocxCaseControls.tsx及其tests（如需CSS独立新文件）；现有DocxEditor接缝等列表checker冻结后由root协调。采用紧凑下拉四动作与可理解标签/示例，不为四动作新增长表单。基于真实选区，一次事务保留marks/非目标文字与Unicode扩长选区，连按Shift+F3可循环；检查跨run词首/句首和保护域、修订、表格/非正文边界，不能改域显示缓存冒充原域编辑。只改允许正文文字，失效选区/只读明确禁用，原生保存/重开及undo/redo证据必备。不扩排序、设计、绘图/保护，不改vendor/server/shared；沿现有DOCX样式/history/save。root负责集成后宽420真实浏览器与独立checker。


2026-10-17 列表/原文移动/形状/大小写批次收口：DOCX15预设九级列表与四大小写+ShiftF3、PDF原生整段多对象矩阵移动、XLSX105形状图库均经实现与独立checker、真实浏览器宽/420、下载原件保存history验证。列表只改numPr、非目标原XML保持；大小写Unicode扩长/粗体与非目标段保留、保存撤销重做精确；PDF混合字体/图像流保持、Rotate90重复文字实际点选移动；XLSX两插入只改drawing1.xml、两级history精确。真实视觉发现单位挤压和表格行高导致的图形锚点偏移，分别修为局部flex单位/长字段满宽与DOM真实轨道测量；最终420无整页横溢出，75/100/150%图形与row10一致。最终Office141文件1460/1460，Server3文件10/10，四包类型/Web build/目标静态通过；全仓check既有480技能lint仍阻断。证据research/toolbar-lists-native-blocks-browser-20261017.md及toolbar-case-shapes-browser-20261017.md。当前矩阵已纠正GenOffice正文排序为禁用占位并更新真实已验能力；其余缺口继续明确保留。无模型、Desktop用户自验；未暂存/提交/归档/删除测试件。

### 持续全量补齐：设计、原文重写、演示参数与HTML持久规划

用户再次明确继续直到全部工具补全，目标保持完整，不以本批通过代替全量完成。按当前去陈旧矩阵推进：DOCX原列表实现者独占DocxEditor及新增设计Controls/helper/tests，补主题字体/色、页面底色/边框与真实预览/原生保存/history；后续绘图/视图/保护对比仍留明确清单。PDF原文宿主实现者独占pdf-block-writer/text-blocks/content-agent/server相关block接口与新重写测试，研究并实现真实edit_block保留/重排与部分原文替换，不覆盖白块冒充删除，不解除复杂结构守卫；root待接口稳定接PdfEditor手动面板，PDF其他文件先不互改。PPTX独立checker转实现者，独占PptxChartAppearance/必要图表helper/tests及新样式CSS，补主题派生色板与任意系列/点色输入、当前值、未目标override保留；本轮不抢PptxEditor，组内图片与AI截图后续接续。root独占HTML Agent/Prompt/brief保存接缝，补丰富brief/alternative/redo/user_edited与持久pin，保持实际版本取消与未保存/history合同。各自先核固定GenOffice和WeKnora证据，不重复已有完成能力；紧凑Ribbon/320px Inspector、可见当前值/内部滚动/固定主动作/420真实浏览器不降级。各专项冻结后交换独立check，不嵌套worker，不暂存/提交/归档/删测试件。无模型代码路径以契约/组件验收，Desktop用户自验。

### XLSX 接续：结构化范围剪贴板

按 `research/xlsx-structured-clipboard-plan-20261017.md` 实施。原PDF实现者独占新增XLSX clipboard core/HTML系统bridge与tests、XlsxClipboardControls/XlsxManualControls/XlsxEditor及局部新CSS/tests：稳定Editor-owned冻结copy/cut、真实HTML/plain、网格作用域C/X/V、同簿跨表原生copy_range/move_range一次历史、身份/版本/取消/失败保留；无可靠源资源核对时成功后明确失效要求重复制，不静默values降级。外部HTML仅支持经真实原生读回证明的矩形基础格式子集，不支持时给用户主动values-only；320px内部滚动固定动作。另一实现者独占server行列继承样式物化与原生tests，不互改server/shared/vendor。根会话统一独立check、宽420浏览器和下载原件/history验收；本实现者仅专项与类型静态，不并发fullOffice/webbuild，不提交/暂存/归档。


2026-10-17 设计/原文重写/图表配色/丰富HTML规划切片通过实现与独立复核、浏览器1280/420与native保存history，详见research/toolbar-design-rewrite-browser-20261017.md。Office受控147文件1517/1517；最后共享RGB定位修复专项149/149及类型静态通过，最终Web构建exit0。全仓480既有技能lint仍阻断，整体in_progress。根会话发现窄屏RGB下溢，修正估高方向及viewport可滚动高度后实际按钮完整可达/Escape只关子层。下一XLSX结构化clipboard由原PDF实现者独占Office核心/控件/Editor，原DOCX实现者独占server copy/move继承样式helper和tests；不相互改文件，不放宽原件守卫，不并发全量build与测试、不提交/暂存/归档。

### DOCX 当前未保存副本导出（root所有）

按research/docx-current-export-plan-20261017.md补最小导出路径：DocxEditor、docx-output及新真实组件测试，复用session.save与live notes/comments及全部原生design/list/reference参数，点击冻结版本且迟到拒绝、不调用知识库save/markSaved、不改dirty/history，紧凑视图分类具名导出。另两agent并行XLSX，不改这些DOCX文件；独立checker与真实浏览器后再计为完成。

### 2026-10-17 PPTX 直接组成员图片

按 `research/pptx-group-picture-next-20261017.md` 实施直接普通图片的当前不透明度、四边数值裁切/重置、PNG/JPEG替换及同尺寸去背景回写。私有 manual_picture action 原子应用属性；已有 manual-asset picture 新增group，保留MIME/内容/尺寸核验。自有helper按唯一直接slice同步父group XML/child模型，以整slide前后引用清理媒体；不解组、不修改vendor。组合图片Inspector沿320px紧凑三tab/固定操作/内部滚动/当前值与版本取消链，根会话只集成验收DOCX/XLSX，PPTX本片文件由该实现者独占。来源格式扩展、深层/媒体和组内画布拖裁切不在本片；专项native/组件/history/类型与静态门禁，不跑全量Office或Web build，不暂存/提交。

本片实现已冻结交根会话：直接组图片三tab、真实37%与四边当前值、原子manual_picture、group替换/同尺寸cutout均已接；malformed fill预检和仅blip内SVG清理经失败复现修正。实际Editor首次数值mousedown→click、素材host、成员回选、保存后全entry精确history、Escape取消与回焦通过；Office4文件26/26，Server2文件27/27，新片最终17/17，三包tsc/目标oxlint/oxfmt/antd/styles/diff绿。原生两页共享PNG夹具 `/tmp/mimir-pptx-group-picture-20261017.pptx` 已交root；production宽420/下载浏览器验收及独立checker尚待根会话，不把本片源码/组件测试计为完成全部工具。详见research/pptx-group-picture-implementation-20261017.md。未跑fullOffice/Webbuild，无暂存提交上传删除。


2026-10-17 当前副本/结构化范围剪贴板已完成本批代码、独立检查、真实浏览器与原件验收，详见research/toolbar-clipboard-export-browser-20261017.md。DOCX草稿A/B导出、undo/redo全部ZIP条目精确且库原件字节不变；XLSX跨表copy/cut两级保存history全entry精确，真实浏览器C/X/V、HTML literal/基础样式和主动values-only已验。基础行列样式读取、最后styled overlap、implicit row和单引号dimension重复写入均已修；Office151文件1558/1558（在最终视觉局部修正前）、后续UI7/7、server96/96、双包类型/静态与最终Web UI构建通过。真实420首轮空白导入/无标题/散乱居中修正后唯一确认：320px侧栏、scrollWidth420、footer693.36/button681.36、Escape回live剪贴板入口。模型未调用、Desktop用户自验、480既有全仓技能lint仍阻断；整体in_progress，不提交/暂存/归档/删除测试件。下一直接组图片由原PPTXchecker转实现者独占全部PPTX helper/nativehost/shared/controller/Editor及控件，采用manual_picture私有opacity/srcRect和manual-asset group替换，数值裁切/同尺寸去背景，保留真实父XML与原子历史；不开放深层组/画布拖裁切/新增图片格式，独立checker和root真实浏览器后再更新矩阵。


### DOCX 视图与缩放导航（实施前方案，待 root 确认）

行为缺口在 DocxEditor 呈现状态及 usePagination：现有唯一 EditorContent 只有打印连续分页，无 enabled/zoom 通道。独占 DocxEditor.tsx、pagination.ts、新 docx-view.ts/DocxViewControls.tsx/DocxViewPanel.tsx/docx-views.css 与对应 tests，必要的显示适配不触碰 native 保存、server/shared/vendor/clipboard/PPTX。固定上游及 WeKnora 依据见 research/docx-views-drawing-next-20261017.md。

方案为会话级 React 状态：print/web、阅读、manual/width/page 缩放、导航与只读分割。EditorContent 保持同位置；Web 关闭 pagination 并清 page/continuation/endnote/column decorations、HF/image 层、section sheets 和分页高度，回 print 重测。CSS zoom 配 .doc-zoom，分页同步测量暂归1并finally还原，图片/浮动/表格handle沿上游zoom读取；原生PM列拖宽另做局部坐标适配，不能裸clientX差写入colwidth。页宽/整页基于真实scroll容器，扣已占宽Inspector；420采用侧面板覆盖。导航为活标题层级列表/页跳转，不伪装可编辑隐藏正文大纲；split只读净化HTML连续镜像，独立scroll，明确未分页近似。

阅读语义是呈现，隐藏编辑Ribbon但保留退出/视图/缩放/导出和底部保存；setEditable(false,false)仅阻止键入，不声明原件保护。稳定Agent句柄保留读和问AI：显式write/beginDraft/commitDraft/undoRound先退出阅读并提示，飞行中写入发生docChanged也同步退出。视图切换不改PMJSON/原件/save参数/dirty/version/history。专项覆盖单一挂载、print↔web清理/恢复、read写入口/退出、100/缩放/fit测量、heading定位/空态、split安全/独立滚动、原件no-op和history，以及现有export/live-handle回归；只跑目标Office门禁/tsc/static，不跑全量Office/build，由root统一浏览器。

2026-10-17 DOCX视图片已按root批准最小范围冻结：print/Web/阅读、50–200%/100%/实时页宽整页fit、活标题与页跳转导航。唯一EditorContent和稳定Agent句柄保留；阅读显式写/draft退出并提示、CtrlF退出再显示查找，Escape返回可见导航入口；Web清当前实际分页层，打印重新测量，分页缩放同步归1/finally还原；原生PM列拖宽局部delta适配，图片沿vendor doc-zoom合同。8文件67/67、Office tsc/目标lint/format/styles/diff通过，含四倍率原生图片/列拖宽与一次undo、真实scroller ResizeObserver、no-op导出全ZIP entry精确。详见research/docx-views-implementation-20261017.md。split按root本片决定延期，导航不冒充可编辑大纲，绘图/保护/对比继续缺口；实际宽420/混合纸张/浏览器及独立checker由root继续，未把代码专项计为全量完成。未fullbuild/fullOffice、提交暂存归档或上传删除。

### PDF 涂黑副本 UI（root 已批准最小方案）

原DOCX实现者交回生产所有权后独占PdfEditor及新PdfRedactionCopy hook/overlay/Inspector、纯坐标helper/局部CSS/tests。缺口位于真实PDF画布的临时标记与outputs-only导出，不进入Agent公开目录或工作字节发布。复用PdfSheet绘图overlay渲染身份门槛，真实PDF.js page scale1/absolute rotation viewport换算user coords，处理四Rotate和offsetCrop；标记按doc/source/bytes/layout/history绑定，换页只取消gesture/在途请求，切源或工具/版本永清，不dirty/history。仅当前原件或已保存工作副本、无pending页面/插字/其他操作可进入，否则明确先保存。320/300 Inspector沿既有壳、内部滚动/固定单一导出、当前页/全部区域数/删除清空/100预算，说明下载副本区域不可恢复、原件保持。请求冻结handle/version/source/layout/regions/signal防双击；关闭/切工具/页/保存/其他写取消，迟到结果不得下载；错误保留标记及宿主具体原因。只接hostLocal redact_copy同version、无工作bytes、唯一规范output，不io.save/markSaved/publish。专项真实viewport、Editor指针/取消/身份/历史及目标静态类型，root统一浏览器/构建，不fullOffice/build或提交暂存归档。

2026-10-17 PDF涂黑UI生产冻结：本片21/21，连绘图/图像导出/工具栏/页结构6文件89/89；Office tsc最终0、目标lint/format/styles/diff绿。四Rotate+offsetCrop真实PDF.js坐标、实际Editor多页指针/100预算/坏响应/取消/保存工作副本通过。快速host busy合并的取消漏窗已复现并用Editor登记controller同步abort修复，自己的导出不走该路径。详见research/pdf-redaction-copy-ui-implementation-20261017.md。真实canvas受控mock不冒充光栅验证；root已上传夹具7wByk5tu1_660tNu，独立checker和宽420/原生下载浏览器由root继续；跨tab Escape回焦边界已明确交checker。不提交/暂存/归档/上传删除或fullbuild/fullOffice。

### 2026-10-17 直接组合图片、DOCX视图与PDF真涂黑副本浏览器收口

直接普通组成员图片的opacity/数值crop/PNG-JPEG替换和同尺寸去背景已真实保存history；父group变换/非目标slide/shared image保持，首次undo仅13空ZIP目录差，其余三组history全entries精确。真实视觉发现预览变形，checker修真实比例后生产270×180与420固定footer/内部滚动/Escape回live入口确认。更多格式独立在途，不借此宣称已齐。

DOCX打印/Web/阅读、50–200%/fit、标题及页导航已实机：唯一EditorContent、Web清分页、阅读禁止键入、CtrlF退出并聚焦查找、320px导航/420无整页横溢出；视图前后导出全部ZIP entries精确、库原件逐字节不变。150%真拖60屏幕px暴露cell.colwidth变而table/colgroup不变；checker在自有extension同事务链同步并补固定绝对tblW保存，原件float/autofit/百分比保留。最终视觉总421.5→481.5、列140→180/140、native grid2700/2100/tblW4800及单次undo全entry精确通过。split/可编辑大纲/保护对比仍未实现。

PDF私有redact_copy输出副本已有host16/16与UI独立7文件103/103。浏览器三页真标记含Rotate90+offsetCrop，下载3388bytes经独立PDF.js/全部对象及解压流/图像像素/单完整revision七项全通过，Poppler四页逐张目视正确；库原件3583bytes精确不变，dirty/history不产生。320px/420/footer693.36、跨分类Escape回可见编辑tab、关闭后0标记不复活实查；checker局部焦点fallback保留原同组busy延迟回焦。仍拒签名/表单/未知Catalog/共享命中图片与旁路隐私结构，非全局隐私清洗。

证据research/toolbar-group-views-redaction-browser-20261017.md，Web最终build exit0，Office全套回归另待记录；目标专项/types/static各独立报告。现行矩阵/编辑器规范已同步，整体继续in_progress，无真实模型、Desktop用户自验、全仓480既有技能lint阻断不变；不提交/暂存/归档/删测试件。下一图片来源六格式由独立checker收口TIFF预算/编码，DOCX绘图由原PDF-UI实现者先研究方案；不并发heavy build/fullsuite。

### DOCX 原生段落墨迹（root 已批准最小方案）

固定 GenOffice 480548fd55f1be3593ee0d8e316a734751d58309 的 `editor/ink.ts`、`InkOverlay.tsx`、Ribbon 1413–1515 为笔/荧光与透明 PNG、docPr 向量的依据；WeKnora v0.8.3 / 3e22822c1d2397be730c458c7539d0eb8c113a24 仅能力如实门控适用，不提供 DOCX ink 或 Office Ribbon。实际 vendor `patch.ts:231,616,1079` 合同是完整 `SaveOptions.inks`，不存在研究旧名称 saveNewInkImages/removeInkIds。undefined 保留原层，显式数组 strip/reemit 全层；parse.ts:526、883 已排除自有 ink 图片重复显示。

缺口位于当前画布缺少原生段落锚定墨迹模型和手动工具。独占 DocxEditor.tsx、新 docx-ink-model.ts/docx-ink-save.ts、editors/docx-ink.ts/DocxInkOverlay.tsx/DocxInkControls.tsx/docx-ink.css 与专项 tests；docx.ts 仅初始化 PM ink attrs、保存选项与原笔迹保真接缝。保持既有 list/design/reference/chart 保存链和唯一 EditorContent/Agent 句柄，不改 vendor、其他格式、服务端或公共 API。

PM doc 根 attrs 保存可识别 stroke 列表；段落唯一 ID 与新 stroke 同一事务，closeHistory 分隔逐笔操作，追加事务只消除分裂/复制重复 ID 并按映射保留原段锚点。原段移动携带 ID，删除隐藏笔迹、undo 恢复；新段落保存基于最终 SaveBlock 序号并检查一对一/既有 anchor map，一旦不能可靠映射明确拒绝。绘图/橡皮手势冻结 doc，cancel/换模式/缩放丢弃；选择实际笔迹，擦除与清除只针对可识别墨迹。

未操作 ink 时 options.inks 保持 undefined；正文再生成会丢原 run，需在自有保存结果适配中按已验证最终块映射补回完全相同的原 ink runs/关系/媒体，不能重建原层。显式 ink 修改才透明 PNG 2x 光栅+v1 payload，完整向量严格校验有限坐标/颜色/笔宽/预算。未知/opaque payload 或非普通段落 ink 因 vendor 无法保证原 XML 字段 passthrough，整个文档 ink 写工具明确禁用，原图片只读显示；不丢字段、不冒称任意原件擦除。无操作/正文变更保存须专项证明原 run、media、rels 保留。

Overlay 在现有 doc-zoom/page-wrap 内以100%坐标渲染，实际 nodeDOM/列平移/节页面几何定位，横坐标相对 column 而非缩进段落左边；滚动/缩放/分页与尺寸变化重测。紧凑绘图 Ribbon 有笔/荧光/选择/逐笔擦除与设置入口，320px Inspector 沿已有壳内部滚动和固定动作，分别显示笔与荧光当前颜色/宽度；阅读不允许绘图，退出/关闭回焦。专项 native 保存重开可擦除、第二次保存、非目标 ZIP、undo/redo、分裂/复制/移动/删除、新段落、多栏缩进/缩放/滚动/取消，及 Editor 真实控件测试；仅目标测试、types/static，不并发全 Office 或 Web build。root 统一宽/420 浏览器及独立检查，不提交/暂存/归档/删除测试件。

2026-10-17 PPTX图片来源扩展切片已独立检查+真实浏览器/原生保存收口：六来源原件保留，TIFF最终只接受经严格预算验证的未压缩/PackBits组合且只在显示副本转PNG；EXIF JPEG显示中性化原字节不变。实际TIFF插入/背景及组图替换、裁切/静态PNG去背景、8媒体hash、history均原生验证。首轮420图片填充Apply被挤到y796，独立checker修body内滚+固定footer，最终Apply657.36–681.36/footer693.36/pageWidth420、下拉可达/Escape回live入口实查。LZW TIFF真实chooser拒绝且未造dirty，可重选恢复。最终Web build exit0覆盖Office tsc；Office68/68+实际顶层Editor7/7、server54/54与目标静态通过。前次全Office161/1658有unknowncodec1失败，已修目标回归；保留该失败事实，不将目标后绿写成全套绿。报告research/toolbar-pptx-image-formats-browser-20261017.md、矩阵/engine规范已同步。DOCX绘图在途由原PDF UI实现者独占DocxEditor/docx.ts和新ink helpers，PPTX原实现者先研究AI截图附件方案；其余保留完整缺口，不提交暂存归档删文件。

### PPTX AI 美化截图草稿（root 已批准最小纵切片）

按 `research/pptx-ai-screenshot-plan-20261017.md` §3.5 独占PPTX AI/Editor局部、renderer草稿转接、chat真实PNG附件与发送绑定、server视觉/PNG预算小门禁。固定GenOffice美化截图语义与WeKnora能力注册证据沿研究报告；不改vendor、其他格式string预设、公开图片工具、shared wire signature或通用上传。

复用当前未保存renderer生成1280px真实PNG，冻结文档/session/source/slidePath/index/version，迟到/取消/换页/改稿拒绝。只生成可编辑可移除的问AI附件草稿，由用户显式发送。无模型仍显示草稿，只读draftAgent不获得工具权限，带图不能降级RAG吞图。采用有界snapshot registry保持排队体验，queued dispatch再检原目标/版本；停止一起还回文字+PNG+目标。截图瞬时内存，不扩DB/刷新恢复。侧栏真实比例紧凑缩略图与目标/移除、Ribbon pending/cancel/focus；root统一宽/420浏览器，真实模型不在本轮。仅目标tests/types/static，不fullsuite/Webbuild、暂存提交归档上传删件；完成冻结生产交独立checker。

PPTX AI截图草稿本片已冻结生产交root统一build/浏览器/独立checker：当前未保存renderer真实PNG、1280/1920/5MiB/10s预算、源寿命/页/version冻结、原位pending取消/Escape、无模型只读draftAgent预览及显式发送、紧凑96×64真实比例附件、文字可编辑/移除、禁止带图RAG。有界4项registry保护queue/inflight，停止/取回/失败一并恢复文字PNG目标，重试同目标；实际fetch边界补排队缺路由字段并再验证，普通无图转发不变。Server视觉/真实PNG/user/每轮1图/历史4图/总20MiB前置门禁。Office24/24、Chat真实HTTP39/39、Server18/18、四包tsc与本片lint/format/antd/styles/diff通过；此前旧XLSX目录core2失败如实保留，未改无关目录。报告research/pptx-ai-screenshot-implementation-20261017.md；无真实模型、图片不持久化历史、真实浏览器由root续验，不fullsuite/build/提交暂存归档/上传删除。

### PDF 原子批次三个剩余操作（root 已批准最小方案）

按 `research/pdf-atomic-annotation-batch-plan-20261017.md` 接续细化实施 removeMarkup/setNoteContents/removeTextInsert，统一严格1–30项schema，保持真实NM/legacy R批注身份与当前T会话身份，不伪造上游P层。独占shared PDF schema/必要导出、server batch/annotations局部mutation与preserving guard接缝、local/catalog和专项tests、Office agent分发/纯候选helper/PdfEditor最小发布与tests。先helper/shared/backend，待root inkbuild释放后接Editor；不碰DOCX/PPTX/renderer/chat或原文vendor writer。

无page：在raw pending.base上执行native候选，再用真实scale1 viewport一次重放幸存T，保留其id/坐标和修改后未烘焙base。有page：先重建幸存文字再按声明顺序native修改，成功明确物化及T失效。native在同一pdf-lib图按序执行，批注只局部显式注入preserving guard，原批注/原文严格guard默认不变。legacy R+pending无可靠账本明确拒绝并提示先保存重读；无pending legacy仍支持，不扩账本或新PDFium preserving写。冻结handle/source/bytes/version/layout/pending/save基线，所有异步assertCurrent；候选无状态，最终几何/独立读回后只一次同步publish，dryrun零状态，失败不先提交后回滚。沿同一history/dirty/save，不加手动面板。仅目标native/真实Editor契约/取消与history/type/static，不fullsuite/build/提交暂存归档上传删件；root验原手动UI，禁止隐藏浏览器evaluate执行handle，无模型不报告模型或浏览器批次驱动成功。


### 2026-10-17 DOCX墨迹浏览器收口与下一对比/拆分片

DOCX墨迹代码、独立检查与真实浏览器已收口，证据research/toolbar-docx-ink-browser-20261017.md。真实Canvas钢笔/150%第二节荧光笔、保存重开、选择删除/逐笔擦除及history全非目录ZIP条目精确；复杂表格墨迹明确暂未显示/原件保留/禁写，no-op导出精确。首次focus滚动丢首笔、px单位溢出、折叠菜单遮Inspector、只读原件计数误导均先复现后修并实际1280/420确认。最新实际Editor15/15、Office类型/目标静态通过，统一Webbuild exit0（/tmp/mimir-toolbar-ink-snapshot-batch-web-20261017.log）。整体仍in_progress，PPTX截图与PDF批次独立检查在途，未暂存/提交/归档/删件。

根批准research/docx-compare-split-next-20261017.md，正式trellis-implement agent独占DOCX新compare/SplitView/局部CSS/tests与最小DocxEditor/ViewControls接缝；原ink checker仅作只读技术复核，不转换实现角色。对比本地bounded解析、共用live/parsed PM提取器、实际表格段落、连续变更配对、LCS预算、单调失效与只读320px结果；不上传、不改文档/保存。拆分稳定兄弟只读连续镜像，唯一主EditorContent/scroll不卸载，使用本地安全白名单而非克隆分页DOM；常用marks/标题/段落与普通表格应可读呈现，不把纯文字dump称格式镜像。原生保护/可编辑大纲另片，不移植上游CSS隐藏正文危险选择。专项与独立检查后root真实1280/420/当前未保存差异和no-op原件验证；不并发全Office/build、不提交暂存归档删件。


### 2026-10-17 对比拆分浏览器发现与原生保护P0

对比当前未保存正文、edit→undo失效、真实表格两格边界、420×500内部滚动/固定footer/Escape回入口均已实查。no-op导出document-copy (9).docx全部7个非目录ZIP部件与上传夹具相同。拆分发现实际5./b)/6.编号错误显示1./1./2.，独立checker正在改为live原生numbering定义计算出的安全文字marker，不能冒称已通过最终视觉。根跑全Office171文件1757项1756pass/1fail，唯一失败为docx-toolbar-render分类预期漏掉已验收绘图；独立checker同步精确9分类预期，完整日志/tmp/mimir-office-full-compare-20261017.log。此前TIFF失败此次未复现，不将本次1fail写成全绿。

根已批准research/docx-protection-refinement-20261017.md的P0，由正式implementer独占source XML识别/不可变policy/session.save兜底、PM与嵌套NodeView入口、Agent execute/draft/round/saveOptions防护及Review具名只读状态Inspector。原件四类enforced/未知/坏或旧凭据先准确保守只读；推荐只读可经显式选择继续编辑。保持读取/选择复制/查找/对比/无操作原件导出；不提供新设密码、停止保护或整文件加密。禁止只禁工具栏冒称执行保护，所有真实写入口必须共用controller、迟到结果重验，源策略不信可改parsed对象。P1允许批注/真实复选框、P2原生设置密码核验、P3强制修订另逐片验证。320px内部滚动/固定动作/420可达/Escape焦点沿既有壳；不改vendor、提交暂存归档删件。根统一浏览器与重型构建/全套，当前Agent无模型/Desktop用户自验。PDF视觉签名下一片仅只读研究，OCR范围回复待定。


### PDF 视觉签名S1（root批准最小纵切片）

按research/pdf-signature-plan-20261017.md独占签名shared严格schema/nativewriter/local分派、Office手动handle/Panel/Canvas与PdfEditor局部接缝、专项tests。不增加模型签名工具或数字证书声明，普通页三输入手写多笔Ink、姓名/图片Stamp、真实AP与alpha、放置草稿/拖动等比缩放/显式一次应用、保存重开后自有对象transform/delete。独立自有标记+有界source且不信上传metadata；普通外来Ink/Stamp保留，空Sig/已签署/未知结构既有guard不放宽。复用pending页面物化及一次publish/history，pending插字具体拒绝；冻结文档/源/handle/version/layout并在异步每步重验。复制自有NM稳定唯一、纸型缩放InkList/BS/AP一致须原生实证。320px内部滚动固定动作，420准备后折起覆盖面板可点纸面，真实比例预览/当前值/取消回焦。源图片前置预算与实际空白检测、typed中文不裁字；不静默持久化签名库。仅目标native/Editor/HTTP/类型静态，root统一build/fullsuite与1280/420/短高浏览器；当前serverfullsuite在跑，先Office/helper/native实施但等root通知才能修改server文件。不改vendor/提交暂存归档删件。


### DOCX 标题大纲安全编辑（root批准下一片）

按research/docx-outline-plan-20261017.md，扩现有导航Inspector为真实当前标题/层级/编辑标题原位跳转；不照抄上游CSS隐藏正文、不提供纯文本覆盖富标题、不制造章节树重排。当前resolvedStyles提取普通/显式outlineOnly/样式/编号标题，尊重headingOutlineOff；重复/空标题可区分，原始文字与显示label分离。普通真实标题样式层级窄扩0–9（仍需原件存在）；outlineOnly走原setOutlineLevel不切样式；编号标题保留编号并提供原位文字编辑，暂不假转docHeading。选目标冻结session/editor/handle/version/保护epoch/position/node；编辑或undo使旧提交失效，纯选区不改目标；主动assertWrite并沿existingAgent单事务/history，no-op零dirty/version。主Editor唯一且正文完整可见；窄屏编辑标题先关覆盖Inspector并将焦点留正文，不能被关闭回焦抢走。320px内部滚动固定单一应用/420×500/深层缩进封顶。实现者仅ownViewPanel/viewhelper/outlinehelper/局部CSS/tests、DocxEditor/agent最小接缝；保护checker仅改newprotectionmodules/tests，双方不得互改。根统一浏览器/build/fullOffice，不并发重型测试；不改vendor/server/shared/提交暂存归档删件。


### DOCX 保护 P1-C1（root批准已有讨论编辑纵切片）

按 research/docx-protection-p1-next-20261017.md 的 C1 实施：仅 enforced comments 且原件资格可证明时，开放已有讨论文字编辑、回复、解决与重开；主正文 writable=false、原生锚点保持。独占自有 docx-protected-comments helper/专项tests、docx-protection controller/session、docx-agent/comments history，以及 DocxEditor/AdvancedControls/ProtectionControls 最小具名入口与局部CSS。原生私有baseline、完整PM不变、仅comments typed差量、单目标能力/拒绝原因、最终session.save窄补丁必须一致；不走全量正文/评论扩展重建fallback。保存未改部件精确，no-op/撤销回原件，结构撤销仅恢复comments不setContent。

320px Inspector沿既有紧凑界面、内部滚动与固定操作，420×500可达；只开放管理已有批注，不通配解禁advanced菜单。无已有讨论显示准确空态。新增/删除锚点、forms checkbox、密码核验和强制修订均后续片，不降低已有P0防线。实施若发现reply/扩展映射无法在本片证明保真，先报root具体阻点，不默默降级。仅目标tests/types/static；重型全Office/Webbuild由root统一。当前无模型、Desktop用户自验；不改vendor/其他格式/server/shared，不暂存提交归档或删除测试文件。


### 2026-10-17 本批最终浏览器与统一门禁

对比/拆分原生编号与独立滚动、P0四限制/未知/recommended与no-op整文件精确、大纲1→9与显式outline2→3原生仅目标部件/undo全部entry精确，以及PDF手写/输入/PNG/JPEG、真实拖放/resize、四签名表单共存、重开transform/delete/undo整文件精确，均有实际UI及原生证据。最后窄屏form popup/footer、signature白字/显式center和outline重复主文案已修并在最终5180构建确认。报告分别见research/toolbar-docx-{compare-split,protection,outline}-browser-20261017.md及toolbar-pdf-signature-browser-20261017.md。

最终Webbuild /tmp/mimir-toolbar-browser-ui-final-web-20261017.log exit0；全Office177文件1844/1844 exit0 /tmp/mimir-office-full-toolbar-ui-final-20261017.log；Server最终default90文件737/737+local10/10+fnos4/4+backup2/2 exit0 /tmp/mimir-server-full-signature-final-20261017.log。保留此前1839/1842失败与实际list hook修复记录，不把target绿写成旧full绿。C1已获独占生产放行，尚在实施，不计本批完成。整体仍in_progress、不提交暂存归档/删测试件，真实模型与Desktop边界依用户选择。


### XLSX 透视来源工作表选择（root批准最小手动补全）

按 research/xlsx-pivot-next-plan-20261017.md：已有native add_pivot支持来源sheetId与targetSheetId，手动UI却强制当前表。仅补现有工作簿来源Select，结果固定当前表并只读回显；不称已完成上游布局edit。独占XlsxEditor/ObjectControls/PivotControls/helper/局部CSS及对应Editor/host专项tests，预期不改server生产/vendor/shared。来源切换重新提取真实字段、清依赖字段/规则但保留名称/位置，不写文档；仅同表判重叠，父回调不覆盖来源，活文档来源/目标/version/signal冻结与迟到拒绝。保留全部保护/结构/缓存/2000格守卫。单次native publish/history，显式save后Undo/Redo全ZIP恢复，来源/第三表原生字节保持。

320px既有Inspector内部滚动、固定单一primary、真实当前来源/目标与长中文名换行，420×500/Escape两层/回焦root实查。无新建工作表/原地edit_pivot/重建旧定义或放宽守卫。只目标tests/types/static，root统一重型构建/fullsuite；不改其他格式、暂存提交归档上传删件。DOCX C1 owner平行独占不同文件，不互改。


### 2026-10-17 C1与透视来源浏览器验收

C1已有讨论编辑/回复/解决/重开已最终构建实查，正文/设置及非comments部件精确；空态/复杂讨论/现代扩展/修改密码拒写、唯一primary与420×500/Escape已验。XLSX跨表来源Select→汇总A1:B5真实总计150，保存/reload/刷新及UndoRedo全部ZIP条目精确，源/第三表/customXml保持；420固定footer裁切修复已验。报告research/toolbar-docx-protected-comments-browser-20261017.md与toolbar-xlsx-pivot-source-browser-20261017.md。Web最终构建exit0。独立C1 134/134、XLSX Office31/31/host11/11及types/static通过。全Office首轮1868/1869的PPTX等待同步问题已确定性复现并修，91/91通过，最终全套重跑中。整体仍in_progress，后续边界不冒称已齐，无模型/用户自验Desktop、不提交暂存归档删件。


最终统一门禁补记（2026-10-17）：全Office **178文件1869/1869，exit0**，日志 `/tmp/mimir-office-full-c1-pivot-source-final-20261017.log`（143.52s）。先前1868/1869失败保留为历史；PPTX仅测试同步修复，生产未改。最终Web构建 `/tmp/mimir-toolbar-c1-pivot-source-web-20261017.log` exit0；此后只改PPTX测试/spec/报告，无需重建生产。Server沿前次最终default737/local10/fnos4/backup2全绿，本片生产未改，新增跨表宿主专项11/11。无模型/Desktop自验、全仓480技能lint基线与整体in_progress边界不变；本轮未暂存、提交、归档或删除测试文件。

### 2026-10-17 全工具持续补齐：已有透视布局与保护锚点

用户明确继续直到所有工具补齐；保持完整缺口清单，不以已完成切片替代总目标。批准research/xlsx-pivot-edit-plan-20261017.md作为下一实施方案：新增本地strict edit_pivot_layout，复用原生relayout，固定原source/target/path/name/cache身份，真实并集清旧输出；原件资格/共享cache/格式扩展/依赖关系须逐项证明，不能以只加按钮或删除再新建冒充原地编辑。独占shared xlsx schema、Office资格helper/Pivot UI最小接缝、server专用adapter/host分流及专项tests；既有跨表来源不回退。320px/420×500与逐层Escape、一次发布/history/全ZIP原生保真是门槛。vendor不改，root统一重型门禁及浏览器。

并行批准DOCX P1-C2按research/docx-protection-p1-next-20261017.md §4实现受限评论新增/删除锚点，保持正文不可编辑。原件单段run/text字符映射、规范化去comments后完整PM相等、原子PM+metadata发布、精确插删native锚点，未知/复杂锚点保留并逐目标拒绝；root删除含本讨论replies，reply删除单独语义。仅允许可证明单段，不扩大普通body写权限；这不是最终所有保护工具完备，F/W/强制修订仍在后续队列。独占DOCX controller/comments/native/agent/Editor/局部CSS与专项tests；不触XLSX或server。完成须独立checker与浏览器，未验不标齐。

全部参与者只目标tests/types/static，不并发fullOffice/Webbuild；不暂存提交归档或删除测试件。代码与浏览器验收，无真实模型、Desktop用户自验；全仓480技能lint既有基线保留。

### PDF 外部图片准备与真实插入桥（root批准）

按research/pdf-external-images-next-plan-20261017.md实施固定工具image_search/generate_image，包含max_results/aspect_ratio真实参数、独立配置门控、纯准备零bytes/version/history、按鉴权user+document+source session绑定有界20分钟opaque refs，现有insert/replace原生图片路径解析并真实写入。沿现有Brave/通用生成provider，不新密钥/供应商；可扩公共服务可选signal/aspect，旧DOCX/PPTX默认行为必须不变。请求取消贯穿SDK/下载，ref不得下放dataURL或给generic fetch白名单。实际解码PNG/JPEG与requested/actual ratio准确；不支持模型尺寸预拒绝，不假称任意精确比例。手动图片Inspector补来源switch/搜索生成草稿/真实比例结果/明确插入，320px内滚固定单一primary/420×500/Escape及错误保留。独占PDF image/external资产与必要route/catalog/renderer/PdfEditor最小接缝，暂不实施文字params以免同文件并写。DOCX owner不碰provider生成service，XLSX owner只改自有schema/server，保持并行所有权。目标tests/types/static，统一build/fullsuite/browser由root。OCR范围问题仍待用户回复，不能默认改变product非目标；数字证书纠正为固定GenOffice未实现而非本轮缺工具。

### 2026-10-17 用户批准本地 PDF 临时 OCR

用户已明确选择“包含，按建议补本地 OCR”。本批准取代此前等待范围答复的状态；product.md §1 同步记录窄例外。只在当前 PDF 编辑器内按显式动作进行本地识别，供复制与搜索；不写原件、派生入库正文或知识库索引，不新增付费模型服务或凭据。先核对可跨浏览器部署的本地 WASM 引擎、离线资产与中英文字框/取消预算，再安排正式 implement/check；不能只接系统 macOS helper 就宣称浏览器已支持。与外部图片/文字参数实施者顺序协调 PdfEditor 共享文件，root统一真实1280与420×500验收。


### PDF 本地临时 OCR（root批准正式实施）

按research/pdf-local-ocr-next-plan-20261017.md实施浏览器本地Tesseract WASM与同源离线中英文资产、真实字/词框和透明可选文字、当前页及顺序扫描页识别、搜索/复制/进度/停止/清除；不写PDF/知识库/版本/history、不用付费模型。严格bitmap/text/time/页数预算、初始化中也可取消且释放worker、绑定源身份/页几何并拒迟到，真实Rotate/Crop/zoom映射。原文编辑/标注writer不能获得OCR伪target，保留原生index与临时search-only provenance。独占新ocr helper/worker/assets/控件/tests及renderer打包/精确依赖；PDF共享Editor与read-only Agent接缝先等待外部图片owner及其checker释放，再由root明确放行，不能并写。只target tests/types/static，root统一构建与真实WASM/1280/420浏览器；须正式独立check。不改vendor/server/parser入库/提交暂存归档删测试件。


### DOCX 保护 P1-F 真实复选框（root批准）

C2 已经正式独立检查并完成真实新增/根与回复删除/首次评论/原生保真及未保存撤销预检，下一片按 research/docx-protection-p1-next-20261017.md §5 实施 forms-only 的真实 legacy FORMCHECKBOX 与 SDT checkbox。正文维持editable=false，原件occurrence私有身份/精确PM状态差量和native局部checked/glyph补丁必须同时验证，不凭marks/glyph授权。补当前控件列表与键盘Space路径、真实状态/具体拒绝原因、点击真实glyph；320px内滚/固定可达操作及420×500。保留未知XML/非目标ZIP、复原状态回原bytes、同PM history一步及undo/redo、保存重开/二次保存。SDT/altChunk展开后的段落身份沿C2新教训，不可按docxIndex或同文猜测。禁用/锁定/嵌套/歧义/权限例外先精确拒绝，不把所有forms一律开放。独占DOCX新forms helper/原生controller/session/PM插件/必要Editor/Controls和专项tests；不碰并行OCR/PDF/XLSX/vendor。先准确关闭权限与保真缺口，密码管理/强制修订后续片。本片仅目标tests/types/static，root统一重型构建/browser，不暂存提交归档删测试件。
# 2026-10-17 剩余交互补片排期

PDF 图片面板短窗口上传分支仍将主操作放在滚动body，root已记录具体浏览器/源码证据并采纳 `research/pdf-image-inspector-upload-followup-20261017.md`：紧凑操作选择、素材仅准备、section直属固定唯一primary、原真实工具和确认均保留。该修正限定图片面板，不抢OCR共享Editor接缝；最终仍独立复查和生产浏览器。

沿用户已授权“补全所有工具，并注意样式交互”，采纳研究 `research/office-crop-remaining-plan-20261017.md` 的 A→B 与 C0→C1→D 顺序。当前先派 A：DOCX 图片 Inspector 预览八把手/移动保留区域，沿现有像素 crop 与一次 PM 提交；不把它称为非破坏原图裁切。A 所有者仅改图片控件/纯几何/专属测试，不碰进行中的 forms 共享 DocxEditor/protection/session 文件。后续 B 浮动表格、C0 父组显示矩阵、C1 直接组图画布裁切、D 媒体范围见研究，不互抢共享编辑器文件。

数据验证确定差距采纳 `research/xlsx-validation-interactions-next-plan-20261017.md`，待槽位独立实施：当前格列表与提示、stop/warning/information/native 开关语义及冻结确认，不允许通用绕过校验。复杂形状预览/范围结构另查。每片仍 implement→独立check，root统一build与实际1280/420×500浏览器；不以局部绿标整体齐全。


### 2026-10-17 OCR/forms/crop 生产验收与下一排期

冻结OCR独立39/39、forms166/166、crop45/45已统一Webbuild exit0。真实OCR420footer/Radio、四Rotate offsetCrop搜索、整行/反向/跨行clipboard、空白只计4页、停止/重开销毁及原件SHA完全相同已验，见toolbar-pdf-ocr-browser报告。formsSpace+相邻glyph、保存UndoRedo与原生checked/glyph唯一变更已验，见toolbar-docx-forms-browser。crop420真实角拖/8键盘把手草稿零dirty、真实PNG120×80、一步Undo整件原bytes、Redo所有ZIP exact已验，alpha/shared/nativeinsets继续验证。

统一Office首轮189files1974tests有58失败：旧PDF render mocks缺loadPdfDocument57项、DOCX旧文案1项。root补6文件56/56绿与旧copy断言27/27，图片owner另补2mock其27/27绿。该首轮失败保留，不拼接声称fullgreen，最终冻结后再完整跑。root最小测试接缝所有权为PdfEditor.local/image-export/pending-forms/drawing-canvas/forms/signature及docx-toolbar-render tests，其余owner勿覆盖。

PDF图片upload收敛实施及独立check27/27已冻结，下一统一build/browser；浮动表格B独立26/26已冻结。OCR释放PdfEditor后，批准按pdf-text-params-next-plan实施原文字形partial/all/color、插字完整params/pending/replay+手势，独占PDFtext共享接缝，图片owner仅Panel。C0父组真实渲染矩阵已派正式implement，发现现存child F·R与固定上游R·F差距须在C1前核实修正，不忽略；C1/D顺序不变。XLSX DV已按既定计划派正式implement。各片仍独立check，root统一重型与browser，不修改vendor/不暂存提交归档删除。


### 2026-10-17 恢复后root验收和下一顺序

- [x] crop native-insets bytes重取断言全过；共享alpha原生Canvas RGB±1已诚实记录。
- [x] forms A→B→A与最终420截图、C2最终reply确认/保存前撤销烟测。
- [x] 真实JPEG/GIF/front原生crop保存回读，详toolbar-docx-crop-browser。三个测试件留在KY635Y，未删。
- [x] C0独立28项和192颜色点通过。C1交原C0implement owner，原生EMU source矩阵统一SVG/overlay/反算，包含既有child/shear问题；root允许pptx-render.ts只读source最小seam。
- [ ] PDF文字/完整参数冻结后独立check；DV冻结后独立check；再统一root suites/build/browser。
- [ ] W1→W2→forced tracking按docx-protection-password-next-plan-20261017.md；整文件打开密码/隐私清理明确列队，不能遗落。
- 继续保持in_progress，不stage/commit/archive/delete；原有480技能lint基线不重跑。

- [ ] root实际5173发现浮动表跨节定位少算120px --page-cx，table browser不通过。详toolbar-docx-table-position-preflight-20261017.md；DV owner冻结后回片修，源库未保存且cmp原件精确。

### 2026-10-17 最新执行点（覆盖以上历史待办状态）

以上历史失败和排期保留；当前逐片以research/all-tools-completion-ledger-20261017.md和对应check/browser专报为准。OCR/forms/crop、浮动表跨节120px修复、PDF文字/图片、PPTX媒体/组图、W1/W2/强制修订/隐私、多级排序、管理、R2a/R2b均已实施、独立检查并具有对应生产浏览器证据。DOCX整文件加密实际Worker的cfb导出缺陷已精确修复，真实Standard/Agile编辑保存/第三方解密/history/reopen通过；frozen联网安装和1091输入稳定新Webbuild已通过。

现正式释放R3按research/xlsx-special-paste-r3-plan-20261017.md接入全部/仅值/公式与值/仅格式/列宽/除边框外全部与整数倍平铺；准备阶段helper37绿不作为运行时完成。R3独占既有XLSX schema/host/manual/planner/controller/Inspector接缝和Server正式runner，保持R2a/R2b回归；root保留全局build与浏览器。并行独立checker只读核对全六格式固定上游工具/参数与当前证据，发现真实遗漏交root安排，不并写R3生产文件。

R3冻结后依次独立check→root生产build与1280/420逐模式native/history/browser→全包最终2.2质量门及参数审计收口。无配置provider与Desktop用户自验的边界不变；新建/更改密码浏览器已准备具体页面，按自动化规则由用户亲自输入/确认/提交。保持in_progress，不stage/commit/archive/delete；不能把旧4231完整门当新代码已覆盖。

### 2026-10-17 最终参数审计后的补片

只读审计 `research/editor-all-tools-final-parameter-audit-20261017.md` 已确认六组真实缺口，批准在原“所有工具和参数”范围内继续补齐。媒体实施者独占 Markdown/DOCX/PPTX aspectRatio、PPTX引用图/真实alpha、原附件受控解析、原音视频前处理与分析接缝；逐页生成/部分保留独立排队，不与该owner并写服务。批量图片项目符号实施者独占 pptx-selection/SelectionFormatFields及最小native/专项tests，复用既有paragraph nativewriter，确保整批预检、一次history、顶层与直接组成员保存和非目标保真。两者按符号协调PPTX agent共享文件，不触R3/XLSX或DOCX保护。各片先记变更边界，正式implement→独立check→root生产浏览器；无provider时只证明受控transport/真实本地前处理/门控，不声称供应商通过。

根会话重新核实截图：密码交接和强制修订420图有效；范围420旧图为空白、排序/PDF图片420旧图被缩成缩略图，属于截图证据缺陷，不改变已记录DOM/native操作结论。范围与排序已用captureBeyondViewport=false重取并实际查看有效420×500图；PDF图片截图待同法补取。不得把缩略图/白图作为视觉通过证据。

截图补取已结清：PDF图片420亦同法重取并实际查看，翻转目标/操作/方向及固定底部主按钮完整可见；仅选目标和模式，未应用/未保存，库原件仍为已验baseline。范围与排序同样未再次写文档。逐页生成下一片已写 `research/pptx-deck-progress-next-plan-20261017.md`，待槽位与媒体共享接缝协调后正式实施。

用户已明确回复“稍后自行验收”DOCX更改打开密码。该项继续记为用户输入验收，不再等待其阻塞本轮；浏览器tab31保留可交付页面，恢复常规视口、两密码字段空白，未输入或提交。R3与批量图片符号已冻结并交独立checker；媒体收尾本地视频前处理/静态，逐页生成owner已正式派发，按符号协调共享服务与传输文件。
