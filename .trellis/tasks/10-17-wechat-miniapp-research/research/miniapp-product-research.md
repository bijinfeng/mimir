# Mimir 微信小程序端：产品范围与可行性调研

核对日期：2026-10-17，Asia/Shanghai。决策更新：2026-10-18。状态：调研及产品范围收敛完成，完整规划待最终审阅，任务保持 `planning`。本报告保留研究依据，最终行为以 [PRD](../prd.md) 为准，技术与执行安排见 [design.md](../design.md) 和 [implement.md](../implement.md)，尚未获得实施批准。

## 1. 结论

建议把首版定位为 **Mimir 的随身知识入口**，服务“找到已有资料 → 带引用地问答 → 核对原文 → 轻量沉淀或整理”这条闭环。

- 检索问答值得作为核心能力，必须同时保留“只搜索资料”和“生成回答”，避免每次查找都调用模型。
- 预览方案已获用户接受（2026-10-18）：小程序内阅读笔记 / 网页正文和引用片段，PDF / Office 原件通过微信文档查看器打开；接受离开当前阅读页、不能保证原件跳到引用页的边界，不提供原件批注或编辑回写。
- 有限编辑已由用户确认 B 档（2026-10-18）：标题、标签、归属目录，笔记追加 / 创建、答案存笔记及已有 Markdown 正文小改，并提供预览、草稿保留和多端保存冲突提示。Office 原件编辑后置；全量富文本往返仍不建议首发。
- AI 职责已确认 A 档（2026-10-18）：检索问答及用户主动保存回答；不纳入辅助改写或 Agent 自动修改笔记，正文由用户手动编辑。
- 当前文档问答已确认纳入（2026-10-18）：包括长文相关段落检索，回答范围不自动扩大到其他文档。
- **连接模型已确认：自用、固定实例。** 2026-10-18 用户说明项目目前主要服务自己，并将部署稳定域名的服务端；公开分发给任意自托管用户和统一托管不纳入首版。

这项工作有可复用的服务端基础，但需要独立的小程序交互层和少量跨端服务合同，不能按“把现有网页缩窄”估算。

## 2. 证据范围与可信度

本轮进行了当前工作区源码检查、微信官方文档获取、WeKnora 官网及固定版本源码检查、Obsidian 官方帮助源码检查，以及 Google Docs / Word 网页版官方帮助与固定 GenOffice 源码检查。没有运行竞品登录态产品，没有使用微信开发者工具或 iOS / Android 真机，没有提交小程序审核，也没有改产品代码或运行模型。

Mimir 证据来自 `codex/all-pages-polish` 分支、基准 HEAD `2cd165f` 及当前未提交工作区；工作区正在发生其他修改，源码行号是本轮读取时的锚点，不代表已发布版本。新端实施前应复核。

原始响应的获取记录、SHA-256 和保留证据文件见 [sources/manifest.json](sources/manifest.json)。HTML 保留为正文文本快照，避免保存重复导航和脚本；下载响应哈希与正文快照哈希分别记录。部分 GitHub raw 请求超时后改用 GitHub Contents API 成功读取固定版本，不将失败写成成功。文档证据不等于真机兼容性证明。

## 3. 直接参考：WeKnora 已有小程序，但范围更小

### 版本与事实

- [WeKnora 官网](https://weknora.weixin.qq.com/) 本轮 HTTP 200，页面显示 `v0.8.3`，说明混合检索、回答来源引用及原文引用定位，并把“微信对话开放平台”列为微信场景入口。这个链接不能证明其开源小程序已经具备同等功能。
- [公开 release v0.8.3](https://github.com/Tencent/WeKnora/releases/tag/v0.8.3) 发布于 2026-10-14；Git tag 对应 commit `3e22822c1d2397be730c458c7539d0eb8c113a24`，本轮通过 GitHub API 核实。
- [小程序 README](https://github.com/Tencent/WeKnora/blob/v0.8.3/miniprogram/README.md) 列出：配置 API 地址与 tenant API Key、中英文、列出并选择知识库、URL 入库、向选中知识库提问。
- [客户端文档](https://github.com/Tencent/WeKnora/blob/v0.8.3/website-docs/05-clients/04-miniprogram.md) 与 [app.json](https://github.com/Tencent/WeKnora/blob/v0.8.3/miniprogram/app.json) 确认三个原生页面：知识库、问答、设置。代码是微信原生小程序，无 Taro / uni-app 运行时依赖。
- [request.js:4–34](https://github.com/Tencent/WeKnora/blob/v0.8.3/miniprogram/utils/request.js#L4-L34) 使用 `wx.request` 和 `X-API-Key`；[第 61–70 行](https://github.com/Tencent/WeKnora/blob/v0.8.3/miniprogram/utils/request.js#L61-L70) 将选中库写入 `knowledge_base_ids`。
- [chat.js:71–90](https://github.com/Tencent/WeKnora/blob/v0.8.3/miniprogram/pages/chat/chat.js#L71-L90) 等待完整请求返回，再调用 `collectAnswerFromSSE`；[sse.js:25–35](https://github.com/Tencent/WeKnora/blob/v0.8.3/miniprogram/utils/sse.js#L25-L35) 只累计 `response_type === "answer"` 的内容。因此“服务端使用 SSE”不等于“小程序逐字流式展示”。
- 上述页面与四个业务 API 未覆盖文档列表阅读、原件预览、编辑保存、结构化引用交互和会话历史浏览，不能据此声称这些已经可用。
- [Agent 工具定义:14–19、71–72](https://github.com/Tencent/WeKnora/blob/v0.8.3/internal/agent/tools/definitions.go#L14-L19) 区分 `search_knowledge` / `read_document` 与 Wiki 写入工具。可参考检索、阅读、写入的职责边界，不能推导小程序已经接通这些写工具。

### 对 Mimir 的适用性

可借鉴“连接已有服务、明确当前库、轻客户端”的产品切分。Mimir 应补上用户明确提出的阅读与有限编辑，并保留自己的引用结构和历史。不要照搬 tenant API Key：Mimir 当前没有这套认证，租户体系也与单用户定位不同。

WeKnora 的自填 baseUrl 仍要求发布者配置 request 合法域名，其 README 明确写出这一点。它没有绕过微信正式版域名规则。其编辑器不作为 Mimir Office 工具栏的主参考。

## 4. 微信平台边界及产品后果

| 已核实的官方合同 | 对产品范围的影响 |
|---|---|
| [网络](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)：需预设 request / upload / download / socket 通讯域名，常规域名采用 HTTPS / WSS、需 ICP 备案；不能直接填写 IP 或 localhost；基础库 2.4.0 起另有同局域网非本机 IP 的例外 | 自用固定域名可做；一个公开小程序任意直连所有用户私有地址不能直接承诺。局域网是受限场景，不等于随时随地访问，也不能把它误写成完全不可用 |
| 同页：有效、系统信任且链完整的证书；iOS 不支持自签名；开发工具可临时跳过域名 / 证书校验 | 上线验证必须关闭跳过校验，不能用开发环境连通代替正式版可用 |
| 同页：默认超时 60 秒、HTTP 类最大并发 10；进入后台 5 秒未结束的网络请求可能被中断 | 锁屏、切聊天、微信退后台时要显示中断状态；回前台读取已落库消息，不能把网络重试当成重新提问。长任务是否后台继续及如何恢复，需另定服务合同 |
| [wx.request](https://developers.weixin.qq.com/miniprogram/dev/api/network/request/wx.request.html)：`enableChunked` 从 2.20.2 支持；[onChunkReceived](https://developers.weixin.qq.com/miniprogram/dev/api/network/request/RequestTask.onChunkReceived.html) 从 2.20.1 支持，返回 ArrayBuffer | 真流式可行，但需增量 UTF-8 解码和 SSE 事件缓冲，处理中文跨块、半个 JSON、结束和失败事件；不能直接复用浏览器 EventSource / fetch reader |
| `wx.request` 官方 `method` 合法值未列 `PATCH`，当前列 GET / POST / PUT / DELETE 等 | Mimir 笔记和目录更新恰用 PATCH。需设计受控的 POST / PUT 更新入口或适配层，再真机验证；不能把现有客户端请求函数原封不动搬过去 |
| [wx.openDocument](https://developers.weixin.qq.com/miniprogram/dev/api/file/wx.openDocument.html)：打开本地文件，列出 doc / docx / xls / xlsx / ppt / pptx / pdf；[downloadFile](https://developers.weixin.qq.com/miniprogram/dev/api/network/download/wx.downloadFile.html) 可带 header 获取临时文件，单次下载上限 200 MB | 可采用“鉴权下载 → 微信原件查看器”。它没有定义修改字节回传、指定引用段落或页码定位合同；查看与编辑须分别立项。Mimir 现有上传仍受自身 50 MiB 上限约束 |
| [editor](https://developers.weixin.qq.com/miniprogram/dev/component/editor.html)：内部 delta，导出 HTML / text，支持部分 HTML，不支持 class / id，并会改写部分标签 | 不提供 Markdown 保真保证。直接 HTML→Markdown 往返可能损失表格、数学、双链或高级块；“基础富文本”不是无成本选项 |
| [web-view](https://developers.weixin.qq.com/miniprogram/dev/component/web-view.html)：自动铺满页面、个人类型暂不支持；普通网页需配业务域名，message 仅在返回 / 销毁 / 分享等时机触发 | 不把现有 Office 网页套壳当通用首版方案；主体、业务域名、页面布局与登录桥接均需单独验证 |
| [登录流程](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html)：wx.login 取得 code，服务端换 OpenID / session_key，业务方另建登录态 | 微信身份不自动等于 Mimir 所有者身份；必须显式绑定现有账号。AppSecret 和 session_key 不下发客户端 |
| [chooseMessageFile](https://developers.weixin.qq.com/miniprogram/dev/api/media/image/wx.chooseMessageFile.html)：由用户从客户端会话选择文件 | 后续可提供主动导入微信文件，不能描述为后台自动读取聊天记录、任意转发即入库或自动收集公众号全文 |
| [分包](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages.html)：主包 / 单分包 2M；总分包 30M，服务商代开发 20M | 不打包整套桌面编辑器；后续能力按阅读、编辑等场景拆分。不能沿用过时的“一律总包 20M”作为本轮事实 |

发布仍有尚未验证的外部前提：实际 AppID 主体、可选服务类目、小程序备案及当前 AI 问答相关资质 / 内容 / 标识要求、隐私指引和第三方模型数据流披露。上述事项要按真实主体在微信公众平台核对；本轮未访问主体后台，不能断言“个人主体一定能发 AI 问答”或“所有场景都必须取得某一种特定许可”。不承诺开发工具演示等于可公开发布。

## 5. Mimir 现有能力与缺口

| 场景 | 当前证据 | 可复用与需要补齐的部分 |
|---|---|---|
| 定位与知识库 | `.trellis/spec/project/product.md:3–25`：单用户自托管；`packages/shared/src/structure.ts:14–45`：顶层目录代表知识库，path 是身份，code 是别名 | 沿用现有库和目录，不引入租户数据模型。切换库后的检索、会话和草稿归属必须明确；目录改名会影响路径标识 |
| 登录 | `apps/server/src/auth.ts:21–81,139–146`；`middleware/auth.ts:28–51`；`routes/auth.ts:38–85` | Better Auth 所有者会话 cookie 和桌面本地 cookie；没有微信账号绑定或小程序 API Key / bearer 通道。现有浏览器登录可作为技术验证候选，但 Cookie 管理、来源检查、过期和下载鉴权都要验证，不能放宽现有鉴权来适配 |
| 列表与文档 | `routes/documents.ts:39–77`；`packages/shared/src/documents.ts:166–176` | 已有详情、目录、标签、offset 分页和 folder 子树列表过滤；适合浏览与阅读。小程序需独立状态管理和交互 |
| 搜索 | `packages/shared/src/search.ts:17–24`；`apps/server/src/search/index.ts:35–42` | 支持关键词 / 语义 / 混合、kind、tag；**没有 folder / kb 范围参数**。不能先搜全库取 top-N，再在手机上按库过滤，否则既漏结果也破坏范围语义 |
| 问答与历史 | `packages/shared/src/conversations.ts:46–56,128–138`；`routes/conversations.ts:1139–1218`；`services/assistant-stream.ts:369,421–425` | 已有非流式 ask、AG-UI SSE、会话历史和真实字符区间引用。需要小程序传输适配、后台中断处理，以及知识库范围的端到端过滤 |
| 单篇问答 | `services/assistant.ts:142–172`、`services/assistant-stream.ts:123–145`；常量 `PER_CITATION_CHARS=1200` | 当前单篇路径截取正文前 1200 字；不能直接宣传“问整份长文档任意段落”。建议首版先完善按问题选取单篇相关分块，并验证长文尾部问题；否则需暂缓该入口 |
| 引用定位 | `packages/shared/src/conversations.ts:46–56` | 有 documentId / snippet / start / end，没有原件页码与坐标。小程序原生正文可定位或回退片段；微信 PDF / Office 查看器不能承诺跳到相同页。文档改后偏移可能失效，需要验证片段并提供提示 |
| 笔记 / 元信息更新 | `packages/shared/src/documents.ts:76–84`；`routes/documents.ts:74–77`；`services/documents.ts:185–310` | 现有 PATCH 可提交标题、正文、标签、目录。写路径有进程内串行锁，但普通 schema 没有 expectedVersion / If-Match；旧手机草稿仍可能覆盖电脑新内容。应补乐观并发条件与冲突响应，并在服务器限制小程序可改的对象和字段 |
| 回答沉淀 | `routes/conversations.ts:1148–1152`；`services/conversations.ts:223–253` | 已保留来源并按消息返回已保存笔记；但 saveNoteInput 只有 messageId，创建时未带 folder。小程序若承诺存入当前库，要补明确目标库合同，避免生成无归属笔记；并发与重复请求仍需验证 |
| 原件 | `routes/files.ts:38–200` | 已有上传、替换、鉴权下载和单段 Range。文件 ETag 是下载缓存用途，不是笔记写入并发保护；两者不能混用 |
| Office 与聊天界面 | `packages/renderer/src/components/document/FilePreview.tsx`、`OfficeSourceEditor.tsx`；`packages/chat/src/index.ts:1–38` | React、antd、DOM / 浏览器编辑引擎，不是可直接运行于小程序的组件。共享 schema、服务合同和纯工具可复用，界面与传输适配需另做 |

补充：笔记和上传原件以文件为真相，检索索引是派生层（项目 architecture §2）。手机编辑仍必须走现有服务端写入 / 分块 / 索引链路。手机离线不能访问服务器检索；“模型不可用时仍能搜”只表示手机到 Mimir 服务仍可达。

## 6. 建议的首版范围

### P0：解决日常使用闭环

| 模块 | 建议纳入 | 边界 |
|---|---|---|
| 连接 | 一个固定实例、验证连接状态、现有账号登录、退出 | 自用固定实例已确认；账号密码与设备凭证方案随最终规划审阅，手机不配置模型供应商密钥 |
| 找资料 | 浏览已有库和目录、按库 / 全库搜索、标题 / 摘要 / 命中片段 | 当前库搜索依赖服务端补过滤；搜索不自动消耗模型用量 |
| 问答 | 全库、指定库及当前文档提问、追问、逐步显示回答、历史、来源卡片；当前文档问答已确认 | 范围需明确，不静默扩大；未配置模型 / 超时可转只检索。单篇问答须先解决长文截断 |
| 阅读 | Markdown / 网页提取正文、图片、来源信息；常见文件交给微信原件查看器 | 复杂块不能正确渲染时保留原文或明确提示；扫描件无文本不冒充可检索。原件版式由查看器决定 |
| 有限整理 | 改标题、标签、移动到已有目录 | 只做单篇动作；没有批量移动 / 删除库 / 复杂目录重组 |
| 轻量沉淀 | 新建短笔记、答案存笔记并选目标库、向笔记追加内容 | 保存需明确成功 / 待保存 / 冲突，允许返回阅读后确认结果；追加也需服务端并发策略，不能读旧全文后直接覆写 |
| 笔记小改 | 已确认纳入：修改已有 Markdown 笔记正文，提供预览、草稿保留、冲突提示；建议用源文编辑与显式保存 | 保留未编辑语法。抓取正文和 Office 提取正文不开放覆写；具体编辑交互仍需设计 |
| 链接收集 | 2026-10-18 已确认纳入：粘贴网页 / 公众号 URL，选择目标知识库并提交入库 | 复用服务端抓取；明确处理中、成功和失败，失败保留链接以便重试，不承诺所有公众号文章可抓取 |

2026-10-18 用户已选择 B 档：在 A 档元信息 + 新建 / 追加的基础上增加已有笔记正文小改，保真与多端冲突验证为必需。Office 原件编辑不在首版范围。此决定不等于已批准具体编辑器或技术实现。

### P1：使用闭环稳定后增加

- 用户主动选择微信会话文件上传：进度、大小限制、解析状态、重复导入策略明确。
- 图片 / 拍照入库，以及 OCR：OCR 是现有产品非目标，需要另行确认服务、成本与隐私后立项。
- 段落改写建议、确认后写入、有限的表格和代码块快捷输入；单篇长文问答已提升到首版。
- 最近阅读、收藏或离线阅读缓存：现有产品不一定已有持久字段，不能全当免费复用。

### 建议暂缓

DOCX / XLSX / PPTX / PDF 原件编辑、完整 Tiptap / Office 工具栏、跨端实时协作、全文离线检索、语音 Agent、全局模型配置、索引维护、批量破坏性管理、公开分享 / 多用户权限。它们分别牵涉编辑引擎、同步、平台能力或既有单用户产品定位，不是“小程序有限编辑”的自然附带项。

## 7. 预览与编辑应如何区分

| 内容 | 首版阅读建议 | 首版写入建议 |
|---|---|---|
| Markdown 笔记 | 原生正文，保留代码 / 表格等必要阅读能力；不支持的高级块明示 | 标题 / 标签 / 目录、新建 / 追加及已有正文小改已确认；禁止静默把复杂笔记降成富文本 |
| 网页 / 公众号 / GitHub | 已入库正文和来源；图片优先使用可取得的本地资源，当前抓取也可能保留外链，失败需提示 | 元信息可改，正文保持来源资料语义；需要改写时另存笔记 |
| PDF / Office | 引用片段用于核对语义，“打开原件”进入微信查看器 | 元信息可改；不覆写提取文本、不提供伪保存入口 |
| 图片 | 鉴权下载后使用本地临时路径预览 | 元信息；图片编辑 / OCR 后续评估 |
| 暂不支持的文件 | 元信息、已提取正文或明确的无法预览提示 | 元信息；不因无法预览判成空文件 |

引用点击应先提供命中片段和上下文，再允许打开完整正文或原件。来源变化 / 删除时解释并保留历史引用片段；不要将旧字符偏移直接当新文档中的准确定位。临时文件、图片和正文缓存应按实例 / 账号隔离并有退出清理策略。

## 8. 移动交互参考与初步结构

布局和视觉的主要参考为 [Obsidian Mobile 官方帮助](https://help.obsidian.md/mobile)。官网此次返回客户端加载壳，已另通过其公开帮助仓库获取 `en/Getting started/Mobile app.md`，Git blob `df3a1675147aa86380ea9af33e9c63ad484b397c`；帮助文档没有标客户端版本，本轮没有运行 Obsidian App。其内容明确：编辑时底部工具栏、可配置常用动作、非编辑时导航栏，移动端不显示桌面 Ribbon，将动作放入菜单。

适用于 Mimir 的原则是：手机聚焦一个任务、阅读与编辑状态明显区分、键盘出现后保留少量常用动作。不要复制桌面的三栏或把所有命令挤进一条横向工具栏。首版不需要照搬 Obsidian 的工具栏自定义系统。

候选信息结构为“问答 / 知识库 / 我的”，当前库选择器连接搜索与问答；历史从问答页进入，笔记从知识库进入。阅读详情独占页面，整理用轻菜单，正文编辑单独页面，避免微信键盘挤压嵌套侧栏。这是研究建议，不是已评审的 UI 设计。

文件编辑继续使用正确的参考边界：[Google Docs Android 官方帮助](https://support.google.com/docs/answer/7068618?hl=en&co=GENIE.Platform%3DAndroid) 明确通过 Edit 进入编辑；[Word for the web 官方帮助](https://support.microsoft.com/en-us/office/foundations-experiences/show-or-hide-the-ribbon-in-office) 提供 Classic / Single Line Ribbon；[GenOffice 固定版本](https://github.com/genspark-ai/genoffice/tree/480548fd55f1be3593ee0d8e316a734751d58309) 与本地 vendor commit 一致，本轮重新读取 `apps/docs/src/renderer/components/Ribbon.tsx`，保留其格式 / 上下文命令划分的参考价值。前两者为在线文档、无应用版本号，GenOffice 为固定源码，均不等于微信小程序可复用这些编辑器。

## 9. 连接模型：已选择自用固定实例

2026-10-18 用户确认“这个项目目前主要服务于我，我会部署一个稳定域名的服务端”。据此选择下表 A 的自用固定实例方向；用户尚未确认 AppID / 主体及发布路径，不将这些当作已具备。其余方案保留为此前比较证据。

| 方案 | 适用 | 代价与边界 |
|---|---|---|
| A. 自用、一个固定 Mimir 实例与自有小程序 AppID | 自己日常使用，最适合验证首版闭环 | 配自己的合法域名和 HTTPS；仍需实际主体 / 类目和发布验证。NAS / 桌面本地实例必须有可达服务，电脑休眠后不能照常问答 |
| B. 每个自托管用户自行导入并发布小程序 | 面向愿意配置 AppID、域名的技术用户，保持实例数据直连 | 客户端可开源复用，但每个人都承担平台配置成本；不是扫码即用的公共客户端 |
| C. 一个公开小程序连接不同自托管实例 | 分发体验好，符合“用户填地址就用”的期待 | 需要统一域名接入服务、实例注册与授权，通常还需反向连接 / 网关。网关可能接触知识数据，带来托管、隔离、访问控制和运维责任，必须单独评估，不做任意 URL 转发器 |
| D. 统一托管 Mimir 服务 | 普通用户开箱即用 | 改变当前单用户自托管边界，要新增用户隔离、存储、计费或配额、运维等产品能力，不视为本任务默认范围 |

推荐先用 A 验证；若目标明确是公开分发给其他自托管用户，应先规划 C 或 B，不能把 A 当成最终产品交付方案。移动 Web 可作为任意自托管地址的并行访问方式候选，但不能代替用户提出的小程序目标。

研究早期曾考虑“网页生成短时配对码 / 二维码 → 可撤销设备凭证”。范围收敛后，为自用固定实例减少配对界面和微信身份绑定依赖，最终技术提案改为复用既有账号密码校验并签发小程序专用设备凭证，随最终规划审阅。凭证范围应由服务器控制为所需读写动作，不能依赖小程序隐藏按钮；模型密钥不进客户端，不能拿桌面的本地模式令牌作为远程通道。

## 10. 技术路线建议与验证顺序

本节保留路线比较依据；最终提案采用原生 TypeScript，见 design.md，尚待完整方案批准，不承诺工期：

- 小程序只有一端且首版克制时，原生 TypeScript 小程序是直接路线；若希望复用 React 技能并有其他移动端计划，可比较 Taro。uni-app 需要额外 Vue 技术栈；不能仅因“跨端”标签引入。
- 无论框架选择，共享的重点都是 `@mimir/shared` 合同、检索和保存服务；现有 React / antd 界面、浏览器上传和流式客户端需要适配。
- 服务端优先新增明确、受鉴权保护的必要合同：知识库范围检索 / 问答、小程序可用更新方法、版本前置条件、目标库保存和设备授权。原端保持兼容，避免建一套平行知识数据。

建议实施前依次做四个短验证：

1. **正式网络路径**：按已选择的 A 方案验证实际主体 / AppID、合法域名、证书与非调试真机连接。
2. **认证与读取**：标准测试账号 `admin@example.com` / `12345678`，验证账号登录、设备凭证失效 / 撤销、目录和正文读取、带凭证下载；不另建测试账号。
3. **问答与恢复**：中文跨块 SSE、来源事件、只检索、无命中、模型超时、切后台再返回；长问题不重复提交，会话和库范围不串。
4. **写入完整性**：电脑先修改、手机后保存必须提示冲突；中文 / emoji / 复杂 Markdown 无改动往返不丢；新笔记和回答确实出现在所选库，刷新与重新检索可读到已保存结果。

服务对象、编辑 B 档、预览方案、链接入库、AI 只读问答边界及当前文档问答均已确认。完整技术与实施提案已形成，以上验证为后续执行门，未在本轮完成；只有最终审阅获批后才能启动实现。

## 11. 候选验收场景

以下是后续产品 PRD 的输入，不是本轮已通过的测试：

1. 用户选择“工作资料”搜索 / 提问，仅命中该库；切到全库时范围有明确提示，服务端检索与生成上下文一致。
2. 未配模型时能返回匹配原文，并明确没有生成模型回答；手机断开 Mimir 服务时显示连接失败。
3. 引用可核对实际片段；原件打开成功但不能指定页时不展示虚假的页定位效果。
4. 长笔记尾部答案能被单篇问答检索到；做不到则不上线“问整篇”的承诺。
5. 微信切后台或锁屏后返回，能区分已完成、已中断和待处理；不会自动重复生成或重复创建笔记。
6. 只改标题 / 标签 / 目录不触碰文件原件或正文；抓取资料和 Office 提取正文不能通过小程序写入口被覆写。
7. 手机旧草稿保存不覆盖电脑新版本；草稿保留，用户可以比较、另存或放弃。
8. 新建 / 追加 / 答案存笔记后，另一端可读到同一份数据，索引更新后可检索；重试不会产生意外副本。
9. iOS / Android 非调试模式验证中文流式、键盘、长文滚动、图片 / 文档查看、过期登录和退出缓存清理。旧基础库的最低支持策略在技术验证后写入最终 PRD。

## 12. 收敛结果与最终审阅

用户逐项确认的结果：自用固定实例、已有 Markdown 正文编辑、微信原件查看器、粘贴链接收集、AI 只读问答、当前文档长文问答。

没有继续阻塞范围规划的产品问题。账号密码登录、Markdown 源文 / 预览编辑和会话范围固定作为最终交互提案交由用户一并审阅；基础库兼容、包构建和发布条件按实施验证门处理，不能冒充已验证事实。

保持 planning，提交完整摘要并等待用户在后续消息明确批准，不在本轮 `task.py start` 或编写产品代码。
