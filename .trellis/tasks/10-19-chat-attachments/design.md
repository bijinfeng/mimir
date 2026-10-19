# 官方聊天附件设计（规划）

## 分工与依赖

父任务10-18-interaction-chat负责完整Thread、官方依赖/默认CSS与Thread外宿主，共用prototype/v4呈现所有附件场景；本任务负责附件资源、官方AttachmentAdapter、模型上下文、持久化与生命周期。两任务的产品切换互为集成依赖：必须先证明AG-UI普通发送及queue前同步冻结接缝，附件真实链可用后才开放完整默认Thread。现在不改产品。

## 数据与处理链

1. ChatIo提供共享ensureConversation promise，发送或选择附件时取得同一真实ID；写URL不重挂载活动runtime。允许留下空会话，未发文件依草稿TTL清理，不暗删会话。
2. 独立受保护路由建议POST `/conversations/:id/attachments`（单文件multipart，uploadOperationId幂等）、GET状态、GET原件、DELETE未绑定草稿。通过requireAuth校验归属与真实会话；已发资源不能被composer remove误删。
3. 双数据库新增conversation_attachments及message_attachments关联；状态uploaded/processing/ready/failed，记录name/MIME/size/hash/object keys/parser版本/revision/过期/error。对象放`chat-attachments/<conversationId>/<attachmentId>/`，与vault/uploads隔离。activeStorage读写删复用统一后端，不能调用uploadFile的KB编排。失败对象有清理记录，不把数据库cascade等同对象已删。
4. bounded multipart先验实际字节，再验格式/容器/扩展和非空。纯extractText/parser可复用，OOXML解压预算照旧；不做OCR、重算或全版预览。准备并行2，状态可恢复或重启转可重试失败；取消使revision失效，丢迟到结果。30秒硬中止若需要worker隔离，不能靠Promise.race证明。
5. 官方add generator同id依次yield running和requires-action；错误yield incomplete/error/message，remove中止IO/注销临时URL/回收草稿，send验证ready并消费AbortSignal返回CompleteAttachment。原件或图片使用受控同源URL；图片必须规范化为绝对HTTP(S)同源地址（AG-UI0.0.68把相对image URL误作base64）；文档file带sourceType:url，文本不得以text attachment代替资源ref以免并入用户问题且丢tile身份。AG-UI恢复的附件序号ID不是服务端资源身份，独立保留canonical serverAttachmentId于可信绑定/runConfig；具体AG-UI url格式须真实HTTP往返验证，不能用不支持的sourceType:id或假base64。官方无Retry按钮，首版通过官方移除重选恢复，说明在宿主；官方document tile无下载，原件读取/下载及失效解释需在Thread外依据区承接。
6. 每次发送服务器解析runConfig/forwardedProps的附件IDs，校验同会话、ready、未过期、预算和真实原件hash，幂等绑定message。模型只读服务器提取正文/bytes；不得直接信任客户端content或让provider读取带Cookie的本地URL。

## 问答与历史

保留documentAgent优先路由及PPTX快照专用校验。标准附件首版不进入文档Agent编辑模式；该模式存在通用附件时发送前拒绝且保稿，让用户切回问答或移除。专用截图必须仍是已注册的单份PNG，通用文件不能冒名混用。普通chat允许已验证的会话附件，不能只移除IMAGE_AGENT_REQUIRED。修正lastUserQuestion纯text限制、无KB引用即只检索、KB专属system prompt、纯字符串模型输入、只text落库及无citations历史过滤。KB资料、附件资料、用户问题分开，模型调用继续走model.ts唯一usage记账入口。

默认提问与限额以PRD A3–A7为唯一政策来源，随v4审批。存在附件的仅检索、无模型或实际模型无视觉在派发前明确阻止；保留所有草稿/文件，不自动换模型或丢附件。仅附件可发送。已发附件可在同会话追问，每次按服务端资源及剩余上下文重新构造，超限要求缩小，不悄然截断。附件来源用独立ID在外部依据区呈现，文件名不造KB文档页；存笔记不联带原件永久导入。

## 队列与执行安全

冻结必须早于queue.enqueue/steer；普通onNew或composer send事件均不足。附件lease与已发message/queue/run引用分别计数，取消一项不删其他项正在用的对象。dispatch复核附件活性与模型，不在处理失败时偷偷仅检索；取回恢复文字/附件并保护新草稿。专用截图的来源/文档/页/版本/PNG与Agent缓存结果resume不改变；不注册第二套工具自动执行器。

## 生命周期与兼容

未发24小时、未绑定且无lease的准备失败/孤儿1小时、已发即使模型回答失败仍与会话共存；200MiB会话限额均为待审建议。删除会话先撤销读取/派发，再回收DB与storage，失败幂等重试/启动扫孤儿；缺失保留tombstone、明确拒重试读取。旧会话无附件自然兼容，禁止破坏性迁移旧消息。SDK仅必要最小升级并保留AG-UI中断补丁；移除新功能时回滚新adapter/路由/渲染切换，保留已发附件资料可读，不批量删对象。

详细源码/外部参考、版本、行号和局限见父任务research/chat-attachment-planning.md；WeKnora固定v0.8.3/2c0d838仅参考会话临时资源与预算，不照抄其UI、OCR/ASR和worker能力。
