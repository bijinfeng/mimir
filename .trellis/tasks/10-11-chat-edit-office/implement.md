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
