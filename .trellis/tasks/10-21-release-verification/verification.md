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
| 桌面开发态 | `pnpm --filter @mimir/desktop build` + `node apps/desktop/scripts/smoke.mjs` | A/B/C 全 PASS；本地宿主是独立 sidecar 子进程，云端不起宿主 |
| 桌面安装包 | `ELECTRON_MIRROR=… ELECTRON_BUILDER_BINARIES_MIRROR=… pnpm desktop:build` + `verify-package.mjs mac-arm64 0.1.8` | 打包成功；`resources/server/manifest.json` 与 `Resources/renderer/index.html` 存在；`Verified mac-arm64 package 0.1.8` |
| 打包后 smoke | `MIMIR_SMOKE_EXECUTABLE=<app>/Contents/MacOS/mimir node apps/desktop/scripts/smoke.mjs` | A/B/C 全 PASS；真实安装包内的 sidecar、静态资源、令牌与云端模式均正常 |
| Docker build | `docker build -t mimir:runtime-test .`（colima Linux arm64） | exit 0；builder 用 `build-runtime` 产出 linux/arm64/glibc、29,646 files；runner 映像导出成功 |
| Docker run | `docker run` SQLite + owner，`/healthz`、登录、文档/目录、静态、上传/下载 | healthy；health 0.1.8；登录 200；documents/folders 200；`assets/*` immutable；上传后下载字节完全一致 |
| fnOS 构建 | 在 Linux x86_64 colima VM 的 amd64 Node 22 容器：`pnpm install` → `pnpm fnos:build` → `node scripts/verify-fnos.mjs 0.1.8` | 生成 `mimir-0.1.8-fnos-x64.fpk`（160MB，SHA-256 `ecde76d4…`）；manifest linux/x64/glibc、29,646 files、4 个 x64 native 二进制 |
| fnOS 验证 | `verify-fnos.mjs`（安装 procps 以执行 control.mjs 的 PID 检查） | 解包 FPK、版本/manifest/required、ELF、真实 Unix Socket HTTP/HTTPS 登录与 Cookie Path 全部通过；不声称 fnOS 设备安装 |
| 子路径静态资产 | `curl /app/mimir/{pdfjs/cmaps/…,pdf-ocr/worker.min.js,favicon.svg}` | 均 200；pdf.js/OCR 资产在 `/app/mimir/` 下按原名取到 |
| SSE 聊天 | runtime 产物 + `/api/chat`（scope=search，无模型） | 884 字节 SSE；`TEXT_MESSAGE_CONTENT`、`RUN_FINISHED`、检索兜底文案各 1；非流式失败 |
| Postgres | colima `pgvector/pgvector:pg17` + `TEST_DATABASE_URL=postgres://mimir:mimir@127.0.0.1:5544/mimir_test pnpm --filter @mimir/server test` | 1385 + 10 + 6 通过；同一套断言在 SQLite、Postgres 两种方言下都过 |
| sidecar 崩溃 | 真实 macOS 安装包本地模式，`kill -9 <sidecar pid>` | Electron 不退出；日志出现「本地服务异常退出（SIGKILL）」；1s 后新 sidecar pid/端口启动，页面重新请求静态资源 |
| 版本不匹配 | desktop 单测 + fnOS 生命周期测试 | manifest productVersion/platform/shellAbi 不匹配均在 fork/listen 前失败；sidecar ready 的 shellAbi 不匹配被拒 |
| CI 配置 | 解析三个 workflow YAML | 通过；桌面矩阵已改为每平台 `build-runtime.mjs`，无 runtime 大 artifact 上传 |
| GitHub CI | `gh workflow run ci.yml --ref feat/unified-runtime-architecture`（run 39752713668） | **success**：`pnpm check` 全绿。此前 run 39730387673 暴露的两处跨平台 PNG 字节差异已修复：miniapp 头像与 desktop 品牌图标改为像素容差比较（SVG/生成 TS 仍逐字节，ICO/ICNS 校验容器结构）。 |
| 发布矩阵 | `gh workflow run desktop-release.yml --ref feat/...`（run 39733384364） | **success**：mac-arm64、mac-x64、win-x64、linux-x64 四个 runtime build + desktop package + Windows NSIS 安装/资源校验/smoke + fnOS 复用工作流 + aggregate 全部通过 |

`pnpm check` 的测试统计（节选）：chat 92、office 2781、server 1385 + 10 + 6、
renderer 653、desktop 124、根 node --test 87。

## 未执行（环境限制，需 CI/实机）

- **Windows NSIS/AppImage 安装包与安装器验收**：本机只构建了 macOS arm64；
  Windows/Linux 安装器需对应原生 runner。
- **Docker SSE / `docker compose`**：本次容器用 SQLite 验证了构建、健康、静态、登录与上传/下载；
  Postgres 方言已单独用 pgvector 容器跑通服务器测试，但容器内 compose + SSE 仍建议在 CI 复跑。
- **fnOS 真机安装/覆盖升级/桌面入口**：已在 Linux x86_64 VM 构建并验证 FPK 结构、Socket 与登录；未在 fnOS 设备安装，不能声称真机通过。
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
