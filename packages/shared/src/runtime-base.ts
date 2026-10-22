/**
 * 运行时部署前缀。
 *
 * 同一份 `apps/web/dist` 要同时服务根路径（Docker/普通部署）与 `/app/mimir/`
 * （fnOS 网关）。构建期不知道最终挂在哪，所以：
 *   1. runtime 返回 index.html 时注入 `window.__MIMIR_BASE_PATH__`
 *   2. 浏览器/Vite dev 没有注入时回退 `import.meta.env.BASE_URL`
 *   3. 桌面 renderer 的 `BASE_URL='./'` 不是绝对路径 → 根路径
 *
 * 这里只读取**一次**模块级值。测试要在 `import` 前设置全局并 `vi.resetModules()`；
 * 不要在运行时改变部署前缀（那需要整页重载，不是热切换）。
 */

const runtimeBase = (globalThis as { __MIMIR_BASE_PATH__?: unknown }).__MIMIR_BASE_PATH__
const viteBase = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL

/** 不带尾斜杠的前缀；根路径返回空串。`/app/mimir/` 与 `/app/mimir` 等价。 */
export function readRuntimeBasePath(): string {
  const raw = typeof runtimeBase === 'string' && runtimeBase ? runtimeBase : (viteBase ?? '')
  if (!raw.startsWith('/') || raw.startsWith('//')) return ''
  const trimmed = raw.replace(/\/+$/, '')
  return trimmed === '' ? '' : trimmed
}

/** 带尾斜杠的前缀；根路径返回 `/`。可直接给 TanStack Router 的 basepath。 */
export function runtimeBasePath(): string {
  const base = readRuntimeBasePath()
  return base === '' ? '/' : `${base}/`
}
