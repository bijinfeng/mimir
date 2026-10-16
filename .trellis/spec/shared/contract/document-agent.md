# 多格式文档 Agent 通道合同

## 1. Scope / Trigger

适用当前文档页的 Agent 读取与画布编辑。`docx`、`xlsx`、`pptx`、`markdown`、`html`、`pdf` 是格式判别全集，**不是**已接入的工具全集。只有格式执行器、服务端目录和当前画布句柄都就绪时才能提供写工具。库级对话保持只读。DOCX 具体工具与修订行为另见 [docx-agent](./docx-agent.md)。

## 2. Signatures

- `packages/shared/src/document-agent.ts`：`documentAgentFormatOf(document)`、`documentAgentCanvasSupported(document)`、`documentAgentRoundSchema`、`documentAgentToolResultSchema`、`DocumentAgentCapabilities`。
- `GET /api/conversations/document-agent/capabilities?documentId=…`：读取该已鉴权文档的模型与执行器能力；格式尚未接入时 `executorReady=false`、`availableTools=[]`。
- `POST /api/chat`：`forwardedProps.runConfig` 中的 `documentAgent=true`、`agentFormat`、`documentId`、`agentRoundId`、`agentVersion`、`agentContext` 由服务端解析，并按已鉴权文档验证；旧 DOCX 字段仍兼容。
- `POST /api/conversations/:id/document-agent/:runId/cancel`：取消未消费的当前工具轮；旧 DOCX 路由暂留兼容。
- `POST /api/conversations/html-agent/{plan-page,write-document}`：按已鉴权 HTML 文档产生规划或完整页面草稿，草稿经当前画布版本与人工确认后才应用；请求形状在 `htmlPlanPageInputSchema`、`htmlWriteDocumentInputSchema`。
- `POST /api/conversations/markdown-agent/write-document?stream=1`：按共享 `markdownWriteDocumentInputSchema` 接收计划；NDJSON 逐段返回 `delta`，真实模型完成后才发 `done {markdown,complete:true}`，断流或取消不可伪称完成。临时草稿不进入笔记正文/自动保存；停止或失败后用户可保留部分/丢弃，应用仍须原画布版本一致。外部取消和切文档丢弃挂起选择。
- `POST /api/conversations/document-agent/create-document`：DOCX/PDF/XLSX 来源按 `documentAgentCreateInputSchema` 创建 DOCX/PDF/Markdown/HTML；Markdown和完整HTML保留源内容，经统一上传/解析/索引后返回新文档ID，不修改源画布。
- DOCX/PDF 创建输入为受限 HTML：保留标题、段落、嵌套列表、引用、代码、行内字形/颜色/超链接及合法合并表格。DOCX 公式写原生 OMML；PDF 当前明确拒绝公式，普通长表格按页续排，超过一页的跨行合并组明确拒绝。未支持的标签、属性、样式和非法合并在上传前报错，不静默提取纯文本。Markdown 与完整 HTML 不经过此转换。
- 列表按原始子节点顺序展开，父项只编号一次，嵌套列表后的段落作为同层续段；前置嵌套列表仍保留空父项标记。单元格与引用的对齐/字形继承到段落，显式子值优先。固定表格生成器不写`TableParagraph.styleId`，创建适配层保留生成的`tcPr`/合并结构并逐格复用段落生成器，保留单元格标题和链接；不能手改vendor。PDF目前拒绝`text-align:justify`，不能静默按left输出。
- `POST /api/conversations/document-agent/create-file`：XLSX 来源按 `documentAgentCreateFileFieldsSchema` 和 file multipart 上传当前单表的显示值导出（xlsx/csv），不携带公式和格式；浏览器从当前未保存画布导出，上传前重验版本。字节仅供宿主上传，不返回模型。旧 DOCX create-document JSON 路由保留兼容。
- `POST /api/conversations/pptx-agent/apply-ops`：接收当前未保存 PPTX 字节、文档 ID、画布版本及操作批次，由服务宿主运行固定上游操作并返回新字节、记录及版本；只接受已鉴权 PPTX 文档，不自动保存原件。通用 `apply_ops` 保留固定版 AI 操作白名单；现有图表走严格单项 `edit_chart`，已有动画时间走手动专用 `edit_animation`（`seq`、开始方式及持续/延迟毫秒）。动画动作由宿主读取当前 timing 并仅修改该项参数，客户端不能提交原始 XML、任意效果或整条时间线。
- PPTX宿主服务动作返回`{bytes,records,version,changed,data?}`：只读的规划/模板列表/复制保持版本，只有`changed:true`才重解析画布、推进一次版本和进入撤销历史。下载/生成/重解析前后均核对取消信号与当前版本；迟到结果不能覆盖手动修改。风格模板存于既有存储的`templates/pptx/{sha256(name)}.json`，不把模型凭据或原件嵌入模板。
- 同一PPTX端点的手动`manual_asset`动作由`pptxManualAssetSchema`校验，提供原生对象/整页复制、剪切、粘贴。复制数据只由固定引擎从当前未保存字节生成；客户端只能提交服务端opaque ref，不能提交OOXML、部件路径或parts。ref在当前Mimir窗口可复用15分钟，宿主最多保留12项、总64 MiB，重启失效；粘贴须再次确认源文件仍可访问。此动作不注册为模型工具，也不承诺PowerPoint系统剪贴板互通。
- 同一PPTX端点的手动`manual_ink`动作按`pptxManualInkSchema`接收单个`add/erase/clear`操作；新增笔迹保存为透明PNG图片和`aislides-ink`前缀、v1矢量`descr`，不宣称为PowerPoint InkML。擦除/清除仅允许当前页前缀及可解码元数据均匹配的笔迹图片，混入普通图片时整批拒绝。每笔沿当前版本/取消信号和原子历史路径写入；此动作不注册为模型工具。
- 同一PPTX端点的手动`manual_fill`动作按`pptxManualFillSchema`接收形状持久ID或当前背景页，source仅允许固定八种纹理ID+匹配固定版SHA-256的PNG，或当前目标已解析的原生图片填充。浏览器不能提交任意mediaPath、XML或通用操作；宿主从当前文档取资源。背景`allSlides`在一次原子事务内应用到实际全部页，一次版本和历史；前端纹理读取、页/目标/版本变化与卸载须阻止迟到提交。此动作不注册模型工具，不放宽`apply_ops`白名单。严格`copy-current-background {slide,allSlides:true}`从当前原件沿slide→layout→master读取背景，保留复杂渐变/原生颜色变换；bgRef物化、源scheme基色跨主题固定、内部图片关系重映射，继承背景在目标页物化为本地背景。外部或失效图片关系拒绝，全部页仍一次版本/历史。

- 同一PPTX端点的手动`manual_zoom`按`pptxManualZoomSchema`接收slide/section/summary和目标页PNG快照；客户端不传XML、版式或分节路径。源页/节和摘要布局由服务端当前原件解析，原生picture+内部slide跳转及摘要分节在一次原子操作内写入，沿当前版本/取消/历史链，不注册模型工具。每批至多24目标、单PNG base64 1,400,000字符、总7,500,000字符，PNG尺寸至多1280×1280；该HTTP ops外壳至多8,000,000字符，其他action仍1,000,000字符。快照从当前未保存画布生成，取消或版本失效拒绝迟到提交。
- 同一PPTX端点的`manual_animation`按`pptxManualAnimationSchema`接收`transition-all {slide}`或`animation {slide,elementId,operation:replace|add|remove,...}`。自动逐段从原件真实段落生成、全部页从当前原生切换读取，在一个私有事务内完成；至多5000动画项，HTTP仍为普通1,000,000字符。输入不能携带presetXml或任意XML。当前版本/取消/历史沿同一宿主，手动动作不进入模型目录，模型apply_ops保持50条限制。
- 同一PPTX端点的`manual_shape`按`pptxManualShapeSchema`接收固定109种kind、slide、整数EMU offset和仅连接线允许的flipH/flipV；不接收XML或新增对象ID。私有原件事务完成addElement后再解析真实新增durableId做方向翻转，一次响应/版本/撤销。画布点击/拖绘使用渲染坐标到EMU映射，预览不写；换页/版本/关闭/取消拒绝迟到结果。
- 同一PPTX端点的`manual_paragraph`按`pptxManualParagraphSchema`接收slide、持久el、唯一非空paraIndices及严格format字段；范围必须由当前原件验证。直接复用engine局部段落适配，不把忽略paraIndices的通用DSL当成局部操作。图片符号只接受至多512 KiB/400万像素的真实PNG/JPEG，不接受关系ID或XML；落包与格式写入一次发布，未选段落/未知原件XML保留。无变化返回原bytes/原version/空records。
- `manual_shape`与`manual_paragraph`仅手动UI动作，不注册模型工具；沿普通1,000,000字符HTTP ops外壳、已有鉴权/ZIP预算、版本/取消/历史合同。模型apply_ops的50条门槛不变。


- `POST /api/conversations/pptx-agent/manual-asset`：multipart的`file`为当前PPTX（至多50 MiB），`asset`为用户所选文件（至多32 MiB），可选`poster`为真实PNG（至多8 MiB）；`input`按`pptxManualUploadSchema`校验。媒体扩展名、MIME及签名须一致；图片MIME与PNG/JPEG真实内容一致，空MIME或octet-stream可按签名判断。媒体插入写原生Office双关系与封面，当前画布显示媒体标识并提供本地播放，外链媒体不自动请求。源PPTX整批导入先做ZIP预检、页码去重与范围校验，当前仅接受相同页面尺寸。宿主只回字节，仍由现有手动保存写回原件。
- `GET/PUT /api/conversations/markdown-agent/frontmatter`：读取与写入笔记属性。PUT 必须携带 `expectedYaml` 基线；过期返回 409，系统 `id/createdAt/updatedAt` 不可编辑，自定义 YAML 字段随普通正文保存保留在 vault。
- `ChatDocumentAgent`：`{ format?, documentId, getVersion, getContext, freezeSelection, execute, undoRound }`；`format` 省略仅兼容旧 DOCX 句柄。
- `docx_agent_runs`：原表保留，PostgreSQL 与 SQLite 均增加 `format`、`version`，旧行按 DOCX 解释。该表存关联 ID、工具名、状态和时限，不存原件正文或工具参数。

## 3. Contracts

服务端从已鉴权文档重新判别格式并确认存在可编辑视图，以 `documentAgentCatalog(format)` 选择固定工具目录，不能使用客户端提供的任意工具定义。未注册的格式返回不可用，不能因为 schema 允许该格式就宣称可写。`DocumentPanel` 把当前编辑器的句柄送到 `ChatPanel.documentAgent`；发送时冻结版本、选区和上下文，客户端仅对匹配文档、格式与轮次的句柄执行。工具结果符合 `{ ok: boolean, changed?, version?, summary?, error?, data? }`。画布修改须推进版本并保持 dirty；保存仍由用户按格式的既有路径触发。

模型可见的批量编辑工具如果接收异构 `ops`/`operations`，每项 schema 必须显式要求真实执行器使用的操作判别字段，并列出已开放的操作名、关键字段及至少一个完整调用示例。不能只声明 `items: {type:'object'}`，再依赖模型从说明文字猜测 `op`/`type`。验证失败应返回项序号与首个无效字段，且在写入前拒绝；支持范围必须与实际宿主执行器一致。真实模型调用仍需验证此合同，单元测试不能代替。

TanStack AI 负责 `RUN_FINISHED.outcome → client_tool_* → resume → parentRunId`。服务端将中断集合、格式、文档、轮次及版本持久化；续轮时校验每个结果和版本推进，并原子消费一次。失败必须以 `ok:false` 进入模型续轮。取消、切文档或后续人工修改不能把旧结果落到当前画布。

续轮 HTTP 失败时，桥接层保留已经计算的完整工具结果，提供“重试续传工具结果”；重试前再次核对当前文档、格式、轮次及画布版本，且不得重新执行画布工具。`@assistant-ui/react-ag-ui` 的项目补丁在失败后恢复同一待处理中断；若首次请求其实已到服务端，服务端原子消费会拒绝重放。版本变化或服务端拒绝时提示重新发送指令，不假称续轮成功。

首轮发出 `POST /api/chat` 前，`packages/chat/src/runtime/agent.ts` 的 `onRunInitialized` 必须经 `ChatIo.createConversation()` 建立真实会话，并将返回的同一个 ID 同时写入 `params.agent.threadId`、请求 `threadId` 和 `forwardedProps.conversationId`；续轮继续沿用该 ID。AG-UI 自行生成的临时线程 ID 不能充当已落库会话。服务端 `docx-agent-stream.ts` 在首轮和续轮都要求 `getConversation(conversationId)` 存在，并校验 `threadId === conversationId`。这样工具首次中断后的续轮可以找到会话，也阻止伪造或已删除会话的写入。

浏览器、桌面本地模式和桌面远端模式经相同的文档服务合同访问需要 Node、Rust 或 PDFium 的执行器；不能把格式工具只挂在 Electron IPC。各格式编辑器/宿主能力和两端实测另由格式任务证明。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| 未登录、无权读取文档、格式与原件不符 | 拒绝工具请求，不返回可写目录 |
| 格式可识别但当前视图没有真实编辑画布 | `executorReady=false`，不发起写轮 |
| 格式尚无注册目录或当前句柄 | 保持单篇只读问答，能力状态说明未接入 |
| 中断 ID 重复、集合不符、已消费或过期 | 拒绝续轮，不重复执行 |
| 首轮或续轮缺少真实会话、会话已删除 | `409 DOCX_AGENT_STALE`；不发写工具 |
| `threadId` 与 `forwardedProps.conversationId` 不一致 | `400 DOCX_AGENT_RESUME_INVALID` |
| 结果 `ok` 非布尔、`changed=true` 无推进版本、只读结果版本不符 | 拒绝或转为失败续轮，不宣称修改成功 |
| 异步期间切文档、停止、手动修改或会话失效 | 旧轮拒绝写入；dirty 和后续人工修改保留 |
| Markdown frontmatter 基线过期 | 返回 409；不覆盖人工改名、正文或属性修改 |
| 从旧版升级时仍有未消费的 DOCX 中断，迁移无法还原其画布版本 | 旧轮按过期拒绝续轮；历史仍可读、可取消，用户在当前画布重新发送指令 |

## 5. Good / Base / Bad Cases

- Good：打开有执行器的文件，先人工改动但不保存；Agent 从未保存画布读取并修改，用户保存重开仍准确。
- Base：打开尚未注册执行器的格式，侧栏仍能进行单篇问答，并明确显示编辑不可用。
- Bad：模型等待期间用户切换文档，随后迟到的工具结果或伪造的 `resume` 到达；文档不变，续轮返回过期/无效。

## 6. Tests Required

- `apps/server/src/test/document-agent-core.test.ts`：格式鉴权、工具白名单、能力目录、HTTP/SSE 续轮、错误结果、重复/过期消费及 SQLite/PostgreSQL 迁移。
- `packages/chat` 与 `packages/renderer`：当前句柄路由、格式匹配、选区/版本冻结、取消和 DOCX 回归。
- 首轮无现成会话时断言先调用 `createConversation()`，两处线程 ID 等于落库 ID；首轮工具中断后续轮沿用该 ID，已删除会话或线程 ID 不一致由服务端拒绝。
- 每个真实格式任务须补 Agent 与手动操作交替编辑、dirty、保存两次、独立读回、浏览器与桌面实测；假执行器仅验证通道，不能证明格式能力完成。
- `pnpm check` 与 `git diff --check`；第三方模型与媒体服务需使用真实配置单独验证。

## 7. Wrong vs Correct

```ts
// Wrong: 只看请求里的 format 就加载写工具。
const catalog = await documentAgentCatalog(request.format)

// Correct: 从已鉴权文档确认格式和真实画布，再选已注册目录。
const format = documentAgentFormatOf(document)
if (!format || !documentAgentCanvasSupported(document)) return unavailable()
const catalog = await documentAgentCatalog(format)
```
