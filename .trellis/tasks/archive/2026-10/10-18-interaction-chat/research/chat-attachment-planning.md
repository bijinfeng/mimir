# Research: 标准聊天附件的独立业务规划

- Query: 用户已选择“一并规划聊天附件能力”。研究现有上传、解析、存储、RAG、会话持久化和官方 AttachmentAdapter，为完整官方 Thread 提供真实附件业务，不将聊天附件偷偷永久导入知识库。
- Scope: mixed；独立子任务的前置研究，具体限额/保留/能力清单待 v3 HTML 审批。本研究不修改产品、spec、原型或任务元数据。
- Date: 2026-10-19

## Findings

### 结论与建议范围

建议独立“会话附件”资源，使用真实官方 Thread 附件组件和一个符合官方接口的业务 adapter；服务器存原件、提取正文/核验图片并将附件关联到当前会话和已发用户消息。附件只在当前会话用于问答，不进入 documents/vault/全局搜索/嵌入索引，不触发 Office 编辑或文档 Agent 执行。知识库永久导入继续走现有入口，是用户另一个明确动作。

首版建议支持现有解析器实际具备的文本、Markdown、CSV/TSV、JSON/YAML/XML/常见代码、DOCX/XLSX/PPTX/PDF文字层，以及 PNG/JPEG/静态 WebP 的视觉输入。图片须聊天模型已启用视觉；文件内容必须准备成功才能进入模型。不要承诺旧 Office、扫描 PDF OCR、图片 OCR、音视频转录、压缩包/EPUB解析、Office原版预览或编辑。现有某些文档 Agent/媒体工具支持音频不代表标准聊天附件已具备音频全链。

### Files found 与可复用边界

| 当前文件 | 实际能力/本轮应用 |
| --- | --- |
| `packages/shared/src/files.ts:17,268` | KB上传50MiB、MIME/扩展名、parseTargetFor、格式标签/内联安全白名单；可复用纯函数，不继承全部可存类型为聊天可理解类型 |
| `packages/shared/src/seams.ts:86–142` | parser输入分文本/字节，输出Markdown；无数据库、无AbortSignal契约 |
| `plugins/parser/src/index.ts` | 注册 markdown/html/html-fragment/text/docx/xlsx/pptx/pdf，职责仅解析 |
| `apps/server/src/services/extract.ts:42–113` | 纯提取编排：decode、找parser、加密DOCX检查、结果/error；可复用，但必须先查支持且拒绝空正文 |
| `plugins/parser/src/ooxml.ts:30–69` | OOXML实际解压预算：单XML16MiB、总64MiB、部件10000；不可仅凭压缩文件小就放开 |
| `plugins/parser/src/pdf.ts:38–65`、`pdf-extract.ts:83` | pdf.js文字层、按页提取；扫描件无文字会失败，不做OCR，不还原多栏/表格版式 |
| `plugins/parser/src/docx.ts:34–57`、`xlsx.ts:41–79`、`pptx.ts:30–69` | DOCX段落/标题/简化表格；XLSX工作表文本/缓存数值（非公式重算）；PPTX形状顺序文字（无备注/OCR） |
| `apps/server/src/lib/multipart.ts:10` | multipart解析前逐块限制真实请求字节，保护内容长度伪报；错误文案现写死50MiB，若复用较小聊天预算须参数化对应说明 |
| `apps/server/src/lib/uploads.ts:40–68` | 文件名消毒可复用；uploadKey/meta规则与KB绑定，不直接调用writeUpload建立KB元数据 |
| `packages/shared/src/seams.ts:323`、`apps/server/src/plugins/host.ts:322` | activeStorage的read/write/remove/list，现有本地/S3统一后端，可新建chat-attachments前缀 |
| `apps/server/src/services/upload.ts:74,91,125,202–278` | **不得复用该编排**：MD变笔记，其他文件建documents、目录/标签、searchText、分块和嵌入 |
| `apps/server/src/services/vault-index.ts:24,110,267` | 扫vault/uploads重建KB；聊天前缀必须隔离，不被重建捡回成永久文档 |
| `apps/server/src/services/assistant-stream.ts:154–173,200–245,309–343` | 现只取用户文本、拒普通图片、落库纯text、无KB引用则不调用模型，模型内容重新拼成字符串 |
| `apps/server/src/services/retrieval-preparation.ts:11–20,175–211` | KB提示只允许【资料】；历史只保留纯text且可能跳过无KB引用回答，新附件需独立上下文与来源验证 |
| `packages/shared/src/conversations.ts:88–103`、`apps/server/src/services/conversations.ts:38,175,248` | Message当前没有附件字段；删除会话只删会话行，不清理附件对象 |
| `apps/server/src/db/schema.pg.ts:201–229`、`schema.sqlite.ts:188–216` | messages仅text/trace/citations/failure/savedNote；会话FK级联不等于对象存储清理，双数据库均需迁移 |
| `packages/chat/src/runtime/history.ts:48`、`runtime/agent.ts:82–145` | 历史需还原official complete attachments；当前真实会话创建和PNG队列校验可作为宿主接缝参考 |
| `apps/server/src/services/pptx-snapshot-input.ts:4–69` | 现有图片检查是专用PPTX快照：每轮1、历史4、PNG5MiB/1280×1920，并非通用聊天附件 |
| `apps/server/src/services/docx-media-analysis.ts:15–23`、`packages/shared/src/pptx-image.ts:34` | 视觉启用/模型就绪判断及真实图片容器/尺寸校验可复用基础能力；不调用带文档语义和写入副作用的Agent入口 |

### 官方 0.15.29 的准确 Adapter 合同

源级核对环境：`/private/tmp/mimir-chat-official-v2/official-deps/node_modules/@assistant-ui/react` **0.15.29**，对应 `@assistant-ui/core` **0.3.29**。固定 registry源仍为 `a587b2838f2d644549d216098d54cfbeedfac522`，授权MIT；完整来源与源码指纹沿用 `vendor-full-thread/source-manifest.json`。产品实际react0.15.28/AG-UI0.0.68不在本研究中升级。

core `src/adapters/attachment.ts:9–20`：

```ts
type AttachmentAdapter = {
  accept: string
  add({ file }: { file: File }):
    Promise<PendingAttachment> | AsyncGenerator<PendingAttachment, void>
  remove(attachment: Attachment): Promise<void>
  send(attachment: PendingAttachment, options?: { signal?: AbortSignal }):
    Promise<CompleteAttachment>
}
```

`src/types/attachment.ts:3–44` 的合法状态和字段：

- Pending必须有 `{id, type, name, contentType?, file: File, status}`；add若为generator，所有yield保持同一id。
- 上传/准备中：`{type:'running',reason:'uploading',progress:number}`。官方tile只画spinner，不显示实际百分比或“解析中”新阶段；不要伪造服务端没有上报的进度。
- 可发送：`{type:'requires-action',reason:'composer-send'}`；这是待send，不等于消息已发送。
- 失败：`{type:'incomplete',reason:'error',message}`；另有upload-paused，但默认tile不把其画成error，取消后通常移除/恢复待发送状态，不能发明reason:'cancelled'。
- Complete：`{id,type,name,contentType?,status:{type:'complete'},content:ThreadUserMessagePart[]}`。历史不必有File；图片content可直接驱动原生预览。

完整官方 `attachment.aui.tsx:118–236` 自动提供spinner、失败图标、错误tooltip、图片预览、composer移除按钮。**没有重试按钮、阶段详情、数值进度和过期业务UI**；这类说明/重新选择动作放在对话外应用宿主区域，不新增自绘附件tile。`add`没有signal参数，业务adapter需按稳定id维护自己的AbortController，remove与generator finally取消在途请求/轮询；`send`必须消费官方传入signal。移除后迟到结果不可重新插回composer。

用于v3的最小合法fixture：

```ts
const pending = {
  id: 'attachment-fixture-1', type: 'document', name: '项目说明.txt',
  contentType: 'text/plain', file,
  status: { type: 'requires-action', reason: 'composer-send' },
}
// send返回真实合法CompleteAttachment，内容必须明确是本地演示：
const complete = {
  ...pending, status: { type: 'complete' },
  content: [{ type: 'text', text: '本地附件演示内容，不代表产品已上传或持久化。' }],
}
```

上述文本fixture只用于官方状态机可运行验证。**产品建议不把客户端提取文本作为服务端可信附件正文**，也不要使用SimpleTextAdapter全文件直接塞进用户问题导致超长/可伪造；正式send返回同源文件ref，服务端根据已验证附件ID读取自己的提取结果。

### 建议的独立资源与最小 API（均待审批）

建议资源 `conversation_attachments`：id、conversationId、originalName、normalizedMime、size、contentHash、sourceKey、textKey/提取正文、parser版本、status、errorCode、createdAt、draftExpiresAt、deletedAt。以 `message_attachments(messageId, attachmentId, ordinal)` 关联已发用户消息，支持重试引用同份文件而不重复上传。客户端id/uploadOperationId只是幂等键，授权、可用状态、归属和真实内容均由服务器验证。

对象前缀建议 `chat-attachments/<conversationId>/<attachmentId>/original` 与独立提取正文；不使用uploads/vault，不进入KB索引。原文件名作为metadata，不拿用户路径当对象key。对外只提供有鉴权的下载/图片读取端点；HTML/SVG等不安全内联类型强制下载。传给模型时服务器读取自己的bytes或提取文本，不让模型/服务器自由fetch客户端任意URL。认证沿既有requireAuth，检查会话存在与attachment归属，拒绝跨会话ID。

建议最小路由形状：POST `/conversations/:id/attachments` 单文件multipart，GET `/:attachmentId` 状态，GET `/:attachmentId/file` 原件，DELETE `/:attachmentId` 移除未绑定附件。必要时POST `/:attachmentId/retry`仅重新准备同一原件，revision递增；已绑定消息的附件不能被composer移除误删。所有新路由在既有受保护API组下。

选择附件时先通过已有ChatIo创建/取得稳定真实conversationId，复用并发合并的创建promise；更新runtime身份不能导致活动对话重挂载。当前创建只发生发送前，需要抽出可复用的ensureConversation接缝，不能各创建一份会话。没有正式发送也可存在空会话，未用文件按草稿TTL清理；不自动删用户会话。

上传保存后可返回202+id，持久化uploaded/processing/ready/failed状态并有界准备；adapter轮询真实状态，不画自定义阶段。现无通用持久任务队列可直接借用（feeds.ts也明确未落jobs/worker），首版不需引入大型队列服务，但准备状态/源文件必须能在服务重启后恢复，或明确转为可重试失败，不能永远processing。并发建议2；纯parser无AbortSignal，取消应使任务失效、丢弃迟到结果并清理，**不承诺CPU解析立即可中止**；需要硬超时隔离时用worker线程，不以Promise.race冒称终止工作。

send时传 `attachmentIds` 的受控runConfig/forwardedProps，服务器确认ready/未过期/同会话/限额/幂等message绑定；ref是引用而不是正文真实性证明。原生file content可为 `{type:'file', filename, mimeType, data:sameOriginFileUrl, sourceType:'url'}`，image content为受控同源imageURL。SDK core message.ts:75–84与已安装AG-UI `runtime/adapter/conversions.ts:237–312`支持url分支，但必须真实HTTP测试其往返后的字段；`sourceType:'id'`不受AG-UI支持，不能将随机ID当base64。发到模型前由服务端从附件资源解析，不能原样向外部provider发需要Cookie的本地URL。

### 普通 Chat 真正需要修改的最小层

只删IMAGE_AGENT_REQUIRED会留下多处断链：

1. `assistant-stream.ts:188–205` 先分documentAgent再拒全部普通image；保留专用Agent先行路由，普通chat只有验证为**会话附件**的image才进入新多模态支路。不能放开任意URL、dataURL或冒充snapshot；专用快照仍执行validatePptxSnapshots和客户端源/版本守卫。
2. `lastUserQuestion:154–173`、`:245`只取/存text；新增server-authoritative附件IDs解析/绑定，附件内容不混成用户问题或KB检索query。图片无文字发送建议首版允许（规范化成明确默认提问“请描述并分析这些图片”或模型原生无text输入，二选一需v3定案），不能让官方canSend允许后服务端又说没有用户消息；文档无文字建议默认“请概括附件内容”，需明确这是宿主发送策略。
3. `:309–315` 的 `citations.length===0` 当前强制只检索；存在ready附件可用上下文时应允许模型问答。scope=search仍保留只检索语义，附件存在时不可静默忽略，应在发送前明确阻止本轮组合并让用户移除附件/切回问答；无模型/无视觉同样阻止并保留草稿，不能降级成假装读过附件的KB答案。
4. `retrieval-preparation.ts:15` 的KB专属提示与`:337–341`用户字符串改为“已验证KB资料 + 已验证本轮附件正文/图片 + 用户问题”明确来源；图片经provider支持的原生多模态parts传入，不能base64塞进文字。ModelCallOptions本来沿用TanStack messages，保留model.ts唯一调用/usage记账入口。
5. 角色取决deepReasoning，视觉就绪必须验证本轮**实际选择的角色/模型**；当前docxMediaReadiness只验证chat+设置开关，可复用设置读取但不能据此推断reasoning模型也能看图。provider拒图片保留失败/恢复，不伪装成功或自动换模型。
6. `Message`共享合同、PG/SQLite schema/migration、append/get/history需持久化附件metadata/关联。`verifiedRetrievalHistory:175–211`当前跳无KB引用回答、只存截断text，需补附件回答的证据核验和选定的后续会话策略。建议同一会话已发送附件可继续追问，但每次从服务端已绑定资源重建、按预算选择，过期/删除源不得继续用旧内联文本冒充新鲜附件。
7. 原生图片/文件ref用于界面，提取Markdown仅服务器上下文；KB citations继续用原documents引用，附件来源用独立身份/宿主依据区，不编造documentId或跳KB不存在页面。保存回答成笔记不自动将附件原件导入KB；笔记引用会话附件需注明其存续依赖，不能生成永久KB双链假象。

### 资源生命周期与交互状态

| 阶段/事件 | 推荐业务行为与官方呈现 |
| --- | --- |
| 选择/多选 | 前后端都校验格式/数量/实际字节；每文件独立结果。客户端先保留原File，add即时yield同id；不能一个失败撤销其余成功附件 |
| 上传/解析 | 服务器状态uploaded→processing→ready/failed；官方pending running仅spinner。处理中的附件禁止实际模型派发，send等待或以原生pending状态阻断；不静默略过未准备附件 |
| 取消上传/移除草稿 | remove abort+服务器取消/删除未绑定资源、object URL revoke；已写字节的失败/中断事务记录待清理。请求尚未返回id的孤儿用operationId/TTL回收；不允许迟到ready复活 |
| unsupported/超限/空文件/错误 | 在写前尽早拒绝，服务器复核。已出现tile用incomplete/error/message；选择阶段拒绝可通过官方attachmentAddError事件交宿主说明。不能给unsupported附件假complete，不能把解析空正文当成功 |
| 解析失败/重试 | 保留可重试的原件/错误短时记录；同原件retry只做解析不重发模型，新的revision挡旧结果。官方无Retry按钮，宿主重试或移除重新选择，保留其余草稿 |
| 发送准备/取消发送 | send验证ready、实际role、剩余预算与signal；官方submission自动呈现准备中。取消后回到原草稿或保持可取回，不提前删除源，避免用户重传 |
| 正在生成时排队 | 队列冻结附件ID/hash+范围/模型选择；资源加lease，实际dispatch再次查ready/存续/模型。排队取消只释放本队列引用，不删同消息/另一队列正在用的文件 |
| 停止/失败/取回 | 保留文件引用、文字、目标和独立PNG来源一起恢复；新草稿存在时不覆盖；不把通用附件失败回退成只检索，不重跑已执行Agent工具 |
| 历史/刷新 | GET会话还原complete attachments，不持久化File/blob临时URL；刷新后能读取正式关联原件。官方document附件tile没有下载或Office完整预览；读取/下载需Thread外宿主入口，图片是原生preview |
| 过期/原件缺失 | 草稿TTL过期或真实资源缺失，发送/重试明确报expired/not-found并保留文字；宿主提供重选；不悄悄删tile后继续提问。正式历史保留文件名/size/hash/tombstone说明，不能显示仍可用的下载 |
| 删除会话 | 先撤销附件访问与派发lease、取消准备任务；DB关联随会话删，存储逐key幂等清理+失败重试/启动扫孤儿。cascade FK只删数据库，不能当作S3/磁盘已删除 |

上传原件内容是资料，不是给Agent的权限；不得从附件内指令启用工具。服务器只接受自己绑定的附件资源，避免客户端篡改extractText/角色/源ID。命名/鉴权/取消/配额是这条新业务实际需要的约束，延续现有受保护API而非新增独立认证方案。

### 具体建议限额/保留（待 v3 稿审批，不是现行事实）

| 项 | 建议首版 | 依据/限制 |
| --- | --- | --- |
| 数量/总字节 | 每条最多4件，合计20MiB | 低于KB大文件导入，便于准备与恢复；不要抄WeKnora的5件当项目现行值 |
| 单文档 | 10MiB，非空 | 现parser本身最大可到50MiB不代表聊天应允许同量；仍保留OOXML解压预算 |
| 单图片 | 5MiB；PNG/JPEG/静态WebP；最大边4096、总像素16MP | 容器校验可复用readPptxImageInfo后施加更严预算；拒动画/损坏/MIME不符，不暗转格式 |
| 提取/上下文 | 每件建议最多12000字符，全轮附件24000字符，并检查实际模型剩余上下文 | 首版不做附件向量库。超限明确拒用/要求缩小，不静默截断后说已完整阅读；若需长文，另规划附件范围chunk检索 |
| 处理 | 最多2件并行、30秒准备超时建议 | parser不具备硬取消；超时资源不再可派发，worker隔离/实际压测后再定实现 |
| 未发草稿 | 上传后24小时失效；未绑定且无活动lease的准备失败/中断/孤儿原件1小时回收建议 | 提醒过期与重选；活动prepare/queue/run lease有界续期，不被GC误删 |
| 已发附件 | 与会话保留期一致，删会话回收；每会话总量建议200MiB | 确保历史可读，不把聊天附件默认为KB永久资料；超额不自动删旧历史附件，拒新增并解释 |

以上数字是可审阅的产品建议，实际provider窗口、解析耗时和存储预算验证后可调整。若需要随时间自动删除已发附件，应另明确保留天数/历史tombstone及提示，不能在没有用户认可时额外决定30天后失去历史原件。

### WeKnora 的本轮附件证据

复用本轮已重新验证的官网/固定源：官网HTTP200、v0.8.3、HTML SHA256 `6ae3d1aefe92980cded37b949947f077e12c227993745c7f10f5124ec2baedbe`；固定 `2c0d8384398ca756ee414eef01b71caf91e2caa6` 的frontend包0.8.3，不声称线上部署SHA已证明。详情见 `vendor-full-thread/weknora-reference-recheck.json`。

本研究另外通过GitHub Contents API对固定ref获取以下附件源码，均HTTP200（仅读取，在本文记录来源/指纹）：

- [temporary-attachments.ts](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/frontend/src/api/chat/temporary-attachments.ts#L3)，SHA256 `fbfce3c9b0cd854a0c1f802539451046266a51af7adf88991c56ee4676a95ba1`：`:3` uploaded/processing/ready/failed，`:7` session_id，`:17` expires_at，`:25–56`会话内upload/get/preview/delete。
- [temporary_document.go](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/internal/types/temporary_document.go#L20)，SHA256 `2d903c5d7bca1864978543481c6d8fe9b03e21c7c08bcdae08ee1814ac8d9818`：`:22`每消息最多5件，`:25` session-scoped expiring document，`:31,43,46`会话/token/过期元数据。
- [temporary_document_prompt.go](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/internal/application/service/temporary_document_prompt.go#L29)，SHA256 `bb1c8289b1f472e0917735c8eaafd73451b7ba329338f3b33330c948ca19362e`：`:45–56`验证同会话+ready/failed，`:18–24`内联token/agent预算，`:167–200`长文按预算选chunk。
- [handler temporary_document.go](https://github.com/Tencent/WeKnora/blob/2c0d8384398ca756ee414eef01b71caf91e2caa6/internal/handler/session/temporary_document.go#L17)，SHA256 `e10e0977170047da6f67d6c85fa8c305e9949187623d3faca182b00b52ef90eb`：`:17–24`会话owner验证，`:28`请求大小限制，`:67–87`音频/视觉另有模型gate，`:98`异步202，`:169`删除附件也要求owner。

适用：独立会话附件、先上传准备再按ready使用、归属/预算/生命周期均有可核查先例。**不直接照搬**：WeKnora有自己的后端worker、OCR/ASR、长文chunk选择和多租户授权，Mimir不能因上游存在就承诺已支持。UI严格使用assistant-ui默认，不重画其Upload.vue/Drawer，也不把其Markdown编辑器当Office工具栏参照。

### Related specs / 后续验收

- `.trellis/spec/plugin-parser/backend/index.md`：纯解析接缝，不写库。
- `.trellis/spec/plugin-storage/backend/index.md`：相对POSIX key、本地/S3同一后端。
- `.trellis/spec/server/backend/auth.md`、`conventions.md`、`tests.md`：受保护API、统一错误、真实HTTP验证。
- `.trellis/spec/chat/frontend/conventions.md`、`pitfalls.md`：官方runtime、队列、PNG草稿、DocxInterruptBridge及失败重送。
- `.trellis/spec/shared/contract/document-agent.md`、`docx-agent.md`：Agent执行/版本/续轮不能被通用附件旁路。

未来独立任务应验证真实multipart字节超限、格式伪报/损坏/无文字PDF、解析不入KB、上传取消与迟到结果、同会话/跨会话权限、仅附件发送、无KB命中但附件能问答、视觉模型gate、排队冻结/失败归还、历史刷新、删除会话对象清理及重启恢复。官方UI需浏览器验证spinner/error tooltip/移除/image预览与默认输入发送；测试账号统一现有admin，不新建其他账号。

## Caveats / Not Found

- 仅规划研究，未实现路由/数据库/adapter、未跑附件端到端测试；v3中的fixture必须明确模拟，不能宣称文件已上传产品服务器。
- 现有普通chat不是通用自由问答：KB专属提示/无引用降级/历史过滤都需随附件需求调整，不能只为附件显示漂亮tile就称业务完成。
- 附件保留期、总量、格式及仅附件默认提问是本文建议，需进入v3稿明确审阅；用户已授权规划聊天附件，不需重复把“是否支持附件”当未决问题。
- 纯解析器没有signal，不提供OCR/ASR；原生file/图片能显示不代表模型已理解、文件能编辑或Office可完整预览。
- 本研究只写本文件，未修改产品/spec/原型；既有47项产品来源基线保持不变（收尾重新校验）。
