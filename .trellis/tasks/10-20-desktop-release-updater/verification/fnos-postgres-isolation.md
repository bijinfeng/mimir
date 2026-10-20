# PostgreSQL 方言门中的 fnOS 测试隔离修复

日期：2026-10-20。对应 GitHub CI run `39383281565`，原始失败日志 `github-ci-postgres-failed.log`。

## 根因与修复

普通服务器和本地模式可通过 `TEST_DATABASE_URL` 选择 PostgreSQL；fnOS 生产契约始终要求 SQLite。原 fnOS Vitest 配置直接展开通用 `TEST_ENV`，在 CI 方言门继承 PostgreSQL，`env.ts` 的正确保护在测试收集时抛错。共享 globalSetup 又独立读取通用 `TEST_ENV`，因此只覆盖 worker 的数据库 URL 会导致迁移和测试使用不同库。

本轮只改四个测试/配置文件：

- `src/test/config.ts` 提供独立 `FNOS_TEST_ENV`，固定 SQLite `data/.test-fnos/mimir.db`、独立数据目录、关闭桌面本地免登录，并使用统一测试账号 `admin@example.com / 12345678`。
- `vitest.fnos.config.ts` 使用上述环境。
- `src/test/global-setup.ts` 从 Vitest `TestProject.config.env` 读取当前项目的数据库、数据根和环境；清库、迁移与 worker 同源，保留非测试 PostgreSQL 名称拒绝保护。普通/本地模式继续使用原 PG 方言选择。
- `src/test/fnos-mode.test.ts` 增加实际 SQLite 文件/数据根和统一账号断言；原 Socket、鉴权与拒绝不匹配所有者测试全部保留。

生产 `env.ts`、SQLite 限制、迁移、数据库客户端和应用接口均未修改。未跳过测试或放宽任何预算。

## Node22 本机真实回归

使用 Node **22.23.1** 与本机 PostgreSQL16，单独创建本轮拥有的临时数据库 `mimir_test_fnos_ci_20261020`。同一环境 `TEST_DATABASE_URL=postgres://admin@127.0.0.1:5432/mimir_test_fnos_ci_20261020`：

1. 修复前 `pnpm exec vitest run --config vitest.fnos.config.ts` **exit1**，复现 `fnOS 模式必须使用 SQLite 数据库`，收集阶段0测试；日志 `fnos-pg-isolation-before.log`。
2. 修复后同命令 **5/5通过、exit0**；日志 `fnos-pg-isolation-after.log`。
3. 普通 PostgreSQL `vitest run src/test/api.test.ts src/test/search.test.ts` **31/31通过、exit0**；日志 `fnos-pg-main-regression.log`。
4. PostgreSQL `vitest run --config vitest.local.config.ts` **10/10通过、exit0**；日志 `fnos-pg-local-regression.log`。
5. 在该PG库创建 `fnos_isolation_sentinel` 并写入 `preserved`，再带同一PG URL运行fnOS完整5测试；随后 `SELECT value FROM fnos_isolation_sentinel` 仍返回 `preserved`，证明fnOS前置没有误清PG schema。测试库由本轮创建，验收后删除。

`pnpm exec tsc --noEmit`（server，Node22）exit0；四文件oxlint、oxfmt check和git diff check均exit0。本轮未重跑重型全仓门，也不将本机回归等同于新GitHub CI已经通过。

已通知主会话同步测试隔离规范：globalSetup读取当前Vitest项目env，fnOS是独立SQLite例外，不改变普通PG方言对齐门。

## 独立检查

检查四文件实际数据流：普通 `vitest.config.ts` 仍使用 `TEST_ENV`，本地模式仍使用展开同一环境的 `LOCAL_MODE_TEST_ENV`，两者继续按 `TEST_DATABASE_URL` 选 PostgreSQL；仅 fnOS 覆盖为独立 SQLite 根。globalSetup 的清理、迁移与 worker 均读取当前 Vitest 项目 `config.env`。生产 `src/env.ts` 的 fnOS SQLite 限制及应用代码未改，未删除普通/本地 PG 测试入口。

独立以 Node22.23.1 执行 `TEST_DATABASE_URL=postgres://admin@127.0.0.1:1/mimir_test_independent_review pnpm exec vitest run --config vitest.fnos.config.ts`，故意使用无法连接的 PostgreSQL 端口，仍 **5/5通过、exit0**；没有建立或清理任何 PG 测试库。日志 `fnos-pg-independent-check.log`。这验证 fnOS 实际迁移及运行不会误选外层 PostgreSQL；普通/本地真实 PG 行为证据沿用上面的作者回归，不重复创建数据库。

Node22 server typecheck、四文件 oxlint、oxfmt 均 exit0。此次独立检查没有发现需要修复的问题；未重跑全仓门或远端 CI，不将本地通过描述为 GitHub 方言门已经通过。
