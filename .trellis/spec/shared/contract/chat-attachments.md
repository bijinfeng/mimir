# 会话临时附件与消息历史合同

## 1. Scope / Trigger

普通模型问答的临时附件；资源属于真实会话及当前单所有者账号。所有 API 挂在 `requireAuth` 后。附件不调用知识库上传编排，不创建 document、chunk、embedding、vault 或永久双链。通用附件不能进入文档 Agent 编辑，也不能冒充专用 PPTX 截图。后两项及模型视觉/上下文窗口校验由模型问答入口负责。

## 2. Signatures

以 `/api/conversations/:id` 为前缀：

| 方法、路径 | 输入 → 输出 |
| --- | --- |
| `POST /attachments` | 单文件 multipart `file`、`uploadOperationId` → `ChatAttachment`，等待真实准备完成；失败资源返回 `status=failed` 与原因 |
| `GET /attachments/:attachmentId` | → `ChatAttachment` |
| `GET /attachments/:attachmentId/file` | → 受保护原件字节；仅核验成功图片允许 inline，其他格式 attachment |
| `DELETE /attachments/:attachmentId` | 删除未绑定草稿 → 204；已发附件保留；活动 queue/run lease 返回 409 |
| `POST /attachments/:attachmentId/lease` | `{leaseId,durationMs?}` → 204，期限最多 5 分钟，队列长时间停留须续租 |
| `DELETE /attachments/:attachmentId/lease/:leaseId` | 释放该 lease → 204 |

共享定义：`packages/shared/src/chat-attachments.ts`；发送只提交 `ChatAttachmentRef {id,sha256}`，放在 `forwardedProps.attachments` 或非流式 ask 的 `attachments`。`prepareChatAttachmentContext({conversationId,refs?,includeHistory?,historyMessageIds?,signal?})` 返回可信 documents、images、附件元数据及必须在 finally 调用的 `release()`；派发前将 refs 通过 `bindChatAttachments(conversationId,messageId,refs)` 关联到已持久化的 user 消息；回答持久化通过内部 `usedAttachmentRefs` 将服务端 prepared context 的精确引用关联到 assistant 消息，不能接受客户端提供的回答来源。

两方言共同新增 `conversation_attachments`（owner、operation、hash、相对 objectKey、提取正文、状态、revision、parserVersion、寿命）、`message_attachments`、`attachment_leases`、无外键的 `attachment_garbage`。后者在会话级联后仍保留失败回收对象。消息新增可空 JSON `protocol_events`、`model_selection`、`retrieval_scope`；旧消息缺省兼容。

## 3. Contracts

- `ChatAttachment` 字段：`id/conversationId/name/mime/size/sha256/kind/status/originalUrl/createdAt/bound`，可选 `error/expiresAt`；状态 `processing | ready | failed | unavailable`。`originalUrl` 是 API 相对路径，跨源宿主须通过已有 API base 构造受保护地址；不能让供应商自由 fetch 此地址。
- 同一 conversation 的同一 uploadOperationId、同一 hash 幂等复用；换字节或换所有者返回冲突。HTTP 每个附件操作同时核对真实会话、资源会话和认证 owner。
- 首版格式：非空严格 UTF-8 文本/Markdown/CSV/TSV/JSON/YAML/XML/常用代码；DOCX/XLSX/PPTX、PDF 文字层；PNG/JPEG/静态 WebP。Office 复用现有纯解析器，不重算、不还原版式；无 OCR/音视频转录/压缩包/旧 Office。
- 每条最多 4 件/20MiB；文档 10MiB、图片 5MiB，图片最大边 4096/16000000 像素。正文每件最多 12000、当前及历史合计最多 24000 字符；拒绝超限，不截断冒充完整读取。每会话最多 200MiB，超额拒新增，不删历史。实际模型剩余窗口由模型服务另行校验，不能用字符限制代替模型窗口。
- 两件并行准备，总准备预算含排队 30 秒。独立 Worker `resourceLimits` 限 JS heap；超时/取消必须 await `Worker.terminate()`。尺寸/容器/解压限制同时执行，heap 限制不等于原生库内存硬上限。生产使用显式构建的 worker、纯 parser 装配入口；仅 dev/test 在 worker 内注册 tsx，不加载应用/模型/数据库图。
- 原件先写 activeStorage 后写 DB，key 为 `chat-attachments/<conversationId>/<timestamp>_<id>/original`。不信任客户端正文/URL/MIME；读取/派发核验原件 hash、大小。原件丢失或被修改转 unavailable，历史保留名称及原因。
- 未发 ready 草稿 24 小时；失败/中断和无注册孤儿 1 小时；准备/queue/run lease 有界保护、可续租；续租、消息绑定和清理共享会话锁，清理候选取得锁后必须重新读取绑定状态与过期时间，不能依据旧候选删除已续租资源。已发附件即使回答失败也随会话保留；历史与追问重新核验资源，不把旧内联文本当原件。编辑/重试选定历史前缀时传 `historyMessageIds`，仅重建这些消息绑定的附件；空数组不带历史附件，省略保留旧入口的全会话行为，不能泄漏已放弃尾部的附件。会话删除先撤销状态，级联删除资源记录，再回收对象；失败由 garbage 重试。启动将遗留 processing 标为可重选 failed，运行期定期清理。
- 仅附件默认问题：含任一文档「请概括附件内容」，纯图片「请描述并分析这些图片」。问答入口负责默认提问与禁用仅检索/无模型/视觉未知或不支持时的保稿反馈。冻结引用、模型 tuple、推理与范围须早于任何异步准备。
- `Message.attachments` 仅恢复 user 消息上传的关联，assistant 的内部关联记录实际使用的上下文来源，不重复显示为上传卡；`protocolEvents` 仅为真实有序协议消息事件，由 TanStack SDK 重放，不能合成检索 trace。`modelSelection/retrievalScope` 保存当轮执行快照，历史重试不得读取当前 composer 设置。保存回答为笔记仅附名称及会话存续说明，原件不自动导入；来源仅取该回答自身的精确关联，不能按时间汇总此前全部附件；旧回答没有精确记录则不推断来源。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| 未认证 | 401 |
| 会话不存在、跨会话或跨 owner | 404 |
| 伪报大小/实际 multipart 超预算、单件/会话/整轮超限 | 413；正文预算 `ATTACHMENT_CONTEXT_BUDGET` |
| 不支持格式、损坏签名/容器、动画、非法 UTF-8、空文字/扫描 PDF、正文过长 | 可读取的 failed 元数据与具体原因；不派发模型 |
| 重用 operationId 但内容变动 | 409 `ATTACHMENT_OPERATION_MISMATCH` |
| 非 ready、过期、hash 不匹配、缺失原件 | 409 `ATTACHMENT_UNAVAILABLE/ATTACHMENT_EXPIRED/ATTACHMENT_HASH_MISMATCH` |
| 删除活动 queue/run lease 草稿 | 409 `ATTACHMENT_IN_USE`，先释放自身 lease |
| 取消/移除后准备迟到 | worker 终止，revision/记录条件拒绝发布；不会复活资源 |
| 存储删除失败 | 会话访问已撤销，garbage 保留并幂等重试 |

## 5. Good / Base / Bad Cases

Good：选择 UTF-8 文本和静态图片，服务器准备 ready，冻结 ID/hash 后问答；已发附件刷新可读、追问按真实资源重建。Base：旧会话无附件、无协议事件或模型快照，继续兼容原正文/引用/失败。Bad：客户端用知识库 documentId 伪造附件、用 blob URL 恢复历史，或无视觉模型丢图降级，均不能成为有效发送。

## 6. Tests Required

`apps/server/src/test/chat-attachments.test.ts` 覆盖实际 HTTP 认证、会话/owner、幂等、受保护原件、无 KB 副作用、UTF-8/伪格式/Office/PDF/扫描/图片/动画/超限、原件篡改、历史/失败保留、TTL/lease、迟到移除、重启与对象回收失败重试；实际无限 CPU Worker 验证终止及父线程可响应；续租后释放 lease 的旧清理候选仍须保留，分支排除的附件不能出现在新回答保存的笔记。`schema-parity.test.ts` 守两方言结构；`migration-journal-upgrade.test.ts` 用实际 SQLite 旧迁移和独立进程验证旧记录已应用、被跳过、被跳过但已有更新迁移三条升级路径及重复启动。模型 HTTP/SSE、窗口和保稿验证见模型服务/对话运行层测试；SQLite 通过不代表 PostgreSQL 已实际运行。

## 7. Wrong vs Correct

```ts
// Wrong: await Promise.race([extract(bytes), timeout]) // CPU 仍在跑
// Correct: isolated worker + deadline/abort + finally await worker.terminate()

// Wrong: model fetches clientContent.url, or KB uploadFile(file)
// Correct: validate same conversation ready resource + hash; read server bytes;
// bind the canonical ID to the persisted user message; call usage-accounted model.
```

迁移 journal 的时间修正必须同时处理已应用旧 hash，不能只把 when 改大导致 CREATE/ALTER 重跑。`runMigrations` 在现有日志中按旧 SQL 的精确 hash 修正已应用时间；若旧 hash 缺失但更晚迁移已安装，仅事务补跑该已知缺失迁移。全新库仍走正式 migrator，不能全表重建或吞掉其它错误。
