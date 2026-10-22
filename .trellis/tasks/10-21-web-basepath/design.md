# 技术设计：运行时 base path

## 1. 产物

`apps/web/vite.config.ts`：

```ts
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, repoRoot, ''), ...process.env }
  return {
    base: './',
    // ... plugins unchanged
  }
})
```

- `base: './'` 让 `index.html` 的资源变成 `./assets/...`，配合 `<base href>` 在任意前缀下解析。
- 删除 `MIMIR_BASE_PATH` 读取；`apps/web/src/index.tsx` 不再用 `import.meta.env.BASE_URL` 作为路由 basepath。
- `index.html` 的 `%BASE_URL%` 在 build 下变成 `./`；favicon 用相对路径。
- 动态 import、CSS `url()` 由 Vite 按相对 base 处理；`public/pdfjs` 是原样复制，`appPath` 前缀负责运行时引用。

## 2. 运行时 base path 读取

新增 `packages/shared/src/runtime-base.ts`，并在 `packages/shared/package.json` 增加 `"./runtime-base": "./src/runtime-base.ts"`：

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

- 桌面 renderer 的 `BASE_URL='./'` → 非 `/` 开头 → `''`、`runtimeBasePath()='/'`，与现状一致。
- 浏览器根路径：runtime 注入 `/` → `appBasePath=''`。
- fnOS：注入 `/app/mimir` → `/app/mimir`、`/app/mimir/`。
- **四个漏点必须一起改**：
  1. `packages/renderer/src/lib/app-path.ts`：`appBasePath = readRuntimeBasePath()`，并从 `index.ts` 导出 `runtimeBasePath`；
  2. `packages/chat/src/runtime/io.ts`：`DEFAULT_CHAT_URL = `${readRuntimeBasePath()}/api/chat``；
  3. `packages/office/src/editors/pdfjs-assets.ts`：`PDFJS_ASSETS` 用 `readRuntimeBasePath()`；
  4. `packages/office/src/editors/PdfEditor.tsx`：OCR 的 `baseUrl` 用 `readRuntimeBasePath()`。
- `apps/web/src/index.tsx` 用 `buildRouter(routeTree, runtimeBasePath(), …)`。
- 测试用 `vi.resetModules()` + 设置 `globalThis.__MIMIR_BASE_PATH__` 验证三种值；`app-path.test.ts`、`pdfjs-assets`、`pdf-ocr-worker`、`chat/io` 各补一条子路径用例。根路径测试全绿不能证明子路径正确。

## 3. 静态中间件

`apps/server/src/runtime/static.ts`：

```ts
export function createStaticMiddleware(options: { dir: string; basePath: string }): (app: Hono) => void
```

- 归一化 `basePath`：`/` 或 `/app/mimir`；`baseHref` 为带尾斜杠的版本。
- 只处理 `GET`/`HEAD`；`path.startsWith('/api')` 或 `/healthz` → `next()`。
- 解析请求路径：
  - 若 `path === basePath` 或 `path.startsWith(basePath + '/')`，剥离前缀；
  - 否则按原路径（兼容反代已剥离的情况）。
- 文件路径：`normalize(join(dir, decodeURIComponent(path)))`，必须仍以 `dir + sep` 开头；否则 404。
- 有扩展名且存在：读文件，MIME 表沿用旧 `static.ts`（含 `.bcmap`/`.pfb`/`.wasm`）；哈希资源 `immutable`，其他 `no-cache`。
- 无扩展名：读 `index.html`，注入后返回，`no-cache`。
- 注入（只做一次并缓存）：
  ```html
  <base href="/app/mimir/">
  <script>window.__MIMIR_BASE_PATH__="/app/mimir"</script>
  ```
  插入到 `<head>` 之后；HTML 里已有注入时先删除再插入（防止重复）。
- 缺失的 `/assets/*` 或带扩展名路径返回 404，不回落 HTML（避免把 HTML 当 JS）。
- 缓存：哈希资源 `public, max-age=31536000, immutable`；`index.html` 与 public 固定文件 `no-cache`。
- 安全：不跟随符号链接到 `dir` 外（`realpath` 可选；至少 normalize + 前缀检查）。

`createApp({ staticMiddleware })` 在注册 API 路由之前调用它，保证静态中间件先匹配；中间件内部对 `/api` 放行。

## 4. fnOS

`apps/fnos/app/launch.mjs`：

```js
static: { dir: path.join(appDest, 'server/web/dist'), basePath: '/app/mimir/' }
```

- 网关 `stripPrefix` 把 `/app/mimir/assets/x.js` 变成 `/assets/x.js` 再交给 app；静态中间件按 `dir` 找文件；HTML 注入的 `<base>` 让浏览器请求 `/app/mimir/assets/...`。
- `scripts/build-fnos.mjs`：
  - 只跑一次 `pnpm --filter @mimir/web build`；
  - 不再设置 `MIMIR_BASE_PATH`；
  - 校验 `apps/web/dist/index.html` 的资源是 `./assets/`（不是 `/assets/` 或 `/app/mimir/assets/`）；
  - 复制到 runtime 的 `web/dist`。
- `dev` 的根路径：Vite dev server 直接服务 `apps/web`，没有 runtime 注入；`app-path` 回退 `BASE_URL`（`/`），router 根路径正常。

## 5. 测试

- `apps/server/src/runtime/static.test.ts`：
  - root/subpath 的 index 注入；
  - 深路由返回 index；
  - 哈希资源缓存头；
  - `../` 穿越 404；
  - `/api` 不被静态接走；
  - 缺失资源 404 而不是 HTML。
- `packages/renderer/src/lib/app-path.test.ts`：三种全局值与回退。
- `packages/renderer/src/router-base-path.test.ts`：保留 `/app/mimir/` 用例；新增根路径。
- `apps/web` 构建后检查 `index.html` 含 `./assets/`；`scripts/build-fnos.mjs` 的测试更新。
- 真实渲染：根路径 `pnpm dev` 与 fnOS 网关（或本地模拟 `/app/mimir` 的静态服务）各截一张首屏 + 深路由；记录 pdf.js 中文 PDF 不空白。

## 6. 回滚

- `apps/web` 恢复 `base: '/'` 与 fnOS 的 `MIMIR_BASE_PATH` 构建；runtime 注入在 root 下等价，可保留。
- `app-path` 的全局读取保留回退，旧构建仍工作。
- 静态中间件可退回旧 `mountStatic`（显式 `dir`），不影响 API。
