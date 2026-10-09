# apps/server/AGENTS.md

服务端的区域规则。根目录的 `AGENTS.md` 仍然适用，这里只写这一层特有的。

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
├── plugins/        **装配层**：host.ts（唯一的跨边界文件）+ settings-store.ts
├── search/         检索的宿主适配层（注入 snippet 端口；编排在 @mimir/core）
├── services/       业务逻辑。文件与数据库的一致性在这一层保证
└── routes/         只做参数校验与调用 service，不写业务逻辑
```

分层的判断标准：**route 层不应该知道数据库的存在，service 层不应该知道 HTTP 的存在。**

**这一层是「宿主」，不是「核心」。** 插件实现在仓库根的 `plugins/*`
（独立 workspace 包），核心骨架在 `packages/core`。宿主只负责：路由、鉴权、
业务逻辑、数据库，以及**装配**（`src/plugins/host.ts`——全仓唯一同时 import
宿主与插件的文件）。

---

## 开发与构建都是 Vite

`pnpm dev` 是 `vite`，`pnpm build` 是 `vite build`（SSR 构建）。
配置在 `apps/server/vite.config.ts`，那里的注释写明了三条不能改的契约
（`preserveModules`、external、workspace 包内联）。

- **不要在入口里调 `serve()` 两次**：dev 入口只导出 app（`dev.ts`），
  监听由 Vite 的 dev server 做；生产入口才自己起服务（`index.ts`）
- **加新入口**（比如一个维护脚本）要在 `vite.config.ts` 的
  `rolldownOptions.input` 里加一行。产物必须保持与源码同深度——
  `lib/static.ts` 与 `db/migrate.ts` 的路径推导依赖它
- **改了这三条契约**：`src/test/plugins.test.ts` 的「构建配置」那组断言会拦下来。
  它们守的是「部署能不能起来」，不是「配置好不好看」

---

## 加一个插件实现

**先读 `docs/TECH.md` §7**（插件协议），简短版：

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
是共用的底座（zip 读取 + XML 抽文字）。

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
**文件写入必须先于数据库写入**，理由见根 `AGENTS.md` 铁律 2。

**上传件是第二条写入路径**，同样要遵守，且多两条（`lib/uploads.ts`）：
`原件 → meta.json → 数据库`，删除时反过来（**先库后文件**——
永远不要让指针存在的时候指向一个不存在的东西）。

新增任何写入路径后，跑一次「文件 → 数据库」的往返测试
（`src/test/vault-roundtrip.test.ts` 与 `upload.test.ts` 的「重建索引能把
上传件找回来」），它们验证的是「删掉数据库能从文件重建」。

---

## 测试

- 集成测试用 `app.request()` 内存调用，不占端口
- **默认跑 SQLite 临时库**（`data/.test/mimir.db`，免 Docker）；设
  `TEST_DATABASE_URL=postgres://…mimir_test` 时切 PG 复跑——两个检索通道的
  SQL 按方言分开写，检索断言**两种方言都要过**（方言对齐门，TECH §9.2）。
  Postgres 路径下库名必须含 `mimir_test`，`global-setup.ts` 会校验
- 测试文件与库都在 `data/.test/` 下。目录名写错会污染真实 vault
- 新增检索相关的行为时，加一条能说明「用户会看到什么」的断言，
  而不是只断言函数返回值

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

## 会静默出错的地方

这几类问题**不报错**，只在你以为没问题的时候悄悄地错。改相关代码前先扫一遍。
新坑记到这里（跨区域的记根 `AGENTS.md`；原 TECH §10 与根坑表的区域条目已于
2026-10 归位至此，合并了重复）。

| 症状 | 原因 |
|---|---|
| 中文搜不到 | 缺了 jieba 预分词，或 `new Jieba()` 没带词典（退化成逐字切分，必须 `Jieba.withDict(dict)`）；SQLite 下还可能是 FTS5 触发器被绕过、索引落后于表（触发器建在 INSERT / UPDATE(OF search_text) / DELETE 上覆盖全部写入路径，`pnpm db:reindex` 全量重建兜底）；Postgres 的 `simple` 配置无词边界——写入时预分词 + 子串兜底通道 |
| **写了迁移却「没生效」（不报错、不建表）** | drizzle 只跑 `when` **大于**库里已应用最大值的那些迁移，而 `when` 来自 `meta/_journal.json`。**手工编过时间戳的条目会把新迁移挤到后面**：实测 `0006_kb_code` / `0009_kb_code` 的 `when` 是未来时间（1791879000000 ≈ 2026-10-13），而 drizzle-kit 生成新迁移用的是真实当前时间（更小），于是 `chunks` / `chunk_embeddings` / `feeds` 在**已有实例**上一张都没建，而 `pnpm db:migrate` 打印「迁移完成」（全新库按顺序全跑不受影响，中招的正是升级路径）。`apps/server/src/db/migrations.test.ts` 的单调性断言守着（D-086） |
| **drizzle 迁移 SQL 的注释里不能出现断点标记** | 迁移文件按 `--> statement-breakpoint` 切分语句，**注释里出现这串字符也会被切开**——实测注释被拦腰切断后，前半段变成「没有语句」的片段，迁移直接报 `contains no statements`。触发器体里有分号，所以触发器单独一个迁移文件（`0001_fts.sql` / `0007_chunks_fts.sql` 的同一条理由） |
| **`pnpm db:generate:pg` 生成「删掉全部表」的迁移** | `drizzle.config.ts` 的 `schema` 曾指向按 DATABASE_URL 分发方言的 `schema.ts`（`pick()` 动态层），drizzle-kit 静态分析不了 → 读到空 schema。已改指 `schema.pg.ts` 本体。**PG 的快照链还缺 0005–0007**，所以 `folders` 这类表它仍会提议 CREATE TABLE——手写 ALTER 覆盖（见 `drizzle/0008_folder_meta.sql`） |
| 删了会话/文档但关联记录还在 | SQLite 默认**关闭**外键，`onDelete: 'cascade'` 静默失效——删会话留下孤儿消息、删文档留下孤儿标签关联。连接建立时显式 `PRAGMA foreign_keys = ON`（`db/client.ts` 已做，与 PG 默认开启的行为对齐，别在新连接里漏） |
| better-sqlite3 的事务配 async 回调 | drizzle 的 `db.transaction(async (tx) => …)` 在 better-sqlite3 上回调被当同步跑——提交发生在 await 之前，后续语句报「事务外使用 tx」或静默写丢（实测 500）。**不用事务**：顺序写 + 「文件先行」兜底（`services/folders.ts`）；真需要原子性时用同步回调 |
| **SQLite 下裸 SQL 报 `db.execute is not a function`** | drizzle 的 better-sqlite3 驱动**没有 `.execute()`**（只有 `.all()` / `.run()`），而 PG 侧有——同一段代码在服务器（PG）上正常、本地开发与桌面端（SQLite）上炸。宿主自己的方言 SQL 走 `plugins/host.ts` 的 `executeRaw`（与传给插件的 `PluginDatabase.execute` 同一个实现）；**别在 services 里再写 `if (dbDriver === 'sqlite')`**（D-045 的方言分支要点名收敛）。服务端集成测试默认跑 SQLite，所以这类错误「测试全绿、本地炸」不存在——前提是那条 SQL 真的被某条测试跑到（`embed.test.ts` 就是为此而写） |
| **sqlite-vec 装不上是静默的（直到第一次语义检索）** | 它按平台分发（linux-x64 等），且只有 SQLite 路径需要。加载在连接时做（`db/client.ts` 的 `createRequire`，**不在模块顶层 import**——PG 部署根本不需要它，顶层 import 会让那条路径也去解析）；**加载失败要抛错**：它的缺席表现是「语义检索返回空」，看起来像「库里没有相关内容」，是最难查的一类 |
| 原先连 Postgres 的环境「数据全空」 | `DATABASE_URL` 没设，默认换到了 SQLite 空库（`data/mimir.db`）——部署环境要显式设置（compose / Dockerfile 已如此）；启动日志打印当前驱动与库位置 |
| 建索引失败 | pgvector 对 `vector` 类型的 HNSW 上限 **2000** 维，超过要用 `halfvec`（上限 4000） |
| 同一条 like 在两种方言行为不同 | SQLite 的 `LIKE` 只对 ASCII 不区分大小写，PG 区分——「测试在 PG 上绿、SQLite 上行为不同」。需要精确语义的地方**两侧都显式 `lower()`**（子串通道已这么做）；目录前缀等 ASCII 场景接受差异 |
| better-sqlite3 是同步 I/O | 大查询会阻塞事件循环，所有并发请求排队。单用户 + 个人库规模（查询毫秒级）可接受；PG 路径不受影响。见 RESEARCH §11.1 |
| 自然语言提问全部 0 命中 | `plainto_tsquery` 的 AND 语义——四词要求全部出现。改成「命中词数 ≥ 一半」+ `ts_rank_cd` 排序，见 D-014 |
| 子串通道「兜底」永远不命中 | 拿整串去 ILIKE——一句话提问永远不等。逐词匹配，门槛与词级通道一致 |
| 检索「零命中」也要几百毫秒 | 召回通道的门槛写在外层查询——过滤条件引用计算列，**GIN 与 trigram 索引静默失效**，改走全表扫描（5 万行实测 292 ms）。门槛谓词下推到 `WHERE`，命中数与排序分开算：零命中降到 **0.012 ms**，命中密集时仍有 38.5 ms 的真实排序成本。见 `RESEARCH.md` §9.5 |
| 语义检索永远不走向量索引 | HNSW 索引建在表达式上，查询没写同一个表达式——索引**静默不命中**，退化成顺序扫描（20 万行才会明显）。索引与查询都用 `embedding::halfvec(1024)`，且都带 `WHERE dimension = 1024`。见 §4.8 |
| halfvec 索引上不带维度过滤 | pgvector 无法用 partial index，`dimension` 谓词必须与索引定义一致。查询里显式 `WHERE dimension = <该索引的维度>` |
| **分块的检索文本漏掉标题** | `documents.search_text` 是 `toSearchText(title, body)`，分块表只装正文的话，标题里的词就从索引消失（标题「React 组件性能优化」、正文没有「组件」二字时搜「组件」命中 0）。分块器的 `searchText` 一律 `toSearchText(title, content)`，标题由 `syncChunks` 从数据库现取（调用方传会固化旧标题） |
| **改了文档却没重算分块（第四条写入路径）** | 分块的写入点只有 `syncChunks` 一个，但**调用它**的路径有四条（笔记新建 / 更新、抓取、上传、重建索引）——抄三遍必漏一处，实测漏的就是上传。新写入路径一律调 `services/chunks.ts` 的 `rebuildChunksAndEmbed` |
| **feed 的正文片段跑 Readability 会丢** | RSS 的 `content:encoded` 按规范**已经是正文**，而 Readability 的职责是「从整页里找正文」——两行的片段会被它判为「不像一篇文章」返回 null，整条退化成裸 HTML。片段走 `html-fragment` 解析器（turndown 直转），与抓网页共用同一个转换函数 |
| **播种/一次性动作「做过了」但标记没落库** | `settings.update()` 对**未注册的键与校验失败**都是「返回 `issues`、不写」——不检查返回值就会「内容写了、标记没写」而函数照常返回成功。症状是每次重启重播一次，而更坏的一种是**用户删掉默认内容之后它又回来**（标记的全部意义就是防这个）。实测踩过：开发中的实例热重载时装配层拿着旧键表，写入被静默拒绝。凡是靠 `settings` 记一次性状态的地方都要看 `ok` |
| 设置项在界面上有、代码里没人读 | 键没有注册进键表（`packages/core` 的 `CORE_SETTING_SPECS` 或插件的 `params`）。写入端点会拒绝未注册的键，但只读代码看不出来 |
| 插件在设置页显示的状态不对 | 状态由 core 从 `requires` / `unavailable()` 算出来（`docs/TECH.md` §7.4）。实现自己编状态字符串就会与真实原因脱节 |
| 描述符指向的文件不存在 | `plugins.test.ts` 有一条断言在守（描述符的 `file` 路径必须真实存在）。它防的是「设置页显示的文件路径是手写的」——那正是重构要消掉的东西 |
| 「解析失败」其实是「没有实现」 | 把一个格式的「没有实现」说成「解析失败」是**静默说谎**——用户会去查自己的文件。`parseSupport()` 三态（`now` / `planned` / `none`）在 `@mimir/shared`，界面措辞由它派生；`parse_error` 只记**真的试过并失败**的原因。`upload.test.ts` 断言损坏的 docx 有 `parseError` 而未知格式是 `null` |
| **上传件的标签/目录在重建后消失** | 整理出的标签与目录只活在数据库里，而 `meta.json` 还是旧的——重建索引读回旧值。`meta.json` 是上传件的 frontmatter，`updateNote` 里对 `kind === 'file'` 要写回（`services/documents.ts`）。`upload.test.ts` 有一条断言守着 |
| 一份 GBK 的中文 txt 变成满屏 `��` | `new TextDecoder()` 默认**不抛错**，非法字节被换成 U+FFFD——库照常入库、检索照常建索引，搜什么都搜不到。`decodeUtf8` 用 `fatal: true`，失败就抛错并由上传路径记进 `parse_error`。静默降级比报错更糟；不做编码自动探测（猜错就是乱码入库） |
| **xlsx 上传后正文是一串数字下标** | xlsx 的单元格文字在 `sharedStrings.xml` 里，只读 `sheet1.xml` 会「解析成功」而正文全是 `<v>17</v>` 的下标。先读共享字符串表再查表；下标**从 0 开始**（不是 1）。`upload.test.ts` 断言提取出的正文里有真正的文字 |
| 容器里头像不落盘在挂载卷上 | 三个存储目录各有独立默认值：Dockerfile 与 compose 只设了 `VAULT_DIR` / `RAW_DIR`，漏了 `AVATARS_DIR`，它回落到 `cwd + /data/avatars`——上传与显示都正常，**`--build` 重部署后头像消失**。收成单个 `DATA_DIR`，三类文件是它的三个前缀。见 D-038 与 `RESEARCH.md` §10.10 |
| S3 改名后同一笔记有两个文件 | 对象存储没有 `rename(2)`，只能「复制 + 删除」；复制成功、删除失败时重建索引按 id upsert 会让它们互相覆盖——**哪份胜出取决于扫描顺序**。顺序固定为先复制后删除；`reindexVault` 检测「同一 id 多个路径」并跳过 + 打日志（`ReindexResult.duplicates`）。见 `RESEARCH.md` §10.3a |
| 库里超过 1000 篇后重建索引静默漏文件 | S3 的 LIST 每次最多回 1000 个 key，必须靠 `ContinuationToken` 翻页。`plugins/storage/src/s3.ts` 的 `list` 循环处理 `IsTruncated`；不用 `delimiter`（请求数翻倍）。见 `RESEARCH.md` §10.3b |
| 上传到 R2 等兼容实现被拒收 | `@aws-sdk/client-s3` 3.729.0 起默认加 `x-amz-checksum-crc32`，兼容实现不认这个头。`requestChecksumCalculation: 'WHEN_REQUIRED'` 与 `responseChecksumValidation: 'WHEN_REQUIRED'`——**一行配置，不是选 SDK 的代价**。见 `RESEARCH.md` §10.11 |
| 中文对象名复制时找不到源 | `slugify` 保留汉字，而 `CopySource` 不编码时 S3 按字面量找对象。`CopySource` 按**段**编码：`key.split('/').map(encodeURIComponent).join('/')`（保留 `/` 作分隔） |
| `new Blob([bytes])` 类型不过或复制出错误内容 | `Blob`/`Uint8Array` 的 buffer 可能是 `SharedArrayBuffer`（`ArrayBufferLike`）。复制成独立 `ArrayBuffer` 再传（上传路径用 `file.arrayBuffer()` 天然是）。**不是类型洁癖**：SharedArrayBuffer 被当 ArrayBuffer 读出来是垃圾 |
| 重建索引的请求次数随篇数线性涨 | 按目录逐个 LIST（`uploads/<id>/` 一次调用），对象存储的 LIST **按请求计费**（§8.5），500 篇就是 500 次——本地磁盘看不出来。一次 `list(UPLOAD_PREFIX)` 之后按 id 归类（`vault-index.ts` 的 `listUploads()`）；**有 meta 但没有原件时也要返回那一条**（`originalKey: null`），否则「记录还在但原件丢了」会被整条吞掉 |
| 部署方在 `.env` 配的值被静默吃掉 | 未 seed 的默认值覆盖了它——settings 表只存**显式写入**的行；解析时「没有行」才看环境变量。见 §7.5 |
| `AUTH_SECRET` 轮换后所有密钥静默失效 | 解密失败被当成空值，用户以为是自己没配。捕获解密失败并在界面上明说「请重新填写」，不静默兜底。见 §7.6 |
| 每次进设置页都发一次真实模型调用 | 探测端点自动触发——慢且花钱。可用性是四态（未配置/未测试/可用/不可用），探测只在用户点「测试连接」时发生。见 §7.8 |
| 用量热力图整体左移一格 | 按会话时区聚合时 `(at AT TIME ZONE $tz)::date` 缺了时区就按 UTC 切天——容器默认 UTC，**凌晨 0 点到 8 点的消耗全算到前一天**。时区取 `stats.timezone`（默认 `Asia/Shanghai`）并在图旁标出；`at` 是 `timestamptz`，换时区只是换聚合方式。见 §12.4 |
| 热力图把「有调用」画成空格子 | 未上报的用量被当成 0——兼容端点不回传 usage 时那天有调用却渲染成空白，等于图在说谎「我那天没用」。`usage_log` 的 token 三列**可为 null 且 null ≠ 0**；「有调用但用量未知」单独计数画成斜纹。见 §12.3 |
| 流式调用的用量记不到 | usage 只在末尾到达，只在 `for await` 正文时拿不到；把 `RUN_FINISHED` 提前消费掉更会漏。记账放在**包住整条流**的透传生成器里（`finally` 落账），不放在正文累加处。见 §12.2 |
| 换了头像界面上一直显示旧图 | 头像文件名不变（`<userId>.webp`），浏览器拿缓存旧图——界面上看起来「上传没反应」。指针里带版本：`user.image = /api/avatar?v=<时间戳>`。见 §12.6 |
| 先修了头像缓存，界面依然不动 | 会话 cookie 缓存住用户资料的旧值——**两个独立的陈旧源，只修一个不够**。`get-session` 在 `cookieCache` 的 `maxAge` 内直接读 cookie 里那份快照，而头像是绕开 Better Auth 直接写库的。`cookieCache: { enabled: false }`；`cookieCache.version` **不能**当资料指纹（读写是同一个对象，必然自洽）。见 §12.6 与 D-037 |
| 测试行为取决于本地是否跑过构建 | 静态资源的隐藏依赖——挂载静态资源显式判断 `NODE_ENV`，不看 dist 是否存在 |
| 上传的 `.html` 原件保存后多出脚本字节 | dev server 默认向 HTML 响应注入客户端脚本，连原件 API 也受影响；保持 `vite.config.ts` 的 `injectClientScript: false`，具体原因见该配置旁的注释 |
| 生产镜像里没有 `pnpm-workspace.yaml`，启动即抛错 | 仓库根靠标志文件查找——找不到时退回 `cwd` 而不是抛错；容器里全部传绝对路径 |
| 静态资源在仓库内正确、在镜像里 404 | 服务端产物被打包成 chunk，`src/` 与 `dist/` 的目录层级不同——`resolveWebDist()` 少算一级。Vite 的 SSR 构建开 `preserveModules`（配 `preserveModulesRoot: src`）+ 按候选路径探测 + `WEB_DIST` 显式指定，不要写死相对偏移量 |
| 服务端 dev 起不来（`EADDRINUSE`） | dev 入口自己调了 `serve()`，与 Vite 的 dev server 抢端口——监听只由生产入口 `src/index.ts` 做；`src/dev.ts` 只导出 `app`，交给 `@hono/vite-dev-server` |
| **AG-UI 流的第一条不是 `RUN_STARTED`** | 协议客户端在流开头硬校验，直接抛 `AGUIError: First event must be 'RUN_STARTED'`——**整轮一个字节都用不了**，而症状是「界面完全空白、控制台一句 AGUIError」。服务端拥有这一段的生命周期（D-099）：`createStream` 第一件事发自己的 `RUN_STARTED`，模型那一趟的剥掉不转发，终局 trace 抢在自己的 `RUN_FINISHED` 之前。测试把真实字节喂给 `@ag-ui/client` 守着顺序（只断言「有 RUN_STARTED」在顺序错时照样通过） |
| 用户永远看不到整轮真实耗时 | 终局 CUSTOM 发在 `RUN_FINISHED` 之后——报 `Cannot send event type 'CUSTOM': The run has already finished`。事件顺序：… → trace(整轮) → `RUN_FINISHED`；失败路径 `CUSTOM(mimir.failure)` 必须排在 `RUN_ERROR` 之前 |
| 命中 `Cannot send 'RUN_STARTED' while a run is still active` | 模型自带的 `RUN_STARTED` 直接转发，与这一轮自己的那条叠加。剥掉模型流的 `RUN_STARTED` / `RUN_FINISHED`，用量接住转挂到自己那条的 `metadata` 上（`assistant-stream.ts` 的 `runFinished`） |
| 模型连接错误时 `try/catch` 根本不执行 | 连接错误不抛异常，「每类失败给不同出路」静默失效。连接类错误以 `RUN_ERROR` chunk 顺着流发出来，既要看 chunk 也要留 catch |
| 界面永远显示「耗时 0.0s」 | trace 只量了检索耗时。整轮结束后再发一次带完整耗时的 trace 覆盖它 |
| **一条断言在两种模式下互相污染** | `MIMIR_LOCAL_MODE` 这类变量在 `env.ts` 模块加载时读一次，混进同一遍会全局改变鉴权与配置形状。本地模式有自己的 vitest 配置与进程（`vitest.local.config.ts`），`pnpm test` 连着跑两遍 |
| 目录路径百分号编码后找不到 | `URL.pathname` 含中文——一律用 `fileURLToPath`，不手工拼 pathname |
| vault 里多出测试文件 | 测试污染真实数据——测试库 + 测试目录双重隔离，目录名写错就中招（`data/.test/`） |
