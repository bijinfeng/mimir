# 统一运行时与宿主架构：技术设计

> 外部对照与复审证据：[`research/2026-10-21-open-source-comparison.md`](./research/2026-10-21-open-source-comparison.md)、[`research/2026-10-21-runtime-review.md`](./research/2026-10-21-runtime-review.md)。

## 1. 边界

这次改造把“部署形态”从核心代码里拿出去，但**不重写业务**。三条边界：

1. **core（`apps/server/src` 现有目录）**：路由、服务、DB schema、鉴权、插件装配、检索。只认 `ServerConfig`，不读 `process.env`，不判断 fnOS/桌面/静态目录。
2. **runtime（新增 `apps/server/src/runtime/`）**：把宿主给的 `RuntimeConfig` 翻译成 core 能用的能力；负责进程生命周期、TCP/Unix 监听、静态资源、fnOS 网关适配、本地令牌、日志、信号、CLI。
3. **host（Docker / fnOS / desktop）**：只负责“平台事实 → `RuntimeConfig`”和进程管理；不 import core 内部模块，不知道 `dist` / `drizzle-sqlite` / `node_modules` 的具体布局，只读 `manifest.json`。

**为什么 runtime 不单独开一个 workspace 包**：现有 Vite 构建依赖 `preserveModules` 与 `import.meta.url` 的相对位置来定位 worker（`chat-attachment-worker.js`、`attachment-parser.js`）。把 core 和 runtime 拆成两个包会让 workspace 源码被跨包内联，产物目录深度变化，worker 与迁移路径会静默失效。当前阶段用**同一构建单元 + 受限 `exports` + 边界测试**实现隔离；等 worker 定位改为显式配置后，再考虑物理拆包。宿主的隔离由“只消费 runtime 产物/CLI”保证，而不是靠目录名。

## 2. 目标结构

```
packages/shared/
  src/runtime-base.ts      runtime base path（renderer/chat/office/web 共用，新增子路径导出）

apps/server/
  src/
    config.ts              ServerConfig + configureServer/getServerConfig（中立层，core 与 runtime 都可 import）
    server-runtime.ts      ensureServerRuntime(): configureDb + createAuth（core 内，供 createApp/boot/测试调用）
    app.ts                 createApp({ staticMiddleware?, corsOrigin? })
    boot.ts                boot(): ensureServerRuntime → 迁移 → 建号/播种 → createApp
    auth.ts                createAuth(config) + setAuth()
    db/client.ts           configureDb(config) / closeDb()；db 为 live binding
    db/schema.ts           按 ServerConfig.database.kind 选方言（必须在 configure 后 import）
    routes/ services/ lib/ plugins/ search/   # core，保持原位
    runtime/
      config.ts            RuntimeConfig zod schema + 从 env/JSON 加载 + toServerConfig
      start.ts             startRuntime(config)
      cli.ts               bin: mimir-runtime
      listeners/tcp.ts
      listeners/unix.ts
      gateway/fnos.ts      前缀剥离 + Origin 校验 + Cookie Secure
      static.ts            base path 注入 + 静态资源 + SPA 回退
      manifest.ts          读取/校验 manifest.json
      version.ts           productVersion / protocolVersion
    dev.ts                 开发入口：load env → configureServer → 动态 import boot → export app
  vite.config.ts           多入口：runtime/cli、runtime/index、db/migrate、worker
  package.json             exports: "./runtime"; bin: mimir-runtime
```

**`config.ts` 必须中立**：它只保存不可变快照和 getter，不 import `runtime/`、`boot`、`app`、`db/schema`。core 的 `config.*` 从这里取；`runtime/config.ts` 负责把宿主输入翻译成 `RuntimeConfig` 再 `toServerConfig`。这样 core→runtime 的反向依赖在结构上不存在。

**`server-runtime.ts` 解决初始化顺序与测试**：`ensureServerRuntime()` 在首次调用时 `configureDb(getServerConfig().database)` 并 `setAuth(createAuth(...))`；`createApp()` 与 `boot()` 都先调用它。测试的 `setupFiles` 先 `configureServer(testConfig)`，再**动态 import** `server-runtime` 并调用 ensure；这样 `db/schema.ts` 在选方言前已经拿到配置。`db`/`auth` 用 live binding + setter，不在模块顶层创建。

物理目录保持 `apps/server`，不改包名。`package.json` 的 `exports` 只暴露 `./runtime`（以及测试需要的 `./runtime/config`），不再暴露 core 根入口；desktop 不再依赖 `@mimir/server` 的类型，改为消费 runtime 的 `manifest.json` 与 sidecar 消息。这样“宿主 import core”在模块解析层面失败。

## 3. 配置

`RuntimeConfig` 是**可序列化的纯数据**（能写 JSON、能跨进程），不包含函数、类或 `process.env` 引用。

```ts
type RuntimeConfig = {
  product: { version: string; protocolVersion: number; shellAbi: number }
  nodeEnv: 'production' | 'development' | 'test'
  dataDir: string
  database:
    | { kind: 'sqlite'; file: string }
    | { kind: 'postgres'; url: string }
  listener:
    | { kind: 'tcp'; host: string; port: number }
    | { kind: 'unix'; path: string; mode?: number }
  publicUrl: string
  auth: {
    secret: string
    owner?: { email: string; password: string }
    localToken?: string
    fnosGateway?: { basePath: string }
    trustedOrigins: string[]
    cookiePath?: string
    secureCookies?: boolean
  }
  static?: { dir: string; basePath: string }
  model?: {
    apiKey: string
    baseUrl: string
    providerName: string
    chatModel: string
    reasoningModel: string
  }
  miniappEnabled?: boolean
}
```

- `loadRuntimeConfigFromEnv(env = process.env)` 是旧的 `env.ts` 的唯一替代：把 `DATA_DIR`、`DATABASE_URL`、`PORT`、`AUTH_SECRET`、`WEB_ORIGIN`、`SERVER_URL`、`OWNER_*`、`MODEL_*`、`MIMIR_MINIAPP_ENABLED`、`WEB_DIST`、`MIMIR_BASE_PATH`、`MIMIR_FNOS_SOCKET`、`MIMIR_LOCAL_MODE`、`MIMIR_LOCAL_TOKEN` 映射成新结构。只有 runtime 调它；core 不碰。
- `loadRuntimeConfigFile(path)`：desktop/fnOS 用；文件 0600，原子写由宿主负责。
- `toServerConfig(config)`：core 用的子集（`product`、`nodeEnv`、`dataDir`、`database`、`auth`、`model`、`miniappEnabled`、`migrations`）。`configureServer()` 把它放进 `src/config.ts` 的模块级不可变快照；`getServerConfig()` 未配置时抛错。
- **配置必须在 import core 之前设置**：runtime 的 `startRuntime` 先 `configureServer(config)`，再动态 `import('../boot.js')`。原因不是“懒加载好看”，而是 `db/schema.ts` 在 import 时按方言选表对象；`auth.ts`/`db/client.ts` 也持有模块级单例。动态 import 把顺序变成一个显式步骤，并由 `runtime-boundary.test.ts` 守住：
  - core 目录（`app.ts`、`boot.ts`、`auth.ts`、`db/`、`routes/`、`services/`、`lib/`、`plugins/`、`search/`）不得 import `runtime/`
  - `src/config.ts` 不得 import `boot`/`app`/`db/schema`/`runtime/`
  - `runtime/start.ts` 必须先 `configureServer`，再动态 import `boot`
- `ServerConfig` 的 getter 取代 `env.*`。为了减少一次性改动，core 内保留一个 `config` 导出对象（getter 委托 `getServerConfig()`），逐个把 `env.x` 改成 `config.x`；`env.ts` 删除。
- **测试初始化**：`src/test/setup.ts` 先 `configureServer(toServerConfig(loadRuntimeConfigFromEnv()))`，再 `await import('../server-runtime.js')` 调用 `ensureServerRuntime()`；`global-setup.ts` 用同样顺序配置后动态 import `db/migrate`。`helpers.ts` 的 `createApp()` 因 `ensureServerRuntime()` 可继续在模块顶层调用。

## 4. 启动与监听

`startRuntime(config)`：

1. `configureServer(config)`
2. 动态 import `boot` → `boot()`：
   - `ensureServerRuntime()`：`configureDb(config.database)` + `setAuth(createAuth(config.auth))`
   - SQLite 迁移 / Postgres 扩展与迁移
   - 所有者建号、默认内容、会话附件恢复
   - `createApp({ staticMiddleware, corsOrigin })`
3. 监听：
   - TCP：`serve({ fetch: app.fetch, port, hostname })`；`port: 0` 时从 `info.port` 取实际端口。
   - Unix：`createAdaptorServer({ fetch })` + `listen(path)`；先清理失效 socket，权限 0600（fnOS 目录权限由宿主负责）。
4. 返回 `{ server, app, origin, close }`；`close()` 先关 HTTP，再 `closeDb()`，幂等。
5. CLI 入口负责信号和协议消息：
   - 父进程通过 fork IPC 时：`process.send({ type: 'ready', origin, version, protocolVersion })`；失败 `process.send({ type: 'error', message })` 后退出 1。
   - 无 IPC（容器/直接运行）时：stdout 打印一行 JSON `{"type":"ready",...}`；日志走 stderr。
   - SIGTERM/SIGINT：`await close()`，退出 0；10 秒兜底退出 1。

**core 的 `createApp` 不再挂静态资源**。它接收一个 `staticMiddleware?: (app) => void`，在注册 API 路由之前调用；runtime 提供实现，dev 不传。CORS 由 `corsOrigin?: string` 决定；fnOS 传 `undefined`（同源网关），其他部署传 `publicUrl`。

**fnOS 网关**从 `app.ts`/`auth.ts` 移到 `runtime/gateway/fnos.ts`：

- `stripPrefix(request, basePath)`：只接受 `/app/mimir` 与 `/app/mimir/*`，剥离后重建 `Request`。
- `adaptAuthRequest(request)`：当前 `fnosAuthRequest` 的逻辑（Origin/Referer 同源、`x-forwarded-proto` 一致、写请求必须有 Origin）。
- `adaptAuthResponse(response, request)`：HTTPS 时给 Set-Cookie 补 `Secure`。
- 只在 `listener.kind === 'unix' && auth.fnosGateway` 时包裹；core 的 `app.ts` 始终 `auth.handler(request)`，没有 fnOS 分支。
- Cookie path/`secure`/`baseURL` 由 `createAuth(config.auth)` 显式接收，不再从 `env.fnosSocket` 推断。

**本地令牌**仍由 core 的 `requireAuth` 校验，但输入是 `config.auth.localToken`；`config.auth.localToken` 为空时该分支不存在。`ensureLocalOwner` 用同一字段判断，不再读 `env.localMode`。

## 5. 产物与 manifest

`scripts/build-runtime.mjs`：

```text
node scripts/build-runtime.mjs --out <dir> [--web <web-dist>] [--platform <p>] [--arch <a>] [--skip-build]
```

步骤：

1. `pnpm --filter @mimir/server build`（除非 `--skip-build`）
2. 在**仓库内** `staging = <repo>/.runtime-staging/<platform>-<arch>` 执行
   `pnpm --filter @mimir/server deploy --prod --node-linker hoisted <staging>`；
   **不要**直接 deploy 到 `<out>`：`pnpm` 的 `patchedDependencies` 会按目标目录相对定位补丁，仓库外目标会报 `Failed to read patch file`（实测 `/tmp` 目标）。
3. 确认 `<staging>/dist/runtime/cli.js`、`drizzle/`、`drizzle-sqlite/`、`package.json` 存在；缺一即失败
4. 如传 `--web`，复制到 `<staging>/web/dist`
5. `finalizeResourceTree(<staging>)`（把 `scripts/lib/resource-tree.mjs` 从 desktop 脚本提出来，三处共用）
6. 删除并创建 `<out>`，把 `<staging>` 复制为 `<out>/app`；清理 staging（成功或失败都要清）
7. 写 `<out>/app/manifest.json`：

```json
{
  "name": "mimir-runtime",
  "productVersion": "0.1.8",
  "protocolVersion": 1,
  "shellAbi": 1,
  "gitSha": "…",
  "platform": "linux",
  "arch": "x64",
  "libc": "glibc",
  "node": ">=22",
  "entry": "dist/runtime/cli.js",
  "library": "dist/runtime/index.js",
  "migrations": { "sqlite": "drizzle-sqlite", "postgres": "drizzle" },
  "web": "web/dist",
  "required": [
    "dist/runtime/cli.js",
    "dist/runtime/index.js",
    "drizzle-sqlite/meta/_journal.json",
    "drizzle/meta/_journal.json",
    "node_modules/better-sqlite3/package.json",
    "node_modules/sqlite-vec/package.json",
    "node_modules/@node-rs/jieba/package.json",
    "node_modules/@napi-rs/canvas/package.json"
  ],
  "schemaVersion": 1792311600001
}
```

- `productVersion` 继续以 `apps/desktop/package.json` 为发布真相（与 fnOS manifest 对齐）；`gitSha` 来自 `GITHUB_SHA` 或 `git rev-parse HEAD`，无 git 时写 `"unknown"`。
- `libc` 在 Linux 上探测（`process.report.getReport().header.glibcVersionRuntime` 或 `ldd --version`）；macOS/Windows 写 `"n/a"`。
- `schemaVersion` 取 SQLite journal 最后一条 `when`，仅用于诊断/握手，不作为迁移判定。
- `apps/server/.npmignore` 排除 `src/test`、`scripts`、`vite.config.ts`、`vitest*.ts`、`drizzle*.config.ts`、`public`、`tmp-*`、`_verify*`；`src` 保留以让 `exports` 的源码形态在 workspace 仍可用。artifact 不再带测试与打包脚本。
- **不做跨作业大 artifact 传递**：`apps/desktop/server-deploy` 实测约 909MB（`node_modules` 886MB），4 个平台上传/下载约 3.6GB，通常比原生 rebuild 慢。CI 在**每个原生平台各构建一次**，共享的是脚本、布局与 manifest，不是同一个 tar；Linux 结构验证作业不上传大包。若将来要 Docker/fnOS 共用 Linux 产物，再单独做固定 bookworm 容器的构建与验证。

宿主只读 manifest：

- Docker：构建时 `--web apps/web/dist`，运行时 `MIMIR_CONFIG` 或 env → config；静态目录 `web/dist`。
- fnOS：`build-fnos.mjs` 调同一脚本到 `staging/app/server`，并写 `staging/app/version.json`（产品版本）；`launch.mjs` 读 `version.json` 与 `server/manifest.json` 比较，校验后 `startRuntime(config)`。
- Desktop：`build-runtime.mjs --out apps/desktop/runtime-build`（不带 web）；afterPack 把 `runtime-build` 拷到 `resources/server`；`main` 读 `resources/server/manifest.json` 校验后启动 sidecar。

## 6. 桌面 sidecar

**进程**：`child_process.fork(runtimeEntry, ['--config', configPath], { execPath: process.execPath, env: { ...minimal, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore','pipe','pipe','ipc'], windowsHide: true })`。

- 不用 `utilityProcess`：`fork` 的 `process.send` 在纯 Node 测试里也能用，且不依赖 Electron 专有类型；`ELECTRON_RUN_AS_NODE=1` 让 Electron 二进制按 Node 运行。本地实测（Electron 44.7.0 / Node 24.21.0）：fork + IPC ready 正常，子进程可加载 `better-sqlite3`、`sqlite-vec`、`@node-rs/jieba`。
- `runtimeEntry` 来自 manifest，不硬编码。
- 端口：父进程用现有 `pickFreePort()` **预选**一个回环端口并写进配置，runtime 绑定该端口。这样 Better Auth 的 `baseURL`/`trustedOrigins` 在创建时就是确定的，避免 `port: 0` 后改 origin 的时序问题；仍有极小 TOCU 窗口，失败时重试一次。CLI 仍支持 `port: 0`。
- 配置文件写 `<userData>/runtime-config.json`（0600，临时文件 + rename）；内容含 `dataDir`、SQLite 文件、`listener: { kind:'tcp', host:'127.0.0.1', port }`、`auth.secret`、`auth.localToken`、`static: { dir: desktopRenderer, basePath: '/' }`、`product`。**不把 token 或密码放进 argv**。
- 子进程 env：从 `process.env` 复制后删除 `MIMIR_*`、`AUTH_SECRET`、`DATABASE_URL`、`OWNER_*`、`MODEL_*` 等敏感项，保留 `PATH`/`HOME`/`TMPDIR`/`SystemRoot` 等 OS 必需项；再加 `ELECTRON_RUN_AS_NODE=1`。Windows 的 0600 语义有限，依赖 userData 的 per-user ACL；文档写明。
- 父进程监听 `message`：
  - `ready`：校验 `version`/`protocolVersion`/`shellAbi`，解析 `origin`，把 localToken 写进对应 Session 的 cookie jar，再开窗。
  - `error`：`{ code, message }`；code 用稳定枚举（`PORT_IN_USE`、`DB_LOCKED`、`DB_UNAVAILABLE`、`MIGRATION_FAILED`、`CONFIG_INVALID`、`NATIVE_MODULE_FAILED`、`STATIC_MISSING`），父进程映射为可操作文案；stderr 尾部只进日志。
- **启动窗**：sidecar 就绪前先显示一个 `file://` 的极简 boot 页（新增 `boot.html`，不复用 setup 页的模式分支），显示「正在启动本地服务」与超时/错误；收到 ready 后再建主窗。避免本地模式启动时只有 Dock 图标、没有任何窗口。
- **端口退避重试**：预选端口后 fork；若 runtime 在 300ms 内以 `PORT_IN_USE` 退出，重新选端口/写配置并重试，最多 3 次（1s/3s 退避），仍失败显示错误。SiYuan/WeKnora 同类做法。
- `stdout`/`stderr` 写 `<userData>/logs/runtime.log`，5 MB 轮转到 `.1`；日志失败不阻断启动。
- 退出：`shutdown` IPC → 5 秒 → `SIGTERM` → 2 秒 → `SIGKILL`；父进程退出/更新安装前必须先关 sidecar；崩溃时最多自动重启 2 次（1s/3s 退避），仍失败则显示错误并保留退出选项。重启得到新端口/origin：重新注入 cookie、导航窗口；旧 cookie 清掉。
- 单实例：保留 Electron 单实例锁；sidecar 打开 SQLite 前由父进程保证没有第二个工作区。
- 云端模式：不启动 sidecar，保持 D-105 的系统边框与远端 Web。
- 回滚开关只做 **dev-only**：`!app.isPackaged && MIMIR_DESKTOP_HOST=in-process` 时走旧 `host.ts`；正式包永远 sidecar。sidecar 烟测通过后删除旧代码与开关。

**路径与产物校验**：

- packaged：`runtimeRoot = resources/server`，`runtimeEntry = <root>/dist/runtime/cli.js`，`webDist = app.getAppPath()/dist/renderer`。
- dev：`runtimeRoot = apps/desktop/runtime-build`，`webDist = apps/desktop/dist/renderer`。
- `runtime-manifest.ts` 读 `manifest.json`，检查 `required` 全部存在、`platform`/`arch` 匹配当前进程；失败时列出缺项与修复命令（`pnpm desktop:start`）。
- 旧 `host.ts`、`artifacts.ts`、`deploy-server.mjs` 在 sidecar 落地并通过烟测后删除。

## 7. Web base path

- `apps/web/vite.config.ts` 固定 `base: './'`；不再读 `MIMIR_BASE_PATH`。
- **新增 `packages/shared/src/runtime-base.ts`**，并通过 `@mimir/shared/runtime-base` 导出：
  ```ts
  const runtime = (globalThis as { __MIMIR_BASE_PATH__?: unknown }).__MIMIR_BASE_PATH__
  const viteBase = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL
  export function readRuntimeBasePath(): string {
    const raw = typeof runtime === 'string' ? runtime : (viteBase ?? '')
    if (!raw.startsWith('/') || raw.startsWith('//')) return ''
    const trimmed = raw.replace(/\/+$/, '')
    return trimmed === '' ? '' : trimmed
  }
  export function runtimeBasePath(): string {
    const base = readRuntimeBasePath()
    return base === '' ? '/' : `${base}/`
  }
  ```
- 四个漏点必须一起改，否则只有 fnOS 子路径会 404（根路径测试全绿）：
  - `packages/renderer/src/lib/app-path.ts`：`appBasePath = readRuntimeBasePath()`；
  - `packages/chat/src/runtime/io.ts`：`DEFAULT_CHAT_URL = `${readRuntimeBasePath()}/api/chat``；
  - `packages/office/src/editors/pdfjs-assets.ts`：`PDFJS_ASSETS` 用 `readRuntimeBasePath()`；
  - `packages/office/src/editors/PdfEditor.tsx`：OCR 的 `baseUrl` 用 `readRuntimeBasePath()`。
- `apps/web/src/index.tsx` 用 `buildRouter(routeTree, runtimeBasePath(), …)`；`runtimeBasePath()` 返回带尾斜杠的公开前缀（root 为 `/`）。桌面 renderer 继续用 electron-vite 的 `./`，`appBasePath` 为空，行为不变。
- `runtime/static.ts`：
  - 只处理非 `/api`、非 `/healthz` 的 GET/HEAD；
  - `basePath` 校验为 `/` 或 `/segment`（只允许字母数字、`-`、`_`、`/`；拒绝 `..`、`//`）；
  - 文件必须落在 `dir` 内（normalize + 前缀检查）；
  - `index.html` 读取一次，注入 `<base href="${basePathWithSlash}">` 与 `<script>window.__MIMIR_BASE_PATH__=${JSON.stringify(basePath)}</script>`（`JSON.stringify` 防注入），缓存结果；
  - 哈希资源长缓存；HTML no-cache；无扩展名深路由回退 index；
  - 请求路径若以 `basePath` 开头则先剥离（兼容反代），否则按原路径。
- fnOS 构建不再用 `MIMIR_BASE_PATH=/app/mimir/` 重跑 `apps/web`；`build-fnos.mjs` 只构建一次 web，产物进 runtime 的 `web/dist`；`launch.mjs` 的 config 设置 `static.basePath = '/app/mimir/'`。
- `index.html` 的 `%BASE_URL%` 在 `base: './'` 下变成 `./`；favicon 由 `<base>` 解析，dev 根路径也成立。

## 8. 版本握手

- `productVersion`：`apps/desktop/package.json`；`protocolVersion`（HTTP/API 契约）与 `shellAbi`（shell↔sidecar IPC/生命周期契约）：`apps/server/src/runtime/version.ts` 的常量，当前都为 `1`。
- `manifest.json` 写三者；`/healthz` 返回 `{ ok: true, version, protocolVersion }`；sidecar 的 `ready` 消息带 `shellAbi`。
- desktop：
  - 启动 sidecar 前比对 manifest `productVersion` 与 `app.getVersion()`；dev 允许 `0.0.0-dev` 或跳过，正式包必须一致。
  - 收到 `ready` 后再比对 `protocolVersion` 与 `shellAbi`；任一不一致显示“客户端与运行时版本不匹配”，不打开页面。
- fnOS：`build-fnos.mjs` 写 `staging/app/version.json`（产品版本）；`launch.mjs` 读它与 `server/manifest.json` 的 `productVersion` 比对，不一致写 `TRIM_TEMP_LOGFILE` 并退出，不开放 Socket。不依赖包根 `manifest` 在运行时的位置。
- Docker：healthcheck 仍看 `ok`；日志打印版本。云端桌面探活只要求 `{ok:true}`，不因远端版本不同阻断（远端 Web 自带自己的版本）。
- 兼容策略：主版本一致即可；`protocolVersion` 不同则拒绝。当前只有一个版本，先严格相等。

## 9. 迁移顺序与回滚

1. **配置与 runtime 逻辑拆分**（子任务 1）：core 改 `ServerConfig`，`env.ts` 删除；dev/Docker/fnOS/desktop 仍用旧启动方式，但通过 `loadRuntimeConfigFromEnv` 适配。此步行为不变，可用现有测试与烟测验收。
2. **统一产物**（子任务 2）：新增 `build-runtime.mjs`，Docker/fnOS/desktop 逐步切换；旧 `deploy-server.mjs` 保留到三处都通过后再删。
3. **桌面 sidecar**（子任务 3）：先实现 sidecar，保留 `MIMIR_DESKTOP_HOST=in-process` 开发开关一版；烟测通过后删除 `host.ts` 与开关。
4. **Web 单构建**（子任务 4）：先让 runtime 注入 base，`apps/web` 固定 `./`；fnOS 切换后删除 `MIMIR_BASE_PATH` 构建参数。保留一次根路径回归。
5. **CI/发布/文档**（子任务 5）：每个原生平台用同一脚本构建一次，桌面 matrix 不再有 `server build` + `deploy-server` 两段；fnOS 用同一脚本；不做 900MB 级跨作业 artifact 传递；决策记录与验收。

回滚点：

- 子任务 1 后：`git revert` 配置提交即可回到 env 单例；不改产物。
- 子任务 2 后：保留旧 `deploy-server.mjs` 与旧 Dockerfile 一版，失败时切回；runtime 产物目录独立，不覆盖旧路径。
- 子任务 3 后：sidecar 开关切回 in-process；配置文件与日志目录保留，不删用户数据。
- 子任务 4 后：恢复 `apps/web` 的 `base` 为 `/` 与 fnOS 构建参数即可；runtime 注入逻辑可保留（root 下等价）。
- 子任务 5 后：CI 回滚到旧工作流，产物格式不变。

## 10. 被否决的方案

| 方案 | 为什么不选 |
|---|---|
| 物理拆 `packages/server-core` + `packages/runtime` | 当前 Vite `preserveModules` + worker 相对路径会跨包失效；收益是目录好看，不是宿主隔离。先用 `exports` + 边界测试，等 worker 路径显式化后再拆。 |
| 用 `utilityProcess` 而不是 `fork` | `utilityProcess` 的 IPC/类型更 Electron 专有，纯 Node 测试与 CLI 复用差；`fork` + `ELECTRON_RUN_AS_NODE` 已满足窗口/沙箱/无控制台需求。 |
| 三端合成一个 UI 产物 | D-103/D-104 已论证：桌面路由、标题栏、桥会漏进浏览器产物，类型也会退化。只合并 base path 差异，不合并平台差异。 |
| 让 fnOS 跑 Docker | 原生 fpk 是产品要求；额外运行时依赖与权限面都更大。 |
| 保留每个宿主自己的 `pnpm deploy` | 这正是重复构建与路径猜测的来源；manifest 让宿主不再知道布局。 |
| 用 Turborepo/Nx 缓存解决重复构建 | 缓存只加速同一命令，不能保证三端拿到同一份运行产物，也不能消除宿主对布局的知识。 |
| CI 上传/下载 900MB runtime 给桌面 matrix | 原生依赖本来就要按平台构建；4 个平台约 3.6GB 传输通常比 rebuild 慢。共享脚本/布局/manifest 即可，不做大 artifact 搬运。 |
| 把 WeKnora 的 Wails 同进程桌面直接照搬 | Mimir 是 Electron/Node，服务端重计算会阻塞主进程；WeKnora 的 Go/Wails 同进程前提不同。保留同源 HTTP + sidecar。 |
| 学 SiYuan/WeKnora 做单二进制 | 它们是 Go 静态二进制；Mimir 的 Node 依赖含原生 `.node`、WASM、worker 与大量运行时资产，Node SEA/Bun compile 不能可靠覆盖。目录 artifact + node_modules 是 Node 的等价物。 |
| 学 LobeChat 做 core OTA（CAS/补丁/签名/rollout） | Mimir 桌面是整包安装，runtime 与迁移/前端必须锁步；第二条更新链路带来兼容矩阵与回滚风险。只吸收 `shellAbi` 握手。 |
| 学 SiYuan/WeKnora 桌面/Web 共用一份 UI | 它们靠运行时 `window`/Wails 检测；Mimir 的 TanStack 类型安全路由与 D-103/D-104 需要编译期分离。保留两个 UI 入口，只合并 web/fnOS 的 base path。 |
| 桌面本地走 HTTPS 自签证书（SiYuan） | Mimir 的 HTTP 回环 + 每进程令牌（D-100）已覆盖威胁模型；证书/信任链增加安装与调试复杂度，不带来对应收益。 |
