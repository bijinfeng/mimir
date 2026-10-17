# PPTX AI 美化截图与目标绑定方案（2026-10-17）

## 状态与最小缺口

方案已由 root 确认并实施，实施证据见 `pptx-ai-screenshot-implementation-20261017.md`；本报告保留批准时的设计和研究依据。前片图片格式已由独立 checker/root 收口，本片不再改图片来源格式、引擎 vendor、公开图片生成/分析工具或通用文件上传。

当前 `美化本页` 只生成带页面文字标识的 prompt。没有截图附件，且目标只存在于文字中：用户准备草稿后换页，发送仍会重新冻结后来选中的页。需要补成：**从当前未保存画布生成真实 PNG → 将该 PNG 和指令作为问 AI 草稿 → 用户显式发送 → 发送/排队派发仍验证原文档、页面和版本**。准备失败、取消、迟到和过期都不能静默变为另一页的指令。

主建议只扩展 **PPTX 美化本页** 的截图和绑定；其余 PPTX 预设继续现有范围语义，其他格式的 `onAiPreset(string)` 不变。无模型仍允许准备和查看草稿，不能把截图降级为文字检索并声称完成美化。

## 1. 竞品与版本证据

### GenOffice：文件编辑主参考

本地固定源码 `/tmp/mimir-genoffice-html-git`，本轮 `git rev-parse HEAD` 实核为 `480548fd55f1be3593ee0d8e316a734751d58309`，Apache-2.0。

| 证据 | 实际合同 | 对 Mimir 的应用 |
| --- | --- | --- |
| `apps/slides/src/renderer/components/RibbonHomeTab.tsx:233–241` | AI 美化传 `onAiPreset(prompt, {slideShot:true})`。 | 美化需要本页视觉输入，不应继续只预填文字。 |
| `apps/slides/src/renderer/App.tsx:461–467,1261–1282,3145` | preset 有 nonce、autoRun、slideShot，Ribbon 路径 autoRun。 | 复用预设语义；Mimir 已确认保留显式发送，**不照抄自动发送**。 |
| `apps/slides/src/renderer/ai/AiPanel.tsx:249–266,1487–1510` | preset 可带附件、截图标记；autoRun 路径运行，否则只 setInput 并聚焦。 | 草稿应携带真实附件；本片仅选择草稿路径。 |
| 同文件 `1570–1580,1648–1669` | `renderSlidesToPngBase64` 捕获本页；仅 `settingsSupportVision` 时加截图和模型说明，再 run。源码在异步后读取 `currentRef.current`，不是足够严格的目标冻结。 | 视觉能力须真实门控；Mimir 需要在第一次 await 前冻结页面/版本，不能原样抄其迟读当前页行为。 |
| `apps/slides/src/renderer/export-render.tsx:1–53` | 复用实际 SlideThumb/Konva renderer，在离屏容器绘图；AI screenshot 用 pixelRatio1，普通导出默认2。 | 沿 Mimir 自己的 renderer 生成截图，不新增第二套布局器，不截整个应用 UI。 |
| `apps/slides/src/renderer/i18n/ai/zh.ts:26–27` | 目标是优化排版、配色、字体层级。 | 保留当前紧凑入口，无新增样式配置问卷。 |

### WeKnora：能力与作用域参考，不作 Office 外观依据

- 官网本轮实际 HTTP200、113529 bytes，保存 `/tmp/mimir-pptx-ai-screenshot-weknora-site.html`；沿任务已核的 v0.8.3 快照记录，不把营销页面宣称为版本探针。
- 固定公开源码 `Tencent/WeKnora@3e22822c1d2397be730c458c7539d0eb8c113a24/internal/agent/tools/definitions.go`。raw.githubusercontent.com 本轮超时；随后 GitHub Contents API **实际 HTTP200**，19806 bytes JSON，blob SHA `67be74c5b086135585ec519b0caabd3df360f423`，解码 Go 13533 bytes。证据 `/tmp/mimir-pptx-ai-screenshot-weknora-source.json`、`/tmp/mimir-pptx-ai-screenshot-weknora-tools.go`。
- 源码31–33行说明 attachment:// 随会话实际存有附件提供；35–46行强调 sandbox 工具按真实 capability 注册，失效复选框会误导；60–67行 shell 也随能力/技能开关；69行起 Wiki 工具只在 Wiki KB 在 scope 时可用。
- 适用：真实视觉门控、实际附件输入、当前文档作用域须一致。其 sandbox 和 attachment:// 存储不是 Mimir 的现有接口，不移植；Markdown 编辑器与布局不作为 Office Ribbon 主参考。

## 2. Mimir 实际调用链与空缺

### Office → renderer

1. `PptxAiControls.tsx:11–31` 收 `onAiPreset(instruction:string)`；`pptx-ai-presets.ts:18–87` 已有 documentId、slidePath、slideIndex、version，但只有 slideId/index 被写进 prompt；documentId/version 没有形成运行时锁。
2. `PptxEditor.tsx:1012–1027,1073–1077` 已发布不可变 `view`/`viewVersion`，当前 `renderSlide` 正是画布 renderer；3543/3560 两组调用直接转发字符串回调。
3. `OfficeSourceEditor.tsx:198` → `FilePreview.tsx:156` → `DocumentPanel.tsx:819` 仍是 string；`DocumentPanel.tsx:246–269` 将其放进侧栏 `AskDraft{text,documentId}` 并打开侧栏。
4. `DocChatSidebar.tsx:96–103,186–199` 只在 executorReady/modelReady 时给 ChatPanel 可执行 agent。**无模型时原始编辑器句柄仍存在，但 activeAgent 为 null**。

### 截图可以直接复用的 renderer

- `pptx-render.ts:151–205`：`renderSlide(view,index,{fitWidthPx})` 产 self-contained SVG，与画布同一树和媒体 resolver，包含未保存修改。
- `pptx-output.ts:36–83`：`rasterizePptxSvg` 等字体、解码 SVG、canvas PNG、支持 AbortSignal、释放 objectURL；`buildPptxOutput:96–122` 已演示 await 前冻结页、之后反复 isCurrent。可以复用底层 PNG raster，不用调用下载/打印/保存。
- `editors/pptx-zoom-raster.ts` 另有640px缩放快照，但本片不复用其640px上限或复制解码器。建议截图1280px宽，按幻灯片真实纵横比；单边和像素预算明确，超预算拒绝，PNG至多5MiB。图为页面静态渲染，未包含选择框、Inspector、文本编辑器 UI 或放映动画中的特定瞬间。

### chat 附件不是完全缺失

版本：`@assistant-ui/react 0.15.28`、间接 `@assistant-ui/core 0.3.27`、`@assistant-ui/react-ag-ui 0.0.68`、TanStack AI0.55.0。

- Core `runtime/base/base-composer-runtime-core.js:443–467` 的 `addAttachment(CreateAttachment)` 直接发布 complete 附件，**不需要 AttachmentAdapter**；只传 File 才需要上传/读取 adapter。因此可将已生成PNG以 `{id,type:'image',name,contentType:'image/png',content:[{type:'image',image:dataUrl,filename:name}]}` 添加；本片不引入通用上传器。
- AG-UI `runtime/adapter/conversions.js:101–128,264–289,800–835` 已把 attachment image 转成 TanStack `{type:'image',source:{type:'data',value:base64,mimeType:'image/png'}}`。PNG不应塞 prompt、agentContext 或工具返回文本。
- `ChatDraft` 目前只有 text/documentId；`ChatPanel.tsx:136–151` 只 setText。`Composer.tsx` 不渲染附件。`UserMessage` 只 `MessagePrimitive.Parts`；真正 composer 附件须另接 `MessagePrimitive.Attachments`，已有 ImagePart 槽不能当成附件回显已完成。
- `runtime/use-mimir-runtime.ts:166–194` 在发送前调用 `freezeSelection()`，会覆盖准备草稿时的页；`runtime/agent.ts:116–181` 支持预冻结 `agentRoundId/agentSelection/agentVersion` 并验证版本，但没有截图目标标识检查，也不能在 `activeAgent=null` 时让目标截图落入普通检索。
- `Composer.tsx:253–261` 每次用范围/强度重写 runConfig。新绑定必须由发送准备函数按当前附件读取后合入，不能只在草稿 effect 中塞入后被覆盖。

### 服务端与能力门控

- `services/docx-agent-stream.ts:54–74,177–197` 提取文字用于问题/落库，模型调用仍传 **完整 parsed.messages**；故图片 parts 通道已通，不需要新 API 或图片工具。
- `docx-media-analysis.ts:15–23` 的既有 `docxMediaReadiness` 由 `model.vision.enabled && modelReady('chat')` 计算真实开关；这是用户确认聊天模型支持视觉，不等于模型探测成功。
- `pptx-agent-catalog.ts:175–190` 已按 media.vision 开放 analyze_media；**document-agent-capabilities.ts 的非DOCX返回目前没有填写现有可选 mediaKinds**。可以只为PPTX补 image/video 就绪结果，复用现有 shared 字段，无需扩 shared signature。
- 当前图片直接进入 document-agent stream 时没有本片所需的PNG内容/大小/维度门槛，也没有读取视觉开关。最小服务端接缝是PPTX agent消息图片的专用预检 + 视觉未就绪422；不得悄悄去图运行文字美化。新 helper 可沿用现有纯图片元信息解析，不改变公开生成/分析工具。
- 普通知识库问答 `assistant-stream.ts:298–312,444–457` 只取文本并重组RAG消息，会丢视觉输入。因此截图草稿必须在客户端挡住普通RAG分支，服务端也拒绝带本片截图却没有合法PPTX编辑上下文的请求；不能通过“没有模型便只检索”吞图。

## 3. 建议最小接口与所有权（待 root 确认）

### 3.1 Office 专属草稿，不改六格式 string 回调

新增 Office 局部类型（在入口导出，renderer映射到ChatDraft，不让office依赖chat）：

```ts
interface PptxAiSnapshotDraft {
  id: string
  text: string
  target: { documentId: string; slidePath: string; slideIndex: number; version: number }
  image: { name: string; mimeType: 'image/png'; dataUrl: string; width: number; height: number }
}
```

PPTX新增 `onAiSnapshotDraft?`；原 `onAiPreset(string)` 继续用于无截图的现有预设。美化按钮若没有完整截图宿主便明确禁用，不退回只传string；PPTX Editor接收美化请求并持有会话/取消，控件不自己碰全局DOM。`OfficeSourceEditor`、`FilePreview`、`DocumentPanel` 增加同名专属可选回调，DocumentPanel验证draft文档等于当前doc后一起打开侧栏。既有HTML/Markdown回调和其它格式行为不动。

### 3.2 chat 草稿字段为本地结构，沿现有 wire 合同

- `ChatDraft` 和renderer `AskDraft` 增可选单个 PNG snapshot（同一结构，显式映射），只放瞬时内存，不进URL/设置/知识库原件。
- ChatPanel消费新draft一次，撤下旧的本片截图后，完整加入PNG和文字并聚焦；用户修改文字后普通重渲染不再覆盖。取消/出错发生在调用宿主之前则旧草稿完全不变。
- 新增只读 `draftAgent?: Pick<ChatDocumentAgent,'format'|'documentId'|'getVersion'|'getContext'>` 供snapshot校验。DocChatSidebar可在无模型时传原画布的只读投影；**现有 activeAgent 仍决定工具执行/桥接**，只读句柄不让无模型获得可执行权限。
- 文档/版本/页面绑定使用现有 `agentVersion`、`agentSelection`、`agentRoundId` 的冻结路径。页面用slidePath→durableId并核对当前context的slides[index].id；美化是整页，elementId置null，不能无意缩为当前选中文字/对象。不新增shared Zod请求字段、不将图片塞进context。
- 发送时同时检查原draft的documentId、version、slideId/index、当前可执行agent和视觉门控；排队真正派发时再检查一次。只调整缩放/选择对象不应造成内容版本变化；换页导致当前页不符即提示重新准备，绝不套用新页。页序/内容发生修改产生新version，旧截图也拒绝。

### 3.3 媒体门控与无模型草稿

- 截图生成是本地操作，与模型是否配置独立。无模型时仍能在侧栏看到 PNG、页号与可编辑文本；显示“需要聊天模型并启用视觉输入”，沿现有模型设置入口。
- **附件仍在时不能走普通文字RAG/只检索分支**。发送按钮、Enter、快捷提问、重试/派发都必须通过同一snapshot检查。去掉截图后清除该snapshot绑定，普通文字问答恢复原规则；不偷偷删除图片再发送。
- 服务端只在本片PPTX agent路径对图片parts预检：PNG data source、真实PNG头和容器尺寸、单张5MiB、单消息至多1张、整个请求图片总量/数量有明确上限；非数据URL图片不通过本片路径。从现有 `docxMediaReadiness` 检查视觉就绪，失败返回具体错误；不新增模型调用、存储、上传端点。
- modelReady/vision字段来自现有capabilities，非DOCX分支只补已有mediaKinds。截图输入成功或工具契约通过不能报告真实模型美化成功。

### 3.4 queue restore 的最小必要接缝

当前queue内部保存完整AppendMessage与runConfig，正常派发可保留图片；但公开 `QueueItemState` 只有 id/prompt/parts。Core `runtime/queue/message-queue.js:6–17` 把image转 `file {data,mimeType:'image/*',filename}`。Mimir停止路径 `use-mimir-runtime.ts:137–151` 只还原first.prompt并移除queue，会丢新截图，必须处理。

**建议保留现有排队体验，局部补齐本片PNG恢复，不重构通用附件**：

1. 每个截图使用稳定的唯一filename/id；包内保留bounded snapshot registry（至多当前composer + 有界排队截图），记录target和PNG引用。不是全局store，不落库。
2. 发送前把已校验的冻结selection/version放入现有runConfig；`onRunInitialized` 在所有await后再次核对文档、版本和页，queued dispatch也走此检查。上一个编辑轮改变version后，旧截图拒绝派发，不能重新freeze到新版本。
3. 停止恢复first.parts中属于本片的PNG，以及registry对应target，再移除队列条目；字与图一起回composer，不自动发送。普通文本停止路径维持原行为。
4. 截图替换、移除和清除草稿仅清本片当前附件绑定，不清掉无关内容；registry至多保留4份已准备截图供已发消息重试，保护排队/在途项，卸载后释放。捕获重试不覆盖用户已编辑草稿；网络失败的“重试”保留同一snapshot目标并复检，过期要求重做截图，不能重新绑定当前页。
5. 暂不扩展服务端消息历史的图片存储。当前messageSchema/DB只落文字，刷新后的截图字节不能声称恢复。若root要求历史截图保真，需要另立附件持久化范围，不能在本片悄悄加base64数据库列。

如果root要求更小范围，备选是“带snapshot草稿在运行中保留于composer并禁止排队，普通文字继续排队”，这样无新增PNG queue restore；但会改变带图Enter交互，须root明确选择后实施，不能暗中采用。

### 3.5 拟文件所有权

本实现者可独占以下接缝，独立checker在交接后接手；root与另一DOCX实现者不在这些局部并改。共享重脏文件只改本片局部，绝不撤销他人内容。

| 区域 | 必要改动 |
| --- | --- |
| Office `editors/PptxAiControls.tsx`、`PptxEditor.tsx` | 美化专属请求、紧凑pending/cancel状态、当前会话/页/版本冻结、完成后发布draft。 |
| Office 新 `editors/pptx-ai-snapshot.ts`（或同职责helper）、`index.ts` | 复用renderSlide/rasterizePptxSvg，PNG预算和类型导出；不复制renderer。 |
| renderer `OfficeSourceEditor.tsx`、`FilePreview.tsx`、`DocumentPanel.tsx`、`DocChatSidebar.tsx`、`lib/app-shell-context.ts` | 专属draft转接、当前doc核对、无模型只读验证句柄和现有能力传递。 |
| chat `types.ts`、`ChatPanel.tsx`、`composer/Composer.tsx`、新小型snapshot附件件/helper、`parts/MessageItem.tsx` | 一次消费draft、紧凑缩略图与移除/当前目标反馈、真实附件回显，不开通用上传器。 |
| chat `runtime/use-mimir-runtime.ts`、`runtime/agent.ts`、必要的局部 `chat-context.tsx` 接缝 | 发送/queued dispatch/停止恢复与重试使用同一绑定，既有纯文字路径不变。 |
| server `document-agent-capabilities.ts`、`docx-agent-stream.ts`、必要的PPTX图片预检helper | 仅PPTX screenshot输入门控/限额；复用既有mediaKinds，普通DOCX/其它工具目录不变。若无合法agent上下文的图片请求需在assistant-stream入口显式拒绝，也只加该门槛。 |
| 目标tests | helper、Editor请求、renderer转接、真实ChatPanel HTTP契约和server输入门控；不跑heavy build/full Office suite。 |

这是实际必需的Office→renderer→chat→server小纵切片，不能只在Toolbar上加图片图标便声称功能完成。**没有shared公共signature变更、没有vendor修改、没有新依赖**；不修改PNG/JPEG系统剪贴板合同、公开图片工具或通用上传。新的只读draftAgent/草稿类型是两包本地props，需要各自明确导出/映射。

## 4. 取消、交互与验收

- 点击时同步互斥并创建AbortController，冻结documentId、session实例、source.bytes身份、published view/version、slidePath/index、rendered SVG；任何await之后及发布前全复核。图像工作用`waitForPptxOutput`的取消等待和10秒上限；最终用真实PNG结果，空图/解码/超预算失败明确反馈。
- 换页、版本改变、切文档、卸载、Escape/主动取消均终止本次准备；迟到font/Image/toBlob完成不能调用宿主。成功准备不改archive、history、dirty或保存状态。
- 现有Ribbon按钮原位显示准备状态，并可取消；不新增样式设置大表单。侧栏附件是窄的真实纵横比缩略图、页号、移除操作，长文档名省略；操作按钮不能随缩略图挤出。沿既有320/340 Inspector规则，截图入口不另开Inspector。返回焦点在取消时回原可见入口，完成时到composer，切分类后有合理fallback。
- 专项验证：未保存文字/颜色/图片确实进入PNG；横/竖页不拉伸；PNG signature/实际尺寸/字节数；selection框和工具UI不入图；失败/取消不动旧草稿；捕获期间换页/编辑/文档不发布；成功后换页/改稿发送拒绝；无模型可看草稿但不发RAG；同一draft消费一次、用户改字不被覆盖；移除附件清绑定；mouse/Enter/队列/停止恢复/重试所有入口一致；有界图片输入及视觉关闭服务端拒绝；普通无图chat/HTML/Markdown预设回归。
- root真实浏览器宽/420/短高验证实际PNG与草稿缩略图、移除/取消/过期提示和焦点；无需真实模型，不声称模型修改完成。Desktop依用户自验，本片不安排；不上传/删除测试件、不暂存/提交/归档。

## root 待确认的具体项

1. 是否按上述纵切片开放实施（office/renderer/chat/server必要小接缝），保持现有shared wire签名。
2. 建议采用有界snapshot registry补齐PNG排队/停止恢复；若必须压缩范围，则明确采用带snapshot草稿暂不排队的备选。
3. 截图为当前侧栏会话的瞬时附件，历史持久化不在本片；若需要刷新后图片恢复，应另列附件存储范围。
