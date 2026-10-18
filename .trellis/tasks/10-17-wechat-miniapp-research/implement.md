# 微信小程序首版实施计划

日期：2026-10-18。用户已明确选择“开始正式开发”，本轮从 S0 启动现有任务；React 19 已核对不兼容，用户明确选择保留 Taro + NutUI 并使用 React 18.3.1；证据与构建结果同步技术方案。S1–S5 仍按顺序执行。

## 1. 组织与变更边界

当前任务保留一个端到端交付：小程序客户端、服务端接入及共同合同缺一不可，暂不创建可独立验收的产品子任务。以下为串行交付步骤，不把父子树当依赖调度。

实现 / 检查阶段按 Trellis 配置分派 implement / check 子代理，主会话负责决策、上下文、集成及提交。每个派发以 `Active task: .trellis/tasks/10-17-wechat-miniapp-research` 开头，明确文件所有权、共享工作区不回退他人修改。没有批准前不派实现。

每个步骤通过本步质量门后，只提交本任务代码、测试和规范；不混入其他会话工作。提交记录写入本文件的执行记录。`implement.jsonl` / `check.jsonl` 仅列真实规范与研究资料，具体源码从本计划定位。

## 2. 有序步骤

### S0：批准与基础验证

- [x] 高保真原型已迭代至 v3（`da94fe0`），本轮把引用快照、固定工具行、轻量追加等结果同步方案；浏览器验证不计作微信真机或产品能力验收。
- [x] 用户明确选择“开始正式开发”，复核现有任务与工作区，不创建重复任务；使用 task.py start 启动。
- [x] 读取 before-dev 及 server / shared / core / plugin-leg 规范；新小程序按本方案和真实微信能力制定包规范，不把其他包模板冒充现行约束。
- [x] 确认部署配置方式与当前环境：构建时固定 HTTPS origin；真实 AppID / 域名未提供，本机无微信开发者工具 / 真机验证。相关平台验收仍待完成，详见 verification/s0-engineering.md。
- [x] 核实用户提供的 Taro 5.0 文章与官方发布；用户已确认采用 Taro 4.3.0 + React 18 + NutUI React Taro 4.0.0-beta.10。此项仅为技术选型完成，工程兼容性验证仍待执行。
- [x] 新建 `apps/miniapp` 最小 Taro React + TypeScript 构建、test / typecheck 脚本；共享业务契约编译路径随 S1 首次真实接入验证，本步不加入无用途的业务导入。锁定 `@nutui/nutui-react-taro@4.0.0-beta.10`（本轮最新 4.0），不依赖指向 beta.9 的 `latest` 标签。验证按需引入与主题定制，不引入 Office / antd / DOM-only / Node-only 模块；组件库升级后重新检查兼容性。
- [x] 基础库暂配置为 3.0.0（高于分块请求的 2.20.2），已检查主包原始大小、固定服务端配置与真实 AppID 不提交；无分包。Taro / NutUI 的实际基础库与设备兼容仍待微信端实测，不能勾作平台验收通过。

门：开发工具能够导入或有可验证的构建产物；设备不可用时不能通过完整平台兼容验收。退路：先回退新包构建配置，不动现有客户端。

### S1：设备鉴权与只读数据入口（AC1）

- [ ] 共享合同：`packages/shared/src/miniapp.ts`（建议）、最小公开入口；新增设备表的 PG / SQLite schema、迁移及 parity 测试。
- [ ] 服务：`apps/server/src/services/miniapp-auth.ts`、`middleware/miniapp-auth.ts`、`routes/miniapp.ts`（建议）；复用 `auth.ts` / `routes/auth.ts` 的账号解析与密码校验。
- [ ] 在 `app.ts` 以独立受鉴权组挂载专用路由，登录作为明确公开入口，避免 `requireAuth` 或通配顺序误吞。小程序 token 不被旧 API 识别为全权凭证。
- [ ] 实现目录、标签、分页文档列表 / 详情、会话历史与原件读取的服务复用；详情过滤运行时路径等不必要字段。
- [ ] 验证 token 过期 / 撤销 / 退出、错误登录、无鉴权下载、访问配置 / Agent / 维护入口被拒；响应与日志不含密码 / token。

门：同一标准测试账号成功读取本人数据；越权负例与双数据库迁移通过。退路：关闭专用入口、撤销设备会话；不影响旧 Better Auth 登录。

### S2：范围过滤与当前文档长文问答（AC2、AC3、AC10）

- [ ] 新 scope schema 与服务端规范化；保存会话范围，对旧会话兼容读取，切范围新开会话。
- [ ] 贯穿 `packages/core/src/pipeline.ts`、`packages/shared/src/seams.ts`、`apps/server/src/search/index.ts`，同步六个 `plugins/leg/src/{keyword,substring,vector}.{pg,sqlite}.ts` 查询。
- [ ] 所有通道在 LIMIT 前过滤，文件标题兜底、相邻块与引用装配同样验证范围，目录分段 / 通配符按字面处理。
- [ ] 抽取流式与非流式共用问答准备逻辑，替换单篇开头截断；未知 / 已删范围不回退全库，源文 / 索引不同步明确提示。
- [ ] 在两篇资料放置相似词 / 冲突事实，长文尾部放唯一事实；确认“问这篇”只引用指定长文尾部，不混入其他资料。同时验证无命中、无正文及无模型路径。

门：SQLite / PG 的同一批范围断言通过，真实检索效果有样例记录，现有搜索 / 聊天回归通过。退路：回退新增范围接线，保持旧 API 默认行为；新端不能带着无效范围上线。

### S3：版本保护、有限写入与操作防重（AC5–AC8）

- [ ] 服务端真实 revision 与 expectedRevision，在既有 `updateNote` / `withDocumentPublication` 边界内检查；元信息更新不回写旧正文，非笔记拒绝 body。
- [ ] 专用 POST 新建 / update / append / 存回答 / capture 入口，调用现有服务；目标库必须存在且明确。
- [ ] 新增最小操作记录及双数据库迁移：requestId、请求指纹、状态、结果；相同操作防重，冲突参数拒绝，未知结果不自动重执行。
- [ ] 答案保存保留引用与 messageId 的已保存关系，加入目标 folder；重复点击返回同一笔记。捕获使用现有实际阶段结果，不造假进度。
- [ ] 处理电脑端已保存、手机旧草稿、外部源文件更新、重复请求、写后响应丢失、进程重启时未完成操作等边界。
- [ ] 真实文件检查无改动 Markdown 往返、frontmatter 保留、标题 / 标签 / 目录、追加、新笔记的磁盘 / DB / 索引一致性。

门：冲突不写、重试不重复、元信息不改原件；双数据库、索引及已有 Office publication 回归通过。退路：禁用小程序写入口，保留已提交内容和草稿，不删除数据表 / 文件来回滚。

### S4：小程序交互与传输（AC1–AC10）

- [ ] 登录与退出、三个主入口、库 / 目录分页列表、标签、只搜索与提问、范围提示与历史。
- [ ] 网络适配：token header、状态码、统一错误、超时、增量 UTF-8 / SSE；屏蔽 Agent 模式，不透传任意工具参数。
- [ ] 原生正文与引用片段、文档详情“问这篇”、受控 Markdown 阅读、图片失败提示；鉴权下载后的 `openDocument` 和返回阅读页。
- [ ] Markdown 源文 / 预览编辑、显式保存、实例 / 账号 / 文档隔离草稿、冲突保留 / 重载 / 另存；键盘和导航状态不丢输入。
- [ ] 链接收集、目标位置、真实成功 / 部分失败 / 失败展示、操作查询、防重复提交。
- [ ] 前后台生命周期、断网恢复、会话与操作结果对齐；不会把未结束流当成功、不会自动重复生成。
- [ ] 小程序动效与样式保持轻量；Obsidian 用于移动阅读 / 编辑布局参考，实际视觉由本项目 token 和平台可访问性验证，不移植桌面三栏。

门：自动测试覆盖跨块中文 / emoji / 半帧 / 错误 / 结束，草稿与状态机以真实事件 / 可控 Promise 验证；不能用固定 sleep 证明完成。开发工具可用时实际检查页面。

### S5：集成、真机与交付

- [ ] 全范围 check 子代理审查，验证 R1–R6 → AC1–AC10 映射、共享合同唯一来源、SQL 方言一致、旧客户端兼容及敏感入口限制。
- [ ] `pnpm check` 和相关构建通过；其他会话已有失败须准确记录并隔离，不能宣称全门通过或清理别人的未完成代码。
- [ ] iOS / Android 非调试模式：固定合法域名 / 证书、登录、中文流式、长文、引用、笔记编辑与电脑冲突、微信原件查看、抓取失败、后台 / 弱网恢复。
- [ ] 使用真实模型验证长文尾部事实与跨库隔离，记录问题、结果和来源片段；未配模型路径单独验证。
- [ ] 核对实际 AppID 主体、类目 / 备案、当前 AI 问答和隐私要求；没有真实后台证据不声称可发布。提交平台审核 / 发布作为后续外部动作，需用户明确指示。
- [ ] 更新唯一归属规范：shared scope / revision / auth 合同，server API / tests，core / leg 范围规则，小程序包规范和部署说明；提交本任务变更并记录 commit。
- [ ] 缺少真机 / 域名 / 主体条件时交付可测试产物与明确待验清单，保持相应验收项未完成，不能 archive 为全部产品已完成。

## 3. 验证命令

以下包含已建立的 S0 工程命令与 S1–S5 的预期命令。实际执行结果以本文件当前执行记录和 verification 记录为准；业务验收测试尚未实现，不能将下列清单当作已运行证明。

```bash
# 单批数据库集成测试串行执行，不能让多个 Vitest 进程共用 data/.test。
pnpm --filter @mimir/server exec vitest run src/test/miniapp-auth.test.ts src/test/miniapp-scope.test.ts src/test/miniapp-write.test.ts src/test/miniapp-operations.test.ts
pnpm --filter @mimir/server exec vitest run src/test/search.test.ts src/test/plugins.test.ts src/test/chunks.test.ts src/test/chat-stream.test.ts
pnpm --filter @mimir/core typecheck
pnpm --filter @mimir/plugin-leg typecheck
pnpm --filter @mimir/miniapp test
pnpm --filter @mimir/miniapp typecheck
pnpm --filter @mimir/miniapp build
pnpm check
pnpm build
git diff --check
```

上述 server 测试文件为 S1–S3 计划目标，创建后再运行；`@mimir/miniapp` 已在 S0 建立。PG 使用项目规定的 `TEST_DATABASE_URL`（数据库名含 `mimir_test`）重跑同一批 server 断言，连接信息从本地受控配置取得，不输出凭据。不要创建生产数据库或对真实 vault 执行清理。

所有人工 / 自动登录统一使用 `admin@example.com` / `12345678`、用户名 `admin`；不另建测试账号。真实模型 / 网络验证记录费用与失败，不把 mock 通过当实际效果。

## 4. 风险文件与复核点

| 边界 | 重点复核 |
|---|---|
| `app.ts`、auth / middleware、文件路由 | 专用组挂载、原鉴权无回归、token 无全权扩散 |
| shared、core、六个 leg 方言实现、search / assistant | 过滤先于 LIMIT，范围不可扩大，长文不截首段，历史不串范围 |
| documents、publication、capture、conversations | 同一写锁、文件先行、冲突 / 幂等、目标库 / 文件真相 |
| DB schema / migrations | PG / SQLite 同批，增量回滚兼容，旧会话可读 |
| 新包 / workspace / 构建配置 | 包体积、依赖边界、发布配置、旧 web / desktop 不受新运行时影响 |

## 5. 当前执行记录

- 2026-10-17：首轮研究交付、来源快照和哈希验证通过。
- 2026-10-18：用户完成产品范围选择，新增当前文档长文问答；本轮整理 PRD、design、implement 和上下文清单，尚未批准启动。
- 本轮检查仅限规划资料链接、哈希、JSON / JSONL、规划文档差异空白及范围一致性。sources 原始源码 / 提取文本保留已有行尾空白以维持证据哈希，不作为产品代码空白检查对象。未执行开发工具、真机、模型或产品质量门。
- 提交记录：规划提交的实际 SHA 在提交完成后报告；产品实现尚无提交。
- 2026-10-18：按用户“先看交互”的要求，增加 [高保真可点击原型](prototype/README.md) 与 [六屏概览](prototype/overview.png)，正式任务继续 planning。10 个场景均使用模拟数据，未新增生产小程序代码或 API 调用。
- 原型检查：`npm run build` 通过模板运行时 28 文件完整性、TypeScript 与 Vite 构建；Trellis 上下文验证通过。浏览器检查覆盖问答 / 引用 / 完整回答存笔记、单篇范围、Markdown 编辑与模拟键盘、草稿恢复新建身份、跨文档草稿保护、冲突处理、收集成功 / 失败、原件边界和示例账号；iPhone / Pixel 与深色外观仅为浏览器模拟。具体证据和独立审阅见 [design-qa](prototype/design-qa.md) 与 [reviewer](prototype/verification/reviewer.md)。这些检查不替代 S1–S5 产品质量门、真实检索或微信真机验收。
- 规划资料提交：`068d646`。本轮原型提交的实际 SHA 在提交完成后报告；交互反馈收敛后再更新完整方案并请求批准启动。
- 2026-10-18：第一版原型提交 `28dcc4c` 后，用户指出其交互与现有“紧凑、简单”设计不一致。本轮只修订任务内原型呈现与操作层级：移除宣传引导、重复标题和重复范围入口，收紧列表 / 工具栏，简化评审外壳；已确认功能和正式实施门保持不变。修订验证与新的独立审阅记录在原型目录，旧版审阅结论不能用于证明修订稿已获用户认可。
- v2 验证：原型构建、28 文件 runtime 校验、任务上下文 validate 与任务差异空白检查通过；浏览器复验单篇问答 / 引用回原文 / 编辑保存 / 冲突重载及草稿恢复，iPhone / Pixel 与深色首页已查看。短文键盘态的空白尾部问题修复后回看，标题、正文、光标与保存同屏。新一轮 [紧凑版独立审阅](prototype/verification/compact-review.md) 结论为 ship（仅供原型评审），所需截图均已补齐；正式任务仍为 planning。
- 2026-10-18：用户选择 Taro，并明确采用 NutUI React Taro 最新 4.0。本轮核对最新版本为 `4.0.0-beta.10`，更新技术方案和基础验证步骤；Taro 5.0 来源仍待核实。此次仅更新规划资料，未安装依赖或验证小程序构建 / 真机；组件库选择不代表完整方案已获实施批准。前轮选型调研提交为 `c1d1679`。
- 2026-10-18：版本选择规划提交 `4effb3b`，Taro 5.0 文章核验提交 `9d1b494`。用户在核验结论后回复“可以”，确认 Taro 4.3.0 + React 18 + NutUI React Taro 4.0.0-beta.10。本轮同步规划与上下文，任务保持 planning；技术栈确认不等于完整方案实施批准，也未完成构建 / 真机验证。
- 2026-10-18：技术栈确认提交 `9611644`。用户要求继续打磨界面并调研同类产品，本轮新增 [移动界面参考研究](research/mobile-interface-references.md)、5 款产品 27 张官方手机截图及当前原型 6 个状态截图，给出下一稿建议。素材版本与哈希记录在研究目录；未修改原型 / 生产代码，未安装或登录竞品手机 App，未扩大 MVP，任务继续 planning。


## 原型 v3：用户批准的细化边界（2026-10-18）

用户在界面参考研究后回复“可以”，授权打磨任务内原型；正式任务仍为 planning。

- 当前差距：导航与会话入口主次不一致；编号引用打开所有来源而未定位；阅读页整理、编辑、提问同权；追加操作进入完整编辑表单。
- 行为归属：原型 `src/Prototype.tsx` 的页面状态、引用面板和笔记草稿；`src/prototype.css` 的操作层级与聚焦样式。仅必要时修复 `public/mimir.svg` 的引用方式。
- 修改范围：上述应用自有文件及任务 PRD / design / README / 验证记录、截图。28 个受保护模板运行时文件、依赖与锁文件保持完整。
- 具体交付：统一页身份和常用动作位置、继续会话优先且保留两个示例；编号引用展示对应片段，全来源仍可查看；阅读页主动作“问这篇”、轻量编辑、整理收为菜单；追加显示目标并仅输入追加正文，保留未保存与冲突防护；核查问答品牌图标加载。
- 不包含：真实 Taro 工程、API、数据持久化、新产品功能或重新选择技术栈；不替代微信真机验收。
- 验证：原型构建与 runtime 校验；iPhone / Pixel、浅深外观；编号 / 全部来源、原文返回、阅读菜单、追加保存 / 草稿、编辑与冲突；独立代码审阅与任务上下文检查。不会为低风险样式重复编写实现镜像测试。


### v3 执行与验证结果

- 前轮界面研究提交 `156b7e2`；本轮按用户批准完成原型细化，仅修改两处应用自有源码及任务文档 / 证据。
- 引用采用当前回答来源快照，编号与片段在原文移库后保持稳定，打开原文按当前文档 ID 定位；新增轻量追加模式，复用离开、草稿、另存与冲突保护。
- 主会话完成编号 1 / 2 / 全部来源、原文返回滚动、移库后引用、追加保留 / 恢复 / 保存、编辑预览、单篇范围、冲突另存、iPhone / Pixel 和深色关键页验证；修复模板全局段落规则对主题和阅读排版的覆盖。
- 最终原型 build、runtime 28 文件完整性、任务上下文 validate、任务差异空白通过；独立审阅结论与截图在 `prototype/verification/v3-code-review.md` / `v3-review.md`。未运行生产测试或微信真机，当时正式任务保持 planning；该轮提交为 `da94fe0`。


## 正式开发 S0 变更边界（2026-10-18）

- 轮次起点：只有独立 React / Vite 浏览器原型，缺少真实 Taro 小程序工程、依赖兼容和可导入产物。用户已批准开发；要求核对 React 19 后已选择兼容 React 18.3.1。
- 行为归属：新包 `apps/miniapp` 的 Taro 配置、最小三入口页、NutUI 按需使用及主题接入；`pnpm-lock.yaml` 和仅必要的 workspace 配置管理依赖，不能把当前 React 19.3 catalog 强加给不兼容的小程序渲染器。
- S0 交付：锁定用户确认的 React 18.3.1 + Taro / NutUI 版本；微信产物、typecheck、最小必要测试或产物校验；记录包体积及 React 渲染器关系。应用布局继承 v3 紧凑视觉，开发环境如未接接口必须准确显示状态。
- 不做：本步不冒充已完成真实登录 / 问答 / 写入或真机验收；不复制 DOM 设备壳、不升级现有 web / desktop 的 React、不中断其他会话、不更改安全依赖检查。
- 质量门：新包构建、类型与依赖检查，独立 check 审阅；全仓检查如受无关并行改动影响，如实记录。代码、规范与任务记录按功能提交。
- 当前复核：现有 `updateNote` 已提供锁内 precondition，后续版本保护可复用；现有单篇 retrieve 仍截取开头，S2 必须替换为范围内相关段落检索。新包基础工程不代表这两项后端缺口已解决。

- React 版本取舍已完成：用户在得知官方依赖及渲染器限制后选择 React 18.3.1；S0 使用精确 React / React DOM 18.3.1 和匹配 React 18 类型，与现有 web / desktop React 19 分离。严格 npm lock-only 探针（临时目录）对 React 19.3.1 + @tarojs/react 4.3.0 返回 ERESOLVE，未绕过也未进入编译。


### S0 工程执行结果（2026-10-18）

- 已创建真实 `apps/miniapp` 工程；精确版本、固定域名配置、安装策略与运行时边界见包 README 及 miniapp/frontend 规范。问答、知识库、我的仅展示未接入状态。
- 实施者完成 frozen install、类型、3 项测试、微信编译与模块 / 包体校验；最终产物 361987 原始字节（353.5 KiB）。独立审阅与最终命令记录见 [S0 验证](verification/s0-engineering.md) 和 [代码审阅](verification/s0-code-review.md)。
- 主会话全仓 `pnpm check` 在旧原型 7 个 lint error 处失败；未改原型或降低检查，不能宣称全仓质量门通过。无微信开发工具 / 真机结果，S1–S5 保持未完成。
- 本轮功能提交及 SHA 记录到开发者会话日志；任务维持 in_progress，不归档为产品已完成。
