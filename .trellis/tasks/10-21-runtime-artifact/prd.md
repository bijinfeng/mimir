# 构建单一 runtime 产物与 manifest

## Goal

每个平台通过一个脚本产出一份可移植 runtime（服务端 JS、生产依赖、迁移、manifest）；Docker、fnOS、desktop 消费同一布局，不再各自 `pnpm deploy` 或硬编码服务端文件清单。

## Requirements

- R1. 新增 `scripts/build-runtime.mjs`：构建、在**仓库内 staging** 执行 `pnpm deploy --prod --node-linker hoisted`、校验/复制、物化资源链接、写 `manifest.json`、清理 staging。不能直接 deploy 到仓库外目标（patch 路径会失效）。
- R2. `manifest.json` 至少包含：`productVersion`、`protocolVersion`、`shellAbi`、`gitSha`、`platform`、`arch`、`libc`、`node`、`entry`、`library`、`migrations`、`web`（可选）、`required`、`schemaVersion`。
- R3. `finalizeResourceTree` 从 desktop 脚本提到 `scripts/lib/resource-tree.mjs`，runtime/fnOS/desktop 共用；保留现有测试。
- R4. Dockerfile 改为 builder 产 runtime、runner 只复制 runtime；基础镜像改 glibc（`node:22-bookworm-slim`），以便与 fnOS 共用 Linux 产物。CMD 走 `dist/runtime/cli.js`。
- R5. `scripts/build-fnos.mjs` 调同一脚本，不再单独 `pnpm deploy`；web 产物作为 `--web` 输入；`launch.mjs` 读 manifest、校验版本、构造 `RuntimeConfig`、调 `startRuntime`。
- R6. 桌面 `deploy-server.mjs` 改为调同一脚本到 `apps/desktop/runtime-build`；`after-pack.mjs` 复制整个 runtime 根，而不是三件套。
- R7. 旧 `deploy-server.mjs` / fnOS 的 `pnpm deploy` 在切换完成后删除；仓库只保留一个服务端拼装实现。

## Acceptance Criteria

- [ ] AC1. `node scripts/build-runtime.mjs --out /tmp/mimir-runtime --web apps/web/dist` 产出 `dist/runtime/cli.js`、`dist/runtime/index.js`、`drizzle-sqlite/`、`drizzle/`、`node_modules/`、`manifest.json`；`required`（含四个 native 包）全部存在；manifest 与实际入口一致；仓库内 staging 被清理。
- [ ] AC2. 产物在临时目录启动成功（SQLite + TCP），`/healthz` 返回 200；重复 build 不残留旧文件。
- [ ] AC3. Docker build 使用该脚本；容器启动、登录、静态资源、SSE、上传/下载 smoke 通过；镜像内没有第二个服务端拼装逻辑。
- [ ] AC4. fnOS staging 使用该脚本；写 `app/version.json`；`launch.mjs` 读 manifest + version.json 并启动 Unix Socket；`verify-fnos.mjs` 通过（Linux x64 环境）。
- [ ] AC5. `pnpm desktop:build` 使用该脚本；afterPack 后 `resources/server/manifest.json` 存在且 required 完整；桌面仍能启动（sidecar 接入前可走临时 in-process 适配）。
- [ ] AC6. `pnpm check` 通过；新增 `scripts/runtime-artifact.test.mjs` 覆盖 manifest/required/版本/平台校验。
- [ ] AC7. artifact 不含 `src/test`、`scripts`、`vite.config.ts`、`vitest*.ts` 等开发文件；`src` 与 `dist` 的取舍在 `.npmignore` 中有注释。

## Dependencies

- 依赖 `10-21-runtime-config-core` 的 `dist/runtime/cli.js`、`dist/runtime/index.js` 与 `RuntimeConfig`。
- 设计见父任务 `design.md` §5、§9。

## Out of scope

- 桌面 sidecar 进程管理（子任务 3；本任务只需让 afterPack 带上 runtime）。
- Web base path 注入（子任务 4；本任务可先按旧方式传 `--web`）。
- CI 工作流重构（子任务 5；本任务只改本地脚本与 Dockerfile）。

## Notes

- 产物目录是 `pnpm deploy` 的目标，必须为空；脚本负责删除。
- 不要在 artifact 里保留 pnpm 符号链接；`finalizeResourceTree` 已物化文件别名并拒绝目录链接。
