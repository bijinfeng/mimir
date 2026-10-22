# 统一运行时与宿主架构（C 版）

## Goal

把浏览器、桌面与 fnOS 的复用从源码级提升到产物级：浏览器、桌面本地宿主与 fnOS 启动同一份 runtime 产物，宿主只负责把平台事实翻译成 `RuntimeConfig`，不再各自构建、拼装或理解服务端内部布局。同时完成桌面 sidecar、web/fnOS 单 UI 构建与运行时版本握手。

## Background

- 当前 `apps/server` 同时是库与应用：既导出源码给桌面端取类型，又由 Docker、桌面宿主与 fnOS 各自 `vite build` + `pnpm deploy` + 拼目录。
- 部署形态通过一组环境变量在模块加载期注入，`env.ts` 同时承担配置读取、fnOS/桌面分支和启动断言；桌面端与 fnOS 都必须“先设 env，再动态 import”。
- 核心代码知道 fnOS 的 Unix Socket、前缀、Origin/Cookie 适配，也知道桌面本地令牌与静态目录候选路径；宿主则硬编码服务端产物清单。
- 桌面本地宿主在 Electron 主进程内 import 构建产物，服务端崩溃或重计算会直接影响载体主进程。
- 浏览器与 fnOS 各自构建一份 Web 产物，只因 base path 不同；桌面 renderer 又是第三份。
- 发布版本以桌面 `package.json` 为真相，fnOS manifest 必须一致，但只有脚本校验，没有运行时握手。
- 用户已选择“最彻底的版本”，对应上一轮方案 C：B（配置与适配器）+ 桌面 sidecar + web/fnOS 单 UI 构建 + 运行时版本握手。

## Requirements

- R1. **单一 runtime 产物**：每个平台只通过一个构建脚本产出一份可移植 runtime 目录与 `manifest.json`（服务端 JS、生产 node_modules、迁移、入口、版本、平台/架构/libc）。Docker、fnOS、desktop 消费同一格式，不再各自 `pnpm deploy` 或硬编码 `dist`/`drizzle-sqlite`/`node_modules` 布局。
- R2. **类型化运行配置**：引入可序列化的 `RuntimeConfig`（数据目录、数据库、监听器、公开地址、鉴权、静态资源、模型、环境）。核心不再读取 `process.env`，不再出现 `MIMIR_FNOS_SOCKET`、`MIMIR_LOCAL_MODE`、`MIMIR_BASE_PATH`、`WEB_DIST` 等领域特定变量；宿主只负责 env/JSON → `RuntimeConfig`。
- R3. **能力适配器**：TCP/Unix Socket 监听、静态资源、fnOS 前缀与 Origin/Cookie 适配、桌面本地令牌、鉴权会话与 DB 初始化都放到 runtime 层；core 只接收已构造的能力，不判断部署形态。
- R4. **桌面 sidecar**：桌面本地模式改为独立 runtime 进程，通过 IPC 报告就绪/错误，父进程负责端口、令牌、日志、崩溃恢复与关停；云端模式保持纯壳。令牌与密钥不走 argv，配置文件 0600。
- R5. **web/fnOS 单 UI 构建**：web 产物 base-path 中立；runtime 在服务 `index.html` 时注入 `<base>` 与运行时 base path；浏览器根路径部署与 fnOS `/app/mimir` 部署使用同一份静态产物。桌面 renderer 继续单独构建（D-103/D-104 的边界不变）。
- R6. **版本握手**：runtime manifest、`/healthz` 与桌面 sidecar 就绪消息都带产品版本与协议版本；宿主启动前校验，不匹配快速失败并给出可操作错误。
- R7. **发布/CI**：Docker、桌面发布工作流与 fnOS 工作流改用统一 runtime 构建脚本；桌面 matrix 不再出现 `server build` + `deploy-server` 两段拼装，每个原生平台用同一脚本构建本平台产物；fnOS 不再单独 `pnpm deploy`。不做 900MB 级跨作业 artifact 搬运。CI 至少覆盖 runtime 产物结构、配置解析、sidecar 生命周期与 Web base path。
- R8. **行为不回退**：Postgres/SQLite、迁移、鉴权（含本地令牌与 fnOS 网关）、SSE、文件 Range/ETag、multipart、ZIP 导出、桌面两种模式、fnOS 生命周期与数据保留均保持现有行为；`pnpm check` 全绿。macOS/arm64 安装包、Linux x64 FPK、Docker SQLite、SQLite+Postgres 测试均通过；SSE 与 Windows 待原生 runner。

## Acceptance Criteria

- [ ] AC1 (R1). 在 macOS arm64、Linux x64、Windows x64 至少各构建一次 runtime；`manifest.json` 的版本、平台、架构、入口与实际产物一致；Docker、fnOS、desktop 三处使用同一布局，仓库中不再存在第二份服务端拼装脚本。已构建 macOS arm64（桌面包）与 Linux x64（fnOS/容器）；Windows x64 待原生 runner。
- [x] AC2 (R2). 核心目录（路由、服务、DB、鉴权、插件装配）中 `grep` 不到 `process.env`、`MIMIR_FNOS_*`、`MIMIR_LOCAL_*`、`MIMIR_BASE_PATH`、`WEB_DIST`；同一份 `RuntimeConfig` 可在测试中分别构造 TCP/SQLite、Unix/fnOS、TCP/Postgres 三种形态并通过启动测试。
- [x] AC3 (R3). fnOS 前缀剥离、同源 Origin 校验、HTTPS Cookie Secure、Cookie Path、桌面本地令牌的比较逻辑都有独立测试，且测试不依赖 `vi.resetModules()` 改全局 env。
- [x] AC4 (R4). 桌面本地模式启动后 runtime 是独立进程；fork 后先显示 boot 窗，收到 `ready` 后开主窗；杀掉 runtime 不会杀掉 Electron；重启策略、端口退避、结构化错误码、日志落盘、退出 5 秒超时强杀均有测试或真实烟测证据；配置文件中无明文密码进入 argv。
- [x] AC5 (R5). 同一份 `apps/web/dist` 在 `/` 与 `/app/mimir/` 下都能加载首屏、深路由、哈希资源、pdf.js 资产、pdf-ocr、API、SSE、聊天与下载；`packages/renderer`、`packages/chat`、`packages/office` 不再各自用 `BASE_URL` 计算绝对路径；fnOS 不再因 base path 重新构建 Web。root/subpath 的 HTML 注入、哈希资源、pdf.js/OCR 资产、API 已有真实请求证据；SSE 已用 runtime 产物 + `/api/chat` 真实复跑（`TEXT_MESSAGE_CONTENT` / `RUN_FINISHED`）；没有浏览器截图。
- [x] AC6 (R6). 版本/协议/`shellAbi` 不匹配时 desktop 与 fnOS 在打开页面或开放 Socket 前失败，错误包含期望版本与实际值；匹配时 `/healthz` 返回版本字段且既有探活不回归。
- [x] AC7 (R7). Docker 构建、`pnpm desktop:build`、`pnpm fnos:build` 全部使用统一脚本；发布工作流每个原生平台用同一脚本构建一次，打包 job 不再出现 `server build` + `deploy-server` 两段；CI 的 runtime/desktop/fnOS 作业通过；不做 900MB 级跨作业 artifact 传递。GitHub CI 已手动触发并通过（run 39730387673）；Windows/安装器仍见 Deferred validation。
- [x] AC8 (R8). `pnpm check` 通过；桌面本地/云端 smoke、Docker 容器 smoke、fnOS 解包与 Socket 烟测通过；Postgres 与 SQLite 两条测试路径均通过。
- [x] AC9. 现行契约文档更新：架构 §3/§8/§14、桌面/服务端规范、README 与 fnOS 说明；新增决策记录说明为何采用 runtime 产物与 sidecar，以及被否决的方案。
- [x] AC10. 每轮实现按 Trellis 提交节奏提交，提交信息写明验证命令与观察结果；未实机验证的 fnOS 项明确标注，不声称通过。

## Out of scope

- 把服务端拆成多个独立 npm 包、私有 registry、独立版本号或独立发版。
- 用 Tauri 或原生重写替代 Electron；改变桌面两种模式的产品边界。
- 多用户、云同步、远程协作、fnOS ARM64 包。
- 修改检索、Office 编辑、AI 对话等业务行为。
- 为缩小包体积而裁剪 PDF/Office/OCR 能力。

## Constraints

- 现有 `preserveModules`、worker 入口（`chat-attachment-worker`、`attachment-parser`）与原生模块 external 契约不能被破坏。
- `better-sqlite3`、`sqlite-vec`、`@node-rs/jieba`、`@napi-rs/canvas` 必须按目标平台打包并可加载；Docker 与 fnOS 若共用 Linux 产物，必须统一 libc（Alpine/musl 不能与 fnOS glibc 共用）。Docker 改用 `node:22-bookworm-slim` 只是统一方向的起点，不代表 fnOS 的 glibc 下限已验证。
- `pnpm deploy` 必须在仓库内 staging 执行：`patchedDependencies` 会按目标目录相对定位补丁，仓库外目标（如 `/tmp`、Docker `/out`）会失败；staging 必须在成功/失败后清理并 gitignore。
- 页面↔宿主保持同源 HTTP（D-046），sidecar 只替换进程边界，不引入 Electron IPC 业务通道。
- 桌面本地模式仍强制回环、随机端口与令牌鉴权；sidecar 不得削弱 D-100 的安全模型。
- fnOS 仍使用 Unix Socket 与 `/app/mimir` 网关；不改 fnOS 生命周期脚本的外部契约。
- `@mimir/shared` 继续源码发布，不因本次改造引入构建步骤（D-023）。

## Deferred validation

- Windows NSIS 安装后的 sidecar 进程树回收与防火墙提示需在真实 Windows runner 验证。
- fnOS 实机安装、覆盖升级与 HTTPS 内嵌窗口需在 x86 fnOS 设备验证；Ubuntu 烟测不能替代。
- macOS 正式签名/公证后的 sidecar 与更新流程需在签名构建验证；ad-hoc 包只验证启动与本地模式。
- Docker 与 fnOS 共用 Linux 产物的 glibc 下限需在目标 fnOS 版本验证；若失败，回退为各自构建但保持同一脚本与布局。

## Research

- 复审记录：[`research/2026-10-21-runtime-review.md`](./research/2026-10-21-runtime-review.md)。包含 WeKnora v0.8.3 对照、`pnpm deploy` 补丁路径实测、相对 base 构建审计、Electron fork/native 模块实测。设计已按该记录修订。
- 开源对照：[`research/2026-10-21-open-source-comparison.md`](./research/2026-10-21-open-source-comparison.md)。对照 SiYuan v3.8.8、WeKnora v0.8.3、LobeHub Desktop；结论是保留 C 版主体，吸收启动窗/错误码、`shellAbi`、端口退避、产物显式清单四项改进。
