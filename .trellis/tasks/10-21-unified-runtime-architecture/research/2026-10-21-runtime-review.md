# Runtime/宿主方案复审（2026-10-21）

> 本文件记录对 C 版方案的调研、代码复核与本地实测。结论用于修订 `design.md` 与子任务计划；不是新的现行契约。

## 1. 外部参照：WeKnora

- 版本：v0.8.3（README badge，2026-10-14 release）；`main` 最新 commit `9110cb2da17000e9f8fcc90dadb59bce3e31392d`（2026-10-21T08:43:10Z，`fix(postgres): support pgsearch keyword scoring (#4502)`）。
- 来源：<https://github.com/Tencent/WeKnora>、<https://raw.githubusercontent.com/Tencent/WeKnora/main/docs/LITE.md>、<https://raw.githubusercontent.com/Tencent/WeKnora/main/website-docs/05-clients/05-desktop.md>、<https://raw.githubusercontent.com/Tencent/WeKnora/main/website-docs/01-getting-started/02-installation.md>、<https://raw.githubusercontent.com/Tencent/WeKnora/main/docker-compose.yml>。

### 事实

1. WeKnora 有四种部署：Docker Compose（frontend Nginx + app + docreader + Postgres + Redis）、Helm、**Lite 单二进制**（SQLite + FTS5/sqlite-vec + 内存队列 + 内嵌 `web/`）、**Wails v2 桌面应用**（Lite 运行时 + Go 内嵌后端）。
2. 桌面应用在**同一进程**内构建与服务器版相同的依赖注入容器，启动 `http.Server`；Wails WebView 通过 `assetserver` 的**反向代理**访问 `127.0.0.1:<随机或固定端口>`；前端 SPA 由后端 `./web` 提供。
3. 桌面启动时生成随机凭据，通过 Wails 绑定 `GetAutoSetupToken` 交给内置前端，前端用 `X-WeKnora-Desktop-Token` 调 `POST /auth/auto-setup`；无凭据的请求（含局域网其他设备）被拒绝。桌面偏好 `desktop-prefs.json` 权限 0600。
4. Lite/桌面共用同一套前端产物与后端路由；桌面专属能力通过 `window.go.main.App.*`、`wails-desktop` class、`window.__WEKNORA_API_BASE__` 等**运行时检测**接入。
5. 标准版前端由独立 Nginx 提供并反代 `/api/`；Lite/桌面由后端进程自身提供 SPA。

### 对 Mimir 的适用性

**适用的部分**：

- “同一套后端 + 同一套前端静态产物，宿主只负责进程/窗口/本地令牌”是可行的，和 C 版方向一致。
- 桌面用**每进程随机凭据 + 本机回环 + 同源 HTTP**，与 D-100 的本地令牌同构；WeKnora 的 `GetAutoSetupToken` 佐证“令牌只经原生桥/文件交给本地页面”是成熟做法。
- Lite 单二进制内嵌 `web/` 并由后端服务，佐证 runtime 产物自带静态资源、宿主不再各自构建前端是合理的。
- 桌面偏好文件 0600、数据目录在 Application Support，和 Mimir 的 userData 设计一致。

**不直接照搬的部分**：

- WeKnora 桌面是 **Go/Wails 同进程**，Mimir 是 Electron/Node；WeKnora 的同进程方案没有解决 Node 服务端重计算阻塞 Electron 主进程的问题。Mimir 选择 sidecar 是为了崩溃隔离与主进程响应性，代价是进程生命周期管理；两者都保留同源 HTTP，不能因为 WeKnora 同进程就否定 sidecar。
- WeKnora 前端用运行时检测区分桌面；Mimir 的 D-103/D-104 已论证编译期平台分离更适合类型安全与产物隔离。**不**因 WeKnora 的做法改回 `window.mimirDesktop` 运行时分支。
- WeKnora 桌面尚未正式发布（文档明确 warning），其桌面打包/更新成熟度不能作为 Mimir 发布链路的依据。
- WeKnora 标准版是多服务（Nginx + app + docreader + Redis/Postgres）；Mimir 的单用户单进程同源模型（D-046、`lib/static.ts`）不同，不引入独立前端容器。

**结论**：C 版的“runtime 产物 + 薄宿主 + 本地令牌 + 同源 HTTP”有外部先例；sidecar、编译期平台分离、单进程静态服务是 Mimir 语境下的合理差异，应在决策记录里写明。

## 2. 本地实测

环境：macOS arm64，系统 `node v24.21.0`，pnpm 12.4.2，Electron 44.7.0（内嵌 Node v24.21.0），Vite 8.3.4。

### 2.1 `pnpm deploy` 的补丁路径

- `pnpm --filter @mimir/server deploy --prod --node-linker hoisted /tmp/mimir-deploy-test` 失败：
  `Failed to read patch file /tmp/mimir-deploy-test/../../Users/admin/.../patches/cfb@1.2.2.patch`。
- 说明 deploy 目标在仓库外时，`patchedDependencies` 的相对路径解析失败。
- 目标在仓库内（`apps/server/.deploy-test`）时补丁路径可解析；随后因 `@ironcalc/wasm-xlsx@0.9.0` 在 npmmirror 返回 404、离线 store 缺 `inherits@2.0.4` 而未完成依赖安装。这是本机 registry/store 问题，不是方案问题。
- **修订**：`build-runtime.mjs` 必须先在仓库内 staging（如 `<repo>/.runtime-staging/<platform>-<arch>`）执行 `pnpm deploy`，再复制到任意 `--out`（包括 Docker 的 `/out`）。staging 必须 gitignore 并在失败时清理。
- 已验证 deploy 输出会包含 `dist/`、`drizzle/`、`drizzle-sqlite/`、`package.json`（即使 `dist` 在 gitignore）；但也会带 `src/`、`test`、`scripts`、`vite.config.ts` 等，需要在 `apps/server` 加 `.npmignore`/`files` 或在 artifact 构建时裁剪。

### 2.2 相对 base 的 Web 构建

- `pnpm --filter @mimir/web exec vite build --base=./` 成功。
- `dist/index.html` 输出 `href="./favicon.svg"`、`src="./assets/index-*.js"`、`modulepreload` 也是 `./assets/...`。
- 在 `<head>` 注入 `<base href="/app/mimir/">` 后，这些相对 URL 可解析到 `/app/mimir/...`；深路由也成立。
- **但**构建产物里仍有绝对路径：
  - `packages/office/src/editors/pdfjs-assets.ts` 在模块加载时用 `import.meta.env.BASE_URL` 计算 `/pdfjs/...`（base 为 `./` 时得到根路径 `/pdfjs`）。
  - `packages/office/src/editors/PdfEditor.tsx` 把 `BASE_URL` 传给 OCR，`pdf-ocr` 路径同样是绝对根路径。
  - `packages/chat/src/runtime/io.ts` 的 `DEFAULT_CHAT_URL` 用 `BASE_URL` 拼 `/api/chat`。
  - `packages/renderer/src/lib/app-path.ts` 也用 `BASE_URL`；这是已知的，但其他三个包没有走它。
- **修订**：新增 `packages/shared/src/runtime-base.ts`（`@mimir/shared/runtime-base`），统一读 `globalThis.__MIMIR_BASE_PATH__` 并回退 `import.meta.env.BASE_URL`；renderer、chat、office、web 都改用它。否则 fnOS 子路径下 PDF/OCR/聊天会 404，而根路径测试全绿——正是“只在一个平台出现”的静默错误。

### 2.3 Electron sidecar 的可行性

- `ELECTRON_RUN_AS_NODE=1 <Electron 二进制> -e "..."` 正常，报告 `node v24.21.0`、`electron 44.7.0`。
- 用 `child_process.fork` + `execPath: Electron 二进制` + `ELECTRON_RUN_AS_NODE=1` + `stdio: ['ignore','pipe','pipe','ipc']` 启动子进程，子进程 `process.send({type:'ready',...})` 父进程收到，`child.kill()` 后退出。说明 fork/IPC 路径可行。
- 在同一 Electron Node 子进程中 `require` 已 deploy 的 `better-sqlite3`、`sqlite-vec`、`@node-rs/jieba` 成功：`vec_version() = v0.1.9`，jieba 切出 `["客户端","更新"]`。说明 N-API 原生模块跨 Node 22/Electron Node 24 可用。
- **修订**：sidecar 设计可以保留 `fork` + `ELECTRON_RUN_AS_NODE`；不需要 `utilityProcess`。仍需在 Windows/macOS 真实包上验证 `fork` 的路径、权限与进程树回收。

### 2.4 fnOS 网关范围

- 现有 `app.ts` 中 `handleAuth` 只包裹 Better Auth 的通配 handler；`routes/auth.ts` 的 `/api/auth/sign-in/identifier` 是单独注册的，**不经过** `fnosAuthRequest/fnosAuthResponse`。
- 现有 `verify-fnos.mjs` 用 `/api/auth/sign-in/email`（走 `handleAuth`）验证 HTTPS Cookie Secure；identifier 登录在 fnOS 下的 Secure/Origin 行为没有覆盖。
- **修订**：runtime 的 fnOS 适配器应对 `/api/auth/*`（包括 identifier）统一做 Origin/协议适配与 Set-Cookie Secure 处理；这是行为修正，必须补测试并在决策记录中说明。`/api/auth/setup/state` 的 GET 不应被写请求 Origin 规则误伤。

## 3. 设计复审发现（需要改文档/计划）

1. **`ServerConfig` 不能放在 `runtime/`**：core 若 import `runtime/server-config.ts`，就形成 core→runtime 反向依赖，违反边界。改为中立的 `apps/server/src/config.ts`（只含类型/快照/getter），runtime 与 core 都可 import。
2. **测试初始化顺序**：`db/schema.ts` 在 import 时选方言；`auth.ts`/`app.ts` 是模块级单例。新增 `server-runtime.ts` 的 `ensureServerRuntime()`（configureDb + createAuth），由 `createApp()`/`boot()` 调用；`test/setup.ts` 先 `configureServer` 再动态 import `server-runtime`。否则测试在 import 阶段就会失败。
3. **CI 传 900MB artifact 不划算**：`apps/desktop/server-deploy` 约 909MB（node_modules 886MB）。4 个平台上传/下载约 3.6GB，可能比原生 rebuild 更慢。改为“同一脚本在每个原生平台各构建一次”，不做跨作业 artifact 传递；`runtime` 作业只做 Linux 结构验证（不上传大包）。这与“每个平台只构建一次”不矛盾；原生依赖本来就必须原生构建。
4. **Docker 与 fnOS 的 libc**：Docker 现在 Alpine/musl，fnOS 是 glibc；要共用 Linux 产物必须统一。Docker 改 `bookworm-slim`（glibc 2.36）是合理起点，但 fnOS 的 glibc 下限未知；若要真正共用，Linux runtime 应在固定 bookworm 容器中构建，并在目标 fnOS 验证。否则只保证“同一脚本/布局”，不承诺逐字节相同。
5. **`files`/`.npmignore`**：`pnpm deploy` 会带 `src/test`、`scripts`、`vite.config.ts` 等；artifact 应裁剪。`apps/server/package.json` 的 `exports` 目前指向 `src`，若改为 `dist` 可让 deploy 只带构建产物；但需确认没有外部 `@mimir/server` 源码 import（除待删除的 desktop `host.ts` 类型 import）。
6. **fnOS 版本握手**：`launch.mjs` 不能可靠读取包根 `manifest`（`TRIM_APPDEST` 是应用代码目录）；构建时生成 `app/version.json`，launch 读它与 `server/manifest.json` 比较，最稳。
7. **静态注入安全**：`basePath` 必须校验（只允许 `/` 与 `/segment`），注入 `<script>` 前做 JSON 转义；避免配置注入变成 XSS。
8. **`listener.host` 可选**：Docker 现在依赖 `serve` 默认绑定所有接口；config 不强制 `host`，桌面显式 `127.0.0.1`，fnOS 走 Unix。
9. **`package.json` bin/exports**：若 `exports` 改 `dist`，需删除 `apps/desktop/src/main/host.ts` 的 `@mimir/server` 类型 import 与 `apps/desktop/package.json` 的 devDependency；否则 workspace 解析会在 dist 不存在时失败。
10. **`BASE_URL` 审计**：除上述四个文件，`apps/web/src/index.tsx` 也要改为运行时 helper；`api.ts` 已通过 `appBasePath` 间接使用。
11. **测试账号**：新增 smoke/单测继续用 `admin@example.com` / `12345678` / `admin`，不要新建账号。
12. **文档**：D-046 的“进程内宿主”部分将被 D-114 取代，需在 D-046 顶部加注；D-103/D-104 的 UI 边界不变。

## 4. 修订后的推荐顺序

1. 配置中立化 + `server-runtime` + 测试 setup（子任务 1）。
2. artifact 脚本（仓库内 staging、manifest、裁剪）+ Docker/fnOS/desktop 消费（子任务 2）。
3. sidecar（fork + IPC；保留 dev-only in-process 开关一版）（子任务 3）。
4. 共享 `runtime-base` + web/fnOS 单构建（子任务 4）。
5. CI/发布不做大 artifact 传递；版本握手与文档（子任务 5）。

## 5. 未验证项

- Windows NSIS 安装后的 sidecar 进程树、防火墙/控制台行为。
- macOS 签名/公证包的 `fork` 子进程与更新安装。
- fnOS 实机 glibc 下限、覆盖升级、HTTPS 内嵌窗口。
- `pnpm deploy` 在 CI registry 下的完整依赖安装（本机 npmmirror 404）。
- Docker bookworm 产物的 native 模块加载与容器 smoke。
