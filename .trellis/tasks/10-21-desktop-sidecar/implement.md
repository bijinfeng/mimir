# 实施计划

1. **runtime IPC**：在 `runtime/cli.ts` 加 `--config`、IPC `ready`/`error`（带稳定 `code`）/`shutdown` 消息；补一条 Node 进程测试。
2. **manifest 校验**：新增 `apps/desktop/src/main/runtime-manifest.ts` + 测试；读 `runtime-build/manifest.json`，校验 required/platform/arch/productVersion/`shellAbi`。
3. **sidecar 模块**：新增 `sidecar.ts`（预选端口、配置写入、fork + IPC、就绪、日志、重启、close、端口退避）+ 测试；先不接主进程。用 fake child 测生命周期/退出码映射/重试，另加一条真实 `fork` + `ELECTRON_RUN_AS_NODE` 的冒烟（可跳过无 Electron 的环境）。
4. **启动窗**：新增静态 `apps/desktop/public/boot.html`（`file://`，显示启动/超时/错误），sidecar ready 前显示；不新增 React 入口，不把 setup 页的三态逻辑复用进来。
5. **主进程接入**：`index.ts` 的 `resolvePaths`/`ensureLocalHost`/`closeHost` 改用 sidecar；in-process 开关只做 **dev-only**（`!app.isPackaged`），正式包永远 sidecar。
6. **删除旧实现**：`host.ts`、`artifacts.ts` 与对应测试删除；`deploy-server.mjs` 已在子任务 2 改为 runtime 构建。
7. **烟测**：
   - `pnpm desktop:start` 本地模式：窗口加载、登录态、上传/下载、SSE。
   - `smoke.mjs` 真实包：sidecar 存在、退出后消失。
   - 手动 `kill` sidecar：应用不退出，自动重启后页面恢复。
   - 云端模式：远端地址、系统边框、切换菜单。
8. **验收**：

```sh
pnpm --filter @mimir/desktop test
pnpm check
pnpm desktop:build
MIMIR_SMOKE_EXECUTABLE=<abs> node apps/desktop/scripts/smoke.mjs
```

回滚点：第 5 步保留 `MIMIR_DESKTOP_HOST=in-process`（dev-only）；第 6 步删除前提交一次。

## 完成记录（2026-10-22）

- 新增 `apps/desktop/src/main/runtime-manifest.ts`：读产物 manifest，校验
  `required`、平台/架构、`productVersion`、`shellAbi`；错误列缺项与
  `pnpm desktop:build`。`apps/desktop/src/main/host.ts` 与 `artifacts.ts` 已删除。
- 新增 `apps/desktop/src/main/sidecar.ts`：
  - 预选回环端口、0600 原子写 `runtime-config.json`、0600 持久化 auth-secret；
  - `fork(runtimeEntry, ['--config', path])` + `ELECTRON_RUN_AS_NODE=1` +
    `stdio: ['ignore','pipe','pipe','ipc']`；env 删除 `MIMIR_*`/`MODEL_*`/
    `S3_*`/`OWNER_*`/`AUTH_SECRET`/`DATABASE_URL` 等；
  - IPC `ready`/`error`、20s 超时、`PORT_IN_USE` 三次退避（1s/3s）、
    `PORT_IN_USE` 之外按稳定 code 映射文案；
  - `<userData>/logs/runtime.log`，5MB 轮转；stdout/stderr 都落盘；
  - `close()`：IPC shutdown → 5s → SIGTERM → 2s → SIGTERM/Windows
    `taskkill /T /F`；幂等；
  - `onUnexpectedExit()` 给主进程做重启，sidecar 自身不自动循环。
- `runtime/cli.ts` 新增 IPC `shutdown`；现有 SIGHUP/SIGTERM/disconnect 保留。
- `index.ts`：`resolvePaths()` 返回 `SidecarPaths`（packaged `resources/server`，
  dev `apps/desktop/runtime-build`）；`ensureLocalHost` 调 `startSidecar`；
  `prepareTarget`/cookie/关闭逻辑改类型；启动窗 `public/boot.html` 在 ready 前
  显示，ready/导航后关闭；sidecar 异常退出后主进程按 1s/3s 最多重启 2 次，
  重新写 cookie 并重载窗口。
- `apps/desktop/scripts/smoke.mjs` 改从 `<userData>/logs/runtime.log` 取证，
  并新增「本地宿主是独立 sidecar 子进程」判据；同时清除继承的
  `ELECTRON_RUN_AS_NODE`，否则 Electron 会按 Node 启动。
- 验证：
  - `pnpm --filter @mimir/desktop typecheck` / `test`：124 通过（新增
    runtime-manifest 4 + sidecar 7，含真实 fork + IPC ready + SIGKILL 意外退出
    + ready shellAbi 不匹配）。
  - `node apps/desktop/scripts/smoke.mjs`：A/B/C 全 PASS，包括本地 sidecar 进程、
    静态资源、本地令牌、云端无宿主。
  - `pnpm desktop:build`（Electron/electron-builder 走 npmmirror）成功；
    `verify-package.mjs mac-arm64 0.1.8` 通过；打包后真实 `.app` 的 smoke A/B/C
    全 PASS。
  - 发现并修复两个打包态问题：sidecar 读不到 asar 内的 renderer（afterPack 现复制
    到 `Resources/renderer`）；启动窗先销毁会触发 `window-all-closed`（改成主窗
    创建后关闭启动窗）。
- 交接：真实安装包上 `kill -9` sidecar 已验证主进程不退出、1s 后新 pid/端口重启
  并重新加载页面；fnOS/Docker 见子任务 5 记录。
