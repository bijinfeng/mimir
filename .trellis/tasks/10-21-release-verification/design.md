# 技术设计：CI、发布与验收

## 1. 桌面发布工作流

**不做跨作业大 artifact 传递**。`apps/desktop/server-deploy` 实测约 909MB（`node_modules` 886MB）；4 个平台上传/下载约 3.6GB，通常比原生 rebuild 慢，且 artifact 权限/链接处理多一层风险。

每个 desktop matrix job 直接：

```yaml
steps:
  - checkout / pnpm / node
  - pnpm install --frozen-lockfile
  - node scripts/build-runtime.mjs --out apps/desktop/runtime-build \
      --platform ${MIMIR_BUILD_PLATFORM} --arch ${MIMIR_BUILD_ARCH}
  - pnpm --filter @mimir/desktop build
  - pnpm --filter @mimir/desktop package
```

- 删除 build job 的 `pnpm --filter @mimir/server build` 与 `deploy-server.mjs`；只保留统一脚本。
- `apps/desktop/package.json` 的 `build` 仍只构建 main/preload/renderer。
- `verify-package.mjs` 检查 `resources/server/manifest.json` 与 required，不再检查三件套散文件。
- `build-runtime.mjs` 在仓库内 staging；`apps/desktop/runtime-build` 是复制后的结果，`afterPack` 再复制到 `resources/server`。
- fnOS 工作流同样调用 `build-runtime.mjs --web apps/web/dist`，独立构建 Linux x64 + Node 22；与桌面 linux-x64 各构建一次是**已知的 compute 重复**，换来不跨工作流传 900MB 大包。共享的是脚本/布局/manifest，不是同一 tar。

## 2. CI

`.github/workflows/ci.yml`：

- `pnpm check` 已包含 `pnpm -r test`；新增测试自然进入。
- 增加 `node --test scripts/runtime-artifact.test.mjs`（若不在 `pnpm test` 根脚本中）。
- 增加 `node scripts/build-runtime.mjs --out /tmp/runtime --skip-build` 的**结构检查**（在 `pnpm build` 之后），确保 dist 入口存在；不跑完整 deploy（避免 CI 时间过长）。
- 缓存不变；Node 22。CI 不保存/传递 runtime 大包。

## 3. 版本握手

- `apps/server/src/runtime/version.ts`：`PROTOCOL_VERSION = 1`。
- `/healthz` 返回 `{ ok, version, protocolVersion }`；manifest 另含 `shellAbi`（shell↔sidecar IPC/生命周期 ABI）；现有客户端只读 `ok`，兼容。
- desktop：
  - `runtime-manifest.ts` 比较 `manifest.productVersion` 与 `app.getVersion()`；dev 下 `app.isPackaged === false` 时允许不一致，但打印警告。
  - `ready` 消息再比 `protocolVersion` 与 `shellAbi`；不一致 `showErrorBox`，不导航。
- fnOS：
  - `build-fnos.mjs` 写 `staging/app/version.json`；`launch.mjs` 读它与 `server/manifest.json` 的 `productVersion` 比；不一致写 `TRIM_TEMP_LOGFILE`，退出 1，不 listen Socket。
  - 建议在 `install.mjs`/`upgrade_init` 也做一次静态检查（可选，launch 已是最后闸门）。
- Docker：healthcheck 只看 `ok`；`/healthz` 字段用于诊断。

## 4. 文档

- `.trellis/spec/project/decisions.md`：新增 D-114：
  - 现状问题（源码级复用、三套 deploy、env 注入、fnOS/桌面分支进 core）。
  - 决定：runtime 产物 + RuntimeConfig + 薄宿主；逻辑拆分而非物理拆包；fork sidecar；web/fnOS 单构建；版本握手。
  - 否决：物理拆包（当前构建契约）、utilityProcess（测试/CLI 复用差）、三端单 UI（D-103/D-104）、fnOS Docker、保留每宿主 deploy、CI 跨作业大 artifact 搬运。
  - 影响：Docker 基础镜像、桌面打包、fnOS build、CI、`/healthz`、`@mimir/shared/runtime-base`。
  - 注明 D-046 的“进程内宿主”部分被 sidecar 取代；同源 HTTP 与 host/carrier 分层仍成立。D-103/D-104 不变。
  - 记录 WeKnora v0.8.3 对照：Wails 同进程 + 反向代理/本地令牌可作先例；Mimir 因 Electron/Node 与类型安全选择 sidecar + 编译期平台分离。
- `.trellis/spec/project/architecture.md`：
  - §3 目录树：`apps/server/src/runtime/`、`scripts/build-runtime.mjs`、`apps/desktop/runtime-build`。
  - §8 部署：Docker 用 runtime 产物、glibc；fnOS 用同一脚本；manifest。
  - §14 桌面：sidecar 进程、IPC、日志、重启、关停；旧 host.ts 删除。
  - §14.4 打包：runtime-build、afterPack 复制整根。
- `README.md`：桌面构建/开发命令、fnOS 构建、runtime 产物说明；不再说“server build + deploy”。
- `apps/fnos/README.md`：runtime manifest、launch 配置、web 单构建。
- `.trellis/spec/server/backend/conventions.md`：`env.ts` → `runtime/config.ts`；`index.ts` 不再监听；新增 runtime 目录。
- `.trellis/spec/desktop/runtime/conventions.md`：host.ts → sidecar.ts；启动顺序/安全/日志。
- `packages/README.md` 或根 README：如果新增 `scripts/lib/` 不必单列。

## 5. 验收矩阵

| 层 | 命令/操作 | 期望 |
|---|---|---|
| 静态 | `pnpm check` | lint/format/typecheck/test 全绿 |
| 构建 | `pnpm build` | 所有 workspace 构建通过 |
| runtime 产物 | `node scripts/build-runtime.mjs --out /tmp/rt --web apps/web/dist` | manifest/required/入口正确 |
| Docker | `docker build` + `docker run` + 登录/上传/SSE | 容器 healthy，页面与 API 正常 |
| 桌面本地 | `pnpm desktop:build` + `smoke.mjs` | sidecar 独立进程、窗口加载、免登录、退出清理 |
| 桌面云端 | 启动连接远端 | 系统边框、远端页面、切换菜单 |
| fnOS | `pnpm fnos:build` + `verify-fnos.mjs`（Linux x64） | FPK 结构、Socket 登录、数据目录、版本一致 |
| Web base | 根路径 + `/app/mimir` 首屏/深路由/PDF | 资源 200、无 404、中文 PDF 不空白 |
| 版本 | 人为改 manifest 版本 | desktop/fnOS 快速失败，错误含期望/实际 |

## 6. 风险

- 不做跨作业 runtime artifact 传递；每个原生 job 用同一脚本构建，构建机先 `finalizeResourceTree`，`verify-package.mjs` 再检查。
- Windows `fork` sidecar 的进程树：`child.kill()` + `taskkill /T /F` 兜底；CI 的 NSIS smoke 覆盖安装后启动。
- fnOS glibc 下限：若 Ubuntu 24.04 产物在目标 fnOS 上加载失败，回退为 fnOS 本机构建（仍用同一脚本），并在文档记录。
- 版本握手在 dev 下误报：仅 packaged 严格比较；dev 打印警告。
- Docker 镜像变大：接受；如果不可接受，再评估 Alpine 与 fnOS 各自构建，但不回退到每宿主拼装。
