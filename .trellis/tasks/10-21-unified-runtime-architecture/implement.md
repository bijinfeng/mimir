# 实施计划

## 0. 基线与分支

- [ ] 记录基线：`git status`、`pnpm check`、`pnpm build`、`pnpm desktop:build`（本机平台）、Docker 构建（若可用）、fnOS 构建（Linux x64 环境）。
- [ ] 在 `master` 上按子任务顺序提交；每个子任务独立可回滚。
- [ ] 先写 `runtime-boundary.test.ts`：core 不得 import runtime，`configureServer` 不得 import core 重模块。

验证：基线命令的输出记录在提交信息或任务 `verification.md`。

## 1. 配置与 runtime 逻辑拆分（子任务 `10-21-runtime-config-core`）

- [ ] 新增 `apps/server/src/runtime/config.ts`：`RuntimeConfig` zod schema、`loadRuntimeConfigFromEnv`、`loadRuntimeConfigFile`、`toServerConfig`。
- [ ] 新增**中立** `apps/server/src/config.ts`：`ServerConfig` / `configureServer` / `getServerConfig` / getter；不 import runtime/core。
- [ ] 新增 `apps/server/src/server-runtime.ts`：`ensureServerRuntime()`（configureDb + setAuth）；`createApp()`/`boot()` 调用。
- [ ] 新增 `apps/server/src/runtime/version.ts`：`PROTOCOL_VERSION = 1`、`SHELL_ABI = 1`。
- [ ] `apps/server/src/env.ts` 删除；core 内 `env.*` 改成 `config.*`（getter 委托 `getServerConfig()`）。
- [ ] `db/client.ts`：`configureDb(config.database)`；`db` 用 live binding；`closeDb()` 保持现有语义。
- [ ] `auth.ts`：`createAuth(config.auth, db)` + `setAuth`；去掉 `env.fnosSocket` 分支，改由配置字段控制 `baseURL`/`trustedOrigins`/cookie path/secure。
- [ ] `boot.ts`：开头 `ensureServerRuntime()`；只读已配置的 `ServerConfig`；不读 env。
- [ ] `app.ts`：开头 `ensureServerRuntime()`；`createApp({ staticMiddleware?, corsOrigin? })`；删除 fnOS auth/CORS 分支与 `mountStatic` import。
- [ ] 新增 `runtime/listeners/tcp.ts`、`unix.ts`、`start.ts`、`cli.ts`；worker 入口保持原路径。
- [ ] 新增 `runtime/gateway/fnos.ts`：迁移 `stripFnosPrefix`、`fnosAuthRequest`、`fnosAuthResponse`；core 不再引用。
- [ ] 新增 `runtime/static.ts`：先按旧 `mountStatic` 行为实现，base 注入留到子任务 4。
- [ ] `dev.ts`：env → configure → 动态 import boot → export app；不监听。
- [ ] `index.ts`：删除自动 start/根导出；公共入口是 `runtime/index.ts`。
- [ ] `package.json`：`exports` 仅 `./runtime`、`./runtime/config`；`bin.mimir-runtime`；`start` 指向 `dist/runtime/cli.js`。
- [ ] `vite.config.ts`：增加 `runtime/cli`、`runtime/index` 输入；保留 `db/migrate`、worker 输入与 `preserveModules`。
- [ ] 迁移路径改为显式配置：`runMigrations(config)` 接收 `migrations.sqlite`/`migrations.postgres` 目录，不再 `../../drizzle` 推导。
- [ ] 测试：配置映射、三种监听形态、fnOS 网关（含 identifier 登录）、local token、迁移路径；新增 `test/setup.ts`（configure + 动态 import server-runtime）；`global-setup` 配置后动态 import migrate；把依赖 `vi.resetModules` 改 env 的测试迁到 `configureServer(testConfig)`。

验证：

```sh
pnpm --filter @mimir/server typecheck
pnpm --filter @mimir/server test
pnpm check
```

回滚点：`env.ts` 删除前保留一次 `git show`；该子任务不改变 Docker/桌面/fnOS 的外部命令。

## 2. 统一 runtime 产物（子任务 `10-21-runtime-artifact`）

- [ ] 把 `apps/desktop/scripts/resource-tree.mjs` 提到 `scripts/lib/resource-tree.mjs`，desktop/fnos/runtime 三处共用；更新测试 import。
- [ ] 新增 `scripts/build-runtime.mjs`：build → **仓库内 staging** `pnpm deploy --prod --node-linker hoisted` → 校验/复制 → `finalizeResourceTree` → `manifest.json` → 清理 staging。`.gitignore` 加 `.runtime-staging/`。
- [ ] 新增 `scripts/runtime-artifact.test.mjs`：manifest 字段、required 缺项、平台/架构、版本来源、staging 清理。
- [ ] `apps/server/.npmignore` 排除 tests/scripts/config；artifact 不含开发文件。
- [ ] Dockerfile：builder 调 `build-runtime.mjs --web apps/web/dist --out /out/runtime`（staging 在 `/repo` 内）；runner 复制 runtime；基础镜像改 `node:22-bookworm-slim`；CMD `node dist/runtime/cli.js`；healthcheck 不变。
- [ ] `scripts/build-fnos.mjs`：调同一脚本到 `staging/app/server`；不再单独 `pnpm deploy`；web 只构建一次并放进 runtime。
- [ ] `apps/fnos/app/launch.mjs`：读 manifest，校验版本，构造 `RuntimeConfig`，`import('./server/dist/runtime/index.js')` 调 `startRuntime`；不再注入 `WEB_DIST`/`MIMIR_FNOS_SOCKET`。
- [ ] `apps/desktop/scripts/deploy-server.mjs` 改为调 `build-runtime.mjs` 到 `apps/desktop/runtime-build`；afterPack 拷 `runtime-build` 而不是三件套。
- [ ] 旧路径保留一版：若 `runtime-build` 缺失，错误信息给出 `pnpm desktop:start`。

验证：

```sh
node scripts/build-runtime.mjs --out /tmp/mimir-runtime --web apps/web/dist
node -e "const m=require('/tmp/mimir-runtime/app/manifest.json'); console.log(m)"
node /tmp/mimir-runtime/app/dist/runtime/cli.js --config /tmp/mimir-runtime-config.json
docker build -t mimir:runtime-test .
docker run --rm ... mimir:runtime-test
pnpm --filter @mimir/desktop build
pnpm desktop:build
```

回滚点：旧 Dockerfile/fnos/desktop 脚本保留到三处烟测通过；runtime 产物目录独立。

## 3. 桌面 sidecar（子任务 `10-21-desktop-sidecar`）

- [ ] 新增 `apps/desktop/src/main/sidecar.ts`：fork、config 写入、ready/error IPC、日志、重启、关停。
- [ ] 新增 `runtime-manifest.ts`：读 manifest、校验 required/platform/arch/version。
- [ ] `main/index.ts`：`resolvePaths` 改 runtimeRoot/webDist；`ensureLocalHost` 调 sidecar；`injectLocalCookie` 不变；`closeHost` 改 sidecar 关闭。
- [ ] 删除 `host.ts`、`artifacts.ts`（sidecar 烟测通过后）；更新 `host.test.ts` 为 sidecar 配置/生命周期测试。
- [ ] 配置：`runtime-config.json` 0600；token 与 secret 只在文件；stdout/stderr 进 `logs/runtime.log`；5 MB 轮转。
- [ ] 崩溃恢复：最多 2 次，1s/3s 退避；失败弹窗；退出/更新前先关 sidecar。
- [ ] 开发开关 `!app.isPackaged && MIMIR_DESKTOP_HOST=in-process` 保留一版，正式包永远 sidecar；验证后删除。
- [ ] `smoke.mjs`：确认 runtime 子进程存在、窗口加载宿主 origin、本地模式免登录；增加“杀掉 sidecar 后应用不崩”的证据。

验证：

```sh
pnpm desktop:start
MIMIR_SMOKE_EXECUTABLE=... node apps/desktop/scripts/smoke.mjs
pnpm --filter @mimir/desktop test
pnpm check
```

回滚点：切回 in-process；配置文件/日志目录保留，不删数据。

## 4. Web/fnOS 单 UI 构建（子任务 `10-21-web-basepath`）

- [ ] `apps/web/vite.config.ts`：`base: './'`，删除 `MIMIR_BASE_PATH`。
- [ ] 新增 `packages/shared/src/runtime-base.ts` + `./runtime-base` 导出；`renderer`、`chat`、`office`、`web` 统一改用它。
- [ ] `packages/renderer/src/lib/app-path.ts`：`readRuntimeBasePath()` / `runtimeBasePath()`；`appBasePath` 归一化。
- [ ] `packages/chat/src/runtime/io.ts`、`packages/office/src/editors/pdfjs-assets.ts`、`packages/office/src/editors/PdfEditor.tsx` 的三个 `BASE_URL` 漏点改掉。
- [ ] `apps/web/src/index.tsx`：router basepath 用运行时值。
- [ ] `runtime/static.ts`：注入 `<base>` 与全局；支持 root 与 `/app/mimir/`；深路由回退；哈希缓存；路径穿越检查。
- [ ] `apps/fnos`：删 `MIMIR_BASE_PATH` 构建；`launch.mjs` config 设置 `static.basePath='/app/mimir/'`；`build-fnos.mjs` 检查 `./assets/` 而不是 `/app/mimir/assets/`。
- [ ] 测试：root/subpath 的 index 注入、深路由、资产、API、app-path、router basepath；fnOS 静态测试。

验证：

```sh
pnpm --filter @mimir/web build
pnpm --filter @mimir/web test
pnpm --filter @mimir/renderer test
pnpm dev  # 根路径手动检查
node scripts/verify-fnos.mjs <version>  # Linux x64 环境
```

回滚点：恢复 `base: '/'` 与 fnOS 构建参数；runtime 注入在 root 下等价，可保留。

## 5. CI、发布、文档与全量验收（子任务 `10-21-release-verification`）

- [ ] `.github/workflows/desktop-release.yml`：每个 matrix job 直接 `build-runtime.mjs` → desktop build → package；删除 job 内 `server build` + `deploy-server`；不做 900MB 级 runtime artifact 上传/下载。
- [ ] `.github/workflows/fnos-build.yml`：用 `build-runtime.mjs --web apps/web/dist`；校验 manifest 版本；保留 fnpack 校验与 Socket 烟测。
- [ ] `.github/workflows/ci.yml`：增加 `node --test scripts/runtime-artifact.test.mjs apps/desktop/src/main/sidecar*.test.ts`；确保 `pnpm check` 包含新测试。
- [ ] 版本握手：`/healthz`、manifest、sidecar ready、fnOS launch 校验；测试不匹配路径。
- [ ] 文档：`architecture.md` §3/§8/§14、`README.md`、`apps/fnos/README.md`、server/desktop 规范；新增 D-114。
- [ ] 全量验收：`pnpm check`、`pnpm build`、`pnpm desktop:build`、Docker build/run、fnOS build/verify（Linux x64）、桌面 smoke；记录未验证项。

验证：

```sh
pnpm check
pnpm build
pnpm desktop:build
docker build -t mimir:release-test .
docker run --rm ... mimir:release-test
node scripts/verify-fnos.mjs <version>
```

回滚点：CI 回滚到旧工作流；产物格式不变，旧包仍可运行。

## 最终门槛

- `pnpm check` 全绿。
- 三端烟测有真实输出；未实机验证的项在 `verification.md` 明确列出。
- `git status` 只包含本任务改动；按子任务提交，提交信息含验证命令与观察结果。
