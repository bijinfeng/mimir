# 技术设计：桌面 sidecar

## 1. 进程与 IPC

用 `child_process.fork`，不用 `utilityProcess`：

```ts
const child = fork(runtimeEntry, ['--config', configPath], {
  execPath: process.execPath,          // Electron 二进制
  env: {
    ...minimalEnv,                     // PATH/TMPDIR/HOME，不带 MIMIR_*
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
  },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  windowsHide: true,
})
```

- `ELECTRON_RUN_AS_NODE=1` 让 Electron 二进制按 Node 运行；纯 Node 测试可直接 `fork` runtime CLI。本地实测（Electron 44.7.0 / Node 24.21.0）：fork + IPC ready 正常，子进程可加载 `better-sqlite3`、`sqlite-vec`、`@node-rs/jieba`。
- env 从 `process.env` 复制后删除 `MIMIR_*`、`AUTH_SECRET`、`DATABASE_URL`、`OWNER_*`、`MODEL_*`，保留 `PATH`/`HOME`/`TMPDIR`/`SystemRoot` 等 OS 必需项；不要在 env 里放 token/secret。
- IPC 消息：
  - child → parent：`{ type: 'ready', origin, version, protocolVersion, pid }` / `{ type: 'error', message, stack? }`
  - parent → child：`{ type: 'shutdown' }`（优先）；超时再 `SIGTERM`/`SIGKILL`。
- runtime CLI 在 `process.send` 存在时发 IPC；否则 stdout 打一行 JSON（容器/CLI 用）。
- 父进程 20 秒未收到 ready 视为失败；错误信息包含 stderr 最后 4 KB。

## 2. 配置

`<userData>/runtime-config.json`（0600，临时文件 + rename）：

```json
{
  "product": { "version": "0.1.8", "protocolVersion": 1 },
  "nodeEnv": "production",
  "dataDir": "<userData>/data",
  "database": { "kind": "sqlite", "file": "<userData>/data/mimir.db" },
  "listener": { "kind": "tcp", "host": "127.0.0.1", "port": 41234 },
  "publicUrl": "http://127.0.0.1:41234",
  "auth": {
    "secret": "<persisted auth-secret>",
    "localToken": "<random per launch>",
    "trustedOrigins": ["http://127.0.0.1:41234"],
    "secureCookies": false
  },
  "static": { "dir": "<desktop renderer>", "basePath": "/" },
  "migrations": { "sqlite": "<runtimeRoot>/drizzle-sqlite", "postgres": "<runtimeRoot>/drizzle" }
}
```

- **预选端口 + 退避重试**：父进程用现有 `pickFreePort()` 先拿一个回环端口，写进 `listener.port` 与 `publicUrl`/`trustedOrigins`，再 fork；runtime 绑定同一端口。若 runtime 以 `PORT_IN_USE` 退出，重新选端口/写配置并重试，最多 3 次（1s/3s 退避）。CLI 仍支持 `port: 0`，但桌面不用。参考 WeKnora `listenWithRetry` / SiYuan `getAvailablePort`。
- `auth.localToken` 每次启动随机；`auth.secret` 持久化在 `<userData>/data/auth-secret`（现有逻辑）。
- 不在 env 里传任何 `MIMIR_*`；不把 token 放 argv。

## 3. 生命周期

状态机：`idle → starting → ready → stopping → stopped`；`starting` 失败 → `failed`。

- `start()`：读 manifest → 校验 required/platform/arch/productVersion/**shellAbi** → 写 config → fork → 等 ready → 校验版本/协议/shellAbi → 写 cookie → 返回 `SidecarHandle`。
- **启动窗**：fork 后、ready 前显示 `file://.../boot.html`（显示「正在启动本地服务」/超时/错误），ready 后创建/切换到主窗并销毁 boot 窗。boot 页是 **`apps/desktop/public/boot.html` 静态文件**（由 Vite 原样复制到 `dist/renderer`，不新增 React 入口），无 preload、不调用桌面桥；主进程用 `webContents.executeJavaScript` 更新错误文本。不复用 setup 页的三态逻辑。参考 SiYuan `boot.html`。
- `close()`：发 `shutdown`，等 5 秒；超时 `SIGTERM`，再 2 秒 `SIGKILL`；关闭日志流；幂等。
- `child.on('exit')`：
  - 如果 `stopping`：正常 resolve。
  - 如果 `ready` 且未退出：记录退出码，最多重启 2 次（1s/3s）；重启后重新写 config（新 token/端口）并重新注入 cookie、导航窗口。
  - 连续失败：`failed`，父进程显示错误框（重试/退出），不自动循环。
  - runtime 退出码/错误码：`PORT_IN_USE`、`DB_LOCKED`、`DB_UNAVAILABLE`、`MIGRATION_FAILED`、`CONFIG_INVALID`、`NATIVE_MODULE_FAILED`、`STATIC_MISSING`；父进程映射为可操作文案。参考 SiYuan 内核退出码（20/21/24/25/26）。
- `app.on('before-quit')` / 更新安装前：`await close()`；现有 `HostShutdown` 复用。
- Windows：`fork` 的子进程退出用 `child.kill()`；若进程树残留，用 `taskkill /PID <pid> /T /F` 兜底（与 `desktop-dev-process.mjs` 同一思路）。

## 4. 日志

- `createWriteStream(<userData>/logs/runtime.log, { flags: 'a', mode: 0o600 })`。
- 启动时若文件 > 5 MB，`rename` 到 `.1`（覆盖旧 `.1`），新建。
- 每行前缀 `[runtime]`；stdout/stderr 都写；错误框只取尾部，不把完整日志塞进 UI。
- 日志写入失败：`console.warn`，不阻断启动。

## 5. 主进程改造

`main/index.ts`：

- `resolvePaths()` → `resolveRuntimePaths()`：
  - packaged：`runtimeRoot = resources/server`，`runtimeEntry = <root>/<manifest.entry>`，`webDist = app.getAppPath()/dist/renderer`，`dataDir = userData/data`。
  - dev：`runtimeRoot = apps/desktop/runtime-build`，`webDist = apps/desktop/dist/renderer`。
- `ensureLocalHost(paths)` → `ensureSidecar(paths)`；返回 `SidecarHandle`，字段 `origin`、`dataDir`、`localToken`、`close()`。
- `injectLocalCookie` 不变（origin 来自 handle）。
- `prepareTarget` / `closeHost` 只改类型与调用。
- `bootInfo` 仍用 `DesktopBootInfo`；`origin` 来自 ready。
- `artifacts.ts` 删除；`runtime-manifest.ts` 读 manifest，错误列出缺项与修复命令。
- `host.ts` 删除；`host.test.ts` → `sidecar.test.ts`（配置生成、manifest 校验、生命周期 fake child）。

## 6. 测试

- `sidecar-config.test.ts`：0600 写入、原子 rename、token/secret 不在 argv、路径字段。
- `sidecar-lifecycle.test.ts`：用 fake `fork`/EventEmitter 模拟 ready/error/exit；验证 ready 前显示 boot 窗、超时、`PORT_IN_USE` 重试 3 次、重启上限、close 超时强杀、退出码映射。
- `runtime-manifest.test.ts`：required 缺项、平台/架构/版本/`shellAbi` 不匹配。
- `smoke.mjs`：真实包启动后检查 sidecar 进程存在、窗口加载 refresh、本地模式 API 200；退出后进程消失。
- 不把 Electron 专有 API 引入 sidecar 模块，保持可在 Node 测试。

## 7. 安全

- 配置文件 0600；目录 0700。
- 子进程 env 最小化；不继承 shell 的 `MIMIR_*`、`DATABASE_URL`、`AUTH_SECRET`。
- sidecar 只绑 `127.0.0.1`；runtime 在本地模式结构性拒绝非回环。
- token 只写 cookie jar；不进 URL、日志、preload。
- 云端页面没有 preload；sidecar 只在本地模式存在。
- 单实例锁保留；sidecar 打开 SQLite 前父进程保证没有第二个工作区。
