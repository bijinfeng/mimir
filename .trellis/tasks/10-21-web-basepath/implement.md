# 实施计划

1. **共享 helper**：新增 `packages/shared/src/runtime-base.ts` 与 `./runtime-base` 导出；改 `packages/renderer/src/lib/app-path.ts`、`packages/chat/src/runtime/io.ts`、`packages/office/src/editors/pdfjs-assets.ts`、`packages/office/src/editors/PdfEditor.tsx`；导出 `runtimeBasePath`。
2. **web 构建**：`apps/web/vite.config.ts` 固定 `base: './'`，删除 `MIMIR_BASE_PATH`；`apps/web/src/index.tsx` 用 `runtimeBasePath()`。
3. **静态中间件**：实现 `runtime/static.ts` 的注入、路径映射、缓存、404；把旧测试迁过来并扩展。
4. **createApp 接线**：`createApp({ staticMiddleware })` 在 API 路由前调用；dev 不传。
5. **fnOS**：`launch.mjs` 写 `static.basePath`；`build-fnos.mjs` 去掉 `MIMIR_BASE_PATH`，校验 `./assets/`；更新 `scripts/fnos-build.test.mjs`。
6. **验证**：
   - `pnpm --filter @mimir/renderer test`、`pnpm --filter @mimir/web test`、`pnpm --filter @mimir/server test`。
   - `pnpm dev` 根路径首屏/深路由/中文 PDF。
   - 本地启动一个模拟 `/app/mimir` 的静态服务（或 fnOS 环境）验证前缀。
   - `pnpm check`。
7. **证据**：保存根路径与子路径的截图/smoke 日志到任务 `verification.md`，记录 pdf.js 资产请求与 API 前缀。

回滚点：第 2 步后、第 5 步前各提交一次；恢复 `base: '/'` 即可回到旧构建。

## 完成记录（2026-10-22）

- 新增 `@mimir/shared/runtime-base`（`readRuntimeBasePath()` / `runtimeBasePath()`）：
  优先 `globalThis.__MIMIR_BASE_PATH__`，回退 `import.meta.env.BASE_URL`；
  `./`、`/`、空值都归一成根路径，`/app/mimir/` → `/app/mimir`。
- 四个漏点改为共用 helper：`renderer/lib/app-path.ts`、`chat/runtime/io.ts`、
  `office/pdfjs-assets.ts`、`office/PdfEditor.tsx`；`renderer` 的公共出口导出
  `runtimeBasePath`。
- `apps/web/vite.config.ts` 固定 `base: './'`，删除 `MIMIR_BASE_PATH`；
  `apps/web/src/index.tsx` 用 `runtimeBasePath()` 作为 router basepath。
- `runtime/static.ts` 实现前缀剥离、`<base>`/全局注入（幂等）、GET/HEAD、
  目录穿越拒绝、哈希资源 immutable、HTML no-cache、缺失资源 404、API 放行；
  测试覆盖 root/subpath 与 fnOS 剥离。
- `build-fnos.mjs` 只构建一次 web、不设 `MIMIR_BASE_PATH`，校验 `./assets/`；
  `launch.mjs` 保持 `static.basePath='/app/mimir/'`；`verify-fnos` 校验相对资源。
- 验证见 `verification.md`。`pnpm check` 的全量测试阶段仍有已知的并行负载
  超时/假失败（office Docx 加密 worker 一次、upload/chat-attachments 历史同类），
  单文件重跑通过；与本次 base path 改动无直接关系。
