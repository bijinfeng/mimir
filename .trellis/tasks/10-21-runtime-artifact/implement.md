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

## 完成记录（2026-10-22）

与设计文档的差异与环境限制：

- **产物根就是 `--out`，没有 `<out>/app` 这一层**。设计 §1 第 7 步写的是
  `<out>/app`，但宿主约定是 `staging/app/server/manifest.json`、
  `resources/server/manifest.json`、Docker `/app/manifest.json`；再加一层
  `app/` 会让三处宿主都要知道多一级。`build-runtime` 直接把 runtime 根复制到
  `<out>`，manifest 在 `<out>/manifest.json`。三处宿主只认这个根。
- **staging 目录带 pid 后缀**（`.runtime-staging/<platform>-<arch>-<pid>`），
  避免同一台机器并行构建 desktop/fnOS 时互相删除。
- **`assertDeletableOut()`**：拒绝仓库根、`apps/server` 等源码目录与仓库父目录；
  仓库内只允许 `.runtime-staging/`、`apps/desktop/runtime-build/`、
  `apps/fnos/staging/`。这一条不是设计要求的，但 `--out` 会 `rm -rf`，参数写错
  的代价太大。
- **CLI 读产物 manifest**：`runtime/cli.ts` 在不带 `--config` 时读同级的
  `manifest.json`，把 `productVersion` 写进 `/healthz`，校验
  `protocolVersion`/`shellAbi` 与二进制一致，并把 `manifest.web` 自动变成静态根。
  Docker 因此不再需要 `WEB_DIST`；版本握手失败返回 `VERSION_MISMATCH`。
- **`.npmignore`**：排除测试/构建配置/验证脚本，保留 `dist`、`drizzle*`、`src`；
  `build-runtime` 部署后还删掉 pnpm 自动写入的 `pnpm-lock.yaml`/
  `pnpm-workspace.yaml`/`.npmignore`。产物实测 43,329 个文件、约 700MB。
- **Docker**：`node:22-bookworm-slim`，builder 用同一脚本产出 `/out/runtime`，
  runner 整目录复制，CMD `node dist/runtime/cli.js`。本机没有 Docker daemon，
  未执行 `docker build`/`docker run`；Dockerfile 的镜像/路径逻辑由产物烟测
  （同一 CLI + web + manifest）覆盖。
- **桌面**：`deploy-server.mjs` 调统一脚本输出 `apps/desktop/runtime-build`；
  `after-pack` 整根复制并用 `afterPack` 直接调用验证了
  `resources/server/manifest.json`。`pnpm desktop:build` 的 electron-builder
  阶段在下载工具时网络超时（600s），afterPack 之前失败；属于本机网络，不是脚本错误。
- **fnOS**：`build-fnos.mjs` 调统一脚本到 `staging/app/server` 并写
  `version.json`；`launch.mjs` 读 manifest/version、校验 required 与契约版本后
  调 `startRuntime()`。Linux x64 的 `fnos:build`/`verify-fnos` 未在本机执行；
  `fnos-package.test.mjs` 的生命周期 mock 已改为新契约并通过
  （4/4，含 Unix Socket、重复 stop、版本字段）。
- **验证**：
  - `node scripts/build-runtime.mjs --out /tmp/mimir-runtime-web --web apps/web/dist`
    成功；`/healthz` 返回 manifest 的 `0.1.8`，`/` 返回 HTML，哈希资源
    `cache-control: immutable`；SIGTERM 退出 0；重建会删掉旧文件、清理 staging。
  - manifest 与二进制版本不一致时 CLI 返回
    `{"type":"error","code":"VERSION_MISMATCH"}` 并退出 1。
  - `scripts/runtime-artifact.test.mjs` + 迁移后的 `resource-tree.test.mjs`
    共 12 个用例通过；根 `node --test` 87/87。
  - `pnpm --filter @mimir/server test`：1384 + 10 + 6 通过。
  - `pnpm lint` 0 error、`pnpm format:check`、`pnpm -r typecheck` 通过。
- **未完成/交接**：
  - Docker daemon 不可用，`docker build`/容器 smoke 留给 CI/有 daemon 的环境。
  - fnOS 只能在 Linux x64 打包，`fnos:build`/`verify-fnos` 留给 CI。
  - `pnpm desktop:build` 的 electron-builder 下载网络超时；afterPack 已直接验证，
   完整安装包留给有缓存/网络的环境。
