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

CI [39394323716](https://github.com/bijinfeng/mimir/actions/runs/39394323716) 已completed/success：全仓pnpmcheck、pnpm build、完整PostgreSQL重跑及新官方固定MinIO原生S3专项全部成功。S3真实2/2与精确version/SHA及退出清理日志github-ci-native-s3-success.log；全步骤JSON单独保存。publisher修复另经独立Node22发布23/23、根58/58与lint/format/syntax复核通过，即将用0.1.3新tag验证真实发布。

## 首个正式统一版本 v0.1.3

[c402ec5 / 39397577723](https://github.com/bijinfeng/mimir/actions/runs/39397577723) completed/success，五目标及aggregate、发布create/upload/digest/publish全成功。正式[Release v0.1.3](https://github.com/bijinfeng/mimir/releases/tag/v0.1.3)共15资产，包含7安装包/FPK、3更新元数据和5blockmap，未人工创建草稿、未扩大token权限。匿名公开HTML返回200并包含正确标题。当前共享出口匿名REST quota暂耗尽（reset 2026-10-20T09:49:54Z），不是私有或发布失败；待重置补匿名REST与FPK字节下载记录。

最新代码127d4b7的[CI39397745471](https://github.com/bijinfeng/mimir/actions/runs/39397745471) 全completed/success，完整Node22检查、build、PG与S3通过；完整原始日志final-github-node22-ci.log、步骤JSON保存。c402ec5的CI被立即准备version-only0.1.4的新push替代，非测试失败。v0.1.4 annotated tag已推，固定127d4b7；基线已公开后才推后续tag，避免latest顺序竞态。


## v0.1.4 上传服务超时与同源重试

[39402594994](https://github.com/bijinfeng/mimir/actions/runs/39402594994) attempt1：五目标实际构建、资源校验及smoke均完成通过；macIntel最后上传desktop-mac-x64时CreateArtifact请求连续5次timeout，job failure，aggregate/publish skipped。未创建或公开v0.1.4 Release。保留github-v014-attempt1.json及github-v014-upload-timeout.log，原样rerun failed jobs，不移动tag、不跳过目标。


## 第二个正式统一版本 v0.1.4 与真实升级开始

39402594994 attempt2整体success：原生五目标、聚合和发布全通过，15资产正式公开，latest=v0.1.4；github-v014-published.json、github-v014-publish-success.log保存实际结果。FPK再次匿名下载且完整字节/公开digest匹配。

触发[39408870875](https://github.com/bijinfeng/mimir/actions/runs/39408870875)执行0.1.3→0.1.4实际Windows/Linux升级。Linux已完成真实官方下载及无详情自动弹出验证，在点击“稍后”关闭详情时CDP回包竞态导致外部harness失败；保留attempt1现场，修复仅测试同步并重跑，不能计为完整升级通过。Windows仍执行，macOS官方ZIP手动替换验收并行进行。

## 原生关闭缺陷与修复基线

0.1.3→0.1.4复验39409876470两平台均未通过。真实下载、普通退出不安装、保存保护与保存HTTP200已推进；窗口关闭后访问已销毁webContents getter使准备未完成。Electron44.7.0同源探针修前exit2、修后exit0，强fixture先红后绿；未改保存/veto/宿主顺序。原始失败截图/HTML/结果保存在update-attempt2，不能计为成功。

75dd8c8提交产品修复与可读纯文本更新说明；b2bb972提交实网ZIP精确续传与NSIS诊断；324aa7d将desktop/fnOS同步准备0.1.5并推送master。新完整CI39413324883进行中。修复必须先手动安装为新基线，再用随后0.1.6验证真实自动更新，不能只修目标包。旧tag/资产保持原样，已给0.1.3/0.1.4公开说明添加已知问题提示。

修复基线324aa7d的完整[CI39413324883](https://github.com/bijinfeng/mimir/actions/runs/39413324883) completed/success：完整pnpmcheck（desktop118、server1366等）、build、PG1366及local/fnOS模式、真实S3两项均通过。github-fixed-baseline-ci.json与去ANSI/行尾空白日志保存实际门；未扩大测试预算或删断言。

mac ARM64官方3→4手动替换已完整成功，证据mac-official-manual/README.md与result.json。v0.1.5固定324aa7d已推tag，五目标发布run39413757346进行中；b58c149已推master准备version-only0.1.6，新CI39415625320触发，尚未推v0.1.6 tag。

## 0.1.5 修复基线正式公开

[39413757346](https://github.com/bijinfeng/mimir/actions/runs/39413757346) completed/success：五原生目标、aggregate、publisher全部通过；[v0.1.5](https://github.com/bijinfeng/mimir/releases/tag/v0.1.5)共15资产公开，marker指向324aa7d。匿名API首次因共享出口60次quota耗尽返回403，11:50:29UTC重置后同一官方URL匿名200并保存完整metadata，非私有仓库/缺资产。旧13/14说明已明确手动安装5或更新版，实际验证两版全部asset ID/name/size/digest及latest未变，old-release-fixed-baseline-advisory.json记录。

version-only b58c149的CI39415625320在与此前98aaf7d相同的XLSX20k测试5000ms上限失败，其余1365项server通过。原始失败归档github-v016-ci-attempt1-failed.log；5基线完整同源测试成功不能抹去这次失败。正在检查该测试未压缩ZIP的无关字节相等比较开销；保持20k输入/真实操作/原字节断言和预算，不rerun-until-green。尚未推v0.1.6 tag。

7a3c34d只修改既有20k测试的ZIP容器压缩，所有15个解压entry/20k cells/真实操作/字节与version断言/5000ms完全保留；Node22完整107项、server类型和静态门通过，独立重建验证等价。详见20k-fixture-ci-diagnosis.md、xlsx-fixture-independent-review.md。已推master；固定7a3c34d的v0.1.6 tag触发五目标[39418582165](https://github.com/bijinfeng/mimir/actions/runs/39418582165)，完整新CI[39418539314](https://github.com/bijinfeng/mimir/actions/runs/39418539314)同时执行。desktop/fnOS版本为0.1.6，生产代码与v0.1.5相同，旧失败tag/资产不变。

## 0.1.6 正式公开与新基线实际升级

39418582165 已 completed/success：五目标构建/原生资源/真实 smoke、聚合与 publisher 全通过；[v0.1.6](https://github.com/bijinfeng/mimir/releases/tag/v0.1.6) 于12:23:18Z正式公开15资产。固定7a3c34d的完整CI39418539314也全部success，含pnpmcheck/build/PG/S3。证据github-v016-published.json、github-v016-fnos-native.log、github-v016-publish-success.log、github-v016-fixed-ci.json/.log；CI日志只去ANSI和行尾空白。

最终FPK已匿名完整下载170553985字节，SHA256=1903d6391e684cf4177fa8cef60e74e1a572cb18ad8912046155c9fbef9ac30f，与匿名官方digest一致；完整下载耗时158.93秒，无Authorization/Range，证据fnos-v016-public/。该结果不代替fnOS设备安装升级。

57b6b4e已推master，使用只读绘制等待的新外部脚本运行[39421962037](https://github.com/bijinfeng/mimir/actions/runs/39421962037)官方5→6。两平台均通过正式下载、普通退出不安装、真实保存guard/取消，随后真实PATCH200，但在重拍被工作区覆盖的更新详情时Runtime.evaluate超时。Linux从guard cancel到异常约5.69秒，与截图paint外部5秒上限吻合；未捕获旧visibility，不能据此断言精确occlusion原因。两平台均未进入后续真实安装，不计为升级成功。原始结果/截图/HTML/log保存在update-015-to-016-attempt1与github-015-to-016-attempt1-failed.json/.log。实际目视两平台save-guard.png完整可见，修复了旧只见遮罩的采集窗口。

## 第二轮5→6：截图通过，安装阶段问题分开诊断

独立审查通过后，4ed2f77先通过临时验证引用执行[39423359375](https://github.com/bijinfeng/mimir/actions/runs/39423359375)，避免取消master的完整CI；随后master CI39421648291全部success，修复及证据已推master8709f76。临时引用运行不冒充master触发，其精确headSha和最终master历史均可核对。

两端新截图均通过显式前台、有限动画等待、PNG/HTML采集，阶段记录可查。实际目视Linux retry-after-save显示真实取消状态，save-and-restart-awaiting-http清楚显示保存中；截图不代表自动焦点行为。第二次真实编辑/保存PATCH200也完成。

- Linux：工作区关闭成功后closeHost失败，被recoveryRequired安全门阻止安装；未出现安装调用，等待精确官方AppImage替换超时。原异常被旧catch丢弃，不能从这一日志指定确切原因，目前单独真实probe诊断。
- Windows：host关闭成功，日志明确Install on explicit quitAndInstall，旧进程exit0，无signal；真实NSIS已打开Choose Installation Options。目视nsis-native-001.png确认Next按钮存在，但UIA枚举buttons=[]、actions=0，外部向导driver8分钟超时。不能据此认定产品未启动安装器，也不能计为更新成功。

两项失败分别保存在update-015-to-016-attempt2与github-015-to-016-attempt2-failed.json/.log，后续分别解决，不改写旧结果。

## Session 与生产数据库关闭修复及新基线

9fff1a1 在保存及真实窗口关闭后清理捕获的 Chromium Session，drain→HTTP→DB 共用原15秒时间门；超时和迟到均不放行安装。Electron44.7预连接探针修前exit3、修后exit0。d70bb54 关闭实际production/development数据库引用，SQLite真实先红后绿2项、PG真实backend消失2项通过，独立审查通过。最终刷新server build/deploy后的真实Electron宿主证明HTTP callback完成、SQLite open true→false、原句柄查询拒绝，见host-close-final-native.json/.log。Desktop全122项/类型/静态门通过，server类型/静态门通过，主会话desktop build通过。原始采集日志保留末尾空行与ANSI，不做源码格式化；源码/spec的diff check通过。oxfmt忽略.trellis，因此不将其无匹配退出计为文档格式门通过。

准备desktop/fnOS同版0.1.7，作为需手动安装的新发起端基线；待五目标正式发布后，再公开0.1.8并验证官方7→8。5→6 Windows独立run39426680220仍执行，未改变其latest；旧公开tag/资产不变。新产品修复的完整CI/五目标发布和跨版本升级尚待实际执行，不能用上述探针替代。

## Windows 外部驱动第三轮与最终目标准备

官方5→6 Windows [39426680220](https://github.com/bijinfeng/mimir/actions/runs/39426680220) 仍为failure。真实NSIS完成Next/Finish、wizardExitCode0，旧进程exit0且新PID自动拉起，目标exe替换；随后正常关闭并显式重开时固定CDP19223报0x2740，完整资料断言未执行。原artifact保留update-015-to-016-windows-attempt3。cc2911b只改外部端口分配/记录，26项与独立静态/行为复核通过，不改公开产品与失败证据。

0.1.7已固定3f35e8a推master/tag，[发布39428273594](https://github.com/bijinfeng/mimir/actions/runs/39428273594)、[完整CI39428258688](https://github.com/bijinfeng/mimir/actions/runs/39428258688)执行中。另prepare desktop/fnOS同版0.1.8（31项发布/fnOS契约通过），正式公开须晚于7，不改变旧tag和资产。README基线与后续示例同步为7→8，实际最终结果待归档。

## v0.1.7 正式公开

固定3f35e8a的完整CI39428258688已success（check/build/PG/S3全部通过）。五目标发布39428273594全success，v0.1.7于13:43:15Z正式公开15资产；所有四客户端与fnOS同版。github-v017-{ci,release,published}.json及fnos/publish/ci日志保留。旧v3/v4/v5/v6说明已追加手动7或更新版指引，release-advisories-v017保留before/after，逐项确认资产ID/name/size/digest不变；不移动任何tag。

v0.1.8固定e3a950fdd5a42bf02e83ab1fb40a6832c35f38c9已推master及tag（晚于7公开），完整CI39431446416与五目标发布39433040010执行中。7 FPK匿名全量下载进行中。最终7→8尚待实际执行，不沿用此前失败轮次。

## v0.1.8 正式公开与7→8首轮

固定e3a950f的完整CI39431446416已success，check/build/PG/S3均通过。五目标发布39433040010全success；v0.1.8于14:15:45Z正式公开15资产，四客户端与fnOS同版，未覆盖旧资产。github-v018-{ci,release,published}.json与fnos/publish/ci日志保存。v0.1.7 FPK最终匿名完整下载170581061字节，SHA256=47e1e0cff50d204e2dc61d153718e927ce45c616a1a75d06fe39cc575c8899b1，与公开digest一致；v0.1.8最终匿名全量仍在采集。

官方7→8 run39437731315已completed/failure：Windows job118679111438 success；Linux job118679111674 failure。Linux实际完成真实下载、普通exit0不安装、真实PATCH挂起保护/取消和再次保存200、目标AppImage完整SHA替换、旧组退出与更新器自动新PID，随后外部normalClose没有等待新工作区窗口就绪，也没有保留首次枚举/请求证据；90秒后仍有真实mimir进程，尚未显式重开核对完整资料。最终枚举证明3733工作区存在，不能倒推首次已映射或唯一归因为窗口就绪，也不能排除veto。保留false原始结果；不以wrapper3719解释pgrep -x mimir存活。正在修正外部只读窗口等待、精确新PID一次关闭与分阶段证据，随后原官方7→8复验，不另发产品版本。

Windows首轮原始artifact已完整下载至update-017-to-018-attempt1/windows并冻结，result.success=true。三个显式launch CDP50595/56570/53851互异；自动PID712/4044/6188在14:25:39.306Z确认，早于upgraded显式PID4256的14:25:41.823Z。真实NSIS wizardExitCode0，最终IPC currentVersion0.1.8、完整两次编辑正文/title/tags/folder/local均过，三个显式进程exit0/null。主会话实际目视save-guard.png、nsis-native-010.png完成页、upgraded-document.png完整正文。对应run精确head及两job结果github-017-to-018-attempt1.json；不将Windows成功改写为Linux或全平台成功。
