# 开源项目对照：多端复用与本地运行时

> 目的：在实施前再找一轮“有没有更优解”。本文件只记录事实、对照与建议；现行契约仍以 `design.md` 和项目规范为准。

## 1. 样本与版本

| 项目 | 版本/提交 | 形态 | 与 Mimir 的相关性 |
|---|---|---|---|
| [SiYuan](https://github.com/siyuan-note/siyuan) | v3.8.8，`bfe36100477b7bbd66db1a8b8cff5547b2ccdb59`（2026-10-20） | Go kernel 单二进制 + Electron 壳 + Docker；桌面与 Docker 共用 kernel 和 `stage` Web 资源 | **最高**：桌面/服务器/NAS 式部署复用同一运行时；kernel 子进程；版本握手；启动/退出错误分类 |
| [WeKnora](https://github.com/Tencent/WeKnora) | v0.8.3，`9110cb2da17000e9f8fcc90dadb59bce3e31392d`（2026-10-21） | Go 标准版多服务；Lite 单二进制；Wails v2 桌面（同进程后端 + 反向代理） | **高**：同一套后端/前端；桌面免登录令牌；本地回环；Lite 单二进制 |
| [LobeHub Desktop](https://github.com/lobehub/lobehub/tree/main/apps/desktop) | `4c5e9ad359c4d6b51eb7b2b736e5e5341233adf3`（2026-10-21） | Electron shell + `core.asar`；core manifest 带 `shellAbi`/`version`/`seq`/tree/signature；可独立 OTA | **中高**：shell/core 分离、ABI 握手、artifact 组装；桌面依赖大量原生模块 |
| [Joplin](https://github.com/laurent22/joplin) | 参考 | Electron/CLI/移动端/同步服务器；共享 `lib`，UI 各自实现 | 中：共享契约/库，不共享 UI |
| [Immich](https://github.com/immich-app/immich) | 参考 | NestJS server + web + mobile；OpenAPI 生成客户端 | 中：服务端契约代码生成；无桌面 |
| [Memos](https://github.com/usememos/memos) | 参考 | Go 单二进制 + 内嵌 Web；Docker | 中：单二进制 + 内嵌 Web 的极简形态 |

## 2. SiYuan：kernel + 壳 + 同一份 Web 资源

### 事实

- `app/package.json` 的 Electron 入口是 `./electron/main.js`；`electron-builder.yml` 设置 `asar: false`，并把 `kernel`、`stage`、`appearance`、`guide` 等作为 `extraResources` 打进安装包。
- `app/electron/main.js`：
  - 本地端口从 `6806` 起，`getAvailablePort()` 用 `net.createServer().listen(0)` 预选空闲端口；`createLocalKernelTarget` 生成 `https://127.0.0.1:<port>`。
  - `initKernelAttempt` 用 `child_process.spawn(kernelPath, ["serve","--port",currentKernelPort,"--wd",appDir,"--attach-ui", ...], { detached: false, stdio: "ignore" })` 启动 `SiYuan-Kernel`；记录 PID；监听 `close`。
  - 内核退出码有明确语义：`20` 数据库不可用、`21` 端口监听失败、`24` workspace 被锁定、`25` workspace 初始化失败、`26` 文件系统访问失败；分别弹不同错误窗。
  - 启动时先显示 `boot.html` 启动窗，收到前端 `siyuan-ready-to-show` 后再显示主窗；60 秒兜底。
  - 远程 kernel 模式在加载本地 UI 前检查 `/api/system/version` 与客户端版本，不一致直接阻断（`getRemoteKernelVersionStatus`）。
  - 更新/关机时先请求 kernel 优雅退出，超时后 `SIGKILL` 残留进程。
- `Dockerfile` 用同一份 `app/` Web 构建产物和 Go kernel，最终镜像 `/opt/siyuan/{kernel,stage,appearance,...}`；桌面 `extraResources` 也是同一套目录。
- 结论：**同一份 runtime（kernel）+ 同一份 Web 静态资源，Electron 壳和 Docker 只负责启动/窗口/更新**；桌面端不单独构建一套 UI。

### 对 Mimir 的适用性

**采用**：

- 桌面启动 kernel 子进程、预选回环端口、父进程管生命周期，和 C 版 sidecar 同构。
- 启动窗 + 就绪信号 + 超时兜底：Mimir 现在本地模式在 sidecar 就绪前没有窗口；可复用/新增一个 boot 页。
- 退出码/错误分类：Mimir 的 sidecar 现在只能给 stderr 尾部；应给 `PORT_IN_USE`、`DB_LOCKED`、`MIGRATION_FAILED`、`CONFIG_INVALID` 等结构化错误。
- 更新前优雅退出 + 超时强杀：与 C 版计划一致，可补显式超时。
- 远程 kernel 版本检查：对应 Mimir 云端模式。但 Mimir 云端加载的是远端 Web UI，版本不一致不一定要阻断；本地 sidecar 必须严格握手。

**不直接采用**：

- SiYuan 的 kernel 是 **Go 单二进制**，静态资源在 `extraResources`、`asar:false`；Mimir 的 Node 服务端带大量原生/WASM 依赖，不能简单做成单二进制。
- SiYuan 桌面和 Web 共用一份 UI，依赖大量运行时 `window`/kernel 判断；Mimir 有 TanStack 类型安全路由和 D-103/D-104 的编译期平台分离。不能因为 SiYuan 这么做就推翻 D-104。
- SiYuan 本地 kernel 用 HTTPS 自签证书；Mimir 的 HTTP 回环 + 本机令牌（D-100）已足够，引入证书/信任链只会增加复杂度。

## 3. WeKnora：Lite 单二进制 + Wails 同进程桌面

### 事实

- `website-docs/01-getting-started/02-installation.md`：Lite 单二进制 = SQLite + FTS5/sqlite-vec + 内存队列 + 内嵌 `web/`；桌面 = Wails v2 + `cmd/desktop`。
- `website-docs/05-clients/05-desktop.md`：桌面在同一进程内 `container.BuildContainer()` + `http.Server`；Wails `assetserver` 反向代理到 `127.0.0.1:<port>`；前端 SPA 由后端 `./web` 提供；`GetAutoSetupToken` 把每进程随机凭据交给前端，`X-WeKnora-Desktop-Token` 调 `/auth/auto-setup`；偏好文件 0600。
- 桌面首启/端口：`http_port=0` 时 `:0` 随机端口 + `listenWithRetry` 指数退避（最多 10 次）；默认只绑回环，可选 `0.0.0.0` + LAN IP。
- 桌面应用尚未正式发布（文档 warning），不能把它的发布成熟度当作依据。

### 对 Mimir 的适用性

**采用**：

- “同一后端 + 同一前端静态产物 + 每进程随机令牌 + 回环”与 C 版一致。
- 端口随机 + 退避重试：Mimir sidecar 预选端口失败时应重试（建议 3 次，指数退避）。
- 桌面偏好/配置 0600、数据目录在用户应用数据目录：Mimir 已有。
- Lite/标准共用一个运行时（配置切换 DB/队列）：Mimir 的 `RuntimeConfig` 同理。

**不直接采用**：

- Wails 同进程后端：Mimir 是 Electron/Node，服务端重计算会阻塞主进程；sidecar 的隔离收益更大。
- WeKnora 桌面未正式发布，其更新/打包链路不成熟；Mimir 已有真实发布链路，不能照搬。
- WeKnora 前端用 `window.go`/`wails-desktop` 运行时检测；Mimir 的编译期平台分离更适合类型安全。

## 4. LobeHub Desktop：shell/core 分离与 ABI manifest

### 事实

- `apps/desktop/package.json`：`main: "./shell/main.js"`；`build:main` 构建 main/preload/renderer + CLI，然后 `scripts/assembleCore.mjs`。
- `assembleCore.mjs` 把 `apps/cli/dist/index.js`、`dist/main`、`dist/preload`、`dist/renderer`、`resources`、`electron-log` 组装为 `core-dist`，写最小 `package.json`；`packBuiltinCore.mjs` 用 `@electron/asar` 打成 `core.asar`（`unpackDir: 'cli'`）。
- `buildCoreManifest.mjs` 生成 core manifest：`channel`、`platform`、`version`、`seq`、`shellAbi`（SHA-256）、`tree`（每文件 sha256）、`full`/`patches`、`objectsBaseUrl`、`rollout`、`signature`；`shellAbi` 必须匹配。
- `electron-builder.mjs` 把 `core.asar`/`core.asar.unpacked` 作为 `extraResources`；`native-deps.config`/`external-runtime-deps.config` 解决 pnpm 原生模块/外部运行时依赖。
- 结论：**shell 与 core 可独立更新**，用 `shellAbi` + manifest 保证兼容；core 是可签名的 CAS/OTA 包。

### 对 Mimir 的适用性

**采用（轻量版）**：

- 在 manifest 中加 `shellAbi`（或把 `protocolVersion` 明确定义为 shell↔runtime 的 ABI），sidecar 启动前校验；这比只比产品版本更准确。
- artifact 组装采用“显式输入清单 + 最小 package.json”，避免把测试/脚本带进产物；Mimir 用 `.npmignore` 可达同样效果。
- 原生模块/外部依赖用显式配置，不靠 electron-builder 的自动遍历；Mimir 已有 `finalizeResourceTree` + `asarUnpack`，可保留。

**不采用**：

- 完整 core OTA（CAS、补丁、签名、rollout、独立更新通道）：Mimir 桌面更新是整包安装，服务端/前端/迁移/运行时必须同版本；引入第二条更新链路会带来兼容矩阵、回滚和数据迁移风险。当前用 `shellAbi` + 锁步版本足够。
- `core.asar` 打包：Mimir 的 runtime 已在 `resources/server` 外置，便于 sidecar 读取原生模块和 worker；不需要再套一层 asar。

## 5. 其他项目的边界

- **Joplin**：共享 `lib` 契约/同步逻辑，Electron/移动端/CLI 各自 UI；说明“共享库、不共享 UI”是成熟做法，但 Mimir 的 Web/桌面 UI 复用已经比它更彻底。
- **Immich**：OpenAPI 生成客户端；Mimir 的 `@mimir/shared` zod 契约已经承担同一职责，且运行时校验更强；不需要再引入代码生成。
- **Memos**：Go 单二进制 + 内嵌 Web，适合简单服务；Mimir 的 Node 依赖矩阵（PDF/Office/OCR/AI）不适合走单二进制。

## 6. 结论：没有发现推翻 C 版的更优架构

外部项目的共同模式与 C 版一致：

1. **一个后端运行时**（kernel / Lite / core）同时服务桌面、Web、容器。
2. **桌面是薄壳**：启动本地运行时、开窗、令牌/更新；不在壳里重写业务。
3. **同一份 Web 静态资源** 尽量复用；桌面专属能力通过壳/运行时能力注入。
4. **版本/ABI 握手** 在加载 UI 或开放端口前完成。
5. **桌面运行时独立进程**（SiYuan）比同进程（WeKnora/Wails）更适合重计算/崩溃隔离；Mimir 选 sidecar 有依据。

因此建议**保留 C 版主体**，只吸收四个低成本改进：

- **A. 启动窗 + 结构化错误**（SiYuan）：sidecar 就绪前显示 boot 页；runtime 用稳定错误码/消息，父进程映射为可操作文案。
- **B. `shellAbi` 握手**（LobeChat）：manifest 增加 `shellAbi`，sidecar 在 fork 前校验；`protocolVersion` 保留给 HTTP/API。
- **C. 端口退避重试**（WeKnora）：预选端口 + 绑定失败重试 3 次（指数退避），失败再报错。
- **D. 产物显式清单**（LobeChat/SiYuan）：artifact 只带 `dist`/`drizzle*`/`node_modules`/`package.json`/`manifest`；不把测试/构建脚本带进去。

明确不采用：单二进制（Node 依赖矩阵）、core OTA（锁步发布）、桌面/Web 单 UI 运行时检测（D-103/D-104）、Wails/Tauri 重写、HTTPS 本地回环。

## 7. 仍待验证

- Windows 上 Electron `fork` 子进程的进程树/控制台/ACL，以及 asar 内 renderer 的读取（macOS 已实测可读）。
- fnOS 实机 glibc 下限与 sidecar 无关（fnOS 走 in-process launch），但 runtime 产物仍要在目标设备验证。
- LobeChat 的 `shellAbi` 是 SHA-256 构建指纹；Mimir 只需要整数 ABI 还是也要构建指纹，需在实现时定。
- 启动窗是否复用 `setup.html` 还是新增 `boot.html`；复用会多一个模式分支，新增会多一个 HTML 入口。建议先新增极简 `boot.html`，不污染选择页。
