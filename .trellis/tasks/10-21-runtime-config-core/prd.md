# 拆分 server-core/runtime 并引入 RuntimeConfig

## Goal

把 `apps/server` 的部署形态从核心代码里拿出去：core 只认已配置的 `ServerConfig`，runtime 负责 env/JSON → 配置、进程生命周期、监听、静态、fnOS 网关与本地令牌适配。宿主的启动方式在本任务后不变，行为必须与现在一致。

## Requirements

- R1. 新增可序列化的 `RuntimeConfig` 与 core 用的 `ServerConfig`；`ServerConfig` 放在中立的 `src/config.ts`（不 import runtime），提供 `loadRuntimeConfigFromEnv`、`loadRuntimeConfigFile`、`toServerConfig`。
- R2. `env.ts` 删除或降级为 runtime 的 env 映射器；core（`app.ts`、`boot.ts`、`auth.ts`、`db/`、`routes/`、`services/`、`lib/`、`plugins/`、`search/`）不再读取 `process.env`，不再出现 `MIMIR_FNOS_*`、`MIMIR_LOCAL_*`、`MIMIR_BASE_PATH`、`WEB_DIST`。
- R3. `db/client.ts` 与 `auth.ts` 从“import 时创建单例”改为“configure 时创建 live binding + setter”；新增 `src/server-runtime.ts` 的 `ensureServerRuntime()`，`createApp()`/`boot()` 调用它。
- R4. `app.ts` 不再 import `mountStatic`，不再有 fnOS auth/CORS 分支；静态资源与 fnOS 网关改由 runtime 注入/包裹。
- R5. 新增 `runtime/`：`config.ts`、`start.ts`、`cli.ts`、`listeners/tcp.ts`、`listeners/unix.ts`、`gateway/fnos.ts`、`static.ts`、`version.ts`；`server-config` 不存在，避免 core→runtime 反向依赖。
- R6. `dev.ts` 仍导出 Hono app 供 Vite dev server 使用；生产根 `index.ts` 不再自动监听或作为公共入口；公共入口是 `src/runtime/index.ts`，`package.json` 的 `exports` 只暴露 `./runtime`（及 `./runtime/config`）。
- R7. 迁移目录改为显式配置，不再用 `import.meta.url` 推导 `../../drizzle`；worker 入口保持现有路径与构建契约。
- R8. fnOS 的 Origin/Cookie 适配覆盖 `/api/auth/*`（含 `sign-in/identifier`），并补 HTTP/HTTPS 测试；这是有意的行为修正，不是只搬家。

## Acceptance Criteria

- [x] AC1. core 目录 `grep` 不到 `process.env` 与四个旧部署变量；`pnpm --filter @mimir/server typecheck` / `test` 通过。
- [x] AC2. 同一套 core 在测试中分别由 TCP/SQLite、Unix/fnOS 三种 `RuntimeConfig` 启动；鉴权、健康检查、静态与迁移行为符合预期。TCP/Postgres 由 `TEST_DATABASE_URL` 门覆盖（本机未起 Postgres 实例，未实跑该分支）。
- [x] AC3. fnOS 前缀、Origin、HTTPS Cookie、Cookie Path、`sign-in/identifier` 的测试位于 runtime/gateway 调用链，不依赖 `vi.resetModules()` 改 env。
- [x] AC4. 本地令牌比较仍常量时间；无令牌时启动失败；本地模式只绑回环的结构性保证仍在。
- [x] AC5. `pnpm check` 通过；Docker、桌面、fnOS 现有启动命令在本任务后仍能工作（通过 env 适配），只是内部改走 runtime。注：本机 workspace-write 沙箱拒绝 `/bin/ps`，fnOS 生命周期用例需在完整文件权限下跑（80/80 通过）；其余 check 阶段均通过。
- [x] AC6. 新增边界测试：core 不得 import `runtime/`；`src/config.ts` 不得 import `boot`/`app`/`db/schema`/`runtime`；core 模块顶层不读 `db`/`auth`（顶层使用会由启动测试直接暴露）。
- [x] AC7. `test/setup.ts` 先配置再动态 import core，`helpers.ts` 的顶层 `createApp()` 仍可用；`global-setup` 迁移路径显式。

## Dependencies

- 必须先完成本任务，子任务 2/3/4 才能消费新的 runtime 入口与配置。
- 设计细节见父任务 `10-21-unified-runtime-architecture/design.md` §1–§4、§9。

## Out of scope

- 统一产物构建、Docker/fnOS/desktop 打包改造（子任务 2）。
- 桌面 sidecar（子任务 3）。
- Web base path 注入（子任务 4）。
- 物理拆 workspace 包、改名 `apps/server`、独立发版。

## Notes

- 除 fnOS `sign-in/identifier` 的 Origin/Cookie 适配修正外，本任务不改变用户可见行为；该修正和错误文案变化都要在提交信息里说明。
- 先跑基线，再改配置；每一步保持 `pnpm check` 可运行。
- 复审记录见父任务 `research/2026-10-21-runtime-review.md`。
