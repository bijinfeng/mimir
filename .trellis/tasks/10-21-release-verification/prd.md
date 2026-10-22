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

- [ ] AC1. 桌面发布工作流中，打包 job 不再出现 `pnpm --filter @mimir/server build` 或 `deploy-server.mjs`；每个 matrix job 用同一脚本构建本平台 runtime；没有 runtime 大 artifact 上传/下载。
- [ ] AC2. fnOS 工作流只构建一次 web、一次 runtime；`verify-fnos.mjs` 通过；FPK 内 manifest 版本与 `apps/desktop/package.json`、`apps/fnos/manifest` 一致。
- [ ] AC3. CI 失败时能定位到配置/产物/sidecar/静态前缀中的具体一层，不是笼统的“build failed”。
- [ ] AC4. 版本/ABI 不匹配测试：desktop 显示期望/实际版本且不开窗；`shellAbi` 不匹配在开窗前失败；fnOS 不开放 Socket；匹配时 `/healthz` 字段存在且旧探活不回归。
- [ ] AC5. 文档与代码同批提交；决策记录说明为什么不是物理拆包、为什么用 fork、为什么 Docker 换 glibc。
- [ ] AC6. 验收记录包含命令、环境、结果；fnOS 实机、Windows 安装器、macOS 公证等未验证项明确列出，不声称通过。

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
