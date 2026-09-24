# mimir 技术方案

> 配套文档：`PRD.md`（做什么）、`RESEARCH.md`（选型证据与实测数据）

---

## 1. 技术选型

| 层 | 选择 | 理由 |
|---|---|---|
| 前端 | Vite + React 19 + TanStack Router + TanStack Query | SSR 对单用户后台应用没有收益；TanStack Router 的类型安全路由省掉一层手写 |
| UI 库 | antd 6 | 已定。表格、表单、树、抽屉开箱可用 |
| 编辑器 | Tiptap 3 + `@tiptap/markdown` | 官方 markdown 序列化，往返幂等（见 PRD 5.4） |
| 构建期优化 | **React Compiler** | 自动记忆化，替代手写 useMemo / useCallback / memo |
| 后端 | Hono 4 + `@hono/node-server` | 浏览器扩展、脚本、CLI 都要调同一套 HTTP 接口，比 server function 更合适 |
| ORM | Drizzle 0.45 + postgres.js | 类型安全的 SQL，不引入第二套查询语言 |
| 数据库 | PostgreSQL 17 + pgvector 0.8 | 混合检索、任务状态、事务都在一个组件里 |
| 认证 | Better Auth 1.7 + drizzle adapter | 自托管单用户，邮箱密码足够 |
| AI | TanStack AI 0.55 | 见 §5 |
| 包管理 | pnpm workspace + **catalog** | 前后端共享类型包；依赖版本集中声明 |
| 类型检查 | **TypeScript 7.0** | Go 重写版。见下方说明 |
| Lint / Format | **oxlint + oxfmt** | 单命令跑全仓，比 ESLint + Prettier 快一个数量级 |
| 部署 | Docker Compose | 自托管，一个 Postgres 容器起步 |

### TypeScript 7 的说明

TS 7 是 Go 重写的编译器（`tsc` 是平台原生二进制，通过 `@typescript/typescript-*` 分发）。
本项目实测通过：三个包的类型检查、服务端构建、Vite 构建全部正常，Drizzle 的 schema 类型
推断没有出现问题。

**为什么值得记一笔**：选它的时候是刻意的风险——Go 重写版改变了编译器的实现，
类型推断的边界行为可能有差异。当时的判断是「先在 5.9 上跑通，等 7 稳定再升」，
后来实测证明两个版本在本项目的用法下行为一致。

### 被否决的方案

| 方案 | 否决原因 |
|---|---|
| TanStack Start | worker 与浏览器扩展都需要真实 HTTP 接口，server function 覆盖不了；SSR 无收益 |
| Next.js | 同上的 SSR 无收益，且 App Router 的复杂度换不来任何东西 |
| SQLite | 混合检索需要 FTS + 向量 + 事务在同一个查询里。SQLite 的 FTS5 没有中文分词，sqlite-vec 是纯暴力检索 |
| ParadeDB | 中文检索更强（内置 Lindera），但 Community 版是 **AGPL-3.0**。作为独立容器使用对个人无约束，但会成为一个需要解释的依赖。见 §4.4 的替代方案 |
| 现成 RAG 框架（Mastra RAG / LlamaIndex.TS / LangChain.js） | 它们都想接管文档与分块的数据模型，而本项目必须要 chunk 级引用指回自己的表。见 §6 |
| 一站式 RAG 平台（RAGFlow / Dify / FastGPT / AnythingLLM / Khoj） | 企业向、资源占用大（RAGFlow 最低 4 核 16G）、引用是黑盒。调研细节见 RESEARCH.md |

---

## 2. 总体架构

```
┌──────────────────────────────────────────────────────────┐
│  浏览器                                                   │
│  ┌──────────────────┐   ┌─────────────────────────────┐ │
│  │ React SPA        │   │ 浏览器扩展（M2）             │ │
│  │ TanStack Router  │   │ 在用户会话里抓取             │ │
│  └────────┬─────────┘   └──────────────┬──────────────┘ │
└───────────┼────────────────────────────┼────────────────┘
            │ HTTP/JSON                  │ POST 渲染后的 DOM
┌───────────▼────────────────────────────▼────────────────┐
│  服务端（Node）                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Hono API    │  │ 抓取器        │  │ 检索层          │  │
│  │ 鉴权/CRUD   │  │ capturer 接缝 │  │ leg 接缝 + 融合 │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                │                   │           │
│         │         ┌──────▼───────┐           │           │
│         │         │ worker 进程   │           │           │
│         │         │ jobs 表轮询   │           │           │
│         │         └──────┬───────┘           │           │
└─────────┼────────────────┼───────────────────┼───────────┘
          │                │                   │
┌─────────▼────────────────▼───────────────────▼───────────┐
│  PostgreSQL              │  文件系统                       │
│  documents / chunks      │  data/vault/  笔记（真相）      │
│  jobs / usage_log        │  data/raw/    原始快照          │
│  FTS + pgvector 索引      │  ← 数据库可从文件重建            │
└──────────────────────────┴───────────────────────────────┘
```

### 一条贯穿全局的规则

**文件是真相，数据库是可重建的索引。**

- 笔记正文在 `data/vault/年/月/标题-id.md`，纯文件，可以直接用 Typora / Obsidian / VS Code 打开（编辑器规范形见 PRD 5.4）
- 抓取的原始快照在 `data/raw/<hash>/`
- 数据库只存索引、元数据、任务状态、对话

**收益**：换 embedding 模型、改分块策略、升级解析器——都可以放心全量重跑，而不是数据迁移。

**代价**：写入要同时落文件和数据库，两边可能不一致。写入顺序固定为**先文件后数据库**：反过来会产生「数据库里有、文件打不开」的记录；正序最坏只是「文件已存在但尚未入库」，重建索引即可修复。

---

## 3. 目录结构

```
mimir/
├── apps/
│   ├── server/                  # 宿主：路由、鉴权、业务逻辑、数据库
│   │   └── src/
│   │       ├── index.ts         # 生产入口（起 node-server）
│   │       ├── dev.ts           # 开发入口（交给 @hono/vite-dev-server）
│   │       ├── boot.ts          # 两个入口共用：启动准备 + 路由装配
│   │       ├── app.ts           # 路由装配
│   │       ├── auth.ts          # Better Auth 配置
│   │       ├── env.ts           # 环境变量集中校验
│   │       ├── db/              # schema + 迁移 + client
│   │       ├── lib/             # text / vault / http / static
│   │       ├── search/          # 检索的宿主适配层（注入 snippet 端口）
│   │       ├── services/        # 业务逻辑（写入路径、问答、抓取编排）
│   │       ├── routes/          # HTTP 路由
│   │       └── plugins/         # **装配层**（host.ts）——见下
│   └── web/                     # React SPA
│       └── src/
│           ├── routes/          # 路由（根路由承担鉴权守卫）
│           ├── components/      # 含 settings/（各分区）
│           ├── editor/          # Tiptap 扩展与保真测试
│           ├── theme/           # 设计 token、外观状态、provider、守门测试
│           └── lib/             # API 客户端 / Query / 路由 context
├── packages/
│   ├── shared/                  # 契约：zod schema + 类型 + 插件接口（源码发布）
│   ├── core/                    # 插件宿主骨架：注册表 + 配置 + 融合 + 编排
│   └── tokenizer/               # 中文分词（写入与检索两侧共用同一份规则）
├── plugins/                     # 插件实现（独立 workspace 包）
│   ├── capturer/                # URL → 原始内容（网页 / 公众号 / GitHub）
│   ├── parser/                  # 原始内容 → Markdown（直通 / Readability）
│   ├── leg/                     # 查询 → 排序好的检索单元 id（关键词 / 子串）
│   ├── provider/                # 角色 → 模型适配器（OpenAI 兼容）
│   └── storage/                 # key → 字节（本地磁盘 / S3）——见 §7.2
├── output/                      # 交互原型（单文件静态页）
├── docs/
└── data/                        # 运行时数据，不进 git
```

### 三个包与一个目录的分工

| 位置 | 是什么 | 依赖谁 |
|---|---|---|
| `packages/shared` | **契约**。API 形状、插件接口、运行接口 | 只有 zod |
| `packages/core` | **骨架**。注册表、配置三层解析、RRF、检索编排 | shared |
| `packages/tokenizer` | 分词规则。写入与检索两侧**必须**是同一份 | 无 |
| `plugins/*` | **实现**。每条接缝的具体做法 | 只有 shared |
| `apps/server/src/plugins/host.ts` | **装配**。全仓唯一同时知道宿主与插件的地方 | 两边都有 |

**依赖方向是单向的**，这是「核心保持精简」可验证的条件：

```
插件实现 ──→ shared（契约）
   ↑
宿主装配 ──→ core（骨架）+ 插件
```

插件**不 import 宿主**（想 import 会直接解析失败——它们是独立包，
不是 `apps/server` 的子目录），宿主的核心逻辑**不 import 任何插件**
（`search/`、`services/` 只认 `shared` 里的接口）。所以：

- 加一个实现 = 加一个文件 + 在它的 `install()` 里注册一行
- 删掉一个插件包 = 宿主仍能编译（那个接缝少一个实现而已）

`packages/shared` 单独存在的理由：API 的请求/响应形状只定义一次，
服务端用它做运行时校验，前端用同一份定义做类型。现在它还多一个身份——
**插件契约的落点**：放在 core 里会让插件必须 import core，
而 core 又要 import 插件来装配，形成包级循环。

---

## 4. 检索设计

### 4.1 结构：多通道召回 + 加权 RRF 融合

```
查询
 ├─ 通道 1：关键词（jieba 分词 + GIN）  ─┐
 ├─ 通道 2：子串兜底（pg_trgm）        ─┤→ 加权 RRF → 取前 N →（M1）rerank → 组装上下文
 └─ 通道 3：向量（pgvector HNSW，M1）  ─┘
```

通道是**接缝**：每个通道独立召回一批已排序的 id，融合层只认这个形状。M1 加向量通道时，融合层一行不用改。

### 4.2 为什么用 RRF 而不是加权求和

不同通道的分数不可比：`ts_rank_cd` 落在 0~1 但分布诡异，BM25 经常大于 10。直接加权求和会让分数尺度大的通道单方面主导。RRF 只看**名次**，天然免疫尺度问题。

```
score = Σ weight_i / (k + rank_i)      # k = 60，权重可配
```

同一个 id 出现在多个通道会获得叠加分数——这正是混合检索的价值：两个通道都认可的文档，排序应当高于只有一个通道认可的。

**一个易踩的坑**：BM25 分数无界，进入 rerank 前必须先折叠到 [0,1]，否则会淹没其他评分项。

### 4.2.1 召回门槛：至少命中一半的查询词

关键词通道**不能**用 `plainto_tsquery` 的 AND 语义。它会要求每个词都出现在
同一篇文档里，于是自然语言提问全盘落空：

```
问：「React 重渲染范围怎么缩小？」
切词：react / 重渲染范围 / 缩小
AND：要求三个词同时出现 → 命中 0 条
```

改成纯 OR 又太宽——`zzzz不存在的内容zzzz` 也会返回十几条（「内容」出现在
太多文档里）。

**采用「命中词数 ≥ 查询词数的一半」（向上取整，至少 1 个）**，排序仍交给
`ts_rank_cd`：命中的词越多、越集中，排得越前。两个通道用同一个门槛。

查询侧先过一遍 `queryTokens()`（`lib/segment.ts`）：去掉纯标点、单个汉字、
疑问词与结构助词。它们不承载检索意图，却会抬高门槛。
**这个过滤只用于查询，不用于索引**——索引侧必须保留全部词元，
删掉会让短语子串匹配失效。

这样做也免掉了停用词表：门槛挡住了「只有通用词命中」的文档。

### 4.3 为什么需要子串兜底通道

Postgres 的 `simple` 配置没有中文词边界概念，「组件性能优化」会被当成**一个** token，用户搜「组件」永远搜不到。所以写入时用 jieba 切好、以空格连接存进 `search_text` 列。

但如果分词切错了，或者**查询侧与索引侧切得不一样**，词级通道就永远命中不了。实测的例子：

```
问：「React 重渲染范围怎么缩小？」
jieba 切查询：react / 重渲染范围 / 缩小
正文索引里是：重渲染 / 范围 / ...
```

「重渲染范围」作为一个词在词级通道上永远命中不了，而正文里明明有这四个
连续的汉字。子串通道用 `pg_trgm` 索引做 `ILIKE`，不受分词结果影响。

**逐词匹配，不是整串**。原实现拿整条查询串去 `ILIKE '%...%'`，对「向量检索」
成立，但对一句话提问永远不可能命中——没有任何正文包含那整句话。
这个「兜底」在真正需要它的场景里恰好是失效的。

权重低于词级通道（没有词边界语义）。门槛与词级通道一致。

排序用「首次出现位置越靠前越好、文档越短越好」——比算全文相似度便宜得多，而且 trigram 索引只负责过滤不负责排序。

### 4.4 中文分词的实现

```ts
// 关键：必须用 withDict 显式加载词典，且只传词典
const jieba = Jieba.withDict(dict)   // dict 来自 '@node-rs/jieba/dict.js'
```

**两个踩过的坑**：

1. `new Jieba()` 不带词典会**退化成逐字切分**（「组件」→「组」「件」），分词等于白做
2. `withDict` 只接收词典；idf 是 TfIdf 关键词提取用的，分词不需要

`@node-rs/jieba` 是 Rust 实现，有 linux-x64-gnu/musl 预编译包，Node 22 直接可用，无编译步骤。

**替代方案**（若不愿引入原生依赖）：应用侧用 `@node-rs/jieba` 之外的分词器，或改用 ParadeDB 的内置 `chinese_lindera`（换镜像 + 接受 AGPL）。`Intl.Segmenter` **不可用**——实测把「组件」切成「组/件」、「纪录片」切成「纪录/片」，质量明显不达标。

### 4.5 向量维度：一个硬约束

实测（`pgvector/pgvector:pg17`，PostgreSQL 17.11，pgvector 0.8.6）：

```
vector(1024) + hnsw        → OK
vector(2048) + hnsw        → ERROR: cannot have more than 2000 dimensions
vector(3072) + ivfflat     → ERROR: cannot have more than 2000 dimensions
halfvec(3072) + hnsw       → OK
halfvec(4000) + hnsw       → OK
halfvec(4001) + hnsw       → ERROR: cannot have more than 4000 dimensions
```

**结论**：选 1024 维的 embedding 模型最省事。超过 2000 维必须用 `halfvec`，或者用服务商的降维参数。

**多模型共存的做法**（借自 WeKnora 的生产实践）：embedding 独立成表，用**按维度分区的 partial index**：

```sql
CREATE INDEX ON embeddings USING hnsw ((embedding::halfvec(1024)) halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64) WHERE (dimension = 1024);
```

这样一张表能同时容纳多个不同维度的模型，换模型时旧向量不必立刻删除。

### 4.6 实测性能

| 项 | 数据 |
|---|---|
| HNSW 向量检索 | 5000 向量 top-10 = **0.084 ms** |
| GIN 全文索引（20 万行，1.5 MB 索引） | 高选择性查询走 Bitmap Index Scan = **0.026 ms** |
| RRF 融合 | 单条 SQL（两个 CTE + full outer join）完成 |

### 4.8 M1：检索单元下沉到分块

**M0 的检索单元是文档**（通道返回文档 id，片段是正文里现截的窗口）。
M1 要「引用可点回原文位置」，而文档级的命中点不出位置——只能拿查询词去
`strpos` 猜，猜不到就退回头 240 字。所以 M1 把检索单元下沉到**分块**：

| | M0 | M1 |
|---|---|---|
| 通道返回 | 文档 id + 名次 | **分块 id + 名次** |
| 融合 | 文档级 RRF | 分块级 RRF（同一篇的多个分块是多个候选） |
| 引用定位 | 查询词首次出现位置 | 分块自身的 `[start, end)` 偏移 |
| 相邻上下文 | 窗口前后各 80/240 字 | **合并相邻分块**（chunk 链） |

**前端的契约不变**：`SearchHit` 仍是 `{documentId, title, snippet:{text,start,end}, matchedBy}`。
变的只是服务端从「文档」换成「分块」再组装回这个形状——所以界面、引用卡片、
「跳回原文并高亮」都不用改，而引用位置从「猜的」变成「索引里记的」。

`chunks` 表（派生数据，可从 `documents.body` 完全重建）：

```sql
CREATE TABLE chunks (
  id          TEXT PRIMARY KEY,          -- '${documentId}:${index}'，确定性
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  idx         INTEGER NOT NULL,          -- 从 0 开始
  content     TEXT NOT NULL,
  search_text TEXT NOT NULL,             -- jieba 预分词（铁律 4）
  start_at    INTEGER NOT NULL,          -- 相对正文的字符偏移
  end_at      INTEGER NOT NULL,
  heading     TEXT,                      -- 所属标题路径，如「部署 / 已知坑」
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, idx)
);
-- 与 documents 上那两个同构：词级走 search_text，子串兜底走 content
CREATE INDEX chunks_search_idx ON chunks USING gin (to_tsvector('simple', search_text));
CREATE INDEX chunks_content_trgm_idx ON chunks USING gin (content gin_trgm_ops);
```

三处刻意的选择：

1. **id 是确定性的**（`文档 id:序号`），不是随机串。重建索引后「同一篇的同一段」
   仍是同一个 id，于是 `chunk_embeddings` 上的 `ON CONFLICT` 是**更新**而不是
   插入新行——否则每重建一次就攒一批孤儿向量
2. **偏移是相对完整正文的**（不是相对分块），引用与高亮直接可用，不需要再加一层换算
3. **不存 `is_enabled`**。`RESEARCH.md` §1.2 记的是「采纳」三处，这一处**推迟**：
   它的用途是「不删也能把某段排除出检索」，而那需要一个「排除这一段」的动作
   才成立。先加后忘的字段会变成没人读的列（`documents.deleted_at` 之外，
   本项目还没有第二个这种字段）

**`chunk_embeddings` 独立成表**（WeKnora 的生产实践，`RESEARCH.md` §1.2 已采纳）：

```sql
CREATE TABLE chunk_embeddings (
  chunk_id  TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  model     TEXT NOT NULL,               -- 换模型时旧向量共存，不立刻删
  dimension INTEGER NOT NULL,
  embedding halfvec NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chunk_id, model)
);
-- 每个维度一条 partial index：一张表容纳多个不同维度的模型，且不需要改 DDL
CREATE INDEX chunk_embeddings_1024_idx ON chunk_embeddings
  USING hnsw ((embedding::halfvec(1024)) halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64) WHERE (dimension = 1024);
```

**用 `halfvec` 而不是 `vector`**：维度上限 2000 → 4000（§4.5 实测）。
**索引建在 `embedding::halfvec(1024)` 这个表达式上**，所以向量通道的查询
必须写成同一个表达式（`embedding::halfvec(1024) <=> $1`）并带上
`WHERE dimension = 1024`，否则索引静默不命中——这是本期最容易踩的一处。

### 4.9 分块器：确定性、可逆、按结构切

`lib/chunk.ts`，三条硬要求：

| 要求 | 为什么 |
|---|---|
| **确定性** | 同样输入必须切出同样的块。否则每次重建索引都产生新的 chunk id，向量表持续膨胀 |
| **偏移可逆**：`body.slice(start, end) === content` | 引用要能跳回原文。这条是**测试里的断言**，不是注释里的承诺 |
| **按结构切** | 代码块不能被从中间切开；标题是天然的边界；段落优先于字符数 |

顺序：按行扫描 → 围栏代码块整体作为一个不可分单元 → 标题行开启新的一节 →
累积段落直到 `chunk.size` → 超长段落按句末标点（`。！？；\n`）再切 →
仍超长则硬切。`chunk.overlap` 从**上一块尾部**按句边界回退若干字符作为本块的
开头（所以相邻块确实重叠，但 `body.slice` 仍然逐字节等于 `content`）。

**段内的标题路径写进 `heading`**：命中一个分块时，把「部署 / 已知坑」一起带进
上下文，模型知道这段话属于哪一节；界面上引用卡片也能显示它。

### 4.10 向量化：写时增量、失败不阻断、可全量重跑

| 时机 | 做什么 |
|---|---|
| 保存笔记 / 抓取入库 | 分块重建（同步、纯计算）+ **尽力**嵌入（同步、非致命） |
| 重建索引（`POST /maintenance/reindex`） | 从文件重建 documents，然后分块；嵌入交给下一项 |
| 补嵌入（`POST /maintenance/embed`，分批） | 找出「有分块、无向量」的那些，按批调用并写回 |

**嵌入失败绝不让写入失败**：检索是可选能力，笔记是核心。provider 挂了、
没配 key、限流——都只是「这一段暂时搜不到语义」，而文件与数据库的写入必须成功。
失败留日志与计数，界面上以「待嵌入 N 段」的形式如实显示。

**全量补嵌入分批、可重入**：每批 `EMBED_BATCH`（默认 16 段）调用一次
`embed()`，写回后继续。中途失败或重启，下一次从「还没有向量的分块」继续——
因为**判据是向量表里有没有行，不是进度计数器**。这条让重入变成天然性质，
而不是要靠记状态维持的东西。

M1 后段的 `jobs` 表 + 进程内 worker（§2 架构图里的那层）会把这一批批循环
交给后台跑，届时界面上的「待嵌入 N 段」变成有进度的任务。现在先用端点触发，
因为**批处理逻辑与触发方式无关**，先证明逻辑对，再决定谁来按按钮。

### 4.11 检索模式与通道

`SearchQuery.mode` 一直存在（`keyword | semantic | hybrid`），M0 只实现了
keyword 的语义（注册表里只有两个通道，全跑）。M1 把 mode 落成**通道筛选**：

| mode | 跑哪些通道 | 何时是默认 |
|---|---|---|
| `keyword` | keyword + substring | 没有可用的向量通道时（默认） |
| `semantic` | vector | — |
| `hybrid` | 全部已注册且就绪的通道 | 向量通道就绪时（默认） |

默认模式**由注册表推导**（有就绪的向量通道 → hybrid），不是硬编码：
用户配好 embedding 模型之后，不需要再去哪里把默认值改过来。
检索过程中实际跑了哪些通道会写进 `SearchResponse.channels` 与每条的
`matchedBy`，所以「为什么这条被选中」在界面上始终可解释（§5.6 的 trace 也是同一来源）。

**融合前不做分数归一**：RRF 只看名次，这正是选它的理由（§4.2）。
**融合后进上下文前必须折叠**：BM25 / `ts_rank_cd` 无界，直接当相关性分数用
会淹没别的项——这条借自 WeKnora 的生产实践（`RESEARCH.md` §1.2）。

**引用组装（分块 → 引用卡片）**：

1. 按融合分排序取前 N（默认 8）
2. 同一文档的**相邻分块合并**（`idx` 连续则合成一段，偏移取并集）
3. 每篇文档最多贡献 `MAX_CHUNKS_PER_DOC`（默认 3）条，避免长文霸屏
4. 仍按总分排序，编号与 `citations` 下标一一对应（模型写 `[1]` 就能对上卡片）

第 2、3 步是 M0 的 trace 里已经承诺过的行为（「读取命中的文档并合并相邻分块」），
M0 没有分块表所以做不到；M1 补上。

## 4.12 React Compiler

通过 `@vitejs/plugin-react` 的 `compiler` 选项开启：

```ts
react({
  compiler: { logDiagnostics: true },
})
```

### 只需要一个额外依赖

插件把三个包列为 optional peer，但 `react({ compiler: true })` **只走 OXC 路径**：

```js
// 我们走的这条
const loadCompiler = async () => await import("oxc-transform-react");

// 另一条：单独导出的 reactCompilerPreset，走 Babel
const reactCompilerPreset = (options) => ({
  preset: () => ({ plugins: [[import.meta.resolve("babel-plugin-react-compiler"), options]] }),
});
```

所以 `package.json` 里只声明 `oxc-transform-react`。另外两个仍会出现在
`node_modules` 里，那是 pnpm 的 `autoInstallPeers` 默认行为，不是我们的依赖。

**验证方式**：删掉那两个包的声明前后，构建产物**逐字节一致**（805393 字节）。
这比读文档可靠——文档说「需要 oxc-transform-react」，但没说另外两个是另一条路径的。

**版本选择**：插件的 peer 范围是 `^0.145.0`。对 0.x 版本，caret 的含义是
`>=0.145.0 <0.146.0`——所以必须装 0.145.x，装最新的 0.150.0 会报 unmet peer。

### `logDiagnostics: true` 为什么留着

它会把「编译器跳过了某个组件」打出来。默认情况下编译器**静默跳过**无法优化的组件，
你只会觉得「好像没变快」而查不出原因。

开着它当场抓到了两个真实问题：

1. **`eslint-disable-next-line react-hooks/exhaustive-deps` 让整个组件被跳过。**
   编译器不做规则被抑制的组件——抑制 hook 规则通常意味着代码违反了 Rules of React，
   优化后行为无法保证。正确的修法是把代码改成符合规则，而不是关掉诊断。
   见下方「用 ref 承接只读一次的初始值」。
2. **ref 声明在使用它的 effect 之后也会被跳过。** 报的是
   `react-compiler(Immutability): This value cannot be modified`，指向 `ref.current = x`。
   把声明移到 effect 之前即可。这类问题不报错，只是静默不优化。

### 一条通用模式：只读一次的初始值用 ref

```ts
// ❌ 放进依赖数组 → 每次保存回写都重建编辑器，丢光标位置
// ❌ eslint-disable 排除 → React Compiler 跳过整个组件
// ✅ 用 ref 快照：既符合 Rules of React，又只在挂载时取一次
const initialBodyRef = useRef(doc.body)
useEffect(() => {
  const editor = new Editor({ content: initialBodyRef.current, ... })
  return () => editor.destroy()
}, [])
```

同理，「让回调读到最新值但不必重建」也用 ref 承接，并在**声明顺序上放在使用它的
effect 之前**。

## 5. AI 接入：TanStack AI

选型对比与证据见 `RESEARCH.md`。这里只写结论与用法。

### 5.1 它提供什么

能力拆成可 tree-shake 的 activities：`chat` / `embed` / `rerank` / `summarize` / 图像音频视频。本项目用到前三个。

关键的 `openaiCompatible` 工厂：

```ts
const deepseek = openaiCompatible({
  name: 'deepseek',
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_KEY!,
  models: ['deepseek-chat', 'deepseek-reasoner'],
})
chat({ adapter: deepseek('deepseek-chat'), messages })
```

一套适配器覆盖 DeepSeek / 通义 / 智谱 / Kimi——它们都提供 OpenAI 兼容端点。

### 5.2 三个需要注意的边界

1. **`openaiCompatible()` 只覆盖 chat。** embedding 要走 `createOpenaiEmbedding(model, apiKey, config)` 并传 `baseURL`（它继承 OpenAI SDK 的 `ClientOptions`），但模型名在类型上被限制成 OpenAI 的字面量联合类型，接国产模型需要 `as` 或写自定义适配器。自定义适配器只有约 30 行（`BaseEmbeddingAdapter` 只有一个方法）。
2. **rerank 适配器的路径写死了。** Cohere 适配器请求 `${baseURL}/v2/rerank`，而国产 rerank 服务多是 `/v1/rerank`。需要自己包一层 `BaseRerankAdapter`。
3. **`summarize()` 需要单独的适配器，不是 chat 的别名。** `createOpenaiSummarize` 是另一个导出（`@tanstack/ai-openai` 的 `adapters/summarize.js`），与 `chat` 签名不同。M1 的自动摘要走它，而不是拿 chat 假装。

**这三条是 `plugins/provider/` 存在的理由**：把「哪个角色用哪个工厂函数、
模型名要不要断言、路径要 patch 成什么」全部收在一个接缝里，
上层只问「给我一个能干活的东西」（`TECH.md` §7.4）。M1 先实现
chat / summarize / embed 三个角色，rerank 留到需要它的时候——
**接口先于第二个实现定型，但不为还没写的实现写代码**。

### 5.3 版本风险

0.55.0，2025-12 首发，基本周更。风险缓解：**锁死精确版本**；因为适配器层是薄接口（`BaseRerankAdapter` / `BaseEmbeddingAdapter` 都是单方法抽象），真出问题换掉的成本可控。

**已核实（0.55.0 的 dist 类型声明）**：`@tanstack/ai` 根入口导出
`chat / embed / rerank / summarize`，适配器基类从
`@tanstack/ai` 与 `@tanstack/ai/adapters` 都可达（`BaseEmbeddingAdapter`
在 `activities/embed/adapter.d.ts`，根入口也 re-export）。所以上面第 3 条
不是猜测——`activities/summarize/index.d.ts:144` 与
`activities/embed/index.d.ts:111` 的签名都读过了。

### 5.4 对话的流式接入

M0 的对话**不是**「一次请求一次响应」，而是 AG-UI 协议的服务端事件流
（`toServerSentEventsResponse`），由前端的 `useChat` 消费。

事件的顺序是刻意的：

```
mimir.conversation  →  mimir.trace  →  mimir.citations  →  正文
```

前三个在**模型还没开始生成时**就发出去，于是引用卡片与检索过程立刻出现，
用户不必对着空白等模型。三个名字与载荷定义在 `packages/shared`
（`EVENT_TRACE` 等），前后端共用——两边各写一遍字符串的话，
打错一个字母是静默失效。

**为什么走自定义事件而不是协议原生的 part**：
`THINKING_*` 只是一个字符串，而 trace 是结构化的分步记录（每步带图标、
关键词、具体数字）；citations 含文档 id 与字符偏移，协议里没有对应形状。

**会话 id 放在请求体（`forwardedProps`）而不是 URL**：`useChat` 在 connection
变化时会重建 ChatClient，重建会切断正在进行的流。代价是新建会话时客户端
不知道 id，所以服务端用 `mimir.conversation` 事件回传。

非流式的 `POST /api/conversations/:id/ask` 保留：测试与 curl 用它，
且与流式版**共用同一套检索**（`search()`），所以不会出现「界面看到的引用
和测试验证的引用不一样」。

### 5.5 前端：用 SDK 的 UI 层，不手搓

| 层 | 用什么 |
|---|---|
| 消息状态与流式接收 | `@tanstack/ai-react` 的 `useChat` |
| 消息渲染 | `createChatUI`（`@tanstack/ai-react/ui`）+ 官方 `TextPart` |

`TextPart` 自带**流式 markdown 解析**（处理半截语法）、HTML 转义与代码高亮入口。
自己写一份意味着要自己处理「`**` 只到了一半」这种中间态，以及 XSS 转义。

`lib/use-mimir-chat.ts` 是对话状态的唯一入口，组件不直接碰 `useChat`。
它只做四件 SDK 不该知道的事：会话 id 维护、自定义事件收进 state、
让 TanStack Query 失效、把引用回传给中栏。

**两个必须踩对的接口细节**：

1. `useChat` 只在**挂载那一刻**读 `initialMessages`（它内部把客户端建在
   `useMemo(..., [])` 里）。所以打开历史会话时必须等数据取回再挂载对话体。
   先挂载再补数据的症状是**右栏一直空白，而中栏的「本次引用」正常显示**——
   两栏说的不是同一件事。
2. 新会话的第一问会「建会话 → 写 URL」。如果对话体的 key 直接跟着 URL 的 id
   走，这次导航会**把刚挂载的对话体卸载重建**，把正在接收的流丢掉
   （症状：提问后右栏什么都不显示，而消息其实已经落库）。
   所以路由里区分「自己刚创建的 id」（不重挂载）与「导航切换过去的」
   （重挂载并灌历史）。

### 5.6 编辑器：也用 SDK 的包装

正文编辑器用 `@tiptap/react` 的 `useEditor` + `EditorContent`，
不用 `new Editor()` 手写实例管理。

区别是实质性的：`useEditor` 把传入的**每个回调都包一层**、从
`options.current` 读取，所以回调里直接用最新的 props/state 就行。
手写版需要三个「必须靠注释提醒自己」的约束（ref 承接回调、
ref 声明顺序在 effect 之前、初始值用 state 而非 ref），全部消失。

`deps` 传空数组时它只 `setOptions` 而不重建实例——正好满足
「保存回写不丢光标」这个要求。

**内联工具条用官方的 `BubbleMenu`**（`@tiptap/react/menus`）：
跟随选区定位、滚动重算、视口边缘翻转、点工具条不取消选区，
这四件事它都做好了。自己算 `getBoundingClientRect` 会在长文滚动、
换行选区、触屏这三个场景出错。里面放的是 antd 控件——
BubbleMenu 只管浮层位置与显隐。

「改写 / 翻译 / 精简 / 扩写」需要模型侧的内联改写能力（M1），
M0 **保留但禁用**并在 tooltip 里说明——直接删掉用户会找不到入口，
做得像能点却没反应是最坏的一种。

### 5.7 供应商、模型与角色

模型配置有两层，**它们是不同的东西**：

```
供应商（连接）        角色（用途）
┌──────────────────┐   ┌─────────────────────┐
│ DeepSeek          │   │ 对话   → DeepSeek / deepseek-chat
│  ├ 地址           │   │ 深度思考 → DeepSeek / deepseek-reasoner
│  ├ 密钥（加密）    │   │ 摘要   → （留空，回落对话）
│  └ 模型列表        │   │ 向量化 → 硅基流动 / BAAI/bge-m3
├──────────────────┤   └─────────────────────┘
│ 硅基流动          │            ↑
│  └ …             │      绑定是 (供应商, 模型) 一对
└──────────────────┘
```

**一次配置 = 一个供应商实例**，所以同一家可以配两次（两个账号、
或一个云端一个本地推理）。要一个云端做对话 + 一个本地做向量化，
建两条即可——不需要任何「多实例」的特殊机制，因为列表本身就是形状。

**加一家服务商是加一行数据**（`plugins/provider/src/presets.ts`），
不是加代码：预设里只说「用哪个适配器族、baseURL 是什么、建议哪些模型」。
适配器族（`openai-compatible`）管的是**协议**，预设管的是**哪一家**。

| 角色 | 特点 | 回落规则 |
|---|---|---|
| `chat` | 量小、要求高 | 必填 |
| `reasoning` | 深度思考时切换 | 未绑定时用 `chat` |
| `summarize` | 量大、要求低 | **留空即回落到 `chat`** |
| `embed` | 量最大 | **没有回落**——它必须是 embedding 模型 |
| `rerank` | 未实现 | — |

**绑定为什么是一对而不是一个模型名**：多供应商下裸模型名会歧义
（两家都有 `glm-4`），于是要么禁止重名、要么给模型名加前缀。
`docs/RESEARCH.md` 记了一个因裸 id 寻址而不得不发明前缀的实例——
那是把耦合写进了用户可见的名字里。

**摘要留空回落 `chat`**：用强模型做摘要只是浪费钱，不是错误。
而 `embed` 没有回落：**向量通道的「不可用」是一个明确状态**，
不能悄悄用对话模型去算向量。

#### 密钥的三态（界面上必须能区分）

| 用户做什么 | 提交什么 | 结果 |
|---|---|---|
| 不改密钥，只改名字 | 不传那个供应商的草稿 | 保留已存的密钥 |
| 新填一把 | 传新值 | 加密后替换 |
| 点「清除」 | 传空串 | 删掉 |

中间那一列是整块配置里**唯一需要理解的部分**：不传与传空串的含义完全不同，
而搞错的后果是密钥被静默清掉（`plugins/provider/src/instances.ts` 的
`fromWire` 负责合并，`instances.test.ts` 有三条断言守着这三个状态）。

#### 校验分三层

| 层 | 何时 | 做什么 | 成本 |
|---|---|---|---|
| 格式 | 写入时 | 地址是 http(s)、id 唯一、新增的必须有密钥 | 零 |
| 连通性 | 点「测试连接」 | 真的发一次请求（有模型时发最小对话；没有则拉一次 `/models`） | 一次调用 |
| 角色适配 | 选角色时 | 向量化角色只列 embedding 模型 | 零 |

第三层**必须有**：不做的话用户会把对话模型选进向量化角色，
然后到第一次写入向量时才失败。判据用模型名里的 `embed` / `bge` 这类词
（不精确，但失败方向是安全的——误判只让用户多看到一个选项）。

供应商级探测**不依赖角色绑定**，这是它存在的理由：新建供应商时它不属于
任何角色，而用户此刻最想知道的就是「这个地址和密钥通不通」。
`tookMs` 一起返回，用来区分「慢」与「不通」。

#### 从供应商拉模型列表

四个同类产品都有这个动作（`docs/RESEARCH.md`）。它**不花 token**
（`GET /models`），所以可以放心点。拉取成功后写回该供应商的模型列表，
并把来源标成 `fetched`；**用户手加的模型（`manual`）不会被冲掉**。

预设里也给几个建议模型：刚填完密钥时可能连不上（容器里、被墙、
本地服务还没加载模型），那时预设列表让用户仍然能建起一个能用的配置。

另外：按**内容哈希缓存摘要**，文档没变就不重复调用。`usage_log` 记录每次调用的
token、耗时与成败——**金额暂不记**：token 是供应商回传的事实，金额是我们按单价
换算出来的推导值。理由见 §12.5 与 D-035。

---

## 6. 为什么不用现成的 RAG 框架

调研了三个层次，都不合适：

| 方案 | 为什么不用 |
|---|---|
| RAGFlow（91k★，Apache-2.0） | 最低 4 核 / **16GB 内存 / 50GB 磁盘**，编排拉起 ES/Infinity + MySQL + MinIO + Redis + NATS + ClickHouse。引用是它自己 UI 里的引用，接进自己的表要对抗它的数据模型 |
| Dify（156k★） | 修改版 Apache，含商业限制条款。是平台不是库 |
| Mastra RAG（Apache-2.0） | 分块器与 reranker 不错，但 `@mastra/core` 是 peer 依赖（31 个直接依赖），且 `@mastra/pg` 会接管向量存储，与自己的 Drizzle schema 形成两个真相源 |
| LlamaIndex.TS | `@llamaindex/postgres` 是 0.0.66，依赖 `pg-promise`——又一个 PG 驱动与 Drizzle 并存 |
| chonkie | 轻量分块器，但周下载 896，且依赖 `@huggingface/transformers`，为一个小功能引入太重 |

**结论**：检索层就是约 100 行 SQL 加一个分词函数。这不算「手搓 AI」——模型调用（chat / embed / rerank / summarize）全部交给 TanStack AI，自己写的只是 SQL 查询和分块，而这两件事恰恰必须贴合自己的 `documents` / `chunks` 表。

---

## 7. 插件架构：注册表 + 配置分层

### 7.1 定位

「插件架构」在实践里指向两种完全不同的东西：

| | 外部插件市场 | **内部接缝（本项目）** |
|---|---|---|
| 是什么 | 公开 API，第三方能写插件 | 代码按接缝组织，加实现＝加文件 |
| 要付出 | 版本化 API、兼容性承诺、文档、沙箱、权限模型 | 一个注册表 + 一份接口定义 |
| 适合 | 有生态野心的产品 | 个人项目 |

用户的目标是「代码好维护」，对应的是第二种。做成第一种会引入比它解决的问题更多的维护负担。

**WeKnora 的二次调研（`RESEARCH.md` §1.5）改了一处认知**：它没有插件框架——
`Cordis` 只存在于一个给别的东西写的客户端插件包里，主干里那 15 个「plugin」
是一个中间件链。它真正值得抄的是三个机制，本章就是这三条：

1. **注册表 + 可用性探测**（7.4）：实现自己回答「我能不能干活、为什么不能」
2. **配置三层解析**（7.5）：DB 行 > 环境变量 > 内置默认，键集是闭集
3. **注册表就是设置页**（7.6）：界面上每一行都对应代码里的一个实现或一个键

### 7.2 接缝清单

| 接缝 | 输入 → 输出 | 已有实现（`plugins/`） | 规划 |
|---|---|---|---|
| `capturer` | URL → **原始内容** + 元数据（不转换格式） | 网页、公众号、GitHub | RSS、Star 同步、扩展 |
| `parser` | 原始内容 → 统一 Markdown（不抓取、不写库） | Markdown 直通、HTML 正文提取 | PDF、Word |
| `leg` | 查询 → 已排序的**检索单元** id 列表 | 关键词、子串兜底 | 向量、重排序 |
| `provider` | 角色 → 模型适配器 | openai-compatible（chat / reasoning / summarize / embed） | 原生 Ollama、rerank |
| `storage` | 相对路径（key）→ 字节 | **本地磁盘**（默认）、S3 / 对象存储 | WebDAV、其他兼容端点 |

抓取与解析**拆成两条接缝**是这次重构的一处实质改动：原先
「网页怎么变成 Markdown」写在抓取器里，于是换 HTML 转换策略要改三个抓取器。
现在抓取器只负责「把内容拿下来」（站点特有的知识：公众号的 `#js_content`、
GitHub 的 API 与限额），解析器只负责「HTML → Markdown」。
`CaptureRaw` 里的 `content` 是 `{type: 'html'} | {type: 'markdown'}`，
解析器用 `accepts` 声明自己能处理哪些类型——**宿主按声明选实现，
不用 try 一遍看谁不报错**（GitHub 的 README 本来就是 md，再走 HTML 转换是倒退）。

#### `storage`：与其他四条有一处本质不同

前四条都是**复数**的：多个 leg 一起跑（融合），其余三条按 URL / 输入类型 /
角色**各选一个**，但同一时刻可能不止一个在干活。存储是**单数**的——
任何时刻只有一个后端在用，其余是**备选**。所以未选中的那个不能显示成「可用」，
否则设置页会说「两个存储后端都可用」而实际只有一个是真相
（`RESEARCH.md` §10.6）。这带来契约上的一处放宽，见 §7.4 的 `unavailable(read)`。

key 是**相对 `DATA_DIR` 的 POSIX 路径**（`vault/…`、`raw/…`、`avatars/…`）：
本地后端下它与磁盘路径一一对应（所以 Typora / Obsidian / git 照旧可用），
换 S3 时同一批 key 直接是桶内对象名。三个前缀也延续了 D-036 的边界——
头像不在 `vault/` 下，因此不进分词、不进导出、不进重建索引的扫描范围。

**明确不做成接缝的**（`DECISIONS.md` D-031，**已由 D-038 收窄**）：
向量库、图数据库。本项目只有 Postgres 一个后端，把它抽象成可切换的存储引擎，
代价是所有查询要过一层接口，收益是零——WeKnora 支持 10 种向量库是因为它要卖给
什么栈都有的企业。**Postgres 同时是关系库、全文索引与向量库**，
这是本项目的简化前提，不是待替换的组件。

> **注意这里原先还列着「对象存储」**，D-038 已把它移出并做了接缝。
> 理由不是「用户想要」，而是 D-031 自己给的判据：
> **有多实现的地方抽接缝**。数据库没有第二个实现，文件存储**有**（本地与 S3），
> 而且第二个不是「兼容已有栈」——VPS 部署的人本来就没有本地文件可以开。
> D-031 的三条理由全部关于 **SQL 方言**，而文件读写没有方言。


同理不做的：外部插件市场（PRD §1）、Cordis 式依赖注入（7.3）。

### 7.3 推进方式：先别造框架

**按接缝组织代码，等第二个实现出现了再抽接口。**

理由：`capturer` / `parser` / `provider` 三条接缝的实现都还很少。凭想象设计接口，
八成会把参数集设计错，然后每加一个实现都要改接口——比不抽还累。

**四条接缝现在都有了实现**，形状也定型了（`packages/shared/src/seams.ts`）：

```
plugins/leg/src/
├── keyword.ts     jieba 预分词 + GIN + ts_rank_cd；export install()
├── substring.ts   pg_trgm + ILIKE，逐词匹配
└── index.ts       install(host)：把两个实现注册进 host.leg
```

接口本身只有三个成员：`id`（写进 matchedBy）、`defaultWeight`（融合权重的
初始猜测，可被设置覆盖）、`run(ctx)`（召回并返回排序好的 id 列表）。
通道不负责融合、不负责重排、不取正文——那三件事在 core 的 `pipeline.ts` 与
宿主的 `search/index.ts` 里。

**运行接口放在 `shared` 而不是各插件包里**：它是宿主与插件之间的唯一约定形状，
放在某个插件包里就会出现「谁的版本算数」的问题。

推进顺序：

1. 定接缝的**边界**（上表）
2. 每条接缝的第一个实现直接写，不抽接口
3. 写第二个实现时，从两者的共同点反推接口
4. 接口稳定到第三个实现，才算定型

`provider` 已经走到第 2 步的尾声：chat 是第一个实现，embed 与 summarize 是
**同一套适配器的不同角色**（call shape 不同，见 §5.2 的两处边界），
三者的共同点反推出了 §7.4 的角色描述符。

### 7.4 插件协议：一个 install 函数

插件的全部协议是这样的（`plugins/leg/src/index.ts` 是真实例子）：

```ts
import type { PluginHost } from '@mimir/shared'

export function install(host: PluginHost): void {
  host.params([/* 这个包共用的配置键，可选 */])

  host.leg(
    {
      seam: 'leg',
      id: 'keyword',
      name: '关键词（jieba 分词）',
      description: '词级召回，有词边界语义',
      file: 'plugins/leg/src/keyword.ts',   // 设置页会显示它
      configKeys: ['retrieval.keyword.weight'],
      params: [/* 这个实现独占的配置键 */],
      requires: ['retrieval.keyword.weight'], // 缺了就不能干活
    },
    createKeywordLeg(host.db),
  )
}
```

**没有生命周期钩子、没有依赖注入容器、没有配置文件。** 宿主给的东西只有三样：
`db`（只能 `execute`）、`settings`（三个 getter + `getSecret`）、
以及四条接缝各自的注册方法。这是「核心保持精简」在代码层面的落点。

#### 描述符是**数据**，不是代码

描述符必须能在**没有数据库**的环境里求值（`/api/config`、设置页、测试）。
所以它不提供 `run` 之类的实现，也不提供计算状态的函数：

| 字段 | 作用 |
|---|---|
| `id` / `name` / `description` | 展示。`id` 还会写进 `matchedBy`，改名等于破坏契约 |
| `file` | 仓库相对路径。「要改这个实现，去改这个文件」——这一页的核心价值 |
| `configKeys` | 这个实现读哪些键。反查「改了 X 会影响谁」 |
| `params` | 它自带的键**定义**（会被并进全局键表，见 §7.5）|
| `requires` | 缺这些键就不能干活 |
| `unavailable(read)` | 代码在、配置也可能齐，但就是干不了（如探测失败、**或没被选中**）|

#### `unavailable` 为什么收一个 `read`

原先的判据只有 `isProvided(key)`（「这个键有没有人**显式**配过」）。
它回答不了「**当前选中了哪个后端**」——而 `storage` 是单数的接缝：
本地与 S3 都配好之后，两个实现都会显示 `active`，设置页于是说
「两个存储后端都可用」，实际只有一个在承接写入（`RESEARCH.md` §10.6）。

`read` 给的是**当前生效值**的同步读取口，于是未选中的那个可以如实报
「当前未选中（正在用 local）」——那正是 `unavailable` 的语义：
代码在、配置齐、就是干不了活。

代价是多了一条约束，值得写下来：

> **`unavailable` 必须同步。** 值由装配层预先解析好传进来
> （`host.ts` 的 `descriptors()` 用 `settings.entries()` 的结果构造 reader），
> 不能在这里 await 读配置。理由见下：`computeStatus` 每次 `/api/config`
> 都要对每条接缝跑一遍。

另一个边界：reader 拿到的是**已经过 `toWire`** 的值，密钥类是 `null`。
对「选中了哪个后端」这类标量键完全够用，但**不要在 `unavailable` 里读密钥**
——那要走 `getSecret`，而它是异步的。

#### 状态由 core 算，不由实现编

```ts
// packages/core/src/registry.ts
export function computeStatus(declaration, impl, isProvided, read): PluginStatus {
  if (impl === null) return { kind: 'planned', note: declaration.description }
  const missing = (declaration.requires ?? []).filter((key) => !isProvided(key))
  if (missing.length > 0) return { kind: 'needs-config', reason: `需要先配置 ${missing.join('、')}` }
  const blocked = declaration.unavailable?.(read)
  if (blocked) return { kind: 'unavailable', reason: blocked }
  return { kind: 'active' }
}
```

**判定顺序有意义**：`requires` 先于 `unavailable`。所以一个「没配齐且未选中」
的后端报的是 `needs-config`（用户此刻该做的是填配置），只有配齐之后
`unavailable` 那层才有机会说话。`plugins.test.ts` 里有一条断言守着这个形状。

四态，不是布尔：**`planned`（代码还没有）与 `unavailable`（代码在但干不了活）
对用户的含义完全不同**——前者是「将来会有」，后者是「现在缺个东西，补上就能用」。
用布尔会把「待开发」显示成红色的「不可用」，那是在说它坏了。

**为什么状态不是各实现自己回答**（这是与 WeKnora 的
`CheckAvailable(connected, overrides)` 不同的一点）：每个实现自己写
`get status()` 会让「缺配置」这个**最常见**的情况被八个实现各写一遍，
理由各不相同、格式也各不相同。收敛成 `requires` 之后，缺配置的文案只有一处；
真正需要自定义判断的（如「这个后端二进制没编进来」、「这个后端没被选中」）
才用 `unavailable()`。

#### 「规划中」是独立的一条路径

`plan(declaration)` 注册的条目**只进设置页，不进编排**——编排层拿到一个没有
实现的条目就只能编个空实现，那比缺一个条目更糟。目前没有这种条目：
M1-E 的 PDF/Word 与 RSS 会有，那时它们出现在设置页上，且不参与任何运行路径。

#### 装配：全仓唯一同时知道两边的文件

`apps/server/src/plugins/host.ts` 建注册表、装插件、交出运行期需要的东西。
它**没有业务逻辑**：抓取怎么落盘、笔记怎么写、引用怎么组装都在 `services/`。

依赖方向因此是单向的，且**由包边界保证**（不是靠约定）：

```
插件实现 ──→ @mimir/shared（契约）          ← 想 import 宿主会直接解析失败
宿主装配 ──→ @mimir/core + 插件             ← core 与 services 都不认识任何插件
```

加一个实现＝加一个文件 + 在它的 `install()` 里补一行；删掉一个插件包，
宿主仍能编译（那个接缝少一个实现而已）。

### 7.5 配置分层：DB 行 > 环境变量 > 内置默认

M0 的配置全在 `.env`，改一个模型名要改文件 + 重启。M1 起有十几个要调的参数
（embedding 模型与维度、分块大小与重叠、各通道权重、RRF k），
把「调权重」变成「改 .env 再重启」会直接劝退调参这件事本身。

**所以加一层 DB 覆盖，但不放弃 `.env` 作为部署真相**：

```
解析顺序（每个键独立判断，不整份回落）
  1. settings 表里那一行（界面写入，有值才用）
  2. process.env[该键的 env 名]（部署配置）
  3. 代码里的默认值
```

四条约束，每条都对应一个真问题：

| 约束 | 做法 | 不做会怎样 |
|---|---|---|
| **键集闭集** | 键在 core 的键表或插件的 `params` 里注册，写入时拒绝未知键 | 界面上能存进一个没有任何代码读的值，用户以为改了行为 |
| **迁移不 seed** | 建表只建表，不插默认行 | `.env` 里的值会被空默认值静默覆盖（WeKnora 的迁移注释专门写了这条） |
| **写入即校验** | 类型 + 每键的校验钩子，400 返回 | 坏值等到第一次调用才炸，或者更糟——静默用默认值跑 |
| **不写进程级配置** | 只允许注册过的键；`DATA_DIR`、`DATABASE_URL` 这类不在表里 | 端口、数据目录这类改了就重启不了的键出现在界面里，是假表单 |

#### 五种值类型，第五种是给结构化配置的

| 类型 | 界面控件 | 密钥处理 |
|---|---|---|
| `string` / `number` / `boolean` | 输入框 / 数字框 / 开关 | — |
| `secret` | 密码框（值不下发）| 整值加密，协议里只留 `configured` |
| **`json`** | 插件自己的界面 | **两个钩子**，见下 |

`json` 是为**集合**准备的：供应商是一个列表（每家一个地址与一把密钥），
标量键表达不了集合。摊平的后果有实例为证——某个成熟产品用「按位置对齐的
三个数组」存多家供应商，删除时要手工重排下标（`docs/RESEARCH.md`）。

结构化值里的密钥由**拥有那个形状的插件**处理，走 `SettingSpec.json` 的
两个纯函数：

```
toWire(internal)              → 摘掉密钥（下发浏览器）
fromWire(incoming, existing)  → 把已存的密钥合回来（写入时）
```

为什么不让设置层自己猜哪一层是密钥：只有插件知道密钥藏在数组的哪一项里。
设置层保持通用，插件提供语义。两个钩子各是一个**执行点**，
漏掉 `toWire` 的症状是密钥随 `/api/config` 发出去了而界面看不出异常；
漏掉 `fromWire` 的症状是用户改一下名字就把密钥清掉了——同样看不出异常。

`hidden: true` 的键仍可读但不出现在设置列表里。它的唯一用途是**迁移**
（读旧的标量键一次），而迁移完成后不该有人再看到那些字段。

**环境变量仍然优先于「默认」，但不优先于「界面显式设置」**——这是刻意的：
`.env` 表达的是部署事实（连哪个库、哪个地址），界面表达的是「我现在想调一下」。
冲突时的表现要在界面上写清楚：设置页每行都有 `来源：界面 / 环境变量 / 默认`
（WeKnora 的「留空则使用环境变量默认值」是同一个意思，但它的界面不显示当前来源，
用户看不出自己是在覆盖还是在跟一个环境变量叠加）。

另一个副作用是好的：**「清除覆盖」是一个真实的动作**——把行删掉就回到环境变量。
界面上每行都有这个按钮，而不是让用户猜「改成空串行不行」。

### 7.6 密钥：只存服务端，落库加密，下发前剔除

- **加密落库**：AES-256-GCM，密钥由 `AUTH_SECRET` 经 HKDF 派生（不再引入必填变量）。
  存储值带 `enc:v1:` 前缀，便于将来换算法——WeKnora 的做法一致
- **绝不下发浏览器**：`/api/config` 对密钥类键只回 `{ configured: true, source }`，
  值一个字都不给（`packages/shared/src/config.ts` 的注释是这条的契约面）
- **解密失败当作未配置**，并在界面上明说「密钥无法解密，请重新填写」。
  `AUTH_SECRET` 轮换后必然出现这种情况，静默当作空值会让用户以为是自己没配
- **探测用已存密钥**：测试连接时前端可以只发角色名，服务端用库里那份密钥去试，
  密钥不回浏览器也不回环一趟

**不做（Phase 2 再说）**：多套命名的 provider 配置（WeKnora 的
「模型卡片列表 + 每个消费者各自选一个」）。本项目的角色是固定的五六个，
每个角色一行、就地改，比「先建一张卡片再去别处绑定」少一层间接。

### 7.7 设置页 = 注册表的人类可读视图

设置页不是一堆散落的表单，每一行「可配置的东西」都对应一个注册进接缝的实现
或一个注册进 spec 的键：

| 设置分区 | 数据来源 |
|---|---|
| 模型 | `provider` 接缝的角色描述符 + `model.*` 键 |
| 检索 | `leg` 接缝的描述符 + `retrieval.*` 键，外加一个相关性自检入口 |
| 抓取 | `capturer` 接缝的描述符 + `capture.*` 键 |
| 解析 | `parser` 接缝的描述符（M1 起有内容） |
| 存储 | `storage` 接缝的描述符 + `storage.backend`；被选中的那个后端自己的键（`storage.s3.*`） |
| 插件 | **五条**接缝的全部描述符（其余分区的超集） |
| 数据与备份 | 动作（导出、重建索引），不是配置 |
| 账号 | 环境变量（`OWNER_EMAIL`），不可写 |

这样「可配置的东西」和「代码里的实现」永远一一对应，不会出现设置里有开关但代码里没有对应逻辑。

**值的真相在服务端，界面不自己存一份。** `GET /api/config` 回三块：

| 块 | 内容 |
|---|---|
| `settings` | 每个键的当前值（密钥除外）、来源、类型、说明、改了要不要重建索引 |
| `plugins` | 四条接缝的描述符 + 可用性 |
| `models` | 角色 → 就绪状态（派生值，不存） |

早期版本把这些值硬编码在设置页组件里，于是改了 `MODEL_CHAT_MODEL` 之后界面仍显示旧模型名——
设置页自己写的原则是「画一个存不进去的假表单比没有更糟」，显示一个说不了真的值属于同一类问题。

**写入口**：`PATCH /api/config/settings`，body 是 `{ values: { 键: 值 | null } }`，
`null` 表示删除覆盖。写入前逐个校验，任一键不合法则整批拒绝——
半批成功会让用户面对一个说不清的状态。

**布局：分区导航是横向的。** 早期用 `tabPosition="left"` 把分区导航摆进
内容列，于是这一页出现了**两条左栏**（全局左导航 + 分区竖栏），且 760px 的
内容列被切掉约 100px、正文只剩约 570px。改成横向后内容列恢复成
`DESIGN.md` §5.4 的 760px。分区选择走 `?section=`，所以「去设置 > 数据与备份」
是一个可以直接贴出去的链接。

### 7.8 可用性：四态，且不自动花钱

`RESEARCH.md` §1.5 第（五）条：WeKnora 的「可用」是一次真实调用打出来的
（发 `"test"`、`max_tokens=1`，把 400 当成功）。这个做法对——
「配置齐了」不等于「能用」，地址填错、key 过期、模型名下架都要发一次才知道。

但**不能在设置页打开时自动探测**：那是每次进设置都花钱，而且慢。
所以状态是四态，探测是显式动作：

| 状态 | 含义 | 来源 |
|---|---|---|
| 未配置 | 缺必填键（如没有 key） | 描述符的 `status`，零成本 |
| 未测试 | 配置齐备，但没试过 | 默认 |
| 可用 | 试过，通了 | `POST /api/config/probe` 的结果（内存缓存，带时间戳） |
| 不可用 | 试过，失败 | 同上，带原因 |

探测结果**不进数据库**：它是「刚才通不通」的观测，不是配置。重启即清空、
重新变回「未测试」比留一个可能过期的「可用」诚实。

---

## 8. 部署与安全

### 8.1 编排

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg17
    ports: ["127.0.0.1:5544:5432"]   # 只绑本机
    volumes: [mimir-pgdata:/var/lib/postgresql/data]
```

镜像选择说明：默认用 `pgvector/pgvector`（许可干净）。若接受 AGPL 且要更强中文检索，换 `paradedb/paradedb:v0.22.6-pg17`，并把关键词通道改用 `chinese_lindera` BM25，代码改动集中在检索层一个文件。

端口 5544 是刻意避开常见的 5432/5433。

### 8.2 安全

- **单用户规则**：第一个注册的人成为唯一用户，之后注册自动关闭。用规则代替开关——暴露在公网时，忘记关开关等于把注册口敞开
- **推荐设置 `OWNER_EMAIL` / `OWNER_PASSWORD`**：它把「所有者是谁」从「谁先访问」变成
  由部署配置决定。不设的话，部署完到你注册之间有一个时间窗——服务若已暴露公网，
  谁先到谁就成为那个唯一用户。另外它也是**忘记密码的找回路径**（改这里重启即同步）。
  详见 `docs/DECISIONS.md` D-020
- 密钥只存服务端并加密落库，**绝不下发浏览器**
- `AUTH_SECRET` 生产环境必须显式设置，否则启动即失败
- Cookie：`httpOnly` + `sameSite=lax`，生产环境自动 `secure`
- **建议再套一层 Tailscale 或 Cloudflare Tunnel**。自托管暴露公网是最大的现实风险点

### 8.3 构建顺序

**包与包之间已经没有顺序要求**，因为 `@mimir/shared` 以源码发布
（`exports` 直接指向 `src/index.ts`），编译责任跟着使用方走：

| 使用方 | 谁编译 shared 的源码 |
|---|---|
| `apps/web`（开发与生产）| Vite |
| `apps/server`（开发）| Vite 的 dev server（`@hono/vite-dev-server`）|
| `apps/server`（生产）| Vite 的 SSR 构建，把 shared 打进 `dist` |

```
pnpm --filter @mimir/web build      ← 内含 tsr generate（路由树）
pnpm --filter @mimir/server build
```

这两条互不依赖，先后随意。剩下的顺序约束都在**包的内部**：路由树是生成物，
必须先 `tsr generate` 再类型检查——这一步写在 web 自己的 build/typecheck 脚本里，
不需要在镜像构建时手动排。决定与取舍见 D-023。

镜像里有两个 Node 进程吗？没有，只有一个：`node dist/index.js` 同时提供 API
与前端静态资源。单用户自托管不值得拆成三个容器加一个反代。

服务端为什么要打包而不是 `tsc` 直出：shared 的源码是 TS，Node 在生产环境不能
执行 `node_modules` 里的 `.ts`（`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`），
所以必须由使用方编译进产物。Vite 的 SSR 构建用 `preserveModules` 保持一文件对
一文件，因为 `lib/static.ts` 按「所在目录往上两级」推导前端产物位置——打包成
chunk 后 `import.meta.url` 指向重命名后的 chunk，会静默算错路径。
决定与取舍见 D-033。

### 8.4 验证方式

```bash
docker build -t mimir:test .
docker run -d --network host \
  -e DATABASE_URL=postgres://mimir:mimir@127.0.0.1:5544/mimir \
  -e AUTH_SECRET=$(openssl rand -base64 32) \
  -e NODE_ENV=production -e DATA_DIR=/data \
  -e VAULT_DIR=/data/vault -e RAW_DIR=/data/raw \
  mimir:test
```

应当观察到：容器 `healthy`、日志有「已挂载前端静态资源」、
`/` 返回 200、`/docs` 深路由返回 200（SPA 回退）、`/api/documents` 未鉴权返回 401。

### 8.5 备份

默认（本地后端）：`data/` 目录 + `pg_dump` 定时打包。因为「文件是真相」，
最坏情况可以从 `data/vault` 和 `data/raw` 完整重建数据库。

选 S3 后端之后，真相在桶里，备份变成两件事：**桶本身的持久化**
（对象存储通常自带冗余，但版本控制与生命周期策略要自己开）
加 **`pg_dump`**。注意列表类操作在 S3 上是按请求计费的，
所以「定期全量拉回本地」这类做法要先算成本。

两种后端都成立的一条没有变：**数据库始终是可重建的**，
所以 `pg_dump` 丢了不致命，桶或 `data/` 丢了才致命。

---

## 9. 测试策略

### 9.1 当前覆盖

| 范围 | 数量 | 方式 |
|---|---|---|
| 服务端集成 | 71 | Hono 的 `app.request()` 内存调用，不占端口 |
| 前端组件与编辑器 | 117 | happy-dom + 真实 Tiptap 实例 + 真实渲染算对比度 |

前端那批里，与外观切换直接相关的两组：

| 文件 | 守什么 |
|---|---|
| `theme/design.test.ts`（81） | 两套外观跑**同一组**对比度断言（浅色与深色各一遍，`it.each(APPEARANCES)`）、跨外观不回归、切换后 cssVar 变量块真的被替换且只有一块 |
| `theme/appearance.test.ts`（8） | 偏好持久化、跟随系统、坏值回落、`localStorage` 抛错不炸、`color-scheme` 被写对 |

`design.test.ts` 里最有价值的两条不是对比度，而是**装配**：
「切到深色后变量块只有一块」防的是「两套色混在一起」——
那种情况看起来只是「有点怪」，但只要渲染顺序变一次就会整块翻车；
「深色的每个文字色不弱于浅色」防的是深色在几次迭代后悄悄退化。

服务端那些里，与 M1 骨架直接相关的三组：

| 文件 | 守什么 |
|---|---|
| `settings.test.ts`（13） | 配置的三条回落路径、整批拒绝、密钥加密落库与「解不开 ≠ 没配」 |
| `plugins.test.ts`（11） | 描述符的 `file` 路径真实存在、`leg` 描述符与注册表 id 一致、`configKeys` 都注册过、抓取来源识别两处不漂移、构建配置没把 workspace 包 external 化 |
| `search.test.ts`（11） | 检索召回回归（自然语言提问、部分词匹配排序、tsquery 语法安全）——见 D-014 |

`plugins.test.ts` 那一条防的正是这次重构的起因：设置页的清单与代码里的注册表
**各说各话**（D-030）。同理 `SettingControl.test.tsx` 守的是「改了值但没保存」
——那个缺陷人工点一下很容易漏（点完看起来是对的，值也在框里）。

### 9.2 测试库隔离

集成测试用**独立的 `mimir_test` 库**和**独立的 vault 目录**（`data/.test/`）。

这一条踩过坑：测试一开始写进了真实 vault，跑几次之后用户的笔记目录里多了 18 个测试垃圾文件。现在 `globalSetup` 会校验库名必须包含 `mimir_test`，否则拒绝运行。

### 9.3 一条命令

```bash
pnpm check     # oxlint → oxfmt --check → typecheck → test
```

CI 与本地 pre-push 跑的是同一条，避免两处逻辑漂移。

### 9.4 值得加的测试

- 抓取器的解析快照测试（存下 HTML，断言解析结果）
- 文件与数据库一致性（写入中途失败后的重建）
- 前端的三栏交互（模式切换、未保存拦截），目前只靠人工验证

### 9.5 M1 必须有的四类断言

M1 的新代码大多是「纯函数 + SQL」，两类都能用能说明用户可见行为的断言覆盖，
不是只测函数返回值：

| 断言 | 为什么它值一条测试 |
|---|---|
| **分块偏移可逆**：`body.slice(start_at, end_at) === content` | 引用跳回原文位置的**唯一**保证。切错一个字符，高亮就偏了，而且不报错 |
| **分块确定性**：同一正文跑两次得到逐字节相同的分块与 id | chunk id 不确定 → 每次重建都插一批新向量，表会持续膨胀 |
| **分块覆盖完整**：各块 `[start,end)` 并集等于正文（允许重叠） | 有段落被漏掉 → 那部分永远搜不到，且没有任何症状 |
| **配置分层**：DB 有值取 DB、删掉回落到 env、再删掉回落到默认 | 三层解析的每条回落路径都要有一条测试，「界面覆盖不生效」是最难现场诊断的一类 bug |

另外：**检索召回的回归测试要加一条向量通道的版本**（配了 embed 模型时
`mode=hybrid` 命中、没配时自动回落 keyword 且 `channels` 里没有 vector）。
这类「配置变了行为跟着变」的地方最容易静默失效，D-014 已经证明过这一点。

---

## 10. 已知约束与坑

按踩到的顺序记录，避免重复。

| 坑 | 现象 | 处理 |
|---|---|---|
| jieba 不加载词典 | 分词退化成逐字 | 必须 `Jieba.withDict(dict)` |
| Postgres 对中文无词边界 | 搜「组件」搜不到 | 写入时预分词 + 子串兜底通道 |
| pgvector 维度上限 | 2048 维建 HNSW 索引报错 | 用 `halfvec`（上限 4000）或降到 1024 维 |
| Tiptap StarterKit 已含 Link | 重复扩展告警，链接配置被覆盖 | 在 `StarterKit.configure()` 里配，不再单独 import |
| `URL.pathname` 含中文 | 百分号编码导致找不到目录 | 一律用 `fileURLToPath` |
| pnpm 12 供应链策略 | 当天发布的依赖被拒 | 锁到上一个稳定版本 |
| 测试污染真实数据 | vault 里多出测试文件 | 测试库 + 测试目录双重隔离 |
| 无头截图动画冻结 | 浮层看起来透明 | 只是截图问题，真实浏览器正常 |
| oxlint 的 react-in-jsx-scope | React 17+ 报「React 必须在作用域内」 | 关掉，这是历史遗留规则 |
| oxlint 的 import/no-named-as-default | Tiptap 包同时有 default 与 named 导出，误报 | 关掉，统一用 named 导入 |
| oxfmt 格式化中文表格 | 列宽按字节算，中文表格反而更乱 | oxfmt 排除 `**/*.md` |
| React Compiler 的 0.x peer 范围 | `^0.145.0` 对 0.x 是 `>=0.145.0 <0.146.0` | 装 0.145.x；装 0.150.0 会报 unmet peer |
| 抑制 React 规则会让编译器跳过组件 | 编译通过了，但组件没被优化，且无任何提示 | 保持 `logDiagnostics: true`；改成符合 Rules of React 而不是 disable |
| ref 声明在使用它的 effect 之后 | `react-compiler(Immutability)` 警告，静默不优化 | 声明顺序放在 effect 之前 |
| 未声明的包出现在 node_modules | 以为依赖没删干净 | `@vitejs/plugin-react` 的 optional peer，pnpm autoInstallPeers 自动装的 |
| 静态资源的隐藏依赖 | 测试行为取决于本地是否跑过构建 | 挂载静态资源显式判断 `NODE_ENV`，不看 dist 是否存在 |
| 路由树是生成物 | 干净检出直接跑 `typecheck` 找不到 `routeTree.gen.ts` | 用 `tsr generate` 显式生成，写进 typecheck/build 脚本 |
| workspace 包以源码发布 | 生产容器启动报 `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`——Node 拒绝执行 node_modules 里的 TS | `@mimir/shared` 以源码发布，但**由使用方编译**：前后端都交给 Vite（server 是 SSR 构建）。见 D-023、D-033 |
| 打包时把源码目录结构拍平 | `resolveWebDist()` 少算一级目录，静态资源静默 404 | Vite 的 SSR 构建开 `preserveModules`（配 `preserveModulesRoot: src`），保持一文件对一文件 |
| 服务端 dev 入口自己起监听 | 启动即 `EADDRINUSE`——dev 入口与 Vite 的 dev server 抢同一个端口 | 监听只由 `src/index.ts`（生产入口）做；`src/dev.ts` 只导出 `app`，交给 `@hono/vite-dev-server` |
| 照抄 Vite 文档里的 `build.rollupOptions` | Vite 8 里它只是 `rolldownOptions` 的别名（已标注 deprecated） | 新配置一律用 `rolldownOptions` |
| 仓库根靠标志文件查找 | 生产镜像里没有 `pnpm-workspace.yaml`，启动即抛错 | 找不到时退回 `cwd` 而不是抛错；容器里全部传绝对路径 |
| `src/` 与 `dist/` 层级不一致 | 静态资源路径在仓库内正确、在镜像里算到 `/web/dist` | 按候选路径探测 + `WEB_DIST` 显式指定，不用写死的相对偏移 |
| 内层 `ConfigProvider` 传 `theme` | `cssVar` 的 key 被重算，`--ant-*` 变量名改变，引用变量的地方颜色静默不对 | 主题只由 `ThemeProvider` 传；内层 `ConfigProvider` 只放 locale（`theme/MimirProvider.tsx`） |
| 半透明 token 直接算对比度 | 得到把黑色当底色的假数字（`colorFillSecondary` 算出 2.86:1，实际 4.93:1） | 先用 `composite()` 合成到所在底色再算，见 `design.test.ts` |
| `createGlobalStyle` 里用 `--ant-*` | 变量注入在 antd 组件 DOM 子树上，全局规则里取不到 | 用 `${(p) => p.theme.xxx}` 读主题值 |
| **与 seed 同名的 token 覆盖会被丢弃** | 在 `token` 里写 `colorLink` / `colorPrimary` **不生效**——`formatToken` 把这些键从最终结果里删掉，值由算法重新派生。浅色下看不出来（浅色阶把输入色放在第 6 阶，而 `colorLink` 恰好取第 6 阶），深色下就露出来了：`#0958d9` 派生出的颜色在选中底上只有 3.97:1 | 需要精确控制时用**校准层**：一个 `MappingAlgorithm` 挂在 `algorithm` 数组最后，它写进去的值不会被改写（`tokens.ts` 的 `darkCalibration`） |
| antd 深色自带的 `colorLink` 不达 AA | `#1668dc` 在深色容器底上只有 **3.50:1**；`colorInfoText` 同源 | 深色显式校准链接色（`#79b8ff`，容器底 8.74:1），不依赖算法的派生值 |
| 深色算法把 `colorPrimaryBg` 与 `colorPrimaryBorder` 设成同一个值 | 前者是选中项的底、后者是焦点环——同值意味着焦点环落在选中项上完全看不见（实测 **1.00:1**），而那是键盘用户唯一的线索 | 深色单独校准 `colorPrimaryBorder`；`design.test.ts` 断言「环与选中底 ≥ 1.5:1」 |
| 深色下照搬浅色的字面量颜色 | `#fafbff`（悬停底）、`#e8f1ff` / `#f0f1f3`（来源标注）、`#68707c`（说明文字）压在深底上不是刺眼就是看不见，且**不报错** | 一律走 token：悬停用 `tintHover`，来源标注成对使用语义 token |
| 深色页面露出浏览器默认的白 | 滚动到顶端之外、overscroll 回弹、页面比视口短这三种情况露出的是 `html` 的底；滚动条与原生下拉也不受 CSS 管辖 | `html` 上画 `colorBgLayout`，并把外观写到 `html` 的 `color-scheme` 上（后者决定滚动条与原生控件的明暗） |
| 首帧脚本的内联背景压住全局规则 | 内联样式优先于样式表，于是**运行时切换外观后 `html` 的底不变**（刷新后才对），表现是切换后 overscroll 露出上一层外观的颜色 | `styles/global.ts` 里那条 `html { background }` 带 `!important`——它针对的是那一个内联声明，`design.test.ts` 守着它 |
| antd-style 的 `themeMode='auto'` 首帧闪白 | 它的首次系统匹配走 `setTimeout(…, 1)`，第一帧按浅色渲染再翻成深色 | 自己持有外观状态（`theme/appearance.ts`），把 `appearance` 作为**受控 prop** 传进去；`index.html` 内联一段等价脚本覆盖样式注入前的那段空白 |
| `localStorage` 在隐私模式下读取会**抛错** | 不兜住的话整个应用壳渲染不出来——一个渲染偏好不该有这种能力 | `try/catch` 包住读写（`appearance.ts` 与 `routes/_app.tsx` 同一条） |
| 存了不认识的外观值 | 控件匹配不上任何一项，界面显示空白且**没有任何报错** | 读回来时收敛到 `auto`（`MODE_SET.has()`），不当合法值传下去 |
| vitest 与 vite 各有一份配置 | 别名只在一边配了，测试报「找不到模块」而构建正常 | 别名定义在 `alias.ts`，两个配置都从它取 |
| `plainto_tsquery` 的 AND 语义 | 自然语言提问全部 0 命中（四词要求全部出现） | 改成「命中词数 ≥ 一半」+ `ts_rank_cd` 排序，见 D-014 |
| 子串通道拿整串去 ILIKE | 「兜底」在一句话提问上永远不命中 | 逐词匹配，门槛与词级通道一致 |
| `useChat` 的 `initialMessages` 只在挂载时生效 | 打开历史会话右栏空白，而中栏的「本次引用」正常 | 等数据取回再挂载对话体，`key={conversationId}` |
| `useChat` 在 connection 变化时重建客户端 | 发送中如果 URL 变了，正在进行的流被切断 | 会话 id 放请求体（`forwardedProps`），不进 URL |
| 渲染期读写 ref | React Compiler 拒绝优化该组件（`react(refs)`） | 参与渲染的值用 state；只在事件处理器里读写 ref |
| 模型连接错误不抛异常 | `try/catch` 根本不执行，「每类失败给不同出路」静默失效 | 连接类错误以 `RUN_ERROR` chunk 顺着流发出来，既要看 chunk 也要留 catch |
| 建会话后写 URL 触发重挂载 | 新会话提问后右栏空白，而消息已落库 | 区分「自己刚创建的 id」与「切换过去的会话」，前者不重挂载 |
| 只存草稿不导航 | 点「问 AI」没反应 | 设置草稿后必须一起 `navigate` |
| trace 只量检索耗时 | 界面永远显示「耗时 0.0s」 | 整轮结束后再发一次带完整耗时的 trace 覆盖它 |
| 召回通道的门槛写在外层查询 | 过滤条件引用的是计算列，**GIN 与 trigram 索引静默失效**，改走全表扫描；5 万行实测：关键词通道「零命中」也要 **292 ms**（索引本该立刻返回「没有」），命中 1/7 时 328 ms | 门槛谓词下推到 `WHERE`，命中数与排序分开算：零命中降到 **0.012 ms**（Bitmap Index Scan），命中密集时仍有 38.5 ms 的真实排序成本。见 `RESEARCH.md` §9.5 |
| HNSW 索引建在表达式上，查询不写同一个表达式 | 索引**静默不命中**，退化成顺序扫描（和上一行同一类，但更隐蔽：20 万行才会明显） | 索引与查询都用 `embedding::halfvec(1024)`，且都带 `WHERE dimension = 1024`。见 §4.8 |
| `halfvec` 索引上不带维度过滤 | pgvector 无法用 partial index，`dimension` 谓词必须与索引定义一致 | 查询里显式 `WHERE dimension = <该索引的维度>` |
| 未 seed 的默认值覆盖 `.env` | 部署方在环境变量里配的值被空默认值静默吃掉 | settings 表只存**显式写入**的行；解析时「没有行」才看环境变量。见 §7.5 |
| 密钥解密失败被当成空值 | `AUTH_SECRET` 轮换后所有 key 静默失效，用户以为是自己没配 | 捕获解密失败并在界面上明说「请重新填写」，不静默兜底。见 §7.6 |
| 探测端点自动触发 | 每次进设置页都发一次真实模型调用，慢且花钱 | 可用性是四态（未配置/未测试/可用/不可用），探测只在用户点「测试连接」时发生。见 §7.8 |
| 用量按会话时区聚合 | `(at AT TIME ZONE $tz)::date` 缺了时区就按 UTC 切天——容器默认 UTC，**凌晨 0 点到 8 点的消耗全算到前一天，图整体左移一格且不报错** | 时区取 `stats.timezone`（默认 `Asia/Shanghai`）并在图旁标出；`at` 是 `timestamptz`，换时区只是换聚合方式，历史数据自动重算。见 §12.4 |
| 未上报的用量被当成 0 | 兼容端点不回传 usage，那天有调用却渲染成空白格子，等于图在说「我那天没用」 | `usage_log` 的 token 三列**可为 null 且 null ≠ 0**；聚合时把「有调用但用量未知」单独计数并画成斜纹，不画成空。见 §12.3 |
| 流式调用的 usage 只在末尾到达 | 只在 `for await` 正文时拿不到用量；若把 `RUN_FINISHED` 提前消费掉更会漏 | 记账放在**包住整条流**的透传生成器里（`finally` 落账），不放在正文累加处。见 §12.2 |
| 头像 URL 固定导致换图不生效 | 文件名是 `<userId>.webp` 不变的，浏览器拿缓存里的旧图一直显示，界面上看起来「上传没反应」 | 指针里带版本：`user.image = /api/avatar?v=<时间戳>`，响应 `Cache-Control: private, immutable`。见 §12.6 |
| 会话 cookie 缓存住用户资料的旧值 | **与上一行是两个独立的陈旧源，只修一个不够。** 实测：先修了 `?v=`，界面上的头像依然不动——因为 `get-session` 在 `session.cookieCache` 的 `maxAge` 内直接读 cookie 里那份 `{session, user}` 快照，而头像是绕开 Better Auth 直接写库的，缓存不会刷新 | `cookieCache: { enabled: false }`。`cookieCache.version` **不能**用来做资料指纹：它读的时候也拿 cookie 里那份 user 重算，与写入时是同一个对象，必然自洽。见 §12.6 与 D-037 |
| 图表库的日期键格式不对齐 | 库内部用 `YYYY/M/D`（**不补零**），API 给 `2026-09-18`（补零）。直接 `replaceAll('-','/')` 得到的键永远查不到，于是 `rectRender` 里的自定义规则**全部静默失效**，而图照常渲染、看起来正常 | 只在一个 `dateKey()` 里统一转换。与「月份标签跳过整月」同一类：日期格式不一致，不报错只是不对。见 §12.8 |
| 热力图少渲染最后几天 | 库的 `gridNum` 从**容器宽度**推（`floor((clientWidth - leftPad)/(rectSize+space))`），不是从日期范围推。CSS 自适应会安静丢掉放不下的天——370 天在 680px 容器里只画 53 列，最后 4 天（含「今天」）消失 | 自己按日期范围算宽度传给 SVG。见 §12.8 |
| **CSS 模板字符串的注释里写了反引号** | 反引号提前结束模板，整段样式变成非法 TS。报错位置指向一句看起来毫无问题中文注释（React Compiler 插件报 `Expected a semicolon`），而**改的人不知道自己动了样式**——只是往注释里加了一对用于强调的反引号。这个坑咬过两次（一次在 `StatsSection.style.ts`，一次在 `styles/global.ts`） | `createStyles` / `createGlobalStyle` 的模板里**一律不写反引号**，注释里强调用「」或 `**`。样式文件改完在浏览器里看一眼，别只看 typecheck 通过 |
| 三个存储目录各有独立默认值 | 容器里头像**不落盘在挂载卷上**：Dockerfile 与 compose 只设了 `VAULT_DIR` / `RAW_DIR`，漏了 `AVATARS_DIR`，于是它回落到 `cwd + /data/avatars` = `/app/data/avatars`。上传与显示都正常，**`--build` 重部署后头像消失** | 收成单个 `DATA_DIR`，三类文件是它的三个前缀（`vault/` / `raw/` / `avatars/`）。漏配在结构上不可能发生。见 D-038 与 `RESEARCH.md` §10.10 |
| S3 改名不是原子的 | 对象存储没有 `rename(2)`，只能「复制 + 删除」。复制成功、删除失败时同一个笔记有**两个文件**，而重建索引按 id upsert 会让它们互相覆盖——**哪一份胜出取决于扫描顺序**，不报错 | 顺序固定为先复制后删除（任何时刻不丢数据）；`reindexVault` 检测「同一 id 多个路径」并跳过 + 打日志，`ReindexResult.duplicates` 把这件事变成可观测的。见 `RESEARCH.md` §10.3a |
| S3 列举漏掉第 1000 个之后的文件 | LIST 每次最多回 1000 个 key，必须靠 `ContinuationToken` 翻页。漏掉的表现是「库里超过 1000 篇之后，重建索引静默漏掉一部分」 | `plugins/storage/src/s3.ts` 的 `list` 循环处理 `IsTruncated`；不用 `delimiter`（那要把请求数翻倍）。见 `RESEARCH.md` §10.3b |
| `@aws-sdk/client-s3` 的默认校验和 | 3.729.0 起上传默认加 `x-amz-checksum-crc32`，而 Cloudflare R2 等兼容实现不认这个头，直接拒收（LobeHub 为它提过 PR 5479） | `requestChecksumCalculation: 'WHEN_REQUIRED'` 与 `responseChecksumValidation: 'WHEN_REQUIRED'`。**一行配置，不是选 SDK 的代价**。见 `RESEARCH.md` §10.11 |
| 中文对象名在复制时找不到源 | `slugify` 保留汉字，而 `CopySource` 不编码时 S3 按字面量找对象，结果是「复制失败」或复制出一个空对象 | `CopySource` 按**段**编码：`key.split('/').map(encodeURIComponent).join('/')`（保留 `/` 作分隔） |

---

## 11. 推进顺序

1. ~~定 `src/plugins/` 的目录形状与注册表接口~~ —— 已完成（`plugins/leg/` 定型）
2. ~~M0 前端：登录 → 笔记列表与编辑器 → 检索 → 收件箱与整理~~
3. ~~M0 抓取器：粘贴 URL（三来源）~~
4. ~~**M1-A 插件的骨架**~~ —— 已完成
   - 契约：`packages/shared/src/{plugin,seams,config}.ts`
     （声明 + 运行接口 + 传输契约；放 shared 是为了不形成包级循环，见 §3）
   - 骨架：`packages/core/src/{registry,settings/*,fuse,pipeline}.ts`
   - 实现：`plugins/{capturer,parser,leg,provider}/`（四个独立 workspace 包）
   - 分词：`packages/tokenizer/`（写入与检索两侧共用同一份规则）
   - 装配：`apps/server/src/plugins/host.ts`（唯一同时知道宿主与插件的文件）
   - 适配器收口：`services/model.ts`，`assistant.ts` 与 `assistant-stream.ts`
     两处重复的 `openaiCompatible` 已删除
   - `/api/config` 换成三块（settings / plugins / models）+ `PATCH /config/settings`
     + `POST /config/probe`
   - 设置页：模型分区可编辑、来源徽标、四态状态 + 「测试连接」探测；
     插件分区改为从注册表渲染（原先是一份会漂移的手写数组）
5. **M1-B 分块与向量化**
   - `chunks` / `chunk_embeddings` 表 + 迁移
   - `lib/chunk.ts`（确定性、偏移可逆、按结构切）+ 四类断言（§9.5）
   - 分块接入写入路径（笔记保存、抓取入库）与重建索引
   - `POST /maintenance/embed` 分批补嵌入
6. **M1-C 混合检索**
   - 两条现有通道改成返回分块 id（各自一个文件，`plugins/leg/src/`）
   - `plugins/leg/src/vector.ts` + 在 `install()` 里注册一行
   - `mode` 落成通道筛选，默认模式由注册表推导
   - 引用组装：相邻分块合并 + 每篇上限
7. **M1-D 带引用的问答与 AI 摘要、标签建议、内联改写**
8. **M1-E PDF / Word 上传（`parser` 接缝的第一个真实现）与 RSS**
9. 之后再回到 PRD 第 6 节的待决项

**横向的一步（与上面五段都不冲突）**：`usage_log` 的表与采集点。
**它排在 M1-A 之后、M1-B 之前**——M1-A 做的正是「provider 角色化 + `model.ts`
收口」，做完那里采集点就定形了。表与界面可以分开做：

> 记账表的价值随时间增长。界面上线晚半年没有关系，**采集晚上线就永远缺那段历史**。

---

## 12. 用量记账与账号资料

### 12.1 为什么不复用现成的表

`documents` / `messages` 里都有时间戳，看起来「问了多少次、写了多少篇」
可以现算。但**用量不是从业务表推导出来的**，它是**观测数据**：

| | 业务表 | 用量记账 |
|---|---|---|
| 时间 | 可变（`updated_at` 随编辑变） | 不可变（调用发生的那一刻） |
| 生命周期 | 随文档/会话删除而级联 | 必须活过业务删除 |
| 完整性 | 允许中间状态 | 每次调用都要有一行，包括失败的 |

第二条最关键：`messages` 上有 `onDelete: 'cascade'`。删一个会话，
「我这个月花了多少钱」就会**静默变少**——账本不该被业务操作改写。

所以 `usage_log` **不加外键到 `conversations` / `documents`**，只存 `refId` 字符串。
这是刻意的：一个被删掉的会话，它花过的钱仍然花过了。

> 有了 token 口径，「热力图量什么」就不需要再选一次——它和 §12.4 的表
> **同源**，两处数字对不上会立刻看出来。

### 12.2 表结构

```
usage_log
  id                 text pk
  at                 timestamptz default now()   ← 索引在此列
  role               text      -- chat | reasoning | summarize | embed
  source             text      -- 见下
  model              text
  provider_id        text      -- 插件声明的 id
  base_url_host      text      -- 换服务商后历史数据仍能分辨
  prompt_tokens      int NULL  -- null ≠ 0，见 12.3
  completion_tokens  int NULL
  total_tokens       int NULL
  duration_ms        int
  ok                 boolean
  failure_kind       text NULL
  ref_id             text NULL
```

`source` 是**这一列最有信息量**：它回答「这笔钱花在哪个功能上」。

| source | 触发点 |
|---|---|
| `chat` | 流式问答（`assistant-stream.ts`） |
| `ask` | 非流式问答（`assistant.ts`，命令面板与测试走它） |
| `summary` | 自动摘要 |
| `embed` | 向量化 |
| `probe` | 设置页的「测试连接」 |

**`probe` 必须记账。** 它是真实调用（发 `"ping"`、`max_tokens: 1`）。不记的话
用户会发现「我没怎么用，怎么有调用记录」——反过来，记了却混进「我的用量」
同样是说谎。所以单列一类，统计页上写「其中测试连接 N 次」。

**失败也记账。** 失败的调用可能已经计费（流式中断、超时），而且失败率本身
解释了「为什么这个月体验差」。只记成功会得到一个过于乐观的账。

### 12.3 token 三列可为空，且 **null ≠ 0**

**这是这张表最容易做错的一处。**

```
兼容端点不一定回传 usage
   ↓
如果写入时把「没回传」填成 0
   ↓
统计页显示「今天 0 token」，而那天明明调用了 8 次
   ↓
用户看到的是一个确定的谎言，不是一个诚实的未知
```

所以三列都可空，取值用 `total ?? (prompt + completion)`——`total` 缺失但
分项在是常见情况，不该白扔。两边都缺才算「未知」，聚合时单独计数。

界面上的对应：热力图把「有调用但用量未知」画成**斜纹**，不是空底（B 状态的
存在就是为了不静默说谎）；表格里给一列「未上报 N 次」，页脚写清
「这 N 次消耗未知」。

### 12.4 聚合：时区与分档

**时区**（§10 的坑表里有它）：

```sql
date_trunc('day', at AT TIME ZONE $tz)::date
```

容器默认 UTC，而用户在 UTC+8。**不显式转时区的话，凌晨 0 点到 8 点的消耗
全算到前一天，热力图整体左移一格，且不报错。** 时区取 `stats.timezone`
（env 名 `TZ`，默认 `Asia/Shanghai`），界面上图旁标出当前值。

`at` 是 `timestamptz`，所以**换时区只是换聚合方式**，历史数据自动跟着重算，
不需要数据迁移——这与「数据库是可重建的索引」是同一个性质，可以放心调。

**分档用当前范围的分位数**，不用固定阈值：

```
固定阈值：忙的月份全是最深色、闲的月份全是浅色 → 图没有信息
分位数  ：形状始终可读，但「换范围颜色会变」
```

代价必须补偿：图例写「按当前范围分档」并标出每档真实区间
（如「最深 ≥ 12.3 万」）。**真实数字在 tooltip 里**（`12.3 万 token · 8 次调用`），
颜色只负责给出形状——这也是能同时回答「花了多少」与「用得多不多」的地方。

**补嵌入的尖峰不剔除**：剔除会让图表与表格对不上，而这个项目最不能忍的
就是两处各说各话。靠 tooltip 拆解来源解释它。

### 12.5 金额：**不做**（至少在 M1）

三条理由，任一条都足够：

1. **价格要可配，而键集是闭集**（§7.5）。模型名是自由文本，没法静态枚举
   单价表——为金额破一次闭集规则的例不值得
2. **合规端点不回传价格**。`usage_log` 里存的是 token，金额是我们算的
3. **单价会变**。用今天的单价乘历史用量，会让**过去的金额自己变**——
   这是记账的大忌。真要做，必须每次调用时把单价快照进那一行

所以：**token 是事实，先做；金额是换算，等真要看时再加一张单价表 + 行内快照。**
SDK 的类型里有 `TokenUsage.billed`，哪个 provider 真报了成本就存下来并标
`costSource = 'provider'`——那时它是事实，不是换算。

### 12.6 头像：文件 + 指针，两条不对称的删除顺序

**名称**走 Better Auth 自带的 `POST /api/auth/update-user`，不在 `/api/` 下
再包一层——包一层等于把校验规则复制到两处，而会话校验与字段白名单都在
Better Auth 里。

**头像**是服务端上传，四条约定：

| 约定 | 理由 |
|---|---|
| **客户端裁剪**：canvas 裁方、缩到 256×256、编码 webp；服务端只验 MIME + 大小（512KB） | 服务端裁剪要引入 sharp，换来的只是省一点带宽——对单用户自托管不成立 |
| **固定文件名 `<userId>.webp`，覆盖写** | 换头像永远不会攒孤儿文件，也就不需要「删旧文件」这个会失败的动作 |
| **先文件后库**（铁律 2） | 反过来的失败是「库里指着不存在的文件」＝裂图；正序最坏只是多一个孤儿文件 |
| **先库后文件**（删除时） | 见下 |

后两条看起来矛盾，其实是一条规则的两种情形：

> **永远不要让指针存在的时候指向一个不存在的东西。**

创建时文件先于指针（指针晚一点出现无害），删除时指针先于文件（指针早一点
消失无害）。写成两句话容易记反，写成一条规则就只有一个判断依据。

**存储位置 `data/avatars/`**，不在 `data/vault/`：头像不是内容，
不该被 jieba 分词进 `search_text`，也不该进导出包（导出回答的是「我的知识」，
不是「我的账户」）。这一点在 PRD §1 的非目标里也点了名。

**读取**走 `GET /api/avatar`（要鉴权，头像是私人资源不是公开静态文件）。
**缓存陷阱**：文件名固定，浏览器会一直显示旧图。解法是把版本放进 URL——
`user.image` 存 `/api/avatar?v=<时间戳>`，DB 那一行同时充当缓存键，
响应带 `Cache-Control: private, immutable`。

#### 两个独立的陈旧源，只修一个不够（实测踩过）

「上传没反应」这个症状有**两层**缓存都会造成，而且它们看起来完全一样：

| 层 | 机制 | 症状 | 解法 |
|---|---|---|---|
| 浏览器 | 文件名固定 → 缓存命中旧图 | 界面显示旧头像 | URL 带 `?v=` 版本 |
| 会话 | `session.cookieCache` 里存着 `{session, user}` 的整份快照，`maxAge` 内不查库 | **同样**显示旧头像 | `cookieCache: { enabled: false }` |

第二层之所以会中招：**头像是绕开 Better Auth 直接写库的**（`routes/avatar.ts`
要配合「先文件后指针」的顺序，所以用 drizzle 更新 `user.image`），
而会话缓存不知道这件事。

实测顺序值得记下来：先按设计修好了 `?v=`，重新加载界面**头像依然不动**，
才定位到第二层。如果只验一次就收工，会误以为修好了——
**「看起来一样」的两种原因叠在一起时，修完一个必须重新验一遍。**

`cookieCache.version` 是个诱人的假解法：它的签名 `(session, user) => string`
看起来正好能当资料指纹。但它**读的时候也拿 cookie 里那份 user 重算**，
与写入时算的是同一个对象，必然自洽——它只用于「cookie 结构升级，作废旧缓存」，
不能发现用户资料变了。实测加了指纹仍然陈旧。

详细理由与取舍见 D-037。

### 12.7 采集点：`services/model.ts` 是唯一入口

这个文件本来就是收口点（它自己的注释写着「重构前这段逻辑在两处各抄了一份」）。
记账放在这里，就**不可能出现「新加一条调用路径忘了记账」**。

| 调用 | 取 usage 的方式 | 为什么 |
|---|---|---|
| `callChat`（非流式） | `middleware.onFinish(info.usage)` | middleware 是 `TextActivityOptions` 的合法字段 |
| `streamChat` | 包一层**透传生成器**，在 `finally` 里落账 | 用量的 chunk 在末尾才到；且必须**原样透传**每个 chunk，不能提前消费 `RUN_FINISHED` |
| `callEmbed` | `result.usage` | 返回值里本来就有，之前被丢掉了 |

流式那条为什么要包一层而不是在调用处记账：**记账逻辑不出 `model.ts`**，
调用方（`assistant-stream.ts`）一行都不用改。而且 `finally` 保证
「流被中断」也落账——那正是最需要记下来的一类。

**改动范围只有 `model.ts` 一个文件**，这是当初把适配器收口到这里换来的收益。

### 12.8 热力图的网格交给 `@uiw/react-heat-map`

**背景**：第一版是手搓的（371 个 div + 自己算周对齐与月份标签），实测踩了
一个 bug：月份标签的判定写成「这一周的第一天所在月与上一周不同就打标签」，
而月份变化常常落在**周的中间**，于是整个月被跳过——370 天只打出 3 个
标签（应有 13 个）。同类的边界还有首周补空、容器宽度与列数对齐等。

**决定**：日历网格与星期/月份标签交给 `@uiw/react-heat-map@2.3.4`，
产品规则留在我们这边。

**选它的三条依据**（都实际核对过，不是看 README）：

| 依据 | 核对结果 |
|---|---|
| 零运行时依赖 | `dependencies` 是 `undefined`；peer 只有 react / react-dom / `@babel/runtime`——而 `@babel/runtime` 本来就在依赖树里（`@vitejs/plugin-react` 带来的） |
| 能单格自定义 | `rectRender(props, item)` 返回自定义元素；`item` 带我们传进去的自定义字段（`formatData` 用展开合并） |
| 能接我们的分档 | `panelColors` 接受 `Record<number, string>`，语义是「第一个严格大于 count 的阈值」——正好能吃分位数阈值 |
| 包体与样式 | ESM 76KB，只 import `style/index.css`（不是 `.less`，Vite 原生处理，不引入额外依赖） |
| 维护状态 | 2.3.4 发布于 2026-05-28，前几版 2.3.x / 2.3.2 / 2.3.3 逐年有更新，不是弃坑项目。且远早于今天，符合本项目的供应链策略 |

> **这不是「引入图表库」的反转。** echarts / recharts / `@ant-design/plots`
> 那种通用图表引擎仍然不引——它们解决「任意数据 → 任意图形」，
> 而这里只要一个日历网格（`Tech §6` 的取向不变）。选的是一个 76KB、
> 零依赖的专用组件，不是一个绘图框架。

#### 两个静默陷阱（都实测踩到）

**一、日期键的格式必须统一。** 库内部用 `YYYY/M/D`（**不补零**），
而 API 给的是 `2026-09-18`（补零）。直接 `replaceAll('-', '/')` 会得到
`2026/09/18`，与库的 `2026/9/18` **永远不相等**，于是：

```
rectRender 里查表全部落空 → 提前 return → 三个覆盖状态全部失效
（空格子、斜线、今日描边）
```

而图**看起来完全正常**——库的默认渲染把格子照常画出来了，只是我们的
规则一条没生效。与月份标签那个 bug 同一类：**日期格式不一致，不报错，
只是不对**。所以只在一个 `dateKey()` 里转换，不各写一遍。

**二、列数是从容器宽度推的，不是从日期范围推的。** 库的 `gridNum` 是
`floor((clientWidth - leftPad) / (rectSize + space))`，于是 **CSS 自适应会
安静地丢掉放不下的那几天**：

```
370 天在 680px 的容器里 → 只渲染 53 列 → 最后 4 天（含「今天」）消失
```

而图看起来依然正常（就是「最近一年」少了一截，没人会数格子）。
所以要**自己按日期范围算好宽度**传给 SVG（`width = 28 + 列数 × 13`），
左右内边距也就不对称了（左 8 右 16），让一年的 730px 刚好落在 758px
的面板里、不出横向滚动条。

#### 只有一条退化，已接受

SVG 里画重复条纹要先在 `<defs>` 定义 `<pattern>`，而这个库的 SVG 子元素是
固定的、插不进去。所以「有调用但用量未上报」从**斜纹**退化成**一条对角线**：

```
斜纹（原设计）          对角线（现在）
▨▨▨▨                ◤
▨▨▨▨         →      ◢
▨▨▨▨
```

11px 的格子里两者辨识度没有实质差别，而且它仍然是**非颜色线索**——
色盲用户也能分辨，这条要求没丢。`DESIGN.md` §3.6.1 与 §8.12 已同步。
