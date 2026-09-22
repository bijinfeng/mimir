# mimir

自托管的个人知识库：写 Markdown 笔记、收集外部资料、带引用地问 AI。

单用户，部署在自己的服务器上。

---

## 文档

**如果你是 AI agent，先读 [`AGENTS.md`](AGENTS.md)** —— 那里有铁律与完成定义。

| 文档 | 内容 | 什么时候看 |
|---|---|---|
| [`AGENTS.md`](AGENTS.md) | agent 入口：铁律、完成定义、会静默出错的地方 | 动手之前 |
| [`docs/INDEX.md`](docs/INDEX.md) | 文档索引，按问题找 | 不知道看哪份时 |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | 决策日志，含被否决的选项与原因 | 想问「为什么这样选」 |
| [`docs/PRD.md`](docs/PRD.md) | 产品需求：非目标、核心洞见、内容来源方案、功能范围、关键交互决策 | 想知道「为什么长这样」 |
| [`docs/TECH.md`](docs/TECH.md) | 技术方案：选型、架构、数据模型、检索设计、插件接缝、部署 | 要动手改代码 |
| [`docs/RESEARCH.md`](docs/RESEARCH.md) | 调研记录：竞品分析、实测数据、被否决的方案及理由 | 想问「为什么不用 X」 |
| [`output/`](output/) | 交互原型：单文件静态页，双击打开，无构建无依赖 | 想看界面长什么样 |

---

## 当前状态

| | 状态 |
|---|---|
| 设计 | 已定稿。布局、编辑器、导航结构、AI 入口、失败路径全部确定 |
| 原型 | `output/index.html`，三栏 + 所见即所得，覆盖正常路径与异常路径 |
| 后端 | **M0 完成**：文档 CRUD、目录、标签、双链、中文检索、会话、抓取、流式问答、导出 |
| 前端 | **M0 完成**：三栏界面、会话优先导航、文档视图、对话视图、命令面板、设置页 |
| 测试 | 服务端 41 项集成 + 前端 63 项（编辑器往返、设计守门） |

M0 之后是 M1：分块与向量化 → 混合检索 → 带引用的问答。见 `docs/TECH.md` §11。

已有实现：

```
apps/server/src/
  ├── app.ts              路由装配（鉴权中间件 + 静态资源 + 错误外壳）
  ├── auth.ts             Better Auth，含单用户注册规则
  ├── env.ts              环境变量集中校验
  ├── db/                 7 张表 + 迁移
  ├── lib/                jieba 分词 / 文本工具 / vault 读写 / HTTP 辅助
  ├── plugins/leg/        检索通道（接缝的第一个定型实现）
  ├── search/             检索编排 + 加权 RRF 融合
  └── services/           文档服务 / 索引重建

apps/web/src/
  ├── routes/             路由（根路由承担鉴权守卫）
  ├── components/         NoteEditor（Tiptap 接后端 + 保存状态）
  ├── editor/             Tiptap 扩展配置 + 往返保真与幂等性测试
  └── lib/                API 客户端 / Query 配置 / 路由 context

packages/shared/          前后端共享的 zod schema
```

---

## 快速开始

```bash
# 1. 起数据库（Postgres 17 + pgvector，端口 5544）
docker compose up -d postgres

# 2. 装依赖
pnpm install

# 3. 配置环境变量（至少改 AUTH_SECRET）
cp .env.example .env
openssl rand -base64 32   # 把输出填进 AUTH_SECRET

# 4. 建表
pnpm db:migrate

# 5. 起开发服务（这一步才是「启动项目」）
pnpm dev
```

`pnpm dev` 一条命令并行起三个包，改代码即生效：

| 包 | 命令 | 说明 |
|---|---|---|
| `apps/server` | `tsx watch src/index.ts` | API 在 **3000**，改动自动重启 |
| `apps/web` | `vite` | 前端在 **5173**，HMR |
| `packages/shared` | `tsc --watch` | 契约包，改动自动重编译 |

**开发时访问 `http://localhost:5173`**（Vite）。它把 `/api` 代理到 3000，
所以前端不需要跨源配置，cookie 也正常。3000 上的 API 单独也能访问，
但前端页面在 5173。

> 如果 3000 已被占用，`pnpm dev` 会报 `EADDRINUSE` 而不是换端口——
> 先 `pkill -f "tsx watch"` 再重试。
>
> 需要指向别的后端时用 `VITE_API_TARGET=http://localhost:3100 pnpm dev`
> （改动 `vite.config.ts` 里的代理目标，默认 3000）。

首次打开会要求登录：**第一次输入邮箱密码会自动创建唯一账号**，
之后注册入口自动关闭（单用户规则）。

跑完整校验（lint + format + 类型 + 测试）：

```bash
pnpm check
```

生产部署（单容器，同时提供 API 与前端）：

```bash
cp .env.example .env      # 填好 AUTH_SECRET
pnpm docker:prod          # docker compose --profile prod up -d --build
```

已验证：容器 `healthy`、`/` 与 `/docs` 深路由返回 200、未鉴权访问 API 返回 401。

---

## 工具链

| 用途 | 工具 | 备注 |
|---|---|---|
| 类型检查 | TypeScript **7.0.2** | Go 重写版，装的是平台原生二进制 |
| 构建优化 | **React Compiler** | 自动记忆化，替代手写 useMemo / useCallback |
| Lint | **oxlint** 1.83 | 单命令跑全仓，48 文件约 100ms |
| Format | **oxfmt** 0.68 | 见下方说明 |
| 测试 | Vitest 5 | 服务端集成 + 前端编辑器 |
| 依赖版本 | **pnpm catalog** | 版本写在 `pnpm-workspace.yaml`，包内用 `catalog:` |

一条命令做完整校验：

```bash
pnpm check     # lint → format:check → typecheck → test
```

CI 与本地跑的是同一条命令，避免「本地过了 CI 挂」。

**oxfmt 不格式化 Markdown**，这是刻意的。它会把表格补齐到等宽，而列宽是按字节算的——
含中文时算出来的宽度在任何编辑器里都不对齐，源文件反而更难读。Markdown 是内容，不是代码。

## 四条贯穿全局的规则

改动代码前值得先读这四条，它们解释了大部分看起来「绕」的设计。

**1. 文件是真相，数据库是可重建的索引。**
笔记是 `data/vault/` 下的纯 md，抓取的原始快照在 `data/raw/`。删掉数据库可以从文件完整重建。
所以：换 embedding 模型、改分块策略、升级解析器都可以放心全量重跑。

**2. 写入顺序永远是先文件后数据库。**
反过来会产生「数据库里有、文件打不开」的记录。正序最坏只是「文件已存在但尚未入库」，重建索引即可修复。

**3. 所有内容统一成为 Markdown。**
不管来源是手写、网页、公众号还是 GitHub，入库后都是同一条 `documents` 记录 + 同一套正文。
检索、引用、导出都只需要处理一种形状。

**4. 模型调用交给 TanStack AI，检索层自己写。**
这不算「手搓 AI」——chat / embed / rerank 全部走现成 SDK；
自己写的只有 SQL 查询和分块，而这两件事恰恰必须贴合自己的表，交给框架反而要打架。

---

## 目录结构

```
mimir/
├── apps/
│   ├── server/           Hono API + worker
│   └── web/              React SPA
├── packages/
│   └── shared/           前后端共享契约
├── output/               交互原型（静态单文件）
├── docs/                 产品需求 / 技术方案 / 调研记录 / 决策日志
├── AGENTS.md             agent 入口：铁律与完成定义
└── data/                 运行时数据，不进 git
    ├── vault/            笔记（真相）
    ├── raw/              原始快照
    └── .test/            测试专用，与真实数据隔离
```

---

## 下一步

按 `docs/TECH.md` §11，M0 已完成，接下来是 M1：

1. 分块与向量化（pgvector）
2. 混合检索：关键词 + 子串 + 向量，加权 RRF 融合
3. 带引用的知识库问答，引用可点回原文位置
4. PDF / Word 上传与解析、RSS 订阅

---

## 已知坑

踩过的都记在 `docs/TECH.md` §10，改动相关代码前建议扫一眼。最容易踩的三个：

- **jieba 不加载词典会退化成逐字切分**，必须 `Jieba.withDict(dict)`
- **Postgres 对中文没有词边界**，posts 里的「组件性能优化」是一个 token，搜「组件」搜不到
- **pgvector 的 HNSW 索引上限 2000 维**，超过要用 `halfvec`
