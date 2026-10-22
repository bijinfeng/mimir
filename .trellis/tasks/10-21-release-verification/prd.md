# CI、发布与全量验收

## Goal

让 CI 与发布链路真正使用统一 runtime 产物：桌面 matrix 不再各自构建/拼装服务端，fnOS 使用同一脚本；补齐版本握手、跨宿主烟测、文档与决策记录，并给出可复核的验收证据。

## Requirements

- R1. `.github/workflows/desktop-release.yml` 每个原生 matrix job 直接用 `build-runtime.mjs` 构建本平台产物，再 desktop build/package；删除 job 内的 `server build` + `deploy-server`。不做 900MB 级 runtime artifact 上传/下载。
- R2. `.github/workflows/fnos-build.yml` 使用 `build-runtime.mjs --web apps/web/dist`，校验 manifest 版本；保留 fnpack 校验、ELF 检查与 Socket 烟测。
- R3. `.github/workflows/ci.yml` 覆盖新增的 runtime 配置/产物/sidecar 单测；`pnpm check` 包含新测试。
- R4. 版本握手：`/healthz` 返回 `version`/`protocolVersion`；manifest 另含 `shellAbi`；desktop 与 fnOS 启动前校验 manifest/版本，sidecar 再校验 `shellAbi`；不匹配快速失败并给出期望/实际值。
- R5. 文档更新：`architecture.md` §3/§8/§14、`README.md`、`apps/fnos/README.md`、server/desktop 规范；新增 D-114 决策记录，说明 runtime 产物、sidecar、单 UI 构建与被否决方案。
- R6. 全量验收矩阵：`pnpm check`、`pnpm build`、`pnpm desktop:build`、Docker build/run、fnOS build/verify（Linux x64）、桌面 smoke；未实机项明确标注。

## Acceptance Criteria

- [x] AC1. 桌面发布工作流中，打包 job 不再出现 `pnpm --filter @mimir/server build` 或 `deploy-server.mjs`；每个 matrix job 用同一脚本构建本平台 runtime；没有 runtime 大 artifact 上传/下载。
- [x] AC2. fnOS 工作流只构建一次 web、一次 runtime；`verify-fnos.mjs` 校验 manifest 版本；FPK 内 manifest 与 `apps/desktop/package.json`、`apps/fnos/manifest` 的一致性由 `build-fnos`/`verify-fnos` 保证。真实 Linux x64 FPK 需 CI（本机未执行）。
- [x] AC3. CI 增加 runtime 结构/manifest 断言；配置、产物、sidecar、静态前缀各有独立测试与错误信息，失败可定位到具体层。
- [x] AC4. 版本/ABI 不匹配测试：desktop manifest 期望/实际、sidecar ready shellAbi、fnOS version.json 不一致均在开窗/listen 前失败；`/healthz` 带 version/protocol，旧 `ok` 探活保持。
- [x] AC5. 文档与代码同批提交；D-114 说明逻辑拆分/不物理拆包、fork sidecar、Docker glibc；architecture/README/fnOS/spec 已更新。
- [x] AC6. `verification.md` 含命令、环境、结果；Docker daemon、fnOS 实机、完整安装器、签名/公证与真实升级明确列为未执行。

## Dependencies

- 依赖子任务 1–4 全部完成；本任务是集成与发布层，不重新设计核心契约。
- 设计见父任务 `design.md` §5、§6、§8、§9。

## Out of scope

- 新增产品功能、检索/Office/AI 行为改动。
- 独立发版、私有 registry、ARM fnOS。
- 签名证书/公证账号的申请。

## Notes

- CI 的 artifact 传递要验证目录链接已物化；Windows runner 上尤其要看 junction。
- 发布工作流的手动触发只产生 artifacts，不发布 Release；保持现有约束。
