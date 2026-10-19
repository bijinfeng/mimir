# 聊天临时附件设计（v6规划）

## 分工与依赖

父任务10-18-interaction-chat负责TanStack状态/连接、自有Thread/Composer及Mimir宿主，共用prototype/v6/review.html与interactions.html呈现附件场景；本任务负责附件资源、准备状态与发送适配、模型上下文、持久化与寿命。两任务产品切换互为依赖：必须先证明TanStack/AG-UI普通发送及队列/异步准备前冻结、Agent守卫与附件真实链，不能只有外观通过。现在不改产品。

## 数据与处理链

1. ChatIo提供共享ensureConversation promise，发送或选择附件时取得同一真实ID；写URL不重挂载活动runtime。允许留下空会话，未发文件依草稿TTL清理，不暗删会话。
2. 独立受保护路由建议POST `/conversations/:id/attachments`（单文件multipart，uploadOperationId幂等）、GET状态、GET原件、DELETE未绑定草稿。通过requireAuth校验归属与真实会话；已发资源不能被composer remove误删。
3. 双数据库新增conversation_attachments及message_attachments关联；状态uploaded/processing/ready/failed，记录name/MIME/size/hash/object keys/parser版本/revision/过期/error。对象放`chat-attachments/<conversationId>/<attachmentId>/`，与vault/uploads隔离。activeStorage读写删复用统一后端，不能调用uploadFile的KB编排。失败对象有清理记录，不把数据库cascade等同对象已删。
4. bounded multipart先验实际字节，再验格式/容器/扩展和非空。纯extractText/parser可复用，OOXML解压预算照旧；不做OCR、重算或全版预览。准备并行2，状态可恢复或重启转可重试失败；取消使revision失效，丢迟到结果。30秒硬中止若需要worker隔离，不能靠Promise.race证明。
5. 自有附件状态以同一UI ID呈现pending/ready/error，canonical serverAttachmentId独立保存。选择/准备维护AbortController，remove中止IO/回收临时URL/标记revision失效；发送前冻结引用并等待ready，取消则恢复原图文，不抹去新草稿。v4交互通过移除重选恢复，无额外Retry行为。file/image按TanStack兼容的AG-UI内容和服务端可信引用构造；旧react-ag-ui对相对image URL/base64的行为仅为迁移历史证据，不直接当成新SDK契约。正式wire必须用真实HTTP往返证明图片绝对同源受保护URL、file引用、canonicalID和历史一致，不能依赖SDK生成的消息或附件序号身份。原型fixture文本不是正式资源引用。
6. 每次发送服务器解析runConfig/forwardedProps的附件IDs，校验同会话、ready、未过期、预算和真实原件hash，幂等绑定message。模型只读服务器提取正文/bytes；不得直接信任客户端content或让provider读取带Cookie的本地URL。

## 问答与历史

保留documentAgent优先路由及PPTX快照专用校验。标准附件首版不进入文档Agent编辑模式；该模式存在通用附件时发送前拒绝且保稿，让用户切回问答或移除。专用截图必须仍是已注册的单份PNG，通用文件不能冒名混用。普通chat允许已验证的会话附件，不能只移除IMAGE_AGENT_REQUIRED。修正lastUserQuestion纯text限制、无KB引用即只检索、KB专属system prompt、纯字符串模型输入、只text落库及无citations历史过滤。KB资料、附件资料、用户问题分开，模型调用继续走model.ts唯一usage记账入口。

默认提问与限额以PRD A3–A7为唯一政策来源，随v6审批。存在附件的仅检索、无模型或实际模型无视觉在派发前明确阻止；保留所有草稿/文件，不自动换模型或丢附件。仅附件可发送。已发附件可在同会话追问，每次按服务端资源及剩余上下文重新构造，超限要求缩小，不悄然截断。附件来源用独立ID在外部依据区呈现，文件名不造KB文档页；存笔记不联带原件永久导入。

## 队列与执行安全

冻结必须早于任何异步准备与排队；不能在附件完成回调才读当前设置，也不能照搬已移除的assistant-ui facade接口。附件lease与已发message/queue/run引用分别计数，取消一项不删其他项正在用的对象。dispatch复核附件活性与模型，不在处理失败时偷偷仅检索；取回恢复文字/附件并保护新草稿。专用截图的来源/文档/页/版本/PNG与Agent缓存结果resume不改变；不注册第二套工具自动执行器。

## 生命周期与兼容

未发24小时、未绑定且无lease的准备失败/孤儿1小时、已发即使模型回答失败仍与会话共存；200MiB会话限额均为待审建议。删除会话先撤销读取/派发，再回收DB与storage，失败幂等重试/启动扫孤儿；缺失保留tombstone、明确拒重试读取。旧会话无附件自然兼容，禁止破坏性迁移旧消息。SDK按父任务exact TanStack版本迁移并重验原AG-UI中断语义；移除新功能时回滚发送适配/路由/渲染切换，保留已发附件资料可读，不批量删对象。

详细源码/外部参考、版本、行号和局限见父任务research/chat-attachment-planning.md；WeKnora固定v0.8.3/2c0d838仅参考会话临时资源与预算，不照抄其UI、OCR/ASR和worker能力。

## v6模型能力联动

父任务最新模型菜单改为按配置供应商分组选择，推理等级遵循该模型真实能力；不能继续把标准/深入路由到两种角色。附件发送、排队、重试须冻结providerId/modelId和合法推理设置，并与视觉/工具能力守卫共同校验；切换草稿模型不能改写已准备/排队附件的目标。能力未知不得当作支持。此修订随具体v6 HTML审阅，真实后端能力接通仍待实施。
