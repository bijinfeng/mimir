# 子任务 4 验证记录（2026-10-22）

## 构建中立性

```sh
pnpm --filter @mimir/web build
```

产物 `apps/web/dist/index.html`：

```html
<script type="module" crossorigin src="./assets/index-uXYxJhWx.js"></script>
<link rel="icon" href="./favicon.svg" />
```

资源全部是 `./assets/`，没有 `/assets/` 或 `/app/mimir/assets/`。fnOS 构建不再设置
`MIMIR_BASE_PATH`，也不再为前缀重跑 web。

## 运行时注入与请求

同一份 `apps/web/dist` 打成 runtime 后，分别用根路径与 `/app/mimir` 启动：

| 场景 | HTML 注入 | 资源请求 |
|---|---|---|
| 根路径 | `<base href="/">` + `window.__MIMIR_BASE_PATH__="/"` | `GET /docs` 200，`/assets/*` immutable |
| fnOS 前缀 | `<base href="/app/mimir/">` + `window.__MIMIR_BASE_PATH__="/app/mimir"` | `GET /app/mimir/docs/42` 200；`HEAD /app/mimir/assets/index-uXYxJhWx.js` 200 + `cache-control: public, max-age=31536000, immutable` |

`/healthz` 两种场景都返回 `{ok:true,version:"0.1.8",protocolVersion:1}`；SIGTERM
后 runtime 退出码 0。

## 测试

- `pnpm --filter @mimir/renderer test`：88 files / 653 tests 通过（含
  `app-path` 的根/前缀/相对 BASE_URL 回退、`api-base-path` 的 `/app/mimir` 请求、
  router 根路径与 `/app/mimir/` 的深路由/链接用例）。
- `pnpm --filter @mimir/chat test`：9 files / 92 tests 通过（含 `DEFAULT_CHAT_URL`
  的根/前缀用例）。
- `pnpm --filter @mimir/office exec vitest run src/editors/pdfjs-assets.test.ts`：
  3 tests 通过（pdf.js 资产根/前缀）。
- `pnpm --filter @mimir/server exec vitest run src/test/static.test.ts`：
  6 tests 通过（base 注入、root/subpath、深路由、穿越 404、缺失资源 404、API 放行、
  fnOS 前缀剥离）。
- `pnpm --filter @mimir/desktop build` + `node apps/desktop/scripts/smoke.mjs`：
  A/B/C 全 PASS，桌面根路径仍正常（`BASE_URL='./'` → 根）。
- `pnpm -r typecheck` 通过。

## 未覆盖

- 没有真实浏览器截图；证据是构建产物 + runtime 的真实 HTTP 响应。
- fnOS 真机/`fnos:build` 仍需要 Linux x64（与子任务 2/5 相同）。
