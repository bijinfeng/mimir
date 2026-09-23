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
│   └── shared/                  # zod schema + 推导类型（源码发布，无构建步骤）
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

### 5.7 任务分配

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

**值的真相在服务端，所以界面不自己存一份。** `GET /api/config`（只读，
`routes/config.ts`）把 生效中的模型配置（provider / baseUrl / 模型名，
**不含密钥**）与检索参数（RRF k、每通道候选数、已注册通道及权重）
回给前端。早期版本把这些值硬编码在设置页组件里，于是改了
`MODEL_CHAT_MODEL` 之后界面仍显示旧模型名——设置页自己写的原则是
「画一个存不进去的假表单比没有更糟」，显示一个说不了真的值属于同一类问题。

这一层刻意**只读**：配置的真相是 `.env` 与代码常量，做成可写的等于让界面
成为第二个真相来源。端点从运行时对象（`env` / `retrievalLegs` / `RRF_K`）
取值，不重写常量，否则又是一份会漂移的副本。

**布局：分区导航是横向的。** 早期用 `tabPosition="left"` 把分区导航摆进
内容列，于是这一页出现了**两条左栏**（全局左导航 + 分区竖栏），且 760px
的内容列被切掉约 100px、正文只剩约 570px。改成横向后内容列恢复成
`DESIGN.md` §5.4 的 760px。分区选择走 `?section=`，所以「去设置 > 数据与备份」
是一个可以直接贴出去的链接。

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
| `apps/server`（开发）| tsx |
| `apps/server`（生产）| tsdown，把 shared 打进 `dist` |

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
所以必须由使用方编译进产物。tsdown 用 `unbundle: true` 保持一文件对一文件，
因为 `lib/static.ts` 按「所在目录往上两级」推导前端产物位置——打包成 chunk 后
`import.meta.url` 指向重命名后的 chunk，会静默算错路径。

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

### 9.1 当前覆盖

| 范围 | 数量 | 方式 |
|---|---|---|
| 服务端集成 | 41 | Hono 的 `app.request()` 内存调用，不占端口 |
| 编辑器往返 | 15 | happy-dom 环境下的真实 Tiptap 实例 |
| 设计守门（对比度等） | 44 | 真实渲染 + 色彩计算 |

服务端那 41 个里，18 个覆盖 M0 新增的目录 / 双链 / 会话 / 导出 / 抓取，
3 个是**检索召回的回归**（自然语言提问、部分词匹配排序、tsquery 语法安全）
——见 `docs/DECISIONS.md` D-014。

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
| workspace 包以源码发布 | 生产容器启动报 `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`——Node 拒绝执行 node_modules 里的 TS | `@mimir/shared` 以源码发布，但**由使用方编译**：web 交给 Vite，server 交给 tsdown 打进 dist。见 D-023 |
| 打包时把源码目录结构拍平 | `resolveWebDist()` 少算一级目录，静态资源静默 404 | tsdown 开 `unbundle: true`，保持一文件对一文件 |
| tsdown 默认输出 `.mjs` | 镜像里 `node dist/index.js` 找不到文件 | `outExtensions: () => ({ js: '.js' })`（package.json 是 `"type": "module"`）|
| 仓库根靠标志文件查找 | 生产镜像里没有 `pnpm-workspace.yaml`，启动即抛错 | 找不到时退回 `cwd` 而不是抛错；容器里全部传绝对路径 |
| `src/` 与 `dist/` 层级不一致 | 静态资源路径在仓库内正确、在镜像里算到 `/web/dist` | 按候选路径探测 + `WEB_DIST` 显式指定，不用写死的相对偏移 |
| 内层 `ConfigProvider` 传 `theme` | `cssVar` 的 key 被重算，`--ant-*` 变量名改变，引用变量的地方颜色静默不对 | 主题只由 `ThemeProvider` 传；内层 `ConfigProvider` 只放 locale（`theme/MimirProvider.tsx`） |
| 半透明 token 直接算对比度 | 得到把黑色当底色的假数字（`colorFillSecondary` 算出 2.86:1，实际 4.93:1） | 先用 `composite()` 合成到所在底色再算，见 `design.test.ts` |
| `createGlobalStyle` 里用 `--ant-*` | 变量注入在 antd 组件 DOM 子树上，全局规则里取不到 | 用 `${(p) => p.theme.xxx}` 读主题值 |
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

---

## 11. 推进顺序

1. **定 `src/plugins/` 的目录形状与注册表接口**——不写实现，只定形状
2. M0 前端：登录 → 笔记列表与编辑器 → 检索 → 收件箱与整理
3. M0 抓取器：粘贴 URL（三来源）+ 浏览器扩展的最小版本
4. M1：分块与向量化 → 混合检索 → 带引用的问答
5. 之后再回到 PRD 第 6 节的待决项
