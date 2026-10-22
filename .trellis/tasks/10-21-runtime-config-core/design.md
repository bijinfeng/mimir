# 技术设计：RuntimeConfig 与 core/runtime 边界

## 1. 配置模型

`apps/server/src/runtime/config.ts`：

```ts
export type RuntimeConfig = {
  product: { version: string; protocolVersion: number; shellAbi: number }
  nodeEnv: 'production' | 'development' | 'test'
  dataDir: string
  database:
    | { kind: 'sqlite'; file: string }
    | { kind: 'postgres'; url: string }
  listener:
    | { kind: 'tcp'; host: string; port: number }
    | { kind: 'unix'; path: string }
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
  model?: { apiKey: string; baseUrl: string; providerName: string; chatModel: string; reasoningModel: string }
  miniappEnabled?: boolean
}
```

- 用 zod 定义并 `parse`；所有字段可 JSON 序列化。
- `loadRuntimeConfigFromEnv(env)` 保留现有 env 名，作为兼容层：
  - `DATA_DIR`、`DATABASE_URL`、`PORT`、`AUTH_SECRET`
  - `WEB_ORIGIN`、`SERVER_URL`、`OWNER_EMAIL`、`OWNER_PASSWORD`
  - `MODEL_*`、`MIMIR_MINIAPP_ENABLED`
  - `WEB_DIST` → `static.dir`；`MIMIR_BASE_PATH` → `static.basePath`
  - `MIMIR_FNOS_SOCKET` → `listener: unix` + `auth.fnosGateway.basePath`
  - `MIMIR_LOCAL_MODE` / `MIMIR_LOCAL_TOKEN` → `auth.localToken`
- 校验规则原样迁移：生产必须显式 `AUTH_SECRET`；本地模式必须有 token 且只允许回环；fnOS 必须 SQLite、有 owner、base path 固定 `/app/mimir`；owner 两个变量必须同时有。
- `toServerConfig(config)` 返回 core 子集；`ServerConfig` 放在**中立的 `apps/server/src/config.ts`**，不是 `runtime/server-config.ts`——否则 core import runtime 会形成反向依赖：

```ts
// src/config.ts —— 只做快照/getter，不 import runtime、boot、app、db/schema
export type ServerConfig = {
  product: { version: string; protocolVersion: number; shellAbi: number }
  nodeEnv: 'production' | 'development' | 'test'
  dataDir: string
  database: { kind: 'sqlite'; file: string } | { kind: 'postgres'; url: string }
  auth: {
    secret: string
    owner?: { email: string; password: string }
    localToken?: string
    fnosGateway?: { basePath: string }
    trustedOrigins: string[]
    cookiePath?: string
    secureCookies?: boolean
  }
  model?: RuntimeConfig['model']
  miniappEnabled?: boolean
  webOrigin?: string
  migrations: { sqlite: string; postgres: string }
}
export function configureServer(config: ServerConfig): void
export function getServerConfig(): ServerConfig
export const config: { /* getters delegating to getServerConfig() */ }
```

`configureServer(config)` 只保存不可变快照；重复调用且内容不同时抛错（测试用 `resetServerConfig()`）。`getServerConfig()` 未配置时抛 `configureServer() 尚未调用`。

## 2. 初始化顺序与测试

`db/schema.ts` 在 import 时按方言选表对象，因此**配置必须先于 core 模块加载**：

```ts
// src/runtime/start.ts
configureServer(toServerConfig(config))
const { boot } = await import('../boot.js')
const app = await boot()
```

- `startRuntime` / `dev.ts` / `test/setup.ts` 是仅有的“先 configure 再 import core”的地方。
- 新增 `src/server-runtime.ts`（core 内，不 import runtime）：
  ```ts
  export function ensureServerRuntime(): void {
    const cfg = getServerConfig()
    if (!dbConfigured()) configureDb(cfg.database)
    if (!authConfigured()) setAuth(createAuth(cfg.auth, db))
  }
  ```
  `createApp()` 与 `boot()` 都先调用它。这样 `helpers.ts` 可以在模块顶层 `createApp()`，而 `db/schema.ts` 已经在 `test/setup.ts` 的 `configureServer` 之后加载。
- `test/setup.ts`：
  ```ts
  configureServer(toServerConfig(loadRuntimeConfigFromEnv()))
  const { ensureServerRuntime } = await import('../server-runtime.js')
  ensureServerRuntime()
  ```
  `global-setup.ts` 用同样顺序配置后动态 import `db/migrate` 并跑迁移；不要把 `configureServer` 放进普通 import 的模块顶层。
- `boot()` 顺序：
  1. `ensureServerRuntime()`
  2. `runMigrations(getServerConfig().migrations)`（见 §4）
  3. owner/seed/recovery（原逻辑）
  4. `createApp({ staticMiddleware, corsOrigin })`
- `db` / `auth` 用 ES live binding + setter：
  ```ts
  export let db: PostgresJsDatabase<typeof pgSchema>
  export function configureDb(database: ServerConfig['database']): void { db = ... }
  export let auth: Auth
  export function setAuth(value: Auth): void { auth = value }
  ```
  现有 import 点不需要改成函数调用；但**不得在模块顶层使用 `db`/`auth`**，只在函数/请求处理里用。`server-runtime.ts` 负责一次性赋值；测试跨文件由 Vitest 模块隔离保证。

## 3. core 改造清单

- `env.ts`：删除。旧字段改为 `getServerConfig()` 的 getter 对象 `config`，先机械替换 `env.x` → `config.x`；确认无 `process.env` 后删除文件。
- `auth.ts`：`createAuth(config, db)`；`baseURL`/`trustedOrigins`/`defaultCookieAttributes` 全部从 `config` 来；`fnosGateway` 只影响 `baseURL`（undefined）、cookie path、`useSecureCookies`，不再 import env。
- `app.ts`：`createApp({ staticMiddleware?, corsOrigin? })` 并且开头 `ensureServerRuntime()`；`cors` 只在 `corsOrigin` 存在时挂载；删除 `handleAuth` 里的 fnOS 分支；静态中间件在路由注册前调用。
- `index.ts`：**删除或只保留类型导出**，不再导出会自动 import core 的 `createApp`/`boot` 根入口；公共入口只有 `runtime/index.ts`。`vite.config.ts` 去掉 `index` 输入。
- `dev.ts`：`loadRuntimeConfigFromEnv` → `configureServer` → 动态 `import('./boot.js')` → `export default await boot()`。
- `boot.ts`：不读 env；开头 `ensureServerRuntime()`；迁移路径由配置传入；`env.nodeEnv` → `config.nodeEnv`。
- `db/client.ts`：`configureDb(database)`；保留开发 HMR 缓存与 `closeDb()` 语义；`db` 是 live binding；日志仍打印驱动与文件。
- `db/schema.ts`：`getServerConfig().database.kind`；注意只在 configure 后 import。
- `db/migrate.ts`：`runMigrations({ sqlite, postgres })`；CLI 自己 `loadRuntimeConfigFromEnv` + `configureServer` + `configureDb`（或 `ensureServerRuntime`）；`--reindex` 同样。
- `middleware/auth.ts`、`services/local-mode.ts`：`config.auth.localToken`；无 token 时分支不存在；`ensureLocalOwner` 用 `localToken !== undefined` 判断本地模式。
- `lib/fnos-gateway.ts`：删除；逻辑迁到 `runtime/gateway/fnos.ts`。
- `lib/static.ts`：删除 core 版本；逻辑迁到 `runtime/static.ts`（本任务先保持旧行为，base 注入在子任务 4）。
- `services/*`、`routes/*`：只把 `env` 换 `config`，不改业务。

## 4. 迁移目录

`ServerConfig` 增加 `migrations: { sqlite: string; postgres: string }`，由 runtime 填：

- 仓库 dev：`apps/server/drizzle-sqlite`、`apps/server/drizzle`
- 产物：`<runtimeRoot>/drizzle-sqlite`、`<runtimeRoot>/drizzle`
- 测试：`apps/server/drizzle-sqlite`、`apps/server/drizzle`

`runMigrations()` 不再 `new URL('../../drizzle', import.meta.url)`。这是为了产物布局可移动，也为了让测试不依赖编译深度。

## 5. 监听与静态

- `runtime/listeners/tcp.ts`：`serve({ fetch, port, hostname })`；返回 `server` 与 `origin`；`port 0` 从 `info.port` 取实际值。
- `runtime/listeners/unix.ts`：`createAdaptorServer({ fetch })`；先 `stat`/连接探测，清理失效 socket；`listen(path)`。
- `runtime/gateway/fnos.ts`：
  - `stripPrefix(request, basePath)`：只接受 `/app/mimir` 或 `/app/mimir/*`。
  - `adaptAuthRequest`：**对所有 `/api/auth/*`（含 `sign-in/identifier`）**做 Origin/Referer 同源、`sec-fetch-site: cross-site` 拒绝、`x-forwarded-proto` 一致、写请求必须有 Origin；GET `/api/auth/setup/state` 不受写请求规则影响。
  - `adaptAuthResponse`：HTTPS 时给这些响应（含 identifier 登录）的 Set-Cookie 补 `Secure`，并保留 `Path=/app/mimir`。
  - 这是对现有行为的一处修正：现在 identifier 登录绕过 `handleAuth`，fnOS HTTPS 下没有 Secure/Origin 适配；测试要覆盖 HTTP/HTTPS 两条路径。
- `runtime/static.ts`：本任务先移植旧 `mountStatic` 行为（候选目录改为显式 `dir`），base 注入留到子任务 4；`createApp` 通过 `staticMiddleware` 挂载。
- `runtime/start.ts`：配置 → 动态 import boot → 选择 listener → 包裹 fnOS（仅 unix+fnosGateway）→ 返回 handle；`close()` 先 HTTP 后 DB，幂等。
- `runtime/cli.ts`：`--config <path>` 或 env；启动后按 IPC/stdout 报告 ready；SIGTERM/SIGINT 优雅退出。本任务先提供 JSON stdout，sidecar 在子任务 3 接入 IPC。

## 6. 边界测试

`apps/server/src/test/runtime-boundary.test.ts`：

- 遍历 core 目录（`app.ts`、`boot.ts`、`auth.ts`、`db/`、`routes/`、`services/`、`lib/`、`plugins/`、`search/`），断言源码不包含 `runtime/` import、`process.env`、`MIMIR_FNOS_`、`MIMIR_LOCAL_MODE`、`MIMIR_BASE_PATH`、`WEB_DIST`。
- 断言 `src/config.ts` 不 import `runtime/`、`boot`、`app`、`db/schema`；`src/server-runtime.ts` 不 import `runtime/`。
- 断言 `runtime/start.ts` 先 `configureServer` 再动态 import boot（文本断言 + 一个启动测试）。
- 断言 core 模块不在顶层读 `db`/`auth`（用 `db`/`auth` 的 live binding 只在函数体内）。

## 7. 兼容与回滚

- 旧 env 名保留在 `loadRuntimeConfigFromEnv`，Docker/fnOS/desktop 现有命令不改也能跑。
- `pnpm dev` 的 Vite 配置仍读 `.env` 的 `PORT`，与 runtime 的 env 映射同源。
- 回滚：恢复 `env.ts` 与 `index.ts` 自动监听；runtime 目录可整体删除，不影响 core 业务。
