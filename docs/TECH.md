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
│   ├── server/                  # Hono API + worker
│   │   └── src/
│   │       ├── app.ts           # 路由装配
│   │       ├── auth.ts          # Better Auth 配置
│   │       ├── env.ts           # 环境变量集中校验
│   │       ├── db/
│   │       │   ├── schema.ts    # 领域表
│   │       │   └── auth-schema.ts
│   │       ├── lib/             # segment / text / vault / http
│   │       ├── search/          # 检索层（legs + fuse）
│   │       ├── services/        # 业务逻辑
│   │       ├── routes/          # HTTP 路由
│   │       └── plugins/         # 插件接缝实现（见 §7）
│   │           └── leg/         # 检索通道——第一个定型的接缝
│   └── web/                     # React SPA
│       └── src/
│           ├── routes/          # 路由（根路由承担鉴权守卫）
│           ├── components/      # NoteEditor 等
│           ├── editor/          # Tiptap 扩展与保真测试
│           └── lib/             # API 客户端 / Query / 路由 context
├── packages/
│   └── shared/                  # zod schema + 推导类型
├── output/                      # 交互原型（单文件静态页）
├── docs/
└── data/                        # 运行时数据，不进 git
```

`packages/shared` 单独存在的理由：API 的请求/响应形状只定义一次，服务端用它做运行时校验，前端用同一份定义做类型，避免两边各写一遍然后慢慢漂移。

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

### 4.3 为什么需要子串兜底通道

Postgres 的 `simple` 配置没有中文词边界概念，「组件性能优化」会被当成**一个** token，用户搜「组件」永远搜不到。所以写入时用 jieba 切好、以空格连接存进 `search_text` 列。

但如果分词切错了（比如把「组件」切成「组」「件」），词级通道就永远命中不了。子串通道用 `pg_trgm` 索引做 `ILIKE '%查询%'`，不受分词结果影响，是分词器的兜底。权重低于词级通道（没有词边界语义）。

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

---

## 4.7 React Compiler

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

### 5.2 两个需要注意的边界

1. **`openaiCompatible()` 只覆盖 chat。** embedding 要走 `createOpenaiEmbedding` 并传 `baseURL`（它继承 OpenAI SDK 的 `ClientOptions`），但模型名在类型上被限制成 OpenAI 的字面量联合类型，接国产模型需要 `as` 或写自定义适配器。自定义适配器只有约 30 行（`BaseEmbeddingAdapter` 只有一个方法）。
2. **rerank 适配器的路径写死了。** Cohere 适配器请求 `${baseURL}/v2/rerank`，而国产 rerank 服务多是 `/v1/rerank`。需要自己包一层 `BaseRerankAdapter`。

### 5.3 版本风险

0.55.0，2025-12 首发，基本周更。风险缓解：**锁死精确版本**；因为适配器层是薄接口（`BaseRerankAdapter` / `BaseEmbeddingAdapter` 都是单方法抽象），真出问题换掉的成本可控。

### 5.4 任务分配

不同任务用不同模型，这是最直接的成本控制手段：

| 任务 | 特点 | 选择 |
|---|---|---|
| 对话与推理 | 量小、要求高 | 强模型（deepseek-chat） |
| 自动摘要 | 量大、要求低 | 便宜模型（qwen-turbo） |
| 向量化 | 量最大 | 1024 维的 embedding 模型 |
| 重排序 | M1 再定 | — |

另外：按**内容哈希缓存摘要**，文档没变就不重复调用。`usage_log` 记录每次调用的 token 与花费。

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

## 7. 插件架构：内部接缝，不是外部市场

### 7.1 定位

「插件架构」在实践里指向两种完全不同的东西：

| | 外部插件市场 | **内部接缝（本项目）** |
|---|---|---|
| 是什么 | 公开 API，第三方能写插件 | 代码按接缝组织，加实现＝加文件 |
| 要付出 | 版本化 API、兼容性承诺、文档、沙箱、权限模型 | 一个注册表 + 一份接口定义 |
| 适合 | 有生态野心的产品 | 个人项目 |

用户的目标是「代码好维护」，对应的是第二种。做成第一种会引入比它解决的问题更多的维护负担。

### 7.2 四条接缝

| 接缝 | 输入 → 输出 | 已有实现 | 规划 |
|---|---|---|---|
| `capturer` | URL / 文件 → 统一 Markdown + 元数据 | 粘贴链接、公众号、GitHub | RSS、Star 同步、浏览器扩展 |
| `parser` | 原始内容 → 结构化文本（保留页码/偏移） | Markdown、HTML 正文提取 | PDF、Word |
| `leg` | 查询 → 已排序的文档 id 列表 | 关键词、子串兜底 | 向量、重排序 |
| `provider` | 任务 → 模型调用 | DeepSeek、通义 | 智谱、Ollama |

### 7.3 推进方式：先别造框架

**按接缝组织代码，等第二个实现出现了再抽接口。**

理由：`capturer` / `parser` / `provider` 三条接缝现在一个实现都还没有。凭想象设计接口，八成会把参数集设计错，然后每加一个实现都要改接口——比不抽还累。

**`leg` 已经走完了这个流程**，可以当作其余三条的样板：

```
plugins/leg/
├── types.ts      RetrievalLeg 接口（从两个实现的共同点反推）
├── keyword.ts    jieba 预分词 + GIN + ts_rank_cd
├── substring.ts  pg_trgm + ILIKE
└── index.ts      注册表：retrievalLegs = [keywordLeg, substringLeg]
```

`search/index.ts` 只遍历 `retrievalLegs`，不认识任何具体通道。
**M1 加向量通道时，只需新增一个文件并在注册表里补一行**——编排层与融合层都不用改。

接口本身只有三个成员：`name`（写进 matchedBy）、`weight`（融合权重）、
`run(ctx)`（召回并返回排序好的 id 列表）。通道不负责融合、不负责重排、不取正文。

推进顺序：

1. 定接缝的**边界**（上面四条）
2. 每条接缝的第一个实现直接写，不抽接口
3. 写第二个实现时，从两者的共同点反推接口
4. 接口稳定到第三个实现，才算定型

### 7.4 设置页 = 注册表的人类可读视图

设置页不是一堆散落的表单，每一行「可配置的东西」都对应一个注册进接缝的实现：

- 模型页 = `provider` 接缝的配置面
- 抓取页 = `capturer` 接缝的配置面
- 检索页 = `leg` 接缝的参数面
- 插件页 = 全部接缝的总览

这样「可配置的东西」和「代码里的实现」永远一一对应，不会出现设置里有开关但代码里没有对应逻辑。

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
- 密钥只存服务端并加密落库，**绝不下发浏览器**
- `AUTH_SECRET` 生产环境必须显式设置，否则启动即失败
- Cookie：`httpOnly` + `sameSite=lax`，生产环境自动 `secure`
- **建议再套一层 Tailscale 或 Cloudflare Tunnel**。自托管暴露公网是最大的现实风险点

### 8.3 构建顺序

镜像构建有三处顺序要求，反了都会失败：

```
1. pnpm --filter @mimir/shared build     ← 必须先于 web/server
2. pnpm --filter @mimir/web build        ← 内含 tsr generate（路由树）
3. pnpm --filter @mimir/server build
```

第 1 条的约束来自 `@mimir/shared` 以**产物**形式发布：以源码发布会让 Node
在生产环境拒绝类型剥离。第 2 条是因为路由树是生成物，而 `tsc` 需要它存在。

镜像里有两个 Node 进程吗？没有，只有一个：`node dist/index.js` 同时提供 API
与前端静态资源。单用户自托管不值得拆成三个容器加一个反代。

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

`data/` 目录 + `pg_dump` 定时打包。因为「文件是真相」，最坏情况可以从 `data/vault` 和 `data/raw` 完整重建数据库。

---

## 9. 测试策略

### 9.1 当前状态

| 范围 | 数量 | 方式 |
|---|---|---|
| 服务端集成 | 18 | Hono 的 `app.request()` 内存调用，不占端口 |
| 编辑器往返 | 15 | happy-dom 环境下的真实 Tiptap 实例 |

### 9.2 测试库隔离

集成测试用**独立的 `mimir_test` 库**和**独立的 vault 目录**（`data/.test/`）。

这一条踩过坑：测试一开始写进了真实 vault，跑几次之后用户的笔记目录里多了 18 个测试垃圾文件。现在 `globalSetup` 会校验库名必须包含 `mimir_test`，否则拒绝运行。

### 9.3 当前覆盖

| 范围 | 数量 | 方式 |
|---|---|---|
| 服务端集成 | 18 | Hono 的 `app.request()` 内存调用，不占端口 |
| 编辑器往返 | 15 | happy-dom 环境下的真实 Tiptap 实例 |

### 9.4 一条命令

```bash
pnpm check     # oxlint → oxfmt --check → typecheck → test
```

CI 与本地 pre-push 跑的是同一条，避免两处逻辑漂移。

### 9.5 值得加的测试

- 检索相关性回归（准备一组查询 → 期望的命中，参数调整后必须仍通过）
- 抓取器的解析快照测试（存下 HTML，断言解析结果）
- 文件与数据库一致性（写入中途失败后的重建）

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
| workspace 包以源码发布 | 生产容器启动报 `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`——Node 拒绝剥离 node_modules 里的 TS | `@mimir/shared` 编译到 `dist` 并以产物发布；build 顺序：shared → web/server |
| 仓库根靠标志文件查找 | 生产镜像里没有 `pnpm-workspace.yaml`，启动即抛错 | 找不到时退回 `cwd` 而不是抛错；容器里全部传绝对路径 |
| `src/` 与 `dist/` 层级不一致 | 静态资源路径在仓库内正确、在镜像里算到 `/web/dist` | 按候选路径探测 + `WEB_DIST` 显式指定，不用写死的相对偏移 |

---

## 11. 推进顺序

1. **定 `src/plugins/` 的目录形状与注册表接口**——不写实现，只定形状
2. M0 前端：登录 → 笔记列表与编辑器 → 检索 → 收件箱与整理
3. M0 抓取器：粘贴 URL（三来源）+ 浏览器扩展的最小版本
4. M1：分块与向量化 → 混合检索 → 带引用的问答
5. 之后再回到 PRD 第 6 节的待决项
