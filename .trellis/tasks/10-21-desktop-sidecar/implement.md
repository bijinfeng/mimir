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
