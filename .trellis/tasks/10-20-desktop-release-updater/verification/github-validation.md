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

## v0.1.1 基线与 Node22 完整门

- `ae20981` 提交并推送，v0.1.1 tag保留原始提交；[39382724734](https://github.com/bijinfeng/mimir/actions/runs/39382724734) 正在执行四平台首个可发布基线。Linux完整成功，Windows已通过原生ASAR回归、包内文件/原生模块和解包应用smoke，正在实际NSIS安装版smoke；mac按run实际结果登记。
- Node22 loader/CI调度修复已提交推送 `7a5c720`，新CI [39383281565](https://github.com/bijinfeng/mimir/actions/runs/39383281565) 进行中；ae20981对应的旧CI被新push自动取消。
- 独立最终本地完整门：Node22.23.1 / pnpm12.4.2 / PNPM_CONFIG_WORKSPACE_CONCURRENCY=1，pnpm check exit0。Office2774、renderer636、server1366及各模式、desktop110、根Node43通过；日志 github-local-node22-pnpm-check.log。fnOS新增流水线仍在实施，不能将该次门当其完整远端验收。
- 用户新增 fnOS 同版发布已录入 PRD/design/implement；现有v0.1.1基线不移动，下一目标0.1.2开始统一包含四客户端与fnOS x64，正式fnOS设备安装仍按设备证据判断。

## v0.1.1 Windows 安装后失败

Windows strict ASAR/原生依赖检查与解包应用 A/B/C 全通过，但实际 NSIS 安装后的 A 本地模式失败，B 首启/C 云端仍通过：缺少 server/dist/node_modules/.pnpm 下 AWS SDK 的 check-content-length-header.js。日志 github-v011-windows-failed.log。NSIS 安装与卸载均返回，不能写成步骤卡死或安装版通过。

包内真实资源问题阻止聚合/发布；v0.1.1 tag保持原始提交，不移动。已安排检查锁定NSIS临时7z-out路径、Vite第三方external契约以及安装前后全量资源对照。后续先完成五目标手动构建，再以新稳定版作为首个成功基线/后续补丁验证更新；预计版本顺延0.1.2→0.1.3，以实际成功发布为准。没有已公开Release被覆盖。

## fnOS 首轮真实 GitHub 构建

`41579c9` 已推送 master；独立 [39385621049](https://github.com/bijinfeng/mimir/actions/runs/39385621049) 通过原生 Node22/x64、冻结依赖安装、已提交版本门、8项打包契约与官方固定 fnpack 摘要校验。真实 Web build 的 tsc 发现干净检出缺少 shared renderer 的 ignored routeTree.gen.ts；构建失败，验包/stage/upload未执行。日志 github-fnos-first-failed.log；修复生成顺序后重跑，不跳过 tsc。

上一 CI [39383281565](https://github.com/bijinfeng/mimir/actions/runs/39383281565) 中全仓 pnpm check 与 pnpm build 已通过；其后 PostgreSQL 模式重跑失败于 fnOS 测试继承 TEST_DATABASE_URL，违反生产 fnOS 仅 SQLite 契约。保留生产约束，修复 Vitest setup/worker 同源环境隔离；日志 github-ci-postgres-failed.log。

## 五目标手动集成构建

`b563569` 修复 server AWS external 契约并接入 Windows NSIS 资源全量比对，`8dc85b1` 修复 PG/fnOS 测试隔离，`5d8924f` 修复消费方生成前的共享 routeTree。已全部推送 master，运行 [39387632456](https://github.com/bijinfeng/mimir/actions/runs/39387632456) 进行四客户端加 fnOS 同版构建；手动流程不会公开版本。新 CI [39387631516](https://github.com/bijinfeng/mimir/actions/runs/39387631516) 同步运行。

上一 CI [39385619800](https://github.com/bijinfeng/mimir/actions/runs/39385619800) 的 Office 2774 中单个 ink 断言失败（高亮笔 stroke 缺失）；日志 github-ci-fnos-first-failed.log，定位与回归进行中。不能把更早全门通过覆盖当前失败。

独立最终范围复核记录 full-scope-check.md；新增根脚本53/53、PG独立隔离5/5、Node22四包类型及工作流检查通过；完整当前快照 CI 与实际安装/发布/升级仍以运行结果登记。

39387632456 的 fnos / build 和 Linux 客户端已完整success；fnOS官方真实FPK构建、解包/原生模块/Socket认证和stage上传均过。Windows/mac仍在执行，aggregate/publication未宣称通过；fnOS设备安装/升级仍未实测。

五目标手动流水线39387632456最终 **completed/success**：version、fnOS、四桌面native build/verify/smoke/stage/upload及aggregate完整成功，publish按manual契约skipped。证据 github-five-target-manual.json、github-fnos-native-success.log、github-windows-installed-success.log；此轮版本0.1.1/源码5d8924f只用于手动产物，不重新解释旧失败tag或公开Release。

`d5245c6` 提交已证明的DOCX metadata手势取消修复与独立31项回归；`1c7e823` 将desktop与fnOS一起准备0.1.2，已推master。新CI39389655084、本机Node22完整pnpmcheck正在执行；尚未创建v0.1.2 tag。

当前1c7e823代码快照本机Node22最新完整pnpmcheck **exit0**：Office2777、renderer636、server1366及local10/fnOS5/backup2、desktop110、root53全部通过；lint/styles/format/allworkspace types全过。日志final-latest-node22-pnpm-check.log，独立full-scope-check最后checkpoint。v0.1.2 annotated tag已创建并推送，固定1c7e823；开始首个统一稳定基线构建，不移动旧失败tag。

Windows真实安装证据：28949个server文件路径/大小/SHA256安装前后完全匹配，最长相对路径154；捕获NSIS实际temp/7z-out路径。安装3分43秒左右，随后安装版A/B/C smoke全部通过。先前深路径overflow仅是历史假说，当前不把它写成已直接证明的根因。

## v0.1.2 重试与 CI S3 环境故障

v0.1.2正式tag流水线 [39390863778](https://github.com/bijinfeng/mimir/actions/runs/39390863778) attempt1：Windows完整资源/安装smoke、Linux/macARM和fnOS均成功；macIntel DMG阶段因 `hdiutil: couldn't eject disk2 - Resource busy` 失败，aggregate/publish skipped，未公开Release。相同源码上一manual全过；保留tag指向1c7e823，仅rerun failed jobs，在新runner原样复验。日志github-v012-mac-intel-failed.log与attempt1 JSON保留。

CI39389655084的全pnpmcheck、pnpm build、完整PostgreSQL模式重跑均success，最终S3专项在Docker拉取固定minio/minio镜像时被registry denied，测试尚未启动，不能写成SDK断言失败或S3通过。日志github-ci-s3-failed.log；正在校验可匿名拉取的官方固定MinIO来源，不跳过2项真实兼容测试。

后续版本0.1.3仅在本地准备f4308af（与fnOS同步、18项发布契约通过），未推tag；必须等待0.1.2真正公开后才公开后续版本，避免latest顺序竞态。

MinIO fixture修复与独立来源/运行审查已提交推送 `71778c7`，保留原生产S3代码和两项断言；固定官方历史LinuxAMD64二进制+SHA，真实仿真2/2通过，Colima已恢复。新原生完整CI [39394323716](https://github.com/bijinfeng/mimir/actions/runs/39394323716) 进行中；此时不提前宣称Ubuntu生命周期通过。desktop/fnOS统一0.1.3已推master，尚未创建tag。

## v0.1.2 发布 API 限制

Attempt2 中 Intel DMG、包资源/原生smoke、其余目标及 aggregate 全部 success，但 publish 在创建草稿的 POST /releases 返回403。job明确 Contents:write，尚无草稿或公开Release。官方 REST 文档新增规则：显式 target_commitish 相对默认分支包含 workflow 差异时要求workflows写权限；GITHUB_TOKEN无法获得。master在等待构建时已有ci.yml变更，旧SHA参数触发该限制。用户owner现有OAuth也无workflow scope；一次相同payload空draft创建尝试返回404，未创建任何Release。

修复方向是远端解析已存在tag到精确commit并保持marker所有权，省略existing tag无需的target_commitish；不扩大凭据权限、不移动tag或修改默认分支、不本地代发以掩盖失败。v0.1.2保留失败tag和完整成功构建证据；修复后首个统一稳定基线顺延0.1.3，真实升级目标0.1.4。以最终成功版本为准。失败job日志github-v012-publish-create-failed.log、attempt2 JSON保留。
