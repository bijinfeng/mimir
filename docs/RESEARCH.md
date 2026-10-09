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
| 可写的「设置」与 `.env` 双真相 | 见 §1.5 第 2 条——分层解析是它的解法，但前提是键集闭集与写入校验都做齐 |

### 1.5 插件与配置机制（二次调研，2026-09）

第一轮调研（§1.1–1.4）看的是它的能力与交互。这一轮专门读它的**插件与配置
机制**，因为用户提出「配置项都插件化，值得借鉴」。结论与证据如下。

**（一）「万物皆插件」是误读，它没有插件框架。**

`grep -ri "everything is a plugin|万物皆插件"` 在 `*.md` 里 0 命中。`Cordis`
只出现在 `packages/dsh-weknora/`——那是一个给 **DeepSeek Harness** 写的客户端
插件包（`cordis.patch.yml` + `inject = ['tools']` + `apply(ctx, config)`），
不是 WeKnora 自己的架构。

Go 主干里真正存在的是一套更窄的东西：`internal/application/service/chat_pipeline/chat_pipeline.go:11-21`

```go
type Plugin interface {
	OnEvent(ctx context.Context, eventType types.EventType,
		chatManage *types.ChatManage, next func() *PluginError) *PluginError
	ActivationEvents() []types.EventType
}
```

15 个「插件」在 `internal/container/container.go:489-503` 手工装配成一条
中间件链。没有依赖声明、没有外部清单、没有生命周期——**是管道阶段，不是插件系统**。

**教训**：它值得学的不是「插件化」这个词，而是几处**具体的机制**。

**（二）配置三层解析：DB 行 > 环境变量 > 内置默认。**

截图里那句「此处设置优先于服务端环境变量，留空则使用环境变量默认值」是真的，
实现在 `internal/application/service/system_setting.go:633-656`：

```go
func (s *systemSettingService) GetInt(ctx context.Context, key string, envName string, def int64) int64 {
	if raw, ok := s.resolveRaw(ctx, key); ok { /* 解码并返回 */ }
	if envName != "" {
		if v := os.Getenv(envName); v != "" {
			if n, err := strconv.ParseInt(v, 10, 64); err == nil { return n }
		}
	}
	return def
}
```

四个配套细节，每一个都解决了「可写设置」的一个真问题：

| 细节 | 做法 | 解决的问题 |
|---|---|---|
| **键集是闭集** | `settingSpec` 在代码里注册合法键（`system_setting.go:66-96`），`Update` 拒绝未知键（`:922-926`） | 界面无法写入任意键，也就不可能有「界面里有、代码里没人读」的设置 |
| **迁移不 seed** | `000053_...up.sql:16-22` 刻意不插默认行 | 否则部署方在 `.env` 里配的值会被空默认值**静默覆盖**。未设置的行以「虚拟行」形式从环境变量回填 |
| **写入即校验** | 类型检查 + 每键的语法钩子，400 返回（`:928-964`） | 坏值在保存时就失败，而不是等到第一次调用 |
| **热更新** | 预加载 + Redis pub/sub 按 key 失效 + `dispatchSideEffects`（`:374-383`、`:557-571`、`:495-514`） | 改设置不用重启。它需要 Redis 是因为多副本；单进程一个内存表即可 |

**（三）密钥：AES-GCM 落库 + DTO 白名单剔除。**

`internal/types/model.go:255-269` 在 GORM 的 serde 边界加密（`enc:v1:` 前缀），
密钥来自 32 字节的 `SYSTEM_AES_KEY`（未设时 `GetAESKey()` 返回 nil，
**退化成明文落库**——`internal/utils/crypto.go:19-25`，这是一个明确的坑）。
下发前走 `ModelParametersDTO`，注释写明「除两个密文字段外全部字段」
（`internal/handler/dto/model.go:200-217`）。

**（四）解析引擎注册表 + 可用性探测——本轮最值得抄的一处。**

`internal/infrastructure/docparser/engines.go:34-41` 注册八个引擎；
注册表把 Go 本地引擎与 Python docreader 通过 RPC 声明的引擎**合并**
（`engine_registry.go:96-142`），远端同名引擎的描述与文件类型优先。
可用性不是静态检查，是接口的第二个方法：

```go
// engine_registry.go:15-29
CheckAvailable(docreaderConnected bool, overrides map[string]string) (available bool, reason string)

// engines.go:144-149 / 172-177
func (e *anydocEngine) CheckAvailable(_ bool, _ map[string]string) (bool, string) { return backendAvailable(), ... }
func (e *mineruCloudEngine) CheckAvailable(_ bool, overrides map[string]string) (bool, string) {
	apiKey := strings.TrimSpace(overrides["mineru_api_key"])
	if apiKey == "" { return false, "MinerU API Key not configured" }
	return PingMinerUCloud(apiKey)   // 真的发请求
}
```

`GET /system/parser-engines` 回 `{data, docreader_addr, connected}`，
每项含 `Available` 与 `UnavailableReason`；界面用绿/红徽标 + tooltip
（`frontend/src/views/settings/ParserEngineSettings.vue:70-88`）。
`POST /system/parser-engines/check` 用**未保存的表单值**试一次——保存前就能验证。

**（五）「可用」是探测出来的，不是算出来的。** 模型侧同理：
`internal/handler/initialization.go:2072-2100` 建一个实例、发一条
`"test"` 且 `MaxTokens: 1` 的请求，**把 HTTP 400 当成功**
（端点可达且鉴权通过，只是参数不匹配）。密钥已落库时，测试请求可以传空密钥，
服务端用 `fillSecretsFromStoredModel` 补齐（`:1801-1834`）。

**（六）界面：多数是手写的，两处是 schema 驱动。**

`frontend/src/config/settingsAccess.ts` 做角色门禁、
`deploymentCapabilities.ts` × `GET /system/capabilities` 做**能力探测型隐藏**
（不支持的功能整个分区不出现，而不是显示一个点不动的开关）。
真正 schema 驱动的只有两处：向量库（`api/vector-store.ts` 的
`connection_fields[]/index_fields[]`，`VectorStoreSettings.vue` 按
`field.type` 渲染）与网络搜索（`web_search_provider.go:152-166`
的 `ConfigFields []WebSearchProviderConfigField`）。
`ParserEngineSettings.vue` 反过来——按引擎名硬编码抽屉
（`v-if="currentEngine.Name === 'mineru'"`），**八个引擎就是八段重复模板**。

**（七）模型配置的形态：平铺的模型卡片，角色绑定在消费方。**

`ModelSettings.vue` 是一份按 `chat|embedding|rerank|vllm|asr` 分 tab 的卡片列表；
「哪个角色用哪个模型」不在设置页，而在消费方各挂一个
`ModelSelector.vue`（知识库、智能体各一处）。
对本项目这意味着：不需要为「角色 → 模型」造一套新概念，
在设置页给每个角色一行下拉即可，比它的界面更直接。

**（八）存储/图/搜索的位置。**

向量库 10 种、对象存储 8 种、图库只有 Neo4j 且 `NEO4J_ENABLE=true` 才启用
（`internal/container/container.go:1721-1725`）、网络搜索 14 家
（`internal/types/web_search_provider.go:16-30`）。
这些是「多后端」而不是「插件」——**它自己也只在真正多实现的地方做了抽象**
（对象存储有 allow-list 与按 KB 绑定）。本项目只有 Postgres，
把它做成可切换的存储引擎是纯负担，见 `DECISIONS.md` D-031。

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

---

## 9. 多知识库：组织单位还是性能单位

**起因**：担心文档量上来之后，全库检索会变慢、问答的索引时间与 token 消耗会随库增长。

**结论**：没有一家竞品用「拆库」解决检索速度；唯一真按库隔离的产品
（NotebookLM）付出的代价正是「无法跨库检索」。而且本项目当前慢的地方
**不是库的大小，是两条召回通道的 SQL 形状**（9.5 有实测）。
索引与 token 这两个担心则都不成立（9.6）。

### 9.1 自托管 RAG 平台：物理索引不跟库边界走

| 平台 | 库的物理形态 | 跨库检索 | 「库」用来做什么 |
|---|---|---|---|
| RAGFlow | 一租户一个 ES 索引（`ragflow_{tenant_id}`），`kb_id` 只是**过滤字段** | 支持 | 组织 |
| FastGPT | 所有数据集同一张 pgvector 表，`dataset_id` 过滤 | 需要显式的「合并」节点（RRF）| 官方原话：最小的搜索单位是**库**，而集合「仅是为了对数据进行分类管理，**与搜索效果无关**」；库的数量是商业授权项（`maxDatasetAmount`）|
| MaxKB | 所有库共用一张 `embedding` 表 | — | 唯一把库当性能单位用的：**逐库查询**以命中局部 HNSW 索引（源码注释写着 `WHERE knowledge_id = ...` 用得上索引，`knowledge_id__in` 用不上）。收益来自「过滤 + 局部索引」，库仍是逻辑对象 |
| Dify | 一库一个向量 collection | 支持（每库一个线程）| 挂 30+ 库时检索变慢并最终失败（#29876）；但同一条线路上「只引用 1 个库、库内 1 篇文档」也要 19 秒（#22933）——瓶颈在编排，不在库的数量 |
| WeKnora | 库 = 所有权与权限单位（4 层 RBAC、按库限制的 API key）| — | 权限与隔离。单库号称可到 4 万篇文档 |

四家里三家把**所有库的 chunk 放在同一批物理索引里**，用过滤字段区分。
所以「拆库让检索变快」在这些系统里不成立——过滤谓词本来就能做同样的事，
而拆库额外引入每个库的固定开销与跨库合并成本。

### 9.2 存储与检索引擎：拆索引不会让「查全部」更快

- **Elasticsearch** 官方：查很多小分片「**不一定**比查少量大分片快」，每个分片有固定
  资源开销，小分片带来更多排队任务。Elastic 自己的 index-per-tenant 复盘（`found-multi-tenancy`）
  最终合并成一个索引 + 租户 ID 过滤 + 路由，因为「每个分片都有一份基础内存开销，
  且**即使分片里没有文档也是常数**」。
- **Qdrant**：为每个租户建独立 collection「很少是最优解，每个 collection 都有自己的资源开销」；
  而且跨组的**全局查询会更慢**，因为它必须扫描所有分组。默认上限 1000 collections/集群。
- **Pinecone**：成本模型是**扫描的字节数**——「100 个租户各 1GB，查一个租户 1 RU；
  单个 namespace 里放 100GB 再用元数据过滤，同样的查询要 100 RU」。也就是拆库让
  **单库查询变快、全量查询变慢**。官方建议「在单个索引内用 namespace 分区，而不是建多个索引」。
- **pgvector**：近似索引的过滤是 post-filter（先扫索引再过滤），过滤太狠会掉召回，
  官方解法是 `hnsw.iterative_scan`；分区确实有用，但**每个分区各扫一遍再合并**
  （issue #845），且要防「过滤后剩不下 `ef_search` 条」。
- **大厂分片的动机是运维，不是查询速度**：Notion 的 480 个逻辑分片是为了治
  autovacuum 停滞与 TXID 回绕（自称「生存威胁」），Figma 是为了 RDS 的 IOPS 上限与
  vacuum 对可靠性的影响（且分片后范围扫描变得更差），Slack 是为了隔离与热点。
  没有一家归因于「全量查询慢」。

### 9.3 NotebookLM：真拆了库，代价是失去跨库检索

每个 notebook 有硬性的源数量上限，且随模型世代反复起落：

| 时间 | 每 notebook 源上限 |
|---|---|
| 2023-11 | 10（单源 5 万字）|
| 2023-12 | 100 |
| 2024-06 | 50（单源 50 万字，随 Gemini 1.5 Pro）|
| 2024-12 | Plus 300 / 免费 50 |
| 2025-12 | Ultra 600 |
| 2026-09 | 免费 50 / AI Plus 100 / Pro 300 / Ultra 500–600；单源 50 万字、200MB |

（2023-12 的 100 到 2024-06 的 50 是一次**下调**，查到的来源没有解释原因，
此处如实记录不作推测。）

**跨库检索不存在**，这是官方文档的原话：

> Each notebook is independent. Gemini Notebook can't access information across
> multiple notebooks at the same time.

用户为此付的代价看得见：r/notebooklm 上「合并 notebook」「跨 notebook 搜索」的请求反复出现，
甚至有人做了第三方工具，只为解决「在你那 30 个 notebook 里找出这篇论文在哪一个」。

而官方给上限的理由全部落在**上下文与回答质量**上（「careful context engineering is critical
in delivering a high quality and trustworthy answer」；用量取决于「prompt complexity,
chat length, number of sources」）——**没有一条说是检索慢**。

也就是说：库是**模型上下文逼出来的隔离单位**，不是检索性能的分区单位。
而隔离一旦发生，用户就失去全库检索——「想不起存过什么」正是本项目
认定个人知识库的头号问题（PRD §5）。

### 9.4 笔记类：默认全库检索

- **Obsidian**：搜索覆盖整个 vault；可以同时打开多个 vault，但**不跨 vault 搜**
  （内部链接是 vault 局部的）。单库变大确实会慢：官方 issue #597 说
  「vault 超过 10,000 个文件时，Quick Switcher 等自动补全改用更简单的搜索算法」。
  但应对是**降级某个自动补全**，不是让用户拆库。
- **思源**：笔记本可以有多个，而**全局搜索默认跨所有笔记本**（加密笔记本除外）。
  已记录的性能问题是索引重建吃内存：4,343 篇文档 / 31.5 万块 → 重建时涨到 2.2GB，
  iOS 直接被系统杀掉（issue #19744）。瓶颈在**建索引**，与库的数量无关。
- **Logseq**：未查到可引用的资料——相关调研请求被上游内容策略连续拒绝，
  不想凭印象补。

### 9.5 本项目的实测：慢的是 SQL 形状，不是库的大小

环境：`pgvector/pgvector:pg17`（PostgreSQL 17.11），5 万行临时表（与 `documents` 同列形状），
`to_tsvector('simple', search_text)` 的 GIN 索引 + `body gin_trgm_ops`。

两条通道的 SQL 都把**门槛**（命中词数 ≥ 一半，见 `plugins/leg/keyword.ts` 的长注释）
放在**外层查询**里。后果是过滤条件引用的是计算列，索引无法用于过滤。
同一张表（5 万行，其中 1/7 命中查询词），取三次测量的最小值：

| 查询 | 现状（门槛在外层）| 谓词下推到 `WHERE` 后 |
|---|---|---|
| keyword，命中 1/7 | 328 ms · **Seq Scan** | **38.5 ms** · Bitmap Index Scan |
| keyword，零命中 | 292 ms · **Seq Scan** | **0.012 ms** · Bitmap Index Scan |
| substring，命中 1/7 | 51 ms · **Seq Scan** | 0.3 ms · Seq Scan + `LIMIT` 提前停 |

**能下推的是 OR 超集，不是门槛本身。** 门槛是「命中词数 ≥ 一半」，它无法用
索引表达。可下推的是它的**必要条件**——「至少命中一个词」（所有词的 OR，
`to_tsvector(...) @@ (q1 || q2 || ...)`）；这一层走索引把候选集缩小，
精确的门槛仍留在外层过滤。**两句话都必须实现**：只下推 OR 会退化成
`keyword.ts` 注释里写的「纯 OR 召回太宽」，把「只有通用词命中」的文档捞回来。
两条通道都是这个形状（`required = ceil(词数 / 2)`，只有查询词为 1–2 个时
门槛恰好是 1，此时 OR 与门槛等价）。

读法：

1. **零命中也要 292 ms**，这是最能说明现状的一条——库里根本没有这个词，
   理想情况下应当立刻返回，而现在必须把 5 万行逐个算一遍 `to_tsvector`。
   代价与命中数无关，只与**表有多少行**有关，所以它随库增长线性变慢。
2. 下推后零命中降到 **0.012 ms**（四个数量级），因为 GIN 直接给出「没有」。
3. 命中密集时下推后仍有 38.5 ms——那不是索引的锅，是要对 7142 个候选算
   `ts_rank_cd` 并排序的**真实工作量**，而它本就被下游的 `limit 50` 收敛。
4. `substring` 通道即使把谓词下推也仍走 Seq Scan（`limit` 让它提前停），
   所以两条通道的优化不是同一件事。它的排序还要算 `length(body)` 与
   每个词一个 `strpos(lower(body), token)`——这些是排序项，必须留在外层，
   不能进 `WHERE`。

一句话：**慢的是 SQL 形状（O(N) 的逐行计算），不是库的大小。**
拆库之后每个库仍然全表扫描，只是表更短——谓词下推是一次性改动，不是架构改动。

（M1 加向量通道时同一类问题会再来一次：pgvector 的过滤是 post-filter，
过滤器吃到剩下不到 `ef_search` 条就掉召回，见 9.2。）

### 9.6 索引时间与 token：两个担心都不随库增长

**索引不在对话链路里。** 写入路径是增量的：`createNote` / `updateNote` 只对**这一篇**
算 `excerpt` / `searchText`（jieba 预分词）/ `contentHash`（`services/documents.ts`）。
全量 `reindexVault()` 只由显式的维护接口 `POST /maintenance/reindex` 触发
（`routes/documents.ts`），不在问答链路上。所以「AI 对话过程中 agent 索引文档的时间」
这个成本不存在——对话里只有查询，没有索引。

**检索上下文的 token 有硬上限。** `CONTEXT_CHAR_BUDGET = 6000` 字符
（每条引用 `PER_CITATION_CHARS = 1200`，融合后取前 8 条，`assistant-stream.ts`）。
库从 100 篇涨到 10 万篇，这个上限不变，因为它是**预算**而不是**累积**：
每轮重新检索、重新截断。

**会随对话增长的是历史消息**（另一个维度，当前未裁剪）：`assistant-stream.ts`
把客户端带来的 `history` 原样拼进 `messages`，没有窗口。同一会话问得越久，
每轮 input token 越大——这与库的大小无关。

### 9.7 什么时候才真的需要拆

先咬人的是三件事，都与库的数量无关：

1. **索引没走**——已实测，见 9.5，是当前真实存在的 O(N) 成本
2. **HNSW 装不进内存**：`maintenance_work_mem` 默认 64MB，pgvector 在 10 万条量级
   会报 `hnsw graph no longer fits into maintenance_work_mem`；Supabase 实测
   100 万 × 1536 维在 Postgres 上要 **30–35 GB** 内存
3. **rerank 与 LLM 富化的成本**：RAGFlow issue #8279——1.76 万篇文档的库每次检索
   6 分钟，维护者归因于 CPU rerank、自动关键词生成、`top_k=1024`，**不是库大**

量级参照：按每篇约 1000 token、512 token 一块粗算（篇长是假设，非实测），
10 万篇 ≈ 20 万块 ≈ 1024 维下向量本身不到 1GB，HNSW 图再乘约 1.3。
公开的失败案例在**单库 1.76 万篇 / 单库 4 万篇**量级，且都不归因于库的数量。

所以将来若真要拆，正当理由是**组织与情境隔离**（Obsidian 的 vault、思源的笔记本），
并且应当保住**跨库检索**。NotebookLM 的现状正好说明：拆库而失去全库检索，
换来的是一句「我想不起当时存在哪个库了」——恰好是 mimir 最不能失去的东西。

---

## 10. 文件存储：本地默认 + S3 可选（2026-09 调研）

**需求**：存储默认落本地，但要支持 S3；并且这个也要做成插件。

这条需求与两处既有决策正面相撞，必须先把它们拆开：

| 既有决策 | 它写的是什么 |
|---|---|
| `DECISIONS.md` D-031 | 「不做可切换的存储引擎」，并把**对象存储**列进「明确不做成接缝」的清单（`TECH.md` §7.2 同） |
| `PRD.md` §1 非目标 | 「可切换的存储 / 向量引擎」——理由是「多后端支持是企业产品要兼容各种栈的产物」 |

**结论：D-031 的判断在这里不适用，需要一次修订。** 理由不是「用户想要」，而是
D-031 自己的理由是**关于 SQL 的**，而这次要换的是**文件**。见 10.1。

### 10.1 D-031 反对的是「数据库多后端」，不是「文件多后端」

D-031 给出的三条理由逐条看：

1. 「每个查询要过一层适配（`<=>` 运算符、`halfvec` 的表达式索引、RRF 的 SQL
   都是 PG 特有的）」——这条成本全部产生在**查询方言**上。文件读写没有方言。
2. 「Postgres 同时是关系库、全文索引与向量库，这是本项目的简化前提」——主语是
   Postgres。它说的是**不要把数据库抽象掉**，而文件从来不在 Postgres 里。
3. 「有多实现（或明确将有多实现）的地方抽接缝，只有一个实现且不会变的地方不抽」
   ——这是 D-031 自己给出的**判据**。文件存储现在正落在它定义的条件上：

| | 数据库 / 向量库（D-031 的对象） | 文件存储（本次的对象） |
|---|---|---|
| 有没有第二个实现 | 没有，且方向都没有 | **有**：本地与 S3-as-plugin |
| 第二次实现是「兼容已有栈」吗 | 是（企业要接各自的库） | **不是**：VPS/远程部署的人本来就没有本地文件可开 |
| 抽接口的代价 | 每条 SQL 要过适配层 | 5 个方法，且不含查询方言 |
| 不抽的代价 | 零（没有第二实现） | 远程部署时无法把数据放到对象存储 |

所以修订的方向是**把两条决策各自收窄**，而不是推翻它们：

- D-031 保留一半：**数据库与向量库仍然只有 Postgres**，不抽。
- 「对象存储不做成接缝」这一句删掉，并说明为什么它当初被误归进同一类。
- `PRD.md` §1 的非目标「可切换的存储 / 向量引擎」改成「可切换的**数据库 / 向量引擎**」，
  文件存储从该条移出。

### 10.2 要被覆盖的操作面（从真实调用点反推，不是设想）

| 目录 | 唯一知道它的模块 | 读写模式 | 需要的操作 |
|---|---|---|---|
| `data/vault/` | `lib/vault.ts` | 读 + 写 + 改名 + 回收站 + 递归遍历 | 5 |
| `data/raw/` | `services/capture.ts` | **只写不读**（无路由伺服它，已验证） | 1 |
| `data/avatars/` | `services/avatar.ts` | 读 + 写 + 删，**二进制** | 3 |

调用方只有四处：模块本身是 `lib/vault.ts`（vault）、`services/capture.ts`（raw）、
`services/avatar.ts`（头像），使用者是 `services/documents.ts` 与
`services/vault-index.ts`。而 `services/export.ts` 从数据库导出、不读文件，
`lib/static.ts` 读的是前端构建产物——两者**都不属于**内容存储，不进接缝。

反推出的接缝只有 5 个方法：

```ts
interface StorageBackend {
  readonly id: string
  read(key: string): Promise<Uint8Array>       // 文本由调用方 decode
  write(key: string, data: string | Uint8Array): Promise<void>
  remove(key: string): Promise<void>
  move(from: string, to: string): Promise<void>
  list(prefix: string): Promise<string[]>      // 递归，返回全部 key
}
```

三件被这份清单**排除**的事，值得记下来免得日后被「顺手加上」：

- **不进 `stat` / mtime**：`readNote` 的时间来自 frontmatter，不用文件时间。
  S3 的 `LastModified` 因此不需要暴露。
- **不做预签名 URL**：见 10.5。
- **不做分块上传 / 流式**：单用户笔记在 KB 量级，PutObject 一次就够。

### 10.3 实测：三个会改变实现的差异

用一个自写的 S3 mock（校验 SigV4 结构 + 对预签名 URL **真算一遍签名**）实测，
脚本与结论如下。**注意 mock 不是真 S3**——见 10.7 的未验证清单。

#### （a）没有 `rename(2)`

本地 `moveNote` 是一次原子的 `rename(2)`；对象存储里改名 = **复制 + 删除**。

实测：`PUT` + `x-amz-copy-source` → 200，**请求体 0 字节**（正文不出服务端），
随后 `DELETE` → 204，原 key 再读 → 404。中文 key 也通过
（`copy-source` 要按段 URI 编码：`/bucket/notes/2026/09/%E7%BB%84%E4%BB%B6...md`）。

| | 本地 | S3 |
|---|---|---|
| 请求数 | 1 | 2 |
| 原子性 | 有 | **无** |
| 失败模式 | 要么成功要么没动 | 复制成功、删除失败 → **同一个 `id` 有两个文件** |

后者不是理论问题：`reindexVault` 用 `onConflictDoUpdate target: documents.id`，
两个同 id 的文件会互相覆盖，**哪一份胜出取决于扫描顺序**——一个不报错的静默错误。
缓解方向：复制在前删除在后（任何时刻都不会丢数据），并在重建索引时检测
「同一 id 多个路径」并报出来（现在不检测）。

#### （b）没有目录

`walkMarkdown` 现在用 `readdir` 递归。S3 只能用 LIST，且**每次最多 1000 个 key**。
两种列举策略实测（7 个文件、`max-keys=3` 强制翻页）：

| 策略 | 请求数 | 说明 |
|---|---|---|
| 递归列举（不带 `delimiter`，靠 `continuation-token` 翻页） | **3** | 一次前缀拿全部，必须翻页 |
| 逐层列举（`delimiter=/`） | 7 | 每个「目录层级」一次请求 |

**结论：用递归列举 + 翻页**，逐层在深层 vault 上会线性放大请求数。
两个后果：`list()` 必须处理 `IsTruncated` / `NextContinuationToken`；
`.trash` 的跳过逻辑要按**路径段**判断，不能只看末段。

#### （c）一致性**没问题**（唯一的好消息）

AWS 文档明确：PUT/DELETE 是强 read-after-write，单 key 覆盖是原子的
（「you will get either the old data or the new data, but never partial or corrupt data」）。
所以**铁律 2「先文件后数据库」仍然成立**，不需要为 S3 改写入顺序。

同一条文档也确认了跨 key 没有原子性（「There is no way to make atomic updates
across keys」）——这正是（a）的根因。

#### （d）中文 key 必须靠 `encoding-type=url`

`slugify` 保留汉字（`\p{L}`），所以 key 里真的有中文。实测 PUT / LIST 往返正常，
但 LIST 的响应是 XML，而 **XML 1.0 装不下某些字符**。AWS 文档给的解法就是
请求时带 `encoding-type=url`：非 ASCII 按 UTF-8 百分号编码。

附带好处：key 被百分号编码后，`<Key>` 里不再有需要反转义的实体，
提取响应的实现因此简单很多（见 10.4）。

### 10.4 客户端库：三个候选的实测对比

| | `aws4fetch` | `@aws-sdk/client-s3` | `minio` |
|---|---|---|---|
| 版本 | 1.0.20 | 3.1138.0 | 8.0.7 |
| 许可证 | MIT | Apache-2.0 | Apache-2.0 |
| 实测磁盘 | **76 KB** | 17 MB | 15 MB |
| 实测依赖目录数 | **1** | 26 | 34 |
| 传递依赖 | 无 | 26 个 `@smithy/*`、`@aws-sdk/*` | lodash、xml2js、async、through2… |
| 签名 | 自实现 SigV4 | SDK | SDK |
| XML 解析 | 无，要自己做 | 有 | 有 |
| 兼容性风险 | 无额外请求头 | ≥3.729.0 自动加 `x-amz-checksum-crc32`，**可用一行配置关掉**（§10.11） | 无 |
| 维护状态 | 884★，未归档，末次推送 2024-12 | 活跃 | 活跃 |

两条原本被认为决定性的：

- **SDK 的自动校验和是自建端点的已知雷。** AWS 文档确认 3.729.0 起「the SDK
  provides default integrity protections by automatically calculating a `CRC32`
  checksum for uploads」，而这个头不少 S3 兼容实现不认。实测 `aws4fetch`
  只发 4 个头，**没有任何 checksum 类头**。
  **但查了 LobeHub 的实现之后这一条不再是扣分项**：把
  `requestChecksumCalculation` 设成 `'WHEN_REQUIRED'` 即可关闭，是一行配置
  （§10.11 有源码与 PR 编号）。
- **SDK 的好处（凭证链、重试、分页器）在这里基本用不上**：单用户、一把静态密钥、
  没有 STS / IMDS / SSO。这一条仍然成立——但它是「收益有限」，不是「成本」。

**结论（已按 §10.11 的修正改写）：选 `@aws-sdk/client-s3`**，加上那一行配置。

17 MB 在服务端镜像里是零边际成本：它不会下发浏览器，容器镜像本来就有几百 MB，
而换来的是不用自己写 XML 解析与分页器，以及**将来要加预签名时不用换库**
（M2 的浏览器扩展如果要直传大文件，那一步是加方法而不是迁移）。

代价如实记：多 26 个传递依赖要跟着升级，以及 `pnpm minimumReleaseAge: 1440`
对 `@aws-sdk/*` 这种高频发版的家族会更常触发「锁到上一个版本」。

`aws4fetch` 的风险如实记下：**末次推送 2024-12，24 个 open issue，不是活跃维护**。
SigV4 本身是冻结的规范，对这个用途休眠可接受；但真出签名 bug 要我们自己修。

**修正（同一轮调研中查到 LobeHub 的用法后推翻）：**
原先这一节的结论偏向 `aws4fetch`，主要权重压在「SDK 自动加 `x-amz-checksum-crc32`，
自建端点不认」上。LobeHub 的证据表明**那个代价可以用一行配置关掉**，
所以结论改为 **`@aws-sdk/client-s3` 更合适**。理由与代价见 §10.11，
`aws4fetch` 保留为「只想省 17 MB 且不需要 presign」的备选。

### 10.5 与 D-036（头像）的冲突点：**不要**预签名

`aws4fetch` 支持预签名 URL，实测有效（GET 与 PUT 都能签，签名经 mock 重算验证），
所以「头像让浏览器直连，省掉服务端转发」是个很自然的想法。

**不做。** D-036 给头像定的性质是**私人资源**，并专门写了「为什么读取也要鉴权」：

> 头像是私人资源，不是公开静态文件。放到 `public/` 下由静态中间件伺服会让任何人
> 凭一个 id 就能看到——而这是个应该只有你一个人用的服务。

预签名 URL 在有效期内是**任何持 URL 者可用**的，且会落进浏览器历史、日志、Referer。
那等于把 D-036 专门否决的「凭 URL 可读」又请回来。**头像继续由服务端转发**。

但要区分清楚：这一条只否决「拿预签名当访问控制」。LobeHub 用预签名做的是
**上传路径**（浏览器直传、服务端不过手）与**下载/预览**（见 §10.11），
那是**吞吐与内存**问题，与「谁能看」无关。mimir 现在的上传量级用不到它，
所以 §10.11 的结论是「选 SDK 以便将来能加」，而不是「现在就加」。

### 10.6 它与另外四条接缝有一处本质不同

四条既有接缝都是**复数**的：多个 leg **一起**跑（融合），capturer / parser /
provider 按 URL / 输入类型 / 角色**各选一个**——但同一时刻可能不止一个在干活。

存储是**单数**的：任何时刻只有**一个**后端在用，其余是**备选**。
这个差异会漏进状态显示——`computeStatus` 会把两个后端都算成 `active`
（local 的 `requires` 是空的；S3 配好了也是空的），设置页于是显示
「两个存储后端都可用」，而实际只有一个是真相。

三个处理方式：

| 方案 | 评价 |
|---|---|
| 扩展 `PluginDeclaration.unavailable`，让它能读到**值**（不只「有没有配」）而不仅是 `isProvided` | **推荐**。`descriptors()` 已经把所有条目读出来了，把只读快照传进 `computeStatus` 是一个小改动；未选中的后端返回「当前未选中（正在用 local）」——正好是 `unavailable()` 的语义（代码在、配置齐、但干不了活）。需要守住它「同步且廉价」的现有约束 |
| 让未选中的也显示 `active`，把「用哪个」只交给 `storage.backend` 那一行 | 最小改动，可接受。插件页显示「都可用」在字面上不算错 |
| 不为存储用接缝机制，另写一套选择逻辑 | 不推荐。会丢掉「加一个后端＝加一个文件」与设置页的文件路径/状态展示，而那正是这次重构的成果（D-030） |

### 10.7 配置与落位

键（归新插件包声明，与 `plugins/provider/` 声明 `model.*` 是同一条归属规则），
新增设置页分区「存储」：

| 键 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `storage.backend` | string | `local` | `local` / `s3`。**唯一的选择点** |
| `storage.s3.endpoint` | string | `''` | MinIO 等自建端点。留空 = AWS 官方端点 |
| `storage.s3.region` | string | `us-east-1` | MinIO 也要一个非空值 |
| `storage.s3.bucket` | string | `''` | |
| `storage.s3.accessKeyId` | string | `''` | |
| `storage.s3.secretAccessKey` | **secret** | `''` | 走既有加密落库路径，绝不下发 |
| `storage.s3.pathStyle` | boolean | `true` | 自建端点必须路径风格；虚拟主机风格在 MinIO 上常解析不到 |
| `storage.s3.prefix` | string | `mimir` | 桶内前缀，便于与别人共用桶 |

桶内布局（**用命名空间前缀，不是三个桶**）：

```
<prefix>/vault/2026/09/标题-a1b2c3d4.md
<prefix>/vault/.trash/<时间戳>-标题-a1b2c3d4.md
<prefix>/raw/<hash>/index.html
<prefix>/avatars/<userId>.webp
```

三个前缀对应现有的三个目录，于是「头像不进 vault 的扫描与导出范围」
（D-036 的第 3 条约定）在 S3 上**由前缀继续保证**，不需要新机制。

`VAULT_DIR` / `RAW_DIR` / `AVATARS_DIR` **保留为环境变量**，含义收窄为
「local 后端的参数」——它们本来就是部署事实（TECH §7.5 的配置分层），
不因为多了一个后端而变成界面可写的键。

**推荐加一个显式「测试连接」**（写一个 key → 读回 → 删掉），理由与
TECH §7.8 拒绝自动探测完全相同：存储配错会在最坏的时刻才暴露，而探测必须是
用户点的那一下。它放在 `storage` 接缝上是可选的 `probe?()`。

### 10.8 未被推翻的那条代价：S3 上不再是「可以直接用 Typora 打开的文件」

这是本次调研里**最该被单独记下**的一条，因为它损失的是一个头条性质。

`lib/vault.ts` 的注释写着 vault 文件「可以直接用 Typora / Obsidian / VS Code 打开，
也可以直接 git 版本管理」，而 TECH §8.5 的备份方案是「`data/` 目录 + `pg_dump`」。

选 S3 之后，对一个具体部署而言：

| 性质 | 本地 | S3 |
|---|---|---|
| 用本地编辑器打开 vault | 可以 | **不可以** |
| 对 vault 做 git 版本管理 | 可以 | **不可以**（除非同步到本地） |
| `data/` 直接打包备份 | 可以 | 需要从桶里拉 |
| 「文件是真相、数据库可重建」 | 成立 | **仍然成立**（真相在桶里，不在库里） |

前两行是真实损失，第三行是操作方式变化，第四行**不变**——这是关键：
铁律 2 与「重建索引」的价值没有减少，减少的是「用别的工具直接看这些文件」的便利。

所以这不是「S3 更差」，而是**两种部署各有各的合理**：本地部署保住编辑器和 git；
远程部署（VPS / NAS）本来就没有这些，换来的是数据落在有冗余的对象存储上。
要如实写进文档的是：**它是一次取舍，不是一个纯增益**。

### 10.9 未验证 / 实现时必须确认的

按 INDEX「区分「确定的」和「未验证的」」这条规则列出：

1. **未对真实 S3 或真实 MinIO 跑过一次。** 本次全部实测都在自写 mock 上；
   mock 对头部签名只做结构校验（scope / SignedHeaders / body 哈希），对预签名
   URL 才完整重算。真机验证待实现时补，重点核对：`x-amz-copy-source` 的编码、
   `encoding-type=url` 的返回、MinIO 对 `x-amz-content-sha256` 的接受度。
2. **未测大桶**：翻页在 >1000 个对象时的行为、`list()` 的内存占用
   （一次性收起全部 key）未验证。若 vault 到万级，需要流式或分批。
3. **未测量网络延迟**。每次读文档都会多一次往返；本地约 0.1 ms，MinIO 同机
   约 1–10 ms，跨区 AWS 可能 50–200 ms。自托管单用户下可接受，但
   `reindexVault` 会变成 N 次 GET（1000 篇 = 1000 请求），**需要并发上限**。
4. **测试隔离未设计**。`test/global-setup.ts` 现在清 `TEST_ENV` 里的三个目录；
   加了 S3 之后必须防止测试写进真实桶——需要与
   `if (!TEST_DATABASE_URL.includes('mimir_test')) throw` 同性质的守卫。
   LobeHub 的做法是 `s3rver`（假 S3 服务，在它 `devDependencies` 里，实测 3.7.1），
   方向可参考：**测试打一个本地假端点，而不是打真桶再想办法清理**。
5. **`buildNotePath` 现在用 `path.join`**，在 Windows 上会产生 `\`。key 必须是
   POSIX 的 `/`，路径构造要改成显式 `/`，由 local 实现在自己的边界上转换。

### 10.10 顺带发现的一处现存缺陷：生产环境头像不落盘

调研「三个目录分别由谁负责」时发现的，与 S3 无关，**在当前代码上就成立**：

`env.ts` 用同一套规则解析三个目录：

```ts
vaultDir:   resolvePath(process.env.VAULT_DIR   ?? './data/vault'),
rawDir:     resolvePath(process.env.RAW_DIR     ?? './data/raw'),
avatarsDir: resolvePath(process.env.AVATARS_DIR ?? './data/avatars'),
```

而部署配置里只有两个被显式指定：

| 位置 | `VAULT_DIR` | `RAW_DIR` | `AVATARS_DIR` |
|---|---|---|---|
| `.env.example` | ✓ | ✓ | ✓（本地开发，相对仓库根解析，正确） |
| `Dockerfile` ENV | ✓ `/data/vault` | ✓ `/data/raw` | **缺** |
| `docker-compose.yml` | ✓ | ✓ | **缺** |

于是在容器里 `avatarsDir` 走默认值，解析成 `cwd + /data/avatars`。
容器的 `WORKDIR` 是 `/app`，而 `findRepoRoot` 在镜像里找不到 `pnpm-workspace.yaml`、
按设计回落到 `process.cwd()`（这条回落在 `env.ts` 里有注释，本身是对的），
所以最终是 **`/app/data/avatars`——不在挂载的 `/data` 卷上**。

后果：上传与显示都正常（`RUN chown -R mimir:mimir /data /app` 让它可写，
`mkdir recursive` 也能建出来），但文件落在容器可写层，
**`docker compose --profile prod up -d --build` 之后头像消失**。不报错，
与 D-037 记的那类「看界面以为没问题」是同一族。

它同时与两处既有说法矛盾：Dockerfile 注释写着「vault 与 raw 是真相，必须持久化到
宿主机」，而头像是用户数据；`docs/TECH.md` §12.6 说的是 `data/avatars/`。

**修法有两个，需要选一个**（本条目只记录，不动手）：

1. 部署配置补齐（Dockerfile ENV 与 compose 各加一行 `AVATARS_DIR=/data/avatars`，
   `RUN mkdir` 一起建）——最小改动，与另两个目录对称。
2. 让 `avatarsDir` 从 `DATA_DIR` 派生而不是各自独立默认——三个目录本来就都在
   `DATA_DIR` 下，独立默认是这次不一致的来源。

推荐第 2 种并保留环境变量覆盖：它消掉的是「新增第四个存储目录时又要记得在
两个部署文件里各加一行」这个**会复发**的问题，而不只是修掉这一次。

---

### 10.11 参照实现：LobeHub 的 S3 集成（它推翻了 §10.4 的一个结论）

调研方法：读 `lobehub/lobehub`（canary 分支）的 `package.json`、
`apps/server/src/modules/S3/index.ts`、`apps/server/src/services/file/impls/s3.ts`
与 `docs/self-hosting/environment-variables/s3.mdx`。证据都在文件里，可复核。

#### 它的规模与它选了什么

LobeHub 不只是「用了 AWS SDK」，它围绕 S3 建了**四个互相独立的配置命名空间**
（`.env.example.development` 里各自一组键）：

| 命名空间 | 用途 |
|---|---|
| `S3_*` | 文件上传与预览的**运行时**路径（服务端读写、预签名 URL） |
| `S3_INTERNAL_ENDPOINT` | **同一份桶的第二个地址**：容器内走服务名，浏览器走公网域名 |
| `DOC_S3_*` | 文档解析用的独立桶 |
| `ASSET_S3_*` / `MOBILE_S3_*` | 静态资源 CDN（Cloudflare R2），构建期用 |

依赖上是 `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`（canary 锁定 `~3.932.0`），
测试用 `s3rver` 起假服务。

#### 它怎么处理 checksum 这个雷：`requestChecksumCalculation: 'WHEN_REQUIRED'`

这是我原先漏掉的关键一行。`apps/server/src/modules/S3/index.ts` 里：

```ts
new S3Client({
  credentials: { accessKeyId, secretAccessKey },
  endpoint: clientEndpoint,
  forcePathStyle: options?.forcePathStyle,
  region: options?.region || DEFAULT_S3_REGION,
  // refs: https://github.com/lobehub/lobe-chat/pull/5479
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});
```

顺着那个注释查 PR 5479（2025-01-17 合入），标题就是结论：

> 🐛 fix: **temporarily disable S3 client integrity check for Cloudflare R2**
>
> The latest version of `@aws-sdk/client-s3` introduced a default integrity check
> for all requests, which is incompatible with **Cloudflare R2**.

它引用的上游 issue **`aws/aws-sdk-js-v3#6810`「Announcement: S3 default integrity
change」至今仍是 open**（2025-01 创建，15 条评论，无关闭时间）——说明 AWS 没有回退
这个行为，这一行配置是长期方案而不是临时补丁。

**所以 §10.4 的加权是错的**：我把「17 MB + 一个已知兼容性坑」当成 SDK 的两项扣分，
但第二项其实是**一行配置**。LobeHub 这样规模的项目带着这个坑用了很久，
说明它是可控成本，不是否决理由。

#### 它用预签名 URL 做的两件事（都不是访问控制）

| 方法 | 用途 |
|---|---|
| `createPreSignedUpload` / `createPreSignedUploadPartUrl` | **浏览器直传**，服务端不过手文件字节 |
| `createPreSignedUrlForPreview` / `ForDownload` | 预览与下载（带 `ResponseContentDisposition` 设文件名） |

值得注意它为此把客户端拆成两个：

```ts
/** Sends requests from this server, through the internal endpoint when one is set. */
private readonly client: S3Client;
/** Signs URLs that browsers and model providers open, so it keeps the public endpoint. */
private readonly presignClient: S3Client;
```

**这解释了为什么 §10.7 的键表里没有 `internalEndpoint`**（LobeHub 有这个键）：
预签名 URL 的签名绑定 Host，所以「服务端走内网地址、浏览器走公网地址」
必须两套客户端、两个端点键。mimir 不做预签名，只需要一个 `endpoint`。

#### 对照：哪些适用、哪些不适用

| LobeHub 的做法 | mimir 是否采用 | 原因 |
|---|---|---|
| `requestChecksumCalculation: 'WHEN_REQUIRED'` | **采用** | 零成本消掉一个已知坑，见上 |
| `forcePathStyle` 选项 | **采用** | 自建端点必需，与我实测一致 |
| 用官方 SDK 而非自写签名 | **采用（改判）** | 见 §10.4 的修正 |
| `S3_INTERNAL_ENDPOINT` 双端点 | 不做 | 它需要它是因为浏览器直传要走公网地址；mimir 全部服务端操作，一个地址够 |
| 预签名上传（浏览器直传） | 不做（保留可能） | mimir 的上传量级：512 KB 头像 + M2 的 PDF/Word 上传，走服务端足够。**但接缝上要留出这个可能** |
| 多套配置命名空间 | 不做 | 它的四套是因为四类文件（用户文件/文档/CDN/移动端资源）生命周期完全不同。mimir 的三个命名空间前缀（§10.7）已经够 |
| 用 `s3rver` 做测试 | 待定 | 见 §10.9 第 4 条：mimir 的测试隔离还没设计 |

#### 结论：`@aws-sdk/client-s3` + `presigner`

改动三处文档结论：

1. **§10.4 的客户端推荐反转**为官方 SDK。17 MB 在服务端镜像里是零边际成本，
   换来不用自己维护 XML 解析、分页器与将来的预签名。
2. **§10.5 收窄**为「预签名不作访问控制」，而不是「不做预签名」。
3. **§10.2 的接缝保持 5 个方法**——但这是「现在不做」，不是「永远不做」：
   若 M2 的浏览器扩展要直传大文件，切到预签名是**加一个方法**，不是重写。

`aws4fetch` 不删掉，降为备选：**76 KB 对 17 MB 在服务端没意义，但它的
「不多发一个头」在自建端点上确实更省心**。若实现时发现某个自建 S3
不认 `WHEN_REQUIRED` 这个参数（旧版本 SDK 或非官方实现），它就是退路。

---

## 11. 双数据库后端：SQLite（本地开发 / 桌面端）+ Postgres（服务器）

> 2026-09 调研。背景：本地开发被「必须先起 Docker 里的 Postgres」卡住
>（实测新克隆环境在数据目录与数据库双双缺席时，服务端对每个请求返回 HTML
> 错误页，前端表现为 `Unexpected token '<' … is not valid JSON`）；
> 桌面端（PRD 未承诺、但方向已明确）更需要一个无服务的本地库。
> 用户决策：**云端生产继续用 Postgres**。决策记录见 `DECISIONS.md` D-045。

### 11.1 驱动选型

| 候选 | 结论 | 理由 |
|---|---|---|
| `better-sqlite3` | **采纳** | Node 生态最成熟的 SQLite 绑定；预编译二进制覆盖 darwin / linux / win32，正常安装不触发 node-gyp；**FTS5、JSON1、窗口函数默认编进分发的 SQLite**；drizzle-orm 一等支持（`drizzle-orm/better-sqlite3`）；桌面端有成熟的 `@electron/rebuild` 重编译路径。同步 API 在单用户服务端不是问题：个人库的查询都在毫秒级 |
| `@libsql/client`（libsql） | 备选 | Turso 维护的 SQLite fork，**自带向量函数**（`vector_distance_cos` / `vector_top_k`），可省掉 sqlite-vec 的扩展加载。不采纳的原因：整库绑在一个公司维护的 fork 上，FTS5 行为与主线 SQLite 存在分叉风险；本地文件模式虽好，better-sqlite3 已覆盖。若 M1-B 实现时想省掉扩展加载，再评估 |
| `node:sqlite`（Node 内置） | 不采纳（现阶段） | Node 22.x 里仍是实验性（flag / 警告），API 面窄，加载第三方扩展（FTS 之外、以及将来的 sqlite-vec）的路径不成熟。等稳定后可降掉一个原生依赖 |

### 11.2 FTS5 与中文：原否决理由的回应

`TECH.md` §1 否决 SQLite 的第一个理由是「FTS5 没有中文分词」。**成立，但不再是障碍**：
mimir 的中文分词从来不在数据库里做——jieba 在**应用侧**切词、空格连接后写入
`search_text`（§5、TECH §4.4），这条设计当初就是为了绕开 Postgres `simple` 配置
没有词边界的缺陷（§5.3 的反证实测）。FTS5 的 `unicode61` 分词器按空白与标点切词，
对「已经切好词」的文本恰好正确：

```
search_text = "组件 性能 优化 react"     ← jieba 写入侧已切好
FTS5 unicode61 切出的词元 = {组件, 性能, 优化, react}   ← 与 jieba 词元一一对应
```

查询侧同样先过 `queryTokens()` 再逐词构造 MATCH，中文质量由 jieba 决定，
**与 PG 路径完全同源**——两条路径共享同一份分词包与同一列数据。

排序函数的差异：PG 用 `ts_rank_cd`（cover density），SQLite 用 `bm25()`。
混合模式走 RRF 融合（§4.2），**RRF 只看名次不看分数**，分布差异被天然吸收；
keyword 单通道模式下分数含义有差异（一个 0~1、一个负对数似然），可接受，
不为此做分数归一化。

FTS5 表的设计取舍：**standalone 虚拟表 + 触发器**，不用 external content——
external content 要求 FTS5 的整数 rowid 与业务表主键对齐，而 mimir 的主键是
应用生成的 nanoid（text），做映射是多余的间接层。触发器挂在 `documents` 的
INSERT / UPDATE(OF search_text) / DELETE 上，所有写入路径（笔记保存、抓取、
上传、重建索引）自动被覆盖，没有「某个写入点忘了同步索引」的静默缺口；
`pnpm db:reindex` 做全量重建兜底。

### 11.3 向量检索：sqlite-vec vs pgvector（M1-B 蓝图，本轮不实现）

第二个否决理由「sqlite-vec 是纯暴力检索」**属实**，量化对比：

| 项 | pgvector HNSW（§6.2 实测） | sqlite-vec 暴力扫描 |
|---|---|---|
| 5000 向量 top-10 | 0.084 ms | 同量级（扫描 5000×1024 维 ≈ 5×10⁶ 乘加，亚毫秒） |
| 10 万 chunk × 1024 维 | ~0.1 ms | ≈ 10⁸ 乘加，C 实现 SIMD 下 **毫秒~几十毫秒级** |
| 100 万 chunk | ~1 ms | 数百毫秒，开始影响交互 |

个人知识库的 chunk 量级是 1–10 万（≈ 1000–10000 篇文档），暴力扫描的绝对
延迟完全可接受；百万级才需要重新评估——那时触发的是 D-024/D-031 既有逃生舱
（把 Postgres 请回来做向量库），而不是现在为一个不存在的规模付钱。

M1-B 的双后端蓝图（写在 §4.5/§4.8，本轮只做设计）：

- **PG 侧**：维持 §4.8 的 `halfvec` HNSW + 按维度分区的 partial index 设计，不变
- **SQLite 侧**：`vec0` 虚拟表（`embedding float[1024]` + 维度元数据列），
  KNN 查询 `WHERE embedding MATCH :query AND k = :n`；sqlite-vec 是 MIT 许可，
  npm 分发平台预编译的 loadable extension，`better-sqlite3.loadExtension()` 加载
- 两条侧实现为**同一个 vector leg 的两个方言模块**——与 keyword/substring
  通道同一组织方式

### 11.4 并发、可靠性与运维

- **WAL 模式**：单写多读。mimir 是单 Node 进程 + 单用户，better-sqlite3 的
  同步 API 让写天然串行，不存在写竞争；drizzle-studio 之类的旁路读者不阻塞写。
- **必须显式打开的 PRAGMA**：`foreign_keys=ON`（**SQLite 默认关闭**——不开的话
  所有 `onDelete: 'cascade'` 静默失效，删会话留下孤儿消息）、`busy_timeout=5000`、
  `synchronous=NORMAL`（WAL 下安全且快）。与 PG 的差异记入 TECH §10。
- **原生模块与 pnpm**：pnpm 12 默认阻止依赖执行安装脚本，`allowBuilds` 需要显式
  放行 `better-sqlite3`（此前记录为 `false`，正是为了这一天的显式决策）。
- **备份**：`data/mimir.db` 随 `data/` 一起拷贝（或 `VACUUM INTO` 热备），
  与「数据库是可重建的索引」的定位一致——丢了也能从文件全量重建。

### 11.5 结论

- **服务器**：Postgres 17 + pgvector 不变。D-031 的 SQL 方言论证在服务器路径上
  全部继续成立，pgvector 的 HNSW 与表达式索引仍是最优解。
- **本地开发 / 桌面端**：SQLite。`DATABASE_URL` 协议头判定驱动
  （`postgres://` → PG，`file:`/路径 → SQLite），**未设置时默认 SQLite**——
  新克隆环境 `pnpm install && pnpm dev` 即跑，零 Docker。
- **方言分支收敛在五处**（keyword、substring 两个通道按方言分支；
  摘要切片与用量聚合统一成 JS；时间默认值参数化），其余代码双端共用。
  这是有意控制的代价，不是通用存储引擎接口——见 D-045。

---

## 12. 桌面端调研：Electron 载体 + 私有宿主（2026-09）

> 决策见 `DECISIONS.md` D-046；分层依据是 deepseek-harness 的架构文档
> （私有 Desktop Host + carrier + 本地端口 19387）。本节记录工具链选型
> 与实测踩到的坑。

### 12.1 工具链版本快照

| 包 | 版本 | 说明 |
|---|---|---|
| electron | 44.4.5 | 主进程 Node 模式；ESM/CJS 双支持，本项目产物取 CJS（preload 沙箱只认 CJS） |
| electron-builder | 26.15.3 | dmg 打包；`identity: null` 时完全跳过签名（见 §12.3 的后果） |
| @electron/rebuild | 4.2.0 | **最终没用上**——better-sqlite3 v13 起自带 N-API 预编译（见 §12.2） |

### 12.2 原生模块

| 模块 | 结论 |
|---|---|
| better-sqlite3 | **v13 起在 npm 包内自带 N-API 预编译**（`prebuilds/darwin-x64.node` 等，跨 Node/Electron 通用），安装脚本的 `node-gyp rebuild` 只是无预编译平台的兜底。实测同一份 v13.0.3 在 Node 24 与 Electron 44 中直接加载成功，无需 electron-rebuild。注意 npmmirror 镜像上 v12.12.0 缺失（ERR_PNPM_NO_MATCHING_VERSION），v13 起正常 |
| @node-rs/jieba | 标准 N-API 预编译（linux-x64-gnu/musl、darwin 等），Electron 直接可用 |

### 12.3 实测踩到的三个坑（全部「静默」类）

1. **`process.env` 被构建器替换**：桌面主进程若用普通（浏览器向）vite
   构建，`process.env.X = ...` 会被静态替换成 `({}).X = ...`——宿主注入的
   端口/数据目录/密钥全部静默失效，回落到 `.env` 的值。症状与「配置没生效」
   一模一样。解法：`build.ssr: true`（与服务端同一形态），产物保留 process.env
2. **extraResources 丢点目录**：electron-builder 拷贝资源时跳过点开头的
   目录，`dist/node_modules/.pnpm`（vite SSR 构建把部分传递依赖按 pnpm
   结构放在这里）静默丢失，运行时报 `Cannot find module …/.pnpm/fflate/…`。
   解法：afterPack 钩子用 `fs.cp`（保留符号链接布局）自行拷贝
3. **未签名二进制被 SIGKILL**：`identity: null` 时 builder 完全跳过签名，
   macOS（Sequoia 起，含 Intel）把未签名二进制直接杀掉——秒退、零输出、
   无崩溃报告（比前两条更难查）。解法：afterPack 里
   `codesign --force --deep -s -`（ad-hoc，仅本机执行合法，不能分发）

另有一条**类型层**的：TypeScript 7（Go 重写版）对「泛型函数作为工厂参数、
返回大对象字面量」的写法会丢失方法返回类型推理（调用方全部退化成
unknown）——api 客户端因此采用「单例 + 模块级传输配置」而不是工厂
（D-046）。

### 12.4 安全结论

- 宿主只绑 `127.0.0.1` + 每次启动的随机端口
- 鉴权沿用 better-auth 的 `SameSite=Lax` cookie：外部网站的跨站 POST
  拿不到 cookie；DNS rebinding 后的请求同样过不了 `requireAuth`
  （绑定到 127.0.0.1 的 Host 才有对应 cookie）
- Electron `contextIsolation + sandbox`，preload 只暴露只读 boot 信息与退出
- 单实例锁避免双窗口并发写同一个 SQLite

### 12.5 验证记录（2026-09-25）

- `pnpm desktop:start`（进程内宿主 + 构建产物）：注册 → 建笔记 →
  搜「组件」双通道命中 → 杀进程重启 → 登录态与数据保留
  （数据在 `~/Library/Application Support/mimir/data`，含
  `auth-secret`/`mimir.db`/WAL）
- `pnpm desktop:build` 产出 dmg（460MB，x64，ad-hoc 签名）；安装到
  `~/Applications` 后启动：宿主起、登录、搜索「组件」命中——与
  desktop:start 行为一致

---

## 13. Office 预览与编辑：方案调研（2026-09）

> 决策见 `DECISIONS.md` D-049；落地设计见 `TECH.md` §15。
> 结论先行：**没有第二个同时满足「真编辑 + 无独立服务 + 许可宽松」的方案**。

### 13.1 自托管项目实际怎么做（20 个项目的普查）

| 做法 | 项目 | 代价 |
|---|---|---|
| **连接器 + 外部文档服务器** | Nextcloud、ownCloud、Seafile、HumHub、Mattermost、Alfresco、Nuxeo、GroupOffice | 独立服务，ONLYOFFICE/Euro-Office 要 **4 GB RAM + 10–40 GB 磁盘** |
| 内置 AppImage 版 Collabora（仅 Nextcloud） | `richdocumentscode` | 免独立容器，但 2 核 + **1 GB + 100 MB/用户** + 300 MB 磁盘 |
| **LibreOffice 装进自己容器、只转 PDF** | Stirling-PDF、Mayan EDMS、Docspell、Paperless-ngx（Gotenberg） | 只解决「看」，不解决「改」；吃内存，要管 UNO 进程池 |
| 什么都不做 | Outline（docx 只用 mammoth **导入**）、BookStack、Wiki.js、Docmost、GitLab、Gitea/Forgejo | 附件只有上传下载 |
| **客户端编辑器 + WASM 转换，无服务** | CryptPad（唯一） | ~580 MB 静态资源、`x2t.wasm` 堆下限 283 MB、AGPL §7 要求界面署名 |

**读法**：主流那条路（挂文档服务器）买的主要是**多人协同**——Nextcloud 之
所以要 4 GB RAM，是为实时协同 + 锁 + 版本。**单用户应用付这笔钱买到的核心
能力是零**，这是本项目不走那条路的根本原因（不是「装不下」，是「买错了东西」）。

### 13.2 纯前端库的能力边界

| 库 | 能力 | 许可 | 谁在用 |
|---|---|---|---|
| `docx-preview` | 只读渲染（无实时分页、不支持 TOC 域） | Apache-2.0 | Open WebUI、LobeChat、Onyx、Teable |
| `mammoth` | docx→HTML（语义化，**不保版式**） | BSD-2 | Outline、AFFiNE（都是**导入**用） |
| `dolanmiu/docx` | 生成 + **按占位符打补丁**（`patchDocument`），不能任意编辑 | MIT | 3.99M 下载/周 |
| `exceljs` | xlsx 读写（数据+样式，不是版式） | MIT | — |
| **Univer** | 自绘编辑，但 **import/export 是付费项**（要 conversion backend） | Apache-2.0 核心 | TriliumNext |
| **SuperDoc** | **OOXML 原生编辑、无需服务器** | AGPL-3.0 或 $499 | Harbour |
| eigenpal/docx-editor | 核心 Apache-2.0，但**有用部分（修订/批注/API）是仅评估许可** | 混合 | — |
| **GenOffice `docx-engine`** | 补丁式保真编辑（未改动的 zip 条目逐字节保留） | **Apache-2.0** | 自有桌面应用 |

两条重要观察：

1. **SuperDoc 的演进本身就是证据**：它的 V2 从 ProseMirror 换成 OOXML 原生
   模型，官方理由是「编辑直接写回 XML，不经 HTML 转换」。ProseMirror/HTML
   这一路撑不住 docx 往返。
2. **Univer 划出了市场的真实边界**：连拿了融资的它都把「浏览器里画出来」
   （画布，开源）和「文件读写得回来」（import/export，付费+后端）分成两笔生意。

### 13.3 WASM LibreOffice

- **ZetaOffice / ZetaJS**（allotropia，非 Collabora）：完整 LibreOffice 编译到
  WASM + Qt 画布，UNO API 驱动。**实测下载量 52 MB**（wasm 36.3 + data 15.9 + js 0.86）。
  包装层 MIT、LibreOffice 本体 MPL-2.0，但**维护的构建与 CDN 是商业产品**
  （官网 FAQ：付费包含 CDN 与支持，服务处于 open beta）。嵌入方为 CIB、EPC 等。
- 上游 **LOWA**（`LibreOffice/core:static/README.wasm.md`）：Writer-only 构建，
  自述「有未实现的位、可能漏内存，改进空间很大」——**是条自己构建的路，不是产品**。
- **没有官方 WASM ONLYOFFICE**（`org:ONLYOFFICE` 下零个 wasm 仓库）。但社区
  把它的转换器 `x2t` 编成了 WASM（`cryptpad/onlyoffice-x2t-wasm`，release 15.79 MB），
  被 `ranuts/document`、`baotlake/office-website` 等复用。

### 13.4 结论

对**单用户自托管**而言：编辑只有两条现实路径——挂一个 4 GB 级的文档服务器
（买不到对应价值），或者用 Apache-2.0 的补丁式引擎自己接（本项目选的）。
预览则可以轻量得多（`docx-preview` 74 KB，或 LibreOffice 转 PDF 保真但重）。

---

## 14. 多端同构调研：桌面端如何复用服务端（2025-01）

> 决策记录见 `docs/DECISIONS.md` D-102；本节为技术调研证据。

### 14.1 调研方法

用户质疑 mimir 桌面端当前形态（动态 import 服务端构建产物 + env 注入）不优雅，要求调研其他产品如何做多端代码复用。

**网络约束**：GitHub 直连不可用（443 端口连接超时），经本地代理（mihomo，127.0.0.1:7890）克隆仓库或用 jsdelivr CDN 读源码（`https://cdn.jsdelivr.net/gh/OWNER/REPO@BRANCH/PATH`）。

**覆盖范围**：15 个开源产品，按形态分类：
- **宿主内嵌型**（桌面端包含后端进程）：deepseek-harness、Trilium、Actual、anything-llm、khoj、n8n-desktop
- **本地优先型**（存储在客户端）：AFFiNE、SiYuan、Joplin、StandardNotes、Logseq
- **共享核心库型**：Joplin、StandardNotes、Karakeep
- **薄壳与分层型**：element-desktop、Bitwarden、VS Code

每个仓库核实：① 端的划分（桌面/web/服务端目录）② 桌面端从哪拿后端（子进程/主进程内/远端）③ 代码复用机制（workspace 包/构建产物/源码打包）④ 平台差异接缝（条件导出/DI/适配器）⑤ 打包形态（带文件路径证据）。

### 14.2 关键发现

**没有一家"桌面端源码级复用服务端"**——要么没有服务端（AFFiNE、Joplin、Logseq 的存储逻辑在客户端），要么服务端是独立交付物（SiYuan 用 Go 子进程、n8n 依赖已发布的 npm 包）。

与 mimir 最接近的是 **Trilium**（主进程内跑完整 server + better-sqlite3）：
- 主进程直接 `import` 服务端源码（`@triliumnext/server/src/*`，两个 monorepo package）
- 用 `initializeCore({ dbProvider, crypto, platform, messaging, ... })` 注入 providers（`apps/desktop/src/main.ts:241-291`）
- 自造 `trilium-app://` 协议（`apps/desktop/src/protocol.ts`，700 行桥接层：mock socket、header 剥离、SSE flushHeaders 补丁），**不绑端口**
- drizzle 迁移目录与 web dist 的推导依赖 `import.meta.url`（与 mimir 同型）

### 14.3 逐产品证据（表格）

| 产品 | 桌面端从哪拿后端 | 平台差异接缝 | 端口与鉴权 | 证据文件 |
|---|---|---|---|---|
| **Trilium** | 主进程内 import server 源码 | 构造注入 providers + `trilium-app://` | 无端口（协议桥接） | `apps/desktop/src/main.ts:241`、`protocol.ts:63` |
| **Actual** | `utilityProcess.fork` 子进程 | `imports` 条件导出（`#platform/server/sqlite` 的 electron/api/default） | 子进程 IPC | `packages/loot-core/package.json` exports、`packages/desktop-electron/src/main.ts` |
| **dsh** | Electron RunAsNode 子进程跑 profile runner | 插件树 profile patch 层 | 随机端口 + cookie | `apps/desktop/src/host-process.ts:58`、`README.md` |
| **AFFiNE** | 无服务端进程；存储经 nbstore RPC（worker） | `bootstrap/{browser,electron}` + sqlite vs idb | 无 | `packages/frontend/apps/electron-renderer/src/app/setup.ts:11`、`packages/common/nbstore/` |
| **SiYuan** | spawn Go kernel 子进程 | 编译期 ifdef（`/// #if BROWSER`，694 处） | 固定 6806 | `app/src/boot/globalEvent.ts`、`kernel/` |
| **n8n-desktop** | spawn `n8n` npm 包 | 无（依赖已发布包） | 固定 5679 + 随机 Basic Auth | `main/n8n.ts:30`、`README.md` |
| **anything-llm** | 打包进去的 backend（整仓 copy） | 整仓代码 copy 进 wrapper | 3001 + Bearer | 未开源（README 描述） |
| **khoj** | 纯壳，连远端或用户自托管 | 无 | 用户手填 Key | `package.json` dependencies 无 server |
| **Joplin** | 无服务端；本地 SQLite | 单例 shim 启动期注入 | 无 | `packages/lib/shim.ts`、`packages/app-desktop/` |
| **StandardNotes** | 无服务端；desktop/mobile 跑 web 构建产物 | DI 容器 `DeviceInterface` | 无 | `packages/snjs/` DI、`packages/web/` |
| **Logseq** | 无服务端；`Fs` protocol | `worker/platform` 适配器，启动时 `validate-platform!` 校验 | 无 | `src/main/frontend/fs.cljs:19`、`worker/platform.cljs` |
| **element-desktop** | 构建期下载 element-web release 打进 asar | web 侧探测 `window.electron` | 远端 homeserver | `scripts/fetch-package.ts`、`electron-main.ts:481` |
| **VS Code** | Electron 主进程 + utilityProcess | `common`/`browser`/`electron-browser` 分层 + `layersChecker` | IPC | `src/vs/platform/`、入口横幅注释 |
| **Bitwarden** | 主进程 + napi + Rust 代理子进程 | libs 抽象 + Angular DI 两套实现 | IPC | `libs/common/`、`apps/desktop/` |
| **Karakeep** | 无桌面端（移动端共享 `packages/shared` 纯函数） | 分层隔离 | 无 | `packages/shared/` |

### 14.4 分类轴总结

按**谁提供后端**分类：
- **内嵌完整服务端**：Trilium（主进程内 import）、dsh（子进程 profile runner）、Actual（子进程 utilityProcess）、anything-llm（打包）
- **子进程但不是 Node**：SiYuan（Go kernel）、n8n（spawn npm 包）
- **无服务端进程**：AFFiNE、Joplin、StandardNotes、Logseq（存储在客户端，Web/SQLite/IndexedDB）
- **纯壳**：khoj、element-desktop（连远端）

按**平台差异接缝**分类：
- **构造注入**：Trilium（`initializeCore` providers）、Bitwarden（DI 容器）、StandardNotes（`DeviceInterface`）
- **条件导出**：Actual（`imports` 字段的 `#platform/*`）
- **编译期 ifdef**：SiYuan（`/// #if BROWSER`）
- **适配器 + 启动校验**：Logseq（`worker/platform.cljs` 的 `validate-platform!`）
- **插件树 patch**：dsh（Cordis profile）
- **bootstrap 分支**：AFFiNE（`bootstrap/browser` vs `bootstrap/electron`）

### 14.5 结论

1. **mimir 的路线不是孤例**：Trilium 几乎同构（主进程内 import server、better-sqlite3）；dsh 与 Actual 用子进程但仍是路径依赖。
2. **没人抽核心包让两个宿主共用**：原因是 ① workspace 包以源码发布时，原生模块的 node_modules 解析会冲突 ② `import.meta.url` 推导依赖文件深度，抽包会破掉。
3. **"去端口改协议"代价高**：Trilium 的 `protocol.ts` 有 700 行桥接层，且卡在 cookie 会话（非 http scheme 无先例）、媒体 Range、SSE 三处。
4. **真正要补的是守卫与类型约束**：产物缺失、类型悬空、顺序约束都能被守卫拦住（改动 < 150 行），而抽包/改协议/惰性初始化的改动量都是 300-600 行且引入新复杂度。
