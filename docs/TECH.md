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
| ORM | Drizzle 0.45（PG：postgres.js / 本地：better-sqlite3） | 类型安全的 SQL，不引入第二套查询语言 |
| 数据库 | **服务器**：PostgreSQL 17 + pgvector 0.8；**本地开发 / 桌面端**：SQLite + FTS5 | 同一套服务层。按 `DATABASE_URL` 协议头判定驱动，未设置默认 SQLite（免 Docker）。方言分支只在列明的 5 处，见 D-045 与 RESEARCH §11 |
| 认证 | Better Auth 1.7 + drizzle adapter | 自托管单用户，邮箱密码足够 |
| AI | TanStack AI 0.55 | 见 §5 |
| 包管理 | pnpm workspace + **catalog** | 前后端共享类型包；依赖版本集中声明 |
| 类型检查 | **TypeScript 7.0** | Go 重写版。见下方说明 |
| Lint / Format | **oxlint + oxfmt** | 单命令跑全仓，比 ESLint + Prettier 快一个数量级 |
| 部署 | Docker Compose | 自托管服务器：Postgres 容器 + 应用容器；本地开发免 Docker（SQLite） |

### TypeScript 7 的说明

TS 7 是 Go 重写的编译器（`tsc` 是平台原生二进制，通过 `@typescript/typescript-*` 分发）。
本项目实测通过：全仓 `pnpm -r typecheck`（当时是三个包，现在是全部 workspace 包）、
服务端构建、Vite 构建全部正常，Drizzle 的 schema 类型推断没有出现问题。

**为什么值得记一笔**：选它的时候是刻意的风险——Go 重写版改变了编译器的实现，
类型推断的边界行为可能有差异。当时的判断是「先在 5.9 上跑通，等 7 稳定再升」，
后来实测证明两个版本在本项目的用法下行为一致。

### 被否决的方案

| 方案 | 否决原因 |
|---|---|
| TanStack Start | worker 与浏览器扩展都需要真实 HTTP 接口，server function 覆盖不了；SSR 无收益 |
| Next.js | 同上的 SSR 无收益，且 App Router 的复杂度换不来任何东西 |
| SQLite 作为**唯一**后端 | 云端明确继续用 Postgres（D-045）：pgvector 的 HNSW 与表达式索引在服务器路径仍是最优解。SQLite 采纳为**本地开发与桌面端**后端——原否决的两条理由在本地路径上都有回应：中文分词本就在应用侧完成（jieba → `search_text`，FTS5 对预分词文本恰好正确）；sqlite-vec 的暴力扫描在个人库规模是毫秒级，可接受。见 RESEARCH §11 |
| ParadeDB | 中文检索更强（内置 Lindera），但 Community 版是 **AGPL-3.0**。作为独立容器使用对个人无约束，但会成为一个需要解释的依赖。见 §4.4 的替代方案 |
| 现成 RAG 框架（Mastra RAG / LlamaIndex.TS / LangChain.js） | 它们都想接管文档与分块的数据模型，而本项目必须要 chunk 级引用指回自己的表。见 §6 |
| 一站式 RAG 平台（RAGFlow / Dify / FastGPT / AnythingLLM / Khoj） | 企业向、资源占用大（RAGFlow 最低 4 核 16G）、引用是黑盒。调研细节见 RESEARCH.md |

---

## 2. 总体架构

```
┌──────────────────────────────────────────────────────────┐
│  浏览器 / 桌面载体                                        │
│  ┌──────────────────┐   ┌─────────────────────────────┐ │
│  │ React SPA        │   │ 浏览器扩展（M2）             │ │
│  │ TanStack Router  │   │ 在用户会话里抓取             │ │
│  └────────┬─────────┘   └──────────────┬──────────────┘ │
│  ┌────────┴────────────────┐  Electron 载体（D-046）：   │
│  │ 桌面端 apps/desktop：   │  主进程进程内起私有宿主，  │
│  │ 同一 SPA，宿主在本地    │  页面加载宿主自己的地址    │
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
│  PostgreSQL / SQLite     │  文件系统                       │
│  documents / chunks      │  data/vault/    笔记（真相）    │
│  jobs / usage_log        │  data/uploads/  上传的原件      │
│  FTS + pgvector 索引      │  data/raw/      抓取快照        │
│  ← 数据库可从文件重建      │  data/avatars/  头像（非内容）  │
└──────────────────────────┴───────────────────────────────┘
```

### 一条贯穿全局的规则

**文件是真相，数据库是可重建的索引。**

- 笔记正文在 `data/vault/年/月/标题-id.md`，纯文件，可以直接用 Typora / Obsidian / VS Code 打开（编辑器规范形见 PRD 5.4）
- **上传的原件在 `data/uploads/<文档id>/<原文件名>`**，旁边一份 `meta.json`
  记着标题、标签、目录与时间——所以文件类文档**也能从文件重建**（§13）
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
│   ├── tokenizer/               # 中文分词（写入与检索两侧共用同一份规则）
│   ├── office/                  # 六种格式的编辑外壳与解析/保存（D-054，见 §15）
│   └── chat/                    # 对话面板：消息区、检索过程、引用、输入区（D-099）
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

### 包与目录的分工

| 位置 | 是什么 | 依赖谁 |
|---|---|---|
| `packages/shared` | **契约**。API 形状、插件接口、运行接口 | 只有 zod |
| `packages/core` | **骨架**。注册表、配置三层解析、RRF、检索编排 | shared |
| `packages/tokenizer` | 分词规则。写入与检索两侧**必须**是同一份 | 无 |
| `packages/office` | **编辑器外壳与六种格式的解析/保存**。前端包（见 §15） | shared |
| `packages/chat` | **对话面板**。消息区 / 检索过程 / 引用 / 输入区 + 状态层（见 §5.5） | shared |
| `plugins/*` | **实现**。每条接缝的具体做法 | 只有 shared |
| `apps/server/src/plugins/host.ts` | **装配**。全仓唯一同时知道宿主与插件的地方 | 两边都有 |

**两个前端包同样是「源码发布、由使用方编译」**（`packages/office`、
`packages/chat`，D-054/D-099）：`exports` 指 `src/index.ts`、没有 build
脚本，Vite 把它们编进 `apps/web` 的产物。它们在浏览器侧运行，与
`shared`/`core`/`tokenizer` 那条服务端依赖链互不相干；共同点是
「**壳与渲染归包，方言与取写归宿主**」的边界（office 是 `EditorIo`，
chat 是 `ChatIo` + `composerStatus` 数据槽）。

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
 ├─ 通道 1：关键词（jieba 分词 + 全文索引）  ─┐
 ├─ 通道 2：子串兜底（正文子串匹配）        ─┤→ 加权 RRF → 取前 N →（M1）rerank → 组装上下文
 └─ 通道 3：向量（M1）                     ─┘
```

通道是**接缝**：每个通道独立召回一批已排序的 id，融合层只认这个形状。M1 加向量通道时，融合层一行不用改。

**索引与 SQL 按后端各有实现**：PG 用 GIN + `ts_rank_cd`、`pg_trgm` + ILIKE、pgvector HNSW；SQLite 用 FTS5 + `bm25()`、`instr`/`LIKE`、（M1）sqlite-vec。方言分支只存在于各通道与迁移内部，融合层、服务层与前端契约不感知后端（D-045）。

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
（SQLite 路径：门槛语义相同，排序换成 `bm25()`——RRF 只看名次，分布差异被吸收。）

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
连续的汉字。子串通道做正文的**子串匹配**，不受分词结果影响：
PG 用 `pg_trgm` 索引加速 `ILIKE`；SQLite 用 `instr(lower(…), lower(…))`
（注意 SQLite 的 `LIKE` 只对 ASCII 不区分大小写，中文路径一律显式 `lower()`）。

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

**`text` 是洗过 Markdown 的展示文本，`start`/`end` 是**未洗的窗口边界**。**
两者不再满足 `end - start === text.length`（清洗会去掉 `#`、`**`、表格竖线）
——这是刻意的：偏移那对字段是给「跳回原文」用的，指向正文里的区间，不能跟着
展示走。而 `text` 会被直接渲染在库卡片与命令面板的副标题上，留着标记就会读成
源码（同一份文档在库卡片里干净、在搜索结果里带 `#`，用户会以为搜到的是另一条）。
清洗规则只有一份：`apps/server/src/lib/text.ts` 的 `stripMarkdown`，浏览路径的
`toExcerpt` 也用它。要用 `text` 做高亮的话，得另加一个纯文本字段，不要改这两个
偏移的含义。

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

**以上向量设计是 PG 侧的**。SQLite 侧（M1-B）用 `vec0` 虚拟表 + 暴力 KNN，
`chunks` 索引同构（FTS5 版），蓝图与量级论证见 `RESEARCH.md` §11.3。

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

**适用边界（D-099）**：这一章讲的是**服务端怎么调模型**——chat / embed /
rerank / summarize 与适配器构造都归 TanStack AI，且适配器只在
`plugins/provider/` 里建。浏览器侧的对话状态层从 `@tanstack/ai-react`
换成了 assistant-ui（§5.4/§5.5），那是**另一层职责**，不改变这条边界。

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

对话**不是**「一次请求一次响应」，而是 AG-UI 协议的服务端事件流
（`toServerSentEventsResponse`），由前端 `@mimir/chat` 里的
`@assistant-ui/react-ag-ui` 运行时消费（D-099；浏览器侧客户端从
`@tanstack/ai-react` 的 `useChat` 换到了它，服务端一行没动）。

事件的顺序是刻意的，而且**生命周期括号由服务端拥有**（D-099 的修复）：

```
RUN_STARTED → mimir.conversation → mimir.trace → mimir.citations
            → 正文 → mimir.trace(整轮耗时) → RUN_FINISHED
```

- 中间几个在**模型还没开始生成时**就发出去，于是引用卡片与检索过程立刻出现，
  用户不必对着空白等模型。三个名字与载荷定义在 `packages/shared`
  （`EVENT_TRACE` 等），前后端共用——两边各写一遍字符串的话，
  打错一个字母是静默失效
- **`RUN_STARTED` 必须是第一条、`RUN_FINISHED` 必须是最后一条**：AG-UI 的
  客户端在流开头就校验「第一条必须是 RUN_STARTED」，整轮结束后不再收任何
  事件（实测 `@ag-ui/client@0.0.59` 抛 `First event must be 'RUN_STARTED'`
  与 `Cannot send event type 'CUSTOM': The run has already finished`）。
  所以模型那一趟的 `RUN_STARTED` / `RUN_FINISHED` 被服务端**剥掉不转发**
  （叠加会命中 `Cannot send 'RUN_STARTED' while a run is still active`），
  模型的用量接住转挂到自己那条 `RUN_FINISHED` 的 `metadata` 上
  （目前没有消费者——上下文容量读的是服务端记的 `usageLog`）；
  只检索路径（不调模型）同样补一对括号。顺序由
  `apps/server/src/test/chat-stream.test.ts` 守着——它把真实的响应字节
  喂给协议客户端跑一遍，而不是断言「流里有 RUN_STARTED」（那条断言在顺序
  错时照样通过）

**为什么走自定义事件而不是协议原生的 part**：
`THINKING_*` 只是一个字符串，而 trace 是结构化的分步记录（每步带图标、
关键词、具体数字）；citations 含文档 id 与字符偏移，协议里没有对应形状。
自定义事件在客户端那一侧被聚合器变成**消息里的 data part**
（`mimir.trace` / `mimir.citations` / `mimir.failure`），与历史会话同一个
形状——见 §5.5。

**会话 id 放在请求体（`forwardedProps`）而不是 URL**：地址一变，AG-UI 的
agent 就要重建，重建会切断正在进行的流。代价是新建会话时客户端不知道 id：
服务端仍用 `mimir.conversation` 事件回传，而前端在请求发出**之前**先建
会话（`onRunInitialized` 钩子，被 await 且在建连之前执行——D-099 用它替掉
了 `creating` 那个忙标志）。每轮的参数（检索范围 / 思考强度）走
`forwardedProps.runConfig`，顶层旧写法仍认、顶层优先。

非流式的 `POST /api/conversations/:id/ask` 保留：测试与 curl 用它，
且与流式版**共用同一套检索**（`search()`），所以不会出现「界面看到的引用
和测试验证的引用不一样」。

### 5.5 前端：用 SDK 的 UI 层，不手搓

对话**整体是一个包**（`packages/chat`，D-099）。它只做这一件事，宿主
（`apps/web`）只提供数据与动作：

| 层 | 用什么 |
|---|---|
| 消息状态、流式接收、队列、停止 | `@assistant-ui/react` + `@assistant-ui/react-ag-ui`（内部是 `@ag-ui/client`） |
| 消息与输入区的 UI 原语 | 同一套包的 primitives，外面套 antd 组件 |
| 消息正文渲染 | `@tanstack/markdown` 的 `<Markdown>` + `streamingMarkdownExtension` |

`@tanstack/markdown` 自带**流式 markdown 解析**（处理半截语法）与 HTML 转义，
所以回答是 Markdown 渲染的，且「`**` 只到了一半」这种中间态不用自己处理。
**不换**官方那句 `@assistant-ui/react-markdown`：它带进 react-markdown 与
一整套 radix 依赖，而本仓现有的流式扩展与样式覆写都长在 `@tanstack/markdown`
上。

`packages/chat/src/runtime/use-mimir-runtime.ts` 是对话状态的唯一入口，
组件不直接碰运行时。它与宿主之间只有两个口：动作面 `ChatIo`
（建会话 / 读历史 / 存笔记 / 跳转，宿主实现在 `apps/web/src/lib/chat-io.ts`）
与数据槽 `composerStatus`（文档列表 / 模型角色 / 用量，宿主 `useQuery` 取好）。
包内 **import 不到**宿主的 api / router / queryClient——这是结构性边界
（与 `packages/office` 的 `EditorIo` 同一条），不是约定。

**三条原 `useChat` 时代的接口细节，各自的下场**：

1. `useChat` 只在**挂载那一刻**读 `initialMessages` → 打开历史会话必须等
   数据取回再挂载对话体（否则右栏一直空白，而中栏的「本次引用」正常显示）。
   现在由**历史适配器 + `thread.isLoading`** 承担：宿主可以在数据没到位时
   就挂载，包出骨架屏（`runtime/history.ts` 的 `load()` 返回
   `ExportedMessageRepository`；`append` 是空实现——落库是服务端的职责）
2. **会话 id 不进 URL、切换会话由宿主 `key` 重挂载**：新会话的第一问会
   「建会话 → 写 URL」，如果对话体的 key 直接跟着 URL 的 id 走，这次导航会
   把刚挂载的对话体卸载重建、把正在接收的流丢掉（症状：提问后右栏什么都
   不显示，而消息其实已经落库）。区分「自己刚创建的 id」（不重挂载）与
   「导航切换过去的」（重挂载并灌历史）——这条契约**不变**
3. **实时份与落库份不再需要对齐**：trace / 引用 / 失败是消息里的 data part
   （实时由聚合器产生，历史由适配器转成同名 part），旧实现那套按位置对齐
   的 `resolveRound` 整体退役

**包与宿主的样式边界**：颜色 / 间距 / 圆角走 antd token（包内
`createStyles` 内部就是宿主的 `theme.useToken()`，包不新建主题）；
字号与栏宽比例走宿主填的 CSS 变量（`--mimir-chat-font-*` 八档来自
`FONT_SIZE`、`--mimir-chat-gutter` 主视图 40px / 侧栏 16px），包内写
`var(…, 回退值)`。细节与坑见 `packages/chat/AGENTS.md`。

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

#### 模型用途：候选过滤的判据（D-080）

每个模型条目带 `purposes: ModelPurpose[]`，取值 `chat` / `embed` / `rerank`。
**它是「这个模型能干什么活」的显式声明，用途只有一个：决定任务分配里
哪些角色能选中它**。

| 用途 | 谁接受 |
|---|---|
| `chat` | 对话 / 深度思考 / 摘要 |
| `embed` | 向量化 |
| `rerank` | 无角色（角色未实现，标注先留着）|

这一层取代了早先「按模型名正则猜能不能做向量化」（`modelsForRole` 与
`probeProvider` 各猜一遍）。猜的两个问题：名字不带关键词的 embedding 模型
（`voyage-3`）永远进不了向量化；用户也没法纠正——界面上根本没有这个开关。

**推断只是兜底，不是判据**（`inferModelPurposes`，`packages/shared/src/config.ts`）：
旧配置回填、预设建议、端点没回传类型的拉取结果都走它。推断出的值**落库之后
就是显式标注**，用户随时可改。落库前归一化的执行点在
`plugins/provider/src/instances.ts` 的 `normalizePurposes`（空数组与坏值都回填，
所以一个模型永远不会在任何角色的下拉里「莫名消失」）。

**用途与绑定矛盾时不保留绑定**：`normalizeRoles` 会把指向「用途不覆盖该角色」
的绑定清空（如向量化角色绑着一个只标了对话的模型）。不这么做的话，
界面显示「就绪」而第一次调用才在深处失败。

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
| 格式 | 保存时 | 地址是 http(s)、id 唯一、新增的必须有密钥、每个模型至少一个用途 | 零 |
| 连通性 | 点「测试连接」 | 真的发一次请求（有模型时发最小对话；没有则拉一次 `/models`） | 一次调用 |
| 角色适配 | 保存时 + 选角色时 | 只列用途覆盖该角色的模型；矛盾绑定被清空 | 零 |

供应商级探测**不依赖角色绑定**，这是它存在的理由：新建供应商时它不属于
任何角色，而用户此刻最想知道的就是「这个地址和密钥通不通」。
`tookMs` 一起返回，用来区分「慢」与「不通」。挑探测模型时优先取
**标了对话用途**的第一个（不再是按名字猜）。

#### 从供应商拉模型列表（纯读，D-080）

四个同类产品都有这个动作（`docs/RESEARCH.md`）。它**不花 token**
（`GET /models`），所以可以放心点。

`POST /api/config/fetch-models` 是**纯读**：结果不写配置，界面把它合进
创建 / 编辑表单的草稿，随「保存」一起提交。两个后果：

1. **创建表单里也能拉**——那时供应商还不存在，而旧形状（拉取即写回）
   要求先保存
2. 拉取、手改、改用途是**同一份草稿**，保存一次全落库

合并规则三条（`mergeFetchedModels`，`apps/web/src/components/settings/model-config.ts`），
方向都是「不覆盖用户的显式标注」：

| 情况 | 处理 |
|---|---|
| 已在列表里 | 保留用途与来源（手动的保持手动）|
| 新模型 | 用途取端点回传的类型（`type: "embedding"` 这类），没有就按模型名推断 |
| 端点清单里没有 | 手动的保留（端点不管它），其余的移除 |

密钥的来源由服务端按序解析：本次新填的草稿 > 已存实例解出的密钥；
两者都没有就拒绝（拉取要一次真实鉴权）。

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
| `capturer` | URL → **原始内容** + 元数据（不转换格式） | 网页、公众号、GitHub；**feed 解析**（`feed.ts`，RSS 2.0 / Atom 归一，M1-E） | Star 同步、扩展 |
| `parser` | 原始内容 → 统一 Markdown（不抓取、不写库） | Markdown 直通、HTML 正文提取、**HTML 片段直转**（feed 用，M1-E）、纯文本、Word、Excel、PowerPoint、**PDF 文字层**（M1-E） | 旧版 .doc、OCR |
| `leg` | 查询 → 已排序的**检索单元** id 列表 | 关键词、子串兜底、**语义向量**（PG=halfvec HNSW / SQLite=sqlite-vec 标量函数，M1-C） | 重排序 |
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

key 是**相对 `DATA_DIR` 的 POSIX 路径**（`vault/…`、`uploads/…`、`raw/…`、
`avatars/…`）：
本地后端下它与磁盘路径一一对应（所以 Typora / Obsidian / git 照旧可用），
换 S3 时同一批 key 直接是桶内对象名。四个前缀里的分工：
`vault/` 与 `uploads/` 是**内容**（都进重建索引的扫描范围，§13），
`raw/` 是抓取快照，`avatars/` 延续 D-036 的边界——
头像不在 `vault/` 下，因此不进分词、不进导出、不进重建索引的扫描范围。

**明确不做成接缝的**（`DECISIONS.md` D-031，**已由 D-038、D-045 两次收窄**）：
向量库、图数据库。数据库现在是**受控的双实现**（D-045）：服务器=Postgres、
本地开发与桌面=SQLite，由 `DATABASE_URL` 协议头判定——但**没有**「可切换存储引擎」
的通用接口：方言分支收敛在列明的五处（两个检索通道、迁移与 schema、
摘要切片与用量聚合统一成 JS），其余代码不感知后端。
WeKnora 支持 10 种向量库是因为它要卖给什么栈都有的企业；本项目加第二个后端
是因为「本地与桌面需要一个无服务的库」这个真实需求，不是「兼容各种栈」。

> **注意这里原先还列着「对象存储」**，D-038 已把它移出并做了接缝。
> 理由不是「用户想要」，而是 D-031 自己给的判据：
> **有多实现的地方抽接缝**。文件存储**有**两个实现（本地与 S3），
> 而且第二个不是「兼容已有栈」——VPS 部署的人本来就没有本地文件可以开。
> 数据库的第二个实现（SQLite）同理是真实需求驱动，但方言税真实存在，
> 所以分支点是**点名收敛**的，不做通用抽象——见 D-045。


同理不做的：外部插件市场（PRD §1）、Cordis 式依赖注入（7.3）。

### 7.3 推进方式：先别造框架

**按接缝组织代码，等第二个实现出现了再抽接口。**

理由：`capturer` / `parser` / `provider` 三条接缝的实现都还很少。凭想象设计接口，
八成会把参数集设计错，然后每加一个实现都要改接口——比不抽还累。

**四条接缝现在都有了实现**，形状也定型了（`packages/shared/src/seams.ts`）：

```
plugins/leg/src/
├── keyword/       jieba 预分词 + 全文索引；PG=ts_rank_cd / SQLite=FTS5+bm25
├── substring/     正文子串逐词匹配；PG=ILIKE+trgm / SQLite=instr+LIKE
└── index.ts       install(host)：按 host.db.dialect 选方言实现并注册进 host.leg
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

**值的真相在服务端，界面不自己存一份。** `GET /api/config` 回四块：

| 块 | 内容 |
|---|---|
| `settings` | 每个键的当前值（密钥除外）、来源、类型、说明、改了要不要重建索引 |
| `plugins` | 四条接缝的描述符 + 可用性 |
| `models` | 角色 → 就绪状态（派生值，不存） |
| `database` | 当前驱动（`postgres` / `sqlite`）与 SQLite 的库文件路径 |

`database` 是**部署事实**（`DATABASE_URL` 不入键表，见 §7.5），但它必须由服务端
回传而不是由界面写死厂商名：双后端（D-045）下写死的那一半在另一套部署里必然说错，
而「数据与备份」分区的「真相在哪」正是用户拿来核对的地方——同一屏上的
「文档 17」就是可对照的。Postgres 下 `file` 为 `null`：连接串含凭据，不下发。

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

默认（本地文件后端）：`data/` 目录 + 数据库转储定时打包（Postgres 用 `pg_dump`；
SQLite 直接拷 `data/mimir.db`，或运行中的热备用 `VACUUM INTO`）。
因为「文件是真相」，最坏情况可以从 `data/vault`（笔记）、`data/uploads`（上传的原件）与
`data/raw`（抓取快照）**完整重建数据库**。

`uploads/` 必须一起备份——它是文件的真相，丢了就真的丢了（正文只是它的
派生数据）。`avatars/` 可以丢：它是账户资料，不重建任何东西（D-036）。

选 S3 后端之后，真相在桶里，备份变成两件事：**桶本身的持久化**
（对象存储通常自带冗余，但版本控制与生命周期策略要自己开）
加**数据库转储**。注意列表类操作在 S3 上是按请求计费的，
所以「定期全量拉回本地」这类做法要先算成本——而重建索引只 LIST 一次
（§13.2 的 `listUploads()`），不按目录逐个列举。

两种后端都成立的一条没有变：**数据库始终是可重建的**，
所以数据库转储丢了不致命，桶或 `data/` 丢了才致命。

### 8.6 本地开发与桌面端（SQLite）

`DATABASE_URL` 未设置（或以 `file:` 开头 / 是一个路径）时，服务端使用 SQLite：

- 库文件默认在 `data/mimir.db`（WAL 模式，旁边有 `-wal` / `-shm` 两个伴生文件，
  都不进 git——`data/` 本来就被忽略）
- **启动时自动应用迁移**：SQLite 路径下迁移是幂等的（journal 表记账），
  首次运行 `pnpm dev` 即自动建库建表，桌面端将来也依赖这一行为；
  Postgres 路径保持手动 `pnpm db:migrate`（生产习惯不变，见 §8.4）
- **FTS5 全文索引**由 `documents` 上的触发器维护，`pnpm db:reindex` 可全量重建
- 数据目录不存在时**自动创建**（Postgres 路径同样受益）——原先「目录不存在就抛错」
  是新环境 500 的来源之一；目录写错路径的代价是新建一个空库，可接受（D-045）

与生产路径的关系：compose / Dockerfile **始终显式**传 `postgres://` 的
`DATABASE_URL`，不受默认值影响；两条路径共用同一套 schema、迁移体系与服务层。

---

### 8.7 首启的默认内容（知识库 + 产品说明）

全新的库是空的。第一次打开的人（包括部署完自己试用的那一刻）看到的是
一句「先创建一个知识库」，而这句话不解释「这东西怎么用、第一步做什么」。

所以第一次建号时会播种一份默认内容（`services/seed.ts`）：一个叫
**「开始使用」**的知识库 + 一篇 **《mimir 产品说明》**。说明本身是一篇
普通笔记——可搜、可被 AI 引用、可随时改或删——它在解释产品的同时
演示了「一条笔记长什么样」。

**为什么是文档而不是引导浮层**：浮层是要关掉才能继续的东西，
而一篇真文档本身就是可留下、可改、可被搜到的资产。

**触发点是两个入口 + 一个持久标记**：

| 入口 | 覆盖 |
|---|---|
| `auth.ts` 的 `user.create.after` | 新建号（环境变量建号与首次注册共用这一个钩子） |
| `boot.ts` 的 `ensureDefaultContent` | **已有实例**——它们不会再经过建号钩子 |

判据是设置表里的 `seed.defaultContent`（版本号，`hidden` 键），
**不是「库是不是空的」**：用户删掉默认知识库是明确的意思表示，
下次启动它不该回来——用「库空就播」的判据会让它每重启一次就长回来一次，
而用户不会想到「有个标记说该播」。换一套默认内容时递增版本号即可。

播种走**与用户操作完全相同的那条写入路径**（`createFolder` / `createNote`），
所以铁律 2（先文件后数据库）、分块建索引、frontmatter 与目录指派
一个不漏。少了任何一环，得到的都是一份「看着在、搜不到」的说明。

两个入口失败都不阻断（账号与启动是核心，默认内容是附赠），
测试环境由两个入口各自跳过（集成测试有自己的账号与库准备流程）。

`settings.update()` 的返回值**必须检查**：它对未注册的键与校验失败是
「返回 issues、不写」。不检查的话标记没落库而函数照常报成功——症状是
每次重启重播一次，而且**用户删掉默认内容之后它会再回来**。
（实测踩过：开发中的实例热重载时装配层还拿着旧键表，写入被静默拒绝。）

---

## 9. 测试策略

### 9.1 当前覆盖

| 范围 | 数量 | 方式 |
|---|---|---|
| 服务端集成 | 197 | Hono 的 `app.request()` 内存调用，不占端口。M1 新增：分块四类断言（23）、分块级检索与引用组装（5）、feed 解析与订阅链路（12，真起 HTTP 服务器）、PDF 提取（4，pdf-lib 现造真文件）、嵌入端点（3） |
| 前端组件与编辑器 | 247 | happy-dom + 真实 Tiptap 实例 + 真实渲染算对比度 |

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

集成测试默认跑在 **SQLite 临时库**上（`globalSetup` 建临时文件库并应用迁移）——
不需要 Docker，`pnpm check` 在任何机器上都能跑。

检索相关的测试**两种方言都要过**（方言对齐门）：设置
`TEST_DATABASE_URL=postgres://…mimir_test` 时，`globalSetup` 改走 Postgres 路径
（清库、建扩展、推 schema），同一套断言在 PG 上复跑——两个通道的 SQL 是
按方言分开写的，只在一种方言上绿的测试不算绿。

集成测试用**独立的测试库**（Postgres 路径下库名必须包含 `mimir_test`，
否则拒绝运行）和**独立的 vault 目录**（`data/.test/`）。

这一条踩过坑：测试一开始写进了真实 vault，跑几次之后用户的笔记目录里多了 18 个测试垃圾文件。

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

坑**按区域就近记录**：改哪里的代码，哪份坑表就跟着被读。唯一真相在各区域的
`AGENTS.md`（每份都有「会静默出错的地方」一节）与根 `AGENTS.md`（跨区域的坑），
本节只做路由，不再收坑。

2026-10 整理：原先这里按时间累积的 95 条与根坑表的区域条目已归位合并到各区域
（重复条目取并集；「pgvector 维度上限」一条修正了 2048 的旧数字——HNSW 对
`vector` 的上限是 2000 维）。

| 区域 | 坑表 |
|---|---|
| 编辑器与界面（`apps/web`） | `apps/web/AGENTS.md` |
| Office / PDF 的预览与编辑（`packages/office`） | `packages/office/AGENTS.md` |
| 对话面板（`packages/chat`） | `packages/chat/AGENTS.md` |
| 服务端 / 数据库 / 检索 / 存储（`apps/server`） | `apps/server/AGENTS.md` |
| 桌面端（`apps/desktop`） | `apps/desktop/AGENTS.md` |
| 跨区域（工具链 / 依赖 / React Compiler / antd-style 机制） | 根 `AGENTS.md` |

部署相关的坑在 §8；桌面端两种模式的行为矩阵在 §14.6。

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
5. ~~**M1-B 分块与向量化**~~ —— **已完成**（D-084）
   - ~~`chunks` / `chunk_embeddings` 表 + 迁移（**PG 与 SQLite 各一份**，与主 schema 同一个守卫测试对齐）~~
     `drizzle/0010_chunks.sql`（含按维度分区的 HNSW 表达式索引，手写——drizzle
     表达不了）与 `drizzle-sqlite/0007_chunks.sql` + `0007_chunks_fts.sql`（FTS5
     虚拟表 + 触发器，与 documents_fts 同一套做法）
   - ~~`lib/chunk.ts`（确定性、偏移可逆、按结构切）+ 四类断言（§9.5）~~
     23 条用例；**分块的 `search_text` 必须带标题**（否则按标题里的词搜不到正文，
     实测 `search.test.ts` 抓到）
   - ~~分块接入写入路径（笔记保存、抓取入库）与重建索引~~
     **四条**写入路径统一走 `services/chunks.ts` 的 `rebuildChunksAndEmbed`
     （笔记新建 / 更新、抓取、上传、重建索引）——上传那条一度漏掉，
     被 `upload.test.ts` 当场抓到，正是「抄三遍必漏一处」的实证
   - ~~`POST /maintenance/embed` 分批补嵌入~~ 外加 `GET /maintenance/chunks`
     （状态）与 `POST /maintenance/chunks/rebuild`（重算分块，不调模型）。
     界面入口在设置 › 检索的「分块与向量」面板
6. ~~**M1-C 混合检索**~~ —— **已完成**（D-084）
   - ~~两条现有通道改成返回分块 id（各自一个文件，`plugins/leg/src/`）~~
     编排层一行没改（D-032 的判据兑现）
   - ~~`plugins/leg/src/vector/`（PG=halfvec HNSW / SQLite=sqlite-vec，同一接缝两个方言模块）+ 在 `install()` 里注册一行~~
     **SQLite 用标量函数 `vec_distance_cosine` 而不是 `vec0` 虚拟表**——
     向量已经在 `chunk_embeddings` 一张表里，vec0 要第二份数据与同步逻辑；
     KNN 查询与 kind/tag/删除态过滤的组合也更直接（RESEARCH §11.3 的量级论证
     不变，两者同为暴力扫描）。扩展在连接时加载（`db/client.ts`），
     **加载失败抛错不降级**——它的缺席表现是「语义搜不到」，静默降级等于埋雷
   - ~~`mode` 落成通道筛选，默认模式由注册表推导~~
     未就绪的通道不进编排（状态由 core 的 `computeStatus` 算，不另写判断）
   - ~~引用组装：相邻分块合并 + 每篇上限~~ `search/index.ts` 的
     `assembleCitations`；问答与 `/api/search` 共用 `searchChunks`，
     界面契约（`SearchHit`）一个字没改
7. ~~**M1-D 带引用的问答与 AI 摘要、标签建议、内联改写**~~ —— **已完成**（D-084）
   - 摘要：`POST /api/documents/:id/summary`，走 `summarize` 角色；
     **不落库**（现用现生成，避免「正文改了摘要还是旧的」这个状态）
   - AI 标签：`POST /api/documents/:id/suggested-tags/ai`，与统计版并存
     （统计版零成本随开随算，AI 版要花钱、单独入口标明）
   - 内联改写：`POST /api/ai/rewrite`（不挂在文档下——改写的文本可能还没保存）；
     编辑器选区工具条由宿主注入回调（与「就这段提问」同一模式），
     结果**直接替换选区**（进 undo 栈可撤销）
   - 三条能力共用 `services/ai-text.ts`（形状相同：文本进文本出），
     没配模型时**如实说**（`usedModel: false` + 一句说明），不静默降级
8. ~~M1-E PDF / Word 上传（`parser` 接缝的第一个真实现）与 RSS~~
   —— **全部落地**（D-044 上传与 Office 提取；D-084 补齐 PDF 与 RSS）：
   - **PDF 文字层提取**（`plugins/parser/src/pdf.ts`）：**复用仓库里已有的
     pdf.js**（`packages/office` 的页面预览是同一个库），不引入第二个 PDF
     解析实现。`getTextContent()` 的 `hasEOL` 直接给出行边界；中文行尾
     不补空格（补了会切出假词边界）；多页文档每页一个小标题（分块器把它
     当边界，引用卡片显示「第 N 页」）；扫描件没有文字层，如实报错不做 OCR
   - **RSS 订阅**：`feeds` 表（订阅关系，双方言）+ `plugins/capturer/src/feed.ts`
     （RSS 2.0 / Atom 字段归一）+ `services/feeds.ts`（编排）+ 设置 › 订阅。
     收进来的文章走 `ingestDocument`（与「粘贴 URL」同一条写入路径，铁律 3）。
     feed 的 `content:encoded` 走 **html-fragment** 解析器——它是正文片段，
     再跑 Readability 会因「太短、不像一篇文章」丢掉（实测两行片段返回 null）。
     轮询由用户触发（M1 没有 jobs 层）；退订不删已收文章
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

**分档用这一年里的分位数**，不用固定阈值：

```
固定阈值：忙的月份全是最深色、闲的月份全是浅色 → 图没有信息
分位数  ：形状始终可读
```

代价是**分位数依赖范围**——所以范围固定成一年（`USAGE_HISTORY_DAYS`），
一档就是一个确定的区间。第一版给了 30 天 / 90 天 / 一年三档，
那让同一个颜色在不同范围下代表不同的数字，必须在图例里额外声明
「按当前范围分档」；去掉切换之后那句补偿也不需要了。

**真实数字在 tooltip 里**（`12.3 万 token · 8 次调用`），
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

#### 第三个坑：容器不可见时列数算成 0

这一条是**换完 antd 组件之后才暴露的**，也是最隐蔽的一个：

设置页的分区是 antd `Tabs`，**切走的面板是 `display: none`**。
而库的列数是量出来的：

```
gridNum = floor((svg.clientWidth - leftPad) / (rectSize + space))
```

宽度为 0 → 列数 0 → **整张网格一格都不画**，只剩星期与月份标签
（图看起来「加载了但是空的」）。而且它只在挂载时量一次
（effect 依赖里没有宽度），所以「是否恢复」全靠之后有没有一次
凑巧的重渲染——实测同一个页面来回切分区，**有时 376 格、有时 0 格**。

修法是一道确定的闸：容器宽度为 0 时**根本不挂载**那个库，
用 `ResizeObserver` 等它真的有位置了再挂（见 `WhenVisible`）。
这样库量到的一定是真实宽度，不赌任何时序。

**为什么换 antd 组件之前没暴露**：原先的手写网格用 CSS
`grid-template-columns` 排布，**不需要量尺寸**——`display: none` 时
它同样不渲染，但恢复显示时浏览器自动就对了。换成量尺寸的库之后，
「什么时候量」才成了一个必须自己保证的事。

> 这类「换个实现才暴露的时序依赖」值得单独记：它不是新引入的 bug，
> 而是**原先被实现细节掩盖掉的假设**浮出来了。

#### 一条方法论：加断言之后要**验它能红**

本轮修那个反引号坑时加了一条测试（`design.test.ts` 的
「样式模板里没有多余的反引号」），第一版用正则：

```
/(?:css|createGlobalStyle)`([\s\S]*?)`/g      ← 错的
```

非贪婪匹配会停在**第一个杂散反引号**处，于是捕获到的「模板体」里
永远不含反引号——**这条测试永远绿，包括在真正违规的时候**。

发现它靠的是往一个样式文件里注入一对反引号、跑测试、看它是否变红。
第一次注入还注错了地方（注在模板外的 JSDoc 里，那是合法的），
所以连「注入点是否正确」也得确认。

**规则**：一条新断言写完，先让它红一次再相信它。
「测试通过」本身不构成证据——**没红过的断言，与没写过没有区别**。
这与本项目对验证的一贯要求是同一条（`AGENTS.md` 的完成定义第 6 条：
没跑过的东西不要声称跑过），只是把它推到了断言自身。

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

---

## 13. 文件上传与原件

设计判断与取舍见 `DESIGN.md` §8.16 与 **D-044**。这一节写实现。

### 13.1 一份文档 = 原件 + 派生正文

```
documents 表
  body      ← 派生正文（Markdown）。检索、分块、引用、双链都只认它
  mime      ← 原件的格式（仅上传件）
  size      ← 原件的字节数
  sourceKey ← 原件在存储里的 key（仅上传件）
  parseError← 正文为空的原因（仅上传件，见 13.4）

data/uploads/<文档id>/<原文件名>   ← 原件（真相）
                    /meta.json    ← 元数据（标题/标签/目录/状态/时间）
```

**检测的判据是 `kind === 'file'` 且 `sourceKey !== null`**，不是「kind 不等于
note」——抓取的资料也没有原件（它的真相是 `raw/` 快照 + 数据库里的正文）。

### 13.2 为什么上传件的重建能力最强

抓取件没有用户可见的文件（正文只在库里，`raw/` 是派生物），所以它**不进重建
索引的扫描范围**。上传件相反：原件在 `uploads/`，元数据在 `meta.json`，
所以删库之后能完整恢复——标题、标签、目录、状态、时间全部回来。

**代价是「改了标签要写回 meta.json」**（`services/documents.ts` 的 `updateNote`）。
漏掉它就是一个静默错误：数据库里的标签是对的，而重建索引会从 meta 读回旧值，
用户加的标签凭空消失。笔记的 frontmatter 早就守着这条，上传件没有理由不守。

### 13.3 写入顺序

```
校验（大小） → 原件 → meta.json → 数据库行
```

- **校验在最前**：先写再校验会留下一个永远不会被引用的文件（与头像同一条）
- **original 先于 meta**：反过来会产生一个「有元数据、没原件」的目录
- **数据库最后**：铁律 2。最坏产生「有文件没入库」，重建索引能捡回来

删除时顺序反过来（**先库后文件**）：与头像同一条规则——
**永远不要让指针存在的时候指向一个不存在的东西**。

### 13.4 `parse_error`：空正文的三种原因

| 情形 | `body` | `parse_error` | 界面说什么 |
|---|---|---|---|
| 这个格式还没有提取实现（`planned`，M1-E 起暂无此格式——PDF 已补上文字层提取） | `''` | `NULL` | 「这种格式的正文提取将在后续版本支持」 |
| 试过、失败了（非 UTF-8 / 损坏的容器） | `''` | 原因 | 「提取正文失败：{原因}」 |
| 文件本身没有可提取的文字 | `''` | `NULL` | 「文件里没有可提取的文字」 |
| 空文件（`size = 0`） | `''` | `NULL` | 「空文件」 |

**把第一与第二混成一句是在说谎**：前者是「还没做」，后者是「做坏了」，
而用户的下一步动作完全不同（等更新 vs 查自己的文件）。这与热力图把
「有调用但用量未上报」画成斜纹而不是空底是同一条规矩。

判据收在 `@mimir/shared` 的 `parseSupport()`，界面从它派生措辞。

### 13.5 提取这一步只有一份实现

`services/extract.ts`。上传与重建索引都要「给一份文件的字节，取出可读正文」，
而两处对失败的处理不同（上传要存进 `parse_error`，重建只打日志）。
所以**「用哪个 parser、怎么把字节喂给它」放在一个文件里**，调用方各自处理结果。

抄成两份的那天起，就会出现「上传时提取成功、重建后提取失败」这种取决于
走哪条路径的行为差异——而它不报错。

### 13.6 字节输入：`ParseInput` 是判别联合

```ts
type ParseInput =
  | { type: 'html' | 'markdown' | 'text'; content: string; baseUrl?: string }
  | { type: 'docx' | 'xlsx' | 'pptx'; data: Uint8Array; filename?: string }
```

**字节 → 字符串的解码不在 parser 层**：`.txt` 的解码会失败（GBK 编码），
而那个失败要变成一句人话，所以宿主在上传路径里先解码、再交给 `text` 实现
（`apps/server/src/lib/text.ts` 的 `decodeUploadedText`）。

这个形状正是 `plugins/parser/src/index.ts` 早就预告的方向——当时写的是
「`accepts` 声明 `'pdf'` 之后，编排层按声明选实现」。**接缝没有改形状，
只是多了一类输入**。

### 13.7 上传路径的判定：先查扩展名，再查 MIME

```ts
parseTargetFor(mime, filename)
```

顺序是刻意的，而且**两端必须一致**（前端用它决定「正文这一层有没有东西可看」，
服务端用它选实现）。各写一份的话会出现「服务端提取出了正文、而前端以为
这个格式没有正文因而不显示」——那种 bug 看起来像数据丢了。

MIME 不可信的两处现实：`.md` 常被浏览器报成 `text/plain`；
`.pdf` 在部分环境里是 `application/octet-stream`。所以**扩展名优先**，
MIME 只作兜底——与「文件是真相，数据库是可重建的索引」同一条道理。

### 13.8 下载端点

```
GET /api/documents/:id/file            内联（白名单内）/ 附件（其余）
GET /api/documents/:id/file?download=1 强制附件
```

- **鉴权**：原件是私人资源，不是公开静态文件。所以 `data/uploads/` 永远
  不需要由静态中间件暴露
- **内联白名单**（`isInlineSafe`）：`text/html` 与 `image/svg+xml`
  **强制 attachment**。它们可以带脚本，而上传内容与应用**同源**——
  内联等于在自家源上执行用户文件里的脚本，会话 cookie 就在那儿
- **单段 Range**：视频要它才能播（Safari 不认整份 200）。存储接缝是整读，
  所以是「读全文再切片」——50MB 以内比给接缝加流式能力划算
- **ETag 用「大小 + 更新时间」**，不用内容哈希（那要读全文件才算得出来）。
  替换原件后 URL 不变，所以 `Cache-Control: private, no-cache`

### 13.9 替换原件

`PUT /api/documents/:id/file`。现实路径是「下载 → 用外部工具改 → 传回」，
没有它用户只能删了重传——**而标签、目录、整理状态会全丢**。

| | 处理 | 理由 |
|---|---|---|
| 标签 / 目录 / 状态 / 创建时间 | 保留 | 用户整理的结果，与文件内容无关 |
| 正文 / `parse_error` / 大小 / mime | 重算 | 内容变了，派生数据全跟着变 |
| 原文件名 | 用新的 | 用户多半也在改文件名（`.v2.pdf`），拦着不让改很怪 |

原件按「先写新的、再删旧的」换（新文件名可能与旧的不同，不能用同一个 key
覆盖）：任何时刻都至少有一份可读的原件。删旧 key 放在数据库写入**之后**，
最坏留一个孤儿文件而不是裂图。

### 13.10 导出与备份

- **markdown 导出**（zip）含 `原件/` 目录——对一份 PDF 来说原件才是内容，
  只导正文等于搬走了目录、留下了书
- **json 导出**含 `sourceKey` / `mime` / `size` / `parseError`，**但不含字节**：
  它是清单，不是备份。两个都导出会让人以为「json 是完整备份」——
  于是拿它当备份的人会丢文件。名字与 README 里都要说清楚
- 导出的「体积」统计**含原件**，否则一个塞满 PDF 的库会显示「约 2 MB」
- 备份范围（§8.5）加 `uploads/`，与前缀收拢的规则一致

### 13.11 上传的界面

「收集内容」对话框两个页签：**粘贴链接 / 上传文件**。两者是同一件事
（把外部的东西收进库），分成两个入口会让用户先判断「我这次算哪种」——
而那个判断对结果没有影响。

**内容是带落点的**（D-079）：`CaptureDialog` 接收 `folder`，从知识库页
唤起时收进来的东西直接归入那个知识库（抓取走 `captureInputSchema.folder`，
上传走 multipart 的 `folder` 字段）；对话框标题与页脚如实写出落点
（「收进「技术」」）。应用壳的 `openCapture(options)` 让入口**跳过一次选择**：
「添加文档」下拉知道用户要哪个页签（上传文件 / 上传文件夹 / 网页抓取 /
直接编辑），也知道落点。对话框实例按次换 `key` 重置初始页签（实例常驻
应用壳，不换 key 会带着上一次的页签）。

**「上传文件夹」保留相对结构**：`webkitRelativePath`（`论文集/2024/a.pdf`）
的每个子路径拼进 `folder`，首段保留——用户选的是「论文集」，入库就叫
「论文集」；服务端 `ensureFolders` 按 mkdir -p 补注册表行。

**整页拖放**：知识库页的拖放区是整页（目标稿写着「可直接拖到本页上传」），
覆盖层 `pointer-events: none`（出现时指针正拖着文件，拦截会让 drop 落空），
dragenter/leave 用计数器防抖。

多选但**逐个串行发请求**：一次 multipart 带多个文件的**部分失败报告会变成
一团糊**（哪个成功了？标签应用到谁？），逐文件请求天然给出逐文件的答案。

前端先挡一道大小（省掉必然失败的往返、反馈立刻），**服务端仍然校验**
——前端校验是体验，不是边界。

---

## 14. 桌面端：Electron 载体 + 进程内私有宿主

> 决策记录见 `docs/DECISIONS.md` D-046 与 **D-100（两种模式）**；调研与版本快照
> 见 `docs/RESEARCH.md` §12。
> 分层借鉴 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的
> host/carrier 拓扑（"Electron starts the private Desktop Host in Electron Node
> mode … Web owns RPC and streams; the desktop carrier connects the local page
> to the authenticated Host"），不引入其框架（Cordis 式注入已被 §7.3 否决）。

### 14.1 结构

```
┌─ Electron 载体（apps/desktop）────────────────────────────┐
│  主进程（Node 模式）                                        │
│   └─ 本地模式：私有宿主 = apps/server/dist 的 startServer() │
│       SQLite @ userData/data · 127.0.0.1 随机端口 · 免登录  │
│   └─ 云端模式：不起宿主，窗口加载用户自部署的地址            │
│  BrowserWindow → 加载宿主地址或远端地址（见 §14.6）          │
│  IPC 只承载：boot 信息、模式选择/切换、窗口控制与退出         │
│  （契约：shared 的 DesktopBootInfo / DesktopModeApi /       │
│   DesktopWindowApi）                                        │
└────────────────────────────────────────────────────────────┘
```

**页面与宿主之间不走 IPC**。窗口加载的就是宿主地址：cookie 会话、
SSE 聊天流、文件 Range、multipart 上传、zip 导出全部是同源 HTTP 的
原生行为。为它们各写一套 IPC 桥（JSON 走 invoke、流走 MessagePort、
二进制走自定义协议）等于把 HTTP 重造一遍，且绕开 TanStack AI 的
传输层——dsh 自己也保留了本地端口做页面↔宿主通道。

### 14.2 启动顺序（不可换）

1. `pickFreePort()`：OS 分配空闲端口。随机端口避免与用户自部署的
   mimir 服务冲突，也压小本机误触面
2. **先注入环境变量，再动态 import 服务端**：`env.ts` 与 better-auth 都在
   模块加载时读取（`trustedOrigins`/`baseURL`/端口），导入选早了配置就定死。
   注入项：`PORT`、`SERVER_URL`/`WEB_ORIGIN`（= 宿主源）、`DATA_DIR`、
   `DATABASE_URL=file:<dataDir>/mimir.db`、`WEB_DIST`、`AUTH_SECRET`
3. `startServer({ hostname: '127.0.0.1' })`——只绑回环地址
4. 轮询 `/healthz` 就绪后开窗（超时明确报错，不静默等待）

其中 `AUTH_SECRET` 由宿主**持久化**在数据目录（`auth-secret`，0600）：
会话 cookie 用它签名，每次启动随机的话「重启就要重新登录」。
生产形态下 `env.ts` 会拒绝默认密钥，桌面宿主用这一步替代部署方配置。

### 14.3 通信契约与传输注入

前端的 `api.ts` 是**唯一的服务端访问口**，传输配置可注入
（`configureApiTransport({ baseUrl?, headers?, fetchImpl? })`）：
浏览器与桌面壳的默认形态完全相同（同源相对路径 + cookie），
这个接缝是给将来的 CLI、浏览器扩展与跨源认证宿主用的
（TECH §1 选型 Hono 的理由原文就是「浏览器扩展、脚本、CLI 都要调
同一套 HTTP 接口」）。宿主↔载体的握手契约是 `@mimir/shared` 的
`DesktopBootInfo`（origin、数据目录、版本），preload 只读暴露。

### 14.4 开发与打包

| 命令 | 做什么 |
|---|---|
| `pnpm desktop:dev` | web vite（5173）+ server dev + Electron 加载 5173（`MIMIR_DESKTOP_URL` 模式：壳不进程内起宿主，宿主走 dev 进程） |
| `pnpm desktop:start` | 构建 web/server/desktop 产物后，Electron 进程内起宿主（与打包一致的形态，连同一份 userData 数据） |
| `pnpm desktop:build` | 上述构建 + `pnpm deploy --prod` 收集 server 生产依赖 + electron-builder 打 dmg |

打包要点（坑都在这里踩过）：

- **桌面主进程必须用 Node 目标构建**（`build.ssr: true`，与服务端同一形态）：
  普通构建会把 `process.env` 静态替换成 `{}`，宿主的环境注入**静默全部失效**，
  症状是宿主回落到 `.env` 的端口与数据目录
- **宿主资源不用 extraResources**：electron-builder 拷贝时会跳过点开头的
  目录，`server/dist/node_modules/.pnpm`（vite SSR 构建把部分传递依赖按
  pnpm 结构放这里）会被静默丢掉，运行时报模块找不到。afterPack 钩子用
  `fs.cp`（保留符号链接的 pnpm 布局）自行拷贝
- **必须 ad-hoc 签名**：identity: null 时 builder 完全跳过签名，macOS
  （Sequoia 起，含 Intel）把未签名二进制直接 SIGKILL——秒退、零输出。
  afterPack 里 `codesign --force --deep -s -`。正式分发需要开发者证书 + 公证
- better-sqlite3 v13 自带 N-API 预编译（prebuilds/ 跨 Node/Electron 通用），
  无需 electron-rebuild；`@node-rs/jieba` 是 N-API，同理
- 桌面包**不设 `dev` 脚本**：`pnpm dev` 是 `-r --parallel dev`，
  叫 `dev` 会被卷进去
- 数据目录与浏览器部署的 `data/` 完全独立（userData 下），
  「安装版删掉重装 = 数据还在」由 userData 承担

### 14.5 安全

- 宿主只绑 `127.0.0.1` + 随机端口；鉴权仍是 better-auth 的
  `SameSite=Lax` cookie——外部网站对宿主的跨站 POST 拿不到 cookie，
  DNS rebinding 后的请求同样过不了 `requireAuth`
- **本地模式（D-100）：随机端口不算安全边界。** 任何本机进程、以及恶意网页
  都能扫到那个端口；无鉴权 + 无 preflight 的跨站写请求等于把 CSRF 保护拆掉。
  所以本地模式的入口是一把**宿主每次启动随机生成的令牌**（`mimir-local`
  cookie，httpOnly + SameSite=Lax），由 `requireAuth` 与真实会话并列校验。
  宿主在本地模式下**结构性强制**绑定回环（`startServer` 里判断，非回环直接抛错）
- Electron 侧 `contextIsolation: true` + `sandbox: true`，preload 只暴露
  只读的 boot 信息、模式选择与窗口控制（最小边界）
- **云端模式下的远端页面没有「任意改模式」的能力**：模式 IPC 对不受信任的发送方
  一定会先弹原生确认框（`isTrustedSender` / `confirmUntrustedSwitch`）。
  否则一台被攻破的服务器可以让客户端起本地宿主再导航过去，把本机知识库读走
- 单实例锁：两个窗口同时写一个 SQLite 会撞锁

### 14.6 两种模式：本地离线与云端（D-100）

```
第一次启动 ──→ ui/setup.html（静态选择页，不依赖任何宿主）
                 ├─ 本地使用 ──→ 起私有宿主（本地模式）→ 数据在本机、免登录
                 └─ 连接服务器 → 归一化地址 + 探 /healthz → 窗口加载远端

之后启动 ──→ <userData>/desktop-config.json 决定（{mode:'local'} 或
             {mode:'cloud', cloudUrl}）
切换 ──→ 设置 › 客户端 ›「更换使用方式」→ 回到那一页（它读得到当前模式，
         所以显示的是「切换」而不是「首次选择」，并能「返回，不改」）
云端连不上 ──→ did-fail-load 弹「重试 / 更换使用方式 / 退出」
```

选择存在**载体**里而不是服务端设置表：它是部署事实（§7.5），而且切换必须
能在服务端不可达时完成——设置键恰恰在那时读不到。写入是「临时文件 + rename」：
半截 JSON 的表现是「下次启动又回到选择页」，用户的选择静默丢失。

选择页是**自包含静态文件**（无外部资源、无框架、自带拖动区与窗口控制）：
它要在「宿主没起来」「地址还没填」的时刻可靠显示，也是云端用户唯一会看到的
本地页面。打包时靠 `electron-builder.yml` 的 `files: ui/**` 进 asar。

**本地模式的鉴权**（免登录但不免鉴权）：

| 层 | 做法 |
|---|---|
| 令牌 | 宿主每次启动 `randomBytes(24)`，注入 `MIMIR_LOCAL_TOKEN`；不持久化 |
| 传递 | main 进程写进 Electron cookie jar（httpOnly + SameSite=Lax）。不进 URL、不进日志、不从 preload 暴露 |
| 校验 | `requireAuth` **先试真实会话，再验令牌**（`middleware/auth.ts`）。比对走 `timingSafeEqual` |
| 本机用户 | `local@mimir.local`，走 better-auth 自己的 `signUpEmail` 创建（密码随机不公开）——所有权字段、外键、建号钩子里的默认内容播种都需要一个真实 user 行；直接插表要复刻密码哈希（D-020 记过这条坑） |
| 会话读取 | `GET /api/auth/get-session` 在带令牌时返回合成会话（注册在 `auth.handler` 通配之前——与 `setup/state` 同一条 Hono 顺序坑），前端守卫、侧栏头像零改动 |
| 资料 | `PATCH /api/local/profile` 只改名称（本地模式才有；其他部署 404）。改完**清缓存**——`ensureLocalOwner` 缓存了用户行 |
| 纪律 | `MIMIR_LOCAL_MODE=1` 但没令牌 → 启动即报错。**绝不能降级成「有开关就放行」** |

界面按 `RuntimeConfig.localMode` 分支（服务端回传，界面不猜）：
账号分区隐藏邮箱与登出、左导航菜单去掉登出、登录页改成「回客户端使用」。
本地模式下名称走 `/api/local/profile`，云端仍走 Better Auth 的 `update-user`。

**云端地址的处理**（`apps/desktop/src/cloud.ts`）：

- **归一化**：去首尾空白、缺协议时补（本机与内网段补 http，公网域名补 https
  ——与 Jellyfin / Home Assistant 客户端同一条分法）、去末尾斜杠与查询串、
  保留路径前缀（反代挂子路径的部署）
- **探活**：`GET <url>/healthz` 且必须回 `{ok:true}`。只看「有没有响应」不够：
  同机上别的服务、或反代配错的域名也会回 200，用户会得到「地址是对的、
  进去却是别人的页面」
- 探活与归一化**都在写配置之前**：写一个连不上的地址等于把用户锁在门外

**切换的边界**：

- **宿主一旦启动就常驻**，切到云端不销毁：服务端模块不可重入（模块级的 db 连接、
  插件装配、设置缓存），重启宿主不是已支持的路径。代价只是一个回环端口
- **切换不迁移数据**：本地与云端是两套独立的存储，界面明确说「不会删除本地数据」
- 开发形态（`MIMIR_DESKTOP_URL`）下模式 API 返回 null / 明确拒绝——
  开发时点到的切换不该改真实配置

---

## 15. Office 文档的浏览器内编辑（`packages/office`）

> 决策与选型依据见 `docs/DECISIONS.md` D-049、调研见 `docs/RESEARCH.md` §13。
> 包内约定见 `packages/office/AGENTS.md`。

### 15.1 它解决什么

§13 定下的边界原本是「PDF 能看原件但正文搜不到；Office 三件套能搜但看不见」——
M1-E 补上了 PDF 的文字层提取（复用预览那份 pdf.js），六种格式现在**都能搜**；
边界变成「Office 三件套与 PDF 都既可看又可搜，只有旧版二进制格式（.doc/.xls/.ppt）
与纯图片还搜不到」。
这一节补上后半：**docx 可以在网页里直接读、直接改、直接存回原件**，
且改完之后服务端重算正文与哈希（§13.9），所以编辑的结果立刻可检索。

### 15.2 为什么是「vendored GenOffice」而不是依赖或自建

`RESEARCH.md` §13 把候选逐个排除了：

| 方案 | 否决点 |
|---|---|
| ONLYOFFICE Document Server | 1.9 GB 镜像 + **4 GB RAM** 的独立服务；它的核心价值（多人同时编辑）对单用户是零 |
| Collabora CODE | 开发版官方明说**不适合生产**，生产版收费 |
| CryptPad 路线（客户端 ONLYOFFICE + x2t WASM） | ~580 MB 静态资源、`x2t.wasm` 堆内存下限 283 MB、AGPL §7 附加条款要求界面署名 |
| 纯前端库（docx-preview / mammoth / SheetJS） | **只能预览，不能编辑**——市场把「画得出来」和「文件读写得回来」分成了两笔生意（Univer 的 import/export 是付费项） |
| 自建 OOXML 编辑器 | 那正是 PRD §1 原非目标所说的「自建一个兼容 Word 的编辑器」 |

GenOffice 是唯一同时满足**真编辑 + 无独立服务 + 许可宽松（Apache-2.0）**的。
它的做法是**补丁式保存**：只把改动的块拼回 `document.xml`，其余 zip 条目
逐字节原样复制。实测（`packages/office/src/docx.test.ts`）：

| 场景 | 结果 |
|---|---|
| 原样保存 | zip **每个条目逐字节相同**，文件长度不变 |
| 改一段文字 | **只有 `word/document.xml` 变化**（2724 → 2739 字节，正好是新增 5 个汉字的 UTF-8 长度） |

这条性质是能安全编辑别人的 docx 的前提——Word 的 XML 里有大量本项目没建模
的东西（域代码、修订标记、OLE 对象、自定义样式），整体重建会静默丢掉它们。

### 15.3 集成形态：vendor 目录 + 薄适配层

它是**应用**不是库（所有包 `private: true`、不发 npm、无嵌入 API），
所以做法是「按闭包抽取 + 保持原目录形状 + 可重复同步」：

```
packages/office/
├── vendor/            vendored 的上游代码（134 个文件 + 字体），**不改**
├── src/
│   ├── docx.ts        适配层：openDocx → 编辑 → save
│   ├── shims/i18n.ts  上游 i18n 的等价替代
│   └── generated/     样式裁剪产物（不进 git）
└── scripts/
    ├── sync-upstream.mjs   同步（闭包计算 + 改写 + 自检 + 裁剪）
    └── trim-editor-css.mjs 从 264 KB 办公壳样式里裁出编辑器需要的 38 KB
```

**为什么不 fork 全仓**：上游仓库 972 MB、`apps/docs` 的渲染层有 238 个文件
105K 行，其中大部分是 mimir 不需要的 ribbon / AI 面板 / Zotero / 多标签。
闭包算下来是 **134 个文件**（编辑器 40 + docx 引擎 35 + 排版度量若干 + 13 MB 字体）。

**为什么这样更好维护**：`entries` 是人工选的入口，`files` 由脚本从 import 图
算出——上游新增依赖会自动进来，新功能要改 `entries`。同步幂等（连续跑两次
第二次零差异），且带**闭包自检**（见包内 AGENTS 记的两次静默漏文件）。

### 15.4 界面接入

`viewerFor()`（`@mimir/shared`）对三种 Office 格式分别给 `office` / `sheet` /
`deck` 三个类型，`FilePreview` 命中它们时渲染 **`OfficeSourceEditor`**
（`apps/web/src/components/document/`）——它是一层**宿主适配层**，只做两件事：

1. 把网络调用包成 `EditorIo`（`load` 取字节 / `save` 写回）——包里不认识
   cookie，也不知道端点长什么样
2. 把主题变量（`--me-*`）铺在编辑器祖先上

其余全部（布局、工具条、状态行、分页、保存状态）在 `packages/office` 里。
保存走**已有的** `PUT /api/documents/:id/file`（§13.9 的替换原件端点）——
不需要新端点，那正是它的用途。

**为什么分派用 `viewerFor` 而不是各自判 MIME**：它已经是「这个格式用哪个
查看器」的唯一真相。两处各判一次必然有一天不一致，而那种不一致是静默的
（看得到文件、但打开的是错的查看器）。

### 15.4.1 统一外壳：六种编辑器共用一套壳

**界面在包里**（`packages/office/src/shell/` 与 `src/editors/`），这是 D-054
的决定。理由：**「一样」只能由同一份实现保证**。改之前四种格式四套壳
（docx 一个 antd `Space`、xlsx 表格上方一个编辑行、pptx 右侧 300px 面板、
markdown 干脆没有工具条），三种保存状态说法——那是用户看到的「不伦不类」。

```
src/shell/
  EditorShell.tsx   五个槽位：toolbar / subbar / children / footer / status
                    加一层只传 componentSize="small" 的 ConfigProvider（D-064）
                    与一组工具条原语。其中 ToolbarButton / Select / NumberField /
                    TextField / **TextArea**（多行，pptx 的段落编辑框：单行 `Input`
                    会在值消毒时把软换行的 `\n` 静默删掉）/ **TextButton**（状态行
                    里有动作的一句话：重试 / 关掉这条提示。`variant="link"` 被
                    `.me-text-btn` 压成下划线文字）/ ToggleGroup /
                    FileButton / Divider 由 antd 渲染；Menu / ColorPicker /
                    GridPicker / Tabs 仍是自己的实现（弹层必须就地 `fixed`）
  shell.css         外壳样式：布局、弹层，以及非 antd 的元素（主题值走 --me-*）
  icons.tsx         工具条图标（自绘 SVG，不依赖图标库）
  editor-commands.ts 方言能力检测与调用
  antd-test-dom.ts  驱动 antd 下拉的测试辅助（以 @mimir/office/test-dom 导出）
src/editors/
  DocxEditor.tsx      xlsx / pptx 同构
  PptxEditor.tsx      幻灯片：SVG 画布（**可点而不经原语的白名单，只此与 xlsx
                      的 `<td>` 网格两处**，见 D-064 的「各格式的适配」）
  MarkdownEditor.tsx  笔记：工具条 30+ 个控件（D-061）
  markdown-format.ts  markdown 方言的判据与操作（整张列表的范围、段落样式的
                      当前值、列对齐、工具条状态串）。**导出**给宿主测——
                      方言在宿主那边，只有它能验证这些行为
  InlineToolbar.tsx   选区工具条（跟着编辑器实例走，所以在包里）
  use-source.ts       取字节 → 解析 → 写回，以及「解析结果绑在哪一份字节上」
  types.ts            EditorIo（宿主提供取与存）
```

**边界划在「壳」与「内容」之间**：包负责壳，宿主负责**方言与幂等**
（markdown 的 Tiptap 扩展集合、正文排版类）。所以 `MarkdownEditor` 也在包里
——它的正文格式（`createExtensions`）是 mimir 的产品决定，壳是通用的。

**主题桥**（`apps/web/src/theme/editor-theme-bridge.ts`）：宿主把 antd token
填进 `--me-*`。每个属性都有中性回退值，所以包能脱离宿主渲染（静态预览仍靠它）。

**桥不退役，但「包不依赖 antd」已由 D-064 推翻**：工具条的控件换成 antd 组件，
这个包从此依赖 antd。两件事互不替代——

- antd 实例与主题由宿主的 `MimirProvider` 提供（`ThemeProvider` + 只放 locale
  的 `ConfigProvider` + cssVar key）。包只允许一层 `ConfigProvider`，**只传
  `componentSize="small"`、不传 `theme`**，位置在 `EditorShell` 内部、包住
  `.mimir-editor` 整棵子树。传 `theme` 会重算 cssVar 的 key、`--ant-*` 变量名
  跟着变，引用处静默失效（§5 那条「内层 `ConfigProvider` 传 `theme`」）
- `--me-*` 仍然是外壳**自己的**颜色与间距的真相来源（底色、分隔线、正文字号、
  工具条的 gap 都由 `shell.css` 管），换掉的只是「控件本身也得手写」

**哪一层管什么**（D-064 重新划的边界，改工具条样式前先读这一张）：

| 归 antd（`--ant-*`） | 归 `shell.css`（`--me-*`） |
|---|---|
| 控件的高度、内边距、圆角、边框、hover、焦点环、禁用态、控件字号 | 外壳布局（`.mimir-editor` 的四条约束、`flex-wrap`、状态行） |
| 按钮的实心 / 文本两档外观、下拉的弹层、分段控件的选中外观、水波纹 | 弹层（`.me-menu*` / `.me-color*`，就地 `fixed`，**不 portal**）与非 antd 元素（色块、页签、状态块、说明段落） |
| 数字框的上下抓手（我们 `controls={false}` 关掉了） | 按钮的**按下态**（`.me-tb[aria-pressed='true']`——antd 不认这个属性）与两个未迁移触发器的 `.me-btn` |

**三条 antd 才有的坑**（都实测过，改这几个原语时先看一眼）：

1. **`type="primary"` 不能与 `variant` / `color` 混着传**：antd 的分支是「先看
   color && variant，都给了就直接用」，于是
   `<Button type="primary" variant="text" color="default">` 会同时带
   `ant-btn-primary` 与 text/default 的两个类——渲染出来是**透明的「保存」**，
   而它不报任何警告。所以「保存」的断言要同时盯 `ant-btn-color-primary` 与
   `ant-btn-variant-solid`（`EditorShell.test.tsx` 守这条）
2. **antd 不认 `aria-pressed` / `aria-expanded` 的着色语义**：`Button` 只在
   hover/active 上着色，「当前这一段是加粗的」必须自己用属性选择器画
3. **`Divider` 的 `type="vertical"` 在 v6 已废弃**（打 `console.error`），
   要用 `orientation="vertical"`

### 15.4.2 界面层踩过的五个坑（都会静默坏）

| 症状 | 原因 |
|---|---|
| 标题渲染成 38px 或 28px | 两个坑叠在一起：① antd 的 `Typography.Title` 自带 `h1:where(...).ant-typography`（特异性 (0,1,1)），单类选择器盖不住 → 38px；② 抬了特异性后**纯 `<h1>` 又匹配不上**那条规则，字号回落到浏览器默认 2em = 28px。修法是两个分支都用 `Typography.Title`：一个元素类型 = 一条样式路径 |
| 工具条/状态行不粘 | `.mimir-editor` 用了 `overflow: hidden`——它会让这个元素成为滚动容器，里面的 `sticky` 相对**它**定位，而它与内容同高，等于不粘。要用 `overflow: clip`（只裁剪、不建滚动容器） |
| 工具条背景透出正文 | antd 的 `colorFillQuaternary` 是**半透明**的（`rgba(255,255,255,0.04)`），直接用会让内容从下面透出来。要两层合成：`--me-surface` 打底 + `--me-bar-bg` 叠上去 |
| 编辑器只有内容高，下面一大片空白 | 高度链缺了任何一环。整条链是 `scroll(min-height:0)` → `cols(min-height:100%)` → `innerWide(align-self:stretch)` → 主题变量层(`flex:1;min-height:0`) → `.mimir-editor(flex:1)`。实测断过两次：`cols` 的 `align-items: flex-start`（子项不被拉伸）、主题变量那一层是默认 `block` |
| 工具条比头部窄 | 「正文限宽 760px」实现在**外层容器**上，把外壳一起收窄了（实测工具条 680px，而头部的下边框横跨 1240px）。限宽要由外壳**内部**负责（`.mimir-markdown-body` 的 max-width + 居中） |

**一条测试环境的坑**：`packages/office` 的 vitest 默认环境是 **node**，不是
happy-dom。happy-dom 会替换全局 `URL`，于是解析类测试里的
`readFileSync(new URL(..., import.meta.url))` 抛 `The URL must be of scheme file`
——那 48 个测试与 DOM 毫无关系却整片挂掉（实测踩过）。要 DOM 的测试在自己的
文件顶部写 `@vitest-environment happy-dom`。

### 15.4.3 docx 的工具条：能力清单与四项如实不做

工具条在 `packages/office/src/editors/DocxEditor.tsx`（`DocxToolbar`），分成八组。
**每一个控件都先证明命令存在**（`editor-commands.ts` 的 `hasMark` / `hasNode` /
`runCommand`），可用性来自 `readSnapshot` 的一次订阅——所以按钮的亮灭跟着光标走。

| 组 | 内容 |
|---|---|
| 历史记录 | 撤销 / 重做（`disabled` 来自 `undoDepth`/`redoDepth`，不是渲染期另算的） |
| 段落样式 | 正文 / 标题 N（**只列文档里真的存在的级别**）/ 引用 |
| 字体 | 中文字体、西文字体**两个独立下拉**（`w:eastAsia` 与 `w:ascii` 是两个槽位） |
| 字号 | 21 档下拉（**半磅**存储、**磅**显示）+ 增大 / 减小 |
| 字符格式 | 加粗 / 倾斜 / 下划线 / 删除线 / 上标 / 下标 / 字体颜色 / 突出显示 / 清除格式 / 格式刷 |
| 段落 | 四种对齐 / 行距倍数 / 段落底纹 / 文字方向 / 间距与缩进 / 固定行距 |
| 列表与缩进 | 项目符号 / 编号 / 减少 / 增加 |
| 表格与插入 | 表格菜单（只在光标进表格时出现）/ 尺寸网格插表 / 插图 / 链接 / 分页符 / 上移下移 / 查找 / 修订 / 拼写检查 |

**四类做法与原因**（完整取舍见 D-062）：

1. **「引用」是直接段落格式，不是样式。** 按 `styleId` 的 CSS 来自
   `doc-style-css.ts`，**那个文件没 vendored**（跟着上游的 App 壳）。写
   `styleId: 'Quote'` 只改 XML、画布不动。所以「引用」= 左缩进 + 左侧边线，
   三项都在 schema 里、画布会画、保存会写、清除格式清得掉
2. **标题级别只列存在的**（`DocxSession.headingLevels`）。文档没有 `Heading3` 时
   选它会生成没有 `w:pStyle` 的段落——画布像标题、Word 里是正文
3. **查找高亮走装饰器**（`docx-find.ts` → `searchPluginKey`），不是往文档里插标记：
   查找因此不会把文档改脏、不进撤销栈、不影响补丁式保存的逐块比对。匹配按
   **文本块拼平文本**做——逐个文本节点比对会漏掉跨标记的匹配（`in**for**mation`）
4. **`.search-hit` 的样式在 `src/editors/editors.css`**，不在
   `src/generated/editor.css`（后者的保留前缀里没有 `search-hit`，同步会覆盖；
   而上游那份规则读的 `--docs-paper-hit-bg` 本来就来自未 vendored 的壳）

**仍然没做**（如实留下，不是漏掉）：

| 动作 | 为什么 |
|---|---|
| 字符间距 / 缩放 / 全部大写 / 小型大写 / 字符边框 / 文本效果 / 发光 / 带圈 | 这些在 schema 里是 `rendered: false` 的**透传**属性：改了模板里的值，保存时 `mergeRPrModel` 用 `rawRPr` 的原字节覆盖回去。**能显示、写不进去**——只有重新打开一份带这些格式的文档才看得到 |
| 段落边框（四边） | `borders` 的取值是 `"tblr"` 的子集，画布与保存都认，但线型有 20 多种而面板里只放得下「有/无」——那会误导。目前只有「引用」用到它（`l`） |
| 表格边框的线型与颜色 | 同上：只给了「全部 / 无 / 下框线」三个预设 |
| 复杂文种字体（`csFont`） | `w:rFonts` 的第三个槽位，要按 `w:rtl` 判断该不该写。中文知识库里命中率极低，做一半反而会把文档改乱 |
| 表格样式（`tblStyleId`）/ 六边（`tblLook`） | 前者只渲染成 `data-tbl-style`（没有 CSS 规则命中它，同一个缺失的 `docStyleCss`），后者连渲染都没有。改了只动 XML |

**三条会静默出错的收尾**（标题是当时写的，**现在这组已是 6 条**——下面列的
六项都各有注释与测试守着）：

- 改行距倍数时**同时清掉 `lineRule`/`lineRawTwips`**——`lineRule='exact'` 在画布与
  保存两侧都优先于倍数，不清的话选了「1.5 倍」屏幕和文件都不变
- 清除格式的段落那一半要**逐类写** docParagraph / docHeading / docListItem
  三遍：`updateAttributes` 只认它拿到的类型名，找不到就 `return false`
- **格式刷逐类 `removeMark(from, to, type)`**，绝不写不传 markType 的那一次：
  它会把区间上所有标记（链接、批注、修订、域代码）一起清掉
- **表格列宽两头各换算一次**：单元格的 `colwidth` 属性存 **px**（解析
  `convert.ts:930` 写入、保存 `convert.ts:1236` 自己 ×15 换回 twips），而输入框
  说的是 **twips**（显示再 ÷20 变磅）。读要过 `pxToTwips`、写要过 `twipsToPx`
  （`DocxEditor.tsx` 的 `columnWidthsTwips` / `setColumnWidth`），漏掉任何一次
  不报错——症状是「每次编辑把列宽放大 15 倍」（实测：234 磅的列存成
  `<w:gridCol w:w="70200"/>`，重开控件显示 15.4 磅）。往返测试守着
  （`docx-save.test.ts`）
- **换段落样式必须显式 `styleId: null`**：Tiptap 的 `setNode` 会把段落上没点名
  的属性原样带过去（实现里的 `attributesToCopy`），不清的话画布换了级别、文件
  里的 `w:pStyle` 还是旧样式（`generate.ts:1742` 优先写 `block.styleId`），重开
  又变回去（实测：Heading1 选「标题 2」，存出来仍是 `w:val="Heading1"`）
- **格式刷取源取「选区区间里第一个文本节点」的 marks**，不是
  `$from.marks()`：后者在位置正好压在两个节点的边界上时返回**前一个节点**的
  marks——源选区起点正好是格式区间起点（加粗字前有个没加粗的字）时它是**空**
  的，刷子以空格式举起，点目标反而把目标的格式抹掉

`pageBreakBefore` **不在**清除格式的名单里：正文里的分页符就是它（`page-break.ts`
在段首只打属性、不插字符），清掉等于删掉用户插的分页符。

**测试**（都在 `packages/office/src/editors/`）：`docx-toolbar.test.ts`（18 条，
模型层）、`docx-toolbar-render.test.tsx`（15 条，挂真组件树点真按钮，含「每个按钮
都看得见内容」「无障碍名称不重复」两条渲染契约、格式刷取源、以及保存按钮的
禁用原因）、`docx-find.test.ts`
（12 条）、`docx-save.test.ts`（22 条，**保存保真**：每个新命令都断言只改
`word/document.xml` 且真的写进 XML；列宽一条是**往返**——写入、保存、重开读回
三处一致）。

**在真浏览器里核对过**（无头 Chrome，真 DOM + 真 CSS）：七个宽度下工具条换行而
不溢出（`scrollWidth === clientWidth`）、39 个图标都有非零尺寸、点「引用」与
「段落底纹」之后画布上的计算样式是预期值。这一轮抓出两条单测抓不到的：
`ToolbarToggleGroup` 没图标时渲染成空方块（DOM 断言全过），以及分组名与控件名
重复（读屏念两遍）——两者现在都有断言守着，见 D-062。

### 15.5 现在的边界

| 缺什么 | 后果 |
|---|---|
| 页内分栏 | 多栏文档按单栏排（容量算错，页数偏多） |
| 工具栏里仍然空着的几项 | 字符间距 / 大小写 / 字符边框与效果（`rawRPr` 透传那批，写了存不下去）、表格边框的线型与颜色（只给了三个预设）、复杂文种字体（`csFont`）。其余已补齐，见 §15.4.3 |
| 列表的编号分配 | 新列表沿用文档里已有的 `numId`；新建编号定义要写 `numbering.xml`，未做 |
| worker 解析 | `parseDocx` 同步重活，大文档会卡主线程（上游有现成 worker 可接） |
| 保存冲突 | `PUT` 不校验 `If-Match`；单客户端可接受 |
| ~~xlsx / pptx 的编辑~~ | **都已做**：xlsx 改单元格（§15.7）、pptx 改文字与整段字形（§15.9） |
| pptx 的元素位置 | 改框（拖动/改尺寸）未做——上游那条路走 `pptx-ops` 的 ops 层 + `setElementTransform`（§15.9） |
| pptx 的段落格式 | 项目符号、行距、对齐一律**沿用原件**，界面不给改（改了要写 `pPr`，那是另一条补丁路径） |
| pptx 的字体度量 | 用启发式（按字符类别估宽度），**换行位置**可能与原件略有差别；要精确得接 opentype.js + vendored 字体（§15.8） |

**docx 侧缺项的排序就是产品化的排序**：分页（观感）→ 工具栏（可用）→ worker（大文档）。
工具栏已经补齐（§15.4.3），所以剩下的两条是分栏与 worker。

### 15.6 分页视图

编辑器把连续流渲染成**纸张**（`packages/office/src/pagination.ts`）。

**机制：装饰器，不是多容器。** 页面不是靠多个滚动容器模拟的，而是在分页点
插入「页间隙」元素（ProseMirror widget decoration）：

```
measureBlocks（量每个块的几何）
  → computeSectionedSlices（按可用高度切页）
    → 每个分页点生成一个页间隙（setPageGaps 注入装饰器）
```

页间隙的高度 = 上一页没用完的空间 + 下一页的上边距，中间画一条灰带
（`--canvas` 底色）——于是连续流看起来就是一页一页的纸。

**关键性质：它不改文档内容。** 装饰器不落库、不进历史、不被导出。实测：
在分页视图里改一段并保存，服务端收到的正文里**没有 `page-gap` 残留**。

**已实现的五类页面行为**（全部实测过）：

| 行为 | 做什么 | 验证 |
|---|---|---|
| 块级分页 | 放不下的块推到下一页 | 3 页中文文档，灰带可见 |
| **块内断行** | 长段落在**行边界**切开（不整块下移） | 5578 字文档：2594px 的段落切成 2 页，两个分页点都是行内间隙 |
| **拆表 + 重复表头** | 表格按行切、`w:tblHeader` 行在续页顶部重复 | 46 行表格跨页后第二页顶部出现表头克隆行 |
| **页眉页脚** | 每个分页点画上一页页脚（含页码）与下一页页眉 | 3 页文档 4 条条带，页脚「第1页」「第2页」正确 |
| **脚注** | 脚注正文落到引用所在页的页底，并从正文里预留高度 | 20 条脚注与 20 个上标引用一一对应，`overlapPx: -16`（不重叠） |

**仍未做**：页内分栏（多栏容量的按栏计算）。

**四个实测踩过的坑**（写进代码注释了，都是静默失效类）：

| 症状 | 原因 |
|---|---|
| 页数对但没有页间隙 | `origin` 用了滚动容器的 `rect.top`——容器一滚动内容就偏移一个 scrollTop，块坐标出现负值、总高度算小 |
| 51 个块被量成 1 个 | `pmRef` 指向了包住编辑器的容器而不是 `.ProseMirror` 本身 |
| 分页永久不触发且不报错 | 用了 `requestAnimationFrame`——**后台标签页不派发帧**，回调永不执行而 id 已占用，后续调度全被挡 |
| 分页正常但灰带透明 | `--canvas` / `--docs-paper` 由上游 App 壳在运行时注入，我们没 vendored 那个壳；用 mimir 的主题 token 补上 |

最后两条尤其值得记：它们的**现象都不是「分页坏了」**，而是「分页没发生」或
「看着像没分页」，排查时只能靠诊断出口（`window.__mimirPagination` /
`window.__mimirPagError`，专门为此留在代码里）。

### 15.7 能力边界与未做项（2026-09 审计）

**GenOffice 支持六种格式**（它的 README：Docs / Sheets / Slides / PDF /
Markdown / HTML），mimir 现在六种都有：

| 格式 | 预览 | 编辑 | 保存方式 | 说明 |
|---|---|---|---|---|
| **docx** | ✓ **完整分页视图**（块内断行、拆表、页眉脚、脚注） | ✓ 全文编辑（`src/docx.ts`） | **补丁式**（逐块） | |
| **xlsx** | ✓ **网格**（`src/xlsx.ts`），多表页签、合并单元格、行号栏 | ✓ **改单元格文字**（`src/xlsx-edit.ts`） | **补丁式**（按 sheet XML） | 见下 |
| **pptx** | ✓ **幻灯片**（渲成 SVG），页签翻页、版式继承、图片、图表；隐藏页有只读标记 | ✓ **改文字 + 整段字形**（加粗/倾斜/下划线/删除线/上下标/字号/字体/颜色，`src/pptx-save.ts`）；查找替换跨全篇 | **补丁式**（按元素锚点） | §15.8、§15.9 |
| **html** | ✓ **源码 + 预览双栏**（`src/editors/HtmlEditor.tsx`） | ✓ **改源码**（CodeMirror） | 整体重写（保留 BOM/换行风格） | §15.9 |
| **markdown** | ✓ 编辑器即预览（`src/editors/MarkdownEditor.tsx`） | ✓ 全文编辑 | 写回正文列（vault 文件同步） | 上传 `.md` **即导入为笔记** |
| **pdf** | ✓ **逐页渲染**（pdf.js → canvas，`src/editors/pdf-render.ts`） | △ **页面级**：旋转、删除、调序（pdf-lib） | **整体重写** | §15.10；**正文提取已落地**（M1-E，服务端复用同一份 pdfjs-dist，见 §11 第 8 条）——六种格式现在都能搜 |

**「补丁式」与「整体重写」的区别不只是技术细节，它决定能不能放心保存**：

| | 补丁式（docx / xlsx / pptx） | 整体重写（html / markdown / pdf） |
|---|---|---|
| 未改动的字节 | **逐字节原样写回** | 由库重新序列化 |
| 我们没建模的东西（域代码、修订标记、OLE、条件格式…） | 保住 | **可能丢** |
| 为什么可以接受 | — | html 是**纯文本**（整体重写就是写字符串，无损）；markdown 走笔记路径（正文列，本来就是我们的格式）；PDF 的页面级操作是 pdf-lib 的强项（页树、字体、图像流都被正确搬运），而它丢掉的是**增量更新的对象**与线性化提示——那些不改内容语义 |

**PDF 为什么只做页面级**（这一条要如实理解，不是偷懒）：PDF 与另外五种有
根本区别——它**不是结构化文档，而是一叠页面指令**。改一个字要拆内容流、
重排那一段（上游用 PDFium 的 WASM 做成文本替换，7062 行，且写在 Electron
的主进程里：`node:fs` / `node:path` / `node:os`）。搬进浏览器要重写跨进程
那一段，还要加 7MB 的 PDFium WASM——那是另一件工程。页面级操作（旋转、删除、
重排）是**纯结构改动**，用 pdf-lib（MIT、纯 JS）就做对，且结果在任何阅读器里
都对。那条边界写在编辑器底部的说明里，不假装能改文字。

**xlsx 是怎么做出来的（以及为什么不需要 Rust 侧车）**：上游的 xlsx 路线
服务于**可编辑的电子表格**——13.7K 行 Rust 侧车（会话式读表 + 公式重算）+
Univer（import/export 是付费项）。mimir 只要「把表画出来、改几个格子」，而
这只用到「解 zip、读 `sheetData`、按 `r="C3"` 定位、把改动写回同一张
sheet 的 XML」这一层。所以自己写了约 300 行解析 + 约 250 行编辑
（JSZip + 正则），零新增依赖、零原生模块。

**编辑走补丁（与 pptx 同一条承诺）**：改一个格子只重写**那一张 sheet 的
XML**，zip 里其余条目逐字节原样写回。Excel 的 XML 里有大量我们没建模的
东西（条件格式、数据验证、图表、透视表、切片器），整体重建会静默丢掉它们。

**三条 xlsx 特有的规矩**（`src/xlsx-edit.ts` 的文件头详述）：

| 规矩 | 为什么 |
|---|---|
| **绝不改 `sharedStrings.xml`**，新文本写成内联字符串 | 共享字符串是**共享**的：`<c t="s"><v>17</v></c>` 里的 17 指向表里第 17 项，而多个格子会指向同一项。改那一项会让所有引用它的格子一起变——用户改 A1，D7 也变了，没有任何提示 |
| **公式格被覆盖时连 `<f>` 一起清掉** | 只换 `<v>` 而留着 `<f>` 的话，Excel 打开会按公式重算，用户输入的值被悄悄丢掉 |
| **覆盖（含清空）会丢掉该格的 `s=` 样式引用** | 新写的是 `t="inlineStr"` 的格，不带 `s`，而颜色、边框、数字格式都在 `s` 指向的 `styles.xml` 里。实测：清空 `A2`（原本 `s="7"`）写出 `<c r="A2" t="inlineStr"><is><t></t></is></c>`，同一行别的格的 `s="9"` 原样还在。这是能力边界（这一版没有「只改字、保住格式」那条路），所以状态行与「清空」按钮的 tooltip 都如实写着——**不静默丢掉用户看不出来的东西** |

**只读预览如实标注三件事**（`docs/PRD.md` §5.12 的「不猜」规矩）：

| 不做什么 | 为什么 | 界面上怎么交代 |
|---|---|---|
| 日期不还原 | xlsx 里日期是序列号 + `numFmtId` 样式；猜错会把普通数字显示成日期 | 底部说明 |
| 公式不重算 | 没有公式引擎；显示 Excel 存好的缓存值 | 该格 `title` 标注，数字右对齐 |
| 条件格式/图表/数据透视不画 | 画不出来 | 底部说明 |

**五个实测踩过的坑**（前四个在 `packages/office/src/xlsx.ts` 的注释里，
第五个在 `xlsx-edit.ts` 里，全是静默类）：

| 症状 | 原因 |
|---|---|
| 整行向左错位 | 空单元格的 `<c>` 被 Excel 整个跳过，按出现顺序填会把后面的格左移。必须用 `r="C3"` 里的列字母定位 |
| 整表向上错位 | 整行空的 `<row>` 被丢掉，行号必须取文件里的 `r`（空行跳号），不能按渲染序编号 |
| 表格散架 | 合并区域跨过的空行/空格 Excel 不写 `<c>`/`<row>`——表宽要看 `mergeCell` 的最右列，`rowSpan` 要按**渲染出来的行**算（不是行号相减） |
| 同一文件两个工作表名 | 名字只在 `workbook.xml` 的 `<sheet name>` 里，`sheet1.xml` 里没有。正文大纲写「工作表 1」而预览写「销售数据」 |
| 新写的格跑到**行首** | 插入位置要按**列号**比，而列号要从 `r="A5"` 里只取列字母（`A`）——把整个引用传给换算函数会算出荒谬的列号，于是「后一个格的列号 > 本格」在第一个格就成立。我们的预览按 `r` 定位所以照常显示，而 Excel 对 `<c>` 顺序有要求（必须按列升序） |

**页签名与隐藏表**：预览与正文提取（`plugins/parser/src/xlsx.ts`）都从
`workbook.xml` + rels 读页签名、顺序与隐藏状态。隐藏的工作表**仍然列出**
并标注「（隐藏）」——Excel 不显示隐藏页签，而这里若也悄悄略过，用户会以为
文件里没有那张表。两处实现是刻意分开的（解析器跑在 Node 用 fflate，
预览跑在浏览器用 JSZip），各自有测试守着同一份契约：
`packages/office/src/xlsx.test.ts` 与 `apps/server/src/test/upload.test.ts`。

### 15.8 pptx 只读预览：vendored 上游的**解析与渲染**，画成 SVG

**pptx 与 xlsx 的结论相反，理由值得写下来**：xlsx 自己写 300 行就够，
pptx 却 vendored 了上游 136 个文件（含 31 个新文件 / 约 23.5K 行）。差别在
**输入格式本身的复杂度**：

| | xlsx | pptx |
|---|---|---|
| 几何 | 行列网格，位置是整数下标 | 每个形状一个 EMU 坐标 + 旋转 + 翻转 + 组合嵌套 |
| 继承 | 样式只管显示 | 幻灯片 → 版式 → 母版 → 主题**四级**（占位符位置、字号、配色映射） |
| 文字 | 单元格里一行字 | 需要按字体度量做**换行、行高、自动缩字、两端对齐** |
| 图形 | 无 | 预设几何（160+ 种）、贝塞尔、渐变、图案、阴影、3D、图表、SmartArt |

后三行每一条都是「自己写会做错，而错了不报错」的东西。**能复用的不复刻**。

**分层与我们的那一层**：

```
vendor/packages/pptx-engine/   解析：zip → Slide 元素树（继承已解析成最终值）
vendor/packages/pptx-render/   布局：Slide → RenderSlide（纯数据的绘制列表）
vendor/packages/pptx-ops/      编辑映射：编辑器回传的段落 → 模型（applyEditParagraphs）
src/pptx-archive.ts            读写 zip / rels / 媒体（浏览器安全，无 node: 内建）
src/pptx.ts                    装配解析上下文 + 编辑会话（openPptxForEdit）
src/pptx-save.ts               保存：元素补丁回字节（patchSlideXml / buildPptxBytes）
src/pptx-svg.ts                RenderSlide → SVG（**我们写的**，替换上游的 Konva 适配器）
```

上游的 `render-tree.ts` 顶部写着「Konva is just a thin adapter that draws the
RenderTree」——保真逻辑（坐标、换行、继承）全在纯数据层，换适配器是它的
设计允许的。**为什么换**：canvas 里的文字选不中、搜不到、读屏读不到，
而对着幻灯片复制一句话是很自然的动作。SVG 的 `<text>` 三者都有。

**两个新依赖**：`bidi-js`（UBA 双向文本算法，上游渲染层的唯一运行时依赖，
MIT/171KB）。上游的另一个依赖 `opentype.js` **没有被拉进来**——它在
`MetricsProvider` 接口后面，是可注入的；不传就用后端的启发式度量
（按字符类别估宽度）。

**五个静默坑**（都在 `src/pptx-svg.ts` 的注释里）：

| 症状 | 原因 |
|---|---|
| 文字间距诡异（「2026」渲染成「2 026」） | 误以为「一个 `GlyphRun` 一个字」，把 run 的 x 拼成 SVG 的**逐字坐标列表**。实际一个 run 是**一个词**，多余的坐标会被浏览器当逐字定位。实测踩过 |
| 整页空白 | SVG 是 XML——一处没转义的 `<` 或 `&` 让**整份文档**解析失败 |
| 形状旋转后位置偏 | OOXML 的 rot 绕**框中心**（不是左上角）；翻转后坐标系回到左上角，旋转中心要相应还原 |
| 合并相邻文字后间距不对 | 同格式的两个 run 位置接不上（中间有空档）时**不能合**——合了就被浏览器按自然排版重排，与文件里的位置脱节 |
| `background-promote` 拉进 10K 行写路径 | 渲染层 import 了它（`isBackgroundLikeElement`），而它又 import `generate.ts`（1703 行 XML 生成）与 `animation.ts`。两者都不含 `node:` 内建，所以安全——但 `@genoffice/pptx-engine` 的**裸包名类型导入**必须改写到 shim，否则 `index.ts`（带 `node:crypto`）会整条进来 |

**如实标注的四件事**（底部说明里写着）：字体用系统里装的（**换行位置**可能
与原件略有差别，要像素级一致得 vendored Calibri 等字体）、阴影为近似
（**内阴影不画**——SVG 做不出 OOXML 的内阴影语义，少画一层比画一层错的好）、
动画不播、SmartArt / OLE 有预渲染图形的画出来没有的显示占位块。

### 15.9 pptx 编辑：补丁式保存，改文字不动格式

**能编辑什么**：幻灯片的**文字**（改内容、增删段落）与**整段的字形**（加粗、
倾斜、下划线、删除线、上标/下标、字号、字体、字体颜色——D-060）。元素的位置
与大小、项目符号/行距/对齐、动画仍要在原件里改（下载 → 改 → 传回，§5.12 的
替换原件）。

**怎么做到「改一行字不重排整篇 XML」**：与 docx 同一条思路（§15.2），
但机制不同——pptx 是**按元素锚点**：

```
解析时：每个元素记下 anchor.originalXml（它在 slideN.xml 里的原始字节切片）
编辑时：只标脏被改的元素（el.dirty = true）
保存时：patchSlideXml = bodyPrefix + Σ(脏元素→重新生成 | 干净元素→原字节) + bodySuffix
```

实测（`src/pptx-save.test.ts`，13 条）：

| 场景 | 结果 |
|---|---|
| 打开后直接保存（上游 5 页 / 47 条目的夹具） | **每个条目逐字节相同** |
| 改第 1 页一段文字 | **只有 `ppt/slides/slide1.xml` 变化**，其余 46 个条目字节相同（含媒体——重压缩会让每个字节都变） |
| 改带格式的文字 | 两个 `<a:rPr>` 块**逐字比对完全相同**（加粗/字号/颜色/字体都还在），只有 `<a:t>` 的内容变了 |

**改格式为什么能保住**：`applyEditParagraphs`（vendored 的
`pptx-ops/src/edit-text.ts`）按 `srcPara` / `srcRun` 把编辑器回传的段落
回溯到**原始 run**，用 `...oldRun` 展开继承未被编辑的属性；而
`patchTextElementXml` 在 run 数对齐时**逐个 run 原地改** `rPr` 上的属性，
不重建节点。

**改格式时必须逐 run 回传**（D-060 的实测结论）：`EditParagraph` 允许
「每段一条 run、文本是整段拼起来的」这种形状，但在有混合格式的段落上它是
**破坏性**的——`applyEditParagraphs` 会取 `dominantRun`（文字最多的那条）的
格式，同段其余 run 的字号/颜色/加粗被静默丢掉。实测（`formatted-text.pptx`
那类「加粗标签 + 普通正文」的段落）压成一条 run 后，写出的
`<a:rPr>` 只剩 `sz="2400"`，标签的 `b="1" sz="3600"` 没了。界面的做法是
每条 run 带自己的 `srcRun` 与原文，只把要改的格式项**追加**上去
（`PptxEditor.tsx` 的 `applyFormat`），`src/editors/PptxEditor.test.tsx` 有
一条用例守着「两条 run 都还在、各自保留字号与颜色」。

**改文字同一条规矩（`editParagraphRuns`）**：段落输入框回传整段纯文本，取
新旧文本的公共前后缀得到改动区间——区间落在一条 run 内就只改那一条；跨了
多条才是真正的整段重写（不带 `srcRun` 回传，让 `applyEditParagraphs` 取
`dominantRun`，重写的新文字跟着正文走；带 `srcRun` 会钉死在第一条上，还会把
域 run 的身份——幻灯片编号那种——摊到新文字上）。**纯插入要单独说**：段尾
追加、段首补字、run 边界塞字的改动区间是**零宽**的，与 0 条 run「相交」，
按相交数判断会误判成整段重写（实测两条 run 的段落段尾加一个字符，保存后
`<a:r>` 由 2 条变 1 条，第二条的 sz/颜色没了——症状与压平完全相同）。落点
规则：插入点**前一个字符所在的 run**（段尾 = 最后一条、run 边界 = 前一条、
段首 = 第一条）；软换行哨兵不是文字，落点是哨兵右缘且下一条是普通文字时改落
下一条的开头，否则哨兵被混进新字符、逐 run 对齐失效退化成重建。回归测试在
`PptxEditor.test.tsx`：段尾追加 / 段首插入 / run 边界插入三条，各断言「两条
run 都还在、各自的格式不变」。

**run 的格式项只在真变时写字节**：`applyEditParagraphs` 对
bold/italic/underline/strike/fontSize/fontFamily/color 逐个比「与旧 run 是否
相同」，相同就不清 `*Implicit` 标记——于是 `patchRunProps` 不写那个属性。
所以「点一个已生效的按钮」与「传回同一个字号」都不改文件（那条断言也在
`PptxEditor.test.tsx` 里：改字号后 `b="1"` 与颜色原样）。**下划线与删除线的
取消**另有规矩：原件里本来没有 `u` / `strike` 时什么都不写（写 `u="none"`
等于把「继承版式」改成「明确没有」，那是改了原件的意思）；原本有属性或有
`underlineExplicitNone` 才写 `none`/`noStrike`。

**四条实测踩过的坑**：

| 症状 | 原因 |
|---|---|
| 包里凭空多出十几个目录条目 | JSZip 默认给每个条目的父目录补目录条目（`ppt/slides/` 这种），而 PowerPoint 与 python-pptx 写的包里没有。`createFolders: false` 是保真要求 |
| 第二次保存把第一次的改动**悄悄回滚** | 保存后没把新 XML 烧回元素锚点，下次 `patchedElementXml` 拿旧锚点拼字节——没改的元素回填的是**旧**字节。所以 `save()` 成功后必须 `commit()`（`commitSaved`） |
| 编辑后画布不更新 | 编辑是**就地**改模型的（`slides()` 返回同一个数组），React 的 `useMemo` 依赖它不会重算。解法是 `view()` 返回**不可变快照**（没改动时同一对象、改动后新对象），让依赖是诚实的 |
| 点画布没反应 | 渲染出的 SVG 必须带 `data-element-id`（事件代理靠它把点击映射回模型元素）。改名或漏掉是静默的——看起来像「这个元素不能编辑」 |

**会话的 `version()`→`view()` 与 `commit()` 是契约不是细节**：跳过
`commit()` 的调用方会在第二次保存时丢数据，而两次保存都「成功」。

**保存路径的验证方式**（不是只跑单元测试就宣布完成）：

| 格式 | 怎么验的 |
|---|---|
| pptx | 浏览器改第 1 页标题 → 保存 → **python-pptx** 打开确认文字；zip 逐条目比对：47 个条目**只有 `ppt/slides/slide1.xml` 变化**，其余逐字节相同 |
| xlsx | 浏览器改 A3 → 保存 → **openpyxl** 读回确认 A3 是新值、A1 未受影响（共享字符串没被动过）；`sharedStrings.xml` 一个字节不变 |
| docx | 改一段 → 保存 → python-docx 读回确认；`word/document.xml` 之外无变化 |

**docx 编辑器仍未做的**（都在 `packages/office/AGENTS.md` 里）：页内分栏（多栏文档按单栏排）、列表编号的新建分配（沿用已有 numId）、以及 §15.4.3 末尾列的几项格式。

**仍未做的**：pptx 的**元素位置与大小**（拖动改框；上游那条路走
`pptx-ops` 的 ops 层 + `setElementTransform`）、项目符号/行距/对齐的改动、
动画播放、精确字体度量；docx 的三项见上。xlsx 另有**公式重算**（改了被
别的公式引用的格子，那边的显示值要等 Excel 打开才更新——状态行写明）、
行/列的增删（这一版只改现有格的内容）、条件格式、图表、数据透视、日期还原。

**xlsx 编辑的一个静默 bug（实测发现并修掉）**：`setCell` 原先只改 XML 文本、
不改内存模型，而界面读的是模型（`view()`）——于是保存成功后状态行说
「已保存」，**格子里还是旧文字**，直到重新打开文件。文件其实是对的
（openpyxl 读得到新值），所以这是「界面与事实不一致」，比不保存更难发现。

修法是两件事一起做（`xlsx-edit.ts` 的 `applyToModel`），而且**按位置写入**
不是按列号排序插入：模型的不变量是「位置即列号」（`cells[i].col === i`，
`readXlsx` 靠补空占位维持），插进去会让下标与列号错开一格，而那种错位是
静默的（点 C3 改到 D3）。四条回归测试守着。

**一条容易误解的地方**：三种格式的**正文层都是可读的**（提取成 Markdown
表格/分页文本，能搜、能被 AI 引用），而**原件层**都能看、**三种都能改**
（docx 全文编辑、xlsx 改格子、pptx 改文字）。不过 §5.12 之后详情里**只有
原件这一层**——提取结果活在检索索引里（那才是它真正的用途），不再占一个
页签。这个区分见 §13.1。

### 15.11 html 编辑器：源码 + 预览双栏

**借了上游什么、自己写了什么**（上游 `apps/html` 共 25924 行）：

| 借 vendored | 自己写 |
|---|---|
| CodeMirror 装配（`source/`：HTML 语法、折叠、快捷键、查找高亮） | 编排：源码与预览谁先、什么时候重载 |
| 结构映射（`document/parse-map.ts`：元素 ↔ 源码偏移） | 预览的**加载方式**（上游走 Electron 自定义协议，浏览器里没有） |
| 补丁校验与应用（`document/patch.ts`） | 点选 → 定位的联动（上游的 StylePanel/Ribbon 是办公壳） |
| 注入脚本（`preview/inspector.js`，1150 行） | — |

不 vendor 的是**办公壳**：Ribbon（585 行）、AI 面板（1749 + 927 行）、
StylePanel（373 行）——mimir 用自己的统一外壳（§15.4.1）。与「编辑 HTML」
有关的只有 2.6K 行，闭包算出来 12 个文件。

**预览怎么加载（与上游不同，必须说明）**：上游是 Electron 应用，主进程注册
`html-preview://` 协议把渲染进程推过去的文本回给 frame。浏览器里没有那条路，
也不该有——回调一个服务端端点等于每次编辑都要往服务器跑一趟。这里用
`srcdoc` 直接喂 HTML：**同源**，但沙箱属性里不给 `allow-same-origin`，于是它
拿不到 cookie/localStorage，脚本仍在 opaque origin 里跑。

**不给 `allow-same-origin` 有一个必须接受的代价**：父页读不到 frame 的 DOM
（`contentDocument` 是 null）。所以「预览到底渲染出来了没有」只能靠 frame
主动报——检视脚本挂载时发 `gx:ready`，状态行据此显示「预览已就绪（标题）」。
没有这条握手的话，预览白屏与预览正在加载在界面上完全一样。

**注入的东西永远不会进文件**：`instrumentForPreview` 给每个元素加 `data-sid`
并把检视脚本注入 `<body>` 前——它只作用于**预览副本**。实测确认过：保存后的
文件里 `data-sid` 与 `data-gx-inspector` 都不存在。

**BOM 与换行风格要原样还回去**（`parseEnvelope` / `serializeEnvelope`）：
编辑一个 CRLF 的 Windows 页面，保存后整篇变成 LF，git diff 会显示「全文件
都改了」——而用户只改了一个字。

**工具条接的都是 vendored 内核里已有的函数**（`SourceEditorHandle`，
`vendor/apps/html/src/renderer/source/SourceEditor.tsx`）：

| 控件 | 接的是 |
|---|---|
| 撤销 / 重做 | `undo()` / `redo()`，可用性由 `canUndo()` / `canRedo()` 喂 |
| 查找和替换 | `findTarget()` → `FindReplaceBar`。**零适配**：`cmFindTarget` 的返回形状与 `FindTarget`（`src/shims/ui.ts`）逐字一致；高亮类 `.search-hit` / `.search-hit-active` 由 `cm-find.ts` 的 StateField 画 |
| 视图（源码 / 分栏 / 预览） | 三个栏位的 `hidden` |
| 设备（桌面 / 平板 / 手机） | 预览宿主层的 `data-device`（宽度写在 editors.css） |
| 预览缩放 | 预览宿主层的 `zoom` + `--html-preview-zoom` |
| 元素路径（面包屑） | `ancestorsOf(map, sid)` + `map.bySid` 拿祖先，末段用 `gx:select` 带回来的 `tag` / `className` |

### 15.11.1 三个静默坑（都在 `HtmlEditor.tsx` 的注释里）

| 症状 | 原因 |
|---|---|
| **切到预览再切回来，中间改的东西没了**（接着敲键就把它覆盖掉） | 视图切换写成了条件渲染。源码编辑器一卸载，CodeMirror 的实例与编辑历史一起消失，而重新挂载时 `SourceEditor` 只吃 `initialText`——那是**刚打开文件时**的文本。所以两个栏位**始终挂着**，只用 `hidden` 决定谁在布局里 |
| **`hidden` 看起来完全没生效** | `[hidden] { display: none }` 在**浏览器默认样式表**里，而 `.mimir-html-preview-pane` 自己写了 `display: flex`——**作者样式一律胜过默认样式**（与选择器特异性无关）。要有 `.mimir-html-split > [hidden] { display: none }` 压回去（实测：少了这条，切到「只看预览」时源码栏照常占着半屏） |
| **「放大到 200%」得到的是手机版布局** | `zoom` 不只是画大，它**同时缩掉元素的布局尺寸**：`zoom: 2` 下 `width: 100%` 解析成「容器宽度 ÷ 2」的局部像素，渲染出来还是容器那么宽——于是得到「一个 360px 宽的视口被拉成 720px」，内容被重排了。实测（1440 视口）：只给 `zoom` 时 host 的 `offsetWidth` 359 对 `rect` 719，frame 内视口被压到 359。要 `width: calc(100% * var(--html-preview-zoom))` 乘回来，**并且 `flex: none`**——宿主是 flex 子项，默认可收缩会把宽度又收回去。设备档位那两条 `max-width` 同理 |

**面包屑与预览是双向的**：点预览里的元素 → 面包屑出来；点面包屑 → 预览滚到
那个元素并选中它（`postMessage` 一条 `gx:select`，检视脚本在 `inspector.js` 的
消息分支里处理——与用户手点走**同一条路径、同一种高亮**）。父页读不到 frame 的
DOM（没有 `allow-same-origin`），所以只能走这条路；实测确认 frame 内那条选中框
（`[data-gx-inspector-overlay="select"]`）跟着面包屑走。

**选中的元素被删掉时面包屑自己落下**：靠 `map.bySid.has(sid)` **在渲染期派生**
（不是在 effect 里清 state——那会踩 `set-state-in-effect` 的级联渲染，也会先有
一帧「元素没了但路径还在」）。sid 由 `buildParseMap` 跨重建复用，所以常见的编辑
（在别处敲字）不会让选中掉下来，只有元素真的没了才掉。

**一处未来要改的地方**：预览的加载是「编辑 → 重建 srcdoc」的整篇策略，所以
**每敲一个字预览都会整页重载**（滚动位置会回到顶部）。上游用「推给主进程 +
版本号换 URL」也有同样的整页重载，所以这不是退步；但它确实是 HTML 编辑器
最明显的粗糙处。要做好的话得增量更新预览（把改动 patch 进 frame 的 DOM），
那是下一步。

### 15.12 PDF：pdf.js 读、pdf-lib 写，文字层自建

**三份库的分工是刻意的**：pdf.js（Apache-2.0）**读**（画页面 + 取文字），
pdf-lib（MIT）**写**（页面结构）。反过来（用一个库做两件事）两头都做不好
——pdf.js 没有写 API，pdf-lib 的渲染能力很弱。两份库**共用同一份文档缓存**
（按字节的身份；`pdf-render.ts` 的 `loadPdfDocument`），否则同一份 PDF 会被
解析两遍，各持一个 worker 侧的对象树。

**一处必须带上的资产**（3.9MB，`apps/web/public/pdfjs/`）：

| 资产 | 少了它的症状 |
|---|---|
| `cmaps/`（169 个文件） | **中文/日文/韩文的 PDF 整段文字不显示**（不是乱码，是空白）——那些 PDF 用 CID 字体，字符到字形的映射表不在文件里。查找也一样：`getTextContent` 读不出汉字 |
| `standard_fonts/`（16 个） | 用标准 14 字体但没内嵌的 PDF 显示为空白或错位 |
| `wasm/`（13 个） | JPEG 2000 / JBIG2 图像解码失败 |

**为什么放 `public/` 而不是打包器给的哈希 URL**：pdf.js 按**原始文件名**去
目录里取（它请求 `cmaps/Adobe-GB1-0.bcmap`）。带哈希的产物目录里根本没有那些
名字，于是 404——而症状就是上面第一行「中文空白」。`public/` 是唯一会被
**原样复制、不改名**的位置。服务端的静态中间件（`lib/static.ts`）为此补了
`.bcmap` / `.pfb` / `.wasm` 三个 MIME。

#### 页面模型：一页由四样东西决定

`editors/pdf-pages.ts`（没有一行 JSX，所以它测得动）：

```
origin   这一页是从哪来的：原件第 N 页 / 空白页 / 别处导入的第 N 页
rotation 目标旋转（绝对值，不是增量）
crop     裁剪：四边各内缩多少 pt（相对**原件可视区**）
paper    纸型：目标尺寸。非 null 时内容按 k 缩放
```

**旋转是绝对值、且不改盒子的宽高**：PDF 的 `/Rotate` 是「显示时把页面转多少
度」，它不改 MediaBox。所以盒子尺寸始终是未旋转的那一套，界面要的显示尺寸由
`displaySize()` 现算。上一版在模型里存交换后的宽高，于是「旋转两次回到原样」
要靠两次交换抵消——那种表示一旦有一处忘了交换，页面的长宽比就是错的，而画布
只会画得不对、不会报错。

**尺寸取 CropBox 而不是 MediaBox**：被裁过的 PDF 到处都是（扫描仪、出版社的
排版稿都带 CropBox），用户看到的是 CropBox 那一块。取 MediaBox 的症状是界面上
的尺寸比实际大一圈，而且用户再裁一刀时基准是错的。

**`isPristine` 与 `sameLayout` 是两个不同的判据**（都别再合并）：

| 判据 | 比的是 | 用在哪 |
|---|---|---|
| `isPristine` | 布局 vs **打开时解析出的原件** | 刚打开时「有没有改动」 |
| `sameLayout` | 两份**布局**逐页比 | 保存之后与**磁盘上那份文件**比 |

**「转过去再转回来」不算改动**（`isPristine`）：判据必须是结构本身，不能是
「有没有操作过」。否则「转 90° 又转回来」会让保存按钮亮着，点下去把整份文件
重写一遍（字节全变）——而用户什么都没改。

**保存之后基线换成磁盘上那份**（`PdfEdit.file`）：保存成功后 `reload()` 是一个
来回的异步，在新字节到之前 `source.bytes` 还是旧的。拿旧原件当基线会同时出两个
错——「保存完仍显示已修改」（真浏览器里实测到：字节已写出 2075 字节，状态行还
挂着「已修改，未保存」）与「改回磁盘上那份之后保存按钮变灰，退不回去」。

#### 保存：整体重建，且**导入的字节必须跟着改动走**

`buildPdfBytes` 新建文档 + 按目标顺序拷贝页面（按来源分组，一份来源只
`copyPages` 一次）。不原地改：`removePage` / `setRotation` 可以原地改，但
**页序调整没有原地版本**（pdf-lib 没有 movePage），导入页面更是只能 `copyPages`。
统一走拷贝的额外好处是**结果只取决于目标结构**，与操作历史无关。

**导入的页在原件里不存在**，所以那份字节必须与改动一起留着
（`PdfEdit.imports`）。丢了它的症状是：第一次保存成功、第二次保存（从同一份
原件重建）把导入的页**静默丢掉**——两次都报成功。所以 `buildPdfBytes` 找不到
导入字节时**抛错**，不静默跳过。

**裁剪只改可视区，内容一字未删**：`setCropBox` 只写一个键，内容流逐字节相同
（`pdf-pages.test.ts` 直接比内容流字节）。界面上如实写着这一句，画布上则用
「框外压暗」表达待生效——画布画的始终是原件（裁剪与纸型是保存后才生效的），
把画面裁掉会与文字层、命中高亮各说各话。

**纸型：`scaleContent(k, k)` 与 `setSize(w, h)` 必须配对**，`k = min(纸宽/可视宽,
纸高/可视高)`。只改纸不缩内容，内容会跑到纸外；只缩内容不改纸，纸还是原来的
大小。**缩放后要补一次 `translateContent(vx·(1−k), vy·(1−k))`**：`scaleContent`
是绕**原点**缩放的，而裁剪后的可视区不在原点——绕原点缩放的症状是「裁一刀再
换纸型，画面整体平移一截」（实测：300pt 宽的页裁掉左边 50pt 再缩到 200pt，不补
平移的话文字整段左移 50pt）。换纸型之后可视区重置为整张新纸，否则裁剪框还停在
旧坐标上。

#### 文字层与查找（`editors/pdf-text.ts`）

| 做 | 不做 |
|---|---|
| `getTextContent()` 取文字与位置，整份文档里找一个串 | **改文字**（要 PDFium 的 7MB WASM） |
| 命中换算成**页面比例矩形**（0..1），画在画布上 | 正则、通配符；选中文字 |

矩形用 `getViewport({ scale: 1, rotation })` 换算，`rotation` 就是**画布渲染时
传的那个**——所以文字层与画面必然对齐，包括原件自带的 `/Rotate`。代价是旋转
变了要重算矩形，为此原始文字（用户空间的四边形）单独按（字节, 原页号）缓存，
重算只做一次坐标变换。

**矩形存比例而不是像素**：画布宽度随缩放变（40–240%），比例让缩放、换页、换
DPI 都不用重算。存像素就要在每次缩放时重算一遍，而漏算一处症状是「放大之后
高亮跑偏」，不报错。

**搜索是同步的，扫描是异步的**：`FindAdapter.search` 按契约同步返回匹配数，
而 `getTextContent()` 是异步的。所以文字在**打开查找之前**先扫一遍（带进度、
可取消），搜索本身在内存里做。反过来（在 `search` 里发起异步扫描）会让匹配数
晚一拍到——栏上显示的是上一次的结果，那看起来就是「搜不到」。

**中文的两件事**：cmaps 让 pdf.js 能读出汉字；而**全词匹配的边界用 ASCII 词
字符集**（`[A-Za-z0-9_]`），于是汉字天然没有「词边界」——「组件」在「组件性能」
里照样匹配。这正是中文该有的语义：硬按空格切会让中文搜不到，而那种开关比没有
开关更坏。

**索引与画布共用同一份文档，所以不能调 `page.cleanup()`**：它会把这一页**正在
进行的渲染任务取消掉**（`pdf.mjs` 的 `#tryCleanup` 里 `internalRenderTask.cancel()`），
症状是画面变白且无报错——正是这个文件里记过的那类坑。

#### 画布与叠加层：百分比定位的前提是「这一层的盒子与画面一样大」

高亮与裁剪框按页面比例定位，分母是那张纸（`.mimir-pdf-sheet`）。**这一层的盒子
必须与 canvas 的 CSS 盒完全一致**，而这里实测踩过三处（都会静默地错位置）：

| 症状 | 原因 |
|---|---|
| 高亮纵向被压扁、框住的不是那行字 | 工作台是 flex 行，默认 `align-items: stretch` 把「纸」拉到工作台那么高。实测：页面 900×1200、纸层 900×667，于是百分比定位的高亮挤进 667 里。要 `align-self: flex-start` |
| 缩放说了假话（写 150%、画布一点没变大） | `.mimir-pdf-page` 上的 `max-width: 100%` 只夹宽度不夹高度。700px 窗口下画出一张 666×1200 的**被压扁**的页（宽高比 0.555，而页面是 0.75）。现在页面保持缩放指定的尺寸、工作台横向滚动 |
| 放大的页面左边滚不到 | 用 `justify-content: center` 居中时，溢出方向跟着 start 边被裁掉。改成子项 `margin-inline: auto`（溢出时退化成 0） |
| 窄窗口下工具条右端的「保存」看不见 | `.mimir-editor` 是 flex 子项，`min-width: auto` 让它不会缩到比内容更窄（里面是 900px 的页面）——420px 窗口里外壳量出 932px。它看起来像「工具条没折行」，其实是外壳的宽度下界。补 `min-width: 0`；`overflow: clip` 挡不住（Chrome 只对 `hidden`/`auto`/`scroll` 把自动最小尺寸算作 0，而 `clip` 是工具条 sticky 必需的） |

**canvas 不写死 `height`**：高度由位图的宽高比决定（canvas 是有内在尺寸的替换
元素）。写死了就多一个可能与宽度不同步的数——不同步的症状正是「画面被拉伸」。

**页面底与高亮的颜色是固定值**（不跟 `--me-*`）：PDF 的页面就是白纸（跟着深色
主题走会让「这份 PDF 长什么样」失真），所以高亮要的是「在白底上看得见的黄/
橙」，而 `--me-accent` 是给**界面**（有主题底）用的。`mix-blend-mode: multiply`
让底下的字透出来——不透明的高亮会把文字盖掉，而「那几个字长什么样」正是要找
的东西。

#### 实测踩过的坑（都会静默坏）

| 症状 | 原因 |
|---|---|
| 界面全白，且**没有任何报错** | 第一版用「模块级记一个 `activeCancel`，新调用先取消旧的」防并发。而 StrictMode 挂载两次 → 第二次取消了第一次、第二次自己又被 cleanup 取消 → **两次都没画**。单独跑 pdf.js 能画出 2566 个非白像素，放进组件就空白。改用**代次**：每次调用领一个号，await 之间对一次「我还是最新的吗」，不是就收掉自己、返回 null，**不去取消别人** |
| `Cannot use the same canvas during multiple render() operations` | 什么都不做时，后一个渲染在前一个没画完时开始。这就是上面那条要解决的问题 |
| 预览过一次之后保存的 PDF 是 0 字节 | `getDocument` 把字节 **transfer** 给 worker，传原引用会让调用方手里的 `Uint8Array` 变成空。要传 `bytes.slice()` |
| 保存完状态行还挂着「已修改，未保存」 | 拿旧原件当基线（见上面 `PdfEdit.file`）。字节其实已经写出去了，所以这是「界面与事实不一致」 |
| 第二次保存把导入的页丢掉 | 导入的字节没跟着改动走 |
| 裁一刀再换纸型，画面整体平移 | `scaleContent` 绕原点缩放，而裁剪后的可视区不在原点 |
| 中文 PDF 整段文字空白 | cmaps 没加载到（按原始文件名取，见上） |

#### 验证方式（不是只跑单元测试就宣布完成）

| 验什么 | 怎么验的 | 结果 |
|---|---|---|
| 页序、旋转、插入空白页、导入的页 | `pdf-pages.test.ts` 用 **pdf.js 独立读回**每页的文字与尺寸，再用 **pdf-lib 独立读回**旋转角与盒子 | 3 页倒序 + 旋转 → 逐页对上；导入的页第二次保存仍在；导入字节丢了**抛错** |
| 裁剪不动内容 | 逐字节比内容流（`contentBytes`） | 裁剪前后内容流完全相同，只有 CropBox 变了 |
| 纸型缩放锚点 | 换纸型前后用 pdf.js 读**文字落点** | 裁左边 50pt 再缩到 200pt：x 从 100 → 90（= 50+(100−50)×0.8）；不补平移会得到 80 |
| 画布投影（四个旋转角） | `pdf-pages.test.ts` 把 `projectBox` 与 pdf.js 的 `convertToViewportPoint` **逐个角**比对 | 0/90/180/270 全部一致到 1e-6 |
| 中文查找 | 手工拼一份 Type0/Identity-H 的 CID PDF（字体不内嵌、靠 ToUnicode 映射——真实中文 PDF 的形状） | 读出「组件」、搜得到、高亮框在字上 |
| **真浏览器**（无头 Chrome + CDP，37 项） | 真 pdf.js 渲染 + 真 pdf-lib 保存 + 真文件选择器（`DOM.setFileInputFiles`）；断言画布的非白像素、高亮的盒子与**框内的墨迹数**、工具条在 420px 下的换行 | 37/37；高亮框内非白像素 2399（英文）/ 2973（中文）——框住的确实是字 |

**保存出来的字节还要独立读回**：真浏览器里保存 3 次，每次都用 pdf-lib 读页数
与旋转、用 pdf.js 读每页文字。实测第 2 次（导入中文页之后）4 页、旋转
`[90,90,0,90]`、文字含「组件性能」；第 3 次（再转 90° 再存）**导入的页仍在**
——这条直接守着上面那个「第二次保存丢页」的坑。

**仍未做的**：改文字（PDFium 的 WASM）、单边裁剪（模型支持四边各自的量，界面上
只能四边等量）、表单填写、矢量图形编辑、批注、以及**选中/复制页面上的文字**
（文字层只用来定位高亮，没有做可选的文本层）。

### 15.13 编辑器外壳与三种「纸」的观感（2026-09 修复轮）

这一轮只修界面层的可见缺陷，**没有新增能力、没有改数据模型**。四条与
「看得见的事实」有关，记在这里是因为它们的成因都不是「某个值写错了」。

| 症状 | 成因 | 修法 |
|---|---|---|
| 打开某些 pptx，画布上的字**逐字竖排**、字压着字并冲出纸外 | `<p:sp>` 的几何三处来源（自己的 `<a:xfrm>`、占位符链、或者什么都没有）里第三种没兜底，`transform` 落在 `(0,0,0,0)`；而 `layoutText` 的可用宽度是 `max(0 − 内边距, 1) = 1px`，于是每个汉字占一行 | 渲染层兜底（`pptx-render.ts` 的 `withFallbackGeometry`）：**只对有文字的 text/shape**、按 `sldSz` 比例回填默认框（左右各 5%、高 20%，多个框竖向排开）。模型一个字节不动（保存是补丁式的），并用 `RenderedSlide.geometryFilled` 在状态行如实说明「N 个文本框在文件里没有几何」 |
| docx 的纸与工作台糊成一片（差 4/255），看不出纸从哪儿开始 | `.doc-page` 的 `box-shadow: var(--docs-page-shadow)` 里的变量**只定义在一份没被 import 的 vendor 样式**里（`vendor/apps/docs/src/renderer/styles.css`），于是解析成 `none` | 宿主补 `--me-page-shadow`（`boxShadowTertiary`——DESIGN §5.3 里「卡片微浮起」那一档），`editors.css` 的 `.mimir-docx-scroll` 把它接到 `--docs-page-shadow` 上 |
| docx 工具条上两个一模一样的「（默认）」下拉，看不出哪个管中文哪个管西文 | `ToolbarGroup` 只渲染 `role="group"` + `aria-label`，不渲染可见文字——组名只到得了读屏与 hover 的 `title` | 两个字体下拉与字号前面补 `.me-label` 级的可见前缀（中文 / 西文 / 字号）；字号的 `null` 档改用新加的 `emptyLabel`（「（默认）」），与「值不在档位里」的「其它」分开 |
| xlsx 附属面板写着 `C3`，而网格里只有行号栏、没有列字母 | 列字母从未渲染（模型里一直有 `sheet.columns`，它是列宽的同一条数据） | 表头补一行 `<th class="mimir-xlsx__colhead">` + 左上角交角格；与行号栏共用一套 sticky chrome，选中列跟着十字高亮亮 |

另外两处是**交互的不对称**，属于「同壳的六种格式应当一致」：

- **笔记工具条没有分组分隔线**（其余五种都有）。`.mimir-editor__bar` 与
  `.me-group` 的 `gap` 都是 2px，不画线时组与组、组内按钮的间隔完全一样，
  八到十个组读成一个没有结构的图标带。修法是按已有的组边界补
  `<ToolbarDivider />`（**只画在真正的组边界**，且只有前一组确实渲染了才画）。
- **pdf 的「删除这一页」一下生效、没有确认也没有撤销**（docx / html / 笔记
  的工具条都有撤销）。这一条加的是**确认**而不是撤销栈：撤销是新能力，而这
  里要的是「别误触」。为此新增外壳原语 `ToolbarConfirm`（antd `Popconfirm`），
  并在 PDF 的常驻说明里写清退路——删除、调序、旋转都只在保存时落到文件上。

**一个包裹在 `ToolbarConfirm` 里暴露出来的静默 bug**：`ToolbarButton` 是函数
组件，没有把 `ref` 转给 antd 的 `Button`。rc-trigger 用
`cloneElement(child, { ref })` 拿触发元素来定位，ref 丢掉之后 `targetEle` 是
null、`onAlign` 直接返回，弹层留在初始位置 `left: -1000vw; top: -1000vh`。
**DOM 里一切正常**（`.ant-popconfirm` 在、文案在、点确认也能走到 `onConfirm`），
只有屏幕上没有——真实浏览器实测确认框的 rect 是 `x=-14400, y=-9000`。
React 19 的 ref-as-prop 下补 `ref` 透传即可，`EditorShell.test.tsx` 有一条
断言守着「ref 落到真 `<button>` 上」。
