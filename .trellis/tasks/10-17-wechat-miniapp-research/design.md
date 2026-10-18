# 微信小程序首版技术方案（待最终审阅）

日期：2026-10-18。对应 [PRD](prd.md) R1–R6 / AC1–AC10。当前状态 planning，本文件是实施建议，不代表已实现、真机验证或可发布。

## 1. 约束与选择

- 仅一个自用、固定域名服务端；沿用单用户身份及当前知识库 / 目录 / 标签 / 文件体系。
- 建议新增 `apps/miniapp`，使用原生微信小程序 + TypeScript + WXML / WXSS。首版只面向微信，无跨端需求；WeKnora v0.8.3 原生实现证明这类轻客户端边界可行，但其功能和 SSE 处理不能直接照搬。
- 共享契约仍在 `packages/shared`，通过构建生成可供微信开发工具导入的代码，不能把 TS workspace 源码或 Node 模块直接当微信运行时依赖。`apps/miniapp` 使用精简入口和 type-only imports，构建不带入 Office / React / antd。具体构建器和 Markdown tokenizer 版本在第一阶段按兼容与包体积选定、锁定，不扩大产品范围。
- 复用服务层与检索通道。原生页面重新实现，浏览器 `fetch` / EventSource、React 组件、Tiptap / GenOffice 不进入小程序。
- 现有网页、桌面与 fnOS 保持兼容；新增合同按可选字段或专门的小程序路由引入，不放宽原业务接口鉴权。
- 最低目标基础库建议 2.20.2（分块请求所需），实际在开发工具和目标 iOS / Android 验证。低于目标版本明确提示升级，不能静默退回不可恢复的长等待。

## 2. 应用与服务边界

| 层 | 负责 | 不负责 |
|---|---|---|
| `apps/miniapp` | 页面、微信网络 / 下载适配、源文输入、正文阅读、草稿、恢复状态 | 模型密钥、直接读写 vault、索引计算、Office 引擎 |
| `packages/shared` | 范围、设备会话、版本、操作结果及必要 API schema / 类型 | 微信 API、DOM、数据库、密码校验实现 |
| `apps/server` | 账号校验、小程序授权、字段限制、持久化、读取、问答和操作结果 | 另建一套知识正文、让客户端自行决定权限 |
| `packages/core` / `plugins/leg` | 将范围传到召回查询、融合和引用装配 | 具体小程序页面与账号交互 |

小程序使用构建 / 部署配置里的单一 HTTPS API 地址，设置页只显示连接状态，不提供任意服务端转发。实际域名与 AppID 不写入研究资料、不硬编码测试私密数据。配置 request 和 downloadFile 域名；若无需 WebSocket / uploadFile 则不新增对应通道。

现有源码证据与版本见 [研究报告 §5](research/miniapp-product-research.md)。2026-10-18 复核发现 `updateNote` 已使用 `withDocumentPublication`，说明其他任务正在完善写入边界；实施时在这个现有入口增加版本检查，禁止创建另一把互不协调的写锁。

## 3. 页面与交互提案

2026-10-18 用户追加高保真原型评审，详见 [原型说明](prototype/README.md)。原型位于任务目录，采用浏览器内手机预览壳和模拟数据；正式客户端仍按原生微信 TypeScript 方案，不把原型的 React 运行时带入小程序。当前交互均为评审提案，原型反馈收敛后才进行最终实施确认。

三个主入口“问答 / 知识库 / 我的”；链接收集从知识库的显式入口进入。

- **问答**：全库 / 当前库范围可见，新问题与历史；引用片段先在轻面板中核对，再打开正文。“问这篇”从文档详情进入，并固定 documentId。
- **知识库**：库列表 → 目录 / 文档列表 → 阅读详情；长列表分页，标签选择复用已有标签。当前库选择与问答范围不能靠 UI 文案暗示。
- **编辑笔记**：独立编辑页，Markdown 源文与预览切换，少量常用插入动作，显式保存。移动布局参考 Obsidian 的阅读 / 编辑状态区分；不在首版加入完整快捷工具栏定制。
- **链接入库**：URL、目标库 / 目录、提交、结果。没有真实阶段事件时仅显示“正在获取资料”，不能伪造抓取分阶段进度；完成后展示服务端实际 stages 与部分失败信息。
- **我的**：实例状态、当前账号、退出。登录使用既有邮箱 / 用户名密码，不增加注册入口、微信身份绑定或模型设置。

会话在创建时固定范围。范围切换会新开会话，历史读取原范围。旧会话未存范围字段时显示“旧会话（全库）”；不能把旧数据误标为某个新选择的库。

## 4. 登录与权限

建议提供专用 `/api/miniapp` 路由组，使用独立的小程序设备凭证，不把凭证扩展成现有 `/api/*` 的全权通行证。

1. `POST /api/miniapp/auth/login` 接受有界 identifier / password，复用现有用户名解析和 Better Auth 密码校验，不重写密码哈希、不创建用户。通用错误避免枚举账号，按现有 HTTP 错误封装返回。
2. 校验成功签发高熵 opaque token；数据库只存 token 哈希、ownerId、创建 / 过期 / 撤销时间，原始 token 仅在登录响应交付。建议固定 30 天有效期，不做无期限 bearer。设备退出时撤销该 token；所有者改密 / 会话撤销策略需与 Better Auth 一致并写回测试。
3. 除登录外，小程序 API 统一验证 token，填入可信 owner 上下文。允许的动作仅为 R1–R6；不允许借此访问配置、密钥、Office Agent、原件替换、删除库或维护接口。
4. `POST /api/miniapp/auth/logout` 撤销当前设备凭证。退出清理正文 / 临时文件和草稿所在账号的本地可访问状态；未保存草稿在退出前明确提醒，可先保存或主动放弃。
5. 业务请求通过 header 传 token，不放 query、URL、日志和引用文本。鉴权下载同样验证设备凭证，不能将原件或私有图片放到公共静态目录。

需补 SQLite / PG 对等的设备凭证表与迁移。账号密码只在 HTTPS 登录请求中传送，不保存密码；不需要微信 AppSecret。若复用 Better Auth 时遇到来源校验，应使用受信的服务端 API 调用或明确入口适配，不能开放任意 trustedOrigins / 关闭原 CSRF 防护。

## 5. 建议合同与更新方法

路由名为实施目标，可在符合现有约定时微调；行为和鉴权边界必须保持。

| 路由 | 用途 | 核心输入 / 输出 |
|---|---|---|
| `POST /api/miniapp/auth/login` / `auth/logout` | 设备登录 / 撤销 | identifier、password；有限权限 token、过期时间、账号摘要 |
| `GET /api/miniapp/folders` / `tags` | 组织和选择 | 复用 `FolderNode` 和标签形状 |
| `GET /api/miniapp/documents` | 目录内分页浏览 | folder、tag、limit、offset；摘要列表 |
| `GET /api/miniapp/documents/:id` | 阅读与编辑基线 | 文档详情 + opaque `revision` + 正文可编辑能力，不发送运行时文件系统绝对路径 |
| `GET /api/miniapp/documents/:id/file` | 鉴权下载原件 | 与既有文件服务共用读取 / Content-Type / 大小限制，不能复制不受控的公共文件入口 |
| `GET /api/miniapp/search` | 搜索资料 | q、mode、scope；与既有搜索响应一致 |
| `POST /api/miniapp/chat` | 只读问答流 | requestId、question、conversationId?、scope；SSE 生命周期、引用、回答与失败 |
| `GET /api/miniapp/conversations` / `:id` | 历史与恢复 | 会话列表 / 消息、范围及状态；列表分页，不能无限拉全量 |
| `POST /api/miniapp/notes` | 新建笔记 | requestId、title、body、tags、folder |
| `POST /api/miniapp/documents/:id/update` | 手动更新 | requestId、expectedRevision、白名单字段；新 revision 或 409 |
| `POST /api/miniapp/documents/:id/append` | 追加笔记 | requestId、expectedRevision、追加文本；由服务端读当前内容并追加 |
| `POST /api/miniapp/messages/:id/note` | 回答沉淀 | requestId、目标 folder；保留引用且不重复保存 |
| `POST /api/miniapp/capture` | URL 收集 | requestId、url、folder；操作 ID 与状态 |
| `GET /api/miniapp/operations/:id` | 恢复 / 查重 | 已完成结果、失败、处理中或结果不确定 |

微信文档的合法方法列表未列 PATCH，专用更新入口用 POST，调用同一个受保护服务层。现有 PATCH 不移除。服务端必须按文档 kind 校验 body 可写性，拒绝额外字段；小程序聊天请求不能透传客户端 `documentAgent` / 任意 AG-UI 工具参数。

## 6. 检索范围与长文问答

建议共享判别联合：`{ type: 'all' } | { type: 'folder', path } | { type: 'document', documentId }`。folder 含该目录子树、必须存在；“技术”不能匹配“技术栈”，转义 `%`、`_` 等字面字符。不依据库短码推断未验证路径。

贯穿数据流：API schema → search / assistant service → `SearchRequest` → `LegContext` → keyword / substring / vector 的 PG、SQLite 查询 → 融合 → 正文 / 相邻分块装配 → 引用 → 模型上下文。

- 范围在每条通道的排序 / LIMIT 之前过滤；加密文件标题搜索等兜底也要同样过滤。融合后再校验一次，防止相邻装配、标题兜底或已变化文档突破范围。
- 单篇问答不再截取前 1200 字作为全部资料：使用该文档的相关分块，沿用上下文预算、每篇上限和真实字符偏移。全文扫描不直接塞进模型。
- 未命中、文件无可提取正文、范围删除或移动时返回明确状态，不能 fallback 到全库。
- 非流式 `ask` 与流式路径共用同一检索准备逻辑，避免两份范围行为；现有无新范围字段的客户端保持兼容。
- 单篇历史可使用同篇已验证上下文；范围变更新开会话。后续读取引用时核对 snippet 和偏移，源文变化时提示，不能假装旧位置仍准确。
- 现有外部文件编辑后的读取不更新索引（`services/documents.ts:getDocument`）。若真实源文与索引不一致，明确说明源文已变化 / 待同步，不根据过期分块生成确定答案，不在 GET 请求内暗做重建。小程序自身写入仍走正常分块 / 索引流程。

## 7. 正文编辑与冲突

普通 `noteUpdateSchema` 当前没有客户端基线；现有进程内串行写只能保证写入顺序，不能判断“用户改的是不是旧版本”。

- 服务端返回 opaque revision，由真实可编辑内容和元信息计算。对笔记应覆盖当前源文件状态 / frontmatter，不能仅依赖数据库 updatedAt 或下载文件的弱 ETag。
- 小程序更新和追加必须提供 expectedRevision。在当前文档 publication / update 锁内重新读取并比较，再开始改名 / 文件写入 / 数据库更新；不一致返回 `409 DOCUMENT_CONFLICT`，不做部分修改。
- 复用现有 `updateNote` 及文件先于数据库的写顺序。不能新增绕过 publication 锁的直写路径；失败不能对客户端谎报全部成功。
- 元信息修改不把客户端旧正文回传；未提交字段保持当前值。抓取件与上传件只允许元信息字段，body / sourceKey / 状态维护字段禁止写入。
- 未改动的 Markdown 按字符串保留；预览是派生显示，不把 HTML 再序列化回正文。源文行尾和高级语法无改动往返应有专门测试。
- 草稿按 instance / owner / documentId 隔离，包含基线 revision 与最后编辑时间。保存成功后回读新 revision，再清理对应草稿；失败、退出前提醒和冲突均保留可恢复状态。
- 冲突提供“保留草稿并重载”和“另存为新笔记”，不做静默自动合并或无提示强制覆盖。
- 外部编辑器不遵守应用锁，无法承诺分布式协作级锁定；至少检测读取后已发生的源文变化及发布前变化。首版验收是电脑端和小程序的应用内保存冲突，外部工具的并发能力如有实质限制要如实记录。

## 8. 流式与重复操作

`wx.request({ enableChunked: true })` + `onChunkReceived`；增量 UTF-8 解码跨块汉字 / emoji，按 SSE 空行缓存完整事件后解析，处理 CRLF、多行 data、错误和结束事件。现有 AG-UI / 自定义引用事件可复用，不能照 WeKnora 小程序等整段返回才解析或仅累加 answer。

业务操作使用客户端稳定 requestId，服务端记录账号 / 设备、请求指纹、操作类型、状态与结果。相同 ID + 相同参数返回原操作；相同 ID + 不同参数拒绝。会话提问、创建 / 追加、更新、回答存笔记、链接收集都需防重。

- 草稿编辑是本地状态；提交之后先登记操作，成功才显示保存 / 入库完成。捕获请求返回 202 后用短时、按前后台节流的结果查询读取完成状态；复用现有捕获服务，不为此建通用分布式任务平台。
- 进入后台或断网时保留 operationId / conversationId，不自动重新提问。回前台查操作状态并读历史，流已结束时显示落库结果。
- 不承诺服务器重启后透明续跑。进行中的操作在进程恢复后标记为中断 / 结果不确定，不自动重执行；提示刷新相关文档或库确认，再由用户主动发起新操作。不能因缺少完成回执而重复写文件。
- 问答已落库的最终消息优先于本地增量；未收到结束事件不能直接标成功。若流中断只保存了部分内容，要标为中断，禁止当完整回答保存沉淀。
- 保存回答保持既有 messageId 的已保存笔记关系；首次选择目标 folder，重试返回同一 noteId。已经保存后再选其他库，提示原笔记位置，不静默复制。

## 9. 阅读与文件

- Markdown 解析成受控小程序节点；不执行 HTML / JS，不用 web-view 执行资料正文。普通链接、双链、代码和表格需有可操作的移动表示，高级块可保留源码。
- 受保护文件通过 token header 下载到临时路径，检查实际 HTTP 状态后打开，不能把 401 JSON 当文档。按当前文件后缀 / MIME 调用 `wx.openDocument`；失败显示可重试原因。
- 图片优先使用可取得的本地临时路径；当前抓取服务 `services/capture.ts:143–145` 仍可能保留原链接，不能假设图片已本地化。公众号防盗链、域名限制或外链失效时显示占位和来源，不承诺离线可看。
- 不建立通用任意 URL 文件代理；若确需资源接入，只能使用经过来源和协议限制、权限校验的资源服务，另做 SSRF / 类型 / 大小验证。
- PDF / Office 引用偏移属于提取正文，没有原件页坐标；核对片段与原件查看分开，不能伪造页码。

## 10. 兼容、风险和退出路径

- 设备 / 操作记录及会话范围元信息需双数据库迁移；新增能力默认不改变既有 API 的权限 / 请求字段要求。迁移为增量，新客户端部署可回滚而不删除知识数据。
- 用部署开关控制小程序专用入口，关闭后旧网页 / 桌面仍能工作。回滚时撤销小程序设备 token，不移除 vault、uploads 或用户新写入的内容。
- API 范围和并发字段横跨多个包，按实施计划串行落地；当前工作区有其他会话修改，合并前复核现有 publication、索引和 UI 变化。
- AppID、实际固定域名、HTTPS / ICP、主体类目、当前 AI 服务及隐私 / 发布要求、iOS / Android 真机权限尚未提供或验证。先做离线开发和自动验证可推进，正式发布及真机验收不能据此声称完成。
- 交互提案中的账号密码登录、Markdown 源文 / 预览和固定会话范围随最终摘要一起审阅；如果用户改动它们，应同步修改 PRD 和实施计划后再开始代码。
