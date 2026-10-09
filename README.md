# mimir

自托管的单用户个人知识库：写 Markdown 笔记、收集资料，并带引用地问 AI。
浏览器端连接自部署服务；桌面端可离线使用本机数据，也可连接服务端。
产品边界见 [PRD](docs/PRD.md)，架构见 [TECH](docs/TECH.md)。

## 快速开始

需要 pnpm。默认本地开发使用 SQLite，不需要 Docker：

```bash
pnpm install
cp .env.example .env
# 在 .env 中设置 AUTH_SECRET；建议同时设置 OWNER_EMAIL / OWNER_PASSWORD
pnpm dev
```

浏览器开发页默认在 `http://localhost:5173`，API 默认在 3000。
如需生产一致的 Postgres 路径，设置 `DATABASE_URL`，启动数据库后运行
`pnpm db:migrate`；详见 [部署说明](docs/TECH.md)。

桌面端：

```bash
pnpm desktop:dev
```

首次启动选择“本地使用”或“连接服务器”。本地模式数据保存在 Electron 的
userData 目录，免登录但仍使用仅本机可用的令牌鉴权；云端模式直接加载服务器
页面，不同步或迁移本地数据。桌面端界面改动后需刷新窗口。打包用
`pnpm desktop:build`。

完整检查运行 `pnpm check`。服务器部署参见 [TECH §8](docs/TECH.md)。

## 账号与安全

单用户实例建议设置 `OWNER_EMAIL` 和 `OWNER_PASSWORD`：服务端启动时创建
或同步所有者账号，避免首次注册窗口被他人抢先使用，也提供重置密码的路径。
两项必须同时设置；生产环境必须显式设置 `AUTH_SECRET`。
不要将自托管服务裸露在公网；部署与备份要求见 [TECH §8](docs/TECH.md)。

## 文档

AI agent 开工先读 [AGENTS.md](AGENTS.md)。按问题找规范与历史原因，从
[文档索引](docs/INDEX.md) 进入。日常修改不必逐次登记：只有现行契约改变才
更新其唯一归属文档；验证记录留在提交或 PR，不追加过程文档。

`output/` 是静态交互原型，可能保留早期形态；现行行为以 PRD、TECH 和 DESIGN
为准。
