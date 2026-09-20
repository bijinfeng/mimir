# mimir

自托管的个人知识库：写 Markdown 笔记、收集外部资料、带引用地问 AI。

单用户，部署在自己的服务器上。

---

## 文档

| 文档 | 内容 | 什么时候看 |
|---|---|---|
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
| 后端 | 骨架完成，18 项集成测试通过 |
| 前端 | 仅编辑器扩展配置与 15 项往返测试，**页面尚未开始** |

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

# 5. 跑完整校验（lint + format + 类型 + 测试）
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
├── docs/                 PRD / TECH / RESEARCH
└── data/                 运行时数据，不进 git
    ├── vault/            笔记（真相）
    ├── raw/              原始快照
    └── .test/            测试专用，与真实数据隔离
```

---

## 下一步

按 `docs/TECH.md` §11：

1. 定 `src/plugins/` 的目录形状与注册表接口（不写实现，只定形状）
2. M0 前端：登录 → 笔记列表与编辑器 → 检索 → 收件箱与整理
3. M0 抓取器：粘贴 URL（网页 / 公众号 / GitHub）
4. M1：分块与向量化 → 混合检索 → 带引用的问答

---

## 已知坑

踩过的都记在 `docs/TECH.md` §10，改动相关代码前建议扫一眼。最容易踩的三个：

- **jieba 不加载词典会退化成逐字切分**，必须 `Jieba.withDict(dict)`
- **Postgres 对中文没有词边界**，posts 里的「组件性能优化」是一个 token，搜「组件」搜不到
- **pgvector 的 HNSW 索引上限 2000 维**，超过要用 `halfvec`
