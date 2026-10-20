# GitHub 原生构建、发布与更新验收

2026-10-20，用户明确授权合并 master 并在 GitHub 验证整个更新流程。

## 已执行

- origin/master 与原 master 同为 0a41e65，工作区干净；无其他远端新增提交需要合并。
- `git switch master`、`git merge --ff-only codex/desktop-release-updater`、`git push origin master` 成功，master 到 e66c2c3。
- 仓库默认分支 master，公开可见。此前无 v* tag 或正式 Release。
- 原生手动构建：[39377657202](https://github.com/bijinfeng/mimir/actions/runs/39377657202)。
- 合并后 CI：[39377655808](https://github.com/bijinfeng/mimir/actions/runs/39377655808)。

## 验收顺序

1. 四目标原生构建、包资源验证、真实 smoke 和产物汇总；手动 workflow 不发布。
2. 发布首版稳定 v0.1.0，再发布后续补丁版 v0.1.1；不移动已公开版本或覆盖资产。
3. Windows NSIS 与 Linux AppImage 从官方公开资产安装旧版，真实界面驱动发现/下载、普通退出不安装、显式安装重启和资料/模式保留。
4. 无正式签名凭据的 macOS 验证检查及官方手动下载路径，不能声称自动安装。

结果在运行完成后补全；尚未取得的远端/真实系统结果均不视为通过。

## 首轮失败与修复

手动构建 39377657202：版本门通过，四个原生目标在 desktop build 同因缺少 ignored `editor.css` 失败；aggregate/publish 跳过，未创建公开 Release。修复在共用 renderer Vite buildStart 调用现有生成器；删除本机生成物后真实构建成功，独立 checker 的 3 项回归、typecheck/lint/format 通过。详见 github-build-fixes.md 和 github-initial-build.json。

第二轮手动构建：[39378398346](https://github.com/bijinfeng/mimir/actions/runs/39378398346)，commit 198486c。Linux 包与资源检查成功后，真实 AppImage smoke 因 builder 将文件名架构展开为 x86_64，而契约要求 x64，出现 ENOENT。修复在 package.mjs 一处固定原生架构名，锁定 builder 真实宏展开回归 12/12 通过。保留原始失败日志 github-linux-smoke-failed.log，不降低发布校验。

独立 review 另修复 NSIS 正常 Finish 后启动选项，并补新增真实升级 harness 的行为检查；细节见 github-build-fixes.md、github-flow-check.md、github-update-e2e.md。

第二轮 macOS ARM64 与 Intel x64 两项均完整通过；日志 github-second-mac-*.log、结果 github-second-build.json。Windows 因隔离依赖目录链接被 NSIS/7za 拒绝而失败；修复为打包专用 hoisted 部署并在 afterPack 有限物化文件别名、拒绝不可移植链接。真实资源迁移后 43,551 文件无链接，原生模块可加载；独立 17 项资源/发布回归通过。最终 Windows 安装器验收仍须新 runner。

仓库 CI 39378386495 的 Office 失败已补干净测试 CSS 生成及 Ubuntu 真实 CJK 字体准备，未修改 PDF 生产代码或放宽断言。证据 github-ci-check-failed.log、github-ci-fixes.md 与 ci-diagnostics/font-probe.md。最终全仓本地检查及新远端运行进行中。

## 最终本地门与首个 tag 构建

- `a98a0a5` 已推送 master；本地完整 `pnpm check` exit 0（Office 2774、renderer 636、desktop 110、根 Node 29 和 server 各套件）。日志 github-local-pnpm-check.log；不将本地通过代替远端升级。
- 首个 tag `v0.1.0` 指向 a98a0a5，触发 [39380282464](https://github.com/bijinfeng/mimir/actions/runs/39380282464)。Linux 构建、包资源检查、真实 AppImage smoke 和上传通过。
- Windows 已完成 NSIS 打包，在 verify-package.mjs 的包内 electron-updater 存在性检查失败。严格发布门阻止汇总/公开版本；日志 github-v010-windows-failed.log。正在核查跨平台 ASAR 路径，不绕过检查。
- 同提交 CI：[39380273533](https://github.com/bijinfeng/mimir/actions/runs/39380273533)，结果待完成。
- 已推送 tag 保留，不移动或覆盖。若修复须新提交，首个成功稳定基线顺延 v0.1.1，后续更新目标 v0.1.2。

Windows ASAR 修复已独立复核并提交 `239cf77`：按宿主分隔符读取真实根 updater manifest/main 及所有既有 entry，6/6 真实 archive 回归和本机真实包完整校验通过。新 Windows runner 校验仍待执行。

CI 39380273533 已完成并失败：之前的 Office CSS/中文字体问题未复现；server 三项分别是附件 PDF worker 192MB OOM、PPTX/XLSX 既有 5s 超时。日志 github-ci-a98a0a5-failed.log。已发现本机默认 Node 25 与 .nvmrc/CI Node 22 不同；在空闲本机用 Node 22.23.1 单独运行真实附件 PDF 用例亦复现 OOM，不能仅解释为 CI 资源争用。本地全仓通过证据需按其实际 Node 25 环境理解。保持限制及断言，正在因果诊断。

Node22 进一步诊断：相同 192/16MB worker 中，compiled JS 无 loader 能成功解析（heap约33.7MB），仅额外注册 tsx 即 OOM；两个超时文件在空闲 Node22 独跑 113/113 通过。生产 compiled 路径未受该 loader 问题影响。新稳定基线准备为 `v0.1.1`，后续目标 `v0.1.2`；原 v0.1.0 失败 tag 保留。
