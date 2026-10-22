# 桌面端改为 sidecar 宿主

## Goal

桌面本地模式不再在 Electron 主进程内 import 服务端，而是启动独立 runtime 进程；父进程负责配置、端口、令牌、日志、就绪握手、崩溃恢复与关停。页面仍加载 sidecar 的 `http://127.0.0.1:<port>`，同源 HTTP 与本地令牌模型不变。

## Requirements

- R1. 新增 `apps/desktop/src/main/sidecar.ts`：写 0600 配置、fork runtime、IPC 就绪/错误、日志、重启、关停。
- R2. runtime 入口来自 `manifest.json` 的 `entry`，不硬编码路径；启动前校验 manifest 的 `required`、`platform`、`arch`、`productVersion`。
- R3. 父进程先 `pickFreePort()` 预选回环端口并写入配置，runtime 绑定该端口；`ready` 消息返回 `origin`、`version`、`protocolVersion`、`shellAbi`；父进程校验后再写 cookie、开窗。`PORT_IN_USE` 时重新选端口/写配置，最多 3 次（1s/3s 退避）。CLI 仍支持 `port: 0`，桌面不用。
- R4. 令牌、`AUTH_SECRET`、owner 密码只进 0600 配置文件；不得出现在 argv、环境变量、日志或 preload。
- R4a. sidecar 就绪前显示极简启动窗（`public/boot.html` 静态文件，`file://`，无 React 入口/preload），显示启动/超时/错误；ready 后切主窗，不把用户留在无窗口状态。
- R4b. runtime 错误带稳定 code（`PORT_IN_USE`、`DB_LOCKED`、`DB_UNAVAILABLE`、`MIGRATION_FAILED`、`CONFIG_INVALID`、`NATIVE_MODULE_FAILED`、`STATIC_MISSING`）；父进程映射为可操作文案，stderr 只进日志。
- R5. 日志写 `<userData>/logs/runtime.log`，5 MB 轮转到 `.1`；stdout/stderr 都落盘。
- R6. 崩溃/异常退出最多自动重启 2 次（1s/3s 退避）；仍失败显示可操作错误。应用退出/更新安装前先关 sidecar，5 秒超时强杀。
- R7. 云端模式不启动 sidecar；D-105 的系统边框、原生菜单、远端页面行为不变。
- R8. 删除旧 `host.ts`、`artifacts.ts`；`main/index.ts` 的 `ensureLocalHost`、`closeHost`、`injectLocalCookie`、`prepareTarget` 改用 sidecar。

## Acceptance Criteria

- [ ] AC1. 本地模式启动后 `ps`/任务管理器能看到独立 runtime 子进程；Electron 主进程不是宿主。
- [ ] AC2. fork 后先显示 boot 窗；收到 `ready` 后才开主窗；错误路径显示 code 映射文案与重试/退出选项，stderr 尾部只进日志。
- [ ] AC3. 杀掉 sidecar 后 Electron 不退出；自动重启一次后窗口重新加载成功；连续失败显示错误；`PORT_IN_USE` 重试 3 次后报错。
- [ ] AC4. 退出应用后 sidecar 在 5 秒内结束；更新安装前调用 `closeHost`，不留下孤儿进程；Windows 进程树被清理。
- [ ] AC5. 配置文件权限 0600；`ps` 命令行不含 token/secret/密码；日志不含这些值。
- [ ] AC6. `pnpm --filter @mimir/desktop test`、`pnpm check` 通过；`smoke.mjs` 在真实包上验证本地模式、静态资源、鉴权与 sidecar 存在。
- [ ] AC7. 云端模式 smoke 不回退：远端页面加载、系统边框、原生「更换使用方式」菜单可用。
- [ ] AC8. manifest/ready 的 `shellAbi` 不匹配时，父进程在 fork 前/开窗前明确失败，错误含期望/实际值。

## Dependencies

- 依赖 `10-21-runtime-config-core`（runtime CLI/IPC 协议）与 `10-21-runtime-artifact`（manifest、`runtime-build`）。
- 设计见父任务 `design.md` §6、§9。

## Out of scope

- 改云端模式的窗口/安全模型（D-105/D-107）。
- 改本地模式的产品行为或免登录语义。
- 把页面↔宿主改成 Electron IPC。
- 自动更新安装器本身的改造（只保证先关 sidecar）。

## Notes

- 先保留 `MIMIR_DESKTOP_HOST=in-process` 一版作为回滚开关；sidecar 烟测通过后删除 `host.ts` 与开关。
- 现有 `HostShutdown`、`WorkspaceTransition`、单实例锁、cookie 分区继续使用。
