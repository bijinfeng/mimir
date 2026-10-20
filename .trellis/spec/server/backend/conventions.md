# 服务端规则

服务端的区域规则。[项目规则](../../project/rules.md)仍然适用，这里只写这一层特有的。

---

## 这一层的结构

```
src/
├── index.ts        生产入口。起 @hono/node-server，监听端口
├── dev.ts          开发入口（Vite 的 dev server 调它）。只导出 app，不监听
├── boot.ts         启动准备 + 装配，两个入口共用
├── app.ts          路由装配。鉴权中间件在最外层，新增路由默认受保护
├── env.ts          环境变量集中校验。不要在其他地方直接读 process.env
├── db/             schema + 迁移
├── lib/            无状态的纯工具（文本、vault、HTTP 辅助）
├── plugins/        **装配层**：host.ts（正常宿主装配）+ attachment-parser.ts（隔离 worker 的纯 parser 装配）+ settings-store.ts
├── search/         检索的宿主适配层（注入 snippet 端口；编排在 @mimir/core）
├── services/       业务逻辑。文件与数据库的一致性在这一层保证
└── routes/         只做参数校验与调用 service，不写业务逻辑
```

分层的判断标准：**route 层不应该知道数据库的存在，service 层不应该知道 HTTP 的存在。**

**这一层是「宿主」，不是「核心」。** 插件实现在仓库根的 `plugins/*`
（独立 workspace 包），核心骨架在 `packages/core`。宿主只负责：路由、鉴权、
业务逻辑、数据库，以及**装配**（`src/plugins/host.ts`——正常应用的唯一宿主/插件装配文件；
`src/plugins/attachment-parser.ts` 仅作为独立 worker 入口导出纯 parser，不能引入模型、数据库或应用启动）。

---

## 开发与构建都是 Vite

`pnpm dev` 是 `vite`，`pnpm build` 是 `vite build`（SSR 构建）。
配置在 `apps/server/vite.config.ts`，那里的注释写明了三条不能改的契约
（`preserveModules`、external、workspace 包内联）。

- **插件私有第三方依赖**：Vite 8 SSR 默认 external 检查从 server 根解析，pnpm isolated 下不能看见 storage 插件私有的 `@aws-sdk/client-s3`。该 SDK 显式列在 `ssr.external`，由生产 hoisted deploy 的实际 node_modules 提供；不能把生成到 `dist/node_modules/.pnpm` 的深层 SDK ESM 文件视为可移植替代。保持 `preserveModulesRoot: src`、原生模块 external 和 workspace 编译契约；修改后须干净 server build、迁移后真实 SDK 操作和生产宿主登录验证，Windows 最终仍需 NSIS 安装后资源及 smoke 门。
- **不要在入口里调 `serve()` 两次**：dev 入口只导出 app（`dev.ts`），
  监听由 Vite 的 dev server 做；生产入口才自己起服务（`index.ts`）
- **加新入口**（比如一个维护脚本）要在 `vite.config.ts` 的
  `rolldownOptions.input` 里加一行。产物必须保持与源码同深度——
  `lib/static.ts` 与 `db/migrate.ts` 的路径推导依赖它
- **改了这三条契约**：`src/test/plugins.test.ts` 的「构建配置」那组断言会拦下来。
  它们守的是「部署能不能起来」，不是「配置好不好看」

## 数据库连接生命周期

`db/client.ts` 的模块引用须持有工厂实际选用的 SQLite/PostgreSQL client，包括新建的 production 连接和复用的 development 连接。全局 HMR 缓存只服务 development，不能用缓存是否存在判断 production 是否需要关闭，也不能为了关闭而把 production 连接写入该缓存。

`closeDb()` 关闭实际 client，保留 PostgreSQL 的 `end({ timeout: 1 })`；成功后才清模块引用，仅在全局缓存仍指向同一对象时清缓存。失败必须向宿主传播，重复成功关闭保持幂等。HTTP close callback 返回不能替代数据库实际关闭；关闭后应用不得继续使用原 `db`，重新启动走新的宿主生命周期。

回归在隔离 production/development 子进程运行真实驱动：SQLite 验证 `open === false`、已关闭句柄拒绝查询、原文件数据可重新读取；PostgreSQL 通过第二条真实连接观察 backend PID 消失并验证原连接拒绝查询。不得只 spy `close/end` 或只检查开发缓存为空。参见 `src/test/db-client-close.test.ts`。

---

## 加一个插件实现

**先读 `.trellis/spec/project/architecture.md` §7**（插件协议），简短版：

1. 在对应的插件包里加一个文件，实现那条接缝的运行接口
2. 在同一个包的 `index.ts` 的 `install(host)` 里注册一行

| 接缝 | 包 | 运行接口 |
|---|---|---|
| `capturer` | `plugins/capturer/` | `matches(url)` / `run(url)` |
| `parser` | `plugins/parser/` | `accepts` / `parse(input)` |
| `leg` | `plugins/leg/` | `run(ctx)`，返回**已排序**的 id 列表 |
| `provider` | `plugins/provider/` | `supports(role)` / `adapter(role)` / `probe(role)` |

**不要改 `apps/server/src/` 下的任何文件。** 宿主不认识具体实现，编排层只认
`@mimir/shared` 里的接口。如果你发现必须改宿主，那是接缝缺了东西——
该修接缝，而不是让宿主多知道一点。

**状态别自己编**：在声明里写 `requires`（缺哪些键就不能干活）与
`unavailable()`（其它阻塞原因），状态由 core 算成四态之一（§7.4）。

**权重怎么定**：`defaultWeight` 是初始猜测，用户在设置页能覆盖
（关键词 1.0、子串 0.6、向量 0.8）。别把它当成最优值写死。

### parser 的输入是两类，不是一类

`ParseInput` 是判别联合（`packages/shared/src/seams.ts`）：

```ts
| { type: 'html' | 'markdown' | 'text'; content: string }
| { type: 'docx' | 'xlsx' | 'pptx'; data: Uint8Array; filename?: string }
```

文本类拿到的是**已经解码好的字符串**——字节→字符串的解码在宿主
（`lib/text.ts` 的 `decodeUploadedText`），因为解码会失败（GBK 编码的 txt），
而那个失败要变成一句人话。**不要在 parser 里做解码**。

字节类（Office）是 ZIP 容器，自己读里面的 XML。`plugins/parser/src/ooxml.ts`
是共用的底座（zip 读取 + XML 抽文字）；它按**实际解压字节**限制 XML，
不要在格式解析器里绕开它直接 `unzipSync`（D-109）。

**新增一种可提取的格式要动两处**：这里的 `accepts`，以及
`@mimir/shared/src/files.ts` 的 `parseTargetFor` / `parseSupport`——
后者决定「界面说这个格式有没有正文」。只改一处会出现「服务端提取出了正文、
而前端以为没有正文因而不显示」，那种 bug 看起来像数据丢了。

## 上传的原件（`lib/uploads.ts` + `services/upload.ts`）

上传件是**第二类有文件真相的文档**（笔记是第一类）。三条不能忘的：

1. **`meta.json` 是上传件的 frontmatter**。改了标题 / 标签 / 目录后要**写回**
   它（`services/documents.ts` 的 `updateNote` 已经在做），否则重建索引会读回
   旧值——用户加的标签静默消失
2. **提取这一步只有一份实现**（`services/extract.ts`）。上传与重建索引都要它，
   而两处对失败的处理不同（一个存 `parse_error`、一个打日志）。别抄第二份：
   抄了就会出现「上传时提取成功、重建后失败」这种取决于路径的行为差异
3. **`parse_error` 只记「真的试过并失败」的原因**。「这个格式还没有实现」
   由 `parseSupport()` 在界面层表达（`NULL` + `planned`）。混成一句是在说谎

---

## 改 vault 或写入路径时必须做的事

`src/lib/vault.ts` 与 `src/services/documents.ts` 有一处容易搞错的地方：
**文件写入必须先于数据库写入**，理由见[项目规则](../../project/rules.md)第 2 条。

**上传件是第二条写入路径**，同样要遵守，且多两条（`lib/uploads.ts`）：
`原件 → meta.json → 数据库`，删除时反过来（**先库后文件**——
永远不要让指针存在的时候指向一个不存在的东西）。

新增任何写入路径后，跑一次「文件 → 数据库」的往返测试
（`src/test/vault-roundtrip.test.ts` 与 `upload.test.ts` 的「重建索引能把
上传件找回来」），它们验证的是「删掉数据库能从文件重建」。

---

## 测试

集成测试、SQLite / Postgres 双路径与用户可见断言统一见[测试规范](./tests.md)。

---

## 数据库

- **双后端**（D-045）：`schema.pg.ts`（服务器）与 `schema.sqlite.ts`（本地 / 桌面）
  两份手写文件必须逐表逐列对齐——`schema-parity.test.ts` 在守，改任何一边先跑它
- 改 schema 后跑 `pnpm db:generate:pg` 与 `pnpm db:generate:sqlite`，
  **两边的迁移文件要一起提交**（SQLite 侧还有手写的 FTS 迁移 `0001_fts.sql`）
- 迁移里需要扩展（`pg_trgm` / `vector`）时，在 `src/db/migrate.ts` 里建，
  不要写进迁移 SQL——顺序反了会建索引失败
- `documents` 表上的两个 GIN 索引是 PG 检索的基础，改 schema 时不要漏掉；
  SQLite 侧对应物是 FTS5 表 + 触发器（`drizzle-sqlite/0001_fts.sql`），
  写入路径改了表结构要一起核对触发器

---

## 附件 worker 的 Node22 开发态加载

### 1. 范围

`chat-attachment-prepare.ts` 隔离预处理；Node22 的 tsx4.23.13 动态 import sourcemap 会使大型 PDF.js ESM 超过现有堆预算。编译产物没有该 loader。

### 2. 签名

`prepareAttachmentBytes(name, mime, data, signal?, timeoutMs?): Promise<PreparationResult>`；`runPreparationWorker(worker, signal?, timeoutMs?)` 成功、失败、取消和超时后均 await terminate。

### 3. 契约

保留 old/young 192/16MB、并发2及既有时间预算。仅入口为 `.ts` 且文件扩展为 PDF 时，在注册 tsx 前 native import 固定的 `pdfjs-dist/legacy/build/pdf.mjs` 与 `pdf.worker.mjs`；URL 来自已声明锁定依赖 require.resolve/pathToFileURL。真实 parser 复用 ESM 缓存并实际解析原字节。compiled `.js` 不预载、不注册 tsx，不从可陈旧的 dist 替代当前 TS。CI `pnpm check` 用 `PNPM_CONFIG_WORKSPACE_CONCURRENCY=1` 串行 workspace；pnpm12不读取旧 npm_config 前缀。

### 4. 错误矩阵

缺依赖/无效或扫描PDF仍拒绝；真实堆超限、无限CPU、abort和timeout均拒绝且线程终止。不得增加预算、合成正文、忽略解析错误或跳用例。

### 5. Good / Base / Bad

Good：Node22 当前源码真实PDF抽取成功且超限仍拒绝。Base：compiled worker按原路径运行。Bad：提高上限或选择陈旧编译文件掩盖源码加载问题。

### 6. 必需验证

在 `.nvmrc` 对应 Node 主版本运行真实附件套件、OOM/CPU/abort恢复；同预算的源码/compiled探针对比区分 loader 与 parser。CI调度效果以完整远端运行判断，本机Node25通过不能代替Node22。

### 7. 错误与正确

错误：将192MB提高或只重跑Node25宣布CI已修好。正确：保持限制，在源码 worker 内先 native load 固定 vendor ESM，再注册TS loader，真实文本与失败边界均验证。
