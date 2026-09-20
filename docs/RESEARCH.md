# 调研记录与实测数据

> 这份文档记录**证据**，不记录结论。结论在 `PRD.md` 和 `TECH.md`。
> 保留证据的目的是：半年后如果有人问「为什么不用 X」，这里有答案，不必重新调研一遍。

调研时间：2026 年 9 月。所有版本号、星数、下载量均为当时快照。

---

## 1. 竞品：WeKnora

腾讯开源的 LLM 知识平台，是本项目最直接的参考对象。

| 项 | 值 |
|---|---|
| 仓库 | `Tencent/WeKnora` |
| 星数 | 27,579 |
| 建仓 | 2025-07-22 |
| 当前版本 | v0.8.0 |
| 许可 | **MIT**（含第三方组件单独声明） |
| 定位 | 企业级文档理解 + 语义检索 + 自主推理 |

### 1.1 技术栈（与本项目的差异）

| | WeKnora | mimir |
|---|---|---|
| 后端 | Go 1.26 | Hono / Node |
| 前端 | Vue 3 + Vite + TDesign | React + TanStack + antd |
| 文档解析 | 独立 Python `docreader` 服务（gRPC 50051，含 PaddleOCR-VL） | 未定（M1） |
| 数据库 | `paradedb/paradedb:v0.22.6-pg17` | `pgvector/pgvector:pg17` |
| 插件模型 | Cordis「一切都是插件」 | 内部接缝（见 TECH.md §7） |
| 规模 | 20+ 容器的 compose | 单机小栈 |

它的 compose 里包含可选的 Qdrant / Milvus / Weaviate / Neo4j / Doris / Langfuse 等——企业向的完整度，对单人使用是纯负担。

### 1.2 从它的源码里挖到的关键设计

**（一）多维度向量共存的做法**

```sql
CREATE TABLE embeddings (
    dimension INTEGER NOT NULL,
    embedding halfvec                -- 注意：halfvec，不是 vector
);
CREATE INDEX ON embeddings USING hnsw ((embedding::halfvec(3584)) halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64) WHERE (dimension = 3584);
```

两个技巧叠加：`halfvec` 突破 2000 维上限，**按维度分区的 partial index** 让一张表容纳多个不同维度的模型。本项目采纳。

**（二）中文 BM25**

```sql
CREATE INDEX embeddings_search_idx ON embeddings
USING bm25 (id, knowledge_base_id, content, chunk_id)
WITH (key_field = 'id', text_fields = '{"content": {"tokenizer": {"type": "chinese_lindera"}}}');
```

我核对了 ParadeDB 的源码：`tokenizers/src/` 下确实有 `lindera.rs`、`cjk.rs`、`chinese_convert.rs`，中文走内嵌的 cc-cedict 词典。**没能本地验证**（Docker 镜像源 `docker.xuanyuan.me` 拉 paradedb 反复超时），但源码 + 它的生产迁移脚本双重佐证。

**（三）加权 RRF**

```go
// RRF score = vectorWeight/(k+vectorRank) + keywordWeight/(k+keywordRank)
func fuseWithRRF(ctx, vectorResults, keywordResults []*types.IndexWithScore, retrievalCfg) 
```

k 与两个权重都可配。另有一个细节值得学：**BM25 分数无界（常 >10），进入 rerank 前会先折叠到 [0,1]**，否则会淹没 compositeScore 里的其他项。本项目采纳。

**（四）chunks 表比朴素设计细**

```sql
CREATE TABLE chunks (
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,  -- 单条临时排除，不用删
    start_at INTEGER NOT NULL,                 -- 字符偏移，用于引用定位
    end_at INTEGER NOT NULL,
    pre_chunk_id VARCHAR(36),                  -- chunk 链，支持上下文扩展
    next_chunk_id VARCHAR(36),
    chunk_type VARCHAR(20) DEFAULT 'text',
    parent_chunk_id VARCHAR(36)                -- 父子分块
);
```

三处本项目采纳：chunk 链（命中一个可顺带拉相邻块补上下文）、字符偏移（引用能跳回原文位置）、`is_enabled`（不删也能排除）。

**（五）版本历史区分「手动编辑」与「自动生成」**

它的 Wiki 页面版本列表长这样：

```
v3  当前版本   手动编辑   17:38
v2             手动编辑   17:37
v1             自动生成   17:03
```

成本只是一个字段，价值是半年后你分得清哪段是自己写的。

### 1.3 交互上借鉴的三处

**（一）检索过程显式可折叠**

```
⏱ 思考 2 轮 · 调用 3 次工具 · 耗时 17s        ⌄
```

展开后是逐步记录，每步带具体数字（搜了什么词、找到几段、加载了哪个文件、每步几块）。对个人知识库比对企业的更重要——AI 说「没找到」时你能分辨是没存过还是检索出了问题。本项目采纳（PRD 5.6）。

**（二）Wiki 页面底部列出「被链接」与「来源文档」**

```
被链接   03-员工手册-报销与休假.md · 请假流程 · human-resources-department
来源文档 03-员工手册-报销与休假.md
```

让双向链接是双向的。本项目采纳（PRD 5.10）。

**（三）输入框旁就放模型选择与推理开关**

不藏到设置里。个人用不需要那么多模型，但「这次要不要深度思考」是每次都在做的决定。

### 1.4 明确不借鉴的

| 项 | 原因 |
|---|---|
| 共享空间 / 组织 / RBAC 四层角色 / 审计日志 | 企业向，单人使用是纯负担 |
| 知识图谱可视化 | 好看，日常几乎不点 |
| Wiki 全自动生成 | 让 agent 把笔记改写成互链页面，对个人是风险而非收益。笔记是有主张的，不是待蒸馏的语料 |
| 树形层级作为**唯一**组织方式 | 树适合归档（唯一位置），标签适合横切（可多个）。两者分工不同，应当并存 |
| Cordis 插件树 | 为插件生态设计的架构，本项目只需要内部接缝 |

---

## 2. 其他自托管 RAG 平台

全部排除，理由如下。

| 平台 | 星数 | 许可 | 排除原因 |
|---|---|---|---|
| RAGFlow | 91,010 | Apache-2.0 | 最低 **4 核 / 16GB 内存 / 50GB 磁盘**；编排拉起 ES/Infinity + MySQL + MinIO + Redis + NATS + ClickHouse；引用是它自己 UI 里的引用，接自己的表要对抗它的数据模型 |
| Dify | 156,498 | 修改版 Apache，**含商业限制条款** | 是平台不是库；有自己的工作流与 UI |
| FastGPT | 29,694 | 修改版 Apache，含商业限制 | 同上 |
| AnythingLLM | 66,228 | MIT | 自带完整 UI 与向量库选择，等于并存一个应用 |
| Khoj | 37,418 | **AGPL-3.0** | 同上，且传染性许可 |

判断标准：本项目的核心需求是**chunk 级引用指回自己表里的原文位置**。外部平台的引用是黑盒，接进来要么复制一份数据模型，要么放弃引用精度。

---

## 3. TypeScript 生态内的 RAG 库

| 方案 | 版本 | 许可 | 排除原因 |
|---|---|---|---|
| Mastra RAG | `@mastra/rag` 2.6.3 | Apache-2.0 | `@mastra/core` 是 peer 依赖（31 个直接依赖）；`@mastra/pg` 会接管向量存储，与自己的 Drizzle schema 形成两个真相源 |
| LlamaIndex.TS | `llamaindex` 0.12.1 | — | `@llamaindex/postgres` 是 **0.0.66**，依赖 `pg-promise`——又一个 PG 驱动与 Drizzle 并存 |
| LangChain.js | `langchain` 1.5.11 | MIT | 同样的存储层冲突，且体积大 |
| chonkie | 0.3.0 | MIT | 轻量分块器，但**周下载仅 896**，且依赖 `@huggingface/transformers` |

共同问题：它们都想接管文档与分块的数据模型。而本项目的检索层就是约 100 行 SQL 加一个分词函数——引入框架是为了省下这 100 行，代价是失去对引用的控制。

---

## 4. AI SDK 三方对比

用户提出的三个候选，实际上不是同一类东西。

| | `@earendil-works/pi-*` | `@deepseek-ai/dsh` | `@tanstack/ai` |
|---|---|---|---|
| 版本 | 0.86.0 | 主包 0.1.5-rc.2，子包 **0.0.1-rc.1** | 0.55.0 |
| 许可 | MIT | MIT / BSD-3-Clause | MIT |
| 周下载 | pi-ai 3,234,308 | 344,017 | 290,540（core）/ 135,559（react） |
| 仓库星数 | 107.4k | 230.2k | — |
| **形态** | **CLI/TUI 编码 agent 工具箱** | **一个完整应用** | **库 / SDK** |
| embedding | ✗ | ✗ | ✓ `embed()` |
| rerank | ✗ | ✗ | ✓ `rerank()` |
| summarize | ✗ | ✗ | ✓ `summarize()` |
| React 集成 | ✗ | ✗ | ✓ `@tanstack/ai-react` |
| 成熟度 | 稳定 | 官方标注 developer preview | 0.x，周更，2026 JS OSS Award |

### 4.1 pi-agent

包结构是 `pi-coding-agent`（CLI）+ `pi-tui`（终端 UI）+ `pi-ai`（统一模型 API）。

`pi-ai` 本身质量不错——支持 DeepSeek / Moonshot / 智谱 / 国产区域端点，有成本追踪和上下文序列化。但**没有 embedding、没有 rerank**，也没有任何 Web 应用侧的流式/持久化脚手架。README 里还专门说明「Pi 不包含权限系统，默认以启动它的用户权限运行」——它是为本地命令行场景设计的。

### 4.2 deepseek-harness

**是应用，不是库。** 主包 `@deepseek-ai/dsh` 的 package.json 只有 `bin` 字段，没有 `main` / `exports`——`npx @deepseek-ai/dsh web` 起的是它自己的 Web UI。

架构是 Cordis 插件树（everything-is-a-plugin），全部子包 0.0.1-rc.1。README 明确写着：

> DeepSeek Harness is in _developer preview_ ... **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

要用它只有两条路：整个换成它的界面，或者写 Cordis 插件挂进去。与「自己的知识库」这个目标直接冲突。

### 4.3 TanStack AI（选定）

0.55.0，2025-12-04 首发，基本周更（0.51.0 → 0.55.0 在四周内）。核心能力拆成可 tree-shake 的 activities，本项目需要的是其中三个。

**两个已核实的边界**（读类型定义得出，非文档推断）：

1. **`openaiCompatible()` 只覆盖 chat。** `OpenAIEmbeddingConfig extends OpenAIClientConfig extends Omit<ClientOptions, 'apiKey'>`——所以 `createOpenaiEmbedding` 能指向任何 OpenAI 兼容的 embedding 端点（`ClientOptions` 有 `baseURL`），但模型名被限制成 `'text-embedding-3-small' | 'text-embedding-3-large'` 两个字面量。接国产模型需要 `as` 或写自定义适配器（`BaseEmbeddingAdapter` 只有一个抽象方法，约 30 行）。
2. **rerank 适配器路径写死。** Cohere 适配器源码：`fetch(\`${this.baseUrl}/v2/rerank\`)`。国产 rerank 服务多是 `/v1/rerank`。需要自定义 `BaseRerankAdapter`。

**版本风险**：0.x + 周更。缓解手段是锁死精确版本，并且因为适配器层是薄接口，替换成本可控。

---

## 5. 中文分词方案

### 5.1 三个候选的实测对比

```
输入：「React 组件性能优化：如何避免不必要的重渲染」

jieba（@node-rs/jieba 2.0.3，withDict）
  → ["React"," ","组件","性能","优化","：","如何","避免","不必要","的","重","渲染"]

Intl.Segmenter（Node 22 内置）
  → ["React","组","件","性能","优","化","如何","避免","不必要","的","重","渲染"]

输入：「纪录片拍摄技巧与知识库管理」
jieba     → ["纪录片","拍摄","技巧","与","知识库","管理"]
Intl      → ["纪录","片","拍摄","技巧","与","知识","库","管理"]
```

**`Intl.Segmenter` 不可用**：「组件」被切成「组/件」，「纪录片」被切成「纪录/片」。虽然零依赖，但质量不达标。

### 5.2 jieba 的两个坑

```ts
import { Jieba } from '@node-rs/jieba'
import { dict } from '@node-rs/jieba/dict.js'   // 注意 .js 后缀，ESM 下必需

new Jieba()                    → ["React"," ","组","件","性","能",...]   // 逐字！
Jieba.withDict(dict)           → ["React"," ","组件","性能","优化",...]   // 正确
```

1. **不带词典会退化成逐字切分**，分词等于白做
2. `withDict` **只接收词典**；idf（TfIdf 关键词提取用）不是它的参数——类型定义明确是 `withDict(dict: Uint8Array)`，多传会被 TS 拒绝

词典大小 5,071,843 字节，有 linux-x64-gnu / musl 预编译包，Node 22 直接可用。

### 5.3 中文全文检索：Postgres 的行为

实测（PostgreSQL 17.11 + pgvector 0.8.6）：

```sql
to_tsvector('simple','React 组件 PostgreSQL')
  → 'postgresql':3 'react':1 '组件':2
```

- `simple` 配置**自动小写**，大小写不敏感匹配正常
- 中文连续汉字被当成**一个 token**，所以「组件性能优化」整块成词
- 反证：`to_tsvector('simple','组 件 性能') @@ plainto_tsquery('simple','组件')` → **false**

**结论**：必须在写入时预分词。查询串用同一套分词切分后交给 `plainto_tsquery`（参数化，用户输入引号冒号不会引起解析错误）。

### 5.4 ParadeDB 的替代方案

ParadeDB 内置 `chinese_lindera`（cc-cedict 词典），一个索引同时给 BM25 排序和中文分词，比 jieba 预分词干净——少一个运行时依赖、少一个词典加载步骤、BM25 排序质量优于 `ts_rank_cd`。

**未采纳的原因**：ParadeDB Community 是 **AGPL-3.0**。

实际影响说明：它作为独立容器通信、不修改不分发，AGPL 对个人自用**零约束**。只有两种情况要注意——修改 pg_search 源码后对外提供网络服务，或者把 ParadeDB 本身当服务卖。所以这是一个「不想解释的依赖」而非法律问题。若日后要换，代码改动集中在检索层一个文件。

（镜像 `paradedb/paradedb:v0.22.6-pg17` 本地拉取反复超时，**未能实测其中文分词质量**。「中英文混合语料下 Lindera 与 jieba 孰优」仍需自行对比。）

---

## 6. 实测记录：Postgres + pgvector

环境：`pgvector/pgvector:pg17`，PostgreSQL 17.11 (Debian)，pgvector 0.8.6，Docker 29.6.1 / overlay2。

可用扩展：`vector 0.8.6`、`pg_trgm 1.6`、`unaccent`、`btree_gin`。
**没有**：zhparser、pg_jieba、pg_bigm、rum、pg_search。

### 6.1 向量索引维度上限

```
vector(1024) + hnsw        → OK
vector(2048) + hnsw        → ERROR: cannot have more than 2000 dimensions for hnsw index
vector(3072) + ivfflat     → ERROR: cannot have more than 2000 dimensions for ivfflat index
halfvec(3072) + hnsw       → OK
halfvec(4000) + hnsw       → OK
halfvec(4001) + hnsw       → ERROR: cannot have more than 4000 dimensions for hnsw index
```

### 6.2 性能

| 项 | 规模 | 结果 |
|---|---|---|
| HNSW 向量检索 | 5000 向量 × 8 维，top-10 | Index Scan，**0.084 ms** |
| GIN 全文索引 | 200,000 行，索引 1.5 MB | 高选择性查询走 Bitmap Index Scan，**0.026 ms** |
| RRF 融合 | 两个 CTE + `full outer join` | 单条 SQL 完成，行为正确 |

RRF 的实测输出确认了两个通道各自贡献结果后再融合：

```
 chunk_id | kw_rank | vec_rank |   rrf
----------+---------+----------+----------
     1966 |         |        1 | 0.016393   ← 向量独占
     9999 |       1 |          | 0.016393   ← 关键词独占
```

---

## 7. 其他调研结论

### 7.1 文档解析（M1 备选）

| 方案 | 星数 | 说明 |
|---|---|---|
| MinerU | 80,268 | 功能强，但引入 Python 依赖。M1 再评估 |
| PDF.js（`pdf-parse` / `unpdf`） | — | Node 侧纯 TS，可处理文本型 PDF；扫描版需要 OCR |

**各类文件的现实难度**：扫描版 PDF 必须 OCR（否则等于没上传）；双栏排版和表格解析后经常乱；所以必须**保留页码/位置**以便定位原文。

### 7.2 Node 侧其他候选

| 用途 | 候选 | 结论 |
|---|---|---|
| HTML 正文提取 | `@mozilla/readability` 0.6.0 + `linkedom` | 采纳 |
| HTML → Markdown | `turndown` 7.2.4 | 采纳 |
| Word 解析 | `mammoth` 1.12.3（docx → Markdown） | M1 |
| 任务队列 | `pg-boss` 12.33.2 / `graphile-worker` 0.18.0 | 已有 Postgres，不必引入 Redis + BullMQ |

### 7.3 部署环境事实

调研时该服务器上有一组**已停止**的容器，来自另一个项目：

| 容器 | 宿主机端口 |
|---|---|
| nginx | 8080 |
| directus | 8055 |
| postgres:16 | **5433** |
| redis:7 | 6380 |
| minio | 9000 / 9001 |

**本项目端口选择**：Postgres 用 **5544**（避开 5432/5433），API 用 3000，前端开发用 5173。

主机环境：Docker 29.6.1 + overlay2，剩余磁盘 730G，Node v22.23.1，pnpm 12.4.2。

---

## 8. 关键版本快照

便于日后排查「当时为什么这样」。

```
Node                22.23.1
pnpm                12.4.2
Docker              29.6.1
PostgreSQL          17.11
pgvector            0.8.6
React               19.3.0
Vite                8.3.0
TanStack Router     1.170.38
TanStack Query      5.103.1
TanStack AI         0.55.0
Hono                4.13.8
Drizzle ORM         0.45.2
Drizzle Kit         0.31.10
Better Auth         1.7.5
antd                6.6.4
Tiptap              3.31.3
@node-rs/jieba      2.0.3
TypeScript          7.0.2   （Go 重写版；实测与 5.9 行为一致，已采用）
oxlint              1.83.0
oxfmt               0.68.0
oxc-transform-react 0.145.0  （React Compiler 走这条路径）
@vitejs/plugin-react 6.1.1
```

**pnpm 12 的供应链策略**：`minimumReleaseAge` 会拒绝当天发布的依赖（`tsx@4.23.14` 曾被拒）。遇到时锁到上一个稳定版本即可，不要关闭该策略。

**pnpm catalog**：`pnpm-workspace.yaml` 的 `catalog` 字段集中声明版本，包内写 `catalog:`。
适合两类依赖——被多个包使用的，以及必须版本一致的家族（如 10 个 `@tiptap/*` 包）。
后者才是主要价值：版本错开会导致 ProseMirror schema 冲突，而这类错误报得晚、很难查。

**oxfmt 0.68 的能力边界**（2026-09 快照）：能格式化 TS/TSX/JS/JSON/YAML/Markdown。
Markdown 表格会补齐列宽，但列宽按字节算，含中文时结果在任何编辑器里都不对齐——
所以本项目排除了 `**/*.md`。
