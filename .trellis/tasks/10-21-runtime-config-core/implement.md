# 实施计划

1. **基线**：跑 `pnpm --filter @mimir/server typecheck`、`pnpm --filter @mimir/server test`、`pnpm check`，记录当前通过项。
2. **配置层**：
   - 新增 `src/config.ts`（中立 `ServerConfig` + configure/getServerConfig/getter）、`src/runtime/config.ts`、`src/runtime/version.ts`（`PROTOCOL_VERSION=1`、`SHELL_ABI=1`）。
   - 写单测：env 映射、JSON 解析、生产/本地/fnOS 校验、owner 半配置报错、迁移目录、basePath 校验。
3. **core 去 env**：
   - 新增 `config` getter，机械替换 `env.*`；先保留 `env.ts` 作为 shim（从 `getServerConfig` 派生），确认测试全绿后删除。
   - `db/client.ts` 改 `configureDb` + `db` live binding；`auth.ts` 改 `createAuth` + `setAuth`；新增 `server-runtime.ts` 的 `ensureServerRuntime()`。
   - `boot.ts` / `createApp()` 开头调用 `ensureServerRuntime()`。
   - `app.ts` 去掉 fnOS/static 分支，改为 `createApp({ staticMiddleware, corsOrigin })`。
4. **runtime 适配器**：
   - 新增 `listeners/tcp.ts`、`listeners/unix.ts`、`gateway/fnos.ts`、`static.ts`、`start.ts`、`cli.ts`。
   - 把 `lib/fnos-gateway.ts` 与 `lib/static.ts` 的测试迁到 runtime 测试；补 identifier 登录的 fnOS HTTP/HTTPS 测试。
   - 迁移目录改为显式配置。
5. **入口**：
   - `dev.ts` 配置 + 动态 import boot。
   - 删除 `index.ts` 自动监听/根导出（或只留类型）；公共入口只用 `src/runtime/index.ts`。
   - `package.json` exports/bin/start 更新；`vite.config.ts` 增加 runtime 入口，保留 worker 与 preserveModules。
6. **测试**：
   - 新增 `src/test/setup.ts`（configure + 动态 import server-runtime）并接入 vitest 配置。
   - `global-setup.ts` 改成配置后动态 import migrate。
   - 新增 `runtime-boundary.test.ts`。
   - 更新 `vitest.local.config.ts` / `vitest.fnos.config.ts`：用配置对象而不是 resetModules 改 env。
   - 保留一条真实 HTTP 启动测试（SQLite）与一条 fnOS Socket 测试。
7. **验收**：

```sh
pnpm --filter @mimir/server typecheck
pnpm --filter @mimir/server test
pnpm check
pnpm dev  # 手动：登录、静态资源、SSE、上传
```

回滚点：第 3 步删除 `env.ts` 前提交一次；第 5 步入口切换前提交一次。

## 完成记录（2026-10-21）

与计划的差异，以及验证到的结果：

- **`index.ts` 保留为兼容适配器**，没有删成纯类型导出。原因是本任务的验收要求
  「Docker/桌面/fnOS 现有启动命令仍能工作」：桌面 `host.ts` 与 fnOS
  `launch.mjs` 都直接 import `dist/index.js` 的 `startServer`/`closeDb`。
  它现在只做「env → RuntimeConfig → startRuntime」的转发，并为 `hostname`
  保留回环校验；新宿主一律走 `runtime/cli.ts` 或 `runtime/index.ts`。
- **`package.json` 的 `exports` 不只暴露 `./runtime`**：保留了 `.`（兼容
  `import type { RunningServer }` 的桌面代码），并新增 `./runtime/config`、
  `./runtime/version` 两个子路径，供 sidecar/宿主做版本握手时不必加载整个
  runtime（`runtime/index` 会连带加载 db/client）。
- **`configureServer()` 改为同值幂等**。测试的 `setupFiles` 先配一次，
  `startServer()`/`startRuntime()` 随后按同一份 env 再配一次；内容不同仍抛错。
  没有这个，fnOS/TCP 启动测试无法与 setup 共存。
- **`startRuntime()` 记录 DB 所有权**：启动失败时只关闭「本次调用创建的」
  连接。测试的 setup 已建连接，一次预期的 `startServer()` 失败不能把共享连接关掉。
- **`AUTH_SECRET` 空串按未设置处理**：compose 里 `AUTH_SECRET=` 很常见，
  空串进入 Better Auth 会变成「签名密钥为空」而不是启动失败。
- **静态资源测试改吃显式 `dir`**：`createStaticMiddleware({ dir, basePath })`
  不再探测 `WEB_DIST`；`lib/static.ts` 与 `lib/fnos-gateway.ts` 删除，
  逻辑分别在 `runtime/static.ts`、`runtime/gateway/fnos.ts`。
- **新增测试**：
  - `src/test/runtime-config.test.ts`：env 映射、JSON 往返、生产/本地/fnOS
    校验、owner 半配置、basePath/端口、`toServerConfig` 的裁剪。
  - `src/test/runtime-start.test.ts`：真实 TCP listener + `/healthz` + 业务 401，
    并验证 `close()` 幂等。
  - `src/test/runtime-boundary.test.ts`：core 不读 `process.env`、不 import
    `runtime/`、不出现平台变量名；`start.ts` 先 configure 再动态 import boot。
- **构建**：`vite.config.ts` 新增 `runtime/cli`、`runtime/index`、
  `runtime/migrate-cli` 入口并保留 `db/migrate`；`dist/runtime/cli.js` 实测
  ready JSON、`/healthz`、SIGTERM 退出码 0。
- **已知的产物依赖问题（交给子任务 2）**：在仓库内直接 `node dist/runtime/cli.js`
  会因为 workspace 插件的依赖（如 `@aws-sdk/client-s3`）只装在插件自己的
  `node_modules` 而解析失败。`pnpm deploy` 的产物布局会把它带上；子任务 2 的
  `build-runtime.mjs` 必须在产物内验证这条，而不是只验证源码 `tsx`。
- **验证**：
  - `pnpm --filter @mimir/server typecheck` 通过。
  - `pnpm --filter @mimir/server test` 通过（126 + 10 + 6 个用例，含 sqlite-backup）。
  - `pnpm lint` 0 error（253 warning，与基线同类）、`pnpm format:check` 通过、`pnpm -r typecheck` 通过。
  - 根 `node --test` 的 10 个脚本 80/80 通过。注意：fnOS 生命周期用例里的 `control.mjs` 要执行 `/bin/ps`，
    workspace-write 沙箱会拒绝；在完整文件权限下通过，因此 `pnpm check` 在本机沙箱里会把它报成假失败。
  - `node dist/runtime/cli.js` 与旧的 `node dist/index.js` 均实测 ready/healthz
    （前者需临时补 S3 依赖符号链接；见上一条）。
  - Vite dev（`pnpm --filter @mimir/server dev`）实测 `/healthz` 返回新字段。


