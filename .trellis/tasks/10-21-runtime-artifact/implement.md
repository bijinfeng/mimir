# 实施计划

1. **移出共享资源工具**：`apps/desktop/scripts/resource-tree.mjs` → `scripts/lib/resource-tree.mjs`；测试同步移动；更新 desktop 引用。
2. **构建脚本**：写 `scripts/build-runtime.mjs`（参数、**仓库内 staging**、deploy、校验、manifest、finalize、清理）；写 `scripts/runtime-artifact.test.mjs`；`.gitignore` 加 `.runtime-staging/`。
3. **server 包元数据**：确认 `package.json` 的 `bin`/`exports` 与 `vite.config.ts` 产物路径一致；deploy 后 `dist/runtime/cli.js` 存在；加 `.npmignore` 裁剪 tests/scripts/config；`src` 保留。
4. **Docker**：改 Dockerfile（bookworm-slim、builder 产 runtime、runner 复制、CMD）；本地 `docker build` + `docker run` smoke；确认 staging 在 `/repo` 内、`/out` 只接收复制。
5. **fnOS**：改 `build-fnos.mjs` 与 `launch.mjs`；写 `staging/app/version.json`；保持 `verify-fnos.mjs` 通过；检查 staging 无 macOS/ARM 二进制、无明文密码。
6. **桌面打包**：改 `deploy-server.mjs` 与 `after-pack.mjs`；`pnpm desktop:build` 后检查 `resources/server/manifest.json` 与入口。
7. **清理**：三处烟测通过后删除旧 `pnpm deploy` 逻辑；保留一条“旧产物缺失”的可读错误。
8. **验收**：

```sh
node scripts/build-runtime.mjs --out /tmp/mimir-runtime --web apps/web/dist
node /tmp/mimir-runtime/app/dist/runtime/cli.js --config /tmp/mimir-runtime.json
pnpm check
docker build -t mimir:runtime-test .
pnpm desktop:build
# Linux x64:
pnpm fnos:build && node scripts/verify-fnos.mjs <version>
```

回滚点：第 4/5/6 步各自提交；旧脚本在第 7 步才删除。
