# web/fnOS 单 UI 构建与运行时 base path

## Goal

浏览器与 fnOS 共用一份 base-path 中立的 `apps/web/dist`；由 runtime 在返回 `index.html` 时注入 `<base>` 与运行时 basepath。桌面 renderer 继续单独构建，不合并平台差异。

## Requirements

- R1. `apps/web/vite.config.ts` 固定 `base: './'`，不再读 `MIMIR_BASE_PATH`。
- R2. 新增 `@mimir/shared/runtime-base`，统一从 `globalThis.__MIMIR_BASE_PATH__` 读运行时前缀、回退 `import.meta.env.BASE_URL`；`packages/renderer`、`packages/chat`、`packages/office` 都改用它，不再各自用 `BASE_URL` 计算绝对路径。
- R3. `apps/web/src/index.tsx` 的 router basepath 用运行时值；根路径与 `/app/mimir/` 都能解析深路由并生成带前缀的链接。
- R4. `runtime/static.ts` 注入 `<base href>` 与全局变量；只处理 GET/HEAD 非 `/api`；防目录穿越；哈希资源长缓存；HTML no-cache；SPA 回退。
- R5. fnOS 构建不再为 base path 重跑 `apps/web`；`launch.mjs` 在 config 里设 `static.basePath='/app/mimir/'`；`build-fnos.mjs` 校验 `./assets/`。
- R6. 桌面 renderer 的 `import.meta.env.BASE_URL='./'` 仍映射为根路径（`appBasePath=''`），不因本次改造改变标题栏/路由行为。

## Acceptance Criteria

- [ ] AC1. 同一份 `apps/web/dist` 在 `/` 启动：首屏、深路由、哈希资源、favicon、pdf.js 资产、API、SSE、下载均正常。
- [ ] AC2. 同一份产物经 fnOS 网关 `/app/mimir/` 启动：上述功能正常；页面内链接、API、头像、下载都带 `/app/mimir` 前缀；Cookie Path 正确。
- [ ] AC3. `runtime/static.ts` 单测覆盖：base 注入、root/subpath、深路由回退、`../` 穿越拒绝、缺失哈希资源 404、HTML 不缓存。
- [ ] AC4. `app-path.test.ts` / `router-base-path.test.ts` / `pdfjs-assets` / `pdf-ocr-worker` / `chat/io` 覆盖运行时全局、回退、根路径与前缀；四个 `BASE_URL` 漏点都有子路径断言。
- [ ] AC5. fnOS 构建日志中只有一次 web build；`index.html` 的资源为相对路径；`MIMIR_BASE_PATH` 不再作为构建参数。
- [ ] AC6. `pnpm check` 通过；浏览器根路径、fnOS 子路径各有一份真实渲染/请求证据（截图或 smoke 日志）。

## Dependencies

- 依赖 `10-21-runtime-config-core` 的 `runtime/static.ts` 与 `10-21-runtime-artifact` 的 `--web` 打包。
- 设计见父任务 `design.md` §7、§9。

## Out of scope

- 把桌面 renderer 合并进 web 产物；D-103/D-104 的桌面路由/标题栏边界不变。
- 改 TanStack Router 的路由结构。
- 改 fnOS 网关前缀（固定 `/app/mimir`）。

## Notes

- Vite 的 `base: './'` 在 dev 下可能归一为 `/`；以运行时全局为准，不依赖 `import.meta.env.BASE_URL` 判断部署形态。
- 必须先验证 pdf.js 的 `public/pdfjs` 资产在子路径下仍按原始文件名加载。
