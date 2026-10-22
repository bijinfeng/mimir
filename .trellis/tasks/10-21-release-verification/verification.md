# 子任务 5 验收记录（2026-10-22）

环境：macOS 26 arm64，Node 24.21.0（仓库构建目标 Node 22），pnpm 12.4.2。
本机没有 Docker daemon，也不是 Linux x64/fnOS 设备；以下明确区分「已执行」与
「未执行/需 CI」。

## 已执行

| 层 | 命令 | 结果 |
|---|---|---|
| 静态 | `PNPM_CONFIG_WORKSPACE_CONCURRENCY=1 pnpm check` | **exit 0**：lint 0 error、format、全 workspace typecheck、全部测试与根 node --test 87/87 |
| 构建 | `pnpm build` | exit 0（server / web / desktop / office / miniapp 均产出） |
| runtime 产物 | `node scripts/build-runtime.mjs --out /tmp/mimir-release-runtime --web apps/web/dist --skip-build` | exit 0；manifest 0.1.8 / protocol 1 / shellAbi 1 / darwin arm64 / 10 required，43,334 files |
| runtime 启动 | 产物根 `dist/runtime/cli.js`，SQLite + TCP + PORT=0 | ready JSON、`/healthz` 200 且 version=0.1.8；SIGTERM 退出 0 |
| 根路径静态 | 同一产物，`manifest.web` → `/` | `GET /docs` 注入 `<base href="/">` 与 `__MIMIR_BASE_PATH__="/"`；哈希 JS 200 + immutable |
| 子路径静态 | 同一产物，`MIMIR_BASE_PATH=/app/mimir` | `GET /app/mimir/docs/42` 注入 `<base href="/app/mimir/">`；`HEAD /app/mimir/assets/*` 200 + immutable |
| 桌面 | `pnpm --filter @mimir/desktop build` + `node apps/desktop/scripts/smoke.mjs` | A/B/C 全 PASS；本地宿主是独立 sidecar 子进程，云端不起宿主 |
| 版本不匹配 | desktop 单测 + fnOS 生命周期测试 | manifest productVersion/platform/shellAbi 不匹配均在 fork/listen 前失败；sidecar ready 的 shellAbi 不匹配被拒 |
| CI 配置 | 解析三个 workflow YAML | 通过；桌面矩阵已改为每平台 `build-runtime.mjs`，无 runtime 大 artifact 上传 |

`pnpm check` 的测试统计（节选）：chat 92、office 2781、server 1385 + 10 + 6、
renderer 653、desktop 124、根 node --test 87。

## 未执行（环境限制，需 CI/实机）

- **Docker build/run**：本机无 daemon。Dockerfile 已改为 bookworm-slim builder
  `build-runtime.mjs` + runner 整目录复制 + `CMD dist/runtime/cli.js`；需在
  GitHub Actions/有 Docker 的 Linux 上执行登录、静态、SSE、上传/下载 smoke。
- **fnOS 真实 FPK**：`build-fnos`/`verify-fnos` 要求 Linux x64 + Node 22 + fnpack；
  本机只验证了 `scripts/fnos-package.test.mjs` 的安装/启动/版本不匹配/Unix Socket
  生命周期 mock。真实包结构、Socket 登录、数据目录与覆盖升级需 CI/fnOS 设备。
- **`pnpm desktop:build` 完整安装包**：electron-builder 在本机下载工具阶段
  600s 超时（网络），afterPack 钩子已直接调用并通过
  `resources/server/manifest.json` + 入口检查；真实 DMG/NSIS/AppImage 与安装器
  验收需 CI。
- **Windows/macOS 签名与公证、Windows NSIS 安装、真实跨版本升级**：沿用既有发布
  流程，不在本任务替代。
- **真实浏览器截图**：子任务 4 的证据是构建产物 + runtime 的真实 HTTP 响应；没有
  截图，未声称视觉验收。

## 版本握手

- `/healthz`：`{ ok, version, protocolVersion }`。
- manifest：`productVersion` / `protocolVersion` / `shellAbi` / `required` /
  `migrations` / `schemaVersion`。
- desktop：`runtime-manifest.ts` 在 fork 前校验 manifest；sidecar 在 ready 后再校验
  `version`/`protocolVersion`/`shellAbi`，失败不写 cookie、不开窗。
- fnOS：`launch.mjs` 比对 `version.json` 与 `server/manifest.json`，并校验
  manifest 与二进制常量；失败写 `TRIM_TEMP_LOGFILE` 且不 listen。
