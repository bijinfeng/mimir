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
